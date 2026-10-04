# DeFi and bridge opportunities for an eight-hour template

Researched 2026-10-04. Constraint: one builder and sole maintainer, eight hours. These are planning judgments, not measured implementation times. Existing scaffold templates reportedly already cover bridges, cross-chain DCA, scheduling and oracles; differentiation must come from a specific developer problem.

## Recommendation

Choose a **single-chain HTS swap-readiness flow** if the map selects DeFi: a live quote, clearly explained recipient association and spending permission, then a deliberately bounded testnet action. Do not select a new bridge, recurring trading engine or liquidity-management product for this budget. A focused oracle-enforced checkout may be an even cleaner overall choice; this investigation does not compare its implementation directly.

| Candidate | Distinct developer value | Eight-hour judgment |
| --- | --- | --- |
| HTS swap-readiness and quote workbench | Shows where an Ethereum-style token swap fails on Hedera: association, decimals, allowance, network and stale quotes | Best DeFi candidate; achievable with one pair and one wallet flow, provided a liquid testnet route is verified immediately |
| Axelar cross-chain command receipt | Send one allowlisted command to a Hedera receiver and expose asynchronous delivery state | Technically possible using first-party workshop, but overlaps existing bridge examples and consumes time on two networks |
| CCIP native-token bridge onboarding | Registers a token/pool and demonstrates real HTS recipient readiness | Reject: two-chain pool administration and evolving protocol configuration overwhelm the useful eight-hour slice |

## Verified DeFi foundation

SaucerSwap's canonical deployment page lists testnet QuoterV2 `0.0.1390002`, V2 router `0.0.1414040`, WHBAR token `0.0.15058`, and SAUCE `0.0.1183558`. Its mainnet equivalents are listed separately; deprecated deployments must not be silently reused. [Canonical deployments](https://docs.saucerswap.finance/developers/contracts).

Read-only network verification during this investigation returned HTTP 200 and `deleted: false` for the [testnet quoter](https://testnet.mirrornode.hedera.com/api/v1/contracts/0.0.1390002), [router](https://testnet.mirrornode.hedera.com/api/v1/contracts/0.0.1414040), and [SAUCE token](https://testnet.mirrornode.hedera.com/api/v1/tokens/0.0.1183558). SAUCE reports six decimals. **This confirms entities exist, not available liquidity or executable swaps.** No signed transactions or quote simulation were performed.

Official examples support gas-free `quoteExactInput`/`quoteExactOutput` via JSON-RPC or Mirror Node contract simulation. They explain fee-encoded paths, smallest-unit amounts, WHBAR in the path, and reversed exact-output routes. Public Mirror Nodes have global rate limits. [V2 quote reference](https://docs.saucerswap.finance/developers/v2/swap/swap-quote).

A valuable minimal native action is explicitly associating the connected testnet account with the output token, with before/after state and the resulting transaction link. Hedera's wallet integration tutorial demonstrates direct token-facade association for EVM wallets. Association prepares receipt; it must not be described as executing a trade. [Hedera wallet tutorial](https://hedera.com/blog/develop-a-hedera-dapp-with-metamask-hashpack-and-blade-integration/).

Suggested hard scope: one selected pair, exact-input quotes, integer amount conversion, finite approval, association, visible network, freshness timestamp, and error handling. Mainnet read-only quotes and testnet writes must be explicitly distinguished; never imply they describe one executable route. Prefer same-testnet quotes and execution if a smoke test proves liquidity. Make the swap itself required only after that gate passes. A disconnected mainnet-price dashboard plus unrelated testnet button is weaker developer value.

First 30-minute gate: prove quote simulation for the intended testnet pair and confirm source tokens are obtainable. If it fails, retain association as an honest readiness tutorial or select the checkout candidate; do not spend the session provisioning pools. Reserve approximately two hours for reproducible setup, meaningful failure tests, README and demo. These allocations are planning estimates.

## Axelar alternative

Axelar maintains a Hedera workshop containing GMP receiver/deploy/send/read examples and ITS examples. It demonstrates Avalanche Fuji to Hedera testnet, requires funded wallets on both networks, and includes Hedera-specific token caveats. This is a strong starting point but also a novelty baseline: merely wrapping its hello-world flow would add little. [First-party workshop](https://github.com/axelarnetwork/axelar-hedera-workshop-bridging-101).

The current first-party testnet configuration lists Hedera gateway `0xe432150cce91c13a887f7D836923d5597adD8E31` and gas service `0xbE406F0189A0B4cf3A05C286473D23791Dd44Cc6`. These were read directly; relayer delivery was not tested. [Axelar deployment registry](https://raw.githubusercontent.com/axelarnetwork/axelar-contract-deployments/main/axelar-chains-config/info/testnet.json).

If selected later, limit to one message route and an allowlisted receiver, with pending/delivered/failed states. Exclude asset custody, swaps and schedules. Local `axelar-gmp` guidance supports keeping transport separate from destination logic and authenticating source chain/address. Its suggested gas-before-gateway pattern is one pattern, not a universal prohibition: the official workshop also shows source-call then additional gas funding.

## CCIP alternative

Hedera testnet is present in the official directory with selector `222782988166878823`, HBAR fee support and outbound EVM lanes shown at version `2.0.0`. Treat older local snippets as conceptual guidance until version compatibility is checked. [Hedera testnet directory](https://docs.chain.link/ccip/directory/testnet/chain/hedera-testnet).

The current token issuer guide requires choosing custody semantics, deploying pools per chain, assigning token permissions, registering administration and configuring remote pools. Incorrect decimals can permanently mis-scale amounts. The verification guide requires checking registration, roles and both directions of remote wiring. These are material operational responsibilities for a sole maintainer. [Issuer guide](https://docs.chain.link/ccip/concepts/cross-chain-token/token-issuer-guide), [configuration verification](https://docs.chain.link/ccip/tools/sdk/guides/cct/reference/verify-your-setup).

Local `ccip` guidance adds HTS wrapper, association and dual-approval concerns. Specific custom wrapper compatibility was not independently verified here, so no custom HTS CCT deployment is recommended.

## Skills and documentation provenance

Read local `research`, `hts-system-contract`, `hss-system-contract`, `axelar-gmp` and `ccip`. HSS is unnecessary for the recommended slice; recurring execution would add payer funding, capacity and recovery decisions without solving readiness.

Context7 commands used: one `library` query for SaucerSwap followed by two distinct `docs` queries (deployments; quoting/association). Selected `/websites/saucerswap_finance`. Older indexed URLs were followed to the current official pages above. No credentials, paid services or writes to a chain were needed.

Context pointer: `.scratch/hedera-template/research/defi-bridges.md`, to be captured by the parent on `research/defi-bridges`. Remaining decision belongs to the use-case selection ticket; this report resolves feasibility comparison only.
