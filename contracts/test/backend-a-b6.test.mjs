import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createBackendAIntegration} from '../integration/backend-a-session.mjs';
import {createBackendAPassportClient} from '../integration/backend-a-passport.mjs';
let h,started,L,W,loan,welfare;
const passed=[],receipts=[];let failures=0;
const run=(name,fn)=>test(name,async()=>{try{await fn();passed.push(name);}catch(e){failures++;throw e;}});
const code=(fn,expected)=>assert.rejects(fn,e=>{assert.equal(e.code,expected);return true;});
before(async()=>{started=performance.now();h=await createBackendAIntegration();});
after(async()=>{
  if(!h)return;const stats=h.session.stats,passport=await h.api.getPassport(h.passportId),state=await h.api.getIdentityState(h.passportId);
  const sourceManifest=h.sourceManifest,addresses=Object.fromEntries(Object.entries(h.session.bundle.contracts).map(([k,v])=>[k,v.address]));
  const mintReceipts=[...h.passportClient.receipts];await h.close();assert.equal(existsSync(h.session.bundlePath),false);
  mkdirSync(resolve('reports'),{recursive:true});writeFileSync(resolve('reports/b6-backend-a-local.json'),JSON.stringify({
    localOnly:true,syntheticOnly:true,backendASourceExecuted:true,backendALiveServiceConnected:false,protocolApproved:false,
    sourceManifest,passed:passed.length,failed:failures,testNames:passed,realProofs:stats.realProofs,proofMetrics:stats.proofMetrics,
    reconstructionCalls:h.reconstructionCalls,elapsedSeconds:(performance.now()-started)/1000,addresses,passport,
    finalIdentityState:state,transactions:[...mintReceipts,...receipts],cleanupVerified:true},null,2)+'\n');
});
async function handle(){return h.registerReconstruction({identityAssertion:h.issueAssertion(),
  walletAuthorization:await h.signAction('RECONSTRUCT_EVIDENCE',h.upstream.consentId,Number(h.passportId))});}
