import assert from "node:assert/strict";
import { test } from "node:test";
import { Interface } from "ethers";
import { artifact, invoiceIdentity } from "../lib/invoice.ts";
import { paymentValue, settlementEvidence } from "../lib/payment.ts";

const identity = invoiceIdentity(
  "296",
  "0x1111111111111111111111111111111111111111",
  "2",
);
const payer = "0x2222222222222222222222222222222222222222";
test("the wallet transports exact tinybars in weibars without floating-point rounding", () => {
  assert.equal(paymentValue("1"), 10000000000n);
  assert.equal(paymentValue("1250000000"), 12500000000000000000n);
  assert.equal(
    paymentValue("9223372036854775807"),
    92233720368547758070000000000n,
  );
  for (const value of ["0", "-1", "1.5", "9223372036854775808"])
    assert.throws(() => paymentValue(value));
});
test("a receipt needs confirmed evidence from the original contract and invoice", () => {
  const abi = new Interface(artifact.abi);
  const event = abi.encodeEventLog(abi.getEvent("InvoiceSettled")!, [
    2n,
    payer,
    1250000000n,
    7n,
  ]);
  const receipt = {
    status: 1,
    hash: "0x" + "a".repeat(64),
    blockNumber: 12,
    logs: [{ address: identity.contract, ...event }],
  };
  assert.deepEqual(settlementEvidence(receipt, identity), {
    ...identity,
    transaction: receipt.hash,
    blockNumber: 12,
    payer,
    amountTinybars: "1250000000",
    roundId: "7",
  });
  assert.throws(
    () => settlementEvidence({ ...receipt, status: 0 }, identity),
    /reverted/,
  );
  assert.throws(
    () => settlementEvidence({ ...receipt, logs: [] }, identity),
    /unknown/,
  );
  assert.throws(
    () => settlementEvidence(receipt, { ...identity, invoiceId: "1" }),
    /unknown/,
  );
  assert.throws(
    () => settlementEvidence(receipt, { ...identity, contract: payer }),
    /unknown/,
  );
});
