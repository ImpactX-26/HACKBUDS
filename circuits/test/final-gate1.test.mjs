// Independent review of exact public Backend A source. Known-gap tests assert the
// observed upstream behavior; passing those tests DOES NOT approve that behavior.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { manifest, reviewRoot } from '../scripts/verify-final-source.mjs';
import { createProvisionalPoseidon, FIELD, PROFILE } from '../dist/shared/proposal/poseidon5.js';
import { hashToFieldElement, addressToFieldElement, providerIdToFieldElement } from '../dist/shared/proposal/field-mappings.js';
import { calculator, encoded, outputs, decimal } from '../dist/circuits/test/runtime.js';

const upstream = path => import(pathToFileURL(resolve(reviewRoot, 'backend/dist', path + '.js')).href);
const { MockFIPStorage } = await upstream('backend/src/fip/storage');
const { ConsentService } = await upstream('backend/src/fip/consent-service');
const { MockFIPService } = await upstream('backend/src/fip/fip-service');
const { MockIdentityProvider } = await upstream('backend/src/identity/mock-idp');
const auth = await upstream('backend/src/identity/wallet-auth');
const { AttestationService } = await upstream('backend/src/evidence/attestation-service');
const { FIPVerifier } = await upstream('backend/src/evidence/fip-verifier');
const { EvidenceSnapshotBuilder } = await upstream('backend/src/evidence/snapshot-builder');
const { TransactionClassifier } = await upstream('backend/src/evidence/classifier');
const { CURRENT_DIRECTORY_VERSION } = await upstream('backend/src/evidence/directory/registry');
const calendar = await upstream('backend/src/evidence/calendar');
const normalizer = await upstream('backend/src/evidence/normalizer');
const schema = await upstream('shared/proposal/canonical-evidence-schema');
const crypto = await upstream('backend/src/fip/crypto');
const { PERSONAS } = await upstream('backend/src/fip/personas/index');
const { createBackendAPoseidon } = await upstream('backend/src/evidence/poseidon-adapter');
const { createAttestationApp } = await upstream('backend/src/http/attestation-app');
const requireA = createRequire(resolve(reviewRoot, 'backend/package.json'));
const { ethers } = requireA('ethers');
const request = requireA('supertest');
const CUTOFF = 1791460800; // 2026-10-08T12:00:00Z; fixed public synthetic fixture cutoff.
const HOLDER = '0x111111cf1046e68e36e1aa2e0e07105eddd1f08e'; // Same public hash parameter as prior fixture.
const owner = PERSONAS.RAMESH.identityNullifierHash;
const storage = new MockFIPStorage(); // Ephemeral signing keys; never persisted or printed.
const idp = new MockIdentityProvider();
const wallet = ethers.Wallet.createRandom();
const identityAssertion = idp.issueAssertion({workerIdentityNullifier: owner, workerWalletAddress: wallet.address});
const consentService = new ConsentService(storage, idp);
const fip = new MockFIPService(storage, consentService, 'MOCK_APNA_BANK_FIP_01', idp);
const createAuth = await auth.signWorkerAuthorization({action:'CREATE_CONSENT', workerWalletAddress:wallet.address,
  consentId:'', expectedPassportId:0}, wallet);
const consent = consentService.createConsent({accountId:PERSONAS.RAMESH.accountId,
  toTimestamp:CUTOFF, identityAssertion, walletAuthorization:createAuth});
async function authorization(overrides = {}) {
  return auth.signWorkerAuthorization({action:'MINT_PASSPORT', workerWalletAddress:wallet.address,
    consentId:consent.consentId, expectedPassportId:101, ...overrides}, wallet);
}
const fetchAuth = await authorization({action:'FETCH_FINANCIAL_DATA'});
const envelope = fip.fetchSignedDataByConsent(consent.consentId,CUTOFF,undefined,
  {identityAssertion,walletAuthorization:fetchAuth});
