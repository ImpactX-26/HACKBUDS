import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Wallet,id} from 'ethers';
import {assertAuthorized,approvalFor,policyTypes,approvalTypes,domainFor,validatePolicy,limbs} from '../proposal/authorization-v02.mjs';
import {prepareAuthorizedWitness} from '../../circuits/scripts/authorized-witness-v02.mjs';
import {snapshot} from '../../circuits/scripts/eligibility-fixtures.mjs';
import {createProvisionalPoseidon} from '../../circuits/dist/circuits/src/provisional-poseidon.js';
const worker=Wallet.createRandom(),verifier=Wallet.createRandom(),other=Wallet.createRandom();
const domain=domainFor(1337,other.address),now=1791417600n;
const policy={requestId:id('SYNTHETIC_AUTH_REQUEST'),verifierId:verifier.address,incomeEnabled:1,incomeWindowMonths:6,
  minAverageIncomePaise:2000000,activityEnabled:1,activityIsWeekly:0,activityWindow:12,minActivePeriods:9,
  historyEnabled:1,minHistoryMonths:12,maxEvidenceAgeDays:30,expiresAt:now+3600n};
const passport={holderWallet:worker.address,evidenceCommitment:123n,evidenceVersion:1n,evidenceUpdatedAt:now-100n,status:0n};
const auth={policy,passport,passportId:1n,domain,now,expectedVerifier:verifier.address,
  policySignature:await verifier.signTypedData(domain,policyTypes,policy),
  workerSignature:await worker.signTypedData(domain,approvalTypes,approvalFor(policy,1n,passport,domain))};
test('current holder and exact policy signatures authorize the public context',()=>{
  const c=assertAuthorized(auth);assert.equal(c.expectedCommitment,'123');assert.equal(c.evidenceVersion,'1');
});
test('missing/forged approval rejects before private reconstruction',async()=>{
  for(const workerSignature of ['0x',await other.signTypedData(domain,approvalTypes,approvalFor(policy,1n,passport,domain))]) {
    let accessed=false;
    await assert.rejects(()=>prepareAuthorizedWitness({...auth,workerSignature},async()=>{accessed=true;return {};},{}));
    assert.equal(accessed,false);
  }
});
test('modified request, policy, verifier, domain and chain reject',()=>{
  for(const changes of [{policy:{...policy,minAverageIncomePaise:1}},{policy:{...policy,requestId:id('OTHER')}},
    {policy:{...policy,verifierId:other.address}},{domain:domainFor(1338,other.address)},
    {domain:domainFor(1337,worker.address)}]) assert.throws(()=>assertAuthorized({...auth,...changes}));
});
test('expiry, freshness, future timestamp and revoked state are public checks',()=>{
  for(const changes of [{now:now+3601n},{policy:{...policy,expiresAt:now+40n*86400n},now:now+31n*86400n},
    {passport:{...passport,evidenceUpdatedAt:now+1n}},{passport:{...passport,status:1n}}]) assert.throws(()=>assertAuthorized({...auth,...changes}));
});
test('refresh/version, commitment and replacement holder invalidate old approval',()=>{
  for(const change of [{evidenceVersion:2n},{evidenceCommitment:124n},{holderWallet:other.address}])
    assert.throws(()=>assertAuthorized({...auth,passport:{...passport,...change}}));
});
test('canonical policy bounds reject aliases and malformed optional fields',()=>{
  for(const changes of [{incomeEnabled:2},{incomeWindowMonths:0},{incomeWindowMonths:37},
    {minAverageIncomePaise:1n<<64n},{activityWindow:157},{minActivePeriods:13},{historyEnabled:2},{minHistoryMonths:361},
    {incomeEnabled:0},{activityEnabled:0},{historyEnabled:0},{incomeWindowMonths:'06'},
    {minAverageIncomePaise:Number.MAX_SAFE_INTEGER+1},{minAverageIncomePaise:0.5}]) assert.throws(()=>validatePolicy({...policy,...changes}));
});
test('full bytes32 IDs survive high/low limb round trip even above scalar field',()=>{
  const value=(1n<<256n)-1n,[hi,lo]=limbs('0x'+value.toString(16));assert.equal((hi<<128n)+lo,value);
});
test('authorized reconstruction matches current commitment and rejects substituted private evidence',async()=>{
  const hashes=await createProvisionalPoseidon(),s=snapshot({holderBinding:BigInt(worker.address),evidenceUpdatedAt:passport.evidenceUpdatedAt});
  const state={...passport,evidenceCommitment:hashes.commit(s).evidenceCommitment};
  const signed={...auth,passport:state,workerSignature:await worker.signTypedData(domain,approvalTypes,approvalFor(policy,1n,state,domain))};
  const input=await prepareAuthorizedWitness(signed,async()=>s,hashes);
  assert.equal(input.expectedCommitment,state.evidenceCommitment.toString());assert.equal(input.monthlyGigIncomeTotals.length,36);
  await assert.rejects(()=>prepareAuthorizedWitness(signed,async()=>({...s,evidenceDataHash:98765n}),hashes),/Reconstructed evidence mismatch/);
});
