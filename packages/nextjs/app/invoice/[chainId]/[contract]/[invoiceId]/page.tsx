import InvoiceDetails from "../../../../../components/InvoiceDetails";
import { invoiceIdentity } from "../../../../../lib/invoice";
export const dynamic = "force-dynamic";
export default async function Invoice({
  params,
}: {
  params: Promise<{ chainId: string; contract: string; invoiceId: string }>;
}) {
  const input = await params;
  let identity;
  try {
    identity = invoiceIdentity(input.chainId, input.contract, input.invoiceId);
  } catch (error) {
    return (
      <section className="hero compact">
        <h1>Invalid invoice link</h1>
        <p role="alert">{(error as Error).message}</p>
      </section>
    );
  }
  return (
    <>
      <section className="hero compact">
        <p className="eyebrow">Public invoice</p>
        <h1>Inspect invoice {identity.invoiceId}</h1>
        <p className="lead">
          No wallet or payer account is needed. This link locates an invoice; it
          does not authenticate the merchant.
        </p>
        <dl>
          <dt>Network</dt>
          <dd>Hedera testnet · chain ID 296</dd>
          <dt>Contract from this link</dt>
          <dd className="code">{identity.contract}</dd>
          <dt>Invoice ID</dt>
          <dd className="code">{identity.invoiceId}</dd>
        </dl>
      </section>
      <InvoiceDetails identity={identity} />
    </>
  );
}