const verifier = new FIPVerifier([storage.getPublicKeyPem()]);
const payload = verifier.verifyEnvelope(envelope,owner).payload;
function signed(changed) {
  const payloadHash = crypto.hashPayload(changed);
  return {payload:changed,payloadHash,signature:crypto.signPayloadHash(payloadHash,storage.getKeyPair().privateKeyPem),
    fipPublicKey:storage.getPublicKeyPem()};
}
function snapshot(changed = payload, directoryVersion = CURRENT_DIRECTORY_VERSION) {
  // Fixed public HOLDER is a hash-fixture parameter, NOT a mint authorization.
  // Real wallet/IDP/consent authentication is tested separately below.
  return EvidenceSnapshotBuilder.buildSnapshot({fipPayload:verifier.verifyEnvelope(signed(changed),owner).payload,
    passportId:101,holderWallet:HOLDER,evidenceUpdatedAt:CUTOFF,sourceDirectoryVersion:directoryVersion}).snapshot;
}
function hashInput(s) {
  return {passportId:BigInt(s.passportId),holderBinding:addressToFieldElement(s.holderBinding),
    evidenceProviderId:providerIdToFieldElement(s.evidenceProviderId),evidenceDataHash:hashToFieldElement(s.evidenceDataHash),
    verifiedHistoryStartDate:BigInt(s.verifiedHistoryStartDate),evidenceUpdatedAt:BigInt(s.evidenceUpdatedAt),
    sourceDirectoryVersion:BigInt(s.sourceDirectoryVersion),monthlyGigIncomeTotals:s.monthlyGigIncomeTotals.map(BigInt),
    weeklyActivity:s.weeklyActivity.map(BigInt),monthlyActivity:s.monthlyActivity.map(BigInt)};
}
const baseline = snapshot();
const canonical = normalizer.serializeCanonicalEvidence(normalizer.buildCanonicalPreimage(payload.accountOwnerBinding,payload.transactions,CUTOFF));
const bytes = Buffer.from(canonical,'utf8');
const digest = createHash('sha256').update(bytes).digest('hex');
const hashesB = await createProvisionalPoseidon();
const hashesA = await createBackendAPoseidon();
const wasm = await calculator();
const bounded = await calculator('snapshot-hash-bounded');
const variants = {latest:hashInput(baseline)};
variants['historical-directory-v1'] = hashInput(snapshot(payload,1));
const changedAmount = structuredClone(payload);
changedAmount.transactions.find(t => t.direction === 'CREDIT' && t.remitter.vpa === 'bundltechnologies@icici').amountMinor++;
variants['source-amount'] = hashInput(snapshot(changedAmount));
const changedName = structuredClone(payload); changedName.transactions[0].remitter.name += ' CHANGED';
variants['source-remitter-name'] = hashInput(snapshot(changedName));
const changedReference = structuredClone(payload); changedReference.transactions[0].reference += '-changed';
variants['source-reference'] = hashInput(snapshot(changedReference));
for (const key of ['monthlyGigIncomeTotals','weeklyActivity','monthlyActivity']) {
  const input = structuredClone(variants.latest);
  input[key][0] = key === 'monthlyGigIncomeTotals' ? input[key][0]+1n : 1n-input[key][0];
  variants['witness-'+key] = input;
}
variants['ordered-income-reversed'] = {...variants.latest,monthlyGigIncomeTotals:[...variants.latest.monthlyGigIncomeTotals].reverse()};
const vectorPath = 'fixtures/backend-a-e991-vectors.json';
const bytesPath = 'fixtures/backend-a-e991-canonical.synthetic.json';
const results = {};
async function compare(input) {
  const a = hashesA.commit(input), b = hashesB.commit(input);
  assert.deepEqual(a,b);
  const {metadataSlots,...expected} = b;
  const witness = encoded(input,expected.evidenceCommitment);
  assert.deepEqual(outputs(await wasm.calculateWitness(witness,true)),expected);
  assert.deepEqual(outputs(await bounded.calculateWitness(witness,true)),expected);
  return JSON.parse(decimal({...expected,metadataSlots}));
}
// Explicit recording mode writes only after genuine independent adapter and two
// compiled-circuit executions agree for EVERY vector. Normal tests never write.
if (process.argv.includes('--record')) {
  for (const [name,input] of Object.entries(variants)) results[name] = await compare(input);
  writeFileSync(bytesPath,bytes); // Exact UTF-8 canonical bytes, no BOM/newline; synthetic only.
  writeFileSync(vectorPath,JSON.stringify({status:'PROVISIONAL SYNTHETIC REVIEW VECTORS; NOT PROTOCOL APPROVAL',
    sourceCommit:manifest.commit,profile:PROFILE,canonical:{byteLength:bytes.length,transactionCount:payload.transactions.length,
      sha256Hex:digest,fieldElement:(BigInt('0x'+digest)%FIELD).toString()},
    holderParameter:HOLDER,cutoff:CUTOFF,input:JSON.parse(decimal(variants.latest)),vectors:results},null,2)+'\n');
}
const golden = JSON.parse(readFileSync(vectorPath,'utf8'));

