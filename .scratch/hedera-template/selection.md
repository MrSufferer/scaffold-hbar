# Selected direction: USD-reference invoices paid in HBAR

## Decision

Choose a single-merchant invoice checkout whose amount is denominated in USD and settled in HBAR using a Chainlink reference price. One builder has eight hours and will maintain it alone. The user explicitly delegated selection after comparison. This is a selected direction, not a completed implementation specification or proof of eligibility.

## Comparison

| Candidate | Reusable value | Eight-hour and maintenance fit | Decision |
| --- | --- | --- | --- |
| Oracle-priced HBAR invoice checkout | Invoice lifecycle, checked conversion, single settlement and receipt | One chain, one feed, one contract; rounding and feed liveness need focused tests | Selected |
| SaucerSwap quote and swap readiness | HTS association, allowance and executable quote workflow | Liquidity, routing and wallet behavior add integration uncertainty | Runner-up |
| x402 paid resource | Machine-readable payment and resource access | Existing starter already covers the basic workflow; facilitator adds another service | Reject for this budget |
| Cross-chain payment or treasury | Meaningful interoperability | Two networks, configuration and asynchronous recovery exceed the budget | Reject |

These are comparative engineering judgments, not predicted judging scores. Existing built-ins make generic oracle dashboards and paywalls weak differentiation. See [template coverage](research/template-contract.md), [payments research](research/payments-oracles.md) and [DeFi research](research/defi-bridges.md).

## Smallest useful product

One merchant creates an invoice. A payer sees its amount, HBAR quote, feed timestamp and expiry; settles it once; then sees a transaction-linked receipt. The Chainlink price must actually determine settlement, not merely decorate a dashboard. A reusable invoice state machine and explicit error behavior distinguish it from the existing oracle template.

Proposed boundaries: one Hedera testnet, one HBAR/USD feed, one wallet path, one Solidity contract, one frontend, one supported framework/package-manager combination. No subscriptions, multi-merchant onboarding, HTS rewards, HCS duplication, fiat processing, cross-chain settlement, indexer or extra oracle providers in the first slice. Native-service-depth score may be lower than a larger composition; preserve correctness and documentation instead of adding ceremonial calls.

## Feasibility gate

Reserve the first 30 minutes of implementation to confirm the published Chainlink testnet proxy has code and returns a valid positive HBAR/USD round through the actual chosen RPC. Check the feed timestamp and documented heartbeat, and set an explicit freshness policy suitable for this demonstration. The published heartbeat is 24 hours: this is a reference-price payment example, not a promise of real-time spot conversion. A fresh live read has not yet been established by this research.

If the feed cannot meet the chosen freshness policy, stop the invoice implementation and revisit the runner-up; do not silently substitute mocks, mislabel USDT as USD, or expand tolerance just to pass. Local mocks are appropriate for failure tests but not live integration proof.

## Proposed eight-hour envelope

| Elapsed time | Purpose |
| --- | --- |
| 0–0.5h | Feed/RPC feasibility, wallet/account prerequisites |
| 0.5–1.5h | Supported scaffold baseline and invoice interface |
| 1.5–3.5h | Contract lifecycle and meaningful failure/rounding tests |
| 3.5–5h | Create, quote, pay and receipt frontend |
| 5–6h | Testnet execution and transaction evidence |
| 6–8h | README/AGENTS, fresh scaffold install/lint/build/boot, repair buffer |

This is an estimate, not a delivery guarantee. Feed/account availability and reuse of a working wallet baseline are prerequisites. If behind, cut presentation and convenience features, not settlement checks or verification.

## Decisions still needed

Resolve [Define the core workflow and failure model](issues/04-scope-and-failure-model.md): invoice identifiers and states; merchant authorization; cancellation/expiry; whether settlement uses a bound feed round or current round plus payer cap; tinybar rounding; overpayment; transfer failure; and duplicate settlement. Avoid a bespoke signed-quote backend unless evidence demands it.

Then resolve [Define acceptance evidence and maintenance boundaries](issues/05-acceptance-and-maintenance.md): tests for stale/invalid data, denomination conversions, expiry, replay and transfers; source manifest versus generated output checks; actual testnet proof; pinned dependencies; and an honest maintenance/security scope. No claim of production readiness follows from an eight-hour template build.
