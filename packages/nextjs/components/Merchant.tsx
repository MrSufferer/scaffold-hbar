"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { invoicePath, parseCents, type InvoiceIdentity } from "../lib/invoice";
import {
  createdInvoice,
  submitCreation,
  walletMessage,
  type CreationAttempt,
  type MetaMask,
} from "../lib/wallet";
import { BrowserProvider } from "ethers";
function wallet(): MetaMask {
  const provider = (window as Window & { ethereum?: MetaMask }).ethereum;
  if (!provider)
    throw new Error("Install and unlock MetaMask to create an invoice.");
  return provider;
}
const STORAGE = "hbar-invoices:creation";
export default function Merchant({ contract }: { contract: string | null }) {
  const [amount, setAmount] = useState("1.25");
  const [expiry, setExpiry] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState<CreationAttempt | null>(null);
  const [recoveryBlocked, setRecoveryBlocked] = useState(true);
  const [invoice, setInvoice] = useState<InvoiceIdentity | null>(null);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE);
      if (saved) {
        const restored = JSON.parse(saved) as CreationAttempt;
        if (
          restored.chainId !== 296 ||
          !/^0x[0-9a-fA-F]{40}$/.test(restored.contract) ||
          !/^0x[0-9a-fA-F]{64}$/.test(restored.transaction)
        )
          throw new Error("Invalid recovery context");
        setAttempt(restored);
      }
      setRecoveryBlocked(false);
    } catch {
      setMessage(
        "Saved creation context is unavailable. Check your wallet activity before creating another invoice.",
      );
    }
  }, []);
  async function create(event: FormEvent) {
    event.preventDefault();
    if (!contract || busy || attempt || recoveryBlocked) return;
    setBusy(true);
    setMessage("");
    setInvoice(null);
    let submitted = false;
    try {
      const cents = parseCents(amount);
      const seconds = BigInt(Math.floor(new Date(expiry).getTime() / 1000));
      if (
        seconds <= BigInt(Math.floor(Date.now() / 1000)) ||
        seconds >= 2n ** 64n
      )
        throw new Error("Choose a future invoice expiry.");
      const created = await submitCreation(
        wallet(),
        contract,
        cents,
        seconds,
        (pending) => {
          submitted = true;
          setAttempt(pending);
          try {
            localStorage.setItem(STORAGE, JSON.stringify(pending));
          } catch {
            setMessage(
              "Creation submitted, but recovery could not be saved. Keep the transaction reference below.",
            );
          }
        },
      );
      setInvoice(created);
      setAttempt(null);
      try {
        localStorage.removeItem(STORAGE);
      } catch {
        /* Confirmed outcome remains confirmed; stale storage can be reconciled again. */
      }
      setMessage("Invoice creation confirmed.");
    } catch (error) {
      setMessage(
        submitted
          ? "Creation outcome unknown. Check the submitted transaction before creating another invoice."
          : walletMessage(error),
      );
    } finally {
      setBusy(false);
    }
  }
  async function reconcile() {
    if (!attempt || busy) return;
    setBusy(true);
    let provider: BrowserProvider | undefined;
    try {
      provider = new BrowserProvider(wallet());
      if ((await provider.getNetwork()).chainId !== BigInt(attempt.chainId))
        throw new Error(
          "Switch MetaMask to the original Hedera testnet network.",
        );
      const receipt = await provider.getTransactionReceipt(attempt.transaction);
      if (!receipt)
        throw new Error(
          "Creation outcome unknown. Transaction is pending or unavailable; check again later.",
        );
      if (receipt.status === 0) {
        setMessage(
          "Creation transaction reverted. You may review the terms and try again.",
        );
      } else {
        setInvoice(createdInvoice(receipt.logs, attempt.contract));
        setMessage("Invoice creation confirmed.");
      }
      setAttempt(null);
      try {
        localStorage.removeItem(STORAGE);
      } catch {
        /* Confirmed outcome remains confirmed; stale storage can be reconciled again. */
      }
    } catch (error) {
      setMessage(walletMessage(error));
    } finally {
      provider?.destroy();
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h2>Create an invoice</h2>
      <p>
        Only the fixed merchant can create invoices. MetaMask requests your
        approval; network fees are paid in test HBAR.
      </p>
      <dl>
        <dt>Configured contract</dt>
        <dd className="code">{contract || "Configuration needed"}</dd>
      </dl>
      {!contract && (
        <p>
          <Link href="/deploy">Deploy the invoice contract</Link>, then set
          NEXT_PUBLIC_INVOICE_CONTRACT and rebuild.
        </p>
      )}
      <form onSubmit={create}>
        <label htmlFor="amount">USD amount</label>
        <input
          id="amount"
          name="amount"
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          required
          disabled={busy || !!attempt}
          aria-describedby="amount-help"
        />
        <p id="amount-help" className="muted">
          Positive whole cents, such as 1.25 USD. No names or descriptions are
          stored on chain.
        </p>
        <label htmlFor="expiry">Expiry (your local time)</label>
        <input
          id="expiry"
          name="expiry"
          type="datetime-local"
          value={expiry}
          onChange={(event) => setExpiry(event.target.value)}
          required
          disabled={busy || !!attempt}
        />
        <p className="muted">
          Terms are immutable. The contract checks expiry against consensus
          time.
        </p>
        <button
          className="button"
          disabled={!contract || busy || !!attempt || recoveryBlocked}
        >
          {busy ? "Waiting for wallet / confirmation…" : "Create with MetaMask"}
        </button>
      </form>
      <p role="status">{message}</p>
      {attempt && (
        <aside className="notice">
          <h3>Creation outcome pending</h3>
          <p className="code">{attempt.transaction}</p>
          <p className="code">Original contract: {attempt.contract}</p>
          <button
            className="button secondary"
            type="button"
            disabled={busy}
            onClick={reconcile}
          >
            Check creation transaction
          </button>
        </aside>
      )}
      {invoice && (
        <aside className="notice">
          <h3>Share this invoice</h3>
          <Link href={invoicePath(invoice)} className="code">
            {invoicePath(invoice)}
          </Link>
          <p>
            This link is a locator, not proof of merchant identity. Open it and
            copy the full URL to share.
          </p>
        </aside>
      )}
    </section>
  );
}
