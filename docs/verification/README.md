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
