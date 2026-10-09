import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { addressToFieldElement, hashToFieldElement, providerIdToFieldElement } from './historical-v01/field-mappings.js';
import { createProvisionalPoseidon, field, FIELD, PROFILE, SCALARS } from './historical-v01/poseidon5.js';
import { AMOUNT_LIMIT, checkedFixture, fixtureVariants, SOURCE_COMMIT, upstreamFixture } from './backend-a-fixture.js';
import { calculator, decimal, encoded, outputs, root } from './historical-v01/runtime.js';

// Exact frozen upstream modules, transpiled without modifying them or Backend A's branch.
const upstream = (path: string) => import(pathToFileURL(resolve(root,'build/upstream',path+'.js')).href);
const schema = await upstream('shared/proposal/canonical-evidence-schema');
const normalizer = await upstream('backend/src/evidence/normalizer');
const calendar = await upstream('backend/src/evidence/calendar');
const {TransactionClassifier} = await upstream('backend/src/evidence/classifier');
const {FIPVerifier} = await upstream('backend/src/evidence/fip-verifier');
const crypto = await upstream('backend/src/fip/crypto');
const {ConsentService} = await upstream('backend/src/fip/consent-service');
const {MockFIPService} = await upstream('backend/src/fip/fip-service');
const {AttestationService} = await upstream('backend/src/evidence/attestation-service');
const {EvidenceSnapshotBuilder} = await upstream('backend/src/evidence/snapshot-builder');
const hashes = await createProvisionalPoseidon();
const wasm = await calculator();
const bounded = await calculator('snapshot-hash-bounded');
const original = checkedFixture();
const baselineHash = hashes.commit(original);
const golden = JSON.parse(readFileSync(resolve(root,'fixtures/backend-a-gate1-vectors.json'),'utf8'));
assert.equal(golden.profile, PROFILE);
assert.equal(golden.sourceCommit, SOURCE_COMMIT);
const variants = fixtureVariants();
assert.deepEqual(Object.keys(golden.vectors),Object.keys(variants));

for (const [name,input] of Object.entries(variants)) {
  test(`Backend A exact TS/Circom/bounded/golden parity: ${name}`, async () => {
    const {metadataSlots,...expected} = hashes.commit(input);
    const witnessInput = encoded(input,expected.evidenceCommitment);
    assert.deepEqual(outputs(await wasm.calculateWitness(witnessInput,true)), expected);
    assert.deepEqual(outputs(await bounded.calculateWitness(witnessInput,true)), expected);
    assert.deepEqual(JSON.parse(decimal({...expected,metadataSlots})),golden.vectors[name]);
    if (name !== 'backendA') {
      assert.notEqual(expected.evidenceCommitment,baselineHash.evidenceCommitment);
      await assert.rejects(() => bounded.calculateWitness(encoded(input,baselineHash.evidenceCommitment),true), /Assert Failed|constraint/i);
    }
  });
}

test('published mappings match strict BN254/uint160 encodings and independent byte arithmetic', () => {
  const f = upstreamFixture;
  assert.equal(schema.hashToFieldElement(f.evidenceDataHashHex), field(original.evidenceDataHash));
  assert.equal(schema.addressToFieldElement(f.holderWalletAddress), field(original.holderBinding));
  assert.equal(schema.providerIdToFieldElement(f.evidenceProviderCanonicalId), field(original.evidenceProviderId));
  assert.equal(hashToFieldElement(f.evidenceDataHashHex), BigInt('0x'+f.evidenceDataHashHex)%FIELD);
  const providerDigest = createHash('sha256').update('GIGVAULT_PROVIDER_ID_V1|'+f.evidenceProviderCanonicalId).digest('hex');
  assert.equal(field(original.evidenceProviderId),BigInt('0x'+providerDigest)%FIELD);
  assert.equal(hashToFieldElement('ff'.repeat(32)),((1n<<256n)-1n)%FIELD);
  assert.equal(addressToFieldElement('0x'+'ff'.repeat(20)),(1n<<160n)-1n);
  assert.equal(addressToFieldElement(f.holderWalletAddress.toUpperCase().replace(/^0X/,'0x')),field(original.holderBinding));
});

