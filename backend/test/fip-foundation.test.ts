/**
 * GigVault - Mock FIP Foundation Automated Tests
 * 
 * Verifies:
 * - Mock FIP cryptographic signing and tamper rejection
 * - Consent lifecycle (creation, authorization, expiry, revocation, scope)
 * - Independent bank-side account-owner identity binding
 * - Rejection of mismatched identity nullifiers
 * - Seven realistic synthetic persona transaction sets
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { generateFipKeyPair, hashPayload, signPayloadHash } from '../src/fip/crypto.js';
import { MockFIPStorage } from '../src/fip/storage.js';
import { ConsentService } from '../src/fip/consent-service.js';
import { MockFIPService } from '../src/fip/fip-service.js';
import { FIPVerifier } from '../src/evidence/fip-verifier.js';
import { PERSONAS } from '../src/fip/personas/index.js';
import { MockIdentityProvider } from '../src/identity/mock-idp.js';
import { ethers } from 'ethers';

describe('Mock FIP Foundation & Cryptographic Envelopes', () => {
  it('should generate valid secp256k1 key pairs and deterministic hashes', () => {
    const keyPair = generateFipKeyPair();
    assert.ok(keyPair.privateKeyPem.includes('BEGIN PRIVATE KEY'));
    assert.ok(keyPair.publicKeyPem.includes('BEGIN PUBLIC KEY'));

    const samplePayload = {
      schemaVersion: 'GIGVAULT_FIP_MOCK_V1' as const,
      fipId: 'TEST_FIP',
      consentId: 'C1',
      accountId: 'A1',
      accountOwnerBinding: {
        accountId: 'A1',
        ownerName: 'Test',
        identityNullifierHash: '0x123',
        verifiedAt: 1000,
      },
      dataRange: { fromTimestamp: 0, toTimestamp: 2000 },
      transactions: [],
      generatedAt: 1500,
    };

    const hash1 = hashPayload(samplePayload);
    const hash2 = hashPayload(samplePayload);
    assert.strictEqual(hash1, hash2, 'Hash must be bit-exact and deterministic');

    const sig = signPayloadHash(hash1, keyPair.privateKeyPem);
    assert.ok(sig.length > 50, 'Signature must be a non-empty hex string');
  });

  it('should issue signed envelopes and verify successfully for matching worker', () => {
    const storage = new MockFIPStorage();
    const consentService = new ConsentService(storage, undefined, false);
    const fipService = new MockFIPService(storage, consentService, 'MOCK_APNA_BANK_FIP_01', undefined, false);
    const verifier = new FIPVerifier([storage.getPublicKeyPem()]);

    // Create consent for Ramesh
    const consent = consentService.createConsent({
      accountId: PERSONAS.RAMESH.accountId,
      durationSeconds: 3600,
    });

    const envelope = fipService.fetchSignedDataByConsent(consent.consentId);
    assert.strictEqual(envelope.payload.schemaVersion, 'GIGVAULT_FIP_MOCK_V1');
    assert.strictEqual(envelope.payload.accountId, PERSONAS.RAMESH.accountId);
    assert.ok(envelope.payload.transactions.length > 50, 'Ramesh should have many transactions');

    // Verify envelope with Ramesh's identity nullifier
    const result = verifier.verifyEnvelope(envelope, PERSONAS.RAMESH.identityNullifierHash);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.payload.accountOwnerBinding.ownerName, 'Ramesh Kumar');
  });

  it('MUST FAIL: tampering any field in signed transactions invalidates signature (Arjun scenario)', () => {
    const storage = new MockFIPStorage();
    const consentService = new ConsentService(storage, undefined, false);
    const fipService = new MockFIPService(storage, consentService, 'MOCK_APNA_BANK_FIP_01', undefined, false);
    const verifier = new FIPVerifier([storage.getPublicKeyPem()]);

    const consent = consentService.createConsent({
      accountId: PERSONAS.ARJUN.accountId,
      durationSeconds: 3600,
    });

    const originalEnvelope = fipService.fetchSignedDataByConsent(consent.consentId);

    // Tamper 1: Modify 1 paise in transaction amount (e.g. Rs 5,120.00 -> Rs 5,120.01)
    const tamperedAmountEnvelope = JSON.parse(JSON.stringify(originalEnvelope));
    tamperedAmountEnvelope.payload.transactions[0].amountMinor += 1;

    assert.throws(
      () => verifier.verifyEnvelope(tamperedAmountEnvelope, PERSONAS.ARJUN.identityNullifierHash),
      /FIP signature invalid: payload hash mismatch/,
      'Must reject envelope when transaction amount is altered'
    );

    // Tamper 2: Modify remitter VPA name
    const tamperedRemitterEnvelope = JSON.parse(JSON.stringify(originalEnvelope));
    tamperedRemitterEnvelope.payload.transactions[0].remitter.name = 'EVIL PAYER';

    assert.throws(
      () => verifier.verifyEnvelope(tamperedRemitterEnvelope, PERSONAS.ARJUN.identityNullifierHash),
      /FIP signature invalid: payload hash mismatch/,
      'Must reject envelope when remitter is altered'
    );

    // Tamper 3: Recompute hash but keep old signature (forged content)
    const tamperedPayloadRehashed = JSON.parse(JSON.stringify(originalEnvelope));
    tamperedPayloadRehashed.payload.transactions[0].amountMinor += 10000;
    tamperedPayloadRehashed.payloadHash = hashPayload(tamperedPayloadRehashed.payload);

    assert.throws(
      () => verifier.verifyEnvelope(tamperedPayloadRehashed, PERSONAS.ARJUN.identityNullifierHash),
      /FIP signature invalid: cryptographic signature verification failed/,
      'Must reject envelope when payload is altered even if payloadHash is updated'
    );
  });

  it('MUST FAIL: account-owner identity binding mismatch rejects before evidence processing', () => {
    const storage = new MockFIPStorage();
    const consentService = new ConsentService(storage, undefined, false);
    const fipService = new MockFIPService(storage, consentService, 'MOCK_APNA_BANK_FIP_01', undefined, false);
    const verifier = new FIPVerifier([storage.getPublicKeyPem()]);

    // Arjun creates consent for his account
    const consent = consentService.createConsent({
      accountId: PERSONAS.ARJUN.accountId,
    });
    const arjunEnvelope = fipService.fetchSignedDataByConsent(consent.consentId);

    // Attacker tries to use Arjun's valid bank statement to mint/refresh Ramesh's passport
    assert.throws(
      () => verifier.verifyEnvelope(arjunEnvelope, PERSONAS.RAMESH.identityNullifierHash),
      /Account owner binding mismatch: Bank account owner identity .* does not match worker identity/,
      'Must reject when FIP account owner does not match the worker identity nullifier'
    );
  });

  it('MUST FAIL: expired or revoked consents reject at fetch time', () => {
    const storage = new MockFIPStorage();
    const consentService = new ConsentService(storage, undefined, false);
    const fipService = new MockFIPService(storage, consentService, 'MOCK_APNA_BANK_FIP_01', undefined, false);

    // 1. Expired consent
    const consent1 = consentService.createConsent({
      accountId: PERSONAS.RAMESH.accountId,
      durationSeconds: -1, // Expired immediately
    });

    assert.throws(
      () => fipService.fetchSignedDataByConsent(consent1.consentId),
      /FIP consent expired/,
      'Must reject expired consent'
    );

    // 2. Revoked consent
    const consent2 = consentService.createConsent({
      accountId: PERSONAS.RAMESH.accountId,
      durationSeconds: 3600,
    });
    consentService.revokeConsent(consent2.consentId);

    assert.throws(
      () => fipService.fetchSignedDataByConsent(consent2.consentId),
      /FIP consent revoked/,
      'Must reject revoked consent'
    );
  });

  it('should enforce date range scoping on consented transactions', () => {
    const storage = new MockFIPStorage();
    const consentService = new ConsentService(storage, undefined, false);
    const fipService = new MockFIPService(storage, consentService, 'MOCK_APNA_BANK_FIP_01', undefined, false);

    const fromTs = Date.UTC(2025, 0, 1) / 1000;
    const toTs = Date.UTC(2025, 5, 1) / 1000;

    const consent = consentService.createConsent({
      accountId: PERSONAS.RAMESH.accountId,
      fromTimestamp: fromTs,
      toTimestamp: toTs,
    });

    const envelope = fipService.fetchSignedDataByConsent(consent.consentId);
    assert.ok(envelope.payload.transactions.length > 0);

    for (const txn of envelope.payload.transactions) {
      assert.ok(txn.timestamp >= fromTs, 'Txn timestamp must be >= fromTimestamp');
      assert.ok(txn.timestamp <= toTs, 'Txn timestamp must be <= toTimestamp');
    }
  });

  it('MUST FAIL: direct consent and retrieval methods reject missing or partial authentication by default', async () => {
    const storage = new MockFIPStorage();
    // Default constructor has strictAuthentication = true
    const consentService = new ConsentService(storage);
    const fipService = new MockFIPService(storage, consentService);

    // 1. Missing authentication in createConsent
    assert.throws(
      () => {
        consentService.createConsent({
          accountId: PERSONAS.RAMESH.accountId,
        });
      },
      /AuthenticationRequired: consent creation requires both verified identityAssertion and signed walletAuthorization/
    );

    // 2. Direct fetchSignedDataByConsent rejects missing auth
    // Create a consent using explicit test-only bypass
    const consent = consentService.createConsentInternalUnauthenticated_TEST_ONLY({
      accountId: PERSONAS.RAMESH.accountId,
    });

    assert.throws(
      () => {
        fipService.fetchSignedDataByConsent(consent.consentId);
      },
      /AuthenticationRequired: direct FIP retrieval requires both identityAssertion and walletAuthorization/
    );
  });

  it('should verify all seven personas have realistic seeded transactions with no bank gig flags', () => {
    const storage = new MockFIPStorage();

    for (const persona of Object.values(PERSONAS)) {
      const binding = storage.getAccountBinding(persona.accountId);
      assert.ok(binding, `Binding must exist for ${persona.id}`);
      assert.strictEqual(binding?.identityNullifierHash, persona.identityNullifierHash);

      const txns = storage.getTransactions(persona.accountId);
      assert.ok(txns.length > 0, `Transactions must exist for ${persona.id}`);

      // Invariant: FIP never provides isGigIncome, payerCategory, or scores
      for (const txn of txns) {
        assert.strictEqual(typeof txn.amountMinor, 'number');
        assert.ok(Number.isInteger(txn.amountMinor));
        assert.ok(txn.amountMinor >= 0);
        assert.strictEqual(txn.currency, 'INR');
        assert.ok(['CREDIT', 'DEBIT'].includes(txn.direction));
        assert.ok(['UPI', 'IMPS', 'NEFT', 'RTGS'].includes(txn.rail));

        // Critical architectural invariant checks
        assert.strictEqual((txn as any).isGigIncome, undefined, 'FIP must never supply isGigIncome');
        assert.strictEqual((txn as any).payerCategory, undefined, 'FIP must never supply payerCategory');
        assert.strictEqual((txn as any).workerScore, undefined, 'FIP must never supply worker scores');
      }
    }
  });
});
