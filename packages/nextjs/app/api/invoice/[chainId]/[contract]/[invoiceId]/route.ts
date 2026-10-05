import { NextResponse } from "next/server";
import { invoiceIdentity, readInvoice } from "../../../../../../lib/invoice";
import { setupReadiness } from "../../../../../../lib/setup";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ chainId: string; contract: string; invoiceId: string }>;
  },
) {
  const input = await params;
  let identity;
  try {
    identity = invoiceIdentity(input.chainId, input.contract, input.invoiceId);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
  const setup = setupReadiness({
    NEXT_PUBLIC_HEDERA_RPC_URL: process.env.NEXT_PUBLIC_HEDERA_RPC_URL,
  });
  if (!setup.rpc.startsWith("https://"))
    return NextResponse.json(
      { error: "Configure a public HTTPS testnet RPC." },
      { status: 503 },
    );
  try {
    return NextResponse.json(await readInvoice(identity, setup.rpc), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const missing = String(error).includes("InvoiceNotFound");
    return NextResponse.json(
      {
        error: missing
          ? "Invoice does not exist at this contract."
          : "Invoice state unavailable. Check the testnet RPC and contract; refresh to try the read again.",
      },
      { status: missing ? 404 : 503 },
    );
  }
}
