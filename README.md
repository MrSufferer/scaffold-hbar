# HBAR Invoices

An MIT external scaffold-hbar template for USD-reference invoices paid in HBAR on Hedera testnet. This first slice delivers a runnable development foundation and a repeatable clean-generation gate. Invoice creation, quoting, payment and wallet integration follow in subsequent slices; no deployment or live settlement is claimed here.

## Supported stack

Use **Node 24.10.0 and npm 11.6.1**, Next.js 15.5.27 / React 19.2.3, Hardhat 2.22.19 / ethers 6.14.0, and Solidity 0.8.28. Only Next.js + Hardhat + npm is supported. Run `nvm use` if you use nvm. Direct dependencies and package-lock.json are pinned; use `npm ci`. See [baseline provenance](docs/baseline.md) and [brand guidelines](brand.md).

## Generate and run

Prerequisites: Git with user.name and user.email configured, the pinned Node/npm versions, public GitHub/npm access, and available disk space. No Foundry, wallet, secrets or funds are needed for local checks.

```sh
npm create scaffold-hbar@latest -- hbar-invoices --template MrSufferer/scaffold-hbar --frontend nextjs-app --solidity-framework hardhat --package-manager npm --network testnet --skip-install --skip-hedera-skills --yes
cd hbar-invoices
npm ci
npm run format
npm run check-types
npm test
npm run lint
npm run build
npm run start
```

Open http://localhost:3000 and http://localhost:3000/setup. Both should explain Hedera testnet and report **Configuration needed** with no private settings. `npm run dev` starts development mode. `npm run start` serves the production build. Stopping either process uses Ctrl+C.

The CLI intentionally removes `template.json` from the generated project. Do not restore it or require it in generated checks. It also sets packageManager metadata and rewrites workspace text/scripts for npm. The gate validates retained commands and the actual generated lockfile rather than trusting a source-checkout build.

## Private configuration and testnet

The default public testnet RPC is https://testnet.hashio.io/api; availability is not guaranteed. `/setup` displays the selected endpoint, chain ID 296 and the public contract address when configured. An address is **unverified configuration**, not proof of code, merchant identity, feed validity or deployment. Local Hardhat uses chain ID 31337 and proves neither Hedera value-unit semantics nor live settlement.

After invoice deployment exists, copy [the frontend example](packages/nextjs/.env.example) to `packages/nextjs/.env.local` privately and supply public configuration. Restart/rebuild Next.js after changing NEXT_PUBLIC values. Never put keys, credential-bearing RPC URLs or secrets in NEXT_PUBLIC settings. Runtime dotenv files are ignored and excluded from source-template packaging, even when empty. The existing root example is for private maintainer prerequisites and is not needed by this baseline.

A future real checkout needs separate merchant and payer MetaMask accounts connected to Hedera testnet, test HBAR funding, an available RPC, the deployed invoice contract and a verified HBAR/USD feed. The local operability probe is not an invoice contract. No deploy command or default private key is provided in this slice.

## Reusable template gate

Run from an installed source or generated project:

```sh
npm run verify:template -- --report /tmp/hbar-invoices-public/report.json
```

The default gate exercises the public **default-ref** external-template path with the published `@latest` CLI. It exports the public source revision, independently validates its manifest against the schema extracted from the locked npm CLI release, audits packaging, generates into a clean temporary directory, installs with `npm ci`, runs formatting/typechecks/tests/lint/build, boots production and checks `/` and `/setup` for expected configuration guidance. Author dependencies, build output and dotenv files are never the input. Temporary projects and process groups are cleaned up; stage logs and JSON reports remain next to the chosen report.

For a published candidate branch or commit:

```sh
npm run verify:template -- --ref YOUR_PUBLIC_REF --report /tmp/hbar-invoices-candidate/report.json
```

For a committed candidate before publication:

```sh
npm run verify:template -- --local --ref HEAD --report /tmp/hbar-invoices-local/report.json
```

Local mode exports only tracked files from the committed revision, then uses the published CLI's local-source seam. It is explicitly reported as **local-candidate**, and cannot satisfy public generation or final eligibility. Uncommitted changes are excluded. Public candidate runs resolve and generate a specific source commit; the default-ref gate also rejects a branch that moves during verification. Generated baseline tests must not assume a manifest is present.

Reports record source ref/commit, date, CLI/Node/npm versions, commands and per-stage outcomes. A failed command fails the gate; later commands are not-run, never success. Tests exercise missing-name and inconsistent-manifest rejection and a real generated-command failure. A CLI update beyond 0.4.1 deliberately fails until the schema adapter/pin is reviewed. Reports are operability evidence, separate from real testnet evidence and the final eligibility audit. See [verification evidence](docs/verification/README.md).

## Troubleshooting and extension

- An engine error: use the exact Node/npm pins; do not bypass engine checks.
- A failed source-manifest stage: fix template.json in the source repo. Prompt fallback is not validation.
- A failed install/build: read the matching stage log. A started process alone cannot pass the gate.
- A setup warning: supply a public HTTPS RPC and, after deployment, a nonzero EVM contract address. Neither setting verifies live readiness.
- An RPC error or unavailable funding: resolve testnet prerequisites before wallet submission. Local checks remain usable.

Keep the contracts in packages/hardhat and frontend in packages/nextjs. Reuse this gate after every invoice slice. The agreed application uses a load-bearing HBAR/USD oracle: removing it would change the invoice's USD-reference pricing purpose. Later lifecycle, exact quote approval, atomic delivery and transaction recovery must remain contract-authoritative. This educational template has no mainnet, production-security, fulfillment or bounty-eligibility guarantee.
