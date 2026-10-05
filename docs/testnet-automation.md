# Authorized two-wallet testnet verification

[Complete a real two-wallet MetaMask testnet checkout](https://github.com/MrSufferer/scaffold-hbar/issues/19) is agent-ready by explicit maintainer authorization. The first ignored root `.env` key (`HEDERA_FIRST_PRIVATE_KEY`) is the merchant; the second (`HEDERA_SECOND_PRIVATE_KEY`) is the payer. This is real wallet automation, rather than evidence of a human-operated checkout. Never copy keys into public configuration, commit dotenv files, or publish wallet profiles, import-screen captures, traces or raw signed transactions.

Use Node 24.10.0 and npm 11.6.1. The supported contract framework remains Hardhat 2.22.19. dappwright 2.13.12 drives real MetaMask 13.17.0; no injected simulated provider or local relay is used in this live journey. The disposable initial seed has no funds and is replaced for signing by the authorized imported account. Each signer gets its own profile, deleted when the runner exits.

## CLI gate comes first

From the installed source checkout:

```sh
npm run test:testnet:cli
```

This spends test HBAR to deploy the compiled contract, create a $1.25 invoice, submit the exact contract quote, verify the settlement event and receipt-block state, verify merchant delivery, then create and cancel another $1.25 invoice. It checks chain 296, distinct accounts, funding and the fixed real feed before deployment. Evidence defaults to `/tmp/hbar-invoices-testnet-cli.json`; set `TESTNET_REPORT` to select another private report path. Existing evidence blocks reruns. Reconcile recorded hashes before deliberately starting another run; an RPC timeout never proves failure.

## Generate the committed candidate

First commit and run the shared gate:

```sh
npm run verify:template -- --local --ref HEAD --report /tmp/hbar-invoices-local/report.json
```

The gate removes its temporary generated project. For the live browser run, export the same tracked commit to a fresh temporary source directory with `git archive`, then generate through the published CLI's local-source seam:

```sh
CREATE_SCAFFOLD_HBAR_TEMPLATE_DIR=/absolute/temporary/source npm create scaffold-hbar@latest -- generated --template MrSufferer/scaffold-hbar --frontend nextjs-app --solidity-framework hardhat --package-manager npm --network testnet --skip-install --skip-hedera-skills --yes
```

Run in a fresh temporary parent directory. Record the exact exported commit. In the generated project run `npm ci`, `npm run format`, `npm run check-types`, `npm test`, `npm run lint` and `npm run build`. This is local-candidate generation; published candidate/default-ref checks remain separate requirements.

Configure only public values in the generated frontend: `NEXT_PUBLIC_HEDERA_RPC_URL` and `NEXT_PUBLIC_INVOICE_CONTRACT` from the CLI report. Rebuild and start that generated production app. The browser runner defaults to `http://localhost:3000`; set `TESTNET_APP_URL` if needed. Keep signing keys in the original checkout's ignored `.env`, then run there:

```sh
TESTNET_SOURCE_COMMIT=YOUR_EXPORTED_COMMIT npm run test:testnet:metamask
```

The runner refuses a failed CLI report. It uses visible browser windows with fully automated wallet approvals. It imports the authorized accounts into isolated real MetaMask profiles, creates an invoice in the generated app, reviews the exact displayed quote and separate estimated fee, explicitly confirms payment, verifies the transaction independently and rechecks the receipt after reload. It creates and cancels a second invoice and checks its payer view. Browser evidence defaults to `/tmp/hbar-invoices-metamask.json`; `METAMASK_REPORT` selects another report. A failed browser run is incomplete evidence. Inspect saved original transaction references and wallet activity before any rerun; do not infer a safe retry from profile deletion.

If the original creation succeeded but evidence collection stopped before payment, preserve its report and reconcile the public hash. The runner supports one narrow continuation:

```sh
TESTNET_SOURCE_COMMIT=YOUR_EXPORTED_COMMIT TESTNET_RESUME_CREATION_HASH=ORIGINAL_CREATION_HASH npm run test:testnet:metamask
```

It requires the saved original merchant intent, matching source and contract, no payer approval/payment, an authoritative successful creation receipt from the merchant, and a still-open $1.25 invoice. It continues that invoice without signing another creation. A pending or unknown payment cannot use this continuation. Public Mirror results locate creation/cancellation hashes; successful relay receipts and matching original-contract events verify them.

Keep the existing local stale-feed/expired-quote example identified as local. CLI testnet evidence proves native transport separately from the MetaMask journey. Neither can replace source packaging, clean generated operability or public default-ref verification. The live ticket remains open while any gate is missing.

## Observed CLI testnet evidence, October 5, 2026

The [CLI record](verification/2026-10-05-testnet-cli.json) confirms deployment `0x3467c4A13171B1216691D37B2C3E69d05133E9e8` and [settlement](https://hashscan.io/testnet/transaction/0x27761e9beb83a7bc6795c3f4dfe2f580f1eb77748249d50a8d8b528025f36bfd) of invoice 1 for $1.25 at round `18446744073709596752`. The exact delivered amount was 1,199,269,463 tinybars (11.99269463 HBAR), independently checked against the merchant balance delta and receipt-block state at block 41373342. [Invoice 2 cancellation](https://hashscan.io/testnet/transaction/0x4028f4abc57a9d6ea584f2a7d20a89b568fde03fe438f27e5349aae5ee2f308d) confirmed at block 41373348. These are CLI transactions; real MetaMask browser evidence follows below.

## Observed MetaMask evidence, October 5, 2026

The [real MetaMask record](verification/2026-10-05-metamask.json) passed using dappwright 2.13.12, MetaMask 13.17.0 and Chromium 141.0.7390.37. The production app was generated from clean source `7417838ce326595590c613a6eb46eb8100a87e1b` through published CLI 0.4.1; install, formatting, typechecks, tests, lint, build and boot passed. Runner revision `c754a303e309f122a95383f3422ca321ddbccd6e` includes the wallet UI and evidence-recovery fixes. Keys remained in the ignored original checkout's `.env`; the generated app used public configuration only.

The merchant [created invoice 3](https://hashscan.io/testnet/transaction/0xdfda562f5c51b9b5b1b77af92d4e39428ea118e23a9bf42a567a2e033479ab12) through real MetaMask. Relay log search initially failed after creation. The runner reconciled that original successful receipt and resumed invoice 3 without creating it again. Earlier unsigned setup/review failures are retained in the evidence history.

Before approval, the payer reviewed chain 296, the original contract and merchant recipient, $1.25 USD, reference timestamp `2026-10-05T04:32:39.000Z`, round `18446744073709596754`, exclusive deadline `2026-10-05T04:40:00.000Z`, exact payment **1,215,433,438 tinybars (12.15433438 HBAR)**, and a separate estimated fee of **0.1374739 HBAR**. [Payment](https://hashscan.io/testnet/transaction/0x1dddaa3183b7ede6535ea334fb2918be50829996be3a26beab708e2908de64f0) confirmed at block **41374915**. Independent verification matched calldata, wire value, settlement event, payer, amount, round, receipt-block contract state and exact merchant balance delta. Reload and original transaction reconciliation restored the confirmed receipt.

The merchant then [created invoice 4](https://hashscan.io/testnet/transaction/0x54dcb7f10d3f9c3845552f750fa3fdda2faff02565cc2b13f8697c0e1a7a5552) and [cancelled it](https://hashscan.io/testnet/transaction/0x122dcffa294f7ff2de43659a6c64a93f425dd04a1e51f66f5eac1e01eca9934a) at block **41374929**. The matching original-contract event, receipt-block cancelled state and payer view agreed. Both isolated wallet profiles were deleted after the run. The stale/expired quote failure example remains a separate local test; these live results do not establish public default-ref operability or final bounty eligibility.
