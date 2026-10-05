# Operability evidence

The gate writes a top-level report and separate generated-checks.json plus per-stage logs beside --report. Local-candidate evidence cannot replace public-candidate or public-default generation. Successful template operability does not establish live settlement or final bounty eligibility.

The issue's accepted testing seams are the published-source manifest, the generated developer command journey and visible production route readiness. Regression tests exercise invalid manifest rejection, failed command propagation and missing-configuration guidance. The baseline's local contract probe checks that the generated contracts workspace compiles and executes without RPC or funds.

Record a dated report for each delivered revision. Final default-ref verification and live-network evidence belong to the final audit; keep missing stages visible.

## October 4, 2026 baseline

[Recorded results](2026-10-04.json) validate source commit `4eb973786434c1c80cf16576898ef0dd6a379704` with published create-scaffold-hbar 0.4.1, Node 24.10.0 and npm 11.6.1. Local-candidate, public-candidate and public-default runs all passed. The default branch was set to main so the documented unqualified template command selects the application baseline.

Each clean generated project passed npm ci, formatting, typechecks, four verifier regression tests, one local contract test, two readiness tests, lint and production build. GET / and GET /setup returned HTTP 200 with the expected configuration guidance. The source packaging audit rejected runtime dotenv, dependencies, build artifacts, symlinks and private-key files; generated output retained the two workspaces, lockfile and guides and intentionally omitted template.json. A real exit-23 subprocess regression confirms failed checks cannot become success.

Commands used:

```sh
npm run verify:template -- --local --ref HEAD --report /tmp/hbar-invoices-local-delivery/report.json
npm run verify:template -- --ref 4eb973786434c1c80cf16576898ef0dd6a379704 --report /tmp/hbar-invoices-public-candidate/report.json
npm run verify:template -- --report /tmp/hbar-invoices-public-default/report.json
```

Playwright inspection covered the landing-to-setup link, 1440px desktop and 375px mobile layouts; mobile document width equalled viewport width. The two-axis review against d539a8a found no unresolved standards or implementation findings after fixes. Concurrent prerequisite research and private tooling were excluded from implementation review.

These reports cover the baseline revision above. Re-run this gate after subsequent slices and during the final audit. No invoice deployment, wallet transaction, live oracle verification or settlement was performed here. Dependency installation reports inherited transitive audit findings; this baseline is not a security audit.

## October 5, 2026 invoice creation and inspection

