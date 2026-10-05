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

The [CLI record](verification/2026-10-05-testnet-cli.json) confirms deployment `0x3467c4A13171B1216691D37B2C3E69d05133E9e8` and [settlement](https://hashscan.io/testnet/transaction/0x27761e9beb83a7bc6795c3f4dfe2f580f1eb77748249d50a8d8b528025f36bfd) of invoice 1 for $1.25 at round `18446744073709596752`. The exact delivered amount was 1,199,269,463 tinybars (11.99269463 HBAR), independently checked against the merchant balance delta and receipt-block state at block 41373342. [Invoice 2 cancellation](https://hashscan.io/testnet/transaction/0x4028f4abc57a9d6ea584f2a7d20a89b568fde03fe438f27e5349aae5ee2f308d) confirmed at block 41373348. These are CLI transactions; real MetaMask browser evidence is recorded separately and remains incomplete until its gate passes.
