import { NextResponse } from "next/server";
import { getLocalBackend } from "@/lib/server-backend";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { request: approvedRequest, proof, workerWallet } = body;

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

    const tx = await host.call("borrow", { request: approvedRequest, proof, actor: "worker" });
    const identityState = await host.call("getIdentityState", { passportId: "1" });

    return NextResponse.json({
      ok: true,
      tx,
      identityState,
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
