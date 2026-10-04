# Payments and oracle opportunities

Research date: 2026-10-04. Scope: one builder, eight total implementation hours, sole maintainer. Research branch pointer: `research/payments-oracles` (parent session captures this artifact). This is a decision report, not tested implementation.

## Recommendation

Choose **USD-reference HBAR invoice checkout** using **one Chainlink HBAR/USD feed**, conditional on a short live-read feasibility gate. A merchant creates an invoice with USD cents, recipient, identifier, and expiry; the buyer pays HBAR priced from a specified oracle round; the contract rejects altered, expired, underpaid, or already-paid invoices. The template teaches a useful application beyond a generic oracle dashboard. Removing the oracle removes the reference-price settlement behavior.

This is the best of the three candidates below for an eight-hour budget, not a prediction of winning. Use a single merchant, a single payment asset, one oracle, one contract, and a create/pay/receipt interface. Do not add HTS receipt NFTs, HCS logging, x402, subscriptions, refunds, or multi-provider fallback merely to increase service count. Solidity on Hedera qualifies as a service; its native depth is less distinctive than an HTS/HCS composition, a deliberate scope tradeoff. The bounty rewards essential integrations and readable reusable code, not novelty alone. [Bounty brief](https://hedera.com/blog/scaffold-hbar-template-bounty/)

## Candidate comparison

| Candidate | Essential integration and reuse | Eight-hour assessment | Decision |
| --- | --- | --- | --- |
| USD-reference HBAR invoice checkout | Chainlink determines payment conversion; reusable invoice identity, expiry, replay prevention, integer conversion, receipt | Narrow enough if existing scaffold wallet works and first live read succeeds; substantial financial correctness and unit-boundary work | Select with feasibility gate |
| x402 paid API with HCS settlement receipts | Facilitator makes HTTP settlement possible; HCS can provide independently inspectable usage history | Multiple services, signing paths, facilitator configuration and retry semantics; generic paywall duplicates official starter | Reject for this effort |
| Oracle-backed treasury threshold monitor | Oracle makes HBAR valuation meaningful, HCS records threshold observations | Simple monitoring is achievable, but HCS audit trail is auxiliary and price dashboard duplicates existing educational examples | Reserve only if checkout feasibility fails; weaker reusable capability |

Existing official material already includes a complete Hedera x402 facilitator/resource-server/client starter. The published x402 bounty winners also cover metered sessions/refunds and native atomic payment splitting. These are strong signs that a basic paid API or usage ledger has limited differentiation. [Official starter](https://github.com/hedera-dev/x402-hedera), [published winners](https://hedera.com/blog/x402-bounty-on-hedera-winners-announced/)

Existing tutorials cover fetching Chainlink prices and Supra pull proofs. The proposed differentiation is the invoice state transition and safe payment behavior, not another adapter. No exhaustive competition survey was performed. [Chainlink tutorial](https://github.com/hedera-dev/tutorial-js-chainlink-price-feeds), [Supra tutorial](https://github.com/hedera-dev/tutorial-js-supra-oracle-contract-pull)

## Deployment and liveness evidence

Chainlink's reference directory returned these HBAR/USD records during research:

| Network | Proxy | Decimals | Heartbeat | Deviation threshold |
| --- | --- | --- | --- | --- |
| Hedera testnet | `0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a` | 8 | 86400 seconds | 0.5% |
| Hedera mainnet | `0xAF685FB45C12b92b5054ccb9313e135525F9b5d5` | 8 | 86400 seconds | 0.5% |

Sources: [testnet directory](https://reference-data-directory.vercel.app/feeds-hedera-testnet.json), [mainnet directory](https://reference-data-directory.vercel.app/feeds-hedera-mainnet.json). The testnet address is independently present in the [Hedera developer tutorial](https://github.com/hedera-dev/tutorial-js-chainlink-price-feeds). [Chainlink's mainnet feed page](https://data.chain.link/feeds/hedera/hedera/hbar-usd) identifies the product as an HBAR/USD reference price.

A GET to the [testnet mirror contract record](https://testnet.mirrornode.hedera.com/api/v1/contracts/0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a) returned contract `0.0.4870176`, matching EVM address, nonempty bytecode, and `deleted: false`. This verifies a registered deployment, **not a currently updating feed**. Both `eth_getCode` and `eth_call latestRoundData()` against `https://testnet.hashio.io/api` returned HTTP 403 from this environment. A successful latest-round read remains an implementation prerequisite.

A 24-hour heartbeat means a 60-second max-age policy could reject healthy reference rounds for much of the day. Do not describe this as a continuously fresh spot quote. Show source age and chosen policy; round binding prevents a different round being silently used at execution, but does not eliminate market movement between oracle observations. Production tolerance is a merchant policy, not a fact established by this research. Never quietly widen a freshness bound to make a demo pass.

## Why not Pyth or Supra for this scope

Pyth lists Hedera mainnet and testnet deployments, but its current docs flag an August 26, 2026 Core upgrade and list Hedera among chains not upgraded. The fetched documentation now uses authenticated Hermes endpoints. That introduces migration/version/endpoint verification work beyond the local skill's older no-key sketch. A pull model could be a good later iteration because update data and freshness can be handled together, but it is a weaker eight-hour default without a successful update smoke test. [Pyth EVM contracts](https://docs.pyth.network/price-feeds/core/contract-addresses/evm), [current update fetching](https://docs.pyth.network/price-feeds/core/fetch-price-updates)

Supra explicitly lists Hedera testnet push contract `0x6Cd59830AAD978446e6cc7f6cc173aF7656Fb917`, hourly updates and a 5% deviation threshold; mainnet is `0xD02cc7a670047b6b012556A88e275c685d25e0c9`, hourly / 0.5%. Those schedules do not justify second-level freshness expectations. The local skill also warns that Hedera pairs often use USDT. A USDT quotation must never be relabelled USD; pair presence and units need a live verification before choosing it. [Supra network directory](https://docs.supra.com/oracles/data-feeds/push-oracle/networks), [feed catalogue](https://docs.supra.com/oracles/data-feeds/data-feeds-index)

## Required implementation gate and boundaries

Within the first 30 minutes, obtain a live Chainlink testnet round, verify positive price, decimals, timestamp, identity and usable age, and prove a tiny HBAR payment path through the chosen wallet and contract. Do not spend the entire budget integrating first and leave this until the end. If the feed is unavailable, record that fact and reconsider the use case; mocks can test failure behavior but cannot be presented as live integration.

The minimum defensible design records invoice terms on-chain under the merchant's authority, then pays an existing invoice. This avoids inventing a signed-invoice authorization protocol. Scope still requires: integer-only conversion and rounding policy; explicit Hedera tinybar/Solidity/JSON-RPC unit tests; invalid/future/stale round rejection; invoice expiry; round-change handling; one successful settlement only; atomic recipient payment with revert on failure; reentrancy protection; and buyer-visible transaction evidence. Any permitted overpayment must be handled explicitly; do not silently keep it. Product/UI choices and contract design remain subsequent decision-ticket work.

Reserve roughly 1 hour for scaffolding/live integration, 2 hours for contract and meaningful boundary tests, 2 hours for create/pay/receipt interface, and 3 hours for documentation, fresh-scaffold validation, transaction evidence and buffer. This is an estimate assuming familiar tools and available funded testnet credentials, not a verified completion guarantee.

## Skills and documentation process

Read local `research`, `x402-payments`, `chainlink-data-feeds`, `pyth-price-feeds`, `supra-push-oracle`, `hedera-token-service`, and `hedera-consensus-service` skills. HTS association and HCS mirror/indexing overhead made them poor additions to this narrow version.

Used Context7 library resolution then docs for Pyth and Chainlink. Pyth docs confirmed authenticated update fetching and freshness behavior. Chainlink Context7 results did not answer feed deployment; primary reference-directory JSON, developer tutorial and Mirror Node were used instead. No quota errors occurred. Web sources and direct primary API reads supplemented library documentation. No deployment, funded transaction, account changes or messages to third parties were performed.
