import {AsyncLocalStorage} from 'node:async_hooks';
import {randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {createServer} from 'node:http';
import {BackendError} from './errors.mjs';

/** Runs the unchanged, SHA-verified A handoff router on private loopback only.
 * Financial payloads remain inside its injected adapter; HTTP carries authorization
 * artifacts only. The resolver is called by B AFTER its independent preflight.
 * This is a local A HTTP router, not a connection to a separately deployed A server.
 */
export async function createPrivateAHandoff({createAttestationApp,attestation,passportClient,fip,idp,replay,
  trustedFipPublicKeys,commitment,translate}){
  const secret=randomBytes(32).toString('hex'),pending=new Map(),scope=new AsyncLocalStorage();
  const proverAdapter={isMockAdapter:false,adapterName:'B_PRIVATE_RECONSTRUCTION_HANDOFF_NOT_A_PROOF',
    async handoffWitness(payload){
      const context=scope.getStore();if(!context||context.envelope)throw Error('Private handoff context unavailable');
      context.envelope=translate(payload,context.current);
      // Receipt for a transient handoff only. B generates the real Groth16 proof afterward.
      return {success:true,proverJobId:randomUUID(),isMockProof:false,adapterName:this.adapterName,
        witnessHash:payload.snapshot.evidenceDataHash,publicSignals:[]};
    }};
  const app=createAttestationApp({attestationService:attestation,passportContract:passportClient,fipService:fip,
    idp,replayRegistry:replay,expectedChainId:1337,strictAuthentication:true,trustedFipPublicKeys,
    commitmentAdapter:commitment,proverAdapter});
  const server=createServer((req,res)=>{
    const supplied=Buffer.from(String(req.headers.authorization??'')),expected=Buffer.from('Bearer '+secret);
    if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected)){
      res.writeHead(401,{'Content-Type':'application/json'});res.end('{"error":"PRIVATE_TRANSPORT_REQUIRED"}');return;
    }
    if(req.method!=='POST'||req.url!=='/attestation/prover/handoff'){
      res.writeHead(404);res.end();return;
    }
    const capability=req.headers['x-handoff-capability'],context=pending.get(capability);
    if(!context){res.writeHead(403);res.end();return;}
    pending.delete(capability);
    scope.run(context,()=>app(req,res));
  });
  await new Promise((ok,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',ok);});
  const url=`http://127.0.0.1:${server.address().port}/attestation/prover/handoff`;
  return {
    async reconstruct(input,current){
      const capability=randomBytes(32).toString('hex'),context={current};pending.set(capability,context);
      try{
        const result=await fetch(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),
          headers:{'Content-Type':'application/json',Authorization:'Bearer '+secret,'x-handoff-capability':capability},
          body:JSON.stringify(input)});
        const receipt=await result.json();
        if(!result.ok||!receipt.success||!context.envelope)throw new BackendError('A_RECONSTRUCTION_REJECTED','Authenticated A HTTP handoff rejected.');
        return context.envelope;
      }finally{pending.delete(capability);delete context.envelope;}
    },
    // Public URL alone provides no capability; exposed privately for transport rejection tests.
    url,
    async close(){pending.clear();server.closeAllConnections();await new Promise(ok=>server.close(ok));}
  };
}
