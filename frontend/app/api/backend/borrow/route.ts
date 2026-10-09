import { NextResponse } from "next/server";
import { getLocalBackend } from "@/lib/server-backend";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { request: approvedRequest, proof } = body;

    const { host } = await getLocalBackend();
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
