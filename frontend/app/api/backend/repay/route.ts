import {NextResponse} from "next/server";
import {requireWorker,routeError} from "@/lib/server-backend";
export async function POST(request:Request) {try {
  const {host,bundle}=await requireWorker(request);const {passportId}=await request.json();
  if(passportId!==bundle.fixture.passportId)throw new Error("Unsupported local passport");
  const approveTx=await host.call("approveRepayment",{actor:"worker"});
  const repayTx=await host.call("repay",{passportId,actor:"worker"});
  const identityState=await host.call("getIdentityState",{passportId});
  return NextResponse.json({ok:true,approveTx,repayTx,identityState});
}catch(error){return routeError(error);}}
