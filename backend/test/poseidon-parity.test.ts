/**
 * GigVault - Backend A & Backend B Gate 1 Interoperability & Parity Tests
 * 
 * Verifies:
 * 1. Reproduces Backend B's four hash outputs against matching inputs from typed-snapshot-fixture.json.
 * 2. Validates unified canonical serializer (remitter.name provenance, deterministic sorting, duplicate-ID rejection).
 * 3. Exact integer arithmetic & unsafe number rejection.
 * 4. Pinned Mock IDP & FIP trust boundaries.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createBackendAPoseidon } from '../src/evidence/poseidon-adapter.js';
import { field } from '../../shared/proposal/poseidon5.js';
import { addressToFieldElement, hashToFieldElement, providerIdToFieldElement } from '../../shared/proposal/field-mappings.js';
import {
  serializeCanonicalEvidence,
  computeCanonicalEvidenceDataHash,
  type CanonicalEvidencePreimage,
} from '../../shared/proposal/canonical-evidence-schema.js';
import { computeEvidenceDataHash } from '../src/evidence/normalizer.js';
import { TransactionClassifier } from '../src/evidence/classifier.js';
import { aggregateEvidenceCalendar } from '../src/evidence/calendar.js';
import { FIPVerifier } from '../src/evidence/fip-verifier.js';
import { generateFipKeyPair, hashPayload, signPayloadHash } from '../src/fip/crypto.js';
import crypto from 'node:crypto';
import { ethers } from 'ethers';
import { MockFIPStorage } from '../src/fip/storage.js';
import { PERSONAS } from '../src/fip/personas/index.js';
import { EvidenceSnapshotBuilder } from '../src/evidence/snapshot-builder.js';
import { buildCanonicalPreimage } from '../src/evidence/normalizer.js';
import { AttestationService } from '../src/evidence/attestation-service.js';
import { MockFIPService } from '../src/fip/fip-service.js';
import { ConsentService } from '../src/fip/consent-service.js';
import { MockIdentityProvider } from '../src/identity/mock-idp.js';
import { signWorkerAuthorization } from '../src/identity/wallet-auth.js';
import type { RawTransaction, AccountOwnerBinding } from '../src/fip/types.js';

describe('Gate 1 Poseidon Parity & Interoperability (Backend A <-> Backend B)', () => {
  it('MUST REPRODUCE: Backend B published Gate 1 snapshot roots and commitment exactly', async () => {
    const fixturePath = resolve(process.cwd(), '../shared/proposal/typed-snapshot-fixture.json');
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));

    const hashes = await createBackendAPoseidon();

    const input = {
      passportId: BigInt(fixture.passportId),
      holderBinding: addressToFieldElement(fixture.holderWalletAddress),
      evidenceProviderId: providerIdToFieldElement(fixture.evidenceProviderCanonicalId),
      evidenceDataHash: hashToFieldElement(fixture.evidenceDataHashHex),
      verifiedHistoryStartDate: BigInt(fixture.verifiedHistoryStartDateDays),
      evidenceUpdatedAt: BigInt(fixture.evidenceUpdatedAtSeconds),
      sourceDirectoryVersion: BigInt(fixture.sourceDirectoryVersion),
      monthlyGigIncomeTotals: fixture.monthlyGigIncomeTotalsPaise.map((x: string) => BigInt(x)),
      weeklyActivity: fixture.weeklyActivityFlags.map((x: string) => BigInt(x)),
      monthlyActivity: fixture.monthlyActivityFlags.map((x: string) => BigInt(x)),
    };

    const res = hashes.commit(input);

    // Exact expected decimal field values for v0.2 under BN254 Fr (profile gv-poseidon-hash-only-0.2.0)
    const expectedIncomeRoot = '20119275159189889380691640169503521072267433455885550380794051959666890461667';
    const expectedWeeklyRoot = '21852563639151117767628491974987827408917650138870771480290417841191760527724';
    const expectedMonthlyRoot = '13559395075388244745760140214469017241871546221208979575604441749602464732002';
    const expectedCommitment = '8604199483245315794575037546264188139946404873266288475026472059194307212904';

    assert.strictEqual(res.incomeRoot.toString(), expectedIncomeRoot, 'incomeRoot must match Backend B output');
    assert.strictEqual(res.weeklyRoot.toString(), expectedWeeklyRoot, 'weeklyRoot must match Backend B output');
    assert.strictEqual(res.monthlyRoot.toString(), expectedMonthlyRoot, 'monthlyRoot must match Backend B output');
    assert.strictEqual(res.evidenceCommitment.toString(), expectedCommitment, 'evidenceCommitment must match v0.2 profile output');
  });

  it('MUST PRESERVE: historical v0.1 vector in typed-snapshot-fixture.v0.1.legacy.json and reject silent reinterpretation', () => {
    const legacyPath = resolve(process.cwd(), '../shared/proposal/typed-snapshot-fixture.v0.1.legacy.json');
    const legacyFixture = JSON.parse(readFileSync(legacyPath, 'utf8'));

    assert.strictEqual(legacyFixture.profile, 'gv-poseidon-hash-only-0.1.0');
    assert.ok(legacyFixture.status.startsWith('LEGACY_HISTORICAL_V0_1'));
    assert.strictEqual(
      legacyFixture.proposedMetadataSlots.evidenceCommitment,
      '17057776044314545379576656229478007760108694673197752276092855675165560572398'
    );

    const currentPath = resolve(process.cwd(), '../shared/proposal/typed-snapshot-fixture.json');
    const currentFixture = JSON.parse(readFileSync(currentPath, 'utf8'));

    assert.strictEqual(currentFixture.profile, 'gv-poseidon-hash-only-0.2.0');
    assert.strictEqual(
      currentFixture.proposedMetadataSlots.evidenceCommitment,
      '8604199483245315794575037546264188139946404873266288475026472059194307212904'
    );

    assert.notStrictEqual(
      legacyFixture.proposedMetadataSlots.evidenceCommitment,
      currentFixture.proposedMetadataSlots.evidenceCommitment,
      'Historical v0.1 commitment must never be silently reinterpreted as v0.2'
    );
  });

  it('MUST BIND: authenticated remitter.name in canonical dataset digest', () => {
    const owner: AccountOwnerBinding = {
      accountId: 'ACC_TEST_01',
      ownerName: 'Test Worker',
      identityNullifierHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      verifiedAt: 1700000000,
    };

    const txnWithoutName: RawTransaction = {
      txnId: 'TXN_001',
      timestamp: 1720000000,
      amountMinor: 250000,
      currency: 'INR',
      direction: 'CREDIT',
      rail: 'UPI',
      remitter: { vpa: 'swiggy@icici', name: '' },
      reference: 'REF001',
      narration: 'Payout',
    };

    const txnWithName: RawTransaction = {
      ...txnWithoutName,
      remitter: { vpa: 'swiggy@icici', name: 'BUNDL TECHNOLOGIES PRIVATE LIMITED' },
    };

    const hashWithoutName = computeEvidenceDataHash(owner, [txnWithoutName], 1730000000);
    const hashWithName = computeEvidenceDataHash(owner, [txnWithName], 1730000000);

    // Provenance finding fix: remitter.name is now bound into evidenceDataHash
    assert.notStrictEqual(
      hashWithoutName,
      hashWithName,
      'Changing remitter.name MUST change the computed evidenceDataHash'
    );
  });

  it('MUST ENFORCE: deterministic sorting and duplicate-ID rejection in canonical serializer', () => {
    const owner: AccountOwnerBinding = {
      accountId: 'ACC_TEST_01',
      ownerName: 'Test Worker',
      identityNullifierHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      verifiedAt: 1700000000,
    };

    const txnA: RawTransaction = {
      txnId: 'TXN_A',
      timestamp: 1720000100,
      amountMinor: 100000,
      currency: 'INR',
      direction: 'CREDIT',
      rail: 'UPI',
      remitter: { vpa: 'a@upi' },
      reference: 'REFA',
      narration: 'Payout A',
    };

    const txnB: RawTransaction = {
      txnId: 'TXN_B',
      timestamp: 1720000200,
      amountMinor: 200000,
      currency: 'INR',
      direction: 'CREDIT',
      rail: 'UPI',
      remitter: { vpa: 'b@upi' },
      reference: 'REFB',
      narration: 'Payout B',
    };

    // Permuted order produces identical hash
    const hash1 = computeEvidenceDataHash(owner, [txnA, txnB], 1730000000);
    const hash2 = computeEvidenceDataHash(owner, [txnB, txnA], 1730000000);
    assert.strictEqual(hash1, hash2, 'Permuted transaction ordering MUST produce identical canonical hash');

    // Duplicate transaction ID (with whitespace) must be rejected
    const txnADup: RawTransaction = {
      ...txnA,
      txnId: '  TXN_A  ',
    };
    assert.throws(
      () => computeEvidenceDataHash(owner, [txnA, txnADup], 1730000000),
      /Duplicate transaction ID detected/
    );
  });

  it('MUST REJECT: unsafe integers beyond MAX_SAFE_INTEGER at FIP verifier boundary', () => {
    const authority = generateFipKeyPair();
    const verifier = new FIPVerifier([authority.publicKeyPem]);

    const unsafePayload = {
      schemaVersion: 'GIGVAULT_FIP_MOCK_V1' as const,
      fipId: 'TEST_FIP',
      consentId: 'CONSENT_TEST',
      accountId: 'ACC_01',
      accountOwnerBinding: {
        accountId: 'ACC_01',
        ownerName: 'Test',
        identityNullifierHash: '0x1111',
        verifiedAt: 1000,
      },
      dataRange: { fromTimestamp: 0, toTimestamp: 2000 },
      transactions: [
        {
          txnId: 'T1',
          timestamp: 1500,
          amountMinor: Number.MAX_SAFE_INTEGER + 1, // Unsafe float beyond 2^53 - 1
          currency: 'INR' as const,
          direction: 'CREDIT' as const,
          rail: 'UPI' as const,
          remitter: {},
          reference: 'R1',
          narration: 'N1',
        },
      ],
      generatedAt: 1600,
    };

    const payloadHash = hashPayload(unsafePayload);
    const signature = signPayloadHash(payloadHash, authority.privateKeyPem);
    const envelope = {
      payload: unsafePayload,
      payloadHash,
      signature,
      fipPublicKey: authority.publicKeyPem,
    };

    assert.throws(
      () => verifier.verifyEnvelope(envelope, '0x1111'),
      /Invalid transaction amountMinor: must be non-negative safe integer paise/
    );
  });

  it('MUST REGENERATE & MATCH: latest authenticated synthetic Ramesh records against Backend B e991 fixtures', async () => {
    const storage = new MockFIPStorage();
    const ramesh = PERSONAS.RAMESH;
    const cutoff = 1791460800; // 2026-10-08 12:00 UTC
    const txns = storage.getTransactions(ramesh.accountId).filter((t) => t.timestamp <= cutoff);
    assert.strictEqual(txns.length, 327, 'Synthetic Ramesh dataset must have exactly 327 transactions <= cutoff');

    const binding = storage.getAccountBinding(ramesh.accountId);
    assert.ok(binding, 'Account binding must exist for Ramesh');

    // 1. Serialize canonical evidence and verify exact UTF-8 byte length and SHA-256
    const preimage = buildCanonicalPreimage(binding, txns, cutoff);
    const canonicalJson = serializeCanonicalEvidence(preimage);
    const canonicalBytes = Buffer.from(canonicalJson, 'utf8');

    assert.strictEqual(
      canonicalBytes.length,
      82134,
      'Canonical serialized UTF-8 bytes must be exactly 82,134 bytes'
    );

    const sha256Hex = crypto.createHash('sha256').update(canonicalBytes).digest('hex');
    assert.strictEqual(
      sha256Hex,
      '432394cab6b2caa83ed0c69e975b5766cd08c7c1fa167e81a7a01faae65ab303',
      'Canonical SHA-256 must match Backend B e991 fixture'
    );

    const dataHashField = hashToFieldElement(sha256Hex);
    assert.strictEqual(
      dataHashField.toString(),
      '8479584554115755712227973106457499606215655587126641756916754680375204819714',
      'Digest mod Fr field element must match v0.2 specification'
    );

    // 2. Build snapshot with Directory Version 3
    const payload = {
      schemaVersion: 'GIGVAULT_FIP_MOCK_V1' as const,
      fipId: 'MOCK_APNA_BANK_FIP_01',
      consentId: 'TEST_CONSENT',
      accountId: ramesh.accountId,
      accountOwnerBinding: binding,
      dataRange: { fromTimestamp: 0, toTimestamp: cutoff },
      transactions: txns,
      generatedAt: cutoff,
    };

    const { snapshot: snapshotDir3 } = EvidenceSnapshotBuilder.buildSnapshot({
      fipPayload: payload,
      passportId: 101,
      holderWallet: '0x111111cf1046e68e36e1aa2e0e07105eddd1f08e',
      evidenceUpdatedAt: cutoff,
      sourceDirectoryVersion: 3,
    });

    assert.strictEqual(snapshotDir3.verifiedHistoryStartDate, 19727);

    // 3. Verify Poseidon roots and Directory 3 commitment
    const poseidon = await createBackendAPoseidon();
    const commitDir3 = poseidon.commit({
      passportId: BigInt(101),
      holderBinding: addressToFieldElement('0x111111cf1046e68e36e1aa2e0e07105eddd1f08e'),
      evidenceProviderId: providerIdToFieldElement('MOCK_APNA_BANK_FIP_01'),
      evidenceDataHash: dataHashField,
      verifiedHistoryStartDate: BigInt(snapshotDir3.verifiedHistoryStartDate),
      evidenceUpdatedAt: BigInt(cutoff),
      sourceDirectoryVersion: BigInt(3),
      monthlyGigIncomeTotals: snapshotDir3.monthlyGigIncomeTotals.map((x) => BigInt(x)),
      weeklyActivity: snapshotDir3.weeklyActivity.map((x) => BigInt(x)),
      monthlyActivity: snapshotDir3.monthlyActivity.map((x) => BigInt(x)),
    });

    assert.strictEqual(
      commitDir3.incomeRoot.toString(),
      '20119275159189889380691640169503521072267433455885550380794051959666890461667'
    );
    assert.strictEqual(
      commitDir3.weeklyRoot.toString(),
      '21852563639151117767628491974987827408917650138870771480290417841191760527724'
    );
    assert.strictEqual(
      commitDir3.monthlyRoot.toString(),
      '13559395075388244745760140214469017241871546221208979575604441749602464732002'
    );
    assert.strictEqual(
      commitDir3.evidenceCommitment.toString(),
      '14197618820907159849885924515057744223641221979692719261260710044385666247302',
      'Commitment (dir 3) must match v0.2 vector'
    );

    // 4. Historical Directory 1 vector
    const { snapshot: snapshotDir1 } = EvidenceSnapshotBuilder.buildSnapshot({
      fipPayload: payload,
      passportId: 101,
      holderWallet: '0x111111cf1046e68e36e1aa2e0e07105eddd1f08e',
      evidenceUpdatedAt: cutoff,
      sourceDirectoryVersion: 1,
    });

    const commitDir1 = poseidon.commit({
      passportId: BigInt(101),
      holderBinding: addressToFieldElement('0x111111cf1046e68e36e1aa2e0e07105eddd1f08e'),
      evidenceProviderId: providerIdToFieldElement('MOCK_APNA_BANK_FIP_01'),
      evidenceDataHash: dataHashField,
      verifiedHistoryStartDate: BigInt(snapshotDir1.verifiedHistoryStartDate),
      evidenceUpdatedAt: BigInt(cutoff),
      sourceDirectoryVersion: BigInt(1),
      monthlyGigIncomeTotals: snapshotDir1.monthlyGigIncomeTotals.map((x) => BigInt(x)),
      weeklyActivity: snapshotDir1.weeklyActivity.map((x) => BigInt(x)),
      monthlyActivity: snapshotDir1.monthlyActivity.map((x) => BigInt(x)),
    });

    assert.strictEqual(
      commitDir1.evidenceCommitment.toString(),
      '3215476944588819167795523858993862318258515346890913709400108960051608252520',
      'Historical commitment (dir 1) must match v0.2 vector'
    );
  });

  it('MUST REJECT: values in [r, q) at Poseidon and schema boundaries', async () => {
    const r = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
    const q = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;

    // Test a scalar strictly within [r, q)
    const testScalar = r + 42n;
    assert.ok(testScalar < q, 'testScalar is strictly within base field Fq');
    assert.ok(testScalar >= r, 'testScalar is strictly outside scalar field Fr');

    const hashes = await createBackendAPoseidon();

    // Poseidon field() validator must reject values in [r, q)
    assert.throws(
      () => field(testScalar),
      /Scalar outside BN254 field/
    );

    // Any attempt to commit with a value in [r, q) must throw
    assert.throws(
      () =>
        hashes.commit({
          passportId: testScalar,
          holderBinding: 101n,
          evidenceProviderId: 202n,
          evidenceDataHash: 303n,
          verifiedHistoryStartDate: 19000n,
          evidenceUpdatedAt: 1730000000n,
          sourceDirectoryVersion: 3n,
          monthlyGigIncomeTotals: new Array(36).fill(0n),
          weeklyActivity: new Array(156).fill(0n),
          monthlyActivity: new Array(36).fill(0n),
        }),
      /Scalar outside BN254 field/
    );
  });

  it('MUST REJECT: live on-chain contract submission with mock SHA-256 commitment', async () => {
    const storage = new MockFIPStorage();
    const idp = new MockIdentityProvider();
    const consentService = new ConsentService(storage, idp, false);
    const fipService = new MockFIPService(storage, consentService, 'MOCK_APNA_BANK_FIP_01', idp, false);
    const attestationService = new AttestationService(
      fipService,
      [storage.getPublicKeyPem()],
      idp
    );

    const testWallet = ethers.Wallet.createRandom();
    const consent = consentService.createConsent({
      accountId: PERSONAS.RAMESH.accountId,
    });
    const assertion = idp.issueAssertion({
      workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
      workerWalletAddress: testWallet.address,
    });
    const auth = await signWorkerAuthorization({
      action: 'MINT_PASSPORT',
      workerWalletAddress: testWallet.address,
      consentId: consent.consentId,
      expectedPassportId: 101,
    }, testWallet);

    // Live contract client simulator (isMockClient is false or undefined)
    const simulatedLiveContractClient = {
      isMockClient: false,
      mint: async () => 101,
      getNextPassportId: async () => 101,
    } as any;

    await assert.rejects(
      async () => {
        await attestationService.attestAndMintOnChain(
          {
            consentId: consent.consentId,
            workerWalletAddress: testWallet.address,
            workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
            expectedPassportId: 101,
            identityAssertion: assertion,
            walletAuthorization: auth,
          },
          simulatedLiveContractClient
        );
      },
      /LiveSubmissionProhibited: mock SHA-256 test commitment minting is strictly confined/
    );
  });

  it('MUST ENSURE: normalized authenticated fields used consistently for both classification and hashing', () => {
    const owner: AccountOwnerBinding = {
      accountId: 'ACC_TEST_01',
      ownerName: 'Ramesh Kumar',
      identityNullifierHash: '0x1111222233334444555566667777888899990000111122223333444455556666',
      verifiedAt: 1700000000,
    };

    // Transaction with extra surrounding whitespace in rail and remitter
    const paddedTxn: RawTransaction = {
      txnId: 'TXN_PADDED_01',
      timestamp: 1720000000,
      amountMinor: 350000,
      currency: 'INR',
      direction: 'CREDIT',
      rail: '  UPI  ' as any,
      remitter: {
        vpa: '  SWIGGY@ICICI  ',
        name: '  BUNDL TECHNOLOGIES PRIVATE LIMITED  ',
        account: '  1234567890  ',
      },
      reference: '  REF123  ',
      narration: 'Payout from gig work',
    };

    const payload: any = {
      schemaVersion: 'GIGVAULT_FIP_MOCK_V1',
      fipId: 'MOCK_APNA_BANK_FIP_01',
      consentId: 'C1',
      accountId: 'ACC_TEST_01',
      accountOwnerBinding: owner,
      dataRange: { fromTimestamp: 0, toTimestamp: 1730000000 },
      transactions: [paddedTxn],
      generatedAt: 1730000000,
    };

    const { snapshot } = EvidenceSnapshotBuilder.buildSnapshot({
      fipPayload: payload,
      passportId: 101,
      holderWallet: '0x111111cf1046e68e36e1aa2e0e07105eddd1f08e',
      evidenceUpdatedAt: 1730000000,
      sourceDirectoryVersion: 3,
    });

    // Payout MUST be classified as eligible gig income despite padded rail and vpa
    const totalIncome = snapshot.monthlyGigIncomeTotals.reduce((a, b) => a + b, 0);
    assert.strictEqual(totalIncome, 350000, 'Classification must recognize padded normalized fields');
    assert.ok(snapshot.evidenceDataHash, 'evidenceDataHash must be cleanly generated');
  });

  it('MUST REJECT: duplicate transaction IDs across all timestamps in EvidenceSnapshotBuilder', () => {
    const owner: AccountOwnerBinding = {
      accountId: 'ACC_TEST_01',
      ownerName: 'Test Worker',
      identityNullifierHash: '0x1111',
      verifiedAt: 1700000000,
    };

    // Nonadjacent duplicates at different timestamps, one with whitespace padding
    const duplicateTxns: RawTransaction[] = [
      {
        txnId: 'DUP_TXN_01',
        timestamp: 1720000100,
        amountMinor: 100000,
        currency: 'INR',
        direction: 'CREDIT',
        rail: 'UPI',
        remitter: {},
        reference: '',
        narration: '',
      },
      {
        txnId: 'MIDDLE_TXN',
        timestamp: 1720000200,
        amountMinor: 100000,
        currency: 'INR',
        direction: 'CREDIT',
        rail: 'UPI',
        remitter: {},
        reference: '',
        narration: '',
      },
      {
        txnId: ' DUP_TXN_01 ', // Nonadjacent duplicate with whitespace padding
        timestamp: 1720000300,
        amountMinor: 100000,
        currency: 'INR',
        direction: 'CREDIT',
        rail: 'UPI',
        remitter: {},
        reference: '',
        narration: '',
      },
    ];

    const payload: any = {
      schemaVersion: 'GIGVAULT_FIP_MOCK_V1',
      fipId: 'TEST_FIP',
      consentId: 'C1',
      accountId: 'ACC_TEST_01',
      accountOwnerBinding: owner,
      dataRange: { fromTimestamp: 0, toTimestamp: 1730000000 },
      transactions: duplicateTxns,
      generatedAt: 1730000000,
    };

    assert.throws(
      () => {
        EvidenceSnapshotBuilder.buildSnapshot({
          fipPayload: payload,
          passportId: 101,
          holderWallet: '0x111111cf1046e68e36e1aa2e0e07105eddd1f08e',
        });
      },
      /Duplicate transaction ID detected in authenticated dataset: DUP_TXN_01/
    );
  });
});
