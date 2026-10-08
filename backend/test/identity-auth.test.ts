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
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { signWorkerAuthorization, verifyWorkerAuthorization, ReplayProtectionRegistry, MemoryReplayStore, FileReplayStore, FileReplayStoreCorruptedError } from '../src/identity/wallet-auth.js';
import { MockFIPStorage } from '../src/fip/storage.js';
import { ConsentService } from '../src/fip/consent-service.js';
import { MockFIPService } from '../src/fip/fip-service.js';
import { AttestationService } from '../src/evidence/attestation-service.js';
import { FIPVerifier } from '../src/evidence/fip-verifier.js';
import { generateFipKeyPair } from '../src/fip/crypto.js';
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
    const consentService = new ConsentService(storage, idp, false);
    const fipService = new MockFIPService(storage, consentService, 'MOCK_APNA_BANK_FIP_01', idp, false);
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
    const consentService = new ConsentService(storage, idp, false);
    const fipService = new MockFIPService(storage, consentService, 'MOCK_APNA_BANK_FIP_01', idp, false);
    const attestationService = new AttestationService(fipService, [storage.getPublicKeyPem()], idp);

    const consent = consentService.createConsent({
      accountId: PERSONAS.RAMESH.accountId,
    });

    // Ramesh's identity assertion (bound to rameshWallet)
    const identityAssertion = idp.issueAssertion({
      workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
      workerWalletAddress: rameshWallet.address,
    });

    // Attacker signs wallet authorization with their own wallet
    const attackerAuth = await signWorkerAuthorization(
      {
        action: 'MINT_PASSPORT',
        workerWalletAddress: arjunWallet.address,
        consentId: consent.consentId,
        expectedPassportId: 101,
      },
      arjunWallet
    );

    // Attacker tries to pass Ramesh's assertion with Arjun's wallet address
    assert.throws(
      () =>
        attestationService.attestWorkerEvidence({
          consentId: consent.consentId,
          workerWalletAddress: arjunWallet.address, // Attacker's wallet!
          workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
          expectedPassportId: 101,
          identityAssertion,
          walletAuthorization: attackerAuth,
        }),
      /Identity assertion wallet mismatch/,
      'Must reject when assertion wallet does not match request wallet'
    );
  });

  it('MUST REJECT: attacker with valid identity assertion tries to use another worker bank account', async () => {
    const storage = new MockFIPStorage();
    const consentService = new ConsentService(storage, idp, false);
    const fipService = new MockFIPService(storage, consentService, 'MOCK_APNA_BANK_FIP_01', idp, false);
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
      /(Account owner binding mismatch|UnauthorizedFIPRetrieval)/,
      'Must reject when verified identity does not match bank account owner'
    );
  });

  it('MUST REJECT: missing assertion or wallet authorization in direct service method (fail-closed)', async () => {
    const storage = new MockFIPStorage();
    const consentService = new ConsentService(storage, idp, false);
    const fipService = new MockFIPService(storage, consentService, 'MOCK_APNA_BANK_FIP_01', idp, false);
    const attestationService = new AttestationService(fipService, [storage.getPublicKeyPem()], idp);

    const consent = consentService.createConsent({
      accountId: PERSONAS.RAMESH.accountId,
    });

    const assertion = idp.issueAssertion({
      workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
      workerWalletAddress: rameshWallet.address,
    });

    // 1. Missing assertion
    assert.throws(
      () =>
        attestationService.attestWorkerEvidence({
          consentId: consent.consentId,
          workerWalletAddress: rameshWallet.address,
          workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
          expectedPassportId: 101,
        } as any),
      /AuthenticationRequired: missing verified identityAssertion/,
      'Must reject when assertion is missing'
    );

    // 2. Missing wallet authorization
    assert.throws(
      () =>
        attestationService.attestWorkerEvidence({
          consentId: consent.consentId,
          workerWalletAddress: rameshWallet.address,
          workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
          expectedPassportId: 101,
          identityAssertion: assertion,
        } as any),
      /AuthenticationRequired: missing worker walletAuthorization/,
      'Must reject when wallet authorization is missing'
    );
  });

  it('MUST REJECT: self-signed forged IDP assertion signed by attacker key', () => {
    // Attacker generates their own rogue IDP keypair
    const rogueIdp = new MockIdentityProvider();
    const forgedAssertion = rogueIdp.issueAssertion({
      workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
      workerWalletAddress: arjunWallet.address,
    });

    // Trusted IDP verifier (which has pinned trusted key) must reject the assertion even though signature is mathematically valid!
    assert.throws(
      () => idp.verifyAssertion(forgedAssertion),
      /Untrusted identity provider public key: key not recognized by Attestation Authority/,
      'Must reject self-signed assertion with untrusted public key'
    );
  });

  it('MUST REJECT: untrusted FIP public keys or unconfigured FIP authority (fail closed)', () => {
    const emptyVerifier = new FIPVerifier([]);

    const storage = new MockFIPStorage();
    const consentService = new ConsentService(storage, idp, false);
    const fipService = new MockFIPService(storage, consentService, 'MOCK_APNA_BANK_FIP_01', idp, false);
    const consent = consentService.createConsent({
      accountId: PERSONAS.RAMESH.accountId,
      authorizedIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
    });
    const envelope = fipService.fetchSignedDataByConsent(consent.consentId);

    assert.throws(
      () => emptyVerifier.verifyEnvelope(envelope, PERSONAS.RAMESH.identityNullifierHash),
      /FIP verification failed: no trusted FIP public keys configured in Attestation Authority/,
      'Empty trusted keys must fail closed'
    );

    // Verifier with rogue key must reject genuine envelope
    const rogueKeyPair = generateFipKeyPair();
    const mismatchedVerifier = new FIPVerifier([rogueKeyPair.publicKeyPem]);
    assert.throws(
      () => mismatchedVerifier.verifyEnvelope(envelope, PERSONAS.RAMESH.identityNullifierHash),
      /Untrusted FIP public key: key not recognized by Attestation Authority/,
      'Untrusted FIP key must be rejected'
    );
  });

  it('MUST REJECT: backdated caller timestamp cannot revive expired wallet authorization', async () => {
    const expiredTs = Math.floor(Date.now() / 1000) - 1000; // 1000s ago
    const auth = await signWorkerAuthorization(
      {
        action: 'MINT_PASSPORT',
        workerWalletAddress: rameshWallet.address,
        consentId: 'CONSENT_TEST',
        expectedPassportId: 101,
        timestamp: expiredTs,
      },
      rameshWallet
    );

    // verifyWorkerAuthorization uses trusted server clock, ignoring old timestamp
    assert.throws(
      () => verifyWorkerAuthorization(auth, 300),
      /Worker wallet authorization expired/,
      'Expired authorization cannot pass verification'
    );
  });

  it('MUST REJECT: reused authorization signature fails replay protection registry', async () => {
    const registry = new ReplayProtectionRegistry();
    const auth = await signWorkerAuthorization(
      {
        action: 'MINT_PASSPORT',
        workerWalletAddress: rameshWallet.address,
        consentId: 'CONSENT_TEST_101',
        expectedPassportId: 101,
      },
      rameshWallet
    );

    registry.consume(auth);
    assert.strictEqual(registry.isConsumed(auth), true);

    assert.throws(
      () => registry.consume(auth),
      /ReplayAttackDetected: worker authorization signature already consumed/
    );
  });

  it('MUST REJECT: reused authorization nonce fails replay protection registry even with different timestamp', async () => {
    const registry = new ReplayProtectionRegistry();
    const fixedNonce = 'shared-test-nonce-12345';
    const auth1 = await signWorkerAuthorization(
      {
        action: 'MINT_PASSPORT',
        workerWalletAddress: rameshWallet.address,
        consentId: 'CONSENT_TEST_101',
        expectedPassportId: 101,
        timestamp: 1700000000,
        nonce: fixedNonce,
      },
      rameshWallet
    );

    registry.consume(auth1);

    const auth2 = await signWorkerAuthorization(
      {
        action: 'MINT_PASSPORT',
        workerWalletAddress: rameshWallet.address,
        consentId: 'CONSENT_TEST_102',
        expectedPassportId: 102,
        timestamp: 1700000500,
        nonce: fixedNonce, // Reused nonce!
      },
      rameshWallet
    );

    assert.throws(
      () => registry.consume(auth2),
      /ReplayAttackDetected: nonce shared-test-nonce-12345 already consumed for wallet/
    );
  });

  it('MUST DETECT REPLAY across multiple service replicas sharing an IReplayStore backend', async () => {
    const sharedStore = new MemoryReplayStore();
    const instanceA = new ReplayProtectionRegistry(sharedStore);
    const instanceB = new ReplayProtectionRegistry(sharedStore);

    const auth = await signWorkerAuthorization(
      {
        action: 'MINT_PASSPORT',
        workerWalletAddress: rameshWallet.address,
        consentId: 'CONSENT_REPLICA_1',
        expectedPassportId: 601,
      },
      rameshWallet
    );

    // Consumed on instance A
    instanceA.consume(auth);
    assert.strictEqual(instanceA.isConsumed(auth), true);

    // Instance B sees it as consumed and rejects replay
    assert.strictEqual(instanceB.isConsumed(auth), true);
    assert.throws(
      () => instanceB.consume(auth),
      /ReplayAttackDetected: worker authorization signature already consumed/
    );
  });

  it('MUST PERSIST REPLAY PROTECTION across process restarts using FileReplayStore', async () => {
    const tempFile = path.join(os.tmpdir(), `gigvault-replay-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);

    try {
      const auth = await signWorkerAuthorization(
        {
          action: 'MINT_PASSPORT',
          workerWalletAddress: rameshWallet.address,
          consentId: 'CONSENT_RESTART_1',
          expectedPassportId: 701,
          nonce: 'nonce-restart-abc',
        },
        rameshWallet
      );

      // Process 1: consumes the authorization and terminates
      const process1Store = new FileReplayStore(tempFile);
      assert.strictEqual(process1Store.isConsumed(auth), false);
      process1Store.consume(auth);
      assert.strictEqual(process1Store.isConsumed(auth), true);

      // Process 2: simulates an independent process / restarted server loading the same disk state
      const process2Store = new FileReplayStore(tempFile);
      assert.strictEqual(process2Store.isConsumed(auth), true, 'Restarted process must detect already-consumed signature from disk');

      // Attempting to replay must fail
      assert.throws(
        () => process2Store.consume(auth),
        /ReplayAttackDetected: worker authorization signature already consumed/
      );

      // Attempting to reuse nonce in fresh signature must also fail
      const auth2 = await signWorkerAuthorization(
        {
          action: 'MINT_PASSPORT',
          workerWalletAddress: rameshWallet.address,
          consentId: 'CONSENT_RESTART_2',
          expectedPassportId: 702,
          nonce: 'nonce-restart-abc', // Reused nonce
        },
        rameshWallet
      );

      assert.throws(
        () => process2Store.consume(auth2),
        /ReplayAttackDetected: nonce nonce-restart-abc already consumed for wallet/
      );
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  });

  it('MUST ENFORCE chain ID validation in AttestationService (reject missing and mismatched)', async () => {
    const storage = new MockFIPStorage();
    const consentService = new ConsentService(storage, idp, false);
    const fipService = new MockFIPService(storage, consentService, 'MOCK_APNA_BANK_FIP_01', idp, false);
    const expectedChain = 80002; // Polygon Amoy
    const attestationService = new AttestationService(
      fipService,
      [storage.getPublicKeyPem()],
      idp,
      undefined,
      expectedChain
    );

    const consent = consentService.createConsent({
      accountId: PERSONAS.RAMESH.accountId,
    });
    const assertion = idp.issueAssertion({
      workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
      workerWalletAddress: rameshWallet.address,
    });

    // 1. Missing chainId when expectedChainId is configured
    const authNoChain = await signWorkerAuthorization(
      {
        action: 'MINT_PASSPORT',
        workerWalletAddress: rameshWallet.address,
        consentId: consent.consentId,
        expectedPassportId: 801,
      },
      rameshWallet
    );

    assert.throws(
      () =>
        attestationService.attestWorkerEvidence({
          consentId: consent.consentId,
          workerWalletAddress: rameshWallet.address,
          workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
          expectedPassportId: 801,
          identityAssertion: assertion,
          walletAuthorization: authNoChain,
        }),
      /ChainDomainMissing: wallet authorization must specify chainId matching expected chain 80002/
    );

    // 2. Mismatched chainId (e.g. Ethereum mainnet 1 vs Amoy 80002)
    const authWrongChain = await signWorkerAuthorization(
      {
        action: 'MINT_PASSPORT',
        workerWalletAddress: rameshWallet.address,
        consentId: consent.consentId,
        expectedPassportId: 802,
        chainId: 1, // Wrong chain!
      },
      rameshWallet
    );

    assert.throws(
      () =>
        attestationService.attestWorkerEvidence({
          consentId: consent.consentId,
          workerWalletAddress: rameshWallet.address,
          workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
          expectedPassportId: 802,
          identityAssertion: assertion,
          walletAuthorization: authWrongChain,
        }),
      /ChainDomainMismatch: wallet authorization chainId 1 does not match expected chainId 80002/
    );

    // 3. Matching chainId succeeds
    const authValidChain = await signWorkerAuthorization(
      {
        action: 'MINT_PASSPORT',
        workerWalletAddress: rameshWallet.address,
        consentId: consent.consentId,
        expectedPassportId: 803,
        chainId: 80002, // Matching chain!
      },
      rameshWallet
    );

    const res = attestationService.attestWorkerEvidence({
      consentId: consent.consentId,
      workerWalletAddress: rameshWallet.address,
      workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
      expectedPassportId: 803,
      identityAssertion: assertion,
      walletAuthorization: authValidChain,
    });
    assert.strictEqual(res.verified, true);
  });

  it('MUST PREVENT CONCURRENT CONSUMPTION across contending child processes (same signature)', async () => {
    const tempFile = path.join(os.tmpdir(), `gigvault-concurrent-sig-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    const lockFile = `${tempFile}.lock`;

    try {
      const auth = await signWorkerAuthorization(
        {
          action: 'MINT_PASSPORT',
          workerWalletAddress: rameshWallet.address,
          consentId: 'CONSENT_CONCURRENT_1',
          expectedPassportId: 901,
          nonce: 'nonce-concurrent-sig-1',
        },
        rameshWallet
      );

      function runChildWorker() {
        return new Promise<{ code: number | null; stderr: string }>((resolve) => {
          const child = spawn(
            process.execPath,
            [
              '--import',
              'tsx',
              '--input-type=module',
              '-e',
              `
              import { FileReplayStore } from './src/identity/wallet-auth.js';
              const store = new FileReplayStore(process.env.REPLAY_PATH);
              const auth = JSON.parse(process.env.AUTH_DATA);
              try {
                store.consume(auth);
                process.exit(0);
              } catch (err) {
                process.stderr.write(err.message || 'unknown error');
                process.exit(1);
              }
              `,
            ],
            {
              env: {
                ...process.env,
                REPLAY_PATH: tempFile,
                AUTH_DATA: JSON.stringify(auth),
              },
            }
          );

          let stderr = '';
          child.stderr.on('data', (d) => {
            stderr += d.toString();
          });
          child.on('close', (code) => {
            resolve({ code, stderr });
          });
        });
      }

      // Launch two independent child processes simultaneously
      const [resA, resB] = await Promise.all([runChildWorker(), runChildWorker()]);

      const exitCodes = [resA.code, resB.code].sort();
      assert.deepStrictEqual(exitCodes, [0, 1], 'Exactly one child process must succeed (0) and one must fail (1)');

      const failedResult = resA.code === 1 ? resA : resB;
      assert.ok(
        failedResult.stderr.includes('ReplayAttackDetected: worker authorization signature already consumed'),
        `Failed process must output replay rejection error, got: ${failedResult.stderr}`
      );

      // Verify state in store
      const store = new FileReplayStore(tempFile);
      assert.strictEqual(store.isConsumed(auth), true);
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);
    }
  });

  it('MUST PREVENT CONCURRENT CONSUMPTION across contending child processes (same nonce, different signature)', async () => {
    const tempFile = path.join(os.tmpdir(), `gigvault-concurrent-nonce-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    const lockFile = `${tempFile}.lock`;

    try {
      const sharedNonce = 'contending-nonce-xyz-999';
      const auth1 = await signWorkerAuthorization(
        {
          action: 'MINT_PASSPORT',
          workerWalletAddress: rameshWallet.address,
          consentId: 'CONSENT_NONCE_A',
          expectedPassportId: 902,
          nonce: sharedNonce,
        },
        rameshWallet
      );

      const auth2 = await signWorkerAuthorization(
        {
          action: 'MINT_PASSPORT',
          workerWalletAddress: rameshWallet.address,
          consentId: 'CONSENT_NONCE_B',
          expectedPassportId: 903,
          nonce: sharedNonce,
        },
        rameshWallet
      );

      function runChildWorker(authData: any) {
        return new Promise<{ code: number | null; stderr: string }>((resolve) => {
          const child = spawn(
            process.execPath,
            [
              '--import',
              'tsx',
              '--input-type=module',
              '-e',
              `
              import { FileReplayStore } from './src/identity/wallet-auth.js';
              const store = new FileReplayStore(process.env.REPLAY_PATH);
              const auth = JSON.parse(process.env.AUTH_DATA);
              try {
                store.consume(auth);
                process.exit(0);
              } catch (err) {
                process.stderr.write(err.message || 'unknown error');
                process.exit(1);
              }
              `,
            ],
            {
              env: {
                ...process.env,
                REPLAY_PATH: tempFile,
                AUTH_DATA: JSON.stringify(authData),
              },
            }
          );

          let stderr = '';
          child.stderr.on('data', (d) => {
            stderr += d.toString();
          });
          child.on('close', (code) => {
            resolve({ code, stderr });
          });
        });
      }

      // Launch two independent child processes simultaneously with same nonce
      const [resA, resB] = await Promise.all([runChildWorker(auth1), runChildWorker(auth2)]);

      const exitCodes = [resA.code, resB.code].sort();
      assert.deepStrictEqual(exitCodes, [0, 1], 'Exactly one process must succeed and one must fail on nonce reuse');

      const failedResult = resA.code === 1 ? resA : resB;
      assert.ok(
        failedResult.stderr.includes(`ReplayAttackDetected: nonce ${sharedNonce} already consumed`),
        `Failed process must output nonce replay rejection error, got: ${failedResult.stderr}`
      );
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);
    }
  });

  it('MUST FAIL CLOSED on corrupted, malformed, or unreadable storage in FileReplayStore', async () => {
    const tempFile = path.join(os.tmpdir(), `gigvault-corrupt-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    const lockFile = `${tempFile}.lock`;

    try {
      const auth = await signWorkerAuthorization(
        {
          action: 'MINT_PASSPORT',
          workerWalletAddress: rameshWallet.address,
          consentId: 'CONSENT_CORRUPT_1',
          expectedPassportId: 904,
        },
        rameshWallet
      );

      // 1. Corrupted file with malformed JSON
      fs.writeFileSync(tempFile, '{"signature": "0x123", invalid-json-syntax', 'utf8');
      assert.throws(
        () => new FileReplayStore(tempFile),
        (err: any) => err instanceof FileReplayStoreCorruptedError && err.message.includes('malformed JSON'),
        'Must throw FileReplayStoreCorruptedError on malformed JSON'
      );

      // 2. Corrupted file with empty whitespace
      fs.writeFileSync(tempFile, '   \n  \t  ', 'utf8');
      assert.throws(
        () => new FileReplayStore(tempFile),
        (err: any) => err instanceof FileReplayStoreCorruptedError && err.message.includes('empty or whitespace-only'),
        'Must throw FileReplayStoreCorruptedError on empty whitespace file'
      );

      // 3. Corrupted file with non-array root
      fs.writeFileSync(tempFile, JSON.stringify({ notAnArray: true }), 'utf8');
      assert.throws(
        () => new FileReplayStore(tempFile),
        (err: any) => err instanceof FileReplayStoreCorruptedError && err.message.includes('root must be a JSON array'),
        'Must throw FileReplayStoreCorruptedError on non-array root'
      );

      // 4. Corrupted file with invalid record schema (missing walletAddress, invalid timestamp)
      fs.writeFileSync(tempFile, JSON.stringify([{ signature: '0x123', action: 'MINT_PASSPORT', timestamp: 'not-a-number' }]), 'utf8');
      assert.throws(
        () => new FileReplayStore(tempFile),
        (err: any) => err instanceof FileReplayStoreCorruptedError && (err.message.includes('missing walletAddress') || err.message.includes('invalid timestamp')),
        'Must validate stored records and throw FileReplayStoreCorruptedError'
      );

      // 5. Existing store whose file is corrupted after initialization must fail closed on subsequent operations
      const cleanFile = path.join(os.tmpdir(), `gigvault-clean-corrupt-${Date.now()}.json`);
      try {
        const store = new FileReplayStore(cleanFile);
        store.consume(auth);
        assert.strictEqual(store.isConsumed(auth), true);

        // File is corrupted externally on disk
        fs.writeFileSync(cleanFile, 'CORRUPTED_DISK_DATA', 'utf8');

        // Subsequent consume and isConsumed MUST fail closed, not accept or swallow
        assert.throws(
          () => store.isConsumed(auth),
          (err: any) => err instanceof FileReplayStoreCorruptedError,
          'isConsumed must fail closed when file is corrupted'
        );

        const newAuth = await signWorkerAuthorization(
          {
            action: 'MINT_PASSPORT',
            workerWalletAddress: arjunWallet.address,
            consentId: 'CONSENT_CORRUPT_2',
            expectedPassportId: 905,
          },
          arjunWallet
        );

        assert.throws(
          () => store.consume(newAuth),
          (err: any) => err instanceof FileReplayStoreCorruptedError,
          'consume must fail closed when file is corrupted'
        );
      } finally {
        if (fs.existsSync(cleanFile)) fs.unlinkSync(cleanFile);
        if (fs.existsSync(`${cleanFile}.lock`)) fs.unlinkSync(`${cleanFile}.lock`);
      }
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);
    }
  });

  it('MUST PRESERVE VALID AUTHORIZATION across premature expiry boundaries (+301s clock skew) in MemoryReplayStore and FileReplayStore', async () => {
    const tempFile = path.join(os.tmpdir(), `gigvault-expiry-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    const lockFile = `${tempFile}.lock`;

    try {
      const consumptionTime = 1000000;
      // Worker authorization signed 60 seconds ahead (valid within allowed +60s clock skew)
      const authTimestamp = consumptionTime + 60; // 1000060

      const auth = await signWorkerAuthorization(
        {
          action: 'MINT_PASSPORT',
          workerWalletAddress: rameshWallet.address,
          consentId: 'CONSENT_EXPIRY_1',
          expectedPassportId: 906,
          timestamp: authTimestamp,
        },
        rameshWallet
      );

      const memStore = new MemoryReplayStore();
      const fileStore = new FileReplayStore(tempFile);

      // Both stores consume at server time T = consumptionTime
      memStore.consume(auth, { nowSec: consumptionTime });
      fileStore.consume(auth, { nowSec: consumptionTime });

      assert.strictEqual(memStore.isConsumed(auth), true);
      assert.strictEqual(fileStore.isConsumed(auth), true);

      // BOUNDARY 1: At consumptionTime + 301 seconds (T + 301 = 1000301)
      // The signature age is: 1000301 - 1000060 = 241 seconds (<= 300s window).
      // The signature is STILL FRESH and passes verification!
      const time301 = consumptionTime + 301;
      assert.strictEqual(
        verifyWorkerAuthorization(auth, 300, time301),
        true,
        'Authorization must still be fresh and pass verification at T + 301s (age 241s)'
      );

      // pruneExpired at T + 301 must NOT prune the record
      const prunedMem301 = memStore.pruneExpired(300, time301);
      const prunedFile301 = fileStore.pruneExpired(300, time301);
      assert.strictEqual(prunedMem301, 0, 'Memory store must retain record at T + 301s');
      assert.strictEqual(prunedFile301, 0, 'File store must retain record at T + 301s');

      assert.strictEqual(memStore.isConsumed(auth), true);
      assert.strictEqual(fileStore.isConsumed(auth), true);

      assert.throws(
        () => memStore.consume(auth, { nowSec: time301 }),
        /ReplayAttackDetected: worker authorization signature already consumed/
      );
      assert.throws(
        () => fileStore.consume(auth, { nowSec: time301 }),
        /ReplayAttackDetected: worker authorization signature already consumed/
      );

      // BOUNDARY 2: At authTimestamp + 300 seconds (exact boundary: 1000060 + 300 = 1000360)
      // Age is exactly 300 seconds (last valid second).
      const time360 = authTimestamp + 300;
      assert.strictEqual(
        verifyWorkerAuthorization(auth, 300, time360),
        true,
        'Authorization must still pass verification at exact 300s boundary (T + 360s)'
      );

      const prunedMem360 = memStore.pruneExpired(300, time360);
      const prunedFile360 = fileStore.pruneExpired(300, time360);
      assert.strictEqual(prunedMem360, 0, 'Memory store must retain record at exact 300s boundary');
      assert.strictEqual(prunedFile360, 0, 'File store must retain record at exact 300s boundary');

      assert.strictEqual(memStore.isConsumed(auth), true);
      assert.strictEqual(fileStore.isConsumed(auth), true);

      // BOUNDARY 3: At authTimestamp + 301 seconds (1000060 + 301 = 1000361)
      // Age is 301 seconds (> 300s). The signature is now EXPIRED!
      const time361 = authTimestamp + 301;
      assert.throws(
        () => verifyWorkerAuthorization(auth, 300, time361),
        /Worker wallet authorization expired/,
        'Authorization must be rejected as expired at T + 361s'
      );

      // Only now is it safe to prune the record
      const prunedMem361 = memStore.pruneExpired(300, time361);
      const prunedFile361 = fileStore.pruneExpired(300, time361);
      assert.strictEqual(prunedMem361, 1, 'Memory store must prune expired record at T + 361s');
      assert.strictEqual(prunedFile361, 1, 'File store must prune expired record at T + 361s');
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);
    }
  });
});