test('strict mappings reject wrong digest/address widths and noncanonical provider IDs', () => {
  for (const digest of ['01','0x01','a'.repeat(63),'a'.repeat(65),'zz'.repeat(32),'-1','']) {
    assert.throws(() => hashToFieldElement(digest));
  }
  for (const address of ['0x1','f'.repeat(40),'0x'+'g'.repeat(40),'0x'+'f'.repeat(42)]) {
    assert.throws(() => addressToFieldElement(address));
  }
  for (const provider of ['',' MOCK_APNA_BANK_FIP_01','MOCK_APNA_BANK_FIP_01 ','fip|id','fíp']) {
    assert.throws(() => providerIdToFieldElement(provider));
  }
  assert.equal(schema.hashToFieldElement('01'),1n, 'Upstream accepts an undersized digest: review finding');
  assert.doesNotThrow(() => schema.providerIdToFieldElement(' MOCK_APNA_BANK_FIP_01'), 'Upstream ID grammar is unchecked');
});

test('selected decimal witness format rejects precision loss, field aliases and tampered fixture annotations', () => {
  for (const value of [FIELD,FIELD+1n,-1n,Number.MAX_SAFE_INTEGER+1,'01']) assert.throws(() => field(value));
  for (const key of SCALARS) {
    const input = checkedFixture(); input[key] = FIELD; assert.throws(() => encoded(input,baselineHash.evidenceCommitment));
  }
  for (const key of ['holderBindingDecimal','evidenceProviderFieldDecimal','evidenceDataHashFieldDecimal']) {
    const f = structuredClone(upstreamFixture); f[key] = (BigInt(f[key])+1n).toString(); assert.throws(() => checkedFixture(f));
  }
  const overflow = structuredClone(upstreamFixture); overflow.monthlyGigIncomeTotalsPaise[0] = AMOUNT_LIMIT.toString();
  assert.throws(() => checkedFixture(overflow),/uint64/);
});

test('bounded Circom accepts uint64 max and rejects amount/holder overflow with matching hashes', async () => {
  const boundary = checkedFixture(); boundary.monthlyGigIncomeTotals[0] = AMOUNT_LIMIT-1n;
  boundary.holderBinding = (1n<<160n)-1n;
  let result = hashes.commit(boundary);
  assert.deepEqual(outputs(await bounded.calculateWitness(encoded(boundary,result.evidenceCommitment),true)),
    {incomeRoot:result.incomeRoot,weeklyRoot:result.weeklyRoot,monthlyRoot:result.monthlyRoot,evidenceCommitment:result.evidenceCommitment});
  for (const input of [
    {...boundary,monthlyGigIncomeTotals:[AMOUNT_LIMIT,...boundary.monthlyGigIncomeTotals.slice(1)]},
    {...boundary,holderBinding:1n<<160n},
    {...boundary,monthlyGigIncomeTotals:[FIELD-1n,...boundary.monthlyGigIncomeTotals.slice(1)]}
  ]) {
    result = hashes.commit(input); // Deliberately valid field hashes; range constraint must reject independently.
    await assert.rejects(() => bounded.calculateWitness(encoded(input,result.evidenceCommitment),true), /Assert Failed|constraint/i);
  }
});

test('both compiled profiles reject nonbinary activity even with matching raw hashes', async () => {
  for (const key of ['weeklyActivity','monthlyActivity'] as const) {
    const input = checkedFixture(); input[key][0] = 2n;
    assert.throws(() => hashes.commit(input),/Nonbinary/);
    const raw = encoded(original,baselineHash.evidenceCommitment);
    (raw[key] as string[])[0] = '2';
    const slots = [...baselineHash.metadataSlots];
    // Import tags from shared implementation; independently bypass only binary validation.
    const {TAGS} = await import('../src/provisional-poseidon.js');
    slots[key === 'weeklyActivity' ? 8 : 9] = hashes.tree4(input[key],key === 'weeklyActivity' ? TAGS.weekly : TAGS.monthly);
    raw.expectedCommitment = hashes.tree4(slots,TAGS.metadata).toString();
    for (const circuit of [wasm,bounded]) await assert.rejects(() => circuit.calculateWitness(raw,true), /Assert Failed|constraint/i);
  }
});

