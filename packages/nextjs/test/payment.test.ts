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

test("payment validation explains a changed round without silently approving it", async () => {
  const { paymentFailureMessage } = await import("../lib/payment.ts");
  const data = new Interface(artifact.abi).encodeErrorResult("QuoteChanged");
  assert.match(
    paymentFailureMessage({ code: "CALL_EXCEPTION", data }),
    /Quote changed.*Refresh.*approve a new quote/,
  );
});

test("recovery keeps unknown outcomes blocked and reads invoice state before releasing a revert", async () => {
  const { reconcilePayment, parsePaymentAttempt } = await import(
    "../lib/payment.ts"
  );
  const { BrowserProvider } = await import("ethers");
  const abi = new Interface(artifact.abi);
  const attempt = {
    ...identity,
    payer,
    transaction: "0x" + "a".repeat(64),
    quote: {
      invoiceId: "2",
      roundId: "7",
      amountTinybars: "1250000000",
      deadline: "9999999999",
      window: "1",
      priceUpdatedAt: "1",
      price: "1",
      feedDecimals: 8,
    },
    gasLimit: "100000",
    gasPrice: "1",
    feeWeibars: "100000",
  };
  const restored = parsePaymentAttempt(JSON.stringify(attempt), identity);
  assert.deepEqual(restored, attempt);
  assert.throws(() =>
    parsePaymentAttempt(JSON.stringify(attempt), {
      ...identity,
      contract: payer,
    }),
  );
  let state = 0;
  let failed = false;
  let unreadable = false;
  let chain = "0x128";
  const provider = new BrowserProvider(
    {
      request: async ({ method }) => {
        if (method === "eth_chainId") return chain;
        if (method === "eth_getTransactionReceipt") {
          if (!failed) return null;
          return {
            transactionHash: attempt.transaction,
            blockHash: "0x" + "b".repeat(64),
            blockNumber: "0xc",
            transactionIndex: "0x0",
            from: payer,
            to: identity.contract,
            cumulativeGasUsed: "0x1",
            gasUsed: "0x1",
            logs: [],
            logsBloom: "0x" + "0".repeat(512),
            status: "0x0",
            type: "0x0",
            effectiveGasPrice: "0x1",
          };
        }
        if (method === "eth_call") {
          if (unreadable) throw new Error("RPC timeout");
          return abi.encodeFunctionResult("getInvoice", [
            125n,
            9999999999n,
            state,
          ]);
        }
        throw new Error(method);
      },
    },
    undefined,
    { cacheTimeout: -1 },
  );
  try {
    assert.deepEqual(await reconcilePayment(provider, restored), {
      status: "unknown",
    });
    failed = true;
    unreadable = true;
    await assert.rejects(reconcilePayment(provider, restored));
    unreadable = false;
    assert.deepEqual(await reconcilePayment(provider, restored), {
      status: "failed",
      invoiceState: 0,
    });
    state = 3;
    assert.deepEqual(await reconcilePayment(provider, restored), {
      status: "settled",
    });
    failed = false;
    assert.deepEqual(
      await reconcilePayment(provider, { ...restored, transaction: null }),
      { status: "settled" },
    );
    chain = "0x1";
    await assert.rejects(reconcilePayment(provider, restored));
  } finally {
    provider.destroy();
  }
});

test("payment failures explain permitted recovery without treating validation as settlement", async () => {
  const { paymentFailureMessage, paymentNotSubmitted } = await import(
    "../lib/payment.ts"
  );
  const abi = new Interface(artifact.abi);
  for (const [name, expected] of [
    ["QuoteExpired", /Quote expired.*approve a new quote/],
    ["StalePrice", /older than 24 hours.*Wait for a feed update/],
    ["InvalidPrice", /invalid or incomplete.*Wait for valid feed data/],
    ["IncompleteRound", /invalid or incomplete/],
    ["InvalidPriceTimestamp", /invalid or incomplete/],
    ["FeedUnavailable", /Feed read unavailable.*Payment is blocked/],
    ["InvoiceIneligible", /cancelled, expired or already settled.*Refresh/],
    ["RecipientDeliveryFailed", /Recipient delivery failed.*merchant/],
  ] as const) {
    const args = name === "InvoiceIneligible" ? [2n] : [];
    const error = {
      code: "CALL_EXCEPTION",
      data: abi.encodeErrorResult(name, args),
    };
    assert.match(paymentFailureMessage(error), expected);
    assert.equal(paymentNotSubmitted(error), false);
  }
  assert.match(
    paymentFailureMessage({ code: 4001 }),
    /rejected.*before submission.*Refresh/,
  );
  assert.equal(paymentNotSubmitted({ code: 4001 }), true);
  assert.match(
    paymentFailureMessage({ code: "INSUFFICIENT_FUNDS" }),
    /Fund the connected payer.*approve a new quote/,
  );
  assert.equal(paymentNotSubmitted({ code: "TIMEOUT" }), false);
});
