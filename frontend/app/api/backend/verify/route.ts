import { NextResponse } from "next/server";
import { getLocalBackend } from "@/lib/server-backend";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { request: approvedRequest, proof } = body;

    const { host } = await getLocalBackend();
    const verification = await host.call("verify", { request: approvedRequest, proof });

    return NextResponse.json({
      ok: true,
      verification,
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
