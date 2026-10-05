import {
  BrowserProvider,
  Contract,
  Interface,
  isAddress,
  isError,
  type TransactionReceipt,
} from "ethers";
import {
  artifact,
  invoiceIdentity,
  TESTNET_CHAIN,
  TESTNET_FEED,
  type InvoiceIdentity,
  type InvoiceQuote,
} from "./invoice.ts";
import {
  isTestnetChain,
  merchantSigner,
  walletMessage,
  type MetaMask,
} from "./wallet.ts";

export const WEIBARS_PER_TINYBAR = 10000000000n;
export type PreparedPayment = InvoiceIdentity & {
  quote: InvoiceQuote;
  payer: string;
  gasLimit: string;
  gasPrice: string;
  feeWeibars: string;
};
export type PaymentAttempt = PreparedPayment & { transaction: string | null };
export type SettlementReceipt = InvoiceIdentity & {
  transaction: string;
  blockNumber: number;
  payer: string;
  amountTinybars: string;
  roundId: string;
};
export function paymentValue(tinybars: string) {
  if (
    !/^[1-9][0-9]*$/.test(tinybars) ||
    BigInt(tinybars) > 9223372036854775807n
  )
    throw new Error("Invalid exact tinybar payment.");
  return BigInt(tinybars) * WEIBARS_PER_TINYBAR;
}
export class PaymentReverted extends Error {
  constructor() {
    super(
      "Payment transaction reverted on-chain. No settlement occurred; network fees may have been charged. Refresh the invoice, estimate fees and approve a new quote only if it remains payable.",
    );
  }
}
export function paymentFailureMessage(error: unknown): string {
  const item = error as {
    code?: string | number;
    data?: string;
    revert?: { name?: string };
    info?: { error?: { data?: string } };
  } | null;
  let name = item?.revert?.name;
  if (!name) {
    try {
      const data = item?.data || item?.info?.error?.data;
      if (typeof data === "string")
        name = new Interface(artifact.abi).parseError(data)?.name;
    } catch {
      /* Unrecognized RPC data is not evidence of an on-chain failure. */
    }
  }
  switch (name) {
    case "QuoteChanged":
      return "Quote changed: the oracle round or quote context no longer matches your review. Refresh the invoice, estimate fees and approve a new quote.";
    case "QuoteExpired":
      return "Quote expired. Refresh the invoice, estimate fees and approve a new quote.";
    case "StalePrice":
      return "Reference price is older than 24 hours. Wait for a feed update, then refresh and review a new quote.";
    case "InvalidPrice":
    case "IncompleteRound":
    case "InvalidPriceTimestamp":
      return "The feed returned an invalid or incomplete reference price. Wait for valid feed data, then refresh and review a new quote.";
    case "FeedUnavailable":
      return "Feed read unavailable. Check the testnet RPC and fixed feed; refresh after reads recover. Payment is blocked.";
    case "InvoiceIneligible":
    case "InvoiceAlreadyCancelled":
    case "InvoiceAlreadySettled":
      return "Invoice is cancelled, expired or already settled. Refresh to check its final state; ask the merchant for a new invoice if needed.";
    case "RecipientDeliveryFailed":
      return "Recipient delivery failed. Ask the merchant to check recipient payment acceptance, then refresh before a new review.";
    case "UnsupportedFeedDecimals":
    case "QuoteAmountOutOfRange":
      return "Payment quote cannot be represented safely. Verify the fixed feed/deployment or ask the merchant for a smaller invoice.";
  }
  if (item?.code === 4001 || isError(error, "ACTION_REJECTED"))
    return "Request rejected in MetaMask before submission. No payment was sent. Refresh the invoice, estimate fees and approve a new quote when ready.";
  if (isError(error, "INSUFFICIENT_FUNDS"))
    return "Insufficient test HBAR for invoice payment and network fees. Fund the connected payer, then refresh, estimate fees and approve a new quote.";
  if (isError(error, "CALL_EXCEPTION"))
    return "Payment validation failed before submission. Check invoice eligibility, testnet RPC and feed; refresh and review a new quote.";
  return walletMessage(error);
}
export function paymentNotSubmitted(error: unknown) {
  const item = error as { code?: string | number } | null;
  return (
    item?.code === 4001 ||
    isError(error, "ACTION_REJECTED") ||
    isError(error, "INSUFFICIENT_FUNDS")
  );
}
export function settlementEvidence(
  receipt: Pick<TransactionReceipt, "status" | "hash" | "blockNumber"> & {
    logs: ReadonlyArray<{
      address: string;
      topics: ReadonlyArray<string>;
      data: string;
    }>;
  },
  identity: InvoiceIdentity,
): SettlementReceipt {
  if (receipt.status === 0) throw new PaymentReverted();
  if (receipt.status !== 1) throw new Error("Payment outcome unknown.");
  const abi = new Interface(artifact.abi);
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== identity.contract.toLowerCase()) continue;
    try {
      const event = abi.parseLog({ topics: [...log.topics], data: log.data });
      if (
        event?.name === "InvoiceSettled" &&
        event.args.invoiceId.toString() === identity.invoiceId
      )
        return {
          ...identity,
          transaction: receipt.hash,
          blockNumber: receipt.blockNumber,
          payer: event.args.payer,
          amountTinybars: event.args.amountTinybars.toString(),
          roundId: event.args.roundId.toString(),
        };
    } catch {
      /* Other event. */
    }
  }
  throw new Error(
    "Payment outcome unknown: no matching confirmed InvoiceSettled event.",
  );
}
export function parsePaymentAttempt(
  saved: string,
  identity: InvoiceIdentity,
): PaymentAttempt {
  const attempt = JSON.parse(saved) as PaymentAttempt;
  const invalid = () => {
    throw new Error(
      "Saved payment context unavailable. Check wallet activity before another attempt.",
    );
  };
  if (
    !attempt ||
    attempt.chainId !== identity.chainId ||
    attempt.contract?.toLowerCase() !== identity.contract.toLowerCase() ||
    attempt.invoiceId !== identity.invoiceId
  )
    invalid();
  invoiceIdentity(String(attempt.chainId), attempt.contract, attempt.invoiceId);
  if (
    !isAddress(attempt.payer) ||
    !attempt.quote ||
    attempt.quote.invoiceId !== identity.invoiceId
  )
    invalid();
  for (const field of [
    attempt.quote.roundId,
    attempt.quote.deadline,
    attempt.quote.window,
    attempt.quote.priceUpdatedAt,
    attempt.quote.price,
    attempt.gasLimit,
    attempt.gasPrice,
    attempt.feeWeibars,
  ])
    if (typeof field !== "string" || !/^[0-9]+$/.test(field)) invalid();
  paymentValue(attempt.quote.amountTinybars);
  if (
    !Number.isInteger(attempt.quote.feedDecimals) ||
    attempt.quote.feedDecimals < 0 ||
    attempt.quote.feedDecimals > 18
  )
    invalid();
  if (
    attempt.transaction !== null &&
    (typeof attempt.transaction !== "string" ||
      !/^0x[0-9a-fA-F]{64}$/.test(attempt.transaction))
  )
    invalid();
  return attempt;
}
function checkContext(identity: InvoiceIdentity, quote: InvoiceQuote) {
  if (
    identity.chainId !== TESTNET_CHAIN ||
    quote.invoiceId !== identity.invoiceId
  )
    throw new Error(
      "Payment identity changed. Refresh and review a new quote.",
    );
  paymentValue(quote.amountTinybars);
  if (BigInt(Math.floor(Date.now() / 1000)) >= BigInt(quote.deadline))
    throw new Error("Quote expired. Refresh and approve a new quote.");
}
export async function preparePayment(
  wallet: MetaMask,
  identity: InvoiceIdentity,
  reviewed: InvoiceQuote,
): Promise<PreparedPayment> {
  const quote = { ...reviewed };
  checkContext(identity, quote);
  const { provider, signer } = await merchantSigner(wallet);
  try {
    const contract = new Contract(identity.contract, artifact.abi, signer);
    if (
      (await contract.getFunction("feed")()).toLowerCase() !==
      TESTNET_FEED.toLowerCase()
    )
      throw new Error("Verify the fixed HBAR/USD feed before payment.");
    const [gas, fees] = await Promise.all([
      contract
        .getFunction("payInvoice")
        .estimateGas(quote, { value: paymentValue(quote.amountTinybars) }),
      provider.getFeeData(),
    ]);
    if (fees.gasPrice === null || fees.gasPrice <= 0n)
      throw new Error(
        "Payment network fee estimate unavailable. Retry fee estimation before approval.",
      );
    const gasLimit = (gas * 120n + 99n) / 100n;
    const fee = gasLimit * fees.gasPrice;
    const payer = await signer.getAddress();
    if (
      (await provider.getBalance(payer)) <
      paymentValue(quote.amountTinybars) + fee
    )
      throw new Error(
        "Insufficient test HBAR for invoice payment and network fees. Fund the connected payer, then refresh, estimate fees and approve a new quote.",
      );
    return {
      ...identity,
      quote,
      payer,
      gasLimit: gasLimit.toString(),
      gasPrice: fees.gasPrice.toString(),
      feeWeibars: fee.toString(),
    };
  } finally {
    provider.destroy();
  }
}
export async function confirmedPayment(
  provider: BrowserProvider,
  transaction: string,
  identity: InvoiceIdentity,
  expected?: PreparedPayment,
): Promise<SettlementReceipt | null> {
  if ((await provider.getNetwork()).chainId !== BigInt(identity.chainId))
    throw new Error("Switch MetaMask to the original Hedera testnet network.");
  const receipt = await provider.getTransactionReceipt(transaction);
  if (!receipt) return null;
  const evidence = settlementEvidence(receipt, identity);
  if (
    expected &&
    (evidence.payer.toLowerCase() !== expected.payer.toLowerCase() ||
      evidence.amountTinybars !== expected.quote.amountTinybars ||
      evidence.roundId !== expected.quote.roundId)
  )
    throw new Error(
      "Payment outcome unknown: settlement differs from approved context.",
    );
  const contract = new Contract(identity.contract, artifact.abi, provider);
  const at = { blockTag: receipt.blockNumber };
  const [invoice, paid] = await Promise.all([
    contract.getFunction("getInvoice")(identity.invoiceId, at),
    contract.getFunction("getSettlement")(identity.invoiceId, at),
  ]);
  if (
    Number(invoice[2]) !== 3 ||
    paid[0].toLowerCase() !== evidence.payer.toLowerCase() ||
    paid[1].toString() !== evidence.amountTinybars ||
    paid[2].toString() !== evidence.roundId
  )
    throw new Error(
      "Payment outcome unknown: authoritative settlement read does not match evidence.",
    );
  return evidence;
}
export type PaymentRecovery =
  | { status: "unknown" }
  | { status: "confirmed"; receipt: SettlementReceipt }
  | { status: "failed"; invoiceState: number }
  | { status: "settled" };

