import Link from "next/link";
import { setupReadiness } from "../lib/setup";
export const dynamic = "force-dynamic";
export default function Home() {
  const setup = setupReadiness({
    NEXT_PUBLIC_INVOICE_CONTRACT: process.env.NEXT_PUBLIC_INVOICE_CONTRACT,
    NEXT_PUBLIC_HEDERA_RPC_URL: process.env.NEXT_PUBLIC_HEDERA_RPC_URL,
  });
  return (
    <>
      <section className="hero">
        <p className="eyebrow">A developer starting point</p>
        <h1>
          A clear path from
          <br />
          invoice to payment.
        </h1>
        <p className="lead">
          Build USD-reference invoices paid in HBAR. Create an invoice and share
          its public link. Quote and payment support follow in later slices.
        </p>
        <Link href="/merchant" className="button">
          Create an invoice <span aria-hidden="true">↗</span>
        </Link>
      </section>
      <section className="overview" aria-labelledby="workspace-heading">
        <div>
          <p className="eyebrow">Your workspace</p>
          <h2 id="workspace-heading">Built to be understood.</h2>
          <p>
            Separate contract and frontend workspaces give you a small
            foundation to extend. The baseline compiles, tests and boots without
            a funded wallet.
          </p>
        </div>
        <div className="readiness">
          <p className="eyebrow">Setup readiness</p>
          <h3>{setup.status}</h3>
          <p>{setup.contract}</p>
          <p className="muted">
            No deployment or live payment has been verified.
          </p>
          <Link href="/setup">See prerequisites →</Link>
        </div>
      </section>
      <section className="steps" aria-label="Developer journey">
        <article>
          <p className="step-number">01 / Generate</p>
          <h3>A clean project</h3>
          <p>
            Use the published external-template CLI and the supported stack.
          </p>
        </article>
        <article>
          <p className="step-number">02 / Verify</p>
          <h3>Repeatable checks</h3>
          <p>
            Install, typecheck, test, lint, build and check production routes.
          </p>
        </article>
        <article>
          <p className="step-number">03 / Configure</p>
          <h3>Prepare for testnet</h3>
          <p>
            Review RPC, contract and wallet prerequisites before a deployment.
          </p>
        </article>
      </section>
    </>
  );
}
