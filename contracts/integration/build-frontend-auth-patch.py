"""Prepare an isolated, exact-checkpoint frontend patch; never edit owner's checkout."""
import subprocess, pathlib, json, difflib, sys
REPO = pathlib.Path(__file__).resolve().parents[2]
PIN = '4e9e77cb5d872aa247309a1f26da29d6c8940e56'
ROOT = REPO/'contracts/artifacts/frontend-auth-review'
def git(*args): return subprocess.check_output(['git',*args],cwd=REPO)
def old(path):
    try: return subprocess.check_output(['git','show',f'{PIN}:{path}'],cwd=REPO,stderr=subprocess.DEVNULL).decode().replace('\r\n','\n')
    except subprocess.CalledProcessError: return ''
def put(path, text):
    out=ROOT/path;out.parent.mkdir(parents=True,exist_ok=True);out.write_text(text,encoding='utf-8')
if '--patch' in sys.argv:
    parts=[]
    for out in sorted((ROOT/'frontend').rglob('*')):
        if not out.is_file() or any(p in ('node_modules','.next') for p in out.parts): continue
        path=out.relative_to(ROOT).as_posix()
        if path.endswith(('tsbuildinfo','next-env.d.ts')): continue
        try:before=subprocess.check_output(['git','show',f'{PIN}:{path}'],cwd=REPO,stderr=subprocess.DEVNULL).decode()
        except subprocess.CalledProcessError:before=''
        after=out.read_bytes().decode('utf-8')
        # Preserve existing file line endings so the patch reviews code, not EOL churn.
        if before:
            after=after.replace('\r\n','\n')
            if before.count('\r\n')>before.count('\n')/2:after=after.replace('\n','\r\n')
        if before==after:continue
        parts.append(f'diff --git a/{path} b/{path}\n')
        if not before:parts.append('new file mode 100644\n')
        parts.extend(difflib.unified_diff(before.splitlines(True),after.splitlines(True),fromfile=f'a/{path}' if before else '/dev/null',tofile=f'b/{path}'))
    target=REPO/'contracts/integration/frontend-auth-fix.patch'
    target.write_bytes(''.join(parts).encode('utf-8'));print(target);sys.exit()
if '--base' in sys.argv:
    base=REPO/'contracts/artifacts/frontend-auth-base'
    if base.exists():raise RuntimeError('Preserve existing base folder; do not overwrite it.')
    for path in git('ls-tree','-r','--name-only',PIN,'frontend').decode().splitlines():
        out=base/path;out.parent.mkdir(parents=True,exist_ok=True);out.write_bytes(git('show',f'{PIN}:{path}'))
    print(base);sys.exit()
if ROOT.exists():raise RuntimeError('Review folder already exists; preserve it and use --patch after editing there.')
for path in git('ls-tree','-r','--name-only',PIN,'frontend').decode().splitlines():
    out=ROOT/path;out.parent.mkdir(parents=True,exist_ok=True);out.write_bytes(git('show',f'{PIN}:{path}'))