// A revert alone cannot authorize retry: read the original invoice first.
export async function reconcilePayment(
  provider: BrowserProvider,
  attempt: PaymentAttempt,
): Promise<PaymentRecovery> {
  if ((await provider.getNetwork()).chainId !== BigInt(attempt.chainId))
    throw new Error("Switch MetaMask to the original Hedera testnet network.");
  const receipt = attempt.transaction
    ? await provider.getTransactionReceipt(attempt.transaction)
    : null;
  if (receipt?.status === 1) {
    const evidence = await confirmedPayment(
      provider,
      attempt.transaction!,
      attempt,
      attempt,
    );
    return evidence
      ? { status: "confirmed", receipt: evidence }
      : { status: "unknown" };
  }
  const contract = new Contract(attempt.contract, artifact.abi, provider);
  const invoice = await contract.getFunction("getInvoice")(attempt.invoiceId);
  const state = Number(invoice[2]);
  if (![0, 1, 2, 3].includes(state))
    throw new Error("Payment outcome unknown: unsupported invoice state.");
  if (state === 3) return { status: "settled" };
  if (receipt?.status === 0) return { status: "failed", invoiceState: state };
  return { status: "unknown" };
}

export async function submitPayment(
  wallet: MetaMask,
  approved: PreparedPayment,
  onSubmitting: (attempt: PaymentAttempt) => void,
): Promise<SettlementReceipt> {
  const original = { ...approved, quote: { ...approved.quote } };
  checkContext(original, original.quote);
  const { provider, signer } = await merchantSigner(wallet);
  try {
    if (
      (await signer.getAddress()).toLowerCase() !== original.payer.toLowerCase()
    )
      throw new Error(
        "Payer account changed. Estimate fees and review approval again.",
      );
    const contract = new Contract(original.contract, artifact.abi, signer);
    await contract.getFunction("validateQuote")(original.quote);
    const request = await contract
      .getFunction("payInvoice")
      .populateTransaction(original.quote, {
        value: paymentValue(original.quote.amountTinybars),
        gasLimit: BigInt(original.gasLimit),
        gasPrice: BigInt(original.gasPrice),
      });
    if (!isTestnetChain(await wallet.request({ method: "eth_chainId" })))
      throw new Error("Switch MetaMask to Hedera testnet (296).");
    const accounts = (await wallet.request({
      method: "eth_accounts",
    })) as string[];
    if (accounts[0]?.toLowerCase() !== original.payer.toLowerCase())
      throw new Error(
        "Payer account changed. Refresh the invoice, estimate fees and approve a new quote.",
      );
    checkContext(original, original.quote);
    // Persist intent before prompting: a transport error may hide a submitted hash.
    onSubmitting({ ...original, transaction: null });
    const tx = await signer.sendTransaction({
      ...request,
      chainId: TESTNET_CHAIN,
    });
    onSubmitting({ ...original, transaction: tx.hash });
    try {
      await tx.wait(1, 60_000);
    } catch (error) {
      // Only a receipt from the original hash can establish a confirmed revert.
      const receipt = await provider.getTransactionReceipt(tx.hash);
      if (receipt?.status === 0) throw new PaymentReverted();
      throw error;
    }
    const confirmed = await confirmedPayment(
      provider,
      tx.hash,
      original,
      original,
    );
    if (!confirmed)
      throw new Error(
        "Payment outcome unknown. Check the original transaction before retrying.",
      );
    return confirmed;
  } finally {
    provider.destroy();
  }
}
