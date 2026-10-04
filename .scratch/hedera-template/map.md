# Choose a durable Hedera developer template

Labels: wayfinder:map
Status: open

## Destination

An implementation-ready specification for one useful, maintainable scaffold-hbar template, selected using researched evidence and the bounty rubric. This is a longer-term effort, not a commitment to the current bounty deadline.

## Notes

- User delegated research and use-case selection to the agent; no preferred use case.
- Build budget: eight hours, one builder, the user as sole maintainer. Longer-term usefulness remains the destination, not a multi-week build.
- Planning only. Consult wayfinder, domain-modeling and relevant Hedera skills; use research for external facts.
- Local Markdown tracker. Research is captured on research branches; findings and ticket answers are linked here.
- Bounty source: https://hedera.com/blog/scaffold-hbar-template-bounty/

## Decisions so far

- [Establish the template contract and existing coverage](issues/01-template-contract.md): validate the generated scaffold and avoid duplicating existing starter coverage.
- [Compare payments and oracle template opportunities](issues/02-payments-oracles.md): select Chainlink-based USD-reference HBAR invoice checkout, subject to a live-feed feasibility gate; comparison and budget are linked from the ticket.
- [Compare DeFi and bridge template opportunities](issues/03-defi-bridges.md): SaucerSwap readiness is the runner-up; reject multi-chain operations within eight hours.

## Not yet specified

- Extension seams for downstream developers after the core invoice behavior is settled.
- Tutorial narrative and examples once the acceptance contract is settled.

## Out of scope

- Building, deployment, bounty registration or submission in this charting session.
- Guaranteeing a prize or claiming eligibility without a working scaffold and testnet evidence.
