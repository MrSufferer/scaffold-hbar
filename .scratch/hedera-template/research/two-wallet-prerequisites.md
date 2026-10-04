# Two-wallet testnet prerequisite check

Ticket: [Confirm two funded MetaMask testnet signers](https://github.com/MrSufferer/scaffold-hbar/issues/11).

Status: resolved with human confirmation on October 4, 2026. Agent public checks ran at approximately 15:44–15:48 UTC. No signed transaction was submitted by the agent.

## Public observations

- The [Chainlink testnet directory](https://reference-data-directory.vercel.app/feeds-hedera-testnet.json) still identifies the HBAR / USD proxy as `0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a`, with eight decimals and a 86400-second heartbeat.
- Read-only calls through the [testnet Mirror Node contract simulation endpoint](https://testnet.mirrornode.hedera.com/api/v1/contracts/call) returned description `HBAR / USD`, eight decimals, round `18446744073709596739`, answer `10252972` (0.10252972 USD/HBAR), startedAt `2026-10-04T14:46:41Z`, updatedAt `2026-10-04T14:46:53Z`, and answeredInRound equal to roundId. The round was positive, complete, nonfuture and approximately 57 minutes old, within 24 hours. Simulation is feed-read evidence, not a usable wallet RPC or settlement proof.
- The [previously supplied account](https://testnet.mirrornode.hedera.com/api/v1/accounts/0.0.4689032) still resolves to `0xed37fd0d6f0f69236e7472b36796e133d20ecc32`, is not deleted, and reports 690.83891887 HBAR. Its returned balance timestamp remains `1774285715.670371000` (March 23, 2026), so this does not establish current spendable funding. Merchant versus payer role is unconfirmed.
- Hashio `eth_chainId` and `eth_getBalance` requests both returned HTTP 403. The [official network documentation](https://github.com/hashgraph/hedera-docs/blob/main/operators/json-rpc/index.mdx), fetched through Context7, identifies this endpoint and testnet chain ID 296; current chain identity could not be verified through a working relay.

## Human-confirmed signer prerequisites

- Merchant: `0.0.4689032` / `0xed37fd0d6f0f69236e7472b36796e133d20ecc32`; mapped locally to `HEDERA_FIRST_PRIVATE_KEY`.
- Payer: `0.0.10857996` / `0x00f5089ed5a3192ce8f8ceb6a9c72ae04cc5f794`; mapped locally to `HEDERA_SECOND_PRIVATE_KEY`.
- At 15:48 UTC, the testnet Mirror Node confirmed both supplied account/address pairs and reported neither deleted. The payer reported 1000 HBAR at balance timestamp `1791123131.150358104`; the merchant's older Mirror Node balance remains as described above.
- The human confirmed both wallets work in MetaMask and confirmed their balances, then confirmed the working wallet RPC as `https://testnet.hashio.io/api`, chain ID 296. This establishes the wallet-side connection and funding prerequisites by human confirmation. Agent-side Hashio requests remain HTTP 403; no successful agent RPC response is claimed.
- Exact invoice funding sufficiency must be checked against the actual quote and transaction fees before the later live settlement. No invoice amount or fee estimate exists yet in this checkout. Human-confirmed funding resolves signer readiness, rather than proving a future payment or deployment.

The root `.env.example` supplies configuration slots. Runtime `.env` files are ignored; credentials must remain local. No private key is required for these public checks. Recheck the feed and balances immediately before the later live journey.
