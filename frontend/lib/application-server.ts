import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {NextResponse} from 'next/server';
const state=globalThis as typeof globalThis & {gvApplication?:Promise<any>};
const load=new Function('url','return import(url)');
export const APPLICATION_ORIGIN=process.env.GIGVAULT_APP_ORIGIN??'http://localhost:3000';
const COOKIE='gv_application';
export async function application(){
  if(!state.gvApplication)state.gvApplication=(async()=>{
    const root=resolve(process.cwd(),'../contracts'),cache=resolve(root,'artifacts/demo-setup-cache');
    if(existsSync(resolve(cache,'manifest.json')))process.env.GIGVAULT_LOCAL_SETUP_CACHE=cache;
    const {startLocalBackend}=await load(pathToFileURL(resolve(root,'integration/process-client.mjs')).href);
    return startLocalBackend({port:0,evidenceMode:'application',startupTimeoutMs:600000,onDiagnostic:(m:string)=>console.error(m)});
  })().catch(e=>{state.gvApplication=undefined;throw e;});
  return state.gvApplication;
}
export function token(request:Request){return request.headers.get('cookie')?.split(';').map(x=>x.trim())
  .find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);}
export function sessionCookie(response:NextResponse,value:string){response.cookies.set(COOKIE,value,
  {httpOnly:true,sameSite:'strict',secure:new URL(APPLICATION_ORIGIN).protocol==='https:',path:'/',maxAge:value?1800:0});}
