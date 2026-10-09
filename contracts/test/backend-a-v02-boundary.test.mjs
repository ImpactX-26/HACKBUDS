import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {prepareBackendASource} from '../integration/backend-a-source.mjs';
import {createBackendAIntegration} from '../integration/backend-a-session.mjs';
import * as b from '../../circuits/dist/circuits/src/provisional-poseidon.js';
import * as bm from '../../circuits/dist/shared/proposal/field-mappings.js';
const {manifest,importModule:load}=prepareBackendASource();
const [a,am]=await Promise.all(['shared/proposal/poseidon5','shared/proposal/field-mappings'].map(load));
test('published A Fr/profile/tags and digest mappings match current B',()=>{
  assert.equal(a.FIELD,b.FIELD);assert.equal(a.PROFILE,b.PROFILE);assert.deepEqual(a.TAGS,b.TAGS);
  for(const n of [b.FIELD-1n,b.FIELD,b.FIELD+1n,b.BN254_BASE_FIELD_MODULUS-1n,b.BN254_BASE_FIELD_MODULUS]){
    const digest=n.toString(16).padStart(64,'0');assert.equal(am.hashToFieldElement(digest),bm.hashToFieldElement(digest));
    if(n>=b.FIELD){assert.throws(()=>a.field(n));assert.throws(()=>b.field(n));}
    else assert.equal(a.field(n),b.field(n));
  }
  assert.equal(am.providerIdToFieldElement('MOCK_APNA_BANK_FIP_01'),bm.providerIdToFieldElement('MOCK_APNA_BANK_FIP_01'));
});
test('actual A reconstruction/mint cannot silently relabel schema 1 as approved v0.2 schema 2',async()=>{
  let h;const started=performance.now();
  try {
    h=await createBackendAIntegration();const p=await h.api.getPassport(h.passportId);
    assert.equal(p.schemaVersion,'1');assert.equal(h.passportClient.receipts[0].status,1);
    const signed=await h.signedRequest('loan');
    await assert.rejects(()=>h.approve(signed),e=>e.code==='EVIDENCE_SCHEMA_UNSUPPORTED');
    assert.equal(h.reconstructionCalls,0);assert.equal(h.session.stats.realProofs,0);
    assert.equal((await h.session.client.getPassport('1')).schemaVersion,'2');
    writeFileSync('reports/v02-a-schema-boundary.json',JSON.stringify({sourceCommit:manifest.commit,
      localOnly:true,syntheticOnly:true,passed:2,realAadhaarProofs:0,realGroth16Proofs:0,
      aPassportId:p.passportId,aSchemaVersion:p.schemaVersion,requiredSchemaVersion:'2',
      mintTransactions:h.passportClient.receipts,reconstructionCalls:0,
      rejection:'EVIDENCE_SCHEMA_UNSUPPORTED',aToBV02Completed:false,
      elapsedSeconds:(performance.now()-started)/1000},null,2)+'\n');
  }finally{if(h)await h.close();}
});
