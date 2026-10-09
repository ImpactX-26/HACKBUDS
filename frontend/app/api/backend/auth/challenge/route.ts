import {NextResponse} from "next/server";
import {getLocalBackend,requireOrigin,routeError} from "@/lib/server-backend";
export async function POST(request:Request) {try {
  requireOrigin(request);const {host,auth}=await getLocalBackend();
  const passport=await host.call("getPassport",{passportId:"1"});
  return NextResponse.json({ok:true,challenge:auth.challenge(passport.holderWallet)});
}catch(error){return routeError(error);}}
