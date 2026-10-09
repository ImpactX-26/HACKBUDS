import {NextResponse} from "next/server";
import {requireWorker,routeError} from "@/lib/server-backend";
export async function POST(request:Request) {try {
  const {host,bundle}=await requireWorker(request);const {request:approvedRequest,proof}=await request.json();
  if(approvedRequest.passportId!==bundle.fixture.passportId)throw new Error("Unsupported local passport");
  const tx=await host.call("claim",{request:approvedRequest,proof,actor:"worker"});
  const identityState=await host.call("getIdentityState",{passportId:approvedRequest.passportId});
  return NextResponse.json({ok:true,tx,identityState});
}catch(error){return routeError(error);}}
