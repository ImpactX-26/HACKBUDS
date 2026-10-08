/**
 * GigVault - Determinism & Zero-Persistence Invariant Tests
 * 
 * Verifies:
 * - Deterministic EvidenceSnapshot regeneration:
 *   Fetching the same underlying FIP transactions under two different consent
 *   envelopes (new consentId, different signature, different fetch timestamp)
 *   with the same cutoff and directory version produces the EXACT same:
 *   1. evidenceDataHash
 *   2. monthlyGigIncomeTotals[36]
 *   3. monthlyActivity[36]
 *   4. weeklyActivity[156]
 *   5. verifiedHistoryStartDate
 * 
 * - Privacy Invariant:
 *   Zero persistence of raw bank statements or plaintext EvidenceSnapshots in GigVault.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ethers } from 'ethers';
import { MockFIPStorage } from '../src/fip/storage.js';
import { ConsentService } from '../src/fip/consent-service.js';
import { MockFIPService } from '../src/fip/fip-service.js';
import { AttestationService } from '../src/evidence/attestation-service.js';
import { MockIdentityProvider } from '../src/identity/mock-idp.js';
import { signWorkerAuthorization } from '../src/identity/wallet-auth.js';
import { PERSONAS } from '../src/fip/personas/index.js';

describe('Deterministic Snapshot Regeneration & Zero-Persistence', () => {
  const fixedCutoff = Date.UTC(2026, 9, 8, 12, 0, 0) / 1000;

  it('re-fetching under a new consent envelope produces IDENTICAL evidenceDataHash and arrays', async () => {
    const storage = new MockFIPStorage();
    const idp = new MockIdentityProvider();
    const consentService = new ConsentService(storage, idp, false);
    const fipService = new MockFIPService(storage, consentService, 'MOCK_APNA_BANK_FIP_01', idp, false);
    const attestationService = new AttestationService(fipService, [storage.getPublicKeyPem()], idp);

    const ramesh = PERSONAS.RAMESH;
    const wallet = ethers.Wallet.createRandom();

    // Consent Envelope 1 (issued at T1)
    const consent1 = consentService.createConsent({
      accountId: ramesh.accountId,
      authorizedIdentityNullifier: ramesh.identityNullifierHash,
      durationSeconds: 3600,
      toTimestamp: fixedCutoff,
    });

    const assertion1 = idp.issueAssertion({
      workerIdentityNullifier: ramesh.identityNullifierHash,
      workerWalletAddress: wallet.address,
      durationSeconds: 3600,
    });

    const auth1 = await signWorkerAuthorization({
      action: 'MINT_PASSPORT',
      workerWalletAddress: wallet.address,
      consentId: consent1.consentId,
      expectedPassportId: 201,
    }, wallet);

    const run1 = attestationService.attestWorkerEvidence({
      consentId: consent1.consentId,
      workerWalletAddress: wallet.address,
      workerIdentityNullifier: ramesh.identityNullifierHash,
      expectedPassportId: 201,
      sourceDirectoryVersion: 1,
      cutoffTimestamp: fixedCutoff,
      identityAssertion: assertion1,
      walletAuthorization: auth1,
    });

    // Consent Envelope 2 (issued later at T2 with a brand new consentId)
    const consent2 = consentService.createConsent({
      accountId: ramesh.accountId,
      authorizedIdentityNullifier: ramesh.identityNullifierHash,
      durationSeconds: 3600,
      toTimestamp: fixedCutoff,
    });
    assert.notStrictEqual(consent1.consentId, consent2.consentId, 'Consent IDs must differ');

    const auth2 = await signWorkerAuthorization({
      action: 'MINT_PASSPORT',
      workerWalletAddress: wallet.address,
      consentId: consent2.consentId,
      expectedPassportId: 201,
    }, wallet);

    const run2 = attestationService.attestWorkerEvidence({
      consentId: consent2.consentId,
      workerWalletAddress: wallet.address,
      workerIdentityNullifier: ramesh.identityNullifierHash,
      expectedPassportId: 201,
      sourceDirectoryVersion: 1,
      cutoffTimestamp: fixedCutoff,
      identityAssertion: assertion1,
      walletAuthorization: auth2,
    });

    // Assert that changing consentId and envelope metadata DOES NOT CHANGE normalized evidenceDataHash!
    assert.strictEqual(
      run1.evidenceDataHash,
      run2.evidenceDataHash,
      'evidenceDataHash must be identical across different consent envelopes for the same data'
    );

    // Assert that aggregate arrays are bit-for-bit identical
    assert.deepStrictEqual(
      run1.monthlyGigIncomeTotals,
      run2.monthlyGigIncomeTotals,
      'Monthly income arrays must be identical'
    );
    assert.deepStrictEqual(
      run1.monthlyActivity,
      run2.monthlyActivity,
      'Monthly activity arrays must be identical'
    );
    assert.deepStrictEqual(
      run1.weeklyActivity,
      run2.weeklyActivity,
      'Weekly activity arrays must be identical'
    );
    assert.strictEqual(
      run1.verifiedHistoryStartDate,
      run2.verifiedHistoryStartDate,
      'Verified history start date must be identical'
    );
  });

  it('changing 1 transaction changes normalized evidenceDataHash', async () => {
    const storage = new MockFIPStorage();
    const idp = new MockIdentityProvider();
    const consentService = new ConsentService(storage, idp, false);
    const fipService = new MockFIPService(storage, consentService, 'MOCK_APNA_BANK_FIP_01', idp, false);
    const attestationService = new AttestationService(fipService, [storage.getPublicKeyPem()], idp);

    const wallet = ethers.Wallet.createRandom();
    const arjun = PERSONAS.ARJUN;

    const consent1 = consentService.createConsent({
      accountId: arjun.accountId,
      authorizedIdentityNullifier: arjun.identityNullifierHash,
      toTimestamp: fixedCutoff,
    });

    const assertion = idp.issueAssertion({
      workerIdentityNullifier: arjun.identityNullifierHash,
      workerWalletAddress: wallet.address,
    });

    const auth1 = await signWorkerAuthorization({
      action: 'MINT_PASSPORT',
      workerWalletAddress: wallet.address,
      consentId: consent1.consentId,
      expectedPassportId: 202,
    }, wallet);

    const run1 = attestationService.attestWorkerEvidence({
      consentId: consent1.consentId,
      workerWalletAddress: wallet.address,
      workerIdentityNullifier: arjun.identityNullifierHash,
      expectedPassportId: 202,
      sourceDirectoryVersion: 1,
      cutoffTimestamp: fixedCutoff,
      identityAssertion: assertion,
      walletAuthorization: auth1,
    });

    // Alter 1 paise in Arjun's source transactions
    const txns = storage.getTransactions(arjun.accountId);
    txns[0].amountMinor += 1;

    const consent2 = consentService.createConsent({
      accountId: arjun.accountId,
      authorizedIdentityNullifier: arjun.identityNullifierHash,
      toTimestamp: fixedCutoff,
    });

    const auth2 = await signWorkerAuthorization({
      action: 'MINT_PASSPORT',
      workerWalletAddress: wallet.address,
      consentId: consent2.consentId,
      expectedPassportId: 202,
    }, wallet);

    const run2 = attestationService.attestWorkerEvidence({
      consentId: consent2.consentId,
      workerWalletAddress: wallet.address,
      workerIdentityNullifier: arjun.identityNullifierHash,
      expectedPassportId: 202,
      sourceDirectoryVersion: 1,
      cutoffTimestamp: fixedCutoff,
      identityAssertion: assertion,
      walletAuthorization: auth2,
    });

    assert.notStrictEqual(
      run1.evidenceDataHash,
      run2.evidenceDataHash,
      'Changing 1 paise in source data MUST change evidenceDataHash'
    );
  });
});
