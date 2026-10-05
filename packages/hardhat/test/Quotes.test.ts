import assert from "node:assert/strict";
import { ethers } from "hardhat";

async function fixture(cents = 125n) {
  const [merchant] = await ethers.getSigners();
  const feed = await (
    await ethers.getContractFactory("MockPriceFeed")
  ).deploy();
  const invoices = await (
    await ethers.getContractFactory("Invoices")
  ).deploy(merchant.address, await feed.getAddress());
  const now = (await ethers.provider.getBlock("latest"))!.timestamp;
  await (await feed.getFunction("setRound")(7, 10000000, now, now, 7)).wait();
  await (await invoices.getFunction("createInvoice")(cents, now + 3600)).wait();
  return { feed, invoices, now, merchant };
}

describe("Contract-derived quotes", () => {
  it("returns exact upward-rounded tinybars and the oracle context without accepting native value", async () => {
    const { invoices, now } = await fixture();
    const quote = await invoices.getFunction("getQuote")(1);
    assert.equal(quote.invoiceId, 1n);
    assert.equal(quote.roundId, 7n);
    assert.equal(quote.amountTinybars, 1250000000n); // $1.25 / $0.10 = 12.5 HBAR
    assert.equal(quote.priceUpdatedAt, BigInt(now));
    assert.equal(quote.price, 10000000n);
    assert.equal(quote.feedDecimals, 8n);
    assert.equal(
      await invoices.getFunction("validateQuote")(Array.from(quote)),
      true,
    );
  });
});

describe("Quote conversion and feed rejection", () => {
  it("covers one cent, fractional tinybars, feed decimals and oversized amounts with independent examples", async () => {
    const { feed, invoices, now } = await fixture(1n);
    assert.equal(
      (await invoices.getFunction("getQuote")(1)).amountTinybars,
      10000000n,
    );
    await (
      await feed.getFunction("setRound")(8, 300000000, now, now, 8)
    ).wait();
    assert.equal(
      (await invoices.getFunction("getQuote")(1)).amountTinybars,
      333334n,
    ); // $0.01 / $3 = 1/300 HBAR
    await (await feed.getFunction("setDecimals")(6)).wait();
    await (await feed.getFunction("setRound")(9, 3000000, now, now, 9)).wait();
    assert.equal(
      (await invoices.getFunction("getQuote")(1)).amountTinybars,
      333334n,
    );
    await (
      await invoices.getFunction("createInvoice")(2n ** 256n - 1n, now + 3600)
    ).wait();
    await assert.rejects(
      invoices.getFunction("getQuote")(2),
      /QuoteAmountOutOfRange/,
    );
    await (
      await invoices.getFunction("createInvoice")(9223372036855n, now + 3600)
    ).wait();
    await (await feed.getFunction("setRound")(10, 1, now, now, 10)).wait();
    await assert.rejects(
      invoices.getFunction("getQuote")(3),
      /QuoteAmountOutOfRange/,
    );
    await (await feed.getFunction("setDecimals")(19)).wait();
    await assert.rejects(
      invoices.getFunction("getQuote")(1),
      /UnsupportedFeedDecimals/,
    );
  });
  it("rejects failed reads and invalid price, completeness and timestamps", async () => {
    const { feed, invoices, now } = await fixture();
    for (const [round, price, started, updated, answered, error] of [
      [7, 0, now, now, 7, /InvalidPrice/],
      [7, -1, now, now, 7, /InvalidPrice/],
      [7, 10000000, now, now, 6, /IncompleteRound/],
      [0, 10000000, now, now, 0, /IncompleteRound/],
      [7, 10000000, 0, 0, 7, /InvalidPriceTimestamp/],
      [7, 10000000, now, now + 1000, 7, /InvalidPriceTimestamp/],
      [7, 10000000, now + 1, now, 7, /InvalidPriceTimestamp/],
      [7, 10000000, now - 86401, now - 86401, 7, /StalePrice/],
    ] as const) {
      await (
        await feed.getFunction("setRound")(
          round,
          price,
          started,
          updated,
          answered,
        )
      ).wait();
      await assert.rejects(invoices.getFunction("getQuote")(1), error);
    }
    await (await feed.getFunction("setFailures")(true, false)).wait();
    await assert.rejects(
      invoices.getFunction("getQuote")(1),
      /FeedUnavailable/,
    );
    await (await feed.getFunction("setRound")(7, 10000000, now, now, 7)).wait();
    await (await feed.getFunction("setFailures")(false, true)).wait();
    await assert.rejects(
      invoices.getFunction("getQuote")(1),
      /FeedUnavailable/,
    );
  });
  it("accepts a price at 24 hours but provides no usable lifetime, and rejects older data", async () => {
    const { feed, invoices, now } = await fixture();
    await (
      await feed.getFunction("setRound")(
        7,
        10000000,
        now - 86400 + 20,
        now - 86400 + 20,
        7,
      )
    ).wait();
    await ethers.provider.send("evm_setNextBlockTimestamp", [now + 20]);
    await ethers.provider.send("evm_mine", []);
    const quote = await invoices.getFunction("getQuote")(1);
    assert.equal(quote.deadline, BigInt(now + 20));
    await assert.rejects(
      invoices.getFunction("validateQuote")(Array.from(quote)),
      /QuoteExpired/,
    );
    await ethers.provider.send("evm_setNextBlockTimestamp", [now + 21]);
    await ethers.provider.send("evm_mine", []);
    await assert.rejects(invoices.getFunction("getQuote")(1), /StalePrice/);
  });
});

