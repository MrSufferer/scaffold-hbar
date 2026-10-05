"use client";
import { useEffect, useState } from "react";
import CancelInvoice from "./CancelInvoice";
import {
  formatExpiry,
  formatUsd,
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
          <p className="notice">
            State reflects the last successful contract read. Refresh to check
            again.{" "}
            {view.state === "Open"
              ? "Payment is not implemented in this deployment."
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