const cutoff = Number(upstreamFixture.evidenceUpdatedAtSeconds);
const owner = {accountId:'PUBLIC_SYNTHETIC_ACCOUNT',ownerName:'PUBLIC SYNTHETIC OWNER',identityNullifierHash:'0x'+'11'.repeat(32),verifiedAt:cutoff-86400};
function txn(overrides: Record<string,unknown> = {}) {
  return {txnId:'PUBLIC_SYNTHETIC_TXN',timestamp:Date.UTC(2026,8,1)/1000,amountMinor:10001,currency:'INR',direction:'CREDIT',
    rail:'UPI',remitter:{vpa:'unknown@bank',account:'PUBLIC_SYNTHETIC_REMlTTER',name:'UNRECOGNIZED'},reference:'PUBLIC_REF',narration:'ordinary credit',...overrides};
}
function preimage(transactions = [txn()]) {
  return {version:'GIGVAULT_CANONICAL_DATA_V1',accountOwner:{accountId:owner.accountId,identityNullifierHash:owner.identityNullifierHash},
    timeBounds:{fromTimestamp:0,toTimestamp:cutoff},transactions:normalizer.normalizeAuthenticatedData(owner,transactions,cutoff).transactions};
}
function payload(transactions = [txn()]) {
  return {schemaVersion:'GIGVAULT_FIP_MOCK_V1',fipId:'PUBLIC_SYNTHETIC_FIP',consentId:'PUBLIC_CONSENT',accountId:owner.accountId,
    accountOwnerBinding:owner,dataRange:{fromTimestamp:0,toTimestamp:cutoff},transactions,generatedAt:cutoff};
}
function signed(data = payload()) {
  // Real ephemeral secp256k1 keys/signature in memory, never logged/written.
  const keys = crypto.generateFipKeyPair();
  const payloadHash = crypto.hashPayload(data);
  return {keys,envelope:{payload:data,payloadHash,signature:crypto.signPayloadHash(payloadHash,keys.privateKeyPem),fipPublicKey:keys.publicKeyPem}};
}

test('proposal binds account/identity/range and transaction fields while excluding envelope entropy', () => {
  const base = preimage(); const digest = schema.computeCanonicalEvidenceDataHash(base);
  assert.equal(digest.fieldElementDecimal,hashToFieldElement(digest.sha256Hex).toString());
  const ephemeral = {...base,consentId:'OTHER',signature:'OTHER',generatedAt:cutoff+99};
  assert.deepEqual(schema.computeCanonicalEvidenceDataHash(ephemeral),digest);
  for (const key of ['accountId','identityNullifierHash'] as const) {
    const altered = structuredClone(base); altered.accountOwner[key] += 'x';
    assert.notEqual(schema.computeCanonicalEvidenceDataHash(altered).sha256Hex,digest.sha256Hex);
  }
  for (const key of ['fromTimestamp','toTimestamp'] as const) {
    const altered = structuredClone(base); altered.timeBounds[key]++; assert.notEqual(schema.computeCanonicalEvidenceDataHash(altered).sha256Hex,digest.sha256Hex);
  }
  for (const key of ['txnId','timestamp','amountMinor','direction','rail','remitterVpa','remitterAccount','reference']) {
    const altered = structuredClone(base); const row = altered.transactions[0];
    row[key] = typeof row[key] === 'number' ? row[key]+1 : row[key]+'x';
    assert.notEqual(schema.computeCanonicalEvidenceDataHash(altered).sha256Hex,digest.sha256Hex);
  }
});

test('REVIEW FINDING: published runtime digest differs from proposed serializer on identical normalized data', () => {
  assert.notEqual(normalizer.computeEvidenceDataHash(owner,[txn()],cutoff),schema.computeCanonicalEvidenceDataHash(preimage()).sha256Hex);
});

test('REVIEW FINDING: omitted remitter.name changes classification/income without changing either dataset digest', () => {
  const a = txn(); const b = txn({remitter:{...a.remitter,name:'BUNDL TECHNOLOGIES PRIVATE LIMITED'}});
  const classifier = new TransactionClassifier(1);
  assert.equal(classifier.classifyTransaction(a).isGigIncome,false);
  assert.equal(classifier.classifyTransaction(b).isGigIncome,true);
  assert.equal(normalizer.computeEvidenceDataHash(owner,[a],cutoff),normalizer.computeEvidenceDataHash(owner,[b],cutoff));
  assert.deepEqual(schema.computeCanonicalEvidenceDataHash(preimage([a])),schema.computeCanonicalEvidenceDataHash(preimage([b])));
  assert.notDeepEqual(calendar.aggregateEvidenceCalendar(classifier.classifyAll([a]),cutoff).monthlyGigIncomeTotals,
    calendar.aggregateEvidenceCalendar(classifier.classifyAll([b]),cutoff).monthlyGigIncomeTotals);
});

