import assert from "node:assert/strict";
import { ethers } from "hardhat";

describe("Invoice creation and inspection", () => {
  it("fixes deployment identity and exposes the merchant's immutable sequential terms", async () => {
    const [merchant, feed] = await ethers.getSigners();
    const invoices = await (
      await ethers.getContractFactory("Invoices")
    ).deploy(merchant.address, feed.address);
    await invoices.waitForDeployment();
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;
    await (await invoices.getFunction("createInvoice")(125, now + 3600)).wait();
    assert.equal(await invoices.getFunction("merchant")(), merchant.address);
    assert.equal(await invoices.getFunction("recipient")(), merchant.address);
    assert.equal(await invoices.getFunction("feed")(), feed.address);
    const invoice = await invoices.getFunction("getInvoice")(1);
    assert.deepEqual(Array.from(invoice), [125n, BigInt(now + 3600), 0n]);
    await (await invoices.getFunction("createInvoice")(1, now + 7200)).wait();
    assert.equal((await invoices.getFunction("getInvoice")(2))[0], 1n);
  });
  it("rejects strangers, zero cents and expiry at or before consensus time without consuming IDs", async () => {
    const [merchant, stranger, feed] = await ethers.getSigners();
    const invoices = await (
      await ethers.getContractFactory("Invoices")
    ).deploy(merchant.address, feed.address);
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;
    await assert.rejects(
      invoices.connect(stranger).getFunction("createInvoice")(125, now + 3600),
      /MerchantOnly/,
    );
    await assert.rejects(
      invoices.getFunction("createInvoice")(0, now + 3600),
      /InvalidAmount/,
    );
    await assert.rejects(
      invoices.getFunction("createInvoice")(1, now),
      /InvalidExpiry/,
    );
    await assert.rejects(
      invoices.getFunction("createInvoice")(1, now - 1),
      /InvalidExpiry/,
    );
    assert.equal(await invoices.getFunction("nextInvoiceId")(), 1n);
  });
  it("rejects nonexistent IDs and derives expiry at the exact boundary", async () => {
    const [merchant, feed, reader] = await ethers.getSigners();
    const invoices = await (
      await ethers.getContractFactory("Invoices")
    ).deploy(merchant.address, feed.address);
    await assert.rejects(
      invoices.getFunction("getInvoice")(0),
      /InvoiceNotFound/,
    );
    await assert.rejects(
      invoices.getFunction("getInvoice")(1),
      /InvoiceNotFound/,
    );
    const expiry = (await ethers.provider.getBlock("latest"))!.timestamp + 60;
    const receipt = await (
      await invoices.getFunction("createInvoice")(125, expiry)
    ).wait();
    const event = invoices.interface.parseLog(receipt.logs[0]);
    assert.equal(event?.name, "InvoiceCreated");
    assert.deepEqual(Array.from(event!.args), [1n, 125n, BigInt(expiry)]);
    await ethers.provider.send("evm_setNextBlockTimestamp", [expiry - 1]);
    await ethers.provider.send("evm_mine", []);
    assert.equal(
      (await invoices.connect(reader).getFunction("getInvoice")(1))[2],
      0n,
    );
    await ethers.provider.send("evm_setNextBlockTimestamp", [expiry]);
    await ethers.provider.send("evm_mine", []);
    assert.deepEqual(
      Array.from(await invoices.connect(reader).getFunction("getInvoice")(1)),
      [125n, BigInt(expiry), 1n],
    );
  });
  it("rejects a zero merchant or feed and accepts no native value", async () => {
    const [merchant] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("Invoices");
    await assert.rejects(
      factory.deploy(ethers.ZeroAddress, merchant.address),
      /InvalidIdentity/,
    );
    await assert.rejects(
      factory.deploy(merchant.address, ethers.ZeroAddress),
      /InvalidIdentity/,
    );
    const invoices = await factory.deploy(merchant.address, merchant.address);
    await assert.rejects(
      merchant.sendTransaction({ to: await invoices.getAddress(), value: 1n }),
    );
  });
});

describe("Invoice cancellation", () => {
  it("allows only the merchant and preserves terms while exposing a final cancelled state", async () => {
    const [merchant, stranger, feed] = await ethers.getSigners();
    const invoices = await (
      await ethers.getContractFactory("Invoices")
    ).deploy(merchant.address, feed.address);
    const expiry = (await ethers.provider.getBlock("latest"))!.timestamp + 60;
    await (await invoices.getFunction("createInvoice")(125, expiry)).wait();
    await assert.rejects(
      invoices.connect(stranger).getFunction("cancelInvoice")(1),
      /MerchantOnly/,
    );
    await assert.rejects(
      invoices.getFunction("cancelInvoice")(0),
      /InvoiceNotFound/,
    );
    await assert.rejects(
      invoices.getFunction("cancelInvoice")(2),
      /InvoiceNotFound/,
    );
    const receipt = await (
      await invoices.getFunction("cancelInvoice")(1)
    ).wait();
    const event = invoices.interface.parseLog(receipt.logs[0]);
    assert.equal(event?.name, "InvoiceCancelled");
    assert.equal(event?.args.invoiceId, 1n);
    assert.deepEqual(Array.from(await invoices.getFunction("getInvoice")(1)), [
      125n,
      BigInt(expiry),
      2n,
    ]);
    await assert.rejects(
      invoices.getFunction("cancelInvoice")(1),
      /InvoiceAlreadyCancelled/,
    );
    await ethers.provider.send("evm_setNextBlockTimestamp", [expiry]);
    await ethers.provider.send("evm_mine", []);
    assert.equal((await invoices.getFunction("getInvoice")(1))[2], 2n);
  });
  it("allows cancellation of an expired unpaid invoice; expiry is still derived without a transaction", async () => {
    const [merchant, feed] = await ethers.getSigners();
    const invoices = await (
      await ethers.getContractFactory("Invoices")
    ).deploy(merchant.address, feed.address);
    const expiry = (await ethers.provider.getBlock("latest"))!.timestamp + 60;
    await (await invoices.getFunction("createInvoice")(1, expiry)).wait();
    await ethers.provider.send("evm_setNextBlockTimestamp", [expiry - 1]);
    await ethers.provider.send("evm_mine", []);
    assert.equal((await invoices.getFunction("getInvoice")(1))[2], 0n);
    await ethers.provider.send("evm_setNextBlockTimestamp", [expiry]);
    await ethers.provider.send("evm_mine", []);
    assert.equal((await invoices.getFunction("getInvoice")(1))[2], 1n);
    await (await invoices.getFunction("cancelInvoice")(1)).wait();
    assert.equal((await invoices.getFunction("getInvoice")(1))[2], 2n);
  });
});
