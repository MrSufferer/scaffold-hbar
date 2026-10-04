import assert from "node:assert/strict";
import test from "node:test";
import { validateManifest } from "../validate-template.mjs";
// The CLI removes the source manifest; generated tests use an independent fixture.
const manifest = () => ({
  name: "hbar-invoices",
  description:
    "USD-reference HBAR invoice developer template for Hedera testnet",
  version: "0.1.0",
  "create-scaffold-hbar": {
    capabilities: {
      frontend: ["nextjs-app"],
      solidityFramework: ["hardhat"],
      packageManager: ["npm"],
    },
    defaults: {
      frontend: "nextjs-app",
      solidityFramework: "hardhat",
      packageManager: "npm",
    },
    requirements: { node: "24.10.0" },
    outro: {
      sections: [
        {
          title: "Start here",
          steps: [
            {
              command: "{run:dev}",
              text: "Open /setup for Hedera testnet prerequisites. No invoice deployment is included in the baseline.",
            },
            {
              command: "{run:verify:template}",
              text: "Run the clean external-template gate; see README for candidate-ref verification.",
            },
          ],
        },
      ],
    },
  },
});
test("rejects missing name even though external prompt fallback is permissive", () => {
  const invalid = manifest();
  delete invalid.name;
  assert.throws(() => validateManifest(invalid), /name/);
});
test("accepts the documented single combination", () => {
  assert.equal(validateManifest(manifest()).name, "hbar-invoices");
});
test("rejects defaults outside capabilities and extra advertised combinations", () => {
  const wrongDefault = manifest();
  wrongDefault["create-scaffold-hbar"].defaults.packageManager = "yar" + "n"; // Preserve the negative case through CLI package-manager rewrites.
  assert.throws(
    () => validateManifest(wrongDefault),
    /defaults.packageManager/,
  );
  const matrix = manifest();
  matrix["create-scaffold-hbar"].capabilities.solidityFramework.push("foundry");
  assert.throws(
    () => validateManifest(matrix),
    /capabilities.solidityFramework/,
  );
});
