/**
 * GigVault - Proposed Shared Evidence & Wire Schema Tests (Gate 1 Validation)
 * 
 * Verifies mathematical bounds and determinism of the proposed wire schema:
 * - BN254 scalar field range compliance (0 <= x < r)
 * - Big-endian unsigned 160-bit EVM address mapping
 * - Domain-separated provider ID mapping
 * - Deterministic Canonical Preimage serialization
 * - Validation of the Ramesh Kumar reference fixture
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BN254_SCALAR_FIELD_MODULUS,
  BN254_FR_SCALAR,
  BN254_FQ_BASE,
  hashToFieldElement,
  addressToFieldElement,
  providerIdToFieldElement,
  serializeCanonicalEvidence,
  computeCanonicalEvidenceDataHash,
  type CanonicalEvidencePreimage,
} from '../../shared/proposal/canonical-evidence-schema.js';
import { hashToLegacyV01FieldElement } from '../../shared/proposal/field-mappings.js';

describe('Proposed Shared Evidence Schema & BN254 Encodings (Gate 1)', () => {
  it('hashToFieldElement should reduce 32-byte hex hashes modulo r and reject malformed digests', () => {
    const hex = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
    const field = hashToFieldElement(hex);
    assert.ok(field >= 0n);
    assert.ok(field < BN254_SCALAR_FIELD_MODULUS);

    // Deterministic output
    assert.strictEqual(field, hashToFieldElement(hex));

    // MUST REJECT undersized / malformed digests
    assert.throws(() => hashToFieldElement('01'), /Expected exact 32-byte SHA-256 hex digest/);
    assert.throws(() => hashToFieldElement('not-a-hex-digest'), /Expected exact 32-byte SHA-256 hex digest/);
  });

  it('addressToFieldElement should convert 20-byte address to 160-bit big-endian integer', () => {
    const address = '0x0000000000000000000000000000000000000065';
    const field = addressToFieldElement(address);
    assert.strictEqual(field, 101n);

    const rameshWallet = '0x111111cf1046e68e36E1aA2E0E07105eDDD1f08E';
    const rameshField = addressToFieldElement(rameshWallet);
    assert.ok(rameshField > 0n);
    assert.ok(rameshField < BN254_SCALAR_FIELD_MODULUS);

    // MUST REJECT invalid EVM address formats
    assert.throws(() => addressToFieldElement('0x123'), /Expected 0x-prefixed 20-byte EVM address/);
    assert.throws(() => addressToFieldElement('not-an-address'), /Expected 0x-prefixed 20-byte EVM address/);
  });

  it('providerIdToFieldElement should domain-separate provider IDs into BN254 field and reject noncanonical grammar', () => {
    const fipId = 'MOCK_APNA_BANK_FIP_01';
    const field1 = providerIdToFieldElement(fipId);
    const field2 = providerIdToFieldElement(fipId);
    assert.strictEqual(field1, field2, 'Must be deterministic');
    assert.ok(field1 > 0n && field1 < BN254_SCALAR_FIELD_MODULUS);

    const diffField = providerIdToFieldElement('MOCK_OTHER_BANK_02');
    assert.notStrictEqual(field1, diffField, 'Distinct providers must yield distinct field elements');

    // MUST REJECT leading/trailing spaces or noncanonical chars
    assert.throws(() => providerIdToFieldElement(' MOCK_APNA_BANK_FIP_01'), /Expected canonical ASCII provider ID/);
    assert.throws(() => providerIdToFieldElement('MOCK_BANK@01'), /Expected canonical ASCII provider ID/);
  });

  it('serializeCanonicalEvidence should produce bit-exact deterministic byte output', () => {
    const samplePreimage: CanonicalEvidencePreimage = {
      version: 'GIGVAULT_CANONICAL_DATA_V1',
      accountOwner: {
        accountId: 'ACC_01',
        identityNullifierHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
      },
      timeBounds: {
        fromTimestamp: 1000,
        toTimestamp: 2000,
      },
      transactions: [
        {
          txnId: 'T1',
          timestamp: 1500,
          amountMinor: 500000,
          direction: 'CREDIT',
          rail: 'UPI',
          remitterVpa: 'bundltechnologies@icici',
          remitterAccount: '000405019821',
          reference: 'UTR1',
        },
      ],
    };

    const hashA = computeCanonicalEvidenceDataHash(samplePreimage);
    const hashB = computeCanonicalEvidenceDataHash(samplePreimage);
    assert.strictEqual(hashA.sha256Hex, hashB.sha256Hex);
    assert.strictEqual(hashA.fieldElementDecimal, hashB.fieldElementDecimal);
  });

  it('MUST REJECT: nonadjacent duplicate transaction IDs globally before aggregation', () => {
    const preimage: CanonicalEvidencePreimage = {
      version: 'GIGVAULT_CANONICAL_DATA_V1',
      accountOwner: { accountId: 'ACC_01', identityNullifierHash: '0x1111' },
      timeBounds: { fromTimestamp: 100, toTimestamp: 300 },
      transactions: [
        { txnId: 'DUP', timestamp: 100, amountMinor: 1000, direction: 'CREDIT', rail: 'UPI' },
        { txnId: 'MIDDLE', timestamp: 200, amountMinor: 2000, direction: 'CREDIT', rail: 'UPI' },
        { txnId: ' DUP ', timestamp: 300, amountMinor: 3000, direction: 'CREDIT', rail: 'UPI' },
      ],
    };

    assert.throws(
      () => serializeCanonicalEvidence(preimage),
      /Duplicate transaction ID detected/
    );
  });

  it('MUST REJECT: non-ASCII transaction IDs in canonical serializer', () => {
    const preimage: CanonicalEvidencePreimage = {
      version: 'GIGVAULT_CANONICAL_DATA_V1',
      accountOwner: { accountId: 'ACC_01', identityNullifierHash: '0x1111' },
      timeBounds: { fromTimestamp: 100, toTimestamp: 200 },
      transactions: [
        { txnId: '\uE000', timestamp: 100, amountMinor: 1000, direction: 'CREDIT', rail: 'UPI' },
      ],
    };

    assert.throws(
      () => serializeCanonicalEvidence(preimage),
      /transaction txnId must be strict ASCII/
    );
  });

  it('typed snapshot fixture must strictly satisfy all BN254 scalar range checks', () => {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const fixturePath = path.resolve(__dirname, '../../shared/proposal/typed-snapshot-fixture.json');
    assert.ok(fs.existsSync(fixturePath), 'Fixture file must exist');

    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

    // Check scalar slots
    const r = BigInt(fixture.modulus);
    assert.strictEqual(r, BN254_SCALAR_FIELD_MODULUS);

    const checkScalar = (valStr: string, name: string) => {
      const val = BigInt(valStr);
      assert.ok(val >= 0n, `${name} must be non-negative`);
      assert.ok(val < r, `${name} must be < r (BN254 modulus)`);
    };

    checkScalar(fixture.passportId, 'passportId');
    checkScalar(fixture.holderBindingDecimal, 'holderBindingDecimal');
    checkScalar(fixture.evidenceProviderFieldDecimal, 'evidenceProviderFieldDecimal');
    checkScalar(fixture.evidenceDataHashFieldDecimal, 'evidenceDataHashFieldDecimal');
    checkScalar(fixture.verifiedHistoryStartDateDays, 'verifiedHistoryStartDateDays');
    checkScalar(fixture.evidenceUpdatedAtSeconds, 'evidenceUpdatedAtSeconds');
    checkScalar(fixture.sourceDirectoryVersion, 'sourceDirectoryVersion');

    // Array checks
    assert.strictEqual(fixture.monthlyGigIncomeTotalsPaise.length, 36);
    for (let i = 0; i < 36; i++) {
      checkScalar(fixture.monthlyGigIncomeTotalsPaise[i], `monthlyGigIncomeTotals[${i}]`);
    }

    assert.strictEqual(fixture.monthlyActivityFlags.length, 36);
    for (let i = 0; i < 36; i++) {
      const flag = fixture.monthlyActivityFlags[i];
      assert.ok(flag === '0' || flag === '1', `monthlyActivity[${i}] must be 0 or 1`);
    }

    assert.strictEqual(fixture.weeklyActivityFlags.length, 156);
    for (let i = 0; i < 156; i++) {
      const flag = fixture.weeklyActivityFlags[i];
      assert.ok(flag === '0' || flag === '1', `weeklyActivity[${i}] must be 0 or 1`);
    }
  });

  it('BN254 scalar field must strictly equal Fr order, keeping EC base field Fq separate', () => {
    // Fr (scalar field order): 21888242871839275222246405745257275088548364400416034343698204186575808495617n
    // Fq (base field order):   21888242871839275222246405745257275088696311157297823662689037894645226208583n
    assert.strictEqual(BN254_SCALAR_FIELD_MODULUS, BN254_FR_SCALAR);
    assert.notStrictEqual(BN254_SCALAR_FIELD_MODULUS, BN254_FQ_BASE);
    assert.ok(BN254_FR_SCALAR < BN254_FQ_BASE);

    // Test a synthetic 32-byte digest whose integer value lies strictly in [r, q)
    const valInBetween = BN254_FR_SCALAR + 777n;
    assert.ok(valInBetween >= BN254_FR_SCALAR, 'valInBetween >= Fr');
    assert.ok(valInBetween < BN254_FQ_BASE, 'valInBetween < Fq');

    const hexInBetween = valInBetween.toString(16).padStart(64, '0');

    // hashToFieldElement must reduce modulo Fr, yielding 777n
    const reducedModFr = hashToFieldElement(hexInBetween);
    assert.strictEqual(reducedModFr, 777n);
    assert.ok(reducedModFr < BN254_FR_SCALAR);

    // Legacy reduction reduced modulo Fq, yielding valInBetween which was >= Fr
    const legacyModFq = hashToLegacyV01FieldElement(hexInBetween);
    assert.strictEqual(legacyModFq, valInBetween);
    assert.ok(legacyModFq >= BN254_FR_SCALAR, 'Legacy v0.1 yielded value outside scalar field Fr');
  });
});