[Recorded results](2026-10-05.json) cover implementation commit `b465570ca35212f99b888d8c6a87af13e86a4509` for [Create and inspect an invoice from the generated template](https://github.com/MrSufferer/scaffold-hbar/issues/12). Local-candidate, public-candidate and public-default runs passed with CLI 0.4.1, Node 24.10.0 and npm 11.6.1. Each record includes generation commands, stages and the generated project's developer checks.

The extended gate checks production routes and runs Chromium against the production generated app with a simulated MetaMask interface and a real local EVM. It deploys shipped bytecode, creates and recovers an invoice, inspects it without a wallet, and checks wrong network/account, wallet rejection, nonexistent IDs, exact expiry, maximum uint64 expiry and failed-read clearing. Contract tests cover authorization, immutable identity/terms, sequential IDs, invalid inputs and missing invoices. Both Standards and Spec reviews have no remaining findings after the expiry display fix.

Commands used:

```sh
npm run verify:template -- --local --ref HEAD --report /tmp/hbar-invoices-local/report.json
npm run verify:template -- --ref b465570ca35212f99b888d8c6a87af13e86a4509 --report /tmp/hbar-invoices-candidate/report.json
npm run verify:template -- --report /tmp/hbar-invoices-public-default/report.json
```

This verifies the creation/read slice. The local EVM is not Hedera testnet; no live deployment, oracle verification, HBAR payment or settlement is claimed. Documentation-only revisions after the recorded implementation commit are checked separately at delivery.

## October 5, 2026 cancellation and final states

[Recorded results](2026-10-05-cancellation.json) cover implementation commit `11b7ceae4d175dd81b57d4227d7df04dbee9abd9` for [Cancel an unpaid invoice and show its final state](https://github.com/MrSufferer/scaffold-hbar/issues/13). Local-candidate, public-candidate and public-default runs passed with published CLI 0.4.1, Node 24.10.0 and npm 11.6.1. The record includes source refs, dates, generation commands, each stage and generated developer checks.

Each clean generated project passed installation, formatting, typechecks, four gate regression tests, seven contract tests, seven frontend tests, lint, production build/boot and successful core-route responses. The production browser journey verifies merchant cancellation authorization, wrong network and wallet rejection, saved pending cancellation recovery after reload, wallet-free cancelled refresh/reload, no checkout for cancelled/expired states, before/at expiry, and failed-read clearing. Cancellation event tests reject wrong contracts and invoice IDs. The source manifest, packaging exclusions, two workspaces and generated cancellation guides also passed. The two-axis review found no standards violations or spec defects; one optional event-parsing cleanup was deferred.

Commands used:

```sh
npm run verify:template -- --local --ref HEAD --report /tmp/hbar-invoices-local/report.json
npm run verify:template -- --ref 11b7cea --report /tmp/hbar-invoices-candidate/report.json
npm run verify:template -- --report /tmp/hbar-invoices-public-default/report.json
```

The contract change requires a fresh deployment; existing creation/read invoices retain their old contracts. These are source eligibility and generated operability results, using a simulated wallet and local EVM. Real MetaMask Hedera testnet cancellation, oracle health, payment and settlement remain unverified. The later evidence-only revision is checked separately at delivery.

## October 5, 2026 expiring quote review

[Recorded results](2026-10-05-quotes.json) cover quote implementation commit `58bfa2508b80fe5a7605cc93962fb78822444ef0`, including integration with merchant cancellation. Local and public candidate generation passed all stages with published CLI 0.4.1, Node 24.10.0 and npm 11.6.1: install, formatting, typechecks, 28 tests, lint, build, production boot, core routes and the visible browser journey. Both review axes have no remaining findings.

The journey covers exact and fractional quotes, expiry and consensus-window refresh, failed/invalid/stale feed clearing, recovery and cancellation. Network fees remain separately unavailable by user-approved scope; settlement must estimate them before approval. The separately recorded public default gate passed for the earlier cancellation revision and does not establish quote availability on main.

These checks use a simulated wallet and disposable local EVM. They provide source eligibility and generated operability evidence, without claiming real Hedera deployment, oracle health, payment or settlement. The evidence-only revision is verified separately at delivery.

## October 5, 2026 exact approved settlement

[Recorded results](2026-10-05-settlement.json) cover settlement commit `c8ee35f` for [Settle one exact approved quote and show a receipt](https://github.com/MrSufferer/scaffold-hbar/issues/15). Local-candidate and public-candidate runs passed with published CLI 0.4.1, Node 24.10.0 and npm 11.6.1. Clean generated projects passed install, formatting, typechecks, 35 tests, lint, production build/boot, core routes and the production browser journey. Both review axes have no remaining findings after capability and funding guidance corrections.

The journey verifies explicit approval and separate fees, changed-round rejection, exact wire value, one recipient balance delta, confirmed receipt evidence, pending reload recovery and settled invoice behavior. Contract tests cover one-tinybar under/overpayment, modified approvals, feed/deadline rejection, both cancellation orderings, failed delivery rollback, reentrancy and replay rejection. Packaging exclusions and the generated settlement guides passed.

The current public default-ref check failed at generated-artifacts because `a3b1cfd` lacks the settlement guide; later stages did not run. The public settlement candidate is `implement/invoice-settlement`. This result does not establish settlement availability on the default branch.

The browser uses a simulated wallet, local EVM and explicit test relay conversion from wire weibars to EVM tinybars. Real MetaMask Hedera deployment, oracle health, transport conversion and settlement remain unverified. The record includes each command, source ref, timestamp and per-stage result.
