import assert from "node:assert/strict";
import { ethers } from "hardhat";

describe("Generated contract workspace", () => {
  it("compiles and executes a local contract without a funded wallet or RPC", async () => {
    const probe = await (await ethers.getContractFactory("TemplateProbe")).deploy();
    await probe.waitForDeployment();
    assert.equal(await probe.getFunction("purpose")(), "HBAR Invoices: local baseline only");
  });
});
