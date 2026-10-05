import {
  Contract,
  FetchRequest,
  JsonRpcProvider,
  isAddress,
  ZeroAddress,
  isError,
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
export type InvoiceQuote = {
  invoiceId: string;
  roundId: string;
  amountTinybars: string;
  deadline: string;
  window: string;
  priceUpdatedAt: string;
  price: string;
  feedDecimals: number;
};
export type QuoteResult =
  | { status: "available"; quote: InvoiceQuote }
  | { status: "unavailable"; reason: string };
export type InvoiceView = InvoiceIdentity & {
  merchant: string;
  recipient: string;
  feed: string;
  usdCents: string;
  expiresAt: string;
  state: "Open" | "Expired" | "Cancelled";
  blockNumber: number;
  blockTimestamp: string;
  quoteResult: QuoteResult;
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
// Exact payment display: preserve every tinybar, including above Number.MAX_SAFE_INTEGER.
export function formatHbar(tinybars: string) {
  const value = BigInt(tinybars);
  return `${(value / 100000000n).toLocaleString("en-US")}.${(value % 100000000n).toString().padStart(8, "0")} HBAR`;
}

function quoteReadError(error: unknown): string {
  const name = isError(error, "CALL_EXCEPTION")
    ? error.revert?.name
    : undefined;
  switch (name) {
    case "StalePrice":
      return "Reference price is older than 24 hours. Wait for a feed update, then refresh.";
    case "InvalidPrice":
    case "IncompleteRound":
    case "InvalidPriceTimestamp":
      return "The feed returned an invalid or incomplete reference price. Wait for valid feed data, then refresh.";
    case "UnsupportedFeedDecimals":
      return "Feed decimals are unsupported. Verify the fixed feed and deploy a compatible contract.";
    case "QuoteAmountOutOfRange":
      return "The invoice amount cannot be represented safely in tinybars. Ask the merchant for a smaller invoice.";
    case "InvoiceIneligible":
      return "This invoice is no longer payable. Ask the merchant for a new invoice.";
    default:
      return "Quote read unavailable. Check the testnet RPC, deployed quote interface and fixed feed; refresh to retry.";
  }
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
    let quoteResult: QuoteResult;
    if (state !== 0) {
      quoteResult = {
        status: "unavailable",
        reason:
          "This invoice is no longer payable. Ask the merchant for a new invoice.",
      };
    } else if (feed.toLowerCase() !== TESTNET_FEED.toLowerCase()) {
      quoteResult = {
        status: "unavailable",
        reason:
          "This deployment does not use the fixed testnet HBAR/USD feed. Verify the invoice contract with the merchant.",
      };
    } else {
      try {
        const quote = await contract.getFunction("getQuote")(
          identity.invoiceId,
          at,
        );
        if (
          quote.invoiceId !== BigInt(identity.invoiceId) ||
          quote.deadline <= BigInt(block.timestamp)
        ) {
          quoteResult = {
            status: "unavailable",
            reason:
              "The quote has no remaining lifetime. Wait for a feed update and refresh.",
          };
        } else {
          quoteResult = {
            status: "available",
            quote: {
              invoiceId: quote.invoiceId.toString(),
              roundId: quote.roundId.toString(),
              amountTinybars: quote.amountTinybars.toString(),
              deadline: quote.deadline.toString(),
              window: quote.window.toString(),
              priceUpdatedAt: quote.priceUpdatedAt.toString(),
              price: quote.price.toString(),
              feedDecimals: Number(quote.feedDecimals),
            },
          };
        }
      } catch (error) {
        quoteResult = { status: "unavailable", reason: quoteReadError(error) };
      }
    }
    return {
      ...identity,
      merchant,
      recipient,
      feed,
      usdCents: invoice[0].toString(),
      expiresAt: invoice[1].toString(),
      state: state === 0 ? "Open" : state === 1 ? "Expired" : "Cancelled",
      blockNumber: block.number,
      blockTimestamp: block.timestamp.toString(),
      quoteResult,
    };
  } finally {
    provider.destroy();
  }
}
