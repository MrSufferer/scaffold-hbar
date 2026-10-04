# Live invoice integration prerequisites

Checked: 2026-10-04 10:23:23 UTC. Ticket: [Verify live invoice integration prerequisites](https://github.com/MrSufferer/scaffold-hbar/issues/7).

## Feed identity and round

The [Chainlink testnet directory](https://reference-data-directory.vercel.app/feeds-hedera-testnet.json) lists HBAR / USD proxy `0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a`, decimals 8, heartbeat 86400 seconds and deviation threshold 0.5%. The [Mirror Node contract record](https://testnet.mirrornode.hedera.com/api/v1/contracts/0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a) reports matching EVM address, contract `0.0.4870176`, and `deleted: false`.

Read-only POST requests to `https://testnet.mirrornode.hedera.com/api/v1/contracts/call` used JSON `{ "to": "0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a", "data": "<selector>", "estimate": false }`.

| Call / field | Result |
| --- | --- |
| `description()` (`0x7284e416`) | `HBAR / USD` |
| `decimals()` (`0x313ce567`) | 8 |
| `latestRoundData()` (`0xfeaf968c`): roundId | 18446744073709596734 |
| answer | 10204181 = 0.10204181 USD/HBAR |
| startedAt | 1791102670 (2026-10-04 08:31:10 UTC) |
| updatedAt | 1791102682 (2026-10-04 08:31:22 UTC) |
| answeredInRound | 18446744073709596734 |
| Source age at round read | 6720 seconds (1 hour 52 minutes) |

Raw latestRoundData result:

```text
0x000000000000000000000000000000000000000000000001000000000000b03e00000000000000000000000000000000000000000000000000000000009bb415000000000000000000000000000000000000000000000000000000006ac20ece000000000000000000000000000000000000000000000000000000006ac20eda000000000000000000000000000000000000000000000001000000000000b03e
```

The answer is positive, updatedAt is nonzero and earlier than observation, and answeredInRound equals roundId. This verifies a readable complete reference round. No application freshness limit has been selected, so this is not a freshness-policy pass. The heartbeat describes publication cadence, not a merchant's acceptable settlement age. Keep that policy in [Define the core workflow and failure model](https://github.com/MrSufferer/scaffold-hbar/issues/5); do not widen it to accommodate this observation.

A separate `eth_chainId` POST to `https://testnet.hashio.io/api` returned HTTP 403. Mirror simulation success does not establish availability of a wallet's RPC or a signed contract payment path.

## Wallet and funded account

Not verified. This checkout contains planning artifacts only, with no generated application, package manifest, wallet configuration or account fixture. The user was asked for the wallet name and public testnet account ID only. No credentials were read or requested. Once supplied, check the account through the public testnet Mirror Node account endpoint and verify the wallet is supported by the chosen generated scaffold. Positive balance alone does not prove control, gas sufficiency or payment success.

## Outcome

The live-feed read prerequisite passes. Wallet/account availability remains pending, and the ticket stays open. No contract was deployed and no payment or signed transaction was sent. This evidence does not resolve the core workflow ticket or authorize invoice implementation.

Current API return semantics were checked with Context7 (`/smartcontractkit/documentation`) against the [Chainlink API reference](https://docs.chain.link/data-feeds/api-reference). Chainlink now marks answeredInRound deprecated; it is recorded here to satisfy the ticket's round evidence rather than presented as sufficient freshness validation.
