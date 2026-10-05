"use client";
import { useEffect, useRef, useState } from "react";
import { BrowserProvider, formatUnits, isError } from "ethers";
import {
  formatHbar,
  formatExpiry,
  invoicePath,
  type InvoiceIdentity,
  type InvoiceView,
} from "../lib/invoice";
import {
  confirmedPayment,
  parsePaymentAttempt,
  preparePayment,
  submitPayment,
  type PaymentAttempt,
  type PreparedPayment,
  type SettlementReceipt,
} from "../lib/payment";
import { walletMessage, type MetaMask } from "../lib/wallet";

function wallet(): MetaMask {
  const provider = (window as Window & { ethereum?: MetaMask }).ethereum;
  if (!provider)
    throw new Error("Install and unlock MetaMask to pay an invoice.");
  return provider;
}
export default function PayInvoice({
  identity,
  view,
  onConfirmed,
}: {
  identity: InvoiceIdentity;
  view: InvoiceView | null;
  onConfirmed: () => void;
}) {
  const storage = `hbar-invoices:payment:v1:${invoicePath(identity)}`;
  const [attempt, setAttempt] = useState<PaymentAttempt | null>(null);
  const [prepared, setPrepared] = useState<PreparedPayment | null>(null);
  const [reviewedView, setReviewedView] = useState<InvoiceView | null>(null);
  const [receipt, setReceipt] = useState<SettlementReceipt | null>(null);
  const [blocked, setBlocked] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [now, setNow] = useState<number | null>(null);
  const inFlight = useRef(false);
  const context =
    view?.quoteResult.status === "available"
      ? JSON.stringify(view.quoteResult.quote)
      : null;
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    setNow(Date.now());
    try {
      const saved = localStorage.getItem(storage);
      if (saved) setAttempt(parsePaymentAttempt(saved, identity));
      setBlocked(false);
    } catch {
      setMessage(
        "Saved payment context unavailable. Check wallet activity before another attempt.",
      );
    }
    return () => clearInterval(timer);
  }, [storage, identity]);
  const active = view?.state === "Open" && context !== null;
  const ready =
    prepared &&
    reviewedView === view &&
    active &&
    JSON.stringify(prepared.quote) === context &&
    now !== null &&
    BigInt(Math.floor(now / 1000)) < BigInt(prepared.quote.deadline);
  function save(value: PaymentAttempt) {
    // Storage must work before a wallet prompt; once a hash exists keep it visible even if storage fails.
    if (value.transaction === null)
      localStorage.setItem(storage, JSON.stringify(value));
    else {
      try {
        localStorage.setItem(storage, JSON.stringify(value));
      } catch {
        setMessage(
          "Payment submitted; recovery could not be saved. Keep the transaction reference.",
        );
      }
    }
    setAttempt(value);
  }
  function finish(evidence: SettlementReceipt) {
    setReceipt(evidence);
    setPrepared(null);
    setMessage(
      "Payment confirmed by settlement event and authoritative contract state.",
    );
    onConfirmed();
  }
  async function estimate() {
    if (
      !active ||
      !view ||
      view.quoteResult.status !== "available" ||
      inFlight.current ||
      attempt ||
      blocked
    )
      return;
    inFlight.current = true;
    setBusy(true);
    setPrepared(null);
    setMessage("");
    try {
      setPrepared(
        await preparePayment(wallet(), identity, view.quoteResult.quote),
      );
      setReviewedView(view);
    } catch (error) {
      setMessage(
        isError(error, "CALL_EXCEPTION")
          ? "Payment validation failed. Refresh the invoice and review a new quote; feed or eligibility may have changed."
          : walletMessage(error),
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function pay() {
    if (!ready || !prepared || attempt || blocked || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage("");
    let submitted = false;
    let submittedHash = false;
    try {
      finish(
        await submitPayment(wallet(), prepared, (value) => {
          save(value);
          submitted = true;
          submittedHash = value.transaction !== null;
        }),
      );
    } catch (error) {
      if (
        submitted &&
        !submittedHash &&
        (isError(error, "ACTION_REJECTED") ||
          isError(error, "INSUFFICIENT_FUNDS"))
      ) {
        try {
          localStorage.removeItem(storage);
          setAttempt(null);
        } catch {
          setBlocked(true);
        }
        setMessage(walletMessage(error));
      } else
        setMessage(
          submitted
            ? "Payment outcome unknown. Check the original transaction before another attempt."
            : isError(error, "CALL_EXCEPTION")
              ? "Payment validation failed. Refresh the invoice and review a new quote; feed or eligibility may have changed."
              : walletMessage(error),
        );
      setPrepared(null);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function reconcile() {
    if (!attempt?.transaction || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    let provider: BrowserProvider | undefined;
    try {
      provider = new BrowserProvider(wallet());
      const evidence = await confirmedPayment(
        provider,
        attempt.transaction,
        identity,
        attempt,
      );
      if (!evidence)
        throw new Error(
          "Payment outcome unknown. Transaction pending or unavailable; check again later.",
        );
      finish(evidence);
    } catch (error) {
      // A confirmed revert cannot be a receipt; refresh state before offering a new quote.
      if (
        error instanceof Error &&
        error.message.startsWith("Payment transaction reverted.")
      ) {
        try {
          localStorage.removeItem(storage);
          setAttempt(null);
        } catch {
          setBlocked(true);
        }
        setPrepared(null);
        onConfirmed();
      }
      setMessage(walletMessage(error));
    } finally {
      provider?.destroy();
      inFlight.current = false;
      setBusy(false);
    }
  }
  if (!active && !attempt && !receipt && !blocked) return null;
  return (
    <aside className="notice" aria-label="Invoice payment" aria-busy={busy}>
      <h3>
        {receipt ? "Confirmed payment receipt" : "Pay exact reviewed quote"}
      </h3>
      {receipt ? (
        <>
          <dl>
            <dt>Payer</dt>
            <dd className="code">{receipt.payer}</dd>
            <dt>Paid amount</dt>
            <dd>
              {formatHbar(receipt.amountTinybars)} · {receipt.amountTinybars}{" "}
              tinybars
            </dd>
            <dt>Accepted oracle round</dt>
            <dd>{receipt.roundId}</dd>
            <dt>Confirmed block</dt>
            <dd>{receipt.blockNumber}</dd>
          </dl>
          <a
            href={`https://hashscan.io/testnet/transaction/${receipt.transaction}`}
            target="_blank"
            rel="noreferrer"
          >
            View confirmed transaction on HashScan
          </a>
          <p className="code">{receipt.transaction}</p>
          <p>
            Original contract: <span className="code">{identity.contract}</span>{" "}
            · Invoice {identity.invoiceId}
          </p>
        </>
      ) : (
        <>
          {active && !attempt && (
            <>
              <p>
                Estimate the payment transaction fee, then explicitly approve
                the exact quote. MetaMask shows the final network fee
                separately.
              </p>
              <button
                type="button"
                className="button secondary"
                disabled={busy || blocked}
                onClick={estimate}
              >
                Estimate payment network fee
              </button>
              {ready ? (
                <>
                  <dl>
                    <dt>Exact approved payment</dt>
                    <dd>{formatHbar(prepared.quote.amountTinybars)}</dd>
                    <dt>Approved oracle round</dt>
                    <dd>{prepared.quote.roundId}</dd>
                    <dt>Approval deadline (UTC, exclusive)</dt>
                    <dd>{formatExpiry(prepared.quote.deadline)}</dd>
                    <dt>Payer</dt>
                    <dd className="code">{prepared.payer}</dd>
                    <dt>
                      Estimated network fee (separate, gas limit × gas price)
                    </dt>
                    <dd>{formatUnits(prepared.feeWeibars, 18)} HBAR</dd>
                  </dl>
                  <button
                    type="button"
                    className="button"
                    disabled={busy || blocked}
                    onClick={pay}
                  >
                    Approve exact quote and pay with MetaMask
                  </button>
                </>
              ) : (
                prepared && (
                  <p>
                    Quote changed or expired. Refresh, estimate fees and approve
                    a new quote.
                  </p>
                )
              )}
            </>
          )}
          {attempt && (
            <>
              <h4>Payment outcome pending</h4>
              <p className="code">
                {attempt.transaction ||
                  "Transaction reference unavailable. Check MetaMask activity; no retry is permitted while the outcome is unknown."}
              </p>
              <p className="code">
                Original contract: {attempt.contract} · Invoice{" "}
                {attempt.invoiceId}
              </p>
              {attempt.transaction && (
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={reconcile}
                >
                  Check payment transaction
                </button>
              )}
            </>
          )}
        </>
      )}
      <p role="status" aria-label="Payment status">
        {busy ? "Waiting for wallet / confirmation…" : message}
      </p>
    </aside>
  );
}
