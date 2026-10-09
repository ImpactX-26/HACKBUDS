import { NextResponse } from "next/server";
import { getLocalBackend } from "@/lib/server-backend";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const consumer = searchParams.get("consumer") || "loan";
    const { host, bundle } = await getLocalBackend();

    // Returns ONLY the verifier-signed policy without calling fixtureApproval
    const policyRequest = await host.call("fixturePolicy", { consumer });

    return NextResponse.json({
      ok: true,
      policyRequest, // Contains { protocolVersion, eligibilityProfile, consumer, passportId, policy, verifierSignature }
      holderWallet: bundle.fixture.holder,
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
