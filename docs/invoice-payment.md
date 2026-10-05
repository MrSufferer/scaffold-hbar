# Approve and settle one exact quote

Generate and check the project with the pinned Node 24.10.0 / npm 11.6.1 stack in [README](../README.md). Follow [deployment and creation](invoice-creation.md) and [quote review](invoice-quotes.md). Settlement changes the Solidity deployment: deploy this revision afresh. Earlier contracts do not acquire payment support, and existing invoice links keep their original chain, contract and ID.

## Payer walkthrough

Use a separate funded payer MetaMask account on Hedera testnet (296). Open an unpaid **1.25 USD** invoice link. Check the original contract, merchant, recipient, immutable expiry, exact HBAR/tinybar payment, reference round and exclusive quote deadline. A link does not authenticate merchant identity or bytecode. The reference price may be up to 24 hours old and is not a live spot guarantee.

Choose **Estimate payment network fee**. The application estimates the actual `payInvoice` transaction using the reviewed quote and exact value; it never substitutes a new quote. It reads gas price, adds 20% to estimated gas, displays the resulting gas-limit × gas-price fee in HBAR separately from invoice payment, and checks the payer's balance for both. This is an estimate; MetaMask shows the final fee. A failed estimate blocks approval and displays an error. No zero or guessed fee is shown.

Review the payer address, exact approved amount, round, deadline and separate fee. Choose **Approve exact quote and pay with MetaMask** once. The wallet boundary preserves the original chain/contract/invoice and complete quote tuple. A changed payer requires new fee review; a refreshed or expired quote requires new approval. The contract rechecks eligibility, oracle data, every quote field and the exact payment at consensus. Clicking before expiry reserves nothing.

A submitted hash is **Payment outcome pending**, not a receipt. Only a successful transaction receipt containing `InvoiceSettled` for the original contract/invoice, together with a matching `getInvoice`/`getSettlement` read at that receipt's block, produces **Confirmed payment receipt**. It shows payer, amount, accepted round, confirmed block, transaction hash and a HashScan testnet transaction link. Invoice state is **Settled** and payment/cancellation actions disappear. Settlement remains final after invoice expiry. A successful receipt with no matching event or unavailable state read stays unknown.

## Submission and recovery boundary

Fee estimation and explicit approval are separate actions. `preparePayment` captures the reviewed tuple and payer; `submitPayment` validates that context, rechecks the network and submits the encoded transaction without repricing. `confirmedPayment` reconciles transaction evidence and authoritative state. These functions are the boundary for a replacement UI, not permission to skip exact approval.

The browser saves the original identity, payer, quote, fee context and submission intent before the wallet prompt, then the returned hash. Pending payment blocks another attempt and survives reload. Choose **Check payment transaction** to reconcile the original saved hash. Missing receipts, mismatched events, failed reads and timeouts stay unknown. A confirmed revert refreshes invoice state before a new review. Wallet rejection permits manual review again, never an automatic retry. A saved intent with no hash requires checking MetaMask activity; the app deliberately blocks retry because transport failure may conceal submission. Clearing browser storage does not prove failure. Keep the transaction hash if saving it fails after submission. Confirmed hashes are retained so reload can reverify the receipt; saved records alone never establish success.

## Contract interface and native value

`payInvoice(Quote approved)` is payable and validates the entire tuple described in [quote contract boundary](invoice-quotes.md). Exact equality includes invoice ID, round, tinybar amount, consensus window/deadline and price metadata. Changed rounds reject even when price is unchanged. Deadline and invoice expiry are exclusive. Underpayment and overpayment by one tinybar fail with `IncorrectPayment`. No partial payment, refund or retained overpayment is supported.

The existing lifecycle values remain `0` Open, `1` Expired and `2` Cancelled; `3` is Settled. `getSettlement(id)` returns payer, amountTinybars and roundId (zero values before payment). `InvoiceSettled(uint256 indexed invoiceId, address indexed payer, uint256 amountTinybars, uint80 roundId)` is emitted only after full recipient delivery. `InvoiceAlreadySettled` rejects cancellation after settlement. The contract uses checks/effects/interactions and a payment reentrancy guard. Recipient rejection reverts state and delivery together with `RecipientDeliveryFailed`; nested payment fails with `ReentrantPayment`. Consensus order decides cancellation/payment races, with the second action rejected.

Hedera's EVM `msg.value`, balances and internal native transfers use **tinybars** (8 decimals). Ethereum transaction value and JSON-RPC gas price use **weibars** (18 decimals). The wallet sends `amountTinybars × 10^10` as transaction value, while the contract compares `msg.value` directly with `amountTinybars` and transfers that native value without rescaling. For example, 12.50000000 HBAR is 1,250,000,000 tinybars in the quote and 12,500,000,000,000,000,000 weibars on the wire. See [Hedera's Ethereum transaction units](https://docs.hedera.com/native/smart-contracts/ethereum-transaction). Never use floating-point conversion or multiply internal contract delivery by the wire conversion factor.

## Reproduce deterministic evidence

Run `npm run test -w @sh/hardhat -- test/Settlement.test.ts`, `npm run check-types`, `npm test`, `npm run lint` and `npm run build`. After contract edits, run `npm run contract:export`. Run the shared committed local-candidate and published-ref `verify:template` gates from README.

The clean generated production browser journey estimates a fee, rejects wrong network and wallet rejection, rejects a same-price new round without submitting, pays a fractional-tinybar quote once, recovers after reload, and verifies recipient balance change and a transaction-linked receipt. Its simulated wallet explicitly models the Hedera wire-to-EVM conversion because ordinary Hardhat does not. Contract tests verify one-tinybar mismatch, forged context, feed failure, deadline/expiry, both cancellation orderings, rejected delivery and reentrancy across invoices. The doubles require no secrets or real funds.

These checks establish deterministic source/generated behavior only. They do not establish Hedera transport semantics, live oracle health or a real MetaMask settlement. A later real Hedera testnet journey must verify the actual payer value, recipient HBAR balance delta and accepted transaction evidence before those claims can be made.
