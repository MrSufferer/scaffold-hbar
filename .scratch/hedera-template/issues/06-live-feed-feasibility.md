# Verify live invoice integration prerequisites

Parent: [Choose a durable Hedera developer template](../map.md)
Labels: wayfinder:task
Type: task
Status: claimed
Assignee: MrSufferer
Blocked by: 01, 02, 03

## Question

Obtain a current testnet Chainlink HBAR/USD round using an accessible RPC or Mirror Node simulation, record price/decimals/timestamp/round and verify the published proxy. Check funded testnet account and supported wallet availability without recording secrets. This task unblocks whether invoice settlement is a practical design; it does not authorize deploying or sending payments during charting.

Time-box investigation to 30 minutes in the next session. Do not widen a freshness policy simply to accept a stale feed. If unavailable, record evidence and reopen the selected direction; the runner-up also requires a real quote/liquidity check. A published address alone does not resolve this ticket.

## Progress

Live-read progress (2026-10-04 10:17 UTC):

- Mirror Node `POST /api/v1/contracts/call` against the published Chainlink proxy successfully returned `latestRoundData()`.
- Answer: 10204181 (0.10204181 USD/HBAR using the published 8 decimals).
- Updated at: 2026-10-04 08:31:22 UTC, approximately 1h46m before the check.
- `answeredInRound` equals `roundId`; answer is positive.
- Hashio JSON-RPC continues to return HTTP 403 in this environment.

This proves a live readable round, not a wallet transaction or successful payment. Ticket remains open pending wallet/funded-account availability and the chosen freshness policy. No secrets or signed transactions were used.

## Recheck

[Live prerequisite evidence](../research/live-invoice-prerequisites.md) records the 2026-10-04 10:23 UTC read, including on-chain decimals and description, exact round fields and Hashio HTTP 403. Wallet and funded-account availability are still pending; freshness policy belongs to the core workflow decision.
