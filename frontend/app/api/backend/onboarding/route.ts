import {NextResponse} from "next/server";
import {getLocalBackend,requireWorker,routeError} from "@/lib/server-backend";
export async function POST(request:Request){try{
 await requireWorker(request);
 const body=await request.json();
 if(body.demoAadhaarConfirmed!==true) return NextResponse.json({ok:false,error:"Complete the synthetic Aadhaar step first",code:"DEMO_IDENTITY_STEP_REQUIRED"},{status:400});
 if(body.workerConsent!==true) return NextResponse.json({ok:false,error:"Worker consent is required",code:"CONSENT_REQUIRED"},{status:400});
 const backend=await getLocalBackend();
 backend.bundle=await backend.host.call("connectBackendA");
 const passport=await backend.host.call("getPassport",{passportId:backend.bundle.fixture.passportId});
 return NextResponse.json({ok:true,passport,evidenceSource:backend.bundle.evidenceSource});
}catch(error){return routeError(error);}}
