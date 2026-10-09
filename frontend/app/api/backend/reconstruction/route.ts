import {NextResponse} from "next/server";
import {requireWorker,routeError} from "@/lib/server-backend";
export async function POST(request:Request){try{
 const {host,bundle}=await requireWorker(request);
 if(bundle.evidenceSource?.mode!=="backend-a-http")throw Error("A_NOT_CONNECTED");
 const body=await request.json();
 if(body.walletAuthorization){const result=await host.call("registerAReconstruction",{walletAuthorization:body.walletAuthorization});return NextResponse.json({ok:true,...result});}
 const authorization=await host.call("getAReconstructionAuthorization");
 return NextResponse.json({ok:true,authorization});
}catch(error){return routeError(error);}}
