import { setupReadiness } from "../../lib/setup";
export const dynamic = "force-dynamic";
export default function Setup() {
  const setup = setupReadiness({
    NEXT_PUBLIC_INVOICE_CONTRACT: process.env.NEXT_PUBLIC_INVOICE_CONTRACT,
    NEXT_PUBLIC_HEDERA_RPC_URL: process.env.NEXT_PUBLIC_HEDERA_RPC_URL,
  });
  return (
    <>
      <section className="hero compact">
        <p className="eyebrow">Setup guide</p>
        <h1>
          Know what’s ready.
          <br />
          Know what comes next.
        </h1>
        <p className="lead">
          Local checks prove template operability. Testnet configuration is a
          separate step and requires verification before spending funds.
        </p>
      </section>
      <section className="setup-grid">
        <article className="panel">
          <p className="eyebrow">Configuration</p>
          <h2>{setup.status}</h2>
          <dl>
            <dt>Network</dt>
            <dd>{setup.network}</dd>
            <dt>Chain ID</dt>
            <dd>{setup.chainId}</dd>
            <dt>Public JSON-RPC</dt>
            <dd className="code">{setup.rpc}</dd>
            <dt>Invoice contract</dt>
            <dd className="code">{setup.contract}</dd>
          </dl>
          <p>{setup.guidance}</p>
          <p className="notice">
            No deployment or live payment has been verified. A supplied address
            alone does not establish readiness.
          </p>
        </article>
        <article className="panel">
          <p className="eyebrow">Start locally</p>
          <h2>Local checks</h2>
          <p>No keys, wallet funding or live RPC are needed.</p>
          <pre>
            <code>
              {
                "npm ci\nnpm run check-types\nnpm test\nnpm run lint\nnpm run build\nnpm run start"
              }
            </code>
          </pre>
          <p>Run the reusable clean-generation gate:</p>
          <pre>
            <code>npm run verify:template</code>
          </pre>
          <p className="muted">
            Supported: Node 24.10.0 · npm 11.6.1 · Next.js · Hardhat.
          </p>
        </article>
      </section>
      <section className="prerequisites">
        <h2>Before using testnet</h2>
        <ol>
          <li>
            Confirm an available Hedera testnet JSON-RPC endpoint. The default
            endpoint may be rate-limited or unavailable.
          </li>
          <li>
            Prepare separate merchant and payer accounts in MetaMask, connected
            to Hedera testnet, and fund them with test HBAR.
          </li>
          <li>
            Keep deployment credentials private. Browser configuration uses
            public values only.
          </li>
          <li>
            Deploy the invoice contract at /deploy, verify its merchant and feed
            identity, then set the public contract address. Open /merchant to
            create and share an invoice. Payment follows in later slices.
          </li>
        </ol>
        <p>
          Local Hardhat uses chain ID 31337. It does not reproduce Hedera
          native-value semantics or prove testnet settlement.
        </p>
      </section>
    </>
  );
}
