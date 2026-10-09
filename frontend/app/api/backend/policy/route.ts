import {NextResponse} from "next/server";
import {getLocalBackend,routeError} from "@/lib/server-backend";
export async function GET(request:Request) {try {
  const consumer=new URL(request.url).searchParams.get("consumer") || "loan";
  if(!["loan","welfare"].includes(consumer))throw new Error("Unsupported consumer");
  const {host}=await getLocalBackend();const policyRequest=await host.call("fixturePolicy",{consumer});
  const approval=await host.call("getApproval",{request:policyRequest});
  return NextResponse.json({ok:true,policyRequest,approval});
}catch(error){return routeError(error);}}
