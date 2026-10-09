import { NextResponse } from "next/server";
import { getLocalBackend } from "@/lib/server-backend";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { request: approvedRequest } = body;

    const { bridge, session } = await getLocalBackend();
    const proof = await bridge.generateProof(approvedRequest, session);

    return NextResponse.json({
      ok: true,
      proof,
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
