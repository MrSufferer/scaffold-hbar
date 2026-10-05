# Reuse the invoice pattern

The Solidity contract owns merchant authorization, immutable terms, invoice lifecycle, feed validation, integer conversion, consensus quote windows and atomic delivery. This is the Hedera Smart Contract Service integration: creation, cancellation and exact settlement are real state transitions on Hedera, rather than a standalone token transfer. The fixed Chainlink HBAR/USD feed is essential to USD-reference pricing; removing it changes the purpose of the application. It supplies a reference price, not a guaranteed current spot price.

Keep the [creation interface](invoice-creation.md#contract-boundary), [quote tuple](invoice-quotes.md#quote-contract-boundary) and [payment interface](invoice-payment.md#contract-interface-and-native-value) together when adapting the example. Reads, submission and reconciliation have separate responsibilities:

| Change                                             | Reusable boundary                                                                                    | Required validation                                                                                               |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Layout, copy or amount display                     | Next.js pages and formatting; preserve all reviewed identity, amount, round, deadline and fee fields | Typechecks, frontend checks and generated browser journey; formatting never selects payment value                 |
| Replace the invoice view                           | `readInvoice` in `packages/nextjs/lib/invoice.ts` reads authoritative terms/state/quote              | Keep original chain/contract/ID, one-block snapshot and failed-read clearing                                      |
| Replace payment controls                           | `preparePayment` and `submitPayment` in `packages/nextjs/lib/payment.ts`                             | Preserve exact quote, explicit approval, separate fees, wallet-event invalidation and tinybar-to-weibar transport |
| Replace recovery presentation                      | `reconcilePayment` and `confirmedPayment` in `packages/nextjs/lib/payment.ts`                        | Retain original attempt; require matching transaction/event/receipt-block state; unknown outcomes block retries   |
| Change a public RPC                                | Public HTTPS configuration without credentials                                                       | Rebuild/restart, check chain 296 and original deployment reads; an endpoint never redirects existing links        |
| Change merchant, recipient, feed or contract rules | Fresh deployment of `Invoices`; update public configuration only for new invoices                    | Contract tests, regenerate frontend artifact, clean generation and affected real testnet steps                    |

Existing invoices, links and pending attempts stay on their original contract. There is no upgrade or migration mechanism. A replacement view must never attribute another payer's settlement to the saved attempt. Compatible presentation changes do not authorize another wallet path or oracle fallback.

## Maintain the supported configuration

Maintenance is best effort by one maintainer for the documented Node 24.10.0, npm 11.6.1, Next.js/Hardhat and MetaMask testnet path. There is no compatibility matrix or availability guarantee for the public RPC or feed. Keep exact direct dependency pins and commit `package-lock.json` with updates. Recheck the published CLI schema adapter whenever its release changes; its prompt fallback is not manifest validation.

For an update, run the package scripts for typechecks, tests, lint and build, then the committed local-candidate template gate. After publication, run the public candidate and stable public-default gates. Rerun affected live deployment, quote, payment, wallet or recovery steps when their behavior changes; local EVM simulation cannot establish Hedera transport semantics. Preserve dated failures as well as passing results.

This is an educational testnet pattern with no mainnet support, security audit, production-readiness guarantee, order fulfillment, refund, escrow or customer-data system. Production use requires its own security, operational and business review. Hedera Harness was not used; there are no Harness recipes or validators to submit. The existing template gate is ordinary repository validation, not Hedera Harness.
