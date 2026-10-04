export function setupReadiness(env: Record<string, string | undefined>) {
  const candidate = env.NEXT_PUBLIC_INVOICE_CONTRACT?.trim();
  const validContract = !!candidate && /^0x[0-9a-fA-F]{40}$/.test(candidate) && !/^0x0{40}$/.test(candidate);
  const rpc = env.NEXT_PUBLIC_HEDERA_RPC_URL?.trim() || 'https://testnet.hashio.io/api';
  let validRpc = false;
  try {
    const url = new URL(rpc);
    validRpc = url.protocol === 'https:' && !url.username && !url.password;
  } catch { /* Invalid RPC remains setup guidance, never live readiness. */ }
  return {
    network: 'Hedera testnet', chainId: 296,
    status: validContract && validRpc ? 'Configuration supplied — unverified' : 'Configuration needed',
    contract: validContract ? candidate : 'No invoice contract configured',
    rpc: validRpc ? rpc : 'Invalid public RPC URL: use HTTPS without credentials',
    liveVerified: false,
    guidance: candidate && !validContract ? 'Replace NEXT_PUBLIC_INVOICE_CONTRACT with a nonzero EVM address.' :
      !validContract ? 'Set NEXT_PUBLIC_INVOICE_CONTRACT after deploying the invoice contract in a later slice.' :
      'Verify contract code, merchant identity, oracle data and RPC availability before connecting a funded wallet.',
  };
}