put('frontend/lib/server-backend.ts', '''import {pathToFileURL} from "node:url";
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
''')
put('frontend/app/api/backend/auth/challenge/route.ts','''import {NextResponse} from "next/server";
import {getLocalBackend,requireOrigin,routeError} from "@/lib/server-backend";
export async function POST(request:Request) {try {
  requireOrigin(request);const {host,auth}=await getLocalBackend();
  const passport=await host.call("getPassport",{passportId:"1"});
  return NextResponse.json({ok:true,challenge:auth.challenge(passport.holderWallet)});
}catch(error){return routeError(error);}}
''')
put('frontend/app/api/backend/auth/verify/route.ts','''import {NextResponse} from "next/server";
import {getLocalBackend,requireOrigin,routeError,loginCookie} from "@/lib/server-backend";
export async function POST(request:Request) {try {
  requireOrigin(request);const {nonce,signature}=await request.json();
  const {auth}=await getLocalBackend();const session=auth.login(nonce,signature);
  const response=NextResponse.json({ok:true,workerWallet:session.workerWallet});
  loginCookie(response,session.token);return response;
}catch(error){return routeError(error);}}
''')
put('frontend/app/api/backend/policy/route.ts','''import {NextResponse} from "next/server";
import {getLocalBackend,routeError} from "@/lib/server-backend";
export async function GET(request:Request) {try {
  const consumer=new URL(request.url).searchParams.get("consumer") || "loan";
  if(!["loan","welfare"].includes(consumer))throw new Error("Unsupported consumer");
  const {host}=await getLocalBackend();const policyRequest=await host.call("fixturePolicy",{consumer});
  const approval=await host.call("getApproval",{request:policyRequest});
  return NextResponse.json({ok:true,policyRequest,approval});
}catch(error){return routeError(error);}}
''')
put('frontend/app/api/backend/prove/route.ts','''import {NextResponse} from "next/server";
import {requireWorker,routeError} from "@/lib/server-backend";
export async function POST(request:Request) {try {
  const backend=await requireWorker(request);const {request:approvedRequest}=await request.json();
  const proof=await backend.bridge.generateProof(approvedRequest,backend.context);
  return NextResponse.json({ok:true,proof});
}catch(error){return routeError(error);}}
''')
for action in ['claim','borrow']:
    put(f'frontend/app/api/backend/{action}/route.ts',f'''import {{NextResponse}} from "next/server";
import {{requireWorker,routeError}} from "@/lib/server-backend";
export async function POST(request:Request) {{try {{
  const {{host}}=await requireWorker(request);const {{request:approvedRequest,proof}}=await request.json();
  if(approvedRequest.passportId!=="1")throw new Error("Unsupported local passport");
  const tx=await host.call("{action}",{{request:approvedRequest,proof,actor:"worker"}});
  const identityState=await host.call("getIdentityState",{{passportId:"1"}});
  return NextResponse.json({{ok:true,tx,identityState}});
}}catch(error){{return routeError(error);}}}}
''')
put('frontend/app/api/backend/repay/route.ts','''import {NextResponse} from "next/server";
import {requireWorker,routeError} from "@/lib/server-backend";
export async function POST(request:Request) {try {
  const {host}=await requireWorker(request);const {passportId="1"}=await request.json();
  if(passportId!=="1")throw new Error("Unsupported local passport");
  const approveTx=await host.call("approveRepayment",{actor:"worker"});
  const repayTx=await host.call("repay",{passportId,actor:"worker"});
  const identityState=await host.call("getIdentityState",{passportId});
  return NextResponse.json({ok:true,approveTx,repayTx,identityState});
}catch(error){return routeError(error);}}
''')
page=old('frontend/app/live/page.tsx')
page=page.replace('import { approvalTypes, approvalFor, domainFor, TypedDataEncoder } from "../../../contracts/proposal/authorization-v02.mjs";',
 'import {BrowserProvider, JsonRpcProvider, TypedDataEncoder, verifyTypedData} from "ethers";')
