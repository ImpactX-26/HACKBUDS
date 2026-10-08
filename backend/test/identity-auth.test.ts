/**
 * GigVault - Worker Identity & Wallet Authentication Tests
 * 
 * Verifies:
 * - Mock Identity Provider assertion issuance and signature verification
 * - Rejection of tampered or expired identity assertions
 * - Worker wallet authorization signing and EVM personal_sign verification
 * - Rejection of forged wallet signatures or signer mismatches
 * - Tripartite identity gate in AttestationService:
 *   (Wallet Control <-> Verified ID Assertion <-> Bank Account Ownership)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ethers } from 'ethers';
import { MockIdentityProvider } from '../src/identity/mock-idp.js';
import { signWorkerAuthorization, verifyWorkerAuthorization } from '../src/identity/wallet-auth.js';
import { MockFIPStorage } from '../src/fip/storage.js';
import { ConsentService } from '../src/fip/consent-service.js';
import { MockFIPService } from '../src/fip/fip-service.js';
import { AttestationService } from '../src/evidence/attestation-service.js';
import { PERSONAS } from '../src/fip/personas/index.js';

describe('Worker Identity & Wallet Authentication Boundary', () => {
  const idp = new MockIdentityProvider();
  const rameshWallet = ethers.Wallet.createRandom();
  const arjunWallet = ethers.Wallet.createRandom();

  it('should issue valid identity assertion and verify cryptographically', () => {
    const assertion = idp.issueAssertion({
      workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
      workerWalletAddress: rameshWallet.address,
      durationSeconds: 3600,
    });

    assert.strictEqual(assertion.schemaVersion, 'GIGVAULT_IDENTITY_ASSERTION_V1');
    assert.strictEqual(assertion.providerId, 'MOCK_IDP_UIDAI_SIMULATED');
    assert.strictEqual(assertion.workerWalletAddress, rameshWallet.address.toLowerCase());

    const result = idp.verifyAssertion(assertion);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.workerIdentityNullifier, PERSONAS.RAMESH.identityNullifierHash.toLowerCase());
  });

  it('MUST REJECT: tampered identity assertion fails cryptographic verification', () => {
    const assertion = idp.issueAssertion({
      workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
      workerWalletAddress: rameshWallet.address,
    });

    // Tamper nullifier to Arjun's nullifier
    const tampered = {
      ...assertion,
      workerIdentityNullifier: PERSONAS.ARJUN.identityNullifierHash,
    };

    assert.throws(
      () => idp.verifyAssertion(tampered),
      /Identity assertion signature invalid/,
      'Tampered assertion must fail verification'
    );
  });

  it('MUST REJECT: expired identity assertion fails verification', () => {
    const assertion = idp.issueAssertion({
      workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
      workerWalletAddress: rameshWallet.address,
      durationSeconds: 10,
    });

    const futureTime = Math.floor(Date.now() / 1000) + 100;
    assert.throws(
      () => idp.verifyAssertion(assertion, futureTime),
      /Identity assertion expired/,
      'Expired assertion must fail verification'
    );
  });

  it('should sign and verify worker wallet authorization message via personal_sign', async () => {
    const auth = await signWorkerAuthorization(
      {
        action: 'MINT_PASSPORT',
        workerWalletAddress: rameshWallet.address,
        consentId: 'CONSENT_TEST_101',
        expectedPassportId: 101,
      },
      rameshWallet
    );

    assert.strictEqual(auth.action, 'MINT_PASSPORT');
    assert.ok(auth.signature.startsWith('0x'));

    const isValid = verifyWorkerAuthorization(auth);
    assert.strictEqual(isValid, true);
  });

  it('MUST REJECT: wallet authorization signed by different wallet fails verification', async () => {
    // Signed by Arjun's wallet, but claims to be Ramesh's address
    const auth = await signWorkerAuthorization(
      {
        action: 'MINT_PASSPORT',
        workerWalletAddress: rameshWallet.address, // Claimed
        consentId: 'CONSENT_TEST_101',
        expectedPassportId: 101,
      },
      arjunWallet // Actual signer
    );

    assert.throws(
      () => verifyWorkerAuthorization(auth),
      /Worker authorization signer mismatch/,
      'Must reject when signer does not match claimed address'
    );
  });

  it('MUST REJECT: stale wallet authorization timestamp fails freshness check', async () => {
    const oldTs = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
    const auth = await signWorkerAuthorization(
      {
        action: 'MINT_PASSPORT',
        workerWalletAddress: rameshWallet.address,
        consentId: 'CONSENT_TEST_101',
        expectedPassportId: 101,
        timestamp: oldTs,
      },
      rameshWallet
    );

    assert.throws(
      () => verifyWorkerAuthorization(auth),
      /Worker wallet authorization expired/,
      'Must reject stale authorization request'
    );
  });

  it('Tripartite Gate: executes attestation when Wallet, Identity, and Bank Owner strictly link', async () => {
    const storage = new MockFIPStorage();
    const consentService = new ConsentService(storage);
    const fipService = new MockFIPService(storage, consentService);
    const attestationService = new AttestationService(fipService, [storage.getPublicKeyPem()], idp);

    // 1. Bank FIP consent for Ramesh's account
    const consent = consentService.createConsent({
      accountId: PERSONAS.RAMESH.accountId,
    });

    // 2. Identity Provider assertion binding Ramesh nullifier to rameshWallet
    const identityAssertion = idp.issueAssertion({
      workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
      workerWalletAddress: rameshWallet.address,
    });

    // 3. Wallet authorization signed by rameshWallet
    const walletAuthorization = await signWorkerAuthorization(
      {
        action: 'MINT_PASSPORT',
        workerWalletAddress: rameshWallet.address,
        consentId: consent.consentId,
        expectedPassportId: 101,
      },
      rameshWallet
    );

    // Attestation succeeds with full tripartite verification
    const res = attestationService.attestWorkerEvidence({
      consentId: consent.consentId,
      workerWalletAddress: rameshWallet.address,
      workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
      expectedPassportId: 101,
      identityAssertion,
      walletAuthorization,
    });

    assert.strictEqual(res.verified, true);
    assert.strictEqual(res.holderBinding, rameshWallet.address.toLowerCase());
    assert.strictEqual(res.identityNullifierHash, PERSONAS.RAMESH.identityNullifierHash);
  });

  it('MUST REJECT: attacker tries to use Worker A identity assertion with Attacker wallet', async () => {
    const storage = new MockFIPStorage();
    const consentService = new ConsentService(storage);
    const fipService = new MockFIPService(storage, consentService);
    const attestationService = new AttestationService(fipService, [storage.getPublicKeyPem()], idp);

    const consent = consentService.createConsent({
      accountId: PERSONAS.RAMESH.accountId,
    });

    // Ramesh's identity assertion (bound to rameshWallet)
    const identityAssertion = idp.issueAssertion({
      workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
      workerWalletAddress: rameshWallet.address,
    });

    // Attacker tries to pass Ramesh's assertion with Arjun's wallet address
    assert.throws(
      () =>
        attestationService.attestWorkerEvidence({
          consentId: consent.consentId,
          workerWalletAddress: arjunWallet.address, // Attacker's wallet!
          workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
          expectedPassportId: 101,
          identityAssertion,
        }),
      /Identity assertion wallet mismatch/,
      'Must reject when assertion wallet does not match request wallet'
    );
  });

  it('MUST REJECT: attacker with valid identity assertion tries to use another worker bank account', async () => {
    const storage = new MockFIPStorage();
    const consentService = new ConsentService(storage);
    const fipService = new MockFIPService(storage, consentService);
    const attestationService = new AttestationService(fipService, [storage.getPublicKeyPem()], idp);

    // Consent belongs to Ramesh's bank account
    const consent = consentService.createConsent({
      accountId: PERSONAS.RAMESH.accountId,
    });

    // But Arjun presents his own valid identity assertion bound to his wallet
    const arjunIdentityAssertion = idp.issueAssertion({
      workerIdentityNullifier: PERSONAS.ARJUN.identityNullifierHash,
      workerWalletAddress: arjunWallet.address,
    });

    const arjunWalletAuth = await signWorkerAuthorization(
      {
        action: 'MINT_PASSPORT',
        workerWalletAddress: arjunWallet.address,
        consentId: consent.consentId,
        expectedPassportId: 101,
      },
      arjunWallet
    );

    // Attempting attestation should fail at the bank account owner binding gate
    assert.throws(
      () =>
        attestationService.attestWorkerEvidence({
          consentId: consent.consentId,
          workerWalletAddress: arjunWallet.address,
          workerIdentityNullifier: PERSONAS.ARJUN.identityNullifierHash,
          expectedPassportId: 101,
          identityAssertion: arjunIdentityAssertion,
          walletAuthorization: arjunWalletAuth,
        }),
      /Account owner binding mismatch: Bank account owner identity/,
      'Must reject when verified identity does not match bank account owner'
    );
  });
});
