import assert from "node:assert/strict";
import { ethers } from "hardhat";

async function fixture() {
  const [merchant, payer] = await ethers.getSigners();
  const feed = await (
    await ethers.getContractFactory("MockPriceFeed")
  ).deploy();
  const now = (await ethers.provider.getBlock("latest"))!.timestamp;
  await feed.getFunction("setDecimals")(8);
  await feed.getFunction("setRound")(7, 10000000, now, now, 7);
  const invoices = await (
    await ethers.getContractFactory("Invoices")
  ).deploy(merchant.address, await feed.getAddress());
  await invoices.getFunction("createInvoice")(125, now + 3600);
  const quote = Array.from(await invoices.getFunction("getQuote")(1));
  return { merchant, payer, feed, invoices, quote, now };
}

describe("Exact approved settlement", () => {
  it("rejects one-tinybar under/overpayment and modified approval fields without delivery", async () => {
    const { merchant, payer, invoices, quote } = await fixture();
    const before = await ethers.provider.getBalance(merchant.address);
    for (const value of [1249999999n, 1250000001n, 1250000000n * 10000000000n])
      await assert.rejects(
        invoices.connect(payer).getFunction("payInvoice")(quote, { value }),
        /IncorrectPayment/,
      );
    for (const index of [1, 2, 3, 4, 5, 6, 7]) {
      const forged = [...quote];
      forged[index] = BigInt(forged[index] as bigint) + 1n;
      await assert.rejects(
        invoices.connect(payer).getFunction("payInvoice")(forged, {
          value: 1250000000n,
        }),
        /QuoteChanged/,
      );
    }
    assert.equal((await invoices.getFunction("getInvoice")(1))[2], 0n);
    assert.equal(await ethers.provider.getBalance(merchant.address), before);
  });
  it("rechecks changed rounds, invalid feed and consensus quote/invoice deadlines at payment", async () => {
    const { payer, feed, invoices, quote, now } = await fixture();
    await feed.getFunction("setRound")(8, 10000000, now, now, 8);
    await assert.rejects(
      invoices.connect(payer).getFunction("payInvoice")(quote, {
        value: 1250000000n,
      }),
      /QuoteChanged/,
    );
    await feed.getFunction("setFailures")(true, false);
    await assert.rejects(
      invoices.connect(payer).getFunction("payInvoice")(quote, {
        value: 1250000000n,
      }),
      /FeedUnavailable/,
    );
    await feed.getFunction("setFailures")(false, false);
    await feed.getFunction("setRound")(7, 10000000, now, now, 7);
    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(quote[3])]);
    await assert.rejects(
      invoices.connect(payer).getFunction("payInvoice")(quote, {
        value: 1250000000n,
      }),
      /QuoteExpired/,
    );
    const current = Array.from(await invoices.getFunction("getQuote")(1));
    await ethers.provider.send("evm_setNextBlockTimestamp", [now + 3600]);
    await assert.rejects(
      invoices.connect(payer).getFunction("payInvoice")(current, {
        value: 1250000000n,
      }),
      /QuoteExpired/,
    );
    assert.equal((await invoices.getFunction("getInvoice")(1))[2], 1n);
  });
  it("lets cancellation win consensus order and never delivers afterwards", async () => {
    const { merchant, payer, invoices, quote } = await fixture();
    await invoices.getFunction("cancelInvoice")(1);
    const before = await ethers.provider.getBalance(merchant.address);
    await assert.rejects(
      invoices.connect(payer).getFunction("payInvoice")(quote, {
        value: 1250000000n,
      }),
      /InvoiceIneligible/,
    );
    assert.equal((await invoices.getFunction("getInvoice")(1))[2], 2n);
    assert.equal(await ethers.provider.getBalance(merchant.address), before);
  });
  it("rolls back rejected delivery and blocks reentrancy across invoices while transferring once", async () => {
    const { payer, feed, now } = await fixture();
    const recipient = await (
      await ethers.getContractFactory("SettlementRecipient")
    ).deploy();
    const invoices = await (
      await ethers.getContractFactory("Invoices")
    ).deploy(await recipient.getAddress(), await feed.getAddress());
    await recipient.getFunction("create")(
      await invoices.getAddress(),
      now + 3600,
    );
    const quote = Array.from(await invoices.getFunction("getQuote")(1));
    await recipient.getFunction("configure")(true, false);
    const fromBlock = await ethers.provider.getBlockNumber();
    await assert.rejects(
      invoices.connect(payer).getFunction("payInvoice")(quote, {
        value: 1250000000n,
      }),
      /RecipientDeliveryFailed/,
    );
    assert.equal((await invoices.getFunction("getInvoice")(1))[2], 0n);
    assert.equal(
      await ethers.provider.getBalance(await recipient.getAddress()),
      0n,
    );
    assert.equal(
      (await invoices.queryFilter(invoices.filters.InvoiceSettled(), fromBlock))
        .length,
      0,
    );
    await recipient.getFunction("configure")(false, true);
    await invoices.connect(payer).getFunction("payInvoice")(quote, {
      value: 1250000000n,
    });
    assert.equal(await recipient.getFunction("reentryBlocked")(), true);
    assert.equal(await recipient.getFunction("deliveries")(), 1n);
    assert.equal(
      await ethers.provider.getBalance(await recipient.getAddress()),
      1250000000n,
    );
    assert.equal((await invoices.getFunction("getInvoice")(1))[2], 3n);
    assert.equal((await invoices.getFunction("getInvoice")(2))[2], 0n);
    assert.equal(
      (await invoices.queryFilter(invoices.filters.InvoiceSettled(), fromBlock))
        .length,
      1,
    );
  });
  it("delivers exactly once with confirmed payer, amount and round evidence", async () => {
    const { merchant, payer, invoices, quote } = await fixture();
    const before = await ethers.provider.getBalance(merchant.address);
    const receipt = await (
      await invoices.connect(payer).getFunction("payInvoice")(quote, {
        value: 1250000000n,
      })
    ).wait();
    assert.equal(
      (await ethers.provider.getBalance(merchant.address)) - before,
      1250000000n,
    );
    assert.equal(
      await ethers.provider.getBalance(await invoices.getAddress()),
      0n,
    );
    assert.equal((await invoices.getFunction("getInvoice")(1))[2], 3n);
    const event = invoices.interface.parseLog(receipt.logs[0]);
    assert.equal(event?.name, "InvoiceSettled");
    assert.deepEqual(Array.from(event!.args), [
      1n,
      payer.address,
      1250000000n,
      7n,
    ]);
    assert.deepEqual(
      Array.from(await invoices.getFunction("getSettlement")(1)),
      [payer.address, 1250000000n, 7n],
    );
    await assert.rejects(
      invoices.connect(payer).getFunction("payInvoice")(quote, {
        value: 1250000000n,
      }),
      /InvoiceIneligible/,
    );
    await assert.rejects(
      invoices.getFunction("cancelInvoice")(1),
      /InvoiceAlreadySettled/,
    );
  });
});