page=page.replace('const [policyData, setPolicyData]', 'const [useLocalWallet, setUseLocalWallet] = useState(true);\n  const [policyData, setPolicyData]')
start=page.index('  // 1. Fetch Policy');end=page.index('  // 2. Call Private Prover Bridge',start)
page=page[:start]+'''  async function signWorkerTypedData(domain:any,types:any,value:any) {
    if(!sessionData)throw new Error("Load the local session first");
    const holder=sessionData.passport.holderWallet;
    let signature:string;
    if(useLocalWallet){
      // Explicit local synthetic mode: unlocked loopback Ganache account, no key export.
      const provider=new JsonRpcProvider(sessionData.rpcUrl);
      try {signature=await provider.send("eth_signTypedData_v4",[holder,TypedDataEncoder.getPayload(domain,types,value)]);}
      finally {provider.destroy();}
    }else{
      const ethereum=(window as any).ethereum;if(!ethereum)throw new Error("Connect an EVM wallet, or select the local synthetic development wallet");
      const provider=new BrowserProvider(ethereum);await provider.send("eth_requestAccounts",[]);
      const signer=await provider.getSigner();
      if((await signer.getAddress()).toLowerCase()!==holder.toLowerCase())throw new Error("Connected wallet is not this passport's holder");
      signature=await signer.signTypedData(domain,types,value);
    }
    if(verifyTypedData(domain,types,value,signature).toLowerCase()!==holder.toLowerCase())throw new Error("Worker signature verification failed");
    return signature;
  }
  async function handleGetPolicyAndApprove() {
    try {
      setBusyAction("policy");setApprovedReq(null);setZkProofPackage(null);setVerifyOutcome(null);
      const p=await fetch(`/api/backend/policy?consumer=${consumer}`).then(r=>r.json());
      if(!p.ok)throw new Error(p.error);setPolicyData(p.policyRequest);
      const c=await fetch("/api/backend/auth/challenge",{method:"POST"}).then(r=>r.json());
      if(!c.ok)throw new Error(c.error);
      const loginSignature=await signWorkerTypedData(c.challenge.domain,c.challenge.types,c.challenge.value);
      const login=await fetch("/api/backend/auth/verify",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({nonce:c.challenge.value.nonce,signature:loginSignature})}).then(r=>r.json());
      if(!login.ok)throw new Error(login.error);
      // Separate real signature over B's exact live policy/domain/current evidence.
      const workerSignature=await signWorkerTypedData(p.approval.domain,p.approval.types,p.approval.value);
      setApprovedReq({...p.policyRequest,workerSignature});
      log("✓ Wallet ownership authenticated; exact worker EIP-712 approval signed and verified.");
    }catch(err:any){log(`✕ Approval error: ${err.message}`);}
    finally{setBusyAction(null);}
  }

'''+page[end:]
# The existing rejection buttons now test absence of authentication, not merely a wrong address.
page=page.replace('body: JSON.stringify({ request: approvedReq, workerWallet: callerWallet }),',
  'credentials: invalidAuth ? "omit" : "same-origin",\n        body: JSON.stringify({ request: approvedReq }),')
page=page.replace('body: JSON.stringify({ request: approvedReq, proof: zkProofPackage, workerWallet: callerWallet }),',
  'credentials: invalidAuth ? "omit" : "same-origin",\n        body: JSON.stringify({ request: approvedReq, proof: zkProofPackage }),')
# claim has the same parameter in the original file; all conditional uses remain in their functions.
page=page.replace('body: JSON.stringify({ passportId: "1", workerWallet: callerWallet }),','body: JSON.stringify({ passportId: "1" }),')
anchor='            {/* Policy & Approval Display */}'
assert anchor in page
page=page.replace(anchor,'''            <label style={{display:"block",marginBottom:12}}>
              <input type="checkbox" checked={useLocalWallet} onChange={e=>setUseLocalWallet(e.target.checked)} />
              {" "}Use local synthetic EVM development wallet (unlocked loopback account; test funds only).
            </label>
'''+anchor)
page=page.replace('{policyData.policy.minActivePeriods} wks','{policyData.policy.minActivePeriods} {policyData.policy.activityIsWeekly === "1" ? "completed weeks" : "completed months"}')
page=page.replace('Calculated via official calculateGigScore from contracts/integration/gig-score.mjs',
 'Illustrative score example, not derived from this passport. Calculated via official calculateGigScore.')
assert 'dummyWorkerSignature' not in page and '0x482615' not in page
put('frontend/app/live/page.tsx',page)
package=json.loads(old('frontend/package.json'));package['dependencies']['ethers']='6.15.0'
put('frontend/package.json',json.dumps(package,indent=2)+'\n')
put('frontend/next.config.mjs',"import {fileURLToPath} from 'node:url';\n"+old('frontend/next.config.mjs').replace('reactStrictMode: true,',"reactStrictMode: true,\n  outputFileTracingRoot: fileURLToPath(new URL('../', import.meta.url)),"))
print(ROOT)
