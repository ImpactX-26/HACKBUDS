import test from 'node:test';
import assert from 'node:assert/strict';
import {Wallet,id} from 'ethers';
import {mkdtempSync,writeFileSync,rmSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createTrustedProver,validateEvidence,protocolVersion,eligibilityProfile} from '../../circuits/service/trusted-prover.mjs';
import {createProofEngine,digest} from '../../circuits/service/engine.mjs';
import {createProvisionalPoseidon,PROFILE} from '../../circuits/dist/circuits/src/provisional-poseidon.js';
import {translateBackendAWitness} from '../../circuits/service/backend-a-v1.mjs';
import {addressToFieldElement,providerIdToFieldElement,hashToFieldElement} from '../../circuits/dist/shared/proposal/field-mappings.js';
import {snapshot} from '../../circuits/scripts/eligibility-fixtures.mjs';
import {policyTypes,approvalTypes,approvalFor,domainFor} from '../proposal/authorization-v02.mjs';
const hashes=await createProvisionalPoseidon();
const holder=Wallet.createRandom(),verifier=Wallet.createRandom(),other=Wallet.createRandom();
const now=1791504000n,domain=domainFor(1337,Wallet.createRandom().address);
const s=snapshot({passportId:1n,holderBinding:BigInt(holder.address),evidenceUpdatedAt:now-100n});
const passport={holderWallet:holder.address,status:0n,schemaVersion:2n,evidenceVersion:1n,evidenceUpdatedAt:s.evidenceUpdatedAt,
  evidenceCommitment:hashes.commit(s).evidenceCommitment,sourceDirectoryVersion:s.sourceDirectoryVersion};
const policy={requestId:id('B4_INTERFACE_TEST'),verifierId:verifier.address,incomeEnabled:1,incomeWindowMonths:6,
  minAverageIncomePaise:2000000,activityEnabled:1,activityIsWeekly:0,activityWindow:12,minActivePeriods:9,
  historyEnabled:1,minHistoryMonths:12,maxEvidenceAgeDays:30,expiresAt:now+86400n};
const request={protocolVersion,eligibilityProfile,consumer:'loan',passportId:'1',evidenceHandle:'authenticated-private-capability',policy,
  verifierSignature:await verifier.signTypedData(domain,policyTypes,policy),
  workerSignature:await holder.signTypedData(domain,approvalTypes,approvalFor(policy,'1',passport,domain))};
