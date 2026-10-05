"use client";
import { useState } from "react";
import { TESTNET_FEED } from "../lib/invoice";
import { deployInvoices, walletMessage, type MetaMask } from "../lib/wallet";
export default function Deploy() {
  const [busy, setBusy] = useState(false);
  const [transaction, setTransaction] = useState("");
  const [address, setAddress] = useState("");
  const [message, setMessage] = useState("");
  async function deploy() {
    setBusy(true);
    setMessage("");
    try {
      const wallet = (window as Window & { ethereum?: MetaMask }).ethereum;
      if (!wallet) throw new Error("Install and unlock MetaMask to deploy.");
      setAddress(await deployInvoices(wallet, setTransaction));
      setMessage(
        "Deployment confirmed. Configure the public address and rebuild the app.",
      );
    } catch (error) {
      setMessage(walletMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h2>Fixed deployment identity</h2>
      <dl>
        <dt>Network</dt>
        <dd>Hedera testnet · 296</dd>
        <dt>Merchant and recipient</dt>
        <dd>The MetaMask account that approves deployment</dd>
        <dt>Fixed HBAR/USD feed</dt>
        <dd className="code">{TESTNET_FEED}</dd>
      </dl>
      <p>
        This invoice contract supports exact approved HBAR payments. Changing merchant, feed or
        rules requires a fresh deployment; existing links stay attached to their
        original contract.
      </p>
      <p>
        Verify the displayed feed address against current Chainlink
        documentation before deploying. Deployment records its identity;
        each quote and payment validates current feed data.
      </p>
      <button
        className="button"
        type="button"
        onClick={deploy}
        disabled={busy || !!transaction}
      >
        {busy ? "Waiting for wallet / confirmation…" : "Deploy with MetaMask"}
      </button>
      <p role="status">{message}</p>
      {transaction && (
        <p className="code">Deployment transaction: {transaction}</p>
      )}
      {transaction && !address && (
        <p>
          Check this transaction in MetaMask or a testnet explorer before
          deploying again. A timeout does not prove failure.
        </p>
      )}
      {address && (
        <>
          <p className="code">Contract: {address}</p>
          <pre>
            <code>NEXT_PUBLIC_INVOICE_CONTRACT={address}</code>
          </pre>
        </>
      )}
    </section>
  );
}
