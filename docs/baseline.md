# Supported baseline

Reference: [hedera-dev/scaffold-hbar blank template](https://github.com/hedera-dev/scaffold-hbar/tree/b2a23f5ff274200174a9d0a4e23b1968663d6ba8), inspected October 4, 2026.

Adapt the baseline's `@sh/hardhat` and `@sh/nextjs` workspace names, TypeScript/App Router structure and Hardhat ethers configuration. Preserve its MIT notice in LICENSE. Its HTS tests require the Hedera forking plugin; they are unrelated to invoice operability and are not copied as evidence. The baseline probe instead runs on the local Hardhat EVM.

One supported combination: Node 24.10.0, npm 11.6.1, Next.js 15.5.27, React 19.2.3, Hardhat 2.22.19, ethers 6.14.0, Solidity/solc 0.8.28. Direct dependencies are exact pins and package-lock.json locks transitives. Next.js is patched within the baseline's major line. Forking, baseline HTS examples, mainnet, account-generation helpers and payment UI are deferred to their own slices; no default private key is included.

The baseline established generated-template operability. The creation/read extension is documented in [the walkthrough](invoice-creation.md). A local probe is not Hedera settlement evidence. Future invoice work must retain the same clean generation gate and implement the agreed MetaMask flow rather than adding another wallet stack.
