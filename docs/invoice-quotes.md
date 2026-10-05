# Review a USD-reference HBAR quote

Generate and install using the single supported stack in [README](../README.md), then follow [deployment, creation and inspection](invoice-creation.md). This contract version adds quote review. A previous creation-only deployment must be replaced with a fresh deployment to gain this interface; existing links retain their original contract and may report quote reads unavailable. Merchant cancellation and [exact approved payment](invoice-payment.md) are available in the current revision.

Open an invoice link without a wallet. The view shows its original chain 296, contract, invoice ID, recipient and USD amount. State and quote use the same consensus block. The contract reads the fixed Chainlink HBAR/USD reference feed; the browser never computes a payable amount or substitutes a price. The address is configured by the shipped MetaMask deployment path, and the frontend refuses quotes from another feed identity. A link and returned data do not authenticate contract bytecode or merchant identity.

The quote shows exact HBAR to all eight decimal places, integer tinybars, oracle round, price-update timestamp in UTC, price age at the read block and an exclusive UTC deadline. The price can be up to 24 hours old: it is a **reference price, not a live spot guarantee**. Reference-price age is explicitly a snapshot, not a continuously refreshed oracle measurement.

Network fees are separate from the exact invoice payment. Choose **Estimate payment network fee** to estimate the actual `payInvoice` transaction before explicit approval. A failed estimate blocks approval. The fee is additional to the exact invoice payment and MetaMask presents its final fee; no read-call fee or guessed total substitutes for this estimate.

## Quote contract boundary

`getQuote(invoiceId)` is a wallet-free view returning:

| Field            | Meaning                                                                   |
| ---------------- | ------------------------------------------------------------------------- |
| `invoiceId`      | Invoice in the called contract; pair with the original chain and contract |
| `roundId`        | Latest validated feed round                                               |
| `amountTinybars` | Exact upward-rounded invoice payment                                      |
| `deadline`       | Exclusive consensus-time bound                                            |
| `window`         | Consensus timestamp divided by 300 seconds                                |
| `priceUpdatedAt` | Validated oracle timestamp                                                |
| `price`          | Positive oracle answer in its own scale                                   |
| `feedDecimals`   | Decimals read from the feed, supported from 0 through 18                  |

The feed must return a positive price, nonzero round, `answeredInRound >= roundId`, positive start/update timestamps, start no later than update, update no later than block time and age at most 86,400 seconds. Both data and decimal read failures fail closed. Chainlink now describes `answeredInRound` as deprecated; this template retains the stricter completeness guard required by its specification. See [Chainlink's interface reference](https://docs.chain.link/data-feeds/api-reference).

Conversion uses integers: cents × 10^(feed decimals + 6) divided by the price, rounded upward to a whole tinybar. At $0.10/HBAR, $1.25 is exactly 1,250,000,000 tinybars (12.50000000 HBAR). At $3/HBAR, $0.01 rounds up to 333,334 tinybars (0.00333334 HBAR). No floating-point calculation selects payment. The supported numerator must fit uint256 and the result must be between one and 9,223,372,036,854,775,807 tinybars (signed 64-bit native amount range); larger values fail with `QuoteAmountOutOfRange`. Supported feed precision is read, not assumed to be eight.

Quotes expire at the end of a fixed five-minute consensus window, or earlier at invoice expiry or `priceUpdatedAt + 86,400`, whichever comes first. They can last less than five minutes. At exactly 24 hours the price validation succeeds, but its quote has no remaining lifetime and is not usable. At a deadline, validation rejects the quote; a read before the deadline does not reserve eligibility.

`validateQuote(Quote approved)` verifies the exact returned tuple against current contract-derived values and rejects an elapsed deadline. It accepts no client issuance time. Changing a deadline, amount, round, invoice or window changes the quote; an old window cannot be revived by replacing only its deadline. A fresh window or new oracle round requires a fresh quote and explicit new approval. This view establishes the verification boundary for the atomic payment method; it does not reserve or submit a payment. `payInvoice` enforces these conditions during settlement itself and carry the original chain/contract context through submission and recovery.

## No-quote states and recovery

- An expired or cancelled invoice has no quote. Ask the merchant for a new invoice.
- An invalid price, round or timestamp has no quote. Wait for valid feed data and refresh.
- A stale reference price has no quote. Wait for an oracle update; changing browser time cannot update it.
- Failed reads have no quote. Verify RPC availability, contract interface and fixed feed, then refresh.
- An unsupported decimal scale or oversized amount has no quote. Verify the deployment or ask for a smaller invoice.
- A displayed deadline hides the old quote when browser time reaches it. Browser time is only a display aid; the contract enforces validity using consensus time. Refresh reads a new snapshot and clears the old quote first. There is no automatic repricing or payment approval.

## Reproduce local evidence

Run `npm run test -w @sh/hardhat -- test/Quotes.test.ts`, `npm run check-types`, `npm test`, `npm run lint` and `npm run build`. After committing, run `npm run verify:template -- --local --ref HEAD --report /tmp/hbar-invoices-local/report.json`. After publishing a candidate, run the public-ref gate from README. These commands include the compiled-artifact check and the extended clean-generated browser journey.

The journey installs a controllable mock at the feed's address only inside its disposable local EVM. It demonstrates wallet-free exact quotes, fractional rounding, window refresh, missing/invalid/stale feed data and recovery without fallback amounts. Hardhat tests additionally prove deadline instants, conversion bounds and forged-deadline rejection. This is simulated oracle and wallet evidence, not a live Chainlink health check, verified Hedera deployment, native-value transport or real MetaMask settlement. No dotenv file or credential is required or included.