const envelope=()=>({protocolVersion,eligibilityProfile,commitmentProfile:PROFILE,schemaVersion:'2',evidenceVersion:'1',snapshot:structuredClone(s)});
function harness({state={},evidence=envelope(),engine}={}) {
  let reads=0,proofs=0;
  const prover=createTrustedProver({setupId:'unit-test-no-key',hashes,
    readState:async()=>({passport,domain,now,expectedVerifier:verifier.address,...state}),
    reconstruct:async()=>{reads++;return evidence;},prove:async input=>{proofs++;if(engine)return engine(input);throw Error('INTENTIONAL_ENGINE_FAILURE');}});
  return {prover,get reads(){return reads;},get proofs(){return proofs;}};
}
for(const [label,change]of [['unknown protocol',{protocolVersion:'unsupported'}],['unknown circuit',{eligibilityProfile:'other'}],
  ['numeric passport ID',{passportId:1}],['noncanonical passport ID',{passportId:'01'}],['oversize passport ID',{passportId:String(1n<<64n)}],
  ['missing private capability',{evidenceHandle:''}],['missing worker approval',{workerSignature:'0x'}],
  ['missing verifier signature',{verifierSignature:'0x'}],['modified policy',{policy:{...policy,minAverageIncomePaise:1}}]]) {
  test(label+' rejects before evidence access',async()=>{const h=harness();await assert.rejects(()=>h.prover.prove({...request,...change}));
    assert.equal(h.reads,0);assert.equal(h.proofs,0);});
}
test('an unsigned additional policy condition rejects before private access',async()=>{
  const h=harness();await assert.rejects(()=>h.prover.prove({...request,policy:{...policy,additionalCondition:'unbound'}}));
  assert.equal(h.reads,0);
});
test('forged holder signature rejects before evidence access',async()=>{
  const h=harness(),workerSignature=await other.signTypedData(domain,approvalTypes,approvalFor(policy,'1',passport,domain));
  await assert.rejects(()=>h.prover.prove({...request,workerSignature}));assert.equal(h.reads,0);
});
for(const [label,state]of [['revoked',{passport:{...passport,status:1n}}],['stale',{now:now+31n*86400n}],
  ['future timestamp',{now:now-101n}],['wrong chain',{domain:domainFor(1338,domain.verifyingContract)}],
  ['wrong consumer domain',{domain:domainFor(1337,other.address)}],['refresh version',{passport:{...passport,evidenceVersion:2n}}]]) {
  test(label+' rejects before evidence access',async()=>{const h=harness({state});await assert.rejects(()=>h.prover.prove(request));assert.equal(h.reads,0);});
}
test('unsupported passport schema rejects before evidence access',async()=>{
  const h=harness({state:{passport:{...passport,schemaVersion:1n}}});
  await assert.rejects(()=>h.prover.prove(request));assert.equal(h.reads,0);
});
for(const [label,modify]of [['unsupported evidence profile',e=>e.commitmentProfile='other'],
  ['legacy v0.1 profile',e=>e.commitmentProfile='gv-poseidon-hash-only-0.1.0'],
  ['Fr alias provider',e=>e.snapshot.evidenceProviderId='21888242871839275222246405745257275088548364400416034343698204186575808495617'],
  ['Fr alias digest',e=>e.snapshot.evidenceDataHash='21888242871839275222246405745257275088548364400416034343698204186575808495617'],
  ['schema version',e=>e.schemaVersion='1'],['evidence version',e=>e.evidenceVersion='2'],
  ['amount overflow',e=>e.snapshot.monthlyGigIncomeTotals[0]=1n<<64n],
  ['amount negative',e=>e.snapshot.monthlyGigIncomeTotals[0]=-1n],
  ['unsafe numeric amount',e=>e.snapshot.monthlyGigIncomeTotals[0]=Number.MAX_SAFE_INTEGER+1],
  ['wrong array length',e=>e.snapshot.weeklyActivity.pop()],['nonbinary flag',e=>e.snapshot.monthlyActivity[0]=2n],
  ['history seconds',e=>e.snapshot.verifiedHistoryStartDate=now],['wrong holder',e=>e.snapshot.holderBinding=BigInt(other.address)],
  ['source directory',e=>e.snapshot.sourceDirectoryVersion+=1n],['altered commitment preimage',e=>e.snapshot.evidenceDataHash+=1n]]) {
  test(label+' rejects before proving',async()=>{const e=envelope();modify(e);const h=harness({evidence:e});
    await assert.rejects(()=>h.prover.prove(request));assert.equal(h.reads,1);assert.equal(h.proofs,0);});
}
test('authorized evidence reaches engine once; failure returns no private result',async()=>{
  const h=harness();await assert.rejects(()=>h.prover.prove(request),/Private evidence or proof rejected/);assert.equal(h.reads,1);assert.equal(h.proofs,1);
  assert.deepEqual(validateEvidence(envelope(),passport,'1'),s);
});
test('private resolver exceptions never disclose source values',async()=>{
  const service=createTrustedProver({setupId:'unit-test',hashes,readState:async()=>({passport,domain,now,expectedVerifier:verifier.address}),
    reconstruct:async()=>{throw Error('PRIVATE_FINANCIAL_SENTINEL');},prove:async()=>{throw Error('Must not run');}});
  await assert.rejects(()=>service.prove(request),error=>error.message==='Private evidence or proof rejected');
});
function aPayload() {
  const a={passportId:1,holderBinding:holder.address,evidenceProviderId:'LOCAL_FIP',evidenceDataHash:'ab'.repeat(32),
    verifiedHistoryStartDate:19723,evidenceUpdatedAt:Number(s.evidenceUpdatedAt),sourceDirectoryVersion:1,
    monthlyGigIncomeTotals:Array(36).fill(2000000),weeklyActivity:Array(156).fill(1),monthlyActivity:Array(36).fill(1)};
  const normalized={...s,evidenceProviderId:providerIdToFieldElement(a.evidenceProviderId),evidenceDataHash:hashToFieldElement(a.evidenceDataHash),
    verifiedHistoryStartDate:BigInt(a.verifiedHistoryStartDate),sourceDirectoryVersion:1n};
  const commitment=hashes.commit(normalized).evidenceCommitment.toString();a.evidenceCommitment=commitment;
  return {snapshot:a,circuitInputs:{passportId:1,holderAddressScalar:addressToFieldElement(holder.address).toString(),
    providerIdScalar:normalized.evidenceProviderId.toString(),evidenceDataHashScalar:normalized.evidenceDataHash.toString(),
    verifiedHistoryStartDateDays:a.verifiedHistoryStartDate,evidenceUpdatedAtSeconds:a.evidenceUpdatedAt,sourceDirectoryVersion:1,
    monthlyGigIncomeTotalsPaise:Array(36).fill('2000000'),weeklyActivityFlags:Array(156).fill(1),monthlyActivityFlags:Array(36).fill(1)},
    expectedPublicSignals:{passportId:1,holderBinding:holder.address,evidenceCommitment:commitment,sourceDirectoryVersion:1},createdAt:Number(now)};
}
test('Backend A field renaming preserves exact committed meaning',()=>{
  const p=aPayload(),e=translateBackendAWitness(p,{schemaVersion:'2',evidenceVersion:'1'},hashes);
  assert.equal(hashes.commit(e.snapshot).evidenceCommitment.toString(),p.snapshot.evidenceCommitment);
});
for(const [label,modify]of [['contradictory dual witness',p=>p.circuitInputs.monthlyGigIncomeTotalsPaise[0]='1'],
  ['seconds instead of days',p=>p.snapshot.verifiedHistoryStartDate=Number(now)],
  ['unsafe amount',p=>p.snapshot.monthlyGigIncomeTotals[0]=Number.MAX_SAFE_INTEGER+1],
  ['incorrect expected commitment',p=>p.expectedPublicSignals.evidenceCommitment='1']]) {
  test('Backend A translation rejects '+label,()=>{const p=aPayload();modify(p);
    assert.throws(()=>translateBackendAWitness(p,{schemaVersion:'2',evidenceVersion:'1'},hashes));});
}
test('Backend A translation refuses legacy chain schema without relabeling',()=>{
  assert.throws(()=>translateBackendAWitness(aPayload(),{schemaVersion:'1',evidenceVersion:'1'},hashes),/schemaVersion 2/);
});
test('isolated engine failure and timeout create no private files',async()=>{
  const parent=resolve('artifacts');const {mkdirSync}=await import('node:fs');mkdirSync(parent,{recursive:true});
  const temp=mkdtempSync(resolve(parent,'engine-test-'));
  try {
    const setup={wasm:resolve('../circuits/build/eligibility-v02_js/eligibility-v02.wasm'),
      calculator:resolve('../circuits/build/eligibility-v02_js/witness_calculator.js'),zkey:resolve(temp,'dummy.zkey'),vk:resolve(temp,'vk.json')};
    writeFileSync(setup.zkey,'NOT_A_KEY');writeFileSync(setup.vk,'{}');
    setup.digests=Object.fromEntries(['wasm','calculator','zkey','vk'].map(k=>[k,digest(setup[k])]));
    const names=readdirSync(temp);
    const serial=createProofEngine(setup),first=serial({});
    await assert.rejects(()=>serial({}),/Prover busy/);await assert.rejects(()=>first);
    await assert.rejects(()=>createProofEngine(setup)({PRIVATE_SENTINEL:'MUST_NOT_BE_FORWARDED'}),error=>{
      assert.equal(error.message,'Prover execution failed');return true;
    });assert.deepEqual(readdirSync(temp),names);
    await assert.rejects(()=>createProofEngine(setup,{timeoutMs:1})({}),/timed out/);assert.deepEqual(readdirSync(temp),names);
    writeFileSync(setup.zkey,'ALTERED');await assert.rejects(()=>createProofEngine(setup)({}),/artifact changed/);
  }finally{assert.ok(temp.startsWith(parent));rmSync(temp,{recursive:true,force:true});}
});
