import hre from "hardhat";
import { strict as assert } from "node:assert";
import { writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

async function main() {
  const { ethers } = hre;
  assert.equal((await ethers.provider.getNetwork()).chainId, 296n);
  const keys = ["HEDERA_FIRST_PRIVATE_KEY", "HEDERA_SECOND_PRIVATE_KEY"].map(
    (name) => {
      const key = process.env[name];
      assert(key, `${name} missing; load the private root .env`);
      return new ethers.Wallet(
        key.startsWith("0x") ? key : `0x${key}`,
        ethers.provider,
      );
    },
  );
  const [merchant, payer] = keys;
  assert.notEqual(merchant.address, payer.address);
  const feedAddress = "0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a";
  const report: Record<string, unknown> = {
    date: new Date().toISOString(),
    sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    kind: "real-testnet-cli",
    chainId: 296,
    merchant: merchant.address,
    payer: payer.address,
    feed: feedAddress,
    node: process.version,
    transactions: [],
    status: "incomplete",
  };
  const output =
    process.env.TESTNET_REPORT || "/tmp/hbar-invoices-testnet-cli.json";
  assert(
    !existsSync(output),
    "Evidence already exists. Reconcile its original hashes before selecting a new report path; never blindly rerun.",
  );
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
    const feed = new ethers.Contract(
      feedAddress,
      [
        "function decimals() view returns(uint8)",
        "function latestRoundData() view returns(uint80,int256,uint256,uint256,uint80)",
      ],
      ethers.provider,
    );
    const block = await ethers.provider.getBlock("latest");
    assert(block);
    const round = await feed.latestRoundData();
    assert(round[0] > 0n && round[1] > 0n && round[4] >= round[0]);
    assert(
      round[2] > 0n &&
        round[2] <= round[3] &&
        round[3] <= BigInt(block.timestamp),
    );
    assert(BigInt(block.timestamp) - round[3] < 86400n, "Stale feed");
    report.feedRound = [...round];
    report.feedDecimals = await feed.decimals();
    for (const wallet of keys)
      assert(
        (await ethers.provider.getBalance(wallet.address)) >
          ethers.parseEther("5"),
        "Insufficient test HBAR",
      );
    const factory = await ethers.getContractFactory("Invoices", merchant);
    const contract = await factory.deploy(merchant.address, feedAddress);
    const deployment = contract.deploymentTransaction();
    assert(deployment);
    report.deploymentHash = deployment.hash;
    save();
    const deployed = await deployment.wait();
    assert(deployed?.status === 1);
    const address = await contract.getAddress();
    report.contract = address;
    save();
    const transactions = report.transactions as Record<string, unknown>[];
    const confirm = async (
      tx: {
        hash: string;
        wait(): Promise<import("ethers").TransactionReceipt | null>;
      },
      action: string,
    ) => {
      const entry: Record<string, unknown> = {
        action,
        hash: tx.hash,
        url: `https://hashscan.io/testnet/transaction/${tx.hash}`,
        status: "pending",
      };
      transactions.push(entry);
      save();
      const receipt = await tx.wait();
      assert(receipt?.status === 1);
      entry.status = "confirmed";
      entry.block = receipt.blockNumber;
      save();
      return receipt;
    };
    await confirm(
      await contract.createInvoice(125n, block.timestamp + 3600),
      "create payment invoice",
    );
    const quote = await contract.getQuote(1n);
    assert(
      BigInt((await ethers.provider.getBlock("latest"))!.timestamp) + 30n <
        quote.deadline,
      "Too little quote lifetime; obtain a fresh review",
    );
    const approved = [...quote];
    report.quote = approved;
    save();
    const before = await ethers.provider.getBalance(merchant.address, "latest");
    const payment = await contract.connect(payer).getFunction("payInvoice")(
      approved,
      { value: quote.amountTinybars * 10n ** 10n },
    );
    const receipt = await confirm(payment, "settle exact quote");
    const event = receipt.logs
      .map((log) => {
        try {
          return contract.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((log) => log?.name === "InvoiceSettled");
    assert(
      event &&
        event.args.invoiceId === 1n &&
        event.args.payer === payer.address &&
        event.args.amountTinybars === quote.amountTinybars &&
        event.args.roundId === quote.roundId,
    );
    assert.equal(
      (await contract.getInvoice(1n, { blockTag: receipt.blockNumber }))[2],
      3n,
    );
    const settlement = await contract.getSettlement(1n, {
      blockTag: receipt.blockNumber,
    });
    assert.equal(settlement[0], payer.address);
    assert.equal(settlement[1], quote.amountTinybars);
    assert.equal(settlement[2], quote.roundId);
    const after = await ethers.provider.getBalance(
      merchant.address,
      receipt.blockNumber,
    );
    assert.equal(after - before, quote.amountTinybars * 10n ** 10n);
    report.merchantDeltaWeibars = after - before;
    await confirm(
      await contract.createInvoice(125n, block.timestamp + 3600),
      "create cancellation invoice",
    );
    const cancelled = await confirm(
      await contract.cancelInvoice(2n),
      "cancel unpaid invoice",
    );
    assert.equal(
      (await contract.getInvoice(2n, { blockTag: cancelled.blockNumber }))[2],
      2n,
    );
    assert(
      cancelled.logs.some((log) => {
        try {
          const event = contract.interface.parseLog(log);
          return (
            event?.name === "InvoiceCancelled" && event.args.invoiceId === 2n
          );
        } catch {
          return false;
        }
      }),
    );
    report.status = "passed";
    save();
    console.log(`CLI testnet evidence: ${output}`);
  } catch (error) {
    report.status = "failed";
    // Do not serialize provider errors: signed raw transactions may contain sensitive context.
    report.blocker =
      error instanceof Error
        ? error.message.split(" (")[0].slice(0, 200)
        : "Testnet check failed";
    save();
    console.error(
      `CLI gate failed; inspect ${output}. No browser signing permitted.`,
    );
    process.exitCode = 1;
  }
}
void main();
