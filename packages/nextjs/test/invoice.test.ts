import assert from "node:assert/strict";
import { test } from "node:test";
import {
  invoiceIdentity,
  invoicePath,
  parseCents,
  formatUsd,
  formatExpiry,
} from "../lib/invoice.ts";
import { Interface } from "ethers";
import { artifact } from "../lib/invoice.ts";
import { confirmedCancellation, merchantSigner } from "../lib/wallet.ts";
const address = "0x1111111111111111111111111111111111111111";
test("a locator preserves its original deployment and validates supported identities", () => {
  assert.equal(
    invoicePath(invoiceIdentity("296", address, "2")),
    `/invoice/296/${address}/2`,
  );
  for (const args of [
    ["1", address, "1"],
    ["296", "0x" + "0".repeat(40), "1"],
    ["296", address, "0"],
    ["296", address, "-1"],
    ["296", address, (2n ** 256n).toString()],
  ]) {
    assert.throws(() => invoiceIdentity(...(args as [string, string, string])));
  }
});
test("whole-cent input and exact USD display never round an invoice", () => {
  assert.equal(parseCents("1.25"), 125n);
  assert.equal(parseCents("0.01"), 1n);
  assert.equal(parseCents("1.2"), 120n);
  for (const input of [
    "0",
    "-1",
    "1.001",
    "1e3",
    "NaN",
    "",
    "1,000",
    (2n ** 256n).toString(),
  ])
    assert.throws(() => parseCents(input));
  assert.equal(formatUsd("125"), "$1.25 USD");
  assert.equal(
    formatUsd("900719925474099301"),
    "$9,007,199,254,740,993.01 USD",
  );
});
test("wrong wallet network is rejected before requesting account authorization", async () => {
  for (const chain of [
    "0x1",
    "0x0127",
    "0x129",
    "296",
    "0x",
    "0x128junk",
    "",
    null,
    296,
  ]) {
    const methods: string[] = [];
    await assert.rejects(
      merchantSigner({
        isMetaMask: true,
        request: async ({ method }) => {
          methods.push(method);
          return chain;
        },
      }),
      /Hedera testnet/,
    );
    assert.deepEqual(methods, ["eth_chainId"]);
  }
});

test("merchant authorization accepts equivalent hexadecimal Hedera testnet IDs", async () => {
  for (const chain of ["0x128", "0x0128", "0x000128"]) {
    const methods: string[] = [];
    const { provider, signer } = await merchantSigner({
      isMetaMask: true,
      request: async ({ method }) => {
        methods.push(method);
        if (method === "eth_chainId") return chain;
        if (method === "eth_accounts" || method === "eth_requestAccounts")
          return [address];
        throw new Error(`Unexpected wallet request: ${method}`);
      },
    });
    try {
      assert.equal((await signer.getAddress()).toLowerCase(), address);
      assert.ok(methods.includes("eth_requestAccounts"));
    } finally {
      provider.destroy();
    }
  }
});

test("invoice expiry remains inspectable beyond JavaScript's date range", () => {
  assert.equal(formatExpiry("1791158400"), "2026-10-05T00:00:00.000Z");
  assert.equal(
    formatExpiry("18446744073709551615"),
    "18446744073709551615 Unix seconds (outside the UTC date display range)",
  );
});

test("cancellation confirmation requires the event for the original contract and invoice", () => {
  const identity = invoiceIdentity("296", address, "2");
  const abi = new Interface(artifact.abi);
  const event = abi.encodeEventLog(abi.getEvent("InvoiceCancelled")!, [2n]);
  const log = { address, ...event };
  assert.doesNotThrow(() => confirmedCancellation([log], identity));
  assert.throws(() => confirmedCancellation([], identity), /unknown/);
  assert.throws(
    () =>
      confirmedCancellation(
        [{ ...log, address: "0x2222222222222222222222222222222222222222" }],
        identity,
      ),
    /unknown/,
  );
  assert.throws(
    () => confirmedCancellation([log], { ...identity, invoiceId: "1" }),
    /unknown/,
  );
});

test("exact HBAR review retains every tinybar without floating-point loss", async () => {
  const { formatHbar } = await import("../lib/invoice.ts");
  assert.equal(formatHbar("1"), "0.00000001 HBAR");
  assert.equal(formatHbar("1250000000"), "12.50000000 HBAR");
  assert.equal(
    formatHbar("9223372036854775807"),
    "92,233,720,368.54775807 HBAR",
  );
});
