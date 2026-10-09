import { NextResponse } from "next/server";
import { getLocalBackend } from "@/lib/server-backend";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { request: approvedRequest, workerWallet } = body;

    if (!workerWallet || typeof workerWallet !== "string" || !workerWallet.startsWith("0x")) {
      return NextResponse.json(
        { ok: false, error: "AUTHENTICATION_REQUIRED: Verified worker wallet authentication is required before proving." },
        { status: 401 }
      );
    }

    const { bridge } = await getLocalBackend();
    // Pass explicit caller session context { workerWallet } to private prover bridge
    const proof = await bridge.generateProof(approvedRequest, { workerWallet });

    return NextResponse.json({
      ok: true,
      proof,
    });
  } catch (error: any) {
    const status = error.code === "UNAUTHORIZED_WORKER" || error.message?.includes("UNAUTHORIZED_WORKER") ? 403 : 500;
    return NextResponse.json({ ok: false, error: error.message }, { status });
  }
}
