import {
  Contract,
  FetchRequest,
  JsonRpcProvider,
  isAddress,
  ZeroAddress,
} from "ethers";
import artifact from "./invoice-artifact.json" with { type: "json" };
export const TESTNET_CHAIN = 296;
export const TESTNET_FEED = "0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a";
export { artifact };
export type InvoiceIdentity = {
  chainId: number;
  contract: string;
  invoiceId: string;
};
export type InvoiceView = InvoiceIdentity & {
  merchant: string;
  recipient: string;
  feed: string;
  usdCents: string;
  expiresAt: string;
  state: "Open" | "Expired" | "Cancelled";
  blockNumber: number;
};
export function invoiceIdentity(
  chain: string,
  contract: string,
  id: string,
): InvoiceIdentity {
  if (chain !== "296")
    throw new Error("Unsupported network: use Hedera testnet (296).");
  if (!isAddress(contract) || contract === ZeroAddress)
    throw new Error("Invalid invoice contract address.");
  if (!/^[1-9][0-9]*$/.test(id) || id.length > 78 || BigInt(id) >= 2n ** 256n)
    throw new Error("Invalid invoice ID.");
  return { chainId: TESTNET_CHAIN, contract, invoiceId: id };
}
export function invoicePath(identity: InvoiceIdentity) {
  return `/invoice/${identity.chainId}/${identity.contract}/${identity.invoiceId}`;
}
export function parseCents(input: string): bigint {
  if (!/^[0-9]+(?:\.[0-9]{1,2})?$/.test(input))
    throw new Error(
      "Enter a positive USD amount with at most two decimal places.",
    );
  const [whole, fraction = ""] = input.split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (cents <= 0n || cents >= 2n ** 256n)
    throw new Error(
      "USD amount is outside the supported positive whole-cent range.",
    );
  return cents;
}
export function formatExpiry(seconds: string) {
  const value = BigInt(seconds);
  if (value > 8_640_000_000_000n)
    return `${seconds} Unix seconds (outside the UTC date display range)`;
  return new Date(Number(value) * 1000).toISOString();
}
export function formatUsd(cents: string) {
  const value = BigInt(cents);
  return `$${(value / 100n).toLocaleString("en-US")}.${(value % 100n).toString().padStart(2, "0")} USD`;
}
export function publicProvider(rpc: string) {
  const request = new FetchRequest(rpc);
  request.timeout = 10_000;
  return new JsonRpcProvider(request, undefined, { batchMaxCount: 1 });
}
export async function readInvoice(
  identity: InvoiceIdentity,
  rpc: string,
): Promise<InvoiceView> {
  const provider = publicProvider(rpc);
  try {
    if ((await provider.getNetwork()).chainId !== BigInt(TESTNET_CHAIN))
      throw new Error("RPC is not Hedera testnet (296).");
    const block = await provider.getBlock("latest");
    if (!block) throw new Error("Latest block is unavailable.");
    const contract = new Contract(identity.contract, artifact.abi, provider);
    const at = { blockTag: block.number };
    const [merchant, recipient, feed, invoice] = await Promise.all([
      contract.getFunction("merchant")(at),
      contract.getFunction("recipient")(at),
      contract.getFunction("feed")(at),
      contract.getFunction("getInvoice")(identity.invoiceId, at),
    ]);
    const state = Number(invoice[2]);
    if (state !== 0 && state !== 1 && state !== 2)
      throw new Error("Unsupported contract lifecycle version.");
    return {
      ...identity,
      merchant,
      recipient,
      feed,
      usdCents: invoice[0].toString(),
      expiresAt: invoice[1].toString(),
      state: state === 0 ? "Open" : state === 1 ? "Expired" : "Cancelled",
      blockNumber: block.number,
    };
  } finally {
    provider.destroy();
  }
}
