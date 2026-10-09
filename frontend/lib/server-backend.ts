import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
import {getAddress} from "ethers";
import {NextResponse} from "next/server";

export const APP_ORIGIN = process.env.GIGVAULT_APP_ORIGIN || "http://localhost:3000";
const COOKIE = "gv_local_worker";
const runtime = globalThis as typeof globalThis & {gvBackendPromise?: Promise<any>};
const load = new Function("url", "return import(url);");
export async function getLocalBackend(): Promise<any> {
  if (!runtime.gvBackendPromise) runtime.gvBackendPromise = (async () => {
    const contracts = resolve(process.cwd(), "../contracts");
    const [{startLocalBackend},{createWorkerProofBridge},{createLocalWalletAuth}] = await Promise.all([
      "process-client.mjs", "worker-proof-bridge.mjs", "local-wallet-auth.mjs"
    ].map(name => load(pathToFileURL(resolve(contracts,"integration",name)).href)));
    const host = await startLocalBackend({port:0});
    const auth = createLocalWalletAuth({origin:APP_ORIGIN,domain:{name:"GigVaultLocalSession",version:"1",
      chainId:host.bundle.chainId,verifyingContract:host.bundle.contracts.passport.address}});
    const bridge = createWorkerProofBridge({authenticateWorker:(context:any)=>auth.authenticate(context?.token),
      client:{getPassport:(passportId:string)=>host.call("getPassport",{passportId}),
        generateProof:(request:any)=>host.call("generateProof",{request})}});
    return {host,auth,bridge,bundle:host.bundle};
  })().catch(error => {runtime.gvBackendPromise=undefined;throw error;});
  return runtime.gvBackendPromise;
}
function failure(code:string): never {throw Object.assign(new Error(code),{code});}
export function requireOrigin(request:Request) {
  if(request.headers.get("origin")!==APP_ORIGIN)failure("ORIGIN_REJECTED");
}
export async function requireWorker(request:Request,passportId="1") {
  requireOrigin(request);
  const token=request.headers.get("cookie")?.split(";").map(v=>v.trim()).find(v=>v.startsWith(COOKIE+"="))?.slice(COOKIE.length+1);
  if(!token)failure("AUTHENTICATION_REQUIRED"); // Reject before starting a backend/prover.
  const backend=await getLocalBackend();
  const workerWallet=backend.auth.authenticate(token);
  const passport=await backend.host.call("getPassport",{passportId});
  if(getAddress(workerWallet)!==getAddress(passport.holderWallet))failure("UNAUTHORIZED_WORKER");
  if(passport.status!=="ACTIVE")failure("PASSPORT_REVOKED");
  return {...backend,context:{token},workerWallet};
}
export function routeError(error:any) {
  const code=error.code || "BACKEND_ERROR";
  const status=code==="AUTHENTICATION_REQUIRED"?401:["UNAUTHORIZED_WORKER","ORIGIN_REJECTED"].includes(code)?403:400;
  return NextResponse.json({ok:false,error:error.message || code,code},{status});
}
export function loginCookie(response:NextResponse,token:string) {
  response.cookies.set(COOKIE,token,{httpOnly:true,sameSite:"strict",secure:new URL(APP_ORIGIN).protocol==="https:",path:"/",maxAge:1800});
}
