# Scaffold-HBAR external template contract

Researched 2026-10-04. Decision input for an eight-hour build, not evidence that a template already passes.

## Eligibility floor

The bounty requires a public, original MIT repository; contracts and frontend under `packages/`; Next.js plus Hardhat or Foundry; npm or Yarn workspaces; Node >=20.18.3; valid `template.json`; README and AGENTS; and real HTS, HCS, HSS, or Hedera Solidity usage. Supply a verifiable testnet transaction through Hashscan or mirror-node evidence. A fresh `npm create scaffold-hbar@latest -- --template owner/repo` must install, lint, build, boot, and return successful core routes. Commit neither secrets nor `.env`. Harness users also submit their spec and validators. The dev-ex survey is part of submission. The announced deadline is October 4, 2026, 11:59 PM ET.

Scoring: ecosystem value 35, documentation 30, code 20, native service depth 15. Read-only or forked-mainnet protocol integration is permitted when testnet is unavailable. A familiar useful pattern is acceptable; novelty is not mandatory. These requirements are stricter than general scaffold documentation. [Bounty brief](https://hedera.com/blog/scaffold-hbar-template-bounty/)

## Existing coverage

The official registry already includes:

| Template | Existing focus |
| --- | --- |
| blank | Baseline |
| hedera-demo | Native services without Solidity |
| payments-scheduler | Scheduled payments |
| cross-chain-dca | Cross-chain recurring investment |
| bridge | Axelar, CCIP, LayerZero |
| oracles | Oracle-backed contracts |
| tokenize-subscriptions | HTS NFT subscriptions |
| x402-pay-per-use | Paid downloads |

Therefore a plain oracle dashboard, token demo, bridge demo, subscription NFT, or paid-file API is weak differentiation. This is an inference from coverage, not a claim that no community competitor exists. [CLI template registry](https://github.com/hedera-dev/create-scaffold-hbar/blob/main/src/utils/template-registry.ts)

The docs additionally feature a LayerZero cross-chain vault and SaucerSwap basket strategy. A second cross-chain investment starter would overlap it. [Official template guide](https://docs.hedera.com/solutions/tools/scaffold-hbar/index#external-templates)

## Manifest and scaffolding contract

The runtime schema requires a nonempty root `name`, although the documentation example omits it. Supported package-manager values are `yarn`, `npm`, and `none`; the documentation's `pnpm` example conflicts with current source. Prefer the runtime contract and test the published CLI before relying on it. A narrow manifest for one supported setup is:

```json
{
  "name": "hedera-use-case-template",
  "description": "A focused reusable Hedera workflow",
  "version": "0.1.0",
  "create-scaffold-hbar": {
    "capabilities": {
      "frontend": ["nextjs-app"],
      "solidityFramework": ["hardhat"],
      "packageManager": ["yarn"]
    },
    "defaults": {
      "frontend": "nextjs-app",
      "solidityFramework": "hardhat",
      "packageManager": "yarn"
    }
  }
}
```

Choose the framework that matches the reused baseline; the example is not a final stack decision. Optional schema fields support requirements, env descriptions, rename rules and structured outro steps. [Runtime manifest schema](https://github.com/hedera-dev/create-scaffold-hbar/blob/main/src/types.ts)

The CLI reads external capabilities from GitHub and falls back to permissive choices if fetching or parsing fails. This means a working prompt alone does not prove manifest validity. [Capability resolver](https://github.com/hedera-dev/create-scaffold-hbar/blob/main/src/utils/template-capabilities.ts)

Scaffolding removes `template.json` after processing it, removes unselected contract packages, and transforms Yarn scripts/text when npm is selected. Gate checks should require the manifest in the source repository, not the generated output. Test the exact generated project, because passing only in the source checkout misses these transformations. Limit advertised choices to combinations actually exercised. [Copy/transform implementation](https://github.com/hedera-dev/create-scaffold-hbar/blob/main/src/tasks/copy-template-files.ts)

External references support `owner/repo#branch`. For release evidence, record the CLI version and source commit; keep the mutable `@latest` command for the official gate. Harness recipe directories are preserved, and npm rewriting deliberately skips `.harness/`. [Template flow](https://github.com/hedera-dev/create-scaffold-hbar/blob/main/contributors/TEMPLATES.md)

## Eight-hour implications and candidate gaps

Recommendation: one end-to-end application pattern on one Hedera network, one load-bearing ecosystem integration, one contract framework, and one package manager. Reserve at least two hours for docs and a clean scaffold rehearsal. Avoid bridge relayers, multi-chain funding, multiple price providers, complex custody, and production indexing in the initial slice.

Promising gaps to compare against integration feasibility: oracle-priced invoices with a strict settlement lifecycle; HCS-verifiable document provenance backed by decentralized storage; an oracle-triggered escrow with deterministic refund paths. These are research hypotheses, not verified unique market niches. A price checkout must offer settlement/replay/refund semantics beyond the existing oracle adapter starter. The use-case investigation should choose one based on verified testnet support and the smallest useful complete workflow.

## Research limitations

Context7 searches for both `scaffold-hbar` and `create-scaffold-hbar` returned unrelated libraries. No valid matching library ID was available, so no unrelated `docs` query was issued. Findings above use official documentation and source, not recalled API behavior. Upstream `main` can differ from the npm release; a published-package scaffold rehearsal remains required during implementation. No scaffolding, deployment, or gate checks were executed in this research ticket.
