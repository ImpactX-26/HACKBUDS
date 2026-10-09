import { NextResponse } from "next/server";
import { getLocalBackend } from "@/lib/server-backend";

export async function GET() {
  try {
    const { host, bundle } = await getLocalBackend();
    const passport = await host.call("getPassport", { passportId: bundle.fixture.passportId });
    const identityState = await host.call("getIdentityState", { passportId: bundle.fixture.passportId });
    const pipeline = await host.call("status");

    return NextResponse.json({
      ok: true,
      rpcUrl: bundle.rpcUrl,
      setupId: bundle.setupId,
      fixtureHolder: bundle.fixture.holder,
      passport,
      identityState,
      evidenceSource: bundle.evidenceSource ?? {mode:"synthetic"},
      pipeline,
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
