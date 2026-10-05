import {
  BrowserProvider,
  Contract,
  ContractFactory,
  Interface,
  type Eip1193Provider,
} from "ethers";
import {
  artifact,
  TESTNET_CHAIN,
  TESTNET_FEED,
  type InvoiceIdentity,
} from "./invoice.ts";
export type MetaMask = Eip1193Provider & { isMetaMask?: boolean };
export type CreationAttempt = InvoiceIdentity & { transaction: string };
export async function merchantSigner(wallet: MetaMask, expected?: string) {
  if (!wallet.isMetaMask)
    throw new Error("Use MetaMask for this supported wallet path.");
  const chain = await wallet.request({ method: "eth_chainId" });
  if (chain !== "0x128")
    throw new Error(
      "Switch MetaMask to Hedera testnet (296) before continuing.",
    );
  const provider = new BrowserProvider(wallet);
  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();
  if (
    expected &&
    (await signer.getAddress()).toLowerCase() !== expected.toLowerCase()
  )
    throw new Error(
      "Only the deployed merchant account can administer invoices.",
    );
  return { provider, signer };
}
export async function submitCreation(
  wallet: MetaMask,
  contractAddress: string,
  usdCents: bigint,
  expiresAt: bigint,
  onSubmitted: (attempt: CreationAttempt) => void,
) {
  const { provider, signer } = await merchantSigner(wallet);
  try {
    const contract = new Contract(contractAddress, artifact.abi, signer);
    const merchant = await contract.getFunction("merchant")();
    if ((await signer.getAddress()).toLowerCase() !== merchant.toLowerCase())
      throw new Error(
        "Only the deployed merchant account can administer invoices.",
      );
    // Recheck context immediately before the wallet prompt. The contract enforces the signer.
    if ((await wallet.request({ method: "eth_chainId" })) !== "0x128")
      throw new Error("Switch MetaMask to Hedera testnet (296).");
    const tx = await contract.getFunction("createInvoice")(usdCents, expiresAt);
    const attempt = {
      chainId: TESTNET_CHAIN,
      contract: contractAddress,
      invoiceId: "0",
      transaction: tx.hash,
    };
    onSubmitted(attempt);
    const receipt = await tx.wait(1, 60_000);
    if (!receipt)
      throw new Error(
        "Creation outcome unknown. Check the submitted transaction before creating another invoice.",
      );
    return createdInvoice(receipt.logs, contractAddress);
  } finally {
    provider.destroy();
  }
}
export function createdInvoice(
  logs: ReadonlyArray<{
    address: string;
    topics: ReadonlyArray<string>;
    data: string;
  }>,
  contract: string,
): InvoiceIdentity {
  const abi = new Interface(artifact.abi);
  for (const log of logs) {
    if (log.address.toLowerCase() !== contract.toLowerCase()) continue;
    try {
      const event = abi.parseLog({ topics: [...log.topics], data: log.data });
      if (event?.name === "InvoiceCreated")
        return {
          chainId: TESTNET_CHAIN,
          contract,
          invoiceId: event.args.invoiceId.toString(),
        };
    } catch {
      /* Other event. */
    }
  }
  throw new Error(
    "No confirmed InvoiceCreated event. Creation outcome is unknown.",
  );
}
export async function deployInvoices(
  wallet: MetaMask,
  onSubmitted: (transaction: string) => void,
) {
  const { provider, signer } = await merchantSigner(wallet);
  try {
    const merchant = await signer.getAddress();
    const factory = new ContractFactory(
      artifact.abi,
      artifact.bytecode,
      signer,
    );
    const contract = await factory.deploy(merchant, TESTNET_FEED);
    const tx = contract.deploymentTransaction();
    if (!tx) throw new Error("Deployment transaction unavailable.");
    onSubmitted(tx.hash);
    const receipt = await tx.wait(1, 60_000);
    if (!receipt || receipt.status !== 1 || !receipt.contractAddress)
      throw new Error(
        "Deployment outcome unknown. Check the submitted transaction before deploying again.",
      );
    return receipt.contractAddress;
  } finally {
    provider.destroy();
  }
}
export function walletMessage(error: unknown) {
  const item = error as {
    code?: string | number;
    shortMessage?: string;
    message?: string;
  };
  if (item.code === 4001 || item.code === "ACTION_REJECTED")
    return "Request rejected in MetaMask. No automatic retry was made.";
  if (item.code === "INSUFFICIENT_FUNDS")
    return "Insufficient test HBAR for network fees. Fund the merchant account and check the transaction outcome.";
  return (
    item.shortMessage ||
    item.message ||
    "Wallet operation unavailable. Check MetaMask and testnet RPC."
  );
}

export async function submitCancellation(
  wallet: MetaMask,
  identity: InvoiceIdentity,
  merchant: string,
  onSubmitted: (transaction: string) => void,
) {
  const { provider, signer } = await merchantSigner(wallet, merchant);
  try {
    const contract = new Contract(identity.contract, artifact.abi, signer);
    if ((await wallet.request({ method: "eth_chainId" })) !== "0x128")
      throw new Error("Switch MetaMask to Hedera testnet (296).");
    const tx = await contract.getFunction("cancelInvoice")(identity.invoiceId);
    onSubmitted(tx.hash);
    const receipt = await tx.wait(1, 60_000);
    if (!receipt || receipt.status !== 1)
      throw new Error(
        "Cancellation outcome unknown. Check the original transaction.",
      );
    confirmedCancellation(receipt.logs, identity);
  } finally {
    provider.destroy();
  }
}
export function confirmedCancellation(
  logs: ReadonlyArray<{
    address: string;
    topics: ReadonlyArray<string>;
    data: string;
  }>,
  identity: InvoiceIdentity,
) {
  const abi = new Interface(artifact.abi);
  for (const log of logs) {
    if (log.address.toLowerCase() !== identity.contract.toLowerCase()) continue;
    try {
      const event = abi.parseLog({ topics: [...log.topics], data: log.data });
      if (
        event?.name === "InvoiceCancelled" &&
        event.args.invoiceId.toString() === identity.invoiceId
      )
        return;
    } catch {
      /* Other event. */
    }
  }
  throw new Error(
    "No matching confirmed InvoiceCancelled event. Cancellation outcome is unknown.",
  );
}
