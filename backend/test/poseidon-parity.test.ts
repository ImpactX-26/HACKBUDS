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

    // Exact expected decimal field values from Backend B review (docs/review/BACKEND_B_GATE1_INTEROPERABILITY_REVIEW.md)
    const expectedIncomeRoot = '20119275159189889380691640169503521072267433455885550380794051959666890461667';
    const expectedWeeklyRoot = '21852563639151117767628491974987827408917650138870771480290417841191760527724';
    const expectedMonthlyRoot = '13559395075388244745760140214469017241871546221208979575604441749602464732002';
    const expectedCommitment = '17057776044314545379576656229478007760108694673197752276092855675165560572398';

    assert.strictEqual(res.incomeRoot.toString(), expectedIncomeRoot, 'incomeRoot must match Backend B output');
    assert.strictEqual(res.weeklyRoot.toString(), expectedWeeklyRoot, 'weeklyRoot must match Backend B output');
    assert.strictEqual(res.monthlyRoot.toString(), expectedMonthlyRoot, 'monthlyRoot must match Backend B output');
    assert.strictEqual(res.evidenceCommitment.toString(), expectedCommitment, 'evidenceCommitment must match Backend B output');
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
});
