import {NextResponse} from "next/server";
import {requireWorker,routeError} from "@/lib/server-backend";
export async function POST(request:Request) {try {
  const backend=await requireWorker(request);const {request:approvedRequest}=await request.json();
  const proof=await backend.bridge.generateProof(approvedRequest,backend.context);
  return NextResponse.json({ok:true,proof});
}catch(error){return routeError(error);}}