test('REVIEW FINDING: proposal is order-sensitive; runtime sorts untrimmed IDs and accepts normalized duplicates', () => {
  const a = txn({txnId:'A'}), b = txn({txnId:'B',amountMinor:20002});
  const p = preimage([a,b]); const reversed = {...p,transactions:[...p.transactions].reverse()};
  assert.notEqual(schema.computeCanonicalEvidenceDataHash(p).sha256Hex,schema.computeCanonicalEvidenceDataHash(reversed).sha256Hex);
  assert.equal(normalizer.computeEvidenceDataHash(owner,[a,b],cutoff),normalizer.computeEvidenceDataHash(owner,[b,a],cutoff));
  const padded = txn({txnId:' B',amountMinor:20002});
  assert.notEqual(normalizer.computeEvidenceDataHash(owner,[a,b],cutoff),normalizer.computeEvidenceDataHash(owner,[a,padded],cutoff));
  const duplicate = txn({txnId:' A ',amountMinor:20002});
  const normalized = normalizer.normalizeAuthenticatedData(owner,[a,duplicate],cutoff);
  assert.equal(normalized.transactions.length,2);
  assert.deepEqual(normalized.transactions.map((t:{txnId:string})=>t.txnId),['A','A']);
});

test('REVIEW FINDING: amount verification accepts unsafe integers and safe source amounts lose precision when summed', () => {
  const unsafe = signed(payload([txn({amountMinor:Number.MAX_SAFE_INTEGER+1})]));
  assert.doesNotThrow(() => new FIPVerifier([unsafe.keys.publicKeyPem]).verifyEnvelope(unsafe.envelope,owner.identityNullifierHash));
  const classifier = new TransactionClassifier(1);
  const remitter = {vpa:'bundltechnologies@icici'};
  const rows = [txn({txnId:'A',amountMinor:Number.MAX_SAFE_INTEGER,remitter}),txn({txnId:'B',amountMinor:2,remitter})];
  const aggregate = calendar.aggregateEvidenceCalendar(classifier.classifyAll(rows),cutoff);
  assert.notEqual(BigInt(aggregate.monthlyGigIncomeTotals[35]),BigInt(Number.MAX_SAFE_INTEGER)+2n);
});

test('completed UTC/ISO bucket boundaries match locked cutoff and exclude partial periods; no-history uses 0', () => {
  const months = calendar.getCompletedMonthIntervals(cutoff), weeks = calendar.getCompletedWeekIntervals(cutoff);
  assert.equal(months.length,36); assert.equal(weeks.length,156);
  assert.equal(months[0].startTs,Date.UTC(2023,9,1)/1000);
  assert.equal(months[35].startTs,Date.UTC(2026,8,1)/1000);
  assert.equal(months[35].endTs,Date.UTC(2026,9,1)/1000);
  assert.equal(weeks[155].startTs,Date.UTC(2026,8,28)/1000);
  assert.equal(weeks[155].endTs,Date.UTC(2026,9,5)/1000);
  const classifier = new TransactionClassifier(1);
  const rows = [txn({timestamp:Date.UTC(2026,9,7)/1000,remitter:{vpa:'bundltechnologies@icici'}})];
  const result = calendar.aggregateEvidenceCalendar(classifier.classifyAll(rows),cutoff);
  assert.ok(result.monthlyGigIncomeTotals.every((v:number)=>v===0)); assert.ok(result.weeklyActivity.every((v:number)=>v===0));
  assert.equal(calendar.aggregateEvidenceCalendar([],cutoff).verifiedHistoryStartDate,0);
});

test('REVIEW FINDING: empty FIP trust set accepts self-signed evidence; explicit trusted set rejects it', () => {
  const attacker = signed(); const authority = crypto.generateFipKeyPair();
  assert.equal(new FIPVerifier().verifyEnvelope(attacker.envelope,owner.identityNullifierHash).valid,true);
  assert.throws(() => new FIPVerifier([authority.publicKeyPem]).verifyEnvelope(attacker.envelope,owner.identityNullifierHash),/Untrusted/);
  const trusted = new FIPVerifier([attacker.keys.publicKeyPem]);
  assert.throws(() => trusted.verifyEnvelope({...attacker.envelope,signature:'00'},owner.identityNullifierHash),/signature invalid/);
  assert.throws(() => trusted.verifyEnvelope(attacker.envelope,'OTHER_IDENTITY'),/binding mismatch/);
});

