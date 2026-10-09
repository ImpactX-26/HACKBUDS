import {NextResponse} from "next/server";
import {requireWorker,routeError} from "@/lib/server-backend";
export async function POST(request:Request) {try {
  const {host}=await requireWorker(request);const {passportId="1"}=await request.json();
  if(passportId!=="1")throw new Error("Unsupported local passport");
  const approveTx=await host.call("approveRepayment",{actor:"worker"});
  const repayTx=await host.call("repay",{passportId,actor:"worker"});
  const identityState=await host.call("getIdentityState",{passportId});
  return NextResponse.json({ok:true,approveTx,repayTx,identityState});
}catch(error){return routeError(error);}}
