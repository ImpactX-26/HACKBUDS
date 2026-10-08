import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createSeededSession} from '../local/session.mjs';
import {createBackendClient} from '../integration/client.mjs';
import {snapshot} from '../../circuits/scripts/eligibility-fixtures.mjs';
import {approvalTypes} from '../proposal/authorization-v02.mjs';
let session,api,L,W,loanRequest,welfareRequest,worker,initialBalance,started;
const results=[];let failures=0;
const run=(name,fn)=>test(name,async()=>{try{await fn();results.push(name);}catch(e){failures++;throw e;}});
const code=(fn,expected)=>assert.rejects(fn,error=>{assert.equal(error.code,expected);return true;});
before(async()=>{started=performance.now();session=await createSeededSession();api=session.client;worker=session.fixtureSigner('worker');});
after(async()=>{
  if(!session)return;
  const stats=session.stats,bundle=session.bundle;
  await session.close();
  assert.equal(existsSync(session.bundlePath),false);
  mkdirSync(resolve('reports'),{recursive:true});
  writeFileSync(resolve('reports/b5-integration.json'),JSON.stringify({localOnly:true,syntheticOnly:true,backendAConnected:false,
    passed:results.length,failed:failures,testNames:results,realProofs:stats.realProofs,proofMetrics:stats.proofMetrics,
    elapsedSeconds:(performance.now()-started)/1000,bundle,cleanupVerified:true},null,2)+'\n');
});
run('persistent session seeds ACTIVE passport and exports public versioned bundle',async()=>{
  const bundle=JSON.parse(readFileSync(session.bundlePath,'utf8'));
  assert.equal(bundle.bundleVersion,'gv-local-integration-b5/1');assert.equal(bundle.publicSignalOrder.length,29);
  assert.equal(Object.keys(bundle.contracts).length,6);assert.equal(bundle.privateInterface.publicProofEndpoint,null);
  const json=JSON.stringify(bundle);for(const key of ['monthlyGigIncomeTotals','weeklyActivity','monthlyActivity','secretKey','snapshot','privateKey'])assert.ok(!json.includes('"'+key+'"'));
  const p=await api.getPassport('1');assert.equal(p.status,'ACTIVE');assert.equal(p.evidenceVersion,'1');assert.equal(p.sourceDirectoryVersion,'3');
  assert.equal(await api.getNextPassportId(),'2');assert.equal(await api.getActivePassportByIdentity(p.identityNullifierHash),'1');
  assert.equal(await api.isReissueAllowed(p.identityNullifierHash),false);
  await assert.rejects(()=>api.getPassport('999'),e=>e.code==='PASSPORT_NOT_FOUND');
});
run('public SDK works from exported bundle without a private prover',async()=>{
  const publicApi=createBackendClient({bundle:session.bundle,provider:session.local.provider});
  assert.equal((await publicApi.getPassport('1')).holderWallet,session.bundle.fixture.holder);
  const request=await session.fixtures.approve(await session.fixtures.signedRequest('loan'));
  await code(()=>publicApi.generateProof(request),'PROVER_UNAVAILABLE');
  assert.throws(()=>createBackendClient({bundle:{...session.bundle,bundleVersion:'unknown'},provider:session.local.provider}),e=>e.code==='BUNDLE_UNSUPPORTED');
});
run('explicit policy signing and worker approval are separate; unauthorized proofs do not read evidence',async()=>{
  const signed=await session.fixtures.signedRequest('loan');assert.ok(!signed.workerSignature);
  const before=session.stats.evidenceReads;
  await code(()=>api.generateProof(signed),'WORKER_APPROVAL_INVALID');
  await code(()=>api.approveRequest(signed,session.fixtureSigner('other')),'UNAUTHORIZED_WORKER');
  const approval=await api.getApproval(signed);
  const forged=await session.fixtureSigner('other').signTypedData(approval.domain,approvalTypes,approval.value);
  await code(()=>api.generateProof({...signed,workerSignature:forged}),'WORKER_APPROVAL_INVALID');
  const extra={...signed,policy:{...signed.policy,newCondition:'unbound'}};
  await code(()=>api.generateProof(extra),'INVALID_POLICY');assert.equal(session.stats.evidenceReads,before);
});
run('expired requests and stale evidence have distinct public errors before private access',async()=>{
  const block=await session.local.provider.getBlock('latest');
  const expired=await session.fixtures.signedRequest('loan',{changes:{expiresAt:String(block.timestamp-1)}});
  await code(()=>api.getApproval(expired),'REQUEST_EXPIRED');
  const long=await session.fixtures.signedRequest('loan',{changes:{expiresAt:String(block.timestamp+40*86400)}});
  const point=await session.local.server.provider.request({method:'evm_snapshot',params:[]});
  try {
    await session.local.server.provider.request({method:'evm_increaseTime',params:[31*86400]});
    await session.local.server.provider.request({method:'evm_mine',params:[]});
    await code(()=>api.getApproval(long),'EVIDENCE_STALE');
  }finally{assert.equal(await session.local.server.provider.request({method:'evm_revert',params:[point]}),true);}
});
run('authenticated reconstruction hook rejects altered evidence without private error disclosure',async()=>{
  const request=await session.fixtures.approve(await session.fixtures.signedRequest('loan'));
  const p=await api.getPassport('1');let invoked=0;
  const alternate=session.createClient({reconstruct:async()=>{invoked++;return {protocolVersion:request.protocolVersion,eligibilityProfile:request.eligibilityProfile,
    commitmentProfile:session.bundle.commitmentProfile,schemaVersion:'1',evidenceVersion:p.evidenceVersion,
    snapshot:snapshot({passportId:1n,holderBinding:BigInt(p.holderWallet),evidenceUpdatedAt:BigInt(p.evidenceUpdatedAt),evidenceDataHash:123456788n})};}});
  await code(()=>alternate.generateProof({...request,workerSignature:'0x'}),'WORKER_APPROVAL_INVALID');assert.equal(invoked,0);
  await code(()=>alternate.generateProof(request),'PROVER_REJECTED');assert.equal(invoked,1);
  const throwing=session.createClient({reconstruct:async()=>{throw Error('PRIVATE_SENTINEL');}});
  await assert.rejects(()=>throwing.generateProof(request),e=>e.code==='PROVER_REJECTED'&&!e.message.includes('PRIVATE_SENTINEL'));
});
run('callable adapter produces two real proofs and separate Verify results',async()=>{
  loanRequest=await session.fixtures.approve(await session.fixtures.signedRequest('loan'));
  welfareRequest=await session.fixtures.approve(await session.fixtures.signedRequest('welfare'));
  L=await api.generateProof(loanRequest);W=await api.generateProof(welfareRequest);
  assert.equal(await session.local.math.verifyProof(L.solidity.a,L.solidity.b,L.solidity.c,L.publicSignals),true);
  assert.deepEqual(await api.verify(loanRequest,L),{income:'PASS',history:'PASS',activity:'PASS',enabled:{income:true,history:true,activity:true}});
  const w=await api.verify(welfareRequest,W);assert.equal(w.enabled.income,false);assert.equal(w.history,'PASS');
  assert.equal((await api.getIdentityState('1')).principal,'0');
});
run('modified signals, wrong setup, weaker policy and consumer substitution reject',async()=>{
  const changed=structuredClone(L);changed.publicSignals[0]='0';changed.solidity.signals=[...changed.publicSignals];
  await code(()=>api.verify(loanRequest,changed),'INVALID_PROOF');
  await code(()=>api.verify(loanRequest,{...L,setupId:'other'}),'PROOF_PACKAGE_INVALID');
  await code(()=>api.borrow({...loanRequest,policy:{...loanRequest.policy,minAverageIncomePaise:'1'}},L,worker),'INVALID_POLICY');
  await code(()=>api.claim(loanRequest,L,worker),'CONSUMER_MISMATCH');
});
run('claim and borrow adapters execute actual local transactions for approved worker',async()=>{
  await code(()=>api.borrow(loanRequest,L,session.fixtureSigner('other')),'UNAUTHORIZED_WORKER');
  initialBalance=await session.local.token.balanceOf(session.bundle.fixture.holder);
  const claim=await api.claim(welfareRequest,W,worker);assert.equal(claim.status,1);
  const borrow=await api.borrow(loanRequest,L,worker);assert.equal(borrow.status,1);
  assert.equal(await session.local.token.balanceOf(session.bundle.fixture.holder),initialBalance+100n*10n**6n);
  assert.equal((await api.getIdentityState('1')).principal,'100000000');
});
run('replay and exact repayment errors preserve debt; successful repayment is a real transaction',async()=>{
  await code(()=>api.claim(welfareRequest,W,worker),'REQUEST_REPLAY');
  await code(()=>api.borrow(loanRequest,L,worker),'REQUEST_REPLAY');
  await code(()=>api.repay('1',worker),'INSUFFICIENT_ALLOWANCE');
  assert.equal((await api.approveRepayment(worker)).status,1);assert.equal((await api.repay('1',worker)).status,1);
  assert.equal((await api.getIdentityState('1')).principal,'0');
  await code(()=>api.borrow(loanRequest,L,worker),'REQUEST_REPLAY');await code(()=>api.repay('1',worker),'NO_ACTIVE_LOAN');
});
run('evidence refresh invalidates old approval and old proof; genuine FAIL remains verifiable',async()=>{
  const p=await session.fixtures.refresh('activity-fail');assert.equal(p.evidenceVersion,'2');
  await code(()=>api.generateProof(loanRequest),'WORKER_APPROVAL_INVALID');
  const request=await session.fixtures.approve(await session.fixtures.signedRequest('loan'));
  await code(()=>api.verify(request,L),'EVIDENCE_CHANGED');
  const proof=await api.generateProof(request);assert.equal((await api.verify(request,proof)).activity,'FAIL');
  await code(()=>api.borrow(request,proof,worker),'CONDITION_FAILED');
});
run('fresh approved request can borrow after repayment',async()=>{
  await session.fixtures.refresh('eligible');
  const r=await session.fixtures.approve(await session.fixtures.signedRequest('loan')),p=await api.generateProof(r);
  assert.equal((await api.borrow(r,p,worker)).status,1);
});
run('replacement keeps lifetime claim and debt; new valid proofs cannot reset identity state',async()=>{
  const replacement=await session.fixtures.recover();assert.equal(replacement.passportId,'2');
  assert.equal((await api.getPassport('1')).status,'REVOKED');
  assert.equal(await api.getActivePassportByIdentity(replacement.identityNullifierHash),'2');
  const r=await session.fixtures.approve(await session.fixtures.signedRequest('loan'),'replacement');
  const p=await api.generateProof(r);await code(()=>api.borrow(r,p,session.fixtureSigner('replacement')),'ACTIVE_LOAN');
  const wr=await session.fixtures.approve(await session.fixtures.signedRequest('welfare'),'replacement');
  const wp=await api.generateProof(wr);await code(()=>api.claim(wr,wp,session.fixtureSigner('replacement')),'ALREADY_CLAIMED');
  assert.equal(session.stats.realProofs,6);
  await code(()=>api.getApproval(loanRequest),'PASSPORT_REVOKED');
  await (await session.local.token.transfer(session.bundle.actors.replacement,100n*10n**6n)).wait();
  await api.approveRepayment(session.fixtureSigner('replacement'));await api.repay('2',session.fixtureSigner('replacement'));
  assert.equal((await api.getIdentityState('2')).principal,'0');
});
run('shutdown deletes the session bundle and rejects later calls',async()=>{
  await session.close();await session.close();assert.equal(existsSync(session.bundlePath),false);
  await code(()=>api.getPassport('2'),'SESSION_CLOSED');
});
