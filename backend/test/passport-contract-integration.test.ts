/**
 * GigVault - GigPassport Contract Integration & Lifecycle Tests
 * 
 * Tests the interaction between the Attestation Service and GigPassport.sol:
 * 1. Dedicated ATTESTER_ROLE authorization boundary (worker or admin cannot mint).
 * 2. Sequential expected-passport-ID enforcement and contention retry.
 * 3. Prevention of duplicate ACTIVE passports for the same worker identity.
 * 4. Evidence refresh lifecycle with commitment change and timestamp non-regression.
 * 5. Terminal revocation by ADMIN_ROLE.
 * 6. Passport recovery / reissue requiring:
 *    - Same stable verified identity nullifier
 *    - Fresh authenticated bank evidence
 *    - On-chain reissue authorization by ADMIN_ROLE
 *    - Consumption of reissue authorization upon replacement mint.
 * 7. Contention handling: rejected unauthorized retry vs authorized re-signing retry.
 * 8. Negative security checks: attacker trying to mint without valid tripartite link.
 * 
 * Note: Uses MockGigPassportContract as an in-memory state-machine test adapter.
 * Not real on-chain Polygon Amoy execution.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ethers } from 'ethers';
import { MockFIPStorage } from '../src/fip/storage.js';
import { ConsentService } from '../src/fip/consent-service.js';
import { MockFIPService } from '../src/fip/fip-service.js';
import { AttestationService } from '../src/evidence/attestation-service.js';
import { MockGigPassportContract } from '../src/evidence/passport-client.js';
import { MockIdentityProvider } from '../src/identity/mock-idp.js';
import { signWorkerAuthorization } from '../src/identity/wallet-auth.js';
import { PERSONAS } from '../src/fip/personas/index.js';

describe('GigPassport Contract Integration & State Machine (Mock Adapter)', () => {
  const adminWallet = ethers.Wallet.createRandom();
  const attesterWallet = ethers.Wallet.createRandom();
  const workerWallet = ethers.Wallet.createRandom();
  const attackerWallet = ethers.Wallet.createRandom();

  const fixedCutoff = Date.UTC(2026, 9, 8, 12, 0, 0) / 1000;

  function createTestSetup() {
    const idp = new MockIdentityProvider();
    const storage = new MockFIPStorage();
    const consentService = new ConsentService(storage);
    const fipService = new MockFIPService(storage, consentService);
    const attestationService = new AttestationService(
      fipService,
      [storage.getPublicKeyPem()],
      idp
    );
    const passportContract = new MockGigPassportContract(
      adminWallet.address,
      attesterWallet.address
    );

    return { storage, consentService, fipService, attestationService, passportContract, idp };
  }

  it('MUST ENFORCE: only dedicated ATTESTER_ROLE can mint passports', async () => {
    const { consentService, attestationService, passportContract, idp } = createTestSetup();
    const ramesh = PERSONAS.RAMESH;

    const consent = consentService.createConsent({
      accountId: ramesh.accountId,
      authorizedIdentityNullifier: ramesh.identityNullifierHash,
      durationSeconds: 3600,
      toTimestamp: fixedCutoff,
    });

    const assertion = idp.issueAssertion({
      workerIdentityNullifier: ramesh.identityNullifierHash,
      workerWalletAddress: workerWallet.address,
      durationSeconds: 3600,
    });

    const auth = await signWorkerAuthorization({
      action: 'MINT_PASSPORT',
      workerWalletAddress: workerWallet.address,
      consentId: consent.consentId,
      expectedPassportId: 1,
    }, workerWallet);

    // Derive snapshot via attestation service
    const attestation = attestationService.attestWorkerEvidence({
      consentId: consent.consentId,
      workerWalletAddress: workerWallet.address,
      workerIdentityNullifier: ramesh.identityNullifierHash,
      expectedPassportId: 1,
      cutoffTimestamp: fixedCutoff,
      identityAssertion: assertion,
      walletAuthorization: auth,
    });

    const dummyEvidence = {
      commitment: '12345678901234567890',
      updatedAt: attestation.evidenceUpdatedAt,
      schemaVersion: 1,
      providerRef: '0x01',
      sourceDirectoryVersion: 1,
    };

    // 1. Worker wallet directly calls mint -> MUST REJECT
    await assert.rejects(
      async () => {
        await passportContract.mint(1, workerWallet.address, ramesh.identityNullifierHash, dummyEvidence, workerWallet.address);
      },
      /AccessControl: caller is not authorized with ATTESTER_ROLE/
    );

    // 2. Admin wallet directly calls mint -> MUST REJECT
    await assert.rejects(
      async () => {
        await passportContract.mint(1, workerWallet.address, ramesh.identityNullifierHash, dummyEvidence, adminWallet.address);
      },
      /AccessControl: caller is not authorized with ATTESTER_ROLE/
    );

    // 3. Dedicated Attester wallet calls mint -> SUCCEEDS
    const passportId = await passportContract.mint(
      1,
      workerWallet.address,
      ramameshIdentity(),
      dummyEvidence,
      attesterWallet.address
    );
    assert.strictEqual(passportId, 1, 'Initial passport ID must be 1');

    function ramameshIdentity() {
      return ramesh.identityNullifierHash;
    }
  });

  it('MUST PREVENT: duplicate ACTIVE passport for same worker identity', async () => {
    const { consentService, attestationService, passportContract, idp } = createTestSetup();
    const ramesh = PERSONAS.RAMESH;

    const consent = consentService.createConsent({
      accountId: ramesh.accountId,
      authorizedIdentityNullifier: ramesh.identityNullifierHash,
      durationSeconds: 3600,
      toTimestamp: fixedCutoff,
    });

    const assertion = idp.issueAssertion({
      workerIdentityNullifier: ramesh.identityNullifierHash,
      workerWalletAddress: workerWallet.address,
      durationSeconds: 3600,
    });

    const auth1 = await signWorkerAuthorization({
      action: 'MINT_PASSPORT',
      workerWalletAddress: workerWallet.address,
      consentId: consent.consentId,
      expectedPassportId: 1,
    }, workerWallet);

    // First mint succeeds
    const res1 = await attestationService.attestAndMintOnChain(
      {
        consentId: consent.consentId,
        workerWalletAddress: workerWallet.address,
        workerIdentityNullifier: ramesh.identityNullifierHash,
        expectedPassportId: 1,
        cutoffTimestamp: fixedCutoff,
        identityAssertion: assertion,
        walletAuthorization: auth1,
      },
      passportContract
    );
    assert.strictEqual(res1.passportId, 1);

    // Second mint attempt for the SAME worker identity MUST REJECT
    const auth2 = await signWorkerAuthorization({
      action: 'MINT_PASSPORT',
      workerWalletAddress: workerWallet.address,
      consentId: consent.consentId,
      expectedPassportId: 2,
    }, workerWallet);

    await assert.rejects(
      async () => {
        await attestationService.attestAndMintOnChain(
          {
            consentId: consent.consentId,
            workerWalletAddress: workerWallet.address,
            workerIdentityNullifier: ramesh.identityNullifierHash,
            expectedPassportId: 2,
            cutoffTimestamp: fixedCutoff,
            identityAssertion: assertion,
            walletAuthorization: auth2,
          },
          passportContract
        );
      },
      /ActivePassportExists/
    );
  });

  it('Contention handling: atomic recompute and retry on ExpectedIdMismatch', async () => {
    const { consentService, attestationService, passportContract, idp } = createTestSetup();
    const ramesh = PERSONAS.RAMESH;
    const suresh = PERSONAS.SURESH;

    const rameshWallet = ethers.Wallet.createRandom();
    const sureshWallet = ethers.Wallet.createRandom();

    const consentRamesh = consentService.createConsent({
      accountId: ramesh.accountId,
      authorizedIdentityNullifier: ramesh.identityNullifierHash,
      durationSeconds: 3600,
      toTimestamp: fixedCutoff,
    });
    const assertionRamesh = idp.issueAssertion({
      workerIdentityNullifier: ramesh.identityNullifierHash,
      workerWalletAddress: rameshWallet.address,
    });

    const consentSuresh = consentService.createConsent({
      accountId: suresh.accountId,
      authorizedIdentityNullifier: suresh.identityNullifierHash,
      durationSeconds: 3600,
      toTimestamp: fixedCutoff,
    });
    const assertionSuresh = idp.issueAssertion({
      workerIdentityNullifier: suresh.identityNullifierHash,
      workerWalletAddress: sureshWallet.address,
    });

    // Directly verify that calling mint with wrong expectedId reverts
    const dummyEvidence = {
      commitment: '999999999',
      updatedAt: fixedCutoff,
      schemaVersion: 1,
      providerRef: '0x01',
      sourceDirectoryVersion: 1,
    };

    await assert.rejects(
      async () => {
        await passportContract.mint(
          999, // Wrong expectedId (actual is 1)
          rameshWallet.address,
          ramesh.identityNullifierHash,
          dummyEvidence,
          attesterWallet.address
        );
      },
      /ExpectedIdMismatch: expected 999, actual 1/
    );

    // Suresh mints passport ID 1 first
    const sureshAuth = await signWorkerAuthorization({
      action: 'MINT_PASSPORT',
      workerWalletAddress: sureshWallet.address,
      consentId: consentSuresh.consentId,
      expectedPassportId: 1,
    }, sureshWallet);

    const sureshRes = await attestationService.attestAndMintOnChain(
      {
        consentId: consentSuresh.consentId,
        workerWalletAddress: sureshWallet.address,
        workerIdentityNullifier: suresh.identityNullifierHash,
        expectedPassportId: 1,
        cutoffTimestamp: fixedCutoff,
        identityAssertion: assertionSuresh,
        walletAuthorization: sureshAuth,
      },
      passportContract
    );
    assert.strictEqual(sureshRes.passportId, 1);

    // Ramesh's wallet initially signed for expectedPassportId: 1 (which is now taken!)
    const rameshAuthOld = await signWorkerAuthorization({
      action: 'MINT_PASSPORT',
      workerWalletAddress: rameshWallet.address,
      consentId: consentRamesh.consentId,
      expectedPassportId: 1, // Signed for 1!
    }, rameshWallet);

    // 1. Calling WITHOUT reauthorization callback MUST REJECT (fail closed, never silently alter expectedId)
    await assert.rejects(
      async () => {
        await attestationService.attestAndMintOnChain(
          {
            consentId: consentRamesh.consentId,
            workerWalletAddress: rameshWallet.address,
            workerIdentityNullifier: ramesh.identityNullifierHash,
            expectedPassportId: 1,
            cutoffTimestamp: fixedCutoff,
            identityAssertion: assertionRamesh,
            walletAuthorization: rameshAuthOld,
          },
          passportContract
          // No reauthorizeWorker callback provided!
        );
      },
      /ExpectedIdMismatch: requested passport ID 1 does not match contract next ID 2; worker reauthorization required/
    );

    // 2. Calling WITH reauthorization callback prompts wallet to re-sign for ID 2 and succeeds!
    const rameshRes = await attestationService.attestAndMintOnChain(
      {
        consentId: consentRamesh.consentId,
        workerWalletAddress: rameshWallet.address,
        workerIdentityNullifier: ramesh.identityNullifierHash,
        expectedPassportId: 1,
        cutoffTimestamp: fixedCutoff,
        identityAssertion: assertionRamesh,
        walletAuthorization: rameshAuthOld,
      },
      passportContract,
      async (newId: number) => {
        // Re-authorize with fresh signature for new sequential ID
        return signWorkerAuthorization({
          action: 'MINT_PASSPORT',
          workerWalletAddress: rameshWallet.address,
          consentId: consentRamesh.consentId,
          expectedPassportId: newId,
        }, rameshWallet);
      }
    );
    assert.strictEqual(rameshRes.passportId, 2);
    assert.strictEqual(rameshRes.attestation.passportId, 2);
  });

  it('Terminal revocation and Authorized Reissue lifecycle (Recovery)', async () => {
    const { consentService, attestationService, passportContract, idp } = createTestSetup();
    const ramesh = PERSONAS.RAMESH;

    const consent1 = consentService.createConsent({
      accountId: ramesh.accountId,
      authorizedIdentityNullifier: ramesh.identityNullifierHash,
      durationSeconds: 3600,
      toTimestamp: fixedCutoff,
    });
    const assertion1 = idp.issueAssertion({
      workerIdentityNullifier: ramesh.identityNullifierHash,
      workerWalletAddress: workerWallet.address,
    });

    const auth1 = await signWorkerAuthorization({
      action: 'MINT_PASSPORT',
      workerWalletAddress: workerWallet.address,
      consentId: consent1.consentId,
      expectedPassportId: 1,
    }, workerWallet);

    // 1. Initial Mint
    const initial = await attestationService.attestAndMintOnChain(
      {
        consentId: consent1.consentId,
        workerWalletAddress: workerWallet.address,
        workerIdentityNullifier: ramesh.identityNullifierHash,
        expectedPassportId: 1,
        cutoffTimestamp: fixedCutoff,
        identityAssertion: assertion1,
        walletAuthorization: auth1,
      },
      passportContract
    );
    const initialPassportId = initial.passportId;
    assert.strictEqual(initialPassportId, 1);

    const initialRecord = await passportContract.getPassport(initialPassportId);
    assert.strictEqual(initialRecord?.status, 'ACTIVE');

    // 2. Terminal Revocation by Admin
    // Non-admin cannot revoke
    await assert.rejects(
      async () => {
        await passportContract.revoke(initialPassportId, 'Compromised key', attesterWallet.address);
      },
      /AccessControl: caller is not authorized with ADMIN_ROLE/
    );

    // Admin revokes successfully
    await passportContract.revoke(initialPassportId, 'Compromised holder key', adminWallet.address);
    const revokedRecord = await passportContract.getPassport(initialPassportId);
    assert.strictEqual(revokedRecord?.status, 'REVOKED');
    assert.strictEqual(await passportContract.getActivePassportByIdentity(ramesh.identityNullifierHash), 0);

    // 3. Attempting reissue without Admin Authorization MUST REJECT
    const consent2 = consentService.createConsent({
      accountId: ramesh.accountId,
      authorizedIdentityNullifier: ramesh.identityNullifierHash,
      durationSeconds: 3600,
      toTimestamp: fixedCutoff,
    });
    const newWorkerWallet = ethers.Wallet.createRandom(); // Worker recovered with new key
    idp.rebindWorkerWallet(ramesh.identityNullifierHash, newWorkerWallet.address);
    const assertion2 = idp.issueAssertion({
      workerIdentityNullifier: ramesh.identityNullifierHash, // Same stable identity!
      workerWalletAddress: newWorkerWallet.address,
    });

    const auth2 = await signWorkerAuthorization({
      action: 'REISSUE_PASSPORT',
      workerWalletAddress: newWorkerWallet.address,
      consentId: consent2.consentId,
      expectedPassportId: 2,
    }, newWorkerWallet);

    await assert.rejects(
      async () => {
        await attestationService.attestAndMintOnChain(
          {
            consentId: consent2.consentId,
            workerWalletAddress: newWorkerWallet.address,
            workerIdentityNullifier: ramesh.identityNullifierHash,
            expectedPassportId: 2,
            cutoffTimestamp: fixedCutoff,
            identityAssertion: assertion2,
            walletAuthorization: auth2,
          },
          passportContract
        );
      },
      /ReissueNotAuthorized/
    );

    // 4. Admin authorizes reissue
    // Non-admin cannot authorize reissue
    await assert.rejects(
      async () => {
        await passportContract.authorizeReissue(ramesh.identityNullifierHash, attesterWallet.address);
      },
      /AccessControl: caller is not authorized with ADMIN_ROLE/
    );

    // Admin authorizes reissue
    await passportContract.authorizeReissue(ramesh.identityNullifierHash, adminWallet.address);
    assert.strictEqual(await passportContract.isReissueAllowed(ramesh.identityNullifierHash), true);

    // 5. Attestation Service successfully mints replacement passport
    const replacement = await attestationService.attestAndMintOnChain(
      {
        consentId: consent2.consentId,
        workerWalletAddress: newWorkerWallet.address,
        workerIdentityNullifier: ramesh.identityNullifierHash,
        expectedPassportId: 2,
        cutoffTimestamp: fixedCutoff,
        identityAssertion: assertion2,
        walletAuthorization: auth2,
      },
      passportContract
    );

    assert.strictEqual(replacement.passportId, 2);
    const replacementRecord = await passportContract.getPassport(2);
    assert.strictEqual(replacementRecord?.status, 'ACTIVE');
    assert.strictEqual(replacementRecord?.holderWallet, newWorkerWallet.address.toLowerCase());
    assert.strictEqual(replacementRecord?.supersedes, 1, 'Replacement passport must reference revoked passport ID');

    // 6. Reissue authorization is consumed: second replacement attempt without new authorization fails
    assert.strictEqual(await passportContract.isReissueAllowed(ramesh.identityNullifierHash), false);
  });

  it('Evidence Refresh lifecycle: requires modified commitment and non-regressed timestamp', async () => {
    const { consentService, attestationService, passportContract, idp } = createTestSetup();
    const ramesh = PERSONAS.RAMESH;

    const consent = consentService.createConsent({
      accountId: ramesh.accountId,
      authorizedIdentityNullifier: ramesh.identityNullifierHash,
      durationSeconds: 3600,
      toTimestamp: fixedCutoff,
    });
    const assertion = idp.issueAssertion({
      workerIdentityNullifier: ramesh.identityNullifierHash,
      workerWalletAddress: workerWallet.address,
    });

    const auth = await signWorkerAuthorization({
      action: 'MINT_PASSPORT',
      workerWalletAddress: workerWallet.address,
      consentId: consent.consentId,
      expectedPassportId: 1,
    }, workerWallet);

    const initial = await attestationService.attestAndMintOnChain(
      {
        consentId: consent.consentId,
        workerWalletAddress: workerWallet.address,
        workerIdentityNullifier: ramesh.identityNullifierHash,
        expectedPassportId: 1,
        cutoffTimestamp: fixedCutoff,
        identityAssertion: assertion,
        walletAuthorization: auth,
      },
      passportContract
    );

    const passportId = initial.passportId;

    // 1. Refresh with unchanged commitment MUST REJECT
    await assert.rejects(
      async () => {
        await passportContract.refresh(
          passportId,
          {
            commitment: (await passportContract.getPassport(passportId))!.evidenceCommitment, // same commitment
            updatedAt: fixedCutoff + 100,
            schemaVersion: 1,
            providerRef: '0x01',
            sourceDirectoryVersion: 1,
          },
          attesterWallet.address
        );
      },
      /CommitmentUnchanged/
    );

    // 2. Refresh with regressed timestamp MUST REJECT
    await assert.rejects(
      async () => {
        await passportContract.refresh(
          passportId,
          {
            commitment: '9876543210987654321', // new commitment
            updatedAt: fixedCutoff - 1000, // regressed timestamp
            schemaVersion: 1,
            providerRef: '0x01',
            sourceDirectoryVersion: 1,
          },
          attesterWallet.address
        );
      },
      /EvidenceTimestampRegressed/
    );

    // 3. Valid refresh increments evidenceVersion
    await passportContract.refresh(
      passportId,
      {
        commitment: '9876543210987654321',
        updatedAt: fixedCutoff + 86400, // 1 day later
        schemaVersion: 1,
        providerRef: '0x01',
        sourceDirectoryVersion: 1,
      },
      attesterWallet.address
    );

    const refreshed = await passportContract.getPassport(passportId);
    assert.strictEqual(refreshed?.evidenceVersion, 2, 'Evidence version must increment to 2');
    assert.strictEqual(refreshed?.evidenceCommitment, '9876543210987654321');
  });

  it('MUST PREVENT: attacker minting using forged tripartite binding', async () => {
    const { consentService, attestationService, passportContract, idp } = createTestSetup();
    const ramesh = PERSONAS.RAMESH;

    // Attacker gets valid consent for their own bank account (e.g. Arjun)
    const consent = consentService.createConsent({
      accountId: PERSONAS.ARJUN.accountId,
      authorizedIdentityNullifier: PERSONAS.ARJUN.identityNullifierHash,
      durationSeconds: 3600,
      toTimestamp: fixedCutoff,
    });

    // Attacker obtains an assertion for their own wallet and identity
    const attackerAssertion = idp.issueAssertion({
      workerIdentityNullifier: PERSONAS.ARJUN.identityNullifierHash,
      workerWalletAddress: attackerWallet.address,
    });

    const attackerAuth = await signWorkerAuthorization({
      action: 'MINT_PASSPORT',
      workerWalletAddress: attackerWallet.address,
      consentId: consent.consentId,
      expectedPassportId: 1,
    }, attackerWallet);

    // Attacker attempts to claim Ramesh's identity nullifier on-chain
    await assert.rejects(
      async () => {
        await attestationService.attestAndMintOnChain(
          {
            consentId: consent.consentId,
            workerWalletAddress: attackerWallet.address,
            workerIdentityNullifier: ramesh.identityNullifierHash, // Spoofed target identity!
            expectedPassportId: 1,
            cutoffTimestamp: fixedCutoff,
            identityAssertion: attackerAssertion,
            walletAuthorization: attackerAuth,
          },
          passportContract
        );
      },
      /Identity assertion nullifier mismatch/
    );
  });
});
