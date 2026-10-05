"use client";
import { useEffect, useRef, useState } from "react";
import { BrowserProvider, formatUnits } from "ethers";
import {
  formatHbar,
  formatExpiry,
  invoicePath,
  type InvoiceIdentity,
  type InvoiceView,
} from "../lib/invoice";
import {
  reconcilePayment,
  PaymentReverted,
  paymentFailureMessage,
  paymentNotSubmitted,
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
  const walletRevision = useRef(0);
  const currentView = useRef(view);
  currentView.current = view;
  const [failedView, setFailedView] = useState<InvoiceView | null>(null);
  useEffect(() => {
    const injected = (window as Window & { ethereum?: MetaMask }).ethereum;
    function changed() {
      walletRevision.current += 1;
      setPrepared(null);
      setMessage(
        "Wallet account or network changed. Refresh the invoice, estimate fees and approve a new quote. Pending payments still require reconciliation.",
      );
      setFailedView(view);
    }
    injected?.on?.("accountsChanged", changed);
    injected?.on?.("chainChanged", changed);
    injected?.on?.("disconnect", changed);
    return () => {
      injected?.removeListener?.("accountsChanged", changed);
      injected?.removeListener?.("chainChanged", changed);
      injected?.removeListener?.("disconnect", changed);
    };
  }, [view]);
  const context =
    view?.quoteResult.status === "available"
      ? JSON.stringify(view.quoteResult.quote)
      : null;
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    setNow(Date.now());
    try {
      setBlocked(true);
      setAttempt(null);
      setReceipt(null);
      setPrepared(null);
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
  const needsRefresh = view !== null && failedView === view;
  const quoteExpired =
    view?.quoteResult.status === "available" &&
    now !== null &&
    BigInt(Math.floor(now / 1000)) >= BigInt(view.quoteResult.quote.deadline);
  const ready =
    prepared &&
    reviewedView === view &&
    active &&
    !needsRefresh &&
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
      blocked ||
      needsRefresh ||
      quoteExpired
    )
      return;
    inFlight.current = true;
    setBusy(true);
    setPrepared(null);
    setMessage("");
    const revision = walletRevision.current;
    try {
      const result = await preparePayment(
        wallet(),
        identity,
        view.quoteResult.quote,
      );
      if (revision !== walletRevision.current) return;
      setPrepared(result);
      setReviewedView(view);
    } catch (error) {
      setFailedView(view);
      setMessage(paymentFailureMessage(error));
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
    const revision = walletRevision.current;
    let submitted = false;
    let submittedHash = false;
    try {
      finish(
        await submitPayment(wallet(), prepared, (value) => {
          if (
            value.transaction === null &&
            (revision !== walletRevision.current ||
              currentView.current !== view)
          )
            throw new Error(
              "Payment review changed before submission. Refresh the invoice, estimate fees and approve a new quote.",
            );
          save(value);
          submitted = true;
          submittedHash = value.transaction !== null;
        }),
      );
    } catch (error) {
      if (submitted && !submittedHash && paymentNotSubmitted(error)) {
        try {
          localStorage.removeItem(storage);
          setAttempt(null);
        } catch {
          setBlocked(true);
        }
        setMessage(paymentFailureMessage(error));
      } else if (error instanceof PaymentReverted) {
        // Retain the hash until reconciliation also reads current invoice state.
        setMessage(
          error.message +
            " Check payment transaction to reconcile before another attempt.",
        );
      } else {
        setMessage(
          submitted
            ? "Payment outcome unknown. Check the original transaction before another attempt. No retry is permitted."
            : paymentFailureMessage(error),
        );
      }
      setFailedView(view);
      setPrepared(null);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function reconcile() {
    if (!attempt || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    let provider: BrowserProvider | undefined;
    try {
      provider = new BrowserProvider(wallet());
      const outcome = await reconcilePayment(provider, attempt);
      if (outcome.status === "confirmed") finish(outcome.receipt);
      else if (outcome.status === "failed") {
        localStorage.removeItem(storage);
        setAttempt(null);
        setPrepared(null);
        // Hide the stale review until the refreshed authoritative view arrives.
        setReviewedView(null);
        setFailedView(view);
        setMessage(
          "Payment transaction confirmed failed on-chain. No settlement occurred; network fees may have been charged. Current invoice state was checked. Refresh, estimate fees and approve a new quote only if it remains payable.",
        );
        onConfirmed();
      } else if (outcome.status === "settled") {
        setMessage(
          "Invoice settled. This attempt has no verified settlement receipt; do not pay again.",
        );
        onConfirmed();
      } else
        setMessage(
          "Payment outcome unknown. Transaction pending or unavailable; check again later. No retry is permitted.",
        );
    } catch (error) {
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
                disabled={busy || blocked || needsRefresh || !!quoteExpired}
                onClick={estimate}
              >
                Estimate payment network fee
              </button>
              {needsRefresh && (
                <p>
                  Refresh invoice to check current eligibility and quote
                  conditions before another review.
                </p>
              )}
              {quoteExpired && (
                <p>
                  Quote expired. Refresh the invoice, estimate fees and approve
                  a new quote.
                </p>
              )}
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
                Original payer: {attempt.payer} · Network {attempt.chainId}
              </p>
              <p className="code">
                {attempt.transaction ||
                  "Transaction reference unavailable. Check MetaMask activity; no retry is permitted while the outcome is unknown."}
              </p>
              <p className="code">
                Original contract: {attempt.contract} · Invoice{" "}
                {attempt.invoiceId}
              </p>
              {
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={reconcile}
                >
                  Check payment transaction
                </button>
              }
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
