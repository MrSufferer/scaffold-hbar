"use client";
import { useEffect, useState } from "react";
import { BrowserProvider } from "ethers";
import { invoicePath, type InvoiceView } from "../lib/invoice";
import {
  confirmedCancellation,
  submitCancellation,
  walletMessage,
  type MetaMask,
} from "../lib/wallet";
function wallet(): MetaMask {
  const provider = (window as Window & { ethereum?: MetaMask }).ethereum;
  if (!provider)
    throw new Error("Install and unlock MetaMask to cancel an invoice.");
  return provider;
}
export default function CancelInvoice({
  view,
  onConfirmed,
}: {
  view: InvoiceView;
  onConfirmed: () => void;
}) {
  const storage = `hbar-invoices:cancellation:${invoicePath(view)}`;
  const [transaction, setTransaction] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storage);
      if (saved && !/^0x[0-9a-fA-F]{64}$/.test(saved))
        throw new Error("Invalid recovery context");
      setTransaction(saved);
      setBlocked(false);
    } catch {
      setMessage(
        "Saved cancellation context is unavailable. Check wallet activity before another attempt.",
      );
    }
  }, [storage]);
  function confirmed(message: string) {
    setTransaction(null);
    try {
      localStorage.removeItem(storage);
    } catch {
      /* A stale saved hash can be reconciled again. */
    }
    setMessage(message);
    onConfirmed();
  }
  async function cancel() {
    if (
      busy ||
      blocked ||
      transaction ||
      view.state === "Cancelled" ||
      view.state === "Settled"
    )
      return;
    setBusy(true);
    setMessage("");
    let submitted = false;
    try {
      await submitCancellation(wallet(), view, view.merchant, (hash) => {
        submitted = true;
        setTransaction(hash);
        try {
          localStorage.setItem(storage, hash);
        } catch {
          setMessage(
            "Cancellation submitted, but recovery could not be saved. Keep the transaction reference below.",
          );
        }
      });
      confirmed("Cancellation confirmed. Refreshing authoritative state…");
    } catch (error) {
      setMessage(
        submitted
          ? "Cancellation outcome unknown. Check the original transaction before another attempt."
          : walletMessage(error),
      );
    } finally {
      setBusy(false);
    }
  }
  async function reconcile() {
    if (!transaction || busy) return;
    setBusy(true);
    let provider: BrowserProvider | undefined;
    try {
      provider = new BrowserProvider(wallet());
      if ((await provider.getNetwork()).chainId !== BigInt(view.chainId))
        throw new Error(
          "Switch MetaMask to the original Hedera testnet network.",
        );
      const receipt = await provider.getTransactionReceipt(transaction);
      if (!receipt)
        throw new Error(
          "Cancellation outcome unknown. Transaction is pending or unavailable; check again later.",
        );
      if (receipt.status === 0) {
        confirmed(
          "Cancellation transaction reverted. Refreshing state before another attempt.",
        );
      } else {
        confirmedCancellation(receipt.logs, view);
        confirmed("Cancellation confirmed. Refreshing authoritative state…");
      }
    } catch (error) {
      setMessage(walletMessage(error));
    } finally {
      provider?.destroy();
      setBusy(false);
    }
  }
  return (
    <aside className="notice">
      <h3>Merchant administration</h3>
      <p>
        Only the fixed merchant can cancel this unpaid invoice. Cancellation is
        permanent; MetaMask requests approval and test HBAR network fees.
      </p>
      {view.state !== "Cancelled" && view.state !== "Settled" && (
        <button
          type="button"
          className="button secondary"
          disabled={busy || blocked || !!transaction}
          onClick={cancel}
        >
          {busy ? "Waiting for wallet / confirmation…" : "Cancel with MetaMask"}
        </button>
      )}
      <p role="status">{message}</p>
      {transaction && (
        <>
          <h4>Cancellation outcome pending</h4>
          <p className="code">{transaction}</p>
          <p className="code">
            Original contract: {view.contract} · Invoice {view.invoiceId}
          </p>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={reconcile}
          >
            Check cancellation transaction
          </button>
        </>
      )}
    </aside>
  );
}
