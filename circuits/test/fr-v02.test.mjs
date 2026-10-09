import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {createProvisionalPoseidon,FIELD,PROFILE,field,BN254_BASE_FIELD_MODULUS as q} from '../dist/shared/proposal/poseidon5.js';
import {hashToFieldElement,providerIdToFieldElement} from '../dist/shared/proposal/field-mappings.js';
import {baseline} from '../dist/circuits/test/synthetic-fixtures.js';
import {calculator,encoded,outputs,decimal} from '../dist/circuits/test/runtime.js';
import {buildPoseidon} from '../node_modules/circomlibjs/main.js';
const r=21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const hashes=await createProvisionalPoseidon(),wasm=await calculator(),bounded=await calculator('snapshot-hash-bounded');
const independent=await buildPoseidon();
const vectorInputs=Object.fromEntries([
  ['digest-r-minus-one',r-1n],['digest-r',r],['digest-between-r-q',r+1n],['digest-q-minus-one',q-1n],['digest-q',q],['digest-uint256-max',(1n<<256n)-1n]
].map(([name,digest])=>[name,{...baseline(),evidenceDataHash:hashToFieldElement(digest.toString(16).padStart(64,'0')),
  evidenceProviderId:providerIdToFieldElement('MOCK_APNA_BANK_FIP_01')}]));
const file='fixtures/fr-v02-mapping-vectors.json';
const recorded={profile:PROFILE,scalarModulus:r.toString(),status:'PUBLIC SYNTHETIC HASH/MAPPING VECTORS; NOT A FINANCIAL SNAPSHOT',vectors:{}};
for(const [name,input]of Object.entries(vectorInputs)){
  const {metadataSlots,...expected}=hashes.commit(input);
  const wire=encoded(input,expected.evidenceCommitment);
  assert.deepEqual(outputs(await wasm.calculateWitness(wire,true)),expected);
  assert.deepEqual(outputs(await bounded.calculateWitness(wire,true)),expected);
  recorded.vectors[name]={input,...expected,metadataSlots};
}
// Explicit record command only; no fixture file is written by normal tests.
if(process.argv.includes('--record'))writeFileSync(file,decimal(recorded)+'\n');
const golden=JSON.parse(readFileSync(file,'utf8'));

test('approved Fr/profile match circomlibjs actual field and differ from Fq',()=>{
  assert.equal(PROFILE,'gv-poseidon-hash-only-0.2.0');assert.equal(FIELD,r);assert.equal(independent.F.p,r);assert.notEqual(r,q);
  assert.deepEqual(golden,JSON.parse(decimal(recorded)));
});
test('r-1 is canonical and reproduces the compiled primitive and snapshot',async()=>{
  assert.equal(field(r-1n),r-1n);const primitive=await calculator('h5');
  const values=[1499n,r-1n,0n,1n,2n];
  assert.equal((await primitive.calculateWitness({inputs:values.map(String)},true))[1],hashes.h5(values));
});
for(const value of [r,r+1n,(r+q)/2n,q-1n,q])test('reject noncanonical scalar '+value,()=>{
  assert.throws(()=>field(value),/outside/);assert.throws(()=>hashes.commit({...baseline(),evidenceDataHash:value}),/outside/);
  assert.throws(()=>encoded({...baseline(),evidenceProviderId:value},1n),/outside/);
});
test('named SHA256/provider mappings reduce modulo Fr with exact independent bytes',()=>{
  for(const v of [r-1n,r,r+1n,q-1n,q,(1n<<256n)-1n])assert.equal(hashToFieldElement(v.toString(16).padStart(64,'0')),v%r);
  const digest=createHash('sha256').update('GIGVAULT_PROVIDER_ID_V1|MOCK_APNA_BANK_FIP_01','utf8').digest('hex');
  assert.equal(providerIdToFieldElement('MOCK_APNA_BANK_FIP_01'),BigInt('0x'+digest)%independent.F.p);
  assert.notEqual(hashToFieldElement('ff'.repeat(32)),((1n<<256n)-1n)%q);
});
for(const name of Object.keys(vectorInputs))test('v0.2 mapped golden / both Circom profiles: '+name,()=>{
  assert.deepEqual(golden.vectors[name],JSON.parse(decimal(recorded.vectors[name])));
});