describe("Contract-verifiable quote lifetime", () => {
  it("expires at the window boundary and rejects fabricated deadlines or future windows", async () => {
    const { invoices } = await fixture();
    const quote = await invoices.getFunction("getQuote")(1);
    const block = (await ethers.provider.getBlock("latest"))!;
    assert(quote.deadline > BigInt(block.timestamp));
    assert(quote.deadline <= BigInt(block.timestamp + 300));
    const fabricated = Array.from(quote);
    fabricated[3] = quote.deadline + 300n;
    await assert.rejects(
      invoices.getFunction("validateQuote")(fabricated),
      /QuoteChanged/,
    );
    fabricated[4] = quote.window + 1n;
    await assert.rejects(
      invoices.getFunction("validateQuote")(fabricated),
      /QuoteChanged/,
    );
    await ethers.provider.send("evm_setNextBlockTimestamp", [
      Number(quote.deadline) - 1,
    ]);
    await ethers.provider.send("evm_mine", []);
    assert.equal(
      await invoices.getFunction("validateQuote")(Array.from(quote)),
      true,
    );
    await ethers.provider.send("evm_setNextBlockTimestamp", [
      Number(quote.deadline),
    ]);
    await ethers.provider.send("evm_mine", []);
    await assert.rejects(
      invoices.getFunction("validateQuote")(Array.from(quote)),
      /QuoteExpired/,
    );
    const refresh = await invoices.getFunction("getQuote")(1);
    assert.equal(refresh.window, quote.window + 1n);
    assert.equal(refresh.amountTinybars, quote.amountTinybars);
    assert.notEqual(refresh.deadline, quote.deadline);
    // A browser timestamp cannot revive the old approval in the new window.
    const oldWithNewDeadline = Array.from(quote);
    oldWithNewDeadline[3] = refresh.deadline;
    await assert.rejects(
      invoices.getFunction("validateQuote")(oldWithNewDeadline),
      /QuoteChanged/,
    );
  });
  it("binds round and exact amount even when the next round has the same numeric price", async () => {
    const { invoices, feed, now } = await fixture();
    const quote = await invoices.getFunction("getQuote")(1);
    const changedAmount = Array.from(quote);
    changedAmount[2] = quote.amountTinybars + 1n;
    await assert.rejects(
      invoices.getFunction("validateQuote")(changedAmount),
      /QuoteChanged/,
    );
    await (await feed.getFunction("setRound")(8, 10000000, now, now, 8)).wait();
    await assert.rejects(
      invoices.getFunction("validateQuote")(Array.from(quote)),
      /QuoteChanged/,
    );
  });
  it("caps the deadline by invoice expiry and rejects quotes at expiry or for missing invoices", async () => {
    const { invoices } = await fixture();
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;
    const expiry = now + (300 - (now % 300) > 12 ? 10 : 2);
    await (await invoices.getFunction("createInvoice")(1, expiry)).wait();
    const quote = await invoices.getFunction("getQuote")(2);
    assert.equal(quote.deadline, BigInt(expiry));
    await assert.rejects(
      invoices.getFunction("getQuote")(999),
      /InvoiceNotFound/,
    );
    await ethers.provider.send("evm_setNextBlockTimestamp", [expiry - 1]);
    await ethers.provider.send("evm_mine", []);
    assert.equal(
      await invoices.getFunction("validateQuote")(Array.from(quote)),
      true,
    );
    await ethers.provider.send("evm_setNextBlockTimestamp", [expiry]);
    await ethers.provider.send("evm_mine", []);
    await assert.rejects(
      invoices.getFunction("getQuote")(2),
      /InvoiceIneligible/,
    );
    await assert.rejects(
      invoices.getFunction("validateQuote")(Array.from(quote)),
      /QuoteExpired/,
    );
  });
  it("caps the deadline by price freshness before the window ends", async () => {
    const { feed, invoices } = await fixture();
    const block = (await ethers.provider.getBlock("latest"))!;
    const future = Math.floor(block.timestamp / 300) * 300 + 300 + 10;
    const updated = future - 86400 + 20;
    await (
      await feed.getFunction("setRound")(9, 10000000, updated, updated, 9)
    ).wait();
    await ethers.provider.send("evm_setNextBlockTimestamp", [future]);
    await ethers.provider.send("evm_mine", []);
    const quote = await invoices.getFunction("getQuote")(1);
    assert.equal(quote.deadline, BigInt(future + 20));
    await ethers.provider.send("evm_setNextBlockTimestamp", [future + 19]);
    await ethers.provider.send("evm_mine", []);
    assert.equal(
      await invoices.getFunction("validateQuote")(Array.from(quote)),
      true,
    );
    await ethers.provider.send("evm_setNextBlockTimestamp", [future + 20]);
    await ethers.provider.send("evm_mine", []);
    await assert.rejects(
      invoices.getFunction("validateQuote")(Array.from(quote)),
      /QuoteExpired/,
    );
  });
});
