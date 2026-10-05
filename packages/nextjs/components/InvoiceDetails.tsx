"use client";
import { useEffect, useState } from "react";
import CancelInvoice from "./CancelInvoice";
import PayInvoice from "./PayInvoice";
import {
  formatExpiry,
  formatUsd,
  formatHbar,
  invoicePath,
  type InvoiceIdentity,
  type InvoiceView,
} from "../lib/invoice";
export default function InvoiceDetails({
  identity,
}: {
  identity: InvoiceIdentity;
}) {
  const [view, setView] = useState<InvoiceView | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    fetch(`/api${invoicePath(identity)}`, {
      cache: "no-store",
      signal: abort.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data as InvoiceView;
      })
      .then((data) => {
        if (abort.signal.aborted) return;
        setNow(Date.now());
        setView(data);
        setError("");
      })
      .catch((error) => {
        if (!abort.signal.aborted) {
          setView(null);
          setError(error.message);
        }
      });
    return () => abort.abort();
  }, [identity, revision]);
  const quote =
    view?.quoteResult.status === "available" ? view.quoteResult.quote : null;
  const expired =
    quote &&
    now !== null &&
    BigInt(Math.floor(now / 1000)) >= BigInt(quote.deadline);
  return (
    <section className="panel" aria-live="polite" aria-busy={!view && !error}>
      {error ? (
        <p role="alert">{error}</p>
      ) : !view ? (
        <p>Reading authoritative invoice state…</p>
      ) : (
        <>
          <p className="eyebrow">Contract state · block {view.blockNumber}</p>
          <h2>{view.state}</h2>
          <dl>
            <dt>USD amount</dt>
            <dd className="amount">{formatUsd(view.usdCents)}</dd>
            <dt>Immutable expiry (UTC)</dt>
            <dd>{formatExpiry(view.expiresAt)}</dd>
            <dt>Merchant</dt>
            <dd className="code">{view.merchant}</dd>
            <dt>Recipient</dt>
            <dd className="code">{view.recipient}</dd>
            <dt>Fixed HBAR/USD feed</dt>
            <dd className="code">{view.feed}</dd>
          </dl>
          <h3>Reference-price quote</h3>
          {quote && !expired ? (
            <>
              <dl>
                <dt>Exact invoice payment</dt>
                <dd className="amount">{formatHbar(quote.amountTinybars)}</dd>
                <dt>Exact tinybars</dt>
                <dd className="code">{quote.amountTinybars}</dd>
                <dt>Oracle round</dt>
                <dd className="code">{quote.roundId}</dd>
                <dt>Reference price updated (UTC)</dt>
                <dd>{formatExpiry(quote.priceUpdatedAt)}</dd>
                <dt>Reference-price age at read</dt>
                <dd>
                  {(
                    BigInt(view.blockTimestamp) - BigInt(quote.priceUpdatedAt)
                  ).toString()}{" "}
                  seconds
                </dd>
                <dt>Quote deadline (UTC, exclusive)</dt>
                <dd>{formatExpiry(quote.deadline)}</dd>
                <dt>Estimated network fees (separate)</dt>
                <dd>
                  Estimate the actual payment transaction below before approval.
                  Network fees are additional to the exact invoice payment.
                </dd>
              </dl>
              <p className="notice">
                This is an oracle reference price, not a live spot guarantee.
                Quotes last at most five minutes and may expire sooner. A new
                round or window requires a new quote and explicit approval
                before payment.
              </p>
            </>
          ) : (
            <p role="status" aria-label="Quote status">
              No quote:{" "}
              {expired
                ? "The displayed quote expired. Refresh the invoice for a new quote."
                : view.quoteResult.status === "unavailable"
                  ? view.quoteResult.reason
                  : "Refresh to read a quote."}
            </p>
          )}
          <p className="notice">
            State reflects the last successful contract read. Refresh to check
            again.{" "}
            {view.state === "Open"
              ? "Review the quote and estimate the network fee before explicit payment approval."
              : "This invoice is no longer payable. Checkout is unavailable."}
          </p>
          <CancelInvoice
            key={invoicePath(view)}
            view={view}
            onConfirmed={() => {
              setView(null);
              setRevision((value) => value + 1);
            }}
          />
        </>
      )}
      <PayInvoice
        identity={identity}
        view={view}
        onConfirmed={() => {
          setView(null);
          setRevision((value) => value + 1);
        }}
      />
      <button
        type="button"
        className="button secondary"
        onClick={() => {
          setView(null);
          setError("");
          setRevision((value) => value + 1);
        }}
      >
        Refresh invoice
      </button>
    </section>
  );
}
