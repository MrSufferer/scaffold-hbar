# Compare DeFi and bridge template opportunities

Parent: [Choose a durable Hedera developer template](../map.md)
Labels: wayfinder:research
Type: research
Status: resolved
Assignee: kyler (research agent inspect_planning)
Blocked by: none

## Question

Which narrow DeFi or cross-chain use case provides reusable developer value with manageable maintenance? Compare at least two candidates; verify deployments, existing examples and operational risks using primary sources and local skills.

## Answer

Within an eight-hour, one-maintainer budget, the strongest DeFi slice is an HTS swap-readiness flow with a real quote and meaningful testnet association, gated immediately on available testnet liquidity before promising swap execution. Axelar has a directly reusable first-party Hedera workshop, but a basic message demo duplicates existing bridge coverage. Reject CCIP native-token bridge onboarding and recurring cross-chain strategies for this effort: dual-chain pool setup, permissions and asynchronous recovery exceed the useful slice.

Verified SaucerSwap testnet quoter/router/token entities through Mirror Node; verified current Axelar testnet deployment configuration and CCIP Hedera testnet directory. No quote simulation, signed transaction or bridge delivery was performed.

Findings: [DeFi and bridge opportunities](../research/defi-bridges.md). Context branch: `research/defi-bridges` (parent captures this artifact).
