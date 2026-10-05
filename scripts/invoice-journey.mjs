/* global window */
// Local generated-app proof: simulated MetaMask + real local EVM. Never testnet evidence.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
  openSync,
  closeSync,
} from "node:fs";
import net from "node:net";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { chromium, expect } from "@playwright/test";
import { cleanEnvironment, stopProcess } from "./verification.mjs";
const root = path.resolve(import.meta.dirname, "..");
const { Interface } = createRequire(
  new URL("../packages/nextjs/package.json", import.meta.url),
)("ethers");
const tmp = mkdtempSync(path.join(os.tmpdir(), "invoice-journey-"));
const logDir = path.resolve(process.env.INVOICE_JOURNEY_LOG_DIR || tmp);
/** @type {import('node:child_process').ChildProcess[]} */
const children = [];
/** @type {import('playwright').Browser | undefined} */
let browser;
/** @type {https.Server | undefined} */
let proxy;
const config = path.join(root, "packages/hardhat/invoice-probe.config.cjs");
async function port() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      assert(address && typeof address === "object");
      server.close(() => resolve(address.port));
    });
  });
}
/** @param {string[]} args @param {string} cwd @param {string} name @param {NodeJS.ProcessEnv} env */
function start(args, cwd, name, env) {
  const fd = openSync(path.join(logDir, `${name}.log`), "w");
  const child = spawn("npm", args, {
    cwd,
    env,
    detached: true,
    stdio: ["ignore", fd, fd],
  });
  closeSync(fd);
  children.push(child);
  return child;
}
/** @param {()=>Promise<unknown>} action */
async function ready(action) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      return await action();
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(
    "Local journey service failed to become ready; inspect logs.",
  );
}
let rpcId = 0;
/** @param {string} method @param {unknown[]} params @param {boolean} allowRevert */
async function rpc(method, params = [], allowRevert = false) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json();
  if (body.error) {
    if (allowRevert && body.error.data?.txHash) return body.error.data.txHash;
    throw Object.assign(new Error(body.error.message), {
      code: body.error.code,
      data: body.error.data,
    });
  }
  return body.result;
}
let rpcUrl = "";
async function cleanup() {
  await browser?.close();
  for (const child of children) stopProcess(child);
  proxy?.closeAllConnections();
  proxy?.close();
  rmSync(config, { force: true });
  rmSync(tmp, { recursive: true, force: true });
}
process.once("SIGINT", () => {
  void cleanup().finally(() => process.exit(1));
});
process.once("SIGTERM", () => {
  void cleanup().finally(() => process.exit(1));
});
try {
  const rpcPort = await port();
  const webPort = await port();
  rpcUrl = `http://127.0.0.1:${rpcPort}`;
  writeFileSync(
    config,
    'module.exports = { solidity: "0.8.28", networks: { hardhat: { chainId: 296, throwOnTransactionFailures: false } } };\n',
  );
  start(
    [
      "exec",
      "hardhat",
      "--",
      "--config",
      "invoice-probe.config.cjs",
      "node",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(rpcPort),
    ],
    path.join(root, "packages/hardhat"),
    "local-evm",
    cleanEnvironment(),
  );
  await ready(() => rpc("eth_chainId"));
  // TLS is only a test transport, allowing the unchanged production HTTPS validation path.
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      path.join(tmp, "key.pem"),
      "-out",
      path.join(tmp, "cert.pem"),
      "-days",
      "1",
      "-subj",
      "/CN=localhost",
      "-addext",
      "subjectAltName=DNS:localhost,IP:127.0.0.1",
    ],
    { stdio: "ignore" },
  );
  proxy = https.createServer(
    {
      key: readFileSync(path.join(tmp, "key.pem")),
      cert: readFileSync(path.join(tmp, "cert.pem")),
    },
    async (request, response) => {
      try {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        const result = await fetch(rpcUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: Buffer.concat(chunks),
          signal: AbortSignal.timeout(10_000),
        });
        response.writeHead(result.status, {
          "content-type": "application/json",
        });
        response.end(await result.text());
      } catch {
        response.writeHead(503);
        response.end();
      }
    },
  );
  const tlsProxy = proxy;
  await new Promise((resolve) =>
    tlsProxy.listen(0, "127.0.0.1", () => resolve(undefined)),
  );
  const proxyAddress = proxy.address();
  assert(proxyAddress && typeof proxyAddress === "object");
  const accounts = await rpc("eth_accounts");
  const artifact = JSON.parse(
    readFileSync(
      path.join(root, "packages/nextjs/lib/invoice-artifact.json"),
      "utf8",
    ),
  );
  // Install a controllable local oracle at the real feed locator. Never live feed evidence.
  const feedArtifact = JSON.parse(
    readFileSync(
      path.join(
        root,
        "packages/hardhat/artifacts/contracts/MockPriceFeed.sol/MockPriceFeed.json",
      ),
      "utf8",
    ),
  );
  const feedAddress = "0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a";
  const feedInterface = new Interface(feedArtifact.abi);
  await rpc("hardhat_setCode", [feedAddress, feedArtifact.deployedBytecode]);
  async function setFeed(
    /** @type {string} */ method,
    /** @type {unknown[]} */ args,
  ) {
    const hash = await rpc("eth_sendTransaction", [
      {
        from: accounts[0],
        to: feedAddress,
        data: feedInterface.encodeFunctionData(method, args),
      },
    ]);
    assert.equal(
      (await rpc("eth_getTransactionReceipt", [hash])).status,
      "0x1",
    );
  }
  const feedBlock = await rpc("eth_getBlockByNumber", ["latest", false]);
  const feedTime = Number(BigInt(feedBlock.timestamp));
  await setFeed("setDecimals", [8]);
  await setFeed("setRound", [7, 10000000, feedTime, feedTime, 7]);
  // The browser must deploy the shipped bytecode, then create through the shipped UI.
  const base = `http://127.0.0.1:${webPort}`;
  start(
    [
      "run",
      "start",
      "--",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(webPort),
    ],
    root,
    "journey-production",
    {
      ...cleanEnvironment(),
      NEXT_PUBLIC_HEDERA_RPC_URL: `https://127.0.0.1:${proxyAddress.port}`,
      NODE_EXTRA_CA_CERTS: path.join(tmp, "cert.pem"),
    },
  );
  await ready(async () => {
    const response = await fetch(`${base}/deploy`);
    assert.equal(response.status, 200);
  });
  browser = await chromium.launch();
  const context = await browser.newContext();
  let wrongChain = false;
  let selected = accounts[0];
  let rejectRequest = false;
  let holdReceipts = false;
  let rejectPayment = false;
  let failRecoveryRead = false;
  let paymentSubmissions = 0;
  let insufficientBalance = false;
  let revertPayment = false;
  let invalidateDuringEstimate = false;
  let invalidateDuringValidation = false;
  /** @type {{amount: string, round: string}[]} */
  const sentPayments = [];
  const invoiceAbi = new Interface(artifact.abi);
  await context.exposeFunction(
    "invoiceWalletRpc",
    async (
      /** @type {{method: string, params?: unknown[]}} */ { method, params },
    ) => {
      try {
        if (
          method === "eth_call" &&
          invalidateDuringValidation &&
          /** @type {{data?: string}[]} */ (params)?.[0]?.data?.startsWith(
            invoiceAbi.getFunction("validateQuote").selector,
          )
        ) {
          selected = accounts[0];
          await walletEvent("accountsChanged");
          selected = accounts[1];
          await walletEvent("accountsChanged");
        }
        if (method === "eth_chainId" && wrongChain) return "0x1";
        if (method === "eth_getBalance" && insufficientBalance) return "0x0";
        if (method === "eth_requestAccounts" && rejectRequest)
          return { walletRejected: true };
        if (method === "eth_requestAccounts" || method === "eth_accounts")
          return [selected];
        if (method === "eth_getTransactionReceipt" && holdReceipts) return null;
        if (method === "eth_call" && failRecoveryRead)
          throw new Error("Recovery RPC unavailable");
        // Explicit test relay: Hedera converts wire weibars to EVM tinybars.
        // Hardhat does not, so this disposable fixture models that boundary only.
        if (method === "eth_estimateGas" || method === "eth_sendTransaction") {
          const request =
            /** @type {{data?: string, value?: string, to?: string, from?: string}} */ (
              params?.[0]
            );
          if (
            request?.data?.startsWith(
              invoiceAbi.getFunction("payInvoice").selector,
            )
          ) {
            const approved = invoiceAbi.decodeFunctionData(
              "payInvoice",
              request.data,
            )[0];
            assert.equal(
              BigInt(request.value || "0"),
              approved.amountTinybars * 10000000000n,
            );
            if (method === "eth_estimateGas" && invalidateDuringEstimate)
              await walletEvent("accountsChanged");
            if (method === "eth_sendTransaction") {
              if (rejectPayment) return { walletRejected: true };
              ++paymentSubmissions;
              sentPayments.push({
                amount: approved.amountTinybars.toString(),
                round: approved.roundId.toString(),
              });
              if (revertPayment) {
                // Consensus race after validation: keep the submitted amount/round unchanged.
                await setFeed("setRound", [
                  12,
                  300000000,
                  freshTime,
                  freshTime,
                  12,
                ]);
                return rpc(
                  method,
                  [
                    {
                      ...request,
                      value: "0x" + approved.amountTinybars.toString(16),
                    },
                  ],
                  true,
                );
              }
              assert.equal(
                request.from?.toLowerCase(),
                accounts[1].toLowerCase(),
              );
            }
            return await rpc(method, [
              {
                ...request,
                value: "0x" + approved.amountTinybars.toString(16),
              },
              ...(params?.slice(1) || []),
            ]);
          }
        }
        return await rpc(method, params);
      } catch (error) {
        const item =
          /** @type {{code?: number, data?: unknown, message?: string}} */ (
            error
          );
        return {
          walletRpcError: {
            code: item.code || -32603,
            data: item.data,
            message: item.message || "Test RPC unavailable",
          },
        };
      }
    },
  );
  await context.addInitScript(() => {
    // This simulated injected wallet is confined to this disposable browser context.
    /** @type {Map<string, Set<() => void>>} */
    const listeners = new Map();
    Object.assign(window, {
      invoiceWalletEvent: (/** @type {string} */ event) =>
        listeners.get(event)?.forEach((listener) => listener()),
      ethereum: {
        on: (
          /** @type {string} */ event,
          /** @type {() => void} */ listener,
        ) => {
          if (!listeners.has(event)) listeners.set(event, new Set());
          listeners.get(event)?.add(listener);
        },
        removeListener: (
          /** @type {string} */ event,
          /** @type {() => void} */ listener,
        ) => listeners.get(event)?.delete(listener),
        isMetaMask: true,
        request: async (
          /** @type {{method: string, params?: unknown[]}} */ input,
        ) => {
          const result =
            await /** @type {Window & {invoiceWalletRpc: (input: unknown) => Promise<{walletRejected?: boolean, walletRpcError?: {code: number, data?: unknown, message: string}}>}} */ (
              /** @type {unknown} */ (window)
            ).invoiceWalletRpc(input);
          if (result?.walletRpcError)
            throw Object.assign(
              new Error(result.walletRpcError.message),
              result.walletRpcError,
            );
          if (result?.walletRejected)
            throw Object.assign(new Error("User rejected the request"), {
              code: 4001,
            });
          return result;
        },
      },
    });
  });
  const page = await context.newPage();
  async function walletEvent(/** @type {string} */ event) {
    await page.evaluate(
      (name) =>
        /** @type {Window & {invoiceWalletEvent: (event: string) => void}} */ (
          /** @type {unknown} */ (window)
        ).invoiceWalletEvent(name),
      event,
    );
  }
  await page.goto(`${base}/deploy`);
  await page.getByRole("button", { name: "Deploy with MetaMask" }).click();
  await expect(page.getByRole("status")).toContainText("Deployment confirmed", {
    timeout: 30_000,
  });
  const addressText = await page
    .locator("p.code")
    .filter({ hasText: "Contract:" })
    .textContent();
  const addressMatch = addressText?.match(/0x[0-9a-fA-F]{40}/);
  assert(addressMatch);
  const contract = addressMatch[0];
  assert.notEqual(await rpc("eth_getCode", [contract, "latest"]), "0x");
  assert(artifact.bytecode.length > 2);
  // Restart the same production build with the public deployment address.
  const firstServer = children.pop();
  assert(firstServer);
  stopProcess(firstServer);
  await new Promise((resolve) => setTimeout(resolve, 500));
  start(
    [
      "run",
      "start",
      "--",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(webPort),
    ],
    root,
    "journey-configured",
    {
      ...cleanEnvironment(),
      NEXT_PUBLIC_INVOICE_CONTRACT: contract,
      NEXT_PUBLIC_HEDERA_RPC_URL: `https://127.0.0.1:${proxyAddress.port}`,
      NODE_EXTRA_CA_CERTS: path.join(tmp, "cert.pem"),
    },
  );
  await ready(async () => {
    const response = await fetch(`${base}/merchant`);
    assert.equal(response.status, 200);
    assert((await response.text()).includes(contract));
  });
  await page.goto(`${base}/merchant`);
  await page.getByLabel("USD amount").fill("1.25");
  const expiry = new Date(Date.now() + 3_600_000);
  expiry.setSeconds(0, 0);
  const localExpiry = `${expiry.getFullYear()}-${String(expiry.getMonth() + 1).padStart(2, "0")}-${String(expiry.getDate()).padStart(2, "0")}T${String(expiry.getHours()).padStart(2, "0")}:${String(expiry.getMinutes()).padStart(2, "0")}`;
  await page.getByLabel("Expiry (your local time)").fill(localExpiry);
  wrongChain = true;
  await page.getByRole("button", { name: "Create with MetaMask" }).click();
  await expect(page.getByRole("status")).toContainText("Switch MetaMask");
  wrongChain = false;
  selected = accounts[1];
  await page.getByRole("button", { name: "Create with MetaMask" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Only the deployed merchant",
  );
  selected = accounts[0];
  rejectRequest = true;
  await page.getByRole("button", { name: "Create with MetaMask" }).click();
  await expect(page.getByRole("status")).toContainText("Request rejected");
  rejectRequest = false;
  holdReceipts = true;
  await page.getByRole("button", { name: "Create with MetaMask" }).click();
  await expect(
    page.getByRole("heading", { name: "Creation outcome pending" }),
  ).toBeVisible();
  await page.reload();
  holdReceipts = false;
  await page
    .getByRole("button", { name: "Check creation transaction" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Invoice creation confirmed",
    { timeout: 30_000 },
  );
  const locator = `/invoice/296/${contract}/1`;
  await expect(page.getByRole("link", { name: locator })).toBeVisible();
  const payer = await browser.newContext();
  const publicPage = await payer.newPage();
  await publicPage.goto(base + locator);
  await expect(
    publicPage.getByRole("heading", { name: "Open", exact: true }),
  ).toBeVisible();
  await expect(
    publicPage.getByText("$1.25 USD", { exact: true }),
  ).toBeVisible();
  await expect(
    publicPage.getByText(new RegExp(`^${accounts[0]}$`, "i")),
  ).toHaveCount(2);
  assert.equal(await publicPage.evaluate(() => "ethereum" in window), false);
  const view = await (await fetch(`${base}/api${locator}`)).json();
  assert.equal(view.merchant.toLowerCase(), accounts[0].toLowerCase());
  assert.equal(view.recipient.toLowerCase(), accounts[0].toLowerCase());
  assert.equal(
    view.feed.toLowerCase(),
    "0x59bc155eb6c6c415fe43255af66ecf0523c92b4a",
  );
  assert.equal(view.usdCents, "125");
  assert.equal(view.quoteResult.status, "available");
  assert.equal(view.quoteResult.quote.amountTinybars, "1250000000");
  assert.equal(view.quoteResult.quote.roundId, "7");
  await expect(
    publicPage.getByText("12.50000000 HBAR", { exact: true }),
  ).toBeVisible();
  await expect(
    publicPage.getByText("Oracle round", { exact: true }),
  ).toBeVisible();
  await expect(
    publicPage.getByText("Estimated network fees (separate)", { exact: true }),
  ).toBeVisible();
  await expect(publicPage.getByText(/not a live spot guarantee/)).toBeVisible();
  // Consensus expiry cannot be extended by refreshing the old quote context.
  const quoteDeadline = Number(view.quoteResult.quote.deadline);
  await publicPage.evaluate((deadline) => {
    Date.now = () => deadline * 1000;
  }, quoteDeadline);
  await expect(
    publicPage.getByRole("status", { name: "Quote status" }),
  ).toContainText("displayed quote expired");
  await expect(
    publicPage.getByText("12.50000000 HBAR", { exact: true }),
  ).toHaveCount(0);
  await publicPage.reload();
  await expect(
    publicPage.getByText("12.50000000 HBAR", { exact: true }),
  ).toBeVisible();
  await rpc("evm_setNextBlockTimestamp", [quoteDeadline]);
  await rpc("evm_mine");
  await publicPage.getByRole("button", { name: "Refresh invoice" }).click();
  await expect
    .poll(async () => {
      const refreshed = await (await fetch(`${base}/api${locator}`)).json();
      return Number(refreshed.quoteResult.quote?.deadline);
    })
    .toBeGreaterThan(quoteDeadline);
  // No wallet, fallback price or stale successful quote survives a failed oracle read.
  await setFeed("setFailures", [true, false]);
  await publicPage.getByRole("button", { name: "Refresh invoice" }).click();
  await expect(
    publicPage.getByRole("status", { name: "Quote status" }),
  ).toContainText("Quote read unavailable");
  await expect(
    publicPage.getByText("12.50000000 HBAR", { exact: true }),
  ).toHaveCount(0);
  await expect(
    publicPage.getByRole("heading", { name: "Open", exact: true }),
  ).toBeVisible();
  await setFeed("setFailures", [false, false]);
  await setFeed("setRound", [8, 0, feedTime, feedTime, 8]);
  await publicPage.getByRole("button", { name: "Refresh invoice" }).click();
  await expect(
    publicPage.getByRole("status", { name: "Quote status" }),
  ).toContainText("invalid or incomplete");
  await setFeed("setRound", [
    9,
    10000000,
    feedTime - 86401,
    feedTime - 86401,
    9,
  ]);
  await publicPage.getByRole("button", { name: "Refresh invoice" }).click();
  await expect(
    publicPage.getByRole("status", { name: "Quote status" }),
  ).toContainText("older than 24 hours");
  const freshBlock = await rpc("eth_getBlockByNumber", ["latest", false]);
  const freshTime = Number(BigInt(freshBlock.timestamp));
  await setFeed("setRound", [10, 300000000, freshTime, freshTime, 10]);
  await publicPage.getByRole("button", { name: "Refresh invoice" }).click();
  await expect(
    publicPage.getByText("0.41666667 HBAR", { exact: true }),
  ).toBeVisible();
  const fractional = await (await fetch(`${base}/api${locator}`)).json();
  assert.equal(fractional.quoteResult.quote.roundId, "10");
  assert.equal(fractional.quoteResult.quote.amountTinybars, "41666667");

  // Merchant cancellation uses the original locator even if public configuration changes.
  await page.goto(base + locator);
  selected = accounts[1];
  await page.getByRole("button", { name: "Cancel with MetaMask" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Only the deployed merchant" }),
  ).toContainText("Only the deployed merchant");
  selected = accounts[0];
  wrongChain = true;
  await page.getByRole("button", { name: "Cancel with MetaMask" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Switch MetaMask" }),
  ).toContainText("Switch MetaMask");
  wrongChain = false;
  rejectRequest = true;
  await page.getByRole("button", { name: "Cancel with MetaMask" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Request rejected" }),
  ).toContainText("Request rejected");
  rejectRequest = false;
  holdReceipts = true;
  await page.getByRole("button", { name: "Cancel with MetaMask" }).click();
  await expect(
    page.getByRole("heading", { name: "Cancellation outcome pending" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Cancellation outcome pending" }),
  ).toBeVisible();
  holdReceipts = false;
  await page
    .getByRole("button", { name: "Check cancellation transaction" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Cancelled", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Cancel with MetaMask" }),
  ).toHaveCount(0);
  await publicPage.getByRole("button", { name: "Refresh invoice" }).click();
  await expect(
    publicPage.getByRole("heading", { name: "Cancelled", exact: true }),
  ).toBeVisible();
  await publicPage.reload();
  await expect(
    publicPage.getByRole("heading", { name: "Cancelled", exact: true }),
  ).toBeVisible();
  await expect(
    publicPage.getByRole("status", { name: "Quote status" }),
  ).toContainText("This invoice is no longer payable");
  await expect(
    publicPage.getByRole("button", { name: /pay|checkout/i }),
  ).toHaveCount(0);
  assert.equal(
    (await (await fetch(`${base}/api${locator}`)).json()).state,
    "Cancelled",
  );
  await rpc("eth_sendTransaction", [
    {
      from: accounts[0],
      to: contract,
      data: new Interface(artifact.abi).encodeFunctionData("createInvoice", [
        1n,
        18446744073709551615n,
      ]),
    },
  ]);
  await publicPage.goto(`${base}/invoice/296/${contract}/2`);
  await expect(
    publicPage.getByText(
      "18446744073709551615 Unix seconds (outside the UTC date display range)",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    publicPage.getByText("$0.01 USD", { exact: true }),
  ).toBeVisible();
  // Complete payer approval through the actual UI; saved quote never silently reprices.
  selected = accounts[1];
  const paymentLocator = `/invoice/296/${contract}/2`;
  await page.goto(base + paymentLocator);
  const paymentStatus = page.getByRole("status", { name: "Payment status" });
  wrongChain = true;
  await page
    .getByRole("button", { name: "Estimate payment network fee" })
    .click();
  await expect(paymentStatus).toContainText("Switch MetaMask");
  wrongChain = false;
  await page.getByRole("button", { name: "Refresh invoice" }).click();
  await page
    .getByRole("button", { name: "Estimate payment network fee" })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Approve exact quote and pay with MetaMask",
    }),
  ).toBeVisible();
  rejectPayment = true;
  await page
    .getByRole("button", { name: "Approve exact quote and pay with MetaMask" })
    .click();
  await expect(paymentStatus).toContainText("Request rejected");
  assert.equal(paymentSubmissions, 0);
  rejectPayment = false;
  await page.getByRole("button", { name: "Refresh invoice" }).click();
  // Insufficient funds never opens approval; funding does not itself retry payment.
  insufficientBalance = true;
  await page
    .getByRole("button", { name: "Estimate payment network fee" })
    .click();
  await expect(paymentStatus).toContainText("Insufficient test HBAR");
  await expect(
    page.getByRole("button", {
      name: "Approve exact quote and pay with MetaMask",
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Estimate payment network fee" }),
  ).toBeDisabled();
  insufficientBalance = false;
  await page.getByRole("button", { name: "Refresh invoice" }).click();
  await page
    .getByRole("button", { name: "Estimate payment network fee" })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Approve exact quote and pay with MetaMask",
    }),
  ).toBeVisible();
  selected = accounts[0];
  await page.evaluate(() =>
    /** @type {Window & {invoiceWalletEvent: (event: string) => void}} */ (
      /** @type {unknown} */ (window)
    ).invoiceWalletEvent("accountsChanged"),
  );
  await expect(paymentStatus).toContainText(
    "Wallet account or network changed",
  );
  await expect(
    page.getByRole("button", {
      name: "Approve exact quote and pay with MetaMask",
    }),
  ).toHaveCount(0);
  selected = accounts[1];
  await page.getByRole("button", { name: "Refresh invoice" }).click();
  await page
    .getByRole("button", { name: "Estimate payment network fee" })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Approve exact quote and pay with MetaMask",
    }),
  ).toBeVisible();
  wrongChain = true;
  await page.evaluate(() =>
    /** @type {Window & {invoiceWalletEvent: (event: string) => void}} */ (
      /** @type {unknown} */ (window)
    ).invoiceWalletEvent("chainChanged"),
  );
  await expect(
    page.getByRole("button", {
      name: "Approve exact quote and pay with MetaMask",
    }),
  ).toHaveCount(0);
  wrongChain = false;
  assert.equal(paymentSubmissions, 0);
  await page.getByRole("button", { name: "Refresh invoice" }).click();
  invalidateDuringEstimate = true;
  await page
    .getByRole("button", { name: "Estimate payment network fee" })
    .click();
  await expect(paymentStatus).toContainText(
    "Wallet account or network changed",
  );
  await expect(
    page.getByRole("button", { name: "Estimate payment network fee" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", {
      name: "Approve exact quote and pay with MetaMask",
    }),
  ).toHaveCount(0);
  invalidateDuringEstimate = false;
  await page.getByRole("button", { name: "Refresh invoice" }).click();
  await page
    .getByRole("button", { name: "Estimate payment network fee" })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Approve exact quote and pay with MetaMask",
    }),
  ).toBeVisible();
  invalidateDuringValidation = true;
  await page
    .getByRole("button", { name: "Approve exact quote and pay with MetaMask" })
    .click();
  await expect(paymentStatus).toContainText(
    "Payment review changed before submission",
  );
  await expect(
    page.getByRole("heading", { name: "Payment outcome pending" }),
  ).toHaveCount(0);
  assert.equal(paymentSubmissions, 0);
  invalidateDuringValidation = false;
  await page.getByRole("button", { name: "Refresh invoice" }).click();
  // Same numeric price but a new round requires a new review, with no wallet submission.
  await page
    .getByRole("button", { name: "Estimate payment network fee" })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Approve exact quote and pay with MetaMask",
    }),
  ).toBeVisible();
  await setFeed("setRound", [11, 300000000, freshTime, freshTime, 11]);
  await page
    .getByRole("button", { name: "Approve exact quote and pay with MetaMask" })
    .click();
  await expect(paymentStatus).toContainText("Quote changed");
  assert.equal(paymentSubmissions, 0);
  await page.getByRole("button", { name: "Refresh invoice" }).click();
  await expect(
    page.getByText("0.00333334 HBAR", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Estimate payment network fee" })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Approve exact quote and pay with MetaMask",
    }),
  ).toBeVisible();
  const approvedBeforeFailure = sentPayments.length;
  revertPayment = true;
  await page
    .getByRole("button", { name: "Approve exact quote and pay with MetaMask" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Payment outcome pending" }),
  ).toBeVisible();
  await expect(paymentStatus).toContainText("reverted on-chain", {
    timeout: 30_000,
  });
  assert.equal(sentPayments.length, approvedBeforeFailure + 1);
  assert.deepEqual(sentPayments.at(-1), { amount: "333334", round: "11" });
  await expect(
    page.getByRole("heading", { name: "Confirmed payment receipt" }),
  ).toHaveCount(0);
  revertPayment = false;
  await page.getByRole("button", { name: "Check payment transaction" }).click();
  await expect(paymentStatus).toContainText("confirmed failed on-chain");
  await expect(
    page.getByRole("heading", { name: "Open", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Approve exact quote and pay with MetaMask",
    }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Estimate payment network fee" })
    .click();
  await expect(
    page.getByText("Approved oracle round", { exact: true }),
  ).toBeVisible();
  assert.equal(paymentSubmissions, 1);
  const merchantBefore = BigInt(
    await rpc("eth_getBalance", [accounts[0], "latest"]),
  );
  holdReceipts = true;
  await page
    .getByRole("button", { name: "Approve exact quote and pay with MetaMask" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Payment outcome pending" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Confirmed payment receipt" }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Payment outcome pending" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Approve exact quote and pay with MetaMask",
    }),
  ).toHaveCount(0);
  selected = accounts[0];
  await page.getByRole("button", { name: "Check payment transaction" }).click();
  await expect(paymentStatus).toContainText("Invoice settled");
  await expect(
    page.getByRole("heading", { name: "Confirmed payment receipt" }),
  ).toHaveCount(0);
  assert.equal(paymentSubmissions, 2);
  holdReceipts = false;
  await page.getByRole("button", { name: "Check payment transaction" }).click();
  await expect(
    page.getByRole("heading", { name: "Confirmed payment receipt" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Settled", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "View confirmed transaction on HashScan" }),
  ).toHaveAttribute("href", /\/testnet\/transaction\/0x[0-9a-fA-F]{64}$/);
  await expect(page.getByText(/333334 tinybars/)).toBeVisible();
  assert.equal(paymentSubmissions, 2);
  assert.deepEqual(sentPayments.at(-1), { amount: "333334", round: "12" });
  assert.equal(
    BigInt(await rpc("eth_getBalance", [accounts[0], "latest"])) -
      merchantBefore,
    333334n,
  );
  await expect(
    page.getByRole("button", { name: "Cancel with MetaMask" }),
  ).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Check payment transaction" }).click();
  await expect(
    page.getByRole("heading", { name: "Confirmed payment receipt" }),
  ).toBeVisible();
  await publicPage.reload();
  await expect(
    publicPage.getByRole("heading", { name: "Settled", exact: true }),
  ).toBeVisible();
  await expect(
    publicPage.getByRole("button", { name: /approve|estimate payment/i }),
  ).toHaveCount(0);
  // A real mined revert stays blocked while authoritative reads are unavailable.
  const savedPayment = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((key) =>
      key.includes("hbar-invoices:payment:"),
    );
    if (!key) throw new Error("Missing saved payment");
    const saved = localStorage.getItem(key);
    if (!saved) throw new Error("Missing saved payment context");
    return JSON.parse(saved);
  });
  await rpc("eth_sendTransaction", [
    {
      from: accounts[0],
      to: contract,
      data: invoiceAbi.encodeFunctionData("createInvoice", [
        1n,
        18446744073709551615n,
      ]),
    },
  ]);
  const recoveryLocator = `/invoice/296/${contract}/3`;
  const failedHash = await rpc("eth_sendTransaction", [
    {
      from: accounts[1],
      to: contract,
      gas: "0x186a0",
      data: invoiceAbi.encodeFunctionData("payInvoice", [
        { ...savedPayment.quote, invoiceId: "3" },
      ]),
      value: "0x0",
    },
  ]);
  assert.equal(
    (await rpc("eth_getTransactionReceipt", [failedHash])).status,
    "0x0",
  );
  await page.evaluate(
    ({ saved, key, hash }) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          ...saved,
          invoiceId: "3",
          quote: { ...saved.quote, invoiceId: "3" },
          transaction: hash,
        }),
      );
    },
    {
      saved: savedPayment,
      key: `hbar-invoices:payment:v1:${recoveryLocator}`,
      hash: failedHash,
    },
  );
  await page.goto(base + recoveryLocator);
  failRecoveryRead = true;
  await page.getByRole("button", { name: "Check payment transaction" }).click();
  await expect(
    page.getByRole("heading", { name: "Payment outcome pending" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Estimate payment network fee" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Check payment transaction" }),
  ).toBeEnabled();
  failRecoveryRead = false;
  await page.getByRole("button", { name: "Check payment transaction" }).click();
  await expect(paymentStatus).toContainText("confirmed failed on-chain");
  await expect(
    page.getByRole("heading", { name: "Payment outcome pending" }),
  ).toHaveCount(0);
  selected = accounts[1];
  await expect(
    page.getByRole("button", { name: "Estimate payment network fee" }),
  ).toBeEnabled();

  // Another payer settles while a hashless original intent is unresolved.
  await page.evaluate(
    ({ saved, key }) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          ...saved,
          invoiceId: "3",
          quote: { ...saved.quote, invoiceId: "3" },
          transaction: null,
        }),
      );
    },
    { saved: savedPayment, key: `hbar-invoices:payment:v1:${recoveryLocator}` },
  );
  const thirdQuote = invoiceAbi.decodeFunctionResult(
    "getQuote",
    await rpc("eth_call", [
      { to: contract, data: invoiceAbi.encodeFunctionData("getQuote", [3n]) },
      "latest",
    ]),
  )[0];
  const thirdHash = await rpc("eth_sendTransaction", [
    {
      from: accounts[2],
      to: contract,
      data: invoiceAbi.encodeFunctionData("payInvoice", [thirdQuote]),
      value: "0x" + thirdQuote.amountTinybars.toString(16),
    },
  ]);
  assert.equal(
    (await rpc("eth_getTransactionReceipt", [thirdHash])).status,
    "0x1",
  );
  await page.reload();
  await page.getByRole("button", { name: "Check payment transaction" }).click();
  await expect(paymentStatus).toContainText("Invoice settled");
  await expect(
    page.getByRole("heading", { name: "Confirmed payment receipt" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Estimate payment network fee" }),
  ).toHaveCount(0);
  assert.equal(paymentSubmissions, 2);
  await publicPage.goto(`${base}/invoice/296/${contract}/999`);
  await expect(
    publicPage
      .getByRole("alert")
      .filter({ hasText: /does not exist|unavailable/ }),
  ).toContainText("does not exist");
  await publicPage.goto(`${base}/invoice/1/${contract}/1`);
  await expect(
    publicPage.getByRole("heading", { name: "Invalid invoice link" }),
  ).toBeVisible();
  await rpc("eth_sendTransaction", [
    {
      from: accounts[0],
      to: contract,
      data: new Interface(artifact.abi).encodeFunctionData("createInvoice", [
        125n,
        BigInt(view.expiresAt),
      ]),
    },
  ]);
  const expiryLocator = `/invoice/296/${contract}/4`;
  await rpc("evm_setNextBlockTimestamp", [Number(view.expiresAt) - 1]);
  await rpc("evm_mine");
  await publicPage.goto(base + expiryLocator);
  await expect(
    publicPage.getByRole("heading", { name: "Open", exact: true }),
  ).toBeVisible();
  await rpc("evm_setNextBlockTimestamp", [Number(view.expiresAt)]);
  await rpc("evm_mine");
  await publicPage.goto(base + expiryLocator);
  await expect(
    publicPage.getByRole("heading", { name: "Expired", exact: true }),
  ).toBeVisible();
  await expect(
    publicPage.getByRole("status", { name: "Quote status" }),
  ).toContainText("This invoice is no longer payable");
  await expect(
    publicPage.getByRole("button", { name: /pay|checkout/i }),
  ).toHaveCount(0);
  assert.equal(
    (await (await fetch(`${base}/api${locator}`)).json()).state,
    "Cancelled",
  );
  // A failed read must clear the previously displayed state.
  tlsProxy.closeAllConnections();
  await new Promise((resolve) => tlsProxy.close(resolve));
  proxy = undefined;
  await publicPage.getByRole("button", { name: "Refresh invoice" }).click();
  await expect(
    publicPage
      .getByRole("alert")
      .filter({ hasText: /does not exist|unavailable/ }),
  ).toContainText("unavailable", {
    timeout: 20_000,
  });
  await expect(
    publicPage.getByRole("heading", { name: "Expired", exact: true }),
  ).toHaveCount(0);
  console.log(
    "PASS local creation/read/cancellation/quote/settlement journey: browser deployment, authorization, wrong network, wallet rejection, pending reload, cancellation, wallet-free exact/fractional quote review, fee estimation, insufficient funds, account/network event invalidation including in-flight estimation and validation, explicit fresh approval, confirmed revert and retry, changed-round rejection, exact wire-to-EVM test conversion, atomic recipient balance delta, confirmed receipt and reload recovery, settled payer state, expiry and failed-read clearing. Simulated wallet/local EVM/test relay only; no testnet deployment or payment evidence.",
  );
} finally {
  await cleanup();
}
