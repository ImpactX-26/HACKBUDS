import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {prepareBackendASource} from '../integration/backend-a-source.mjs';

// Execute unchanged, SHA-verified upstream modules. No Aadhaar proof success is mocked.
const {manifest,importModule:load}=prepareBackendASource();
const [{RealAnonAadhaarVerifier:Real,ANON_AADHAAR_TEST_PUBKEY_HASH:TEST},
  {deriveAnonAadhaarSessionSignal:signal,BN254_SCALAR_FIELD_ORDER:r},{MockAadhaarVerifier:Mock},
  {MockIdentityProvider:IDP},{OnboardingAttestationAdapter:Bridge},{FIELD,field}]=await Promise.all([
  'backend/src/identity/aadhaar/real-verifier','backend/src/identity/aadhaar/types',
  'backend/src/identity/aadhaar/mock-verifier','backend/src/identity/mock-idp',
  'backend/src/identity/onboarding/attestation-adapter','shared/proposal/poseidon5'].map(load));
const wallet='0x0000000000000000000000000000000000000001';
const base={mode:'REAL_ANON_AADHAAR',expectedWalletAddress:wallet,expectedChallenge:'0x1234',sessionId:'b6-reconciliation'};
function payload(){return {groth16Proof:{pi_a:['1','2'],pi_b:[['1','2'],['3','4']],pi_c:['5','6'],protocol:'groth16'},
  pubkeyHash:TEST,nullifier:'1',nullifierSeed:'42',timestamp:1,signal:signal(base.sessionId,base.expectedChallenge,wallet)};}
const passed=[],failed=[];
const run=(name,fn)=>test(name,async()=>{try{await fn();passed.push(name);}catch(e){failed.push(name);throw e;}});
after(()=>writeFileSync('reports/b6-trust-reconciliation.json',JSON.stringify({sourceCommit:manifest.commit,
  realAadhaarProofs:0,realAadhaarIntegrationVerified:false,passed:passed.length,failed:failed.length,passedTests:passed,
  failedTests:failed,scope:'Upstream mode/pre-cryptographic guards and configuration classification; no real Aadhaar artifacts or credentials'},null,2)+'\n'));

run('default real verifier rejects staging root before cryptographic work',async()=>{
  assert.equal(new Real().getVerificationStatus(),'NOT_YET_VERIFIED');
  await assert.rejects(()=>new Real().verify({...base,realProofPayload:payload()}),/PubkeyNotTrusted/);
});
run('real and synthetic request modes cannot substitute for each other',async()=>{
  await assert.rejects(()=>new Real().verify({...base,mode:'SYNTHETIC_MOCK_IDP'}),/TrustModeMismatch/);
  await assert.rejects(()=>new Mock().verify(base),/TrustModeMismatch/);
});
run('wallet-only and other-session signals fail even with explicit staging opt-in',async()=>{
  const real=new Real({allowTestKeys:true});
  assert.equal(real.isSignalBound(BigInt(wallet).toString(),wallet,base.expectedChallenge,base.sessionId),false);
  assert.equal(real.isSignalBound(payload().signal,wallet,base.expectedChallenge,'different-session'),false);
  assert.equal(real.isSignalBound(payload().signal,'0x0000000000000000000000000000000000000002',base.expectedChallenge,base.sessionId),false);
  await assert.rejects(()=>real.verify({...base,realProofPayload:{...payload(),signal:BigInt(wallet).toString()}}),/SignalBindingMismatch/);
});
run('all five Aadhaar duplicate signals and wrong vector length reject before Groth16',async()=>{
  const p=payload(),vector=[p.nullifier,p.pubkeyHash,p.nullifierSeed,p.signal,String(p.timestamp)];
  for(let i=0;i<5;i++){const changed=[...vector];changed[i]=(BigInt(changed[i])+1n).toString();
    await assert.rejects(()=>new Real({allowTestKeys:true}).verify({...base,realProofPayload:{...p,publicSignals:changed}}),/PublicSignalMismatch/);}
  await assert.rejects(()=>new Real({allowTestKeys:true}).verify({...base,realProofPayload:{...p,publicSignals:vector.slice(1)}}),/PublicSignalMismatch/);
});
run('canonical staging payload still fails closed without a verification key',async()=>{
  await assert.rejects(()=>new Real({allowTestKeys:true}).verify({...base,realProofPayload:payload()}),/VerificationKeyMissing/);
});
run('actual signed Mock IDP assertion stays synthetic and altered provider is rejected',async()=>{
  const idp=new IDP(),mock=new Mock(idp),assertion=idp.issueAssertion({workerIdentityNullifier:'0x'+'11'.repeat(32),workerWalletAddress:wallet});
  const req={...base,mode:'SYNTHETIC_MOCK_IDP',mockAssertionPayload:{assertion}};
  const verified=await mock.verify(req);assert.equal(verified.mode,'SYNTHETIC_MOCK_IDP');
  await assert.rejects(()=>mock.verify({...req,mockAssertionPayload:{assertion:{...assertion,providerId:'REAL_ANON_AADHAAR'}}}),/Unrecognized identity provider/);
});
run('upstream bridge refuses real identities, unknown modes and revoked records',()=>{
  const bridge=new Bridge({idp:new IDP()});
  const record={workerId:'synthetic-only',status:'ACTIVE',identityTrustMode:'REAL_ANON_AADHAAR',identityNullifier:'0x'+'11'.repeat(32),walletAddress:wallet};
  assert.throws(()=>bridge.createAssertionForCommittedWorker(record),/UnsupportedIdentityBridge/);
  assert.equal(bridge.getPersonaMetadata(record),null);
  assert.throws(()=>bridge.createAssertionForCommittedWorker({...record,identityTrustMode:'UNKNOWN'}),/UnsupportedIdentityBridge/);
  assert.throws(()=>bridge.createAssertionForCommittedWorker({...record,status:'REVOKED'}),/REVOKED/);
});
// These assertions deliberately demand the documented security invariant. Do not
// turn them into passing regressions of unsafe upstream behavior or patch A here.
run('staging root cannot be promoted by production configuration without staging opt-in',()=>{
  const real=new Real({trustedPubkeyHashes:[TEST],allowTestKeys:false});
  assert.equal(real.isTrustedPubkeyHash(TEST),false);
});
run('staging-only root and arbitrary vkey must not advertise genuine VERIFIED status',()=>{
  const real=new Real({trustedPubkeyHashes:[TEST],allowTestKeys:false,verificationKey:{}});
  assert.equal(real.getVerificationStatus(),'NOT_YET_VERIFIED');
});
run('shared evidence field boundary must use the Groth16 scalar modulus, not BN254 base modulus',()=>{
  assert.equal(FIELD,r);
  assert.throws(()=>field(r),/outside/);
});