test('real newly signed envelopes reconstruct the same snapshot/hash at fixed cutoff and directory', async () => {
  const keys = crypto.generateFipKeyPair();
  const verifier = new FIPVerifier([keys.publicKeyPem]);
  const first = payload([txn({remitter:{vpa:'bundltechnologies@icici'}})]);
  const second = {...first,consentId:'NEW_PUBLIC_CONSENT',generatedAt:cutoff+99};
  const commits = [];
  const signatures = [];
  for (const data of [first,second]) {
    const payloadHash = crypto.hashPayload(data);
    const signature = crypto.signPayloadHash(payloadHash,keys.privateKeyPem);
    signatures.push(signature);
    const verification = verifier.verifyEnvelope({payload:data,payloadHash,signature,fipPublicKey:keys.publicKeyPem},owner.identityNullifierHash);
    const {snapshot} = EvidenceSnapshotBuilder.buildSnapshot({fipPayload:verification.payload,passportId:101,
      holderWallet:upstreamFixture.holderWalletAddress,evidenceUpdatedAt:cutoff,sourceDirectoryVersion:1});
    const exactNumber = (n: number) => { assert.ok(Number.isSafeInteger(n) && n>=0); return BigInt(n); };
    const input = {passportId:exactNumber(snapshot.passportId),holderBinding:addressToFieldElement(snapshot.holderBinding),
      evidenceProviderId:providerIdToFieldElement(snapshot.evidenceProviderId),evidenceDataHash:hashToFieldElement(snapshot.evidenceDataHash),
      verifiedHistoryStartDate:exactNumber(snapshot.verifiedHistoryStartDate),evidenceUpdatedAt:exactNumber(snapshot.evidenceUpdatedAt),
      sourceDirectoryVersion:exactNumber(snapshot.sourceDirectoryVersion),monthlyGigIncomeTotals:snapshot.monthlyGigIncomeTotals.map(exactNumber),
      weeklyActivity:snapshot.weeklyActivity.map(exactNumber),monthlyActivity:snapshot.monthlyActivity.map(exactNumber)};
    const {metadataSlots,...result} = hashes.commit(input);
    assert.deepEqual(outputs(await bounded.calculateWitness(encoded(input,result.evidenceCommitment),true)),result);
    commits.push({...result,metadataSlots});
  }
  assert.notEqual(signatures[0],signatures[1]);
  assert.deepEqual(commits[0],commits[1]);
  // This covers only fixed-range public synthetic envelopes. Current consent is checked by FIP, not FIPVerifier.
});

test('REVIEW FINDING: request historical cutoff is used as consent-validation clock and bypasses current expiry', () => {
  const now = Math.floor(Date.now()/1000), historical = now-120;
  const keys = crypto.generateFipKeyPair();
  const consent = {consentId:'PUBLIC_CONSENT',accountId:owner.accountId,status:'ACTIVE',createdAt:now-3600,expiresAt:now-60,
    scope:{accountId:owner.accountId,fromTimestamp:0,toTimestamp:historical,dataTypes:['TRANSACTIONS','PROFILE']}};
  const storage = {getConsent:()=>consent,updateConsentStatus:(_id:string,status:string)=>{consent.status=status;},
    getAccountBinding:()=>owner,getTransactions:()=>[],getKeyPair:()=>keys,getPublicKeyPem:()=>keys.publicKeyPem};
  const service = new AttestationService(new MockFIPService(storage,new ConsentService(storage)),[keys.publicKeyPem]);
  const request = {consentId:consent.consentId,workerWalletAddress:upstreamFixture.holderWalletAddress,
    workerIdentityNullifier:owner.identityNullifierHash,expectedPassportId:101,sourceDirectoryVersion:1};
  assert.equal(service.attestWorkerEvidence({...request,cutoffTimestamp:historical}).verified,true);
  assert.throws(() => service.attestWorkerEvidence(request),/expired/);
});
