import { NextResponse } from "next/server";
import { getLocalBackend } from "@/lib/server-backend";

export async function GET() {
  try {
    const { host, bundle } = await getLocalBackend();
    const passport = await host.call("getPassport", { passportId: "1" });
    const identityState = await host.call("getIdentityState", { passportId: "1" });

    return NextResponse.json({
      ok: true,
      rpcUrl: bundle.rpcUrl,
      setupId: bundle.setupId,
      fixtureHolder: bundle.fixture.holder,
      passport,
      identityState,
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
