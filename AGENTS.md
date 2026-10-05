# HBAR Invoices agent guide

Implement the selected ticket within its scope. Read [README.md](README.md) for setup and [docs/baseline.md](docs/baseline.md) for supported-stack provenance. Node 24.10.0, npm 11.6.1 and Hedera testnet are the only tested configuration. Keep the two workspaces and exact dependency pins; commit package-lock.json with dependency changes.

## Verification

Use the scripts in package.json for typechecks, tests, lint and build. After a committed change, run `npm run verify:template -- --local --ref HEAD --report /tmp/hbar-invoices-local/report.json`. After publication, run `npm run verify:template -- --ref YOUR_PUBLIC_REF --report /tmp/hbar-invoices-candidate/report.json`. Final operability evidence also requires `npm run verify:template` against the public default ref. Read per-stage logs when a gate fails; skipped work cannot pass.

Validate template.json in the source. Generated projects intentionally omit it. Keep source eligibility, generated operability and real MetaMask testnet settlement evidence separate. The creation/read/cancellation browser journey uses a disposable local EVM and simulated wallet; supplied configuration must never be called a verified deployment or payment.

## Boundaries

For deployment, merchant creation, invoice inspection, cancellation or changes to these flows, read [the walkthrough and contract boundary](docs/invoice-creation.md). The frontend deployment artifact must match compiled Solidity; regenerate it with `npm run contract:export` after a contract change. Invoice links retain their original chain/contract/ID, and creation hashes remain pending until a confirmed event identifies the invoice. Cancellation confirmation requires the matching event from the original contract and invoice; pending cancellation survives reload and blocks retries until reconciled. Expiry is time-derived; cancellation remains final after expiry. This deployment cannot accept payment.

Local Hardhat checks need no secrets, funded wallets, oracle timing or live RPC. Native-value conversion and settlement need later Hedera tests. Public frontend configuration contains public values only; private deployment settings belong in ignored local files. Source packaging must exclude all runtime dotenv files, even empty ones, along with dependencies and build artifacts.

When extending invoice behavior, preserve merchant-only administration, immutable deployment identity, contract-derived quotes, explicit exact round-bound approval, atomic payment and honest unknown-outcome recovery. Use [GLOSSARY.md](GLOSSARY.md) if present for domain terms and [brand.md](brand.md) for UI tokens and tone.
