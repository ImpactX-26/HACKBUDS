import {NextResponse} from "next/server";
import {getLocalBackend,requireOrigin,routeError,loginCookie} from "@/lib/server-backend";
export async function POST(request:Request) {try {
  requireOrigin(request);const {nonce,signature}=await request.json();
  const {auth}=await getLocalBackend();const session=auth.login(nonce,signature);
  const response=NextResponse.json({ok:true,workerWallet:session.workerWallet});
  loginCookie(response,session.token);return response;
}catch(error){return routeError(error);}}
