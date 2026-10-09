import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createWorkerProofBridge} from '../integration/worker-proof-bridge.mjs';
const holder='0x0000000000000000000000000000000000000001';
test('configuration requires a trusted authentication callback',()=>{
  assert.throws(()=>createWorkerProofBridge({client:{}}),TypeError);
});
test('authentication failures stop before passport reads or proving',async()=>{
  let calls=0;const client={getPassport:()=>{calls++;},generateProof:()=>{calls++;}};
  for(const result of [null,undefined,'invalid-wallet']){
    const bridge=createWorkerProofBridge({client,authenticateWorker:()=>result});
    await assert.rejects(()=>bridge.generateProof({passportId:'1'},{}),e=>e.code==='AUTHENTICATION_REQUIRED');
  }assert.equal(calls,0);
});
test('another authenticated wallet cannot invoke private proving',async()=>{
  let proofs=0;const bridge=createWorkerProofBridge({authenticateWorker:()=>holder,
    client:{getPassport:async()=>({holderWallet:'0x0000000000000000000000000000000000000002'}),generateProof:()=>{proofs++;}}});
  await assert.rejects(()=>bridge.generateProof({passportId:'1'},{}),e=>e.code==='UNAUTHORIZED_WORKER');assert.equal(proofs,0);
});
test('chain lookup failures remain errors and do not invoke proving',async()=>{
  let proofs=0;const bridge=createWorkerProofBridge({authenticateWorker:()=>holder,
    client:{getPassport:async()=>{throw Error('chain offline');},generateProof:()=>{proofs++;}}});
  await assert.rejects(()=>bridge.generateProof({passportId:'1'},{}),/chain offline/);assert.equal(proofs,0);
});
test('capture request before awaited authentication and preserve SDK rejection',async()=>{
  const request={passportId:'1',workerSignature:'original'};
  const bridge=createWorkerProofBridge({authenticateWorker:async()=>{request.workerSignature='changed';return holder;},
    client:{getPassport:async()=>({holderWallet:holder}),generateProof:async r=>{
      assert.equal(r.workerSignature,'original');throw Error('WORKER_APPROVAL_INVALID');}}});
  await assert.rejects(()=>bridge.generateProof(request,{}),/WORKER_APPROVAL_INVALID/);
});
test('adapter exposes only proving and passes server context to authentication',async()=>{
  const context={trustedSessionId:'test-only'},result={publicSignals:['1']};
  const bridge=createWorkerProofBridge({authenticateWorker:c=>{assert.equal(c,context);return holder;},
    client:{getPassport:async()=>({holderWallet:holder}),generateProof:async()=>result}});
  assert.deepEqual(Object.keys(bridge),['generateProof']);assert.equal(await bridge.generateProof({passportId:'1'},context),result);
});
