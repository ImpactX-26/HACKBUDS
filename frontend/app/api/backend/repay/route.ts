import { NextResponse } from "next/server";
import { getLocalBackend } from "@/lib/server-backend";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { passportId = "1", workerWallet } = body;

    if (!workerWallet || typeof workerWallet !== "string" || !workerWallet.startsWith("0x")) {
      return NextResponse.json(
        { ok: false, error: "AUTHENTICATION_REQUIRED: Verified worker wallet authentication is required." },
        { status: 401 }
      );
    }

    const { host, bundle } = await getLocalBackend();
    if (workerWallet.toLowerCase() !== bundle.fixture.holder.toLowerCase()) {
      return NextResponse.json(
        { ok: false, error: "UNAUTHORIZED_WORKER: Authenticated wallet is not the passport holder." },
        { status: 403 }
      );
    }

    const approveTx = await host.call("approveRepayment", { actor: "worker" });
    const repayTx = await host.call("repay", { passportId, actor: "worker" });
    const identityState = await host.call("getIdentityState", { passportId });

    return NextResponse.json({
      ok: true,
      approveTx,
      repayTx,
      identityState,
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
