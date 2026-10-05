import {
  BrowserProvider,
  Contract,
  Interface,
  isAddress,
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
import { merchantSigner, type MetaMask } from "./wallet.ts";

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
  if (receipt.status === 0)
    throw new Error(
      "Payment transaction reverted. Refresh invoice before reviewing a new quote.",
    );
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
        "Insufficient test HBAR for invoice payment and network fees.",
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
    if ((await wallet.request({ method: "eth_chainId" })) !== "0x128")
      throw new Error("Switch MetaMask to Hedera testnet (296).");
    checkContext(original, original.quote);
    // Persist intent before prompting: a transport error may hide a submitted hash.
    onSubmitting({ ...original, transaction: null });
    const tx = await signer.sendTransaction({
      ...request,
      chainId: TESTNET_CHAIN,
    });
    onSubmitting({ ...original, transaction: tx.hash });
    await tx.wait(1, 60_000);
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
