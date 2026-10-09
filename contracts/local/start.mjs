import {createInterface} from 'node:readline';
import {createSeededSession} from './session.mjs';
import {BackendError,safeError} from '../integration/errors.mjs';
// Private stdio/parent-child IPC controller. No web listener for proving or fixture signing.
const originalLog=console.log;console.log=(...values)=>console.error(...values);
let session,queue=Promise.resolve(),stopping=false;
const output=value=>process.stdout.write(JSON.stringify(value)+'\n');
const port=process.argv[2]===undefined?8545:Number(process.argv[2]);
if(!Number.isInteger(port)||port<0||port>65535)throw Error('Invalid local port');
session=await createSeededSession({port});console.log=originalLog;
const info={event:'ready',rpcUrl:session.bundle.rpcUrl,bundlePath:session.bundlePath,fixture:session.bundle.fixture,
  privateInterface:session.bundle.privateInterface};
output(info);process.send?.({...info,bundle:session.bundle});
const actor=name=>session.fixtureSigner(name??'worker');
async function dispatch(method,p={}) {
  switch(method) {
    case 'getPassport':return session.client.getPassport(p.passportId);
    case 'getNextPassportId':return session.client.getNextPassportId();
    case 'getActivePassportByIdentity':return session.client.getActivePassportByIdentity(p.identity);
    case 'isReissueAllowed':return session.client.isReissueAllowed(p.identity);
    case 'getIdentityState':return session.client.getIdentityState(p.passportId);
    case 'getApproval':return session.client.getApproval(p.request);
    case 'generateProof':return session.client.generateProof(p.request);
    case 'verify':return session.client.verify(p.request,p.proof);
    case 'claim':return session.client.claim(p.request,p.proof,actor(p.actor));
    case 'borrow':return session.client.borrow(p.request,p.proof,actor(p.actor));
    case 'approveRepayment':return session.client.approveRepayment(actor(p.actor));
    case 'repay':return session.client.repay(p.passportId,actor(p.actor));
    case 'fixturePolicy':return session.fixtures.signedRequest(p.consumer,p.options);
    case 'fixtureApproval':return session.fixtures.approve(p.request,p.actor);
    case 'status':return session.stats;
    case 'close':stopping=true;await session.close();return {closed:true};
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
const shutdown=()=>{if(stopping)return;stopping=true;queue=queue.then(async()=>{await session.close();process.exit(0);});};
process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);process.once('disconnect',shutdown);
