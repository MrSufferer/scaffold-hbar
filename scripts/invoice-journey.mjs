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
/** @param {string} method @param {unknown[]} params */
async function rpc(method, params = []) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json();
  if (body.error) throw new Error(body.error.message);
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
    'module.exports = { solidity: "0.8.28", networks: { hardhat: { chainId: 296 } } };\n',
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
  await context.exposeFunction(
    "invoiceWalletRpc",
    async (
      /** @type {{method: string, params?: unknown[]}} */ { method, params },
    ) => {
      if (method === "eth_chainId" && wrongChain) return "0x1";
      if (method === "eth_requestAccounts" && rejectRequest)
        return { walletRejected: true };
      if (method === "eth_requestAccounts" || method === "eth_accounts")
        return [selected];
      if (method === "eth_getTransactionReceipt" && holdReceipts) return null;
      return rpc(method, params);
    },
  );
  await context.addInitScript(() => {
    // This simulated injected wallet is confined to this disposable browser context.
    Object.assign(window, {
      ethereum: {
        isMetaMask: true,
        request: async (
          /** @type {{method: string, params?: unknown[]}} */ input,
        ) => {
          const result =
            await /** @type {Window & {invoiceWalletRpc: (input: unknown) => Promise<{walletRejected?: boolean}>}} */ (
              /** @type {unknown} */ (window)
            ).invoiceWalletRpc(input);
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
  await expect(page.getByRole("status")).toContainText(
    "Only the deployed merchant",
  );
  selected = accounts[0];
  wrongChain = true;
  await page.getByRole("button", { name: "Cancel with MetaMask" }).click();
  await expect(page.getByRole("status")).toContainText("Switch MetaMask");
  wrongChain = false;
  rejectRequest = true;
  await page.getByRole("button", { name: "Cancel with MetaMask" }).click();
  await expect(page.getByRole("status")).toContainText("Request rejected");
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
  const expiryLocator = `/invoice/296/${contract}/3`;
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
    "PASS local creation/read/cancellation/quote journey: browser deployment, merchant authorization, wrong network, wallet rejection, pending reload, cancellation authorization/rejection/pending reload, wallet-free exact/fractional quote review, separate fee-unavailable state, display expiry, consensus window refresh, failed/invalid/stale feed clearing and recovery, nonexistent invoice, expiry, failed-read clearing. Simulated wallet/local EVM only; no testnet deployment or payment evidence.",
  );
} finally {
  await cleanup();
}
