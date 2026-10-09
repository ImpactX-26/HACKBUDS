import { NextResponse } from "next/server";
import { getLocalBackend } from "@/lib/server-backend";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { passportId = "1" } = body;

    const { host } = await getLocalBackend();
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
