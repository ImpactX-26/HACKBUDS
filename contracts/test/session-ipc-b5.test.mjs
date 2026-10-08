import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {startLocalBackend} from '../integration/process-client.mjs';
test('persistent private controller stays callable and executes real proof/transactions until shutdown',async()=>{
  const started=performance.now(),host=await startLocalBackend();let closed=false;
  try {
    assert.equal(host.bundle.bundleVersion,'gv-local-integration-b5/1');assert.ok(existsSync(host.bundlePath));
    assert.equal((await host.call('getPassport',{passportId:'1'})).status,'ACTIVE');
    await assert.rejects(()=>host.call('unknown'),e=>e.code==='METHOD_UNSUPPORTED');
    const make=async consumer=>{
      const signed=await host.call('fixturePolicy',{consumer});assert.ok(!signed.workerSignature);
      await assert.rejects(()=>host.call('generateProof',{request:signed}),e=>e.code==='WORKER_APPROVAL_INVALID');
      const request=await host.call('fixtureApproval',{request:signed});
      const proof=await host.call('generateProof',{request});return {request,proof};
    };
    const w=await make('welfare'),l=await make('loan');
    assert.equal((await host.call('verify',l)).income,'PASS');
    assert.equal((await host.call('claim',w)).status,1);assert.equal((await host.call('borrow',l)).status,1);
    await host.call('approveRepayment');assert.equal((await host.call('repay',{passportId:'1'})).status,1);
    await assert.rejects(()=>host.call('borrow',l),e=>e.code==='REQUEST_REPLAY');
    assert.equal((await host.call('getIdentityState',{passportId:'1'})).principal,'0');
    const status=await host.call('status');assert.equal(status.realProofs,2);
    await host.close();closed=true;assert.equal(existsSync(host.bundlePath),false);
    await assert.rejects(()=>host.call('status'),e=>e.code==='SESSION_CLOSED');
    mkdirSync(resolve('reports'),{recursive:true});writeFileSync(resolve('reports/b5-private-ipc.json'),JSON.stringify({localOnly:true,syntheticOnly:true,
      realProofs:status.realProofs,proofMetrics:status.proofMetrics,elapsedSeconds:(performance.now()-started)/1000,passed:true,cleanupVerified:true},null,2)+'\n');
  }finally{if(!closed)await host.close();}
});
