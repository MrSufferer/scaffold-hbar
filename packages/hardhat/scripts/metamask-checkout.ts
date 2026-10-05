import { bootstrap, MetaMaskWallet } from "@tenkeylabs/dappwright";
import { expect, type BrowserContext } from "@playwright/test";
import { Contract, JsonRpcProvider, Wallet } from "ethers";
import { readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { strict as assert } from "node:assert";

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
  if (existsSync(output)) {
    const previous = JSON.parse(readFileSync(output, "utf8"));
    assert(
      !previous.invoicePath && !previous.signingIntent,
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
      const [wallet, page, context] = await bootstrap("", {
        wallet: "metamask",
        version: "13.17.0",
        headless: true,
        seed: "test test test test test test test test test test test junk",
        password: randomUUID() + "Aa1!",
      });
      contexts.push(context);
      report.stage = "import authorized account";
      save();
      await wallet.importPK(key.replace(/^0x/, ""));
      report.stage = "add Hedera network";
      save();
      await wallet.addNetwork({
        networkName: "Hedera Testnet",
        rpc,
        chainId: 296,
        symbol: "HBAR",
      });
      await wallet.switchNetwork("Hedera Testnet");
      wallets.push({ wallet, page });
    }
    assert.equal(MetaMaskWallet.recommendedVersion, "13.17.0");
    const [{ wallet: merchant, page }, { wallet: payer, page: payerPage }] =
      wallets;
    let merchantConnected = false;
    const create = async () => {
      await page.goto(`${url}/merchant`);
      await page.getByLabel("USD amount").fill("1.25");
      const date = new Date(Date.now() + 3600000);
      const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
      await page.getByLabel("Expiry (your local time)").fill(local);
      await page.getByRole("button", { name: "Create with MetaMask" }).click();
      if ((await page.getByRole("status").textContent()) === "")
        throw new Error("Creation did not request wallet");
      if (!merchantConnected) {
        await merchant.approve();
        merchantConnected = true;
      }
      report.signingIntent = "merchant transaction requested";
      save();
      await merchant.confirmTransaction();
      await expect(page.getByRole("status")).toContainText(
        "Invoice creation confirmed.",
        {
          timeout: 120000,
        },
      );
      const link = page.locator('a[href^="/invoice/296/"]');
      const path = await link.getAttribute("href");
      assert(path);
      return path;
    };
    report.stage = "merchant creation";
    save();
    const path = await create();
    report.invoicePath = path;
    save();
    const id = BigInt(path.split("/").at(-1)!);
    await payerPage.goto(url + path);
    await expect(
      payerPage.getByRole("heading", { name: "Open", exact: true }),
    ).toBeVisible();
    await payerPage
      .getByRole("button", { name: "Estimate payment network fee" })
      .click();
    report.stage = "payer connection";
    save();
    await payer.approve();
    await expect(
      payerPage.getByRole("button", {
        name: "Approve exact quote and pay with MetaMask",
      }),
    ).toBeEnabled({ timeout: 60000 });
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
    report.review = review;
    save();
    const before = await provider.getBalance(cli.merchant);
    await payerPage
      .getByRole("button", {
        name: "Approve exact quote and pay with MetaMask",
      })
      .click();
    report.signingIntent = "payer payment requested";
    save();
    await payer.confirmTransaction();
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
    await page.getByRole("button", { name: "Cancel with MetaMask" }).click();
    await merchant.confirmTransaction();
    await expect(
      page.getByRole("heading", { name: "Cancelled", exact: true }),
    ).toBeVisible({ timeout: 120000 });
    await payerPage.goto(url + cancelPath);
    await expect(
      payerPage.getByRole("heading", { name: "Cancelled", exact: true }),
    ).toBeVisible();
    report.status = "passed";
    save();
  } catch {
    report.status = "failed";
    report.blocker =
      "Browser journey failed. Inspect the current UI locally; wallet traces and profiles must not be published.";
    save();
    console.error(`MetaMask gate failed: ${output}`);
    process.exitCode = 1;
  } finally {
    for (const context of contexts) await context.close();
    for (const profile of profiles)
      rmSync(profile, { recursive: true, force: true });
  }
}
void main();
