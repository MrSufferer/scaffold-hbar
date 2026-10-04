# Compare payments and oracle template opportunities

Parent: [Choose a durable Hedera developer template](../map.md)
Labels: wayfinder:research
Type: research
Status: resolved
Assignee: payments_research
Blocked by: none

## Question

Which narrow payments or oracle-backed use case provides useful ecosystem integration and meaningful Hedera depth? Compare at least two candidates; verify deployments and limits with primary sources and local Hedera skills.

## Answer

Resolved 2026-10-04.

Recommend a narrow USD-reference HBAR invoice checkout using Chainlink HBAR/USD, conditional on a successful initial live-read gate. Published testnet address and mirror deployment verified; live round freshness is unverified because Hashio RPC returned 403. The documented 24-hour heartbeat must shape freshness policy. Reject generic x402 and oracle dashboards as crowded patterns; defer Pyth upgrade/API-key work and Supra USDT ambiguity.

Asset: [Payments and oracle research](../research/payments-oracles.md). Context branch: `research/payments-oracles` (captured by parent session). This resolves candidate research, not contract/product design.

Selection synthesis under the user’s delegated authority: [Selected direction and comparison](../selection.md).
