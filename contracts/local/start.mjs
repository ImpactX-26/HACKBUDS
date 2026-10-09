import {createInterface} from 'node:readline';
import {createSeededSession} from './session.mjs';
import {BackendError,safeError} from '../integration/errors.mjs';
import {createBackendAIntegration} from '../integration/backend-a-session.mjs';
import {writeFileSync} from 'node:fs';
// Private stdio/parent-child IPC controller. No web listener for proving or fixture signing.
const originalLog=console.log;console.log=(...values)=>console.error(...values);
let session,backendA,queue=Promise.resolve(),stopping=false;
const output=value=>process.stdout.write(JSON.stringify(value)+'\n');
const port=process.argv[2]===undefined?8545:Number(process.argv[2]);
if(!Number.isInteger(port)||port<0||port>65535)throw Error('Invalid local port');
const evidenceMode=process.argv[3]??'synthetic';
if(!['synthetic','backend-a-http'].includes(evidenceMode))throw Error('Unsupported local evidence mode');
session=await createSeededSession({port});
async function connectBackendA(){
  if(!backendA)backendA=await createBackendAIntegration({session,transport:'private-local-http'});
  session.bundle.fixture={passportId:backendA.passportId,holder:backendA.worker.address,identity:backendA.identity,
    source:'PINNED_BACKEND_A_MOCK_FIP',evidenceHandle:null};
  session.bundle.evidenceSource={mode:'backend-a-http',repository:backendA.sourceManifest.repository,
    commit:backendA.sourceManifest.commit,transport:'private-loopback-http-to-pinned-A-router',
    separatelyRunningAService:false,identityTrust:'SYNTHETIC_MOCK_IDP',workerReconstructionAuthorizationRequired:true};
  writeFileSync(session.bundlePath,JSON.stringify(session.bundle,null,2)+'\n');
  return structuredClone(session.bundle);
}
try{if(evidenceMode==='backend-a-http')await connectBackendA();}
catch(error){await session.close();throw error;}
console.log=originalLog;
const info={event:'ready',rpcUrl:session.bundle.rpcUrl,bundlePath:session.bundlePath,fixture:session.bundle.fixture,
  privateInterface:session.bundle.privateInterface};
output(info);process.send?.({...info,bundle:session.bundle});
const actor=name=>session.fixtureSigner(name??'worker');
const requestClient=r=>backendA&&String(r?.passportId)===backendA.passportId?backendA.api:session.client;
const close=async()=>{await backendA?.close();await session.close();};
async function dispatch(method,p={}) {
  switch(method) {
    case 'getPassport':return session.client.getPassport(p.passportId);
    case 'getNextPassportId':return session.client.getNextPassportId();
    case 'getActivePassportByIdentity':return session.client.getActivePassportByIdentity(p.identity);
    case 'isReissueAllowed':return session.client.isReissueAllowed(p.identity);
    case 'getIdentityState':return session.client.getIdentityState(p.passportId);
    case 'getApproval':return requestClient(p.request).getApproval(p.request);
    case 'generateProof':return requestClient(p.request).generateProof(p.request);
    case 'verify':return requestClient(p.request).verify(p.request,p.proof);
    case 'claim':return requestClient(p.request).claim(p.request,p.proof,actor(p.actor));
    case 'borrow':return requestClient(p.request).borrow(p.request,p.proof,actor(p.actor));
    case 'approveRepayment':return session.client.approveRepayment(actor(p.actor));
    case 'repay':return session.client.repay(p.passportId,actor(p.actor));
    case 'fixturePolicy':return backendA&&(!p.options?.passportId||String(p.options.passportId)===backendA.passportId)
      ?backendA.signedRequest(p.consumer,p.options):session.fixtures.signedRequest(p.consumer,p.options);
    case 'fixtureApproval':return requestClient(p.request).approveRequest(p.request,actor(p.actor));
    case 'connectBackendA':return connectBackendA();
    case 'getAReconstructionAuthorization':
      if(!backendA)throw new BackendError('A_NOT_CONNECTED','Attach A to this local session first.');
      return backendA.reconstructionAuthorization();
    case 'registerAReconstruction':
      if(!backendA)throw new BackendError('A_NOT_CONNECTED','Attach A to this local session first.');
      if(!p.walletAuthorization)throw new BackendError('A_AUTHORIZATION_REQUIRED','Supply the worker-signed A authorization.');
      return {evidenceHandle:backendA.registerReconstruction({walletAuthorization:p.walletAuthorization,
        identityAssertion:backendA.issueAssertion()})};
    case 'status':return {...session.stats,...(backendA?{aReconstructionCalls:backendA.reconstructionCalls}:{} )};
    case 'close':stopping=true;await close();return {closed:true};
    default:throw new BackendError('METHOD_UNSUPPORTED','Unknown private controller operation.');
  }
}
const send=(value,exit=false)=>{
  if(process.connected)process.send(value,()=>{if(exit)process.exit(0);});else output(value);
  if(exit&&!process.connected)process.exit(0);
};
function receive(message) {
  queue=queue.then(async()=>{
    try {
      if(stopping)throw new BackendError('SESSION_CLOSED','The local session is closed.');
      const result=await dispatch(message?.method,message?.params);
      send({id:message?.id,ok:true,result},message.method==='close');
    } catch(error){send({id:message?.id,ok:false,error:safeError(error).toJSON()});}
  });
}
process.on('message',receive);
const lines=createInterface({input:process.stdin,crlfDelay:Infinity});
lines.on('line',line=>{try{receive(JSON.parse(line));}catch{output({ok:false,error:{code:'INVALID_INPUT',message:'Use one JSON command per line.'}});}});
const shutdown=()=>{if(stopping)return;stopping=true;queue=queue.then(async()=>{await close();process.exit(0);});};
process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);process.once('disconnect',shutdown);
