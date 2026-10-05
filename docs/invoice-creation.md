# Create and inspect an invoice

This slice delivers a single-merchant creation/read contract and a MetaMask developer path on Hedera testnet (chain ID 296). It cannot quote, cancel or accept payments. Adding those contract rules requires a fresh deployment; invoices in this deployment do not migrate. The fixed feed identity preserves the planned USD-reference integration, but this slice does not use oracle prices or validate oracle freshness.

## Generate and check

Follow the root README's pinned Node 24.10.0 / npm 11.6.1 generation and installation steps. Run `npm run check-types`, `npm test`, `npm run lint` and `npm run build`. The build checks that the shipped frontend ABI and deployment bytecode match the compiled Solidity artifact. After editing the contract, run `npm run contract:export` and commit `packages/nextjs/lib/invoice-artifact.json` with the contract change.

`npm run start` serves the production build. Open `/setup`, `/deploy` and `/merchant`; a clean project reports Configuration needed and exposes setup guidance. Keep the two workspaces and exact pins.

## Prepare the merchant

Use MetaMask with a separate funded merchant testnet account. Configure Hedera testnet in MetaMask: chain ID 296, HBAR native symbol and an available testnet JSON-RPC endpoint. The default public endpoint is https://testnet.hashio.io/api; availability is not guaranteed. Confirm the endpoint, account control and current spendable test HBAR before approving a transaction. Keys remain in MetaMask; this path needs no deployment key in a dotenv file.

Open `/deploy`. It displays the network, the rule that the approving account becomes both merchant and recipient, and the fixed feed address `0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a`. That Chainlink testnet HBAR/USD address comes from dated prerequisite research; verify its current identity against Chainlink's official Hedera feed directory before approving deployment. No feed values are hard-coded. The constructor rejects zero identities; it does not authenticate a feed or merchant.

Choose **Deploy with MetaMask** and approve the deployment once. The confirmed receipt supplies the contract address. Retain the transaction hash for independent testnet explorer inspection. A hash alone is pending submission, not a confirmed deployment. If confirmation times out, check MetaMask activity and the transaction receipt before deploying again; refreshing the deployment page clears its in-memory display, not the transaction.

## Configure public reads

Privately copy `packages/nextjs/.env.example` to `packages/nextjs/.env.local`, then set:

```text
NEXT_PUBLIC_HEDERA_RPC_URL=https://YOUR_PUBLIC_TESTNET_RPC
NEXT_PUBLIC_INVOICE_CONTRACT=0xYOUR_CONFIRMED_CONTRACT_ADDRESS
```

Replace the placeholders with public values. Use HTTPS without embedded credentials; credential-bearing provider URLs do not belong in public configuration. Rebuild and restart Next.js. `/setup` still labels supplied configuration as unverified. Confirm deployed bytecode and the merchant, recipient and feed addresses yourself; a URL or configured address does not authenticate them.

## Create and share

Open `/merchant` with the deploying merchant selected in MetaMask. Enter **1.25** USD and a future expiry in your local time, then choose **Create with MetaMask**. Input is converted to integer cents without floating-point rounding. The contract independently checks merchant authorization, positive cents and expiry strictly after consensus block time. Terms cannot be edited.

Approve once. While the transaction is pending, the page disables another creation and preserves its hash and original contract in local storage. After confirmation, the contract's `InvoiceCreated` event supplies the sequential invoice ID. Open the displayed link and copy the full URL to share:

```text
/invoice/296/0xCONTRACT/INVOICE_ID
```

If the page reloads after submission, choose **Check creation transaction**. An available successful receipt must contain the creation event from the original contract before a link appears. A confirmed revert allows another attempt; a missing receipt or failed read remains unknown and blocks another creation. If browser storage could not save the attempt, retain the displayed hash and reconcile through MetaMask/explorer before restarting. Clearing storage does not cancel a transaction.

## Inspect without a wallet

Open the link in a browser without MetaMask. It shows the original network, contract and invoice ID, then reads immutable USD cents, expiry in UTC, merchant, recipient, feed and current state from that contract. The configured merchant contract does not override a link's contract. No payer account, customer profile or personal information is required.

Expiries beyond the browser's UTC date range display their exact Unix seconds instead. The contract's full `uint64` expiry range remains inspectable.

State is **Open** before expiry and **Expired** at or after expiry, derived by the contract from block time. Both terms and state are read at one block; the view displays that block and requires refresh to update. A missing invoice is identified separately from unavailable RPC/contract data. A failed refresh clears old state rather than presenting it as current. The link is a locator, not proof of merchant identity, fulfillment or trusted bytecode.

## Contract boundary

`Invoices(address merchant, address feed)` fixes `merchant`, `recipient` (equal to merchant) and `feed`. `createInvoice(uint256 usdCents, uint64 expiresAt)` returns a sequential ID beginning at 1 and emits `InvoiceCreated(id, usdCents, expiresAt)`. `getInvoice(id)` returns cents, expiry and state (`0` Open, `1` Expired). Errors distinguish `InvalidIdentity`, `MerchantOnly`, `InvalidAmount`, `InvalidExpiry` and `InvoiceNotFound(id)`. There are no identity setters, personal-data fields, payable methods or payment success events in this slice.

## Verify the generated journey

The shared `npm run verify:template` gate installs pinned Chromium and runs the production browser journey in a clean generated project. It needs public npm/browser-download access, OpenSSL (with `req -addext` support), Git and the pinned runtime. On Linux, provision Chromium system libraries using `npx playwright install-deps chromium` if required by your host.

For a source checkout that has already built, run:

```sh
npx playwright install chromium
npm run test:journey
```

The journey uses the shipped deployment bytecode, real local contract calls, a disposable simulated MetaMask interface and a wallet-free second browser. It verifies deployment, wrong-network/unauthorized/rejected creation, pending reload recovery, invoice reads, nonexistent IDs, expiry and failed-read clearing. Its local EVM deliberately advertises chain 296 to exercise the app's network guard. That is a test fixture, not Hedera, and proves no live account control, oracle health, native-value conversion or payment. Local node logs contain public disposable test accounts; they are never live credentials or input to the source package.

## Troubleshooting

- Wrong network: switch MetaMask to Hedera testnet before retrying an unsubmitted action.
- Wrong account: select the immutable deployed merchant; another account cannot administer it.
- Invalid amount/expiry: use positive whole cents and a future time; consensus may reach expiry before the transaction confirms.
- Wallet rejection: review and submit manually if desired; no automatic retry occurs.
- Insufficient test HBAR: fund the merchant for network fees and inspect any submitted hash before retrying.
- Unknown creation/deployment: reconcile the original transaction first; timeout is not proof of failure.
- Missing invoice: verify all three link identifiers and the confirmed creation event.
- RPC/contract read unavailable: check the HTTPS endpoint, chain 296 and deployed interface, then refresh. No guessed invoice state is shown.

Source packaging eligibility, generated operability and live testnet evidence remain separate. This guide describes an implemented path; it is not evidence that a real testnet deployment or payment has occurred.