test('fresh authenticated canonical bytes, SHA-256 and digest field reproduce recorded synthetic dataset', () => {
  assert.equal(golden.sourceCommit,manifest.commit); assert.equal(golden.profile,PROFILE);
  assert.equal(bytes.length,golden.canonical.byteLength);
  assert.deepEqual(bytes,readFileSync(bytesPath));
  assert.equal(digest,baseline.evidenceDataHash);
  assert.equal(digest,golden.canonical.sha256Hex);
  assert.equal(hashToFieldElement(digest),BigInt('0x'+digest)%FIELD);
  assert.equal(schema.hashToFieldElement(digest),hashToFieldElement(digest));
  assert.equal(schema.addressToFieldElement(HOLDER),addressToFieldElement(HOLDER));
  assert.equal(schema.providerIdToFieldElement(payload.fipId),providerIdToFieldElement(payload.fipId));
  assert.deepEqual(JSON.parse(decimal(variants.latest)),golden.input);
  const previous = JSON.parse(readFileSync('fixtures/backend-a-gate1-vectors.json','utf8')).vectors.backendA;
  assert.equal(golden.vectors.latest.incomeRoot,previous.incomeRoot);
  assert.equal(golden.vectors.latest.weeklyRoot,previous.weeklyRoot);
  assert.equal(golden.vectors.latest.monthlyRoot,previous.monthlyRoot);
  assert.equal(golden.vectors.latest.metadataSlots[1],previous.metadataSlots[1]);
  assert.notEqual(golden.vectors.latest.evidenceCommitment,previous.evidenceCommitment);
  const record = JSON.parse(canonical);
  assert.deepEqual(Object.keys(record),['accountOwner','timeBounds','transactions','version']);
  assert.equal(record.accountOwner.identityNullifierHash,owner);
  assert.equal(record.timeBounds.toTimestamp,CUTOFF);
  for (const key of ['consentId','generatedAt','signature','verifiedAt','fipPublicKey']) assert.ok(!Object.hasOwn(record,key));
  assert.ok(record.transactions.every(t => Object.hasOwn(t,'remitterName') && Object.hasOwn(t,'reference')));
});
for (const [name,input] of Object.entries(variants)) {
  test(`latest dataset Backend A TS / Backend B TS / Circom / bounded Circom parity: ${name}`, async () => {
    assert.deepEqual(await compare(input),golden.vectors[name]);
    if (name !== 'latest') {
      const original = hashesB.commit(variants.latest).evidenceCommitment;
      assert.notEqual(hashesB.commit(input).evidenceCommitment,original);
      await assert.rejects(() => bounded.calculateWitness(encoded(input,original),true),/Assert Failed|constraint/i);
    }
  });
}
test('reordered authenticated transactions reproduce canonical bytes and all hashes', async () => {
  const p = structuredClone(payload); p.transactions.reverse();
  assert.equal(normalizer.serializeCanonicalEvidence(normalizer.buildCanonicalPreimage(p.accountOwnerBinding,p.transactions,CUTOFF)),canonical);
  assert.deepEqual(snapshot(p),baseline);
  assert.deepEqual(await compare(hashInput(snapshot(p))),golden.vectors.latest);
});
test('ephemeral signed envelope changes preserve digest and arrays', () => {
  const p = structuredClone(payload); p.generatedAt++; p.consentId = 'SYNTHETIC_RECONSENT';
  p.accountOwnerBinding.verifiedAt++;
  assert.deepEqual(snapshot(p),baseline);
});
test('unsigned payload tampering and owner mismatch fail the provenance gate', () => {
  const e = structuredClone(envelope); e.payload.transactions[0].amountMinor++;
  assert.throws(() => verifier.verifyEnvelope(e,owner),/hash mismatch|signature/i);
  const signatureTamper = {...envelope,signature:'00'+envelope.signature.slice(2)};
  assert.throws(() => verifier.verifyEnvelope(signatureTamper,owner),/signature/i);
  assert.throws(() => verifier.verifyEnvelope(envelope,PERSONAS.ARJUN.identityNullifierHash),/owner binding mismatch/i);
});
test('changed authenticated amount, remitter name, reference and owner data alter the digest', () => {
  for (const p of [changedAmount,changedName,changedReference]) assert.notEqual(snapshot(p).evidenceDataHash,digest);
  const account = {...payload.accountOwnerBinding,accountId:'SYNTHETIC_CHANGED_ACCOUNT'};
  assert.notEqual(normalizer.computeEvidenceDataHash(account,payload.transactions,CUTOFF),digest);
});
test('normalized duplicate IDs at adjacent timestamps are rejected', () => {
  const p = structuredClone(payload); p.transactions = [p.transactions[0],{...p.transactions[0],txnId:' '+p.transactions[0].txnId+' '}];
  assert.throws(() => snapshot(p),/Duplicate transaction ID/);
});
test('KNOWN GAP: nonadjacent normalized duplicate IDs survive and double-count income', () => {
  const first = payload.transactions.find(t => t.direction === 'CREDIT' && t.remitter.vpa === 'bundltechnologies@icici');
  const p = structuredClone(payload);
  p.transactions = [{...first,txnId:'DUP',timestamp:first.timestamp},
    {...first,txnId:'MIDDLE',timestamp:first.timestamp+1},
    {...first,txnId:' DUP ',timestamp:first.timestamp+2}];
  const s = snapshot(p);
  assert.equal(JSON.parse(normalizer.serializeCanonicalEvidence(normalizer.buildCanonicalPreimage(p.accountOwnerBinding,p.transactions,CUTOFF))).transactions.length,3);
  assert.equal(s.monthlyGigIncomeTotals.reduce((a,b)=>a+b,0),3*first.amountMinor);
});
test('KNOWN GAP: trimmed name/VPA/account/rail hash identically but classification changes', () => {
  const first = payload.transactions.find(t => t.direction === 'CREDIT' && t.remitter.vpa === 'bundltechnologies@icici');
  for (const selector of ['name','vpa','account','rail']) {
    const p = structuredClone(payload);
    const remitter = selector === 'rail' ? structuredClone(first.remitter) : {[selector]:first.remitter[selector]};
    p.transactions = [{...first,remitter}];
    const q = structuredClone(p);
    if (selector === 'rail') q.transactions[0].rail = ' '+first.rail+' ';
    else q.transactions[0].remitter[selector] = ' '+remitter[selector]+' ';
    const original = snapshot(p), modified = snapshot(q);
    assert.equal(original.evidenceDataHash,modified.evidenceDataHash,selector);
    assert.notDeepEqual(original.monthlyGigIncomeTotals,modified.monthlyGigIncomeTotals,selector);
  }
});
test('MAX_SAFE_INTEGER is accepted; larger source amounts and monthly sums fail closed', async () => {
  const first = payload.transactions.find(t => t.direction === 'CREDIT' && t.remitter.vpa === 'bundltechnologies@icici');
  const p = structuredClone(payload); p.transactions = [{...first,amountMinor:Number.MAX_SAFE_INTEGER}];
  const s = snapshot(p); assert.equal(Math.max(...s.monthlyGigIncomeTotals),Number.MAX_SAFE_INTEGER);
  await compare(hashInput(s));
  const unsafe = structuredClone(p); unsafe.transactions[0].amountMinor = Number.MAX_SAFE_INTEGER+1;
  assert.throws(() => snapshot(unsafe),/amount/i);
  const aggregate = structuredClone(p); aggregate.transactions.push({...first,txnId:'ONE_MORE_PAISE',amountMinor:1});
  assert.throws(() => snapshot(aggregate),/precision limit/);
  const preimage = normalizer.buildCanonicalPreimage(p.accountOwnerBinding,p.transactions,CUTOFF);
  preimage.transactions[0].amountMinor = 18446744073709551615n;
  assert.throws(() => schema.serializeCanonicalEvidence(preimage),/invalid amountMinor/);
});
test('partial current month/week excluded; history start remains separate earliest recognized UTC day', () => {
  const first = payload.transactions.find(t => t.direction === 'CREDIT' && t.remitter.vpa === 'bundltechnologies@icici');
  const p = structuredClone(payload); p.transactions = [{...first,timestamp:CUTOFF-60}];
  const s = snapshot(p);
  assert.ok(s.monthlyGigIncomeTotals.every(v=>v===0)); assert.ok(s.monthlyActivity.every(v=>v===0));
  assert.ok(s.weeklyActivity.every(v=>v===0));
  assert.equal(s.verifiedHistoryStartDate,Math.floor((CUTOFF-60)/86400));
  const months = calendar.getCompletedMonthIntervals(CUTOFF), weeks = calendar.getCompletedWeekIntervals(CUTOFF);
  assert.equal(months[0].startTs,Date.UTC(2023,9,1)/1000);
  assert.equal(months[35].endTs,Date.UTC(2026,9,1)/1000);
  assert.equal(weeks[155].endTs,Date.UTC(2026,9,5)/1000);
});
test('field aliases, invalid activity flags and modified zero padding reject or change hashes', async () => {
  for (const p of [{...variants.latest,evidenceDataHash:FIELD},
    {...variants.latest,weeklyActivity:[2n,...variants.latest.weeklyActivity.slice(1)]}]) assert.throws(()=>hashesB.commit(p));
  const padded = [...variants.latest.monthlyGigIncomeTotals,1n];
  assert.notEqual(hashesB.tree4(padded,[1100n,1101n,1102n]),hashesB.commit(variants.latest).incomeRoot);
  assert.throws(()=>hashesB.commit({...variants.latest,monthlyGigIncomeTotals:padded}));
  const input = encoded(variants.latest,hashesB.commit(variants.latest).evidenceCommitment);
  input.weeklyActivity[0] = '2';
  await assert.rejects(()=>bounded.calculateWitness(input,true),/Assert Failed|constraint/i);
});
function service() { return new AttestationService(fip,[storage.getPublicKeyPem()],idp); }
async function attestation(overrides={}) {
  return {consentId:consent.consentId,workerWalletAddress:wallet.address,workerIdentityNullifier:owner,
    expectedPassportId:101,sourceDirectoryVersion:CURRENT_DIRECTORY_VERSION,cutoffTimestamp:CUTOFF,identityAssertion,
    walletAuthorization:await authorization(overrides)};
}
test('one service instance rejects repeated signature and same nonce under a fresh signature', async () => {
  const s = service(), req = await attestation({nonce:'review-nonce'});
  assert.equal(s.attestWorkerEvidence(req).verified,true);
  assert.throws(()=>s.attestWorkerEvidence(req),/ReplayAttackDetected/);
  req.walletAuthorization = await authorization({nonce:'review-nonce',timestamp:Math.floor(Date.now()/1000)+1});
  assert.throws(()=>s.attestWorkerEvidence(req),/nonce .*already consumed/);
});
test('KNOWN GAP: new service instance/restart accepts an already-consumed authorization', async () => {
  const req = await attestation();
  assert.equal(service().attestWorkerEvidence(req).verified,true);
  assert.equal(service().attestWorkerEvidence(req).verified,true);
});
test('KNOWN GAP: strict HTTP attestation and reconstruction accept repeated identical submissions', async () => {
  const app = createAttestationApp({fipService:fip,trustedFipPublicKeys:[storage.getPublicKeyPem()],idp});
  const req = await attestation();
  for (let i=0;i<2;i++) assert.equal((await request(app).post('/attestation/attest').send(req)).status,200);
  const reconstruction = {...await attestation({action:'RECONSTRUCT_EVIDENCE'}),passportId:101,evidenceUpdatedAt:CUTOFF};
  for (let i=0;i<2;i++) assert.equal((await request(app).post('/attestation/reconstruct').send(reconstruction)).status,200);
});
test('KNOWN GAP: mint attestation accepts reconstruction action and wrong optional chain domain', async () => {
  const req = await attestation({action:'RECONSTRUCT_EVIDENCE',chainId:1});
  assert.equal(service().attestWorkerEvidence(req).verified,true);
});
test('invalid downstream evidence consumes authorization before successful attestation', async () => {
  const req = await attestation(), s = service();
  const expired = consentService.createConsent({accountId:PERSONAS.RAMESH.accountId,durationSeconds:-1,
    identityAssertion,walletAuthorization:createAuth});
  req.consentId = expired.consentId;
  req.walletAuthorization = await authorization({consentId:expired.consentId});
  assert.throws(()=>s.attestWorkerEvidence(req),/consent expired/);
  assert.throws(()=>s.attestWorkerEvidence(req),/ReplayAttackDetected/);
});
test('KNOWN GAP: attestation accepts unpublished source directory version', async () => {
  const req = await attestation(); req.sourceDirectoryVersion = 999999;
  assert.equal(service().attestWorkerEvidence(req).snapshot.sourceDirectoryVersion,999999);
});
test('KNOWN GAP: direct FIP service retrieval accepts omitted or partial authentication', () => {
  assert.equal(verifier.verifyEnvelope(fip.fetchSignedDataByConsent(consent.consentId,CUTOFF),owner).valid,true);
  assert.equal(verifier.verifyEnvelope(fip.fetchSignedDataByConsent(consent.consentId,CUTOFF,undefined,{identityAssertion}),owner).valid,true);
});
test('KNOWN GAP: shared schema accepts undersized digests and noncanonical provider identifiers', () => {
  assert.equal(schema.hashToFieldElement('01'),1n);
  assert.doesNotThrow(()=>schema.providerIdToFieldElement(' MOCK_APNA_BANK_FIP_01'));
  assert.throws(()=>hashToFieldElement('01')); assert.throws(()=>providerIdToFieldElement(' MOCK_APNA_BANK_FIP_01'));
});
test('KNOWN GAP: claimed ASCII ordering permits Unicode with differing UTF-16/UTF-8 order', () => {
  const p = normalizer.buildCanonicalPreimage(payload.accountOwnerBinding,payload.transactions.slice(0,1),CUTOFF);
  const t = p.transactions[0]; p.transactions = [{...t,txnId:'\uE000'},{...t,txnId:'\u{10000}'}];
  const ids = JSON.parse(schema.serializeCanonicalEvidence(p)).transactions.map(t=>t.txnId);
  assert.notDeepEqual(ids,[...ids].sort((a,b)=>Buffer.compare(Buffer.from(a),Buffer.from(b))));
});
