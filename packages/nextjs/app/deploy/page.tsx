import Deploy from "../../components/Deploy";
export default function DeployPage() {
  return (
    <>
      <section className="hero compact">
        <p className="eyebrow">Hedera testnet · setup</p>
        <h1>Deploy your invoice contract.</h1>
        <p className="lead">
          Use a funded merchant MetaMask account on Hedera testnet. Approval
          spends test HBAR on deployment fees.
        </p>
      </section>
      <Deploy />
    </>
  );
}