async function request(consumer,options={}){
  const signed=await h.signedRequest(consumer,options);signed.evidenceHandle=await handle();return h.approve(signed);
}
run('pinned actual A consent/FIP/Poseidon orchestration mints real passport through B transport',async()=>{
  assert.equal(h.sourceManifest.commit,'c765b2d7f014d702af3c8ee0d0e391055e05d840');assert.equal(h.sourceManifest.files.length,36);
  assert.equal(h.passportClient.isMockClient,false);assert.equal(h.passportId,'2');
  const p=await h.api.getPassport(h.passportId);assert.equal(p.status,'ACTIVE');assert.equal(p.evidenceVersion,'1');
  assert.equal(p.holderWallet.toLowerCase(),h.worker.address.toLowerCase());assert.equal(p.identityNullifierHash,h.identity);
  assert.equal(h.passportClient.receipts[0].status,1);assert.equal(h.reconstructionCalls,0);
  // The independent B5 bootstrap stays usable beside the A-derived passport.
  assert.equal((await h.session.client.getPassport('1')).status,'ACTIVE');
  assert.equal(await h.passportClient.getPassport(999),null);
});
run('A rejects unauthenticated FIP retrieval, tampered signed provenance and mismatched bank owner',async()=>{
  const {fip,storage,FIPVerifier,PERSONAS}=h.upstream;
  assert.throws(()=>fip.fetchSignedDataByConsent(h.upstream.consentId),/AuthenticationRequired/);
  const envelope=fip.fetchSignedDataByConsent(h.upstream.consentId,undefined,undefined,{identityAssertion:h.issueAssertion(),
    walletAuthorization:await h.signAction('FETCH_FINANCIAL_DATA',h.upstream.consentId,Number(h.passportId))});
  const verifier=new FIPVerifier([storage.getPublicKeyPem()]);assert.equal(verifier.verifyEnvelope(envelope,h.identity).valid,true);
  const altered=structuredClone(envelope);altered.payload.transactions[0].amountMinor++;
  assert.throws(()=>verifier.verifyEnvelope(altered,h.identity),/hash mismatch|signature/i);
  assert.throws(()=>verifier.verifyEnvelope(envelope,PERSONAS.ARJUN.identityNullifierHash),/owner binding mismatch/i);
});
run('missing B approval and unsigned policy changes cannot invoke A reconstruction',async()=>{
  const signed=await h.signedRequest('loan');signed.evidenceHandle=await handle();const before=h.reconstructionCalls;
  await code(()=>h.api.generateProof(signed),'WORKER_APPROVAL_INVALID');assert.equal(h.reconstructionCalls,before);
  const approved=await h.approve(signed);
  await code(()=>h.api.generateProof({...approved,policy:{...approved.policy,minAverageIncomePaise:'1'}}),'INVALID_POLICY');
  assert.equal(h.reconstructionCalls,before);
  assert.throws(()=>h.registerReconstruction({}),e=>e.code==='A_AUTHORIZATION_REQUIRED');
});
run('A reconstruction requires its own signed action and rejects replay without replacing B approval',async()=>{
  const auth=await h.signAction('RECONSTRUCT_EVIDENCE',h.upstream.consentId,Number(h.passportId));
  const artifacts={identityAssertion:h.issueAssertion(),walletAuthorization:auth};
  const first=h.registerReconstruction(artifacts),second=h.registerReconstruction(artifacts);
  // Transient envelope must equal current on-chain commitment (no mint-time snapshot reuse).
  const envelope=await h.reconstruct(first);assert.equal(envelope.evidenceVersion,'1');
  await assert.rejects(()=>h.reconstruct(second),/ReplayAttackDetected/);
  await assert.rejects(()=>h.reconstruct(first),/consumed/);
  const wrong=h.registerReconstruction({identityAssertion:h.issueAssertion(),
    walletAuthorization:await h.signAction('MINT_PASSPORT',h.upstream.consentId,Number(h.passportId))});
  await assert.rejects(()=>h.reconstruct(wrong),/RECONSTRUCT_EVIDENCE/);
});
run('altered authenticated A snapshot fails B commitment check before real proving',async()=>{
  const bad=h.session.createClient({reconstruct:async opaque=>{const envelope=await h.reconstruct(opaque);
    envelope.snapshot.monthlyGigIncomeTotals[35]=(BigInt(envelope.snapshot.monthlyGigIncomeTotals[35])+1n).toString();return envelope;}});
  const approved=await request('loan');await code(()=>bad.generateProof(approved),'PROVER_REJECTED');assert.equal(h.session.stats.realProofs,0);
});
run('two fresh A reconstructions produce actual Groth16 proofs accepted by deployed Solidity',async()=>{
  welfare=await request('welfare');loan=await request('loan');
  W=await h.api.generateProof(welfare);L=await h.api.generateProof(loan);
  assert.equal(h.session.stats.realProofs,2);
  for(const [req,proof]of [[welfare,W],[loan,L]]){
    assert.equal(await h.session.local.math.verifyProof(proof.solidity.a,proof.solidity.b,proof.solidity.c,proof.publicSignals),true);
    const result=await h.api.verify(req,proof);assert.equal(result.history,'PASS');assert.equal(result.activity,'PASS');
    if(req.consumer==='loan')assert.equal(result.income,'PASS');
    assert.ok(!JSON.stringify(proof).includes('monthlyGigIncomeTotals'));
  }
  assert.equal((await h.api.getIdentityState(h.passportId)).principal,'0');
});
run('actual welfare claim, 100 MockUSDC borrowing and exact repayment preserve request replay state',async()=>{
  const balance=await h.session.local.token.balanceOf(h.worker.address);
  receipts.push({action:'claim',...await h.api.claim(welfare,W,h.worker)});
  receipts.push({action:'borrow',...await h.api.borrow(loan,L,h.worker)});
  assert.equal(await h.session.local.token.balanceOf(h.worker.address),balance+100000000n);
  assert.equal((await h.api.getIdentityState(h.passportId)).principal,'100000000');
  await code(()=>h.api.claim(welfare,W,h.worker),'REQUEST_REPLAY');await code(()=>h.api.borrow(loan,L,h.worker),'REQUEST_REPLAY');
  receipts.push({action:'approve repayment',...await h.api.approveRepayment(h.worker)});
  receipts.push({action:'repay',...await h.api.repay(h.passportId,h.worker)});
  assert.equal((await h.api.getIdentityState(h.passportId)).principal,'0');
  await code(()=>h.api.borrow(loan,L,h.worker),'REQUEST_REPLAY');
  assert.ok(receipts.every(r=>r.status===1));
});
run('stale evidence and expired policy reject before authenticated reconstruction',async()=>{
  const provider=h.session.local.provider,now=BigInt((await provider.getBlock('latest')).timestamp);
  const long=await request('loan',{changes:{expiresAt:(now+100n*86400n).toString()}}),count=h.reconstructionCalls;
  const snap=await provider.send('evm_snapshot',[]);
  try {await provider.send('evm_increaseTime',[31*86400]);await provider.send('evm_mine',[]);
    await code(()=>h.api.generateProof(long),'EVIDENCE_STALE');await code(()=>h.api.verify(loan,L),'REQUEST_EXPIRED');
    assert.equal(h.reconstructionCalls,count);
  }finally{assert.equal(await provider.send('evm_revert',[snap]),true);}
});
run('A refresh uses actual attester transaction and invalidates prior B approval/proof',async()=>{
  const previous=await h.api.getPassport(h.passportId),p=await h.refresh();
  assert.equal(p.evidenceVersion,'2');assert.notEqual(p.evidenceCommitment,previous.evidenceCommitment);
  assert.equal(h.passportClient.receipts.at(-1).action,'refresh');
  await code(()=>h.api.generateProof(loan),'WORKER_APPROVAL_INVALID');
  const fresh=await request('loan');await code(()=>h.api.verify(fresh,L),'EVIDENCE_CHANGED');
});
run('revoked A consent fails private reconstruction; public transport errors remain errors',async()=>{
  const approved=await request('loan');h.upstream.consents.revokeConsent(h.upstream.consentId);
  await code(()=>h.api.generateProof(approved),'PROVER_REJECTED');assert.equal(h.session.stats.realProofs,2);
  const disconnected=createBackendAPassportClient({local:h.session.local,client:{getPassport:async()=>{throw new Error('transport unavailable');}}});
  await assert.rejects(()=>disconnected.getPassport(2),/transport unavailable/);
});
