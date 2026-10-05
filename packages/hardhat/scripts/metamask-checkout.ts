import { launch, MetaMaskWallet } from "@tenkeylabs/dappwright";
import { expect, type BrowserContext } from "@playwright/test";
import { Contract, JsonRpcProvider, Wallet } from "ethers";
import { readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { strict as assert } from "node:assert";

// MetaMask can open a notification before dappwright starts waiting for a page
// event. Inspect existing notification pages too, without inspecting secrets.
async function confirmPopup(
  wallet: Pick<MetaMaskWallet, "page">,
  testId: string,
) {
  let popup: import("@playwright/test").Page | undefined;
  await expect
    .poll(
      async () => {
        for (const candidate of wallet.page.context().pages()) {
          if (!candidate.url().startsWith("chrome-extension://")) continue;
          if (await candidate.getByTestId(testId).isVisible()) {
            popup = candidate;
            return true;
          }
        }
        return false;
      },
      { timeout: 60000 },
    )
    .toBe(true);
  assert(popup);
  await popup.getByTestId(testId).click();
  if (popup !== wallet.page && !popup.isClosed())
    await popup.waitForEvent("close");
}

async function main() {
  const cli = JSON.parse(
    readFileSync(
      process.env.TESTNET_REPORT || "/tmp/hbar-invoices-testnet-cli.json",
      "utf8",
    ),
  );
  assert.equal(cli.status, "passed", "Real CLI settlement must pass first");
  const rpc = process.env.HEDERA_RPC_URL || "https://testnet.hashio.io/api";
  const provider = new JsonRpcProvider(rpc);
  assert.equal((await provider.getNetwork()).chainId, 296n);
  const artifact = JSON.parse(
    readFileSync(
      join(process.cwd(), "../nextjs/lib/invoice-artifact.json"),
      "utf8",
    ),
  );
  const contract = new Contract(cli.contract, artifact.abi, provider);
  assert(
    process.env.TESTNET_SOURCE_COMMIT,
    "Set TESTNET_SOURCE_COMMIT to the exact clean generated candidate revision",
  );
  const url = process.env.TESTNET_APP_URL || "http://localhost:3000";
  const output =
    process.env.METAMASK_REPORT || "/tmp/hbar-invoices-metamask.json";
  let previous: Record<string, unknown> | undefined;
  const resumeHash = process.env.TESTNET_RESUME_CREATION_HASH;
  if (existsSync(output)) {
    previous = JSON.parse(readFileSync(output, "utf8"));
    assert(
      (!previous!.invoicePath && !previous!.signingIntent) ||
        (resumeHash &&
          (previous!.signingIntent === "merchant transaction requested" ||
            (previous!.resumedCreation as { hash?: string } | undefined)
              ?.hash === resumeHash) &&
          !previous!.paymentUrl &&
          !previous!.approvedAmountTinybars &&
          previous!.contract === cli.contract &&
          previous!.sourceCommit === process.env.TESTNET_SOURCE_COMMIT),
      "Original browser attempt requires reconciliation; do not rerun signing.",
    );
  }
  const contexts: BrowserContext[] = [];
  const profiles: string[] = [];
  const report: Record<string, unknown> = {
    status: "incomplete",
    date: new Date().toISOString(),
    sourceCommit: process.env.TESTNET_SOURCE_COMMIT,
    cliSourceCommit: cli.sourceCommit,
    kind: "real-metamask-testnet",
    contract: cli.contract,
    chainId: 296,
    dappwright: "2.13.12",
    metamask: "13.17.0",
    cliEvidence:
      process.env.TESTNET_REPORT || "/tmp/hbar-invoices-testnet-cli.json",
  };
  const save = () =>
    writeFileSync(
      output,
      JSON.stringify(
        report,
        (_, value) => (typeof value === "bigint" ? value.toString() : value),
        2,
      ) + "\n",
    );
  // Mirror locates public hashes; the relay receipt remains authoritative.
  const eventReceipt = async (name: string, id: bigint) => {
    let found: Awaited<ReturnType<typeof provider.getTransactionReceipt>>;
    await expect
      .poll(
        async () => {
          const response = await fetch(
            `https://testnet.mirrornode.hedera.com/api/v1/contracts/${cli.contract}/results?order=desc&limit=25`,
          );
          assert(response.ok);
          const data = (await response.json()) as {
            results: { hash: string }[];
          };
          for (const result of data.results) {
            const receipt = await provider.getTransactionReceipt(result.hash);
            if (!receipt || receipt.status !== 1) continue;
            const matching = receipt.logs.some((log) => {
              if (log.address.toLowerCase() !== cli.contract.toLowerCase())
                return false;
              try {
                const event = contract.interface.parseLog(log);
                return event?.name === name && event.args.invoiceId === id;
              } catch {
                return false;
              }
            });
            if (matching) {
              found = receipt;
              return true;
            }
          }
          return false;
        },
        { timeout: 60000 },
      )
      .toBe(true);
    assert(found!);
    return found!;
  };
  let resumedPath: string | undefined;
  if (resumeHash) {
    assert(previous, "Resume requires the saved original report");
    const receipt = await provider.getTransactionReceipt(resumeHash);
    const transaction = await provider.getTransaction(resumeHash);
    assert(receipt?.status === 1 && transaction);
    assert.equal(transaction.from, cli.merchant);
    assert.equal(transaction.to?.toLowerCase(), cli.contract.toLowerCase());
    const decoded = contract.interface.parseTransaction({
      data: transaction.data,
    });
    assert.equal(decoded?.name, "createInvoice");
    const event = receipt.logs
      .filter((log) => log.address.toLowerCase() === cli.contract.toLowerCase())
      .map((log) => {
        try {
          return contract.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((event) => event?.name === "InvoiceCreated");
    assert(event && event.args.usdCents === 125n);
    const invoice = await contract.getInvoice(event.args.invoiceId);
    assert.equal(invoice[2], 0n);
    assert(invoice[1] > BigInt(Math.floor(Date.now() / 1000)));
    resumedPath = `/invoice/296/${cli.contract}/${event.args.invoiceId}`;
    const savedPath = previous.invoicePath || previous.lastCreatedInvoicePath;
    if (savedPath)
      assert.equal(
        resumedPath,
        savedPath,
        "Resume must retain the original invoice",
      );
    const savedCreation = previous.resumedCreation as
      | { hash?: string }
      | undefined;
    if (savedCreation?.hash) assert.equal(resumeHash, savedCreation.hash);
    report.creationReconciliation =
      savedPath || savedCreation?.hash
        ? "Matched saved original invoice/hash and authoritative creation receipt"
        : "Explicitly supplied public creation hash, manually identified from merchant nonce and contract history; receipt verified independently";
    report.resumedCreation = {
      hash: resumeHash,
      block: receipt.blockNumber,
      invoicePath: resumedPath,
    };
    report.previousAttempt = previous;
    report.invoicePath = resumedPath;
    report.signingIntent = "merchant transaction requested";
  }
  save();
  try {
    const wallets = [];
    report.stage = "wallet bootstrap";
    save();
    for (const [name, address] of [
      ["HEDERA_FIRST_PRIVATE_KEY", cli.merchant],
      ["HEDERA_SECOND_PRIVATE_KEY", cli.payer],
    ]) {
      const key = process.env[name];
      assert(key);
      assert.equal(
        new Wallet(key.startsWith("0x") ? key : `0x${key}`).address,
        address,
      );
      process.env.TEST_WORKER_INDEX = `hbar-${randomUUID()}`;
      profiles.push(
        join(
          tmpdir(),
          "dappwright/session/metamask",
          process.env.TEST_WORKER_INDEX,
        ),
      );
      const { wallet, browserContext: context } = await launch("", {
        wallet: "metamask",
        version: "13.17.0",
        headless: false,
      });
      contexts.push(context);
      report.chromium = context.browser()?.version();
      const seed =
        "already turtle birth enroll since owner keep patch skirt drift any dinner";
      await wallet.setup({ seed, password: randomUUID() + "Aa1!" }, [
        async (walletPage) => {
          await walletPage.getByTestId("onboarding-import-wallet").click();
          await walletPage
            .getByTestId("onboarding-import-with-srp-button")
            .click();
          // Enter commits the final word without adding a thirteenth blank chip.
          await walletPage
            .getByTestId("srp-input-import__srp-note")
            .pressSequentially(seed, { delay: 30 });
          await walletPage.keyboard.press("Enter");
          await walletPage.getByTestId("import-srp-confirm").click();
        },
        ...wallet.defaultSetupSteps.slice(1),
      ]);
      report.stage = "import authorized account";
      save();
      await wallet.importPK(key.replace(/^0x/, ""));
      await wallet.switchAccount("Imported Account 1");
      report.stage = "add Hedera network";
      save();
      await wallet.addNetwork({
        networkName: "Hedera Testnet",
        rpc,
        chainId: 296,
        symbol: "HBAR",
      });
      // dappwright addNetwork already switches to the newly added network.
      const page = await context.newPage();
      wallets.push({ wallet, page });
    }
    assert.equal(MetaMaskWallet.recommendedVersion, "13.17.0");
    const [{ wallet: merchant, page }, { wallet: payer, page: payerPage }] =
      wallets;
    let merchantConnected = false;
    const creationEvidence: {
      invoicePath: string;
      hash: string;
      block: number;
    }[] = [];
    report.creations = creationEvidence;
    const create = async () => {
      await page.goto(`${url}/merchant`);
      await page.bringToFront();
      await page.getByLabel("USD amount").fill("1.25");
      const date = new Date(Date.now() + 3600000);
      const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
      await page.getByLabel("Expiry (your local time)").fill(local);
      await page.getByRole("button", { name: "Create with MetaMask" }).click();
      if (!merchantConnected) {
        await confirmPopup(merchant, "confirm-btn");
        merchantConnected = true;
      }
      assert.equal(
        (
          await page.evaluate(async () => {
            const ethereum = (
              window as unknown as {
                ethereum: {
                  request(input: { method: string }): Promise<string[]>;
                };
              }
            ).ethereum;
            return ethereum.request({ method: "eth_accounts" });
          })
        )[0]?.toLowerCase(),
        cli.merchant.toLowerCase(),
      );
      report.signingIntent = "merchant transaction requested";
      save();
      await confirmPopup(merchant, "confirm-footer-button");
      await expect(page.getByRole("status")).toContainText(
        "Invoice creation confirmed.",
        {
          timeout: 120000,
        },
      );
      const link = page.locator('a[href^="/invoice/296/"]');
      const path = await link.getAttribute("href");
      assert(path);
      report.lastCreatedInvoicePath = path;
      save();
      const receipt = await eventReceipt(
        "InvoiceCreated",
        BigInt(path.split("/").at(-1)!),
      );
      creationEvidence.push({
        invoicePath: path,
        hash: receipt.hash,
        block: receipt.blockNumber,
      });
      save();
      return path;
    };
    report.stage = "merchant creation";
    save();
    const path = resumedPath || (await create());
    report.invoicePath = path;
    save();
    const id = BigInt(path.split("/").at(-1)!);
    await payerPage.goto(url + path);
    await payerPage.bringToFront();
    await expect(
      payerPage.getByRole("heading", { name: "Open", exact: true }),
    ).toBeVisible();
    report.stage = "payer connection";
    save();
    const connect = payerPage.evaluate(async () => {
      const ethereum = (
        window as unknown as {
          ethereum: { request(input: { method: string }): Promise<string[]> };
        }
      ).ethereum;
      return ethereum.request({ method: "eth_requestAccounts" });
    });
    await confirmPopup(payer, "confirm-btn");
    assert.equal((await connect)[0]?.toLowerCase(), cli.payer.toLowerCase());
    // Account authorization emits accountsChanged; the app correctly requires
    // a fresh invoice review before estimating against the connected payer.
    await payerPage.reload();
    await expect(
      payerPage.getByRole("heading", { name: "Open", exact: true }),
    ).toBeVisible();
    report.stage = "payer fee estimation";
    save();
    await payerPage
      .getByRole("button", { name: "Estimate payment network fee" })
      .click();
    await expect(
      payerPage.getByRole("button", {
        name: "Approve exact quote and pay with MetaMask",
      }),
    ).toBeEnabled({ timeout: 60000 });
    report.stage = "payer quote review";
    save();
    const review = await payerPage.locator("main").innerText();
    assert(
      review.includes(cli.contract) &&
        review.includes(cli.merchant) &&
        review.includes(cli.payer),
    );
    assert(
      review.includes("Estimated network fee") &&
        review.includes("Approved oracle round"),
    );
    const field = async (label: string) =>
      (
        await payerPage
          .getByText(label, { exact: true })
          .locator("xpath=following-sibling::dd[1]")
          .innerText()
      ).trim();
    const approvedAmount = BigInt(await field("Exact tinybars"));
    assert.equal(await field("Invoice ID"), id.toString());
    assert.equal(await field("Network"), "Hedera testnet · chain ID 296");
    assert.equal(await field("Recipient"), cli.merchant);
    const approvedRound = BigInt(await field("Approved oracle round"));
    assert.equal(await field("Oracle round"), approvedRound.toString());
    assert.equal(await field("USD amount"), "$1.25 USD");
    assert.equal(
      await field("Exact approved payment"),
      await field("Exact invoice payment"),
    );
    assert.equal(
      await field("Approval deadline (UTC, exclusive)"),
      await field("Quote deadline (UTC, exclusive)"),
    );
    assert(
      Number.isFinite(Date.parse(await field("Reference price updated (UTC)"))),
    );
    assert(
      Date.parse(await field("Approval deadline (UTC, exclusive)")) >
        Date.now() + 30000,
    );
    const fee = await field(
      "Estimated network fee (separate, gas limit × gas price)",
    );
    assert(/^\d+(?:\.\d+)? HBAR$/.test(fee) && Number(fee.split(" ")[0]) > 0);
    assert(review.includes("296"));
    report.approvedAmountTinybars = approvedAmount;
    report.approvedRound = approvedRound;
    report.review = review;
    save();
    const before = await provider.getBalance(cli.merchant);
    await payerPage
      .getByRole("button", {
        name: "Approve exact quote and pay with MetaMask",
      })
      .click();
    report.signingIntent = "payer payment requested";
    report.stage = "payer payment confirmation";
    save();
    await confirmPopup(payer, "confirm-footer-button");
    await expect(
      payerPage.getByRole("heading", { name: "Confirmed payment receipt" }),
    ).toBeVisible({ timeout: 120000 });
    const txLink = payerPage.locator(
      'a[href^="https://hashscan.io/testnet/transaction/"]',
    );
    const href = await txLink.getAttribute("href");
    assert(href);
    report.paymentUrl = href;
    save();
    const hash = href.split("/").at(-1)!;
    const transaction = await provider.getTransaction(hash);
    assert(transaction);
    assert.equal(transaction.from, cli.payer);
    assert.equal(transaction.to?.toLowerCase(), cli.contract.toLowerCase());
    assert.equal(transaction.value, approvedAmount * 10n ** 10n);
    const decoded = contract.interface.parseTransaction({
      data: transaction.data,
      value: transaction.value,
    });
    assert(decoded?.name === "payInvoice");
    assert.equal(decoded.args[0].invoiceId, id);
    assert.equal(decoded.args[0].amountTinybars, approvedAmount);
    assert.equal(decoded.args[0].roundId, approvedRound);
    const receipt = await provider.getTransactionReceipt(hash);
    assert(receipt?.status === 1);
    const event = receipt.logs
      .filter((log) => log.address.toLowerCase() === cli.contract.toLowerCase())
      .map((log) => {
        try {
          return contract.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((log) => log?.name === "InvoiceSettled");
    assert(
      event && event.args.invoiceId === id && event.args.payer === cli.payer,
    );
    assert.equal(event.args.amountTinybars, approvedAmount);
    assert.equal(event.args.roundId, approvedRound);
    assert.equal(await field("Payer"), cli.payer);
    assert.equal(await field("Invoice ID"), event.args.invoiceId.toString());
    assert.equal(
      await field("Accepted oracle round"),
      approvedRound.toString(),
    );
    assert((await field("Paid amount")).includes(`${approvedAmount} tinybars`));
    assert.equal(
      await field("Confirmed block"),
      receipt.blockNumber.toString(),
    );
    const settlement = await contract.getSettlement(id, {
      blockTag: receipt.blockNumber,
    });
    assert.equal(settlement[0], cli.payer);
    assert.equal(settlement[1], event.args.amountTinybars);
    assert.equal(settlement[2], event.args.roundId);
    assert.equal(
      (await contract.getInvoice(id, { blockTag: receipt.blockNumber }))[2],
      3n,
    );
    const delta =
      (await provider.getBalance(cli.merchant, receipt.blockNumber)) - before;
    assert.equal(delta, event.args.amountTinybars * 10n ** 10n);
    report.merchantDeltaWeibars = delta;
    report.paymentBlock = receipt.blockNumber;
    report.stage = "receipt recovery after reload";
    save();
    await payerPage.reload();
    await payerPage
      .getByRole("button", { name: "Check payment transaction" })
      .click();
    await expect(
      payerPage.getByRole("heading", { name: "Confirmed payment receipt" }),
    ).toBeVisible({ timeout: 60000 });
    const cancelPath = await create();
    report.cancelledInvoicePath = cancelPath;
    save();
    await page.goto(url + cancelPath);
    await page.bringToFront();
    report.stage = "merchant cancellation";
    await page.getByRole("button", { name: "Cancel with MetaMask" }).click();
    report.signingIntent = "merchant cancellation requested";
    save();
    await confirmPopup(merchant, "confirm-footer-button");
    await expect(
      page.getByRole("heading", { name: "Cancelled", exact: true }),
    ).toBeVisible({ timeout: 120000 });
    const cancelId = BigInt(cancelPath.split("/").at(-1)!);
    const cancelReceipt = await eventReceipt("InvoiceCancelled", cancelId);
    assert.equal(
      (
        await contract.getInvoice(cancelId, {
          blockTag: cancelReceipt.blockNumber,
        })
      )[2],
      2n,
    );
    report.cancellationHash = cancelReceipt.hash;
    report.cancellationBlock = cancelReceipt.blockNumber;
    await payerPage.goto(url + cancelPath);
    await expect(
      payerPage.getByRole("heading", { name: "Cancelled", exact: true }),
    ).toBeVisible();
    report.status = "passed";
    save();
  } catch (error) {
    // Only our source frames are retained; provider messages may contain signing data.
    if (error instanceof Error)
      report.failureFrames = error.stack
        ?.split("\n")
        .filter(
          (line) =>
            /^\s+at /.test(line) && line.includes("metamask-checkout.ts"),
        );
    const recovery = [];
    for (const context of contexts) {
      for (const appPage of context.pages()) {
        if (!appPage.url().startsWith(url)) continue;
        try {
          report.lastAppView = await appPage.locator("main").innerText();
          recovery.push(
            await appPage.evaluate(() =>
              Object.fromEntries(
                Object.entries(localStorage).filter(([key]) =>
                  key.startsWith("hbar-invoices:"),
                ),
              ),
            ),
          );
        } catch {
          // An unavailable app page never proves that signing was not submitted.
        }
      }
    }
    report.recovery = recovery;
    console.error(`Browser gate failed during ${report.stage}`);
    report.status = "failed";
    report.blocker =
      "Browser journey failed. Inspect the current UI locally; wallet traces and profiles must not be published.";
    save();
    console.error(`MetaMask gate failed: ${output}`);
    process.exitCode = 1;
  } finally {
    await Promise.allSettled(contexts.map((context) => context.close()));
    for (const profile of profiles)
      rmSync(profile, { recursive: true, force: true });
  }
}
void main();
