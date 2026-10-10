import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {BackendError} from './errors.mjs';
/** Owns private IPC to one synthetic session. Browser clients use the public SDK.
 * A backend owns this capability; no bearer token/key files or proof web endpoint.
 */
export async function startLocalBackend({port=0,startupTimeoutMs=180000,onDiagnostic=()=>{},
  evidenceMode=process.env.GIGVAULT_EVIDENCE_MODE??'synthetic',dataDirectory}={}) {
  if(!['synthetic','backend-a-http','application'].includes(evidenceMode))throw new BackendError('TRANSPORT_UNSUPPORTED','Unsupported local evidence mode.');
  const child=fork(fileURLToPath(new URL(evidenceMode==='application'?'../local/app-start.mjs':'../local/start.mjs',import.meta.url)),[String(port),evidenceMode],{
    stdio:['ignore','ignore','pipe','ipc'],windowsHide:true,serialization:'advanced',
    env:{...process.env,...(dataDirectory?{GIGVAULT_APPLICATION_DATA:dataDirectory}:{})}});
  child.stderr.on('data',bytes=>onDiagnostic(bytes.toString()));
  const pending=new Map();let sequence=0,closed=false;
  let resolveReady,rejectReady;
  const ready=new Promise((ok,no)=>{resolveReady=ok;rejectReady=no;});
  const exited=new Promise(ok=>child.once('exit',ok));
  const timer=setTimeout(()=>{child.kill();rejectReady(new BackendError('STARTUP_TIMEOUT','Local backend startup timed out.'));},startupTimeoutMs);
  child.on('error',()=>rejectReady(new BackendError('BACKEND_UNAVAILABLE','Local backend could not start.')));
  child.on('exit',()=>{closed=true;clearTimeout(timer);rejectReady(new BackendError('SESSION_CLOSED','Local backend exited.'));
    for(const waiter of pending.values())waiter.no(new BackendError('SESSION_CLOSED','The local backend has closed.'));pending.clear();});
  child.on('message',message=>{
    if(message.event==='ready'){clearTimeout(timer);resolveReady(message);return;}
    const waiter=pending.get(message.id);if(!waiter)return;pending.delete(message.id);
    message.ok?waiter.ok(message.result):waiter.no(new BackendError(message.error.code,message.error.message));
  });
  const info=await ready;
  const call=(method,params={})=>{
    if(closed)return Promise.reject(new BackendError('SESSION_CLOSED','The local backend has closed.'));
    return new Promise((ok,no)=>{const id=++sequence;pending.set(id,{ok,no});child.send({id,method,params},error=>{
      if(error){pending.delete(id);no(new BackendError('BACKEND_UNAVAILABLE','Private IPC is unavailable.'));}
    });});
  };
  return Object.freeze({bundle:info.bundle,bundlePath:info.bundlePath,call,
    async close(){if(closed)return;await call('close');await exited;}});
}
