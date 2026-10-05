import Merchant from "../../components/Merchant";
import { setupReadiness } from "../../lib/setup";
export const dynamic = "force-dynamic";
export default function MerchantPage() {
  const setup = setupReadiness({
    NEXT_PUBLIC_INVOICE_CONTRACT: process.env.NEXT_PUBLIC_INVOICE_CONTRACT,
    NEXT_PUBLIC_HEDERA_RPC_URL: process.env.NEXT_PUBLIC_HEDERA_RPC_URL,
  });
  return (
    <>
      <section className="hero compact">
        <p className="eyebrow">Hedera testnet · merchant</p>
        <h1>Create. Inspect. Share.</h1>
        <p className="lead">
          Fix a USD amount and expiry, then share the confirmed invoice’s public
          link.
        </p>
        <p>{setup.status}</p>
      </section>
      <Merchant
        contract={setup.contract.startsWith("0x") ? setup.contract : null}
      />
    </>
  );
}
