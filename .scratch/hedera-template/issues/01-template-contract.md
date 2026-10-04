# Establish the template contract and existing coverage

Parent: [Choose a durable Hedera developer template](../map.md)
Labels: wayfinder:research
Type: research
Status: resolved
Assignee: template_research
Blocked by: none

## Question

Which current scaffold-hbar requirements and built-in templates constrain a useful external template? Verify the bounty gate, manifest contract, existing coverage and reproducibility requirements.

## Answer

Answered 2026-10-04 by template_research. Use a narrow external template with a real testnet transaction and independently passing fresh-scaffold install/lint/build/boot. The runtime manifest requires `name`; package-manager values are `yarn`, `npm`, or `none`, conflicting with the docs' pnpm example. Existing templates already cover oracle adapters, x402 downloads, NFT subscriptions, schedulers, bridges and cross-chain investment.

Context: [Template contract research](../research/template-contract.md). Research branch: `research/template-contract` (captured by parent after this resolution). Published CLI validation remains implementation work, not a completed result.
