import { NextResponse } from "next/server";
import { getLocalBackend } from "@/lib/server-backend";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const consumer = searchParams.get("consumer") || "loan";
    const { host } = await getLocalBackend();

    const policy = await host.call("fixturePolicy", { consumer });
    const fullApprovedRequest = await host.call("fixtureApproval", { request: policy });

    return NextResponse.json({
      ok: true,
      policy,
      request: fullApprovedRequest,
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
