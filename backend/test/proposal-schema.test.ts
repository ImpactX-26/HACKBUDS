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
  hashToFieldElement,
  addressToFieldElement,
  providerIdToFieldElement,
  serializeCanonicalEvidence,
  computeCanonicalEvidenceDataHash,
  type CanonicalEvidencePreimage,
} from '../src/proposal/canonical-evidence-schema.js';

describe('Proposed Shared Evidence Schema & BN254 Encodings (Gate 1)', () => {
  it('hashToFieldElement should reduce 32-byte hex hashes modulo r', () => {
    const hex = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
    const field = hashToFieldElement(hex);
    assert.ok(field >= 0n);
    assert.ok(field < BN254_SCALAR_FIELD_MODULUS);

    // Deterministic output
    assert.strictEqual(field, hashToFieldElement(hex));
  });

  it('addressToFieldElement should convert 20-byte address to 160-bit big-endian integer', () => {
    const address = '0x0000000000000000000000000000000000000065';
    const field = addressToFieldElement(address);
    assert.strictEqual(field, 101n);

    const rameshWallet = '0x111111cf1046e68e36E1aA2E0E07105eDDD1f08E';
    const rameshField = addressToFieldElement(rameshWallet);
    assert.ok(rameshField > 0n);
    assert.ok(rameshField < BN254_SCALAR_FIELD_MODULUS);
  });

  it('providerIdToFieldElement should domain-separate provider IDs into BN254 field', () => {
    const fipId = 'MOCK_APNA_BANK_FIP_01';
    const field1 = providerIdToFieldElement(fipId);
    const field2 = providerIdToFieldElement(fipId);
    assert.strictEqual(field1, field2, 'Must be deterministic');
    assert.ok(field1 > 0n && field1 < BN254_SCALAR_FIELD_MODULUS);

    const diffField = providerIdToFieldElement('MOCK_OTHER_BANK_02');
    assert.notStrictEqual(field1, diffField, 'Distinct providers must yield distinct field elements');
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
});
