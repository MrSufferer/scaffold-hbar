import assert from "node:assert/strict";
import { test } from "node:test";
import {
  invoiceIdentity,
  invoicePath,
  parseCents,
  formatUsd,
} from "../lib/invoice.ts";
import { merchantSigner } from "../lib/wallet.ts";
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
  const methods: string[] = [];
  await assert.rejects(
    merchantSigner({
      isMetaMask: true,
      request: async ({ method }) => {
        methods.push(method);
        return "0x1";
      },
    }),
    /Hedera testnet/,
  );
  assert.deepEqual(methods, ["eth_chainId"]);
});
