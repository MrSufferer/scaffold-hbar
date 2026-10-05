import { readFileSync, writeFileSync } from "node:fs";
const artifact = JSON.parse(
  readFileSync(
    new URL(
      "../packages/hardhat/artifacts/contracts/Invoices.sol/Invoices.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const output =
  JSON.stringify({ abi: artifact.abi, bytecode: artifact.bytecode }, null, 2) +
  "\n";
const target = new URL(
  "../packages/nextjs/lib/invoice-artifact.json",
  import.meta.url,
);
if (process.argv.includes("--check")) {
  if (readFileSync(target, "utf8") !== output)
    throw new Error("Invoice artifact is stale: npm run contract:export");
} else writeFileSync(target, output);
