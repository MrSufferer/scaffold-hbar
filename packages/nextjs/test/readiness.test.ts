import assert from "node:assert/strict";
import test from "node:test";
import { setupReadiness } from "../lib/setup.ts";

test("missing credentials give setup guidance without claiming a deployment", () => {
  const readiness = setupReadiness({});
  assert.equal(readiness.status, "Configuration needed");
  assert.equal(readiness.contract, "No invoice contract configured");
  assert.equal(readiness.network, "Hedera testnet");
  assert.equal(readiness.liveVerified, false);
});

test("configured values remain unverified and credential-bearing RPC URLs are rejected", () => {
  const contract = "0x" + "1".repeat(40);
  const configured = setupReadiness({ NEXT_PUBLIC_INVOICE_CONTRACT: contract });
  assert.equal(configured.status, "Configuration supplied — unverified");
  assert.equal(configured.liveVerified, false);
  const privateRpc = setupReadiness({
    NEXT_PUBLIC_INVOICE_CONTRACT: contract,
    NEXT_PUBLIC_HEDERA_RPC_URL: "https://user:password@example.com",
  });
  assert.equal(privateRpc.status, "Configuration needed");
  assert(!privateRpc.rpc.includes("password"));
  assert.equal(
    setupReadiness({ NEXT_PUBLIC_INVOICE_CONTRACT: "0x" + "0".repeat(40) })
      .contract,
    "No invoice contract configured",
  );
});
