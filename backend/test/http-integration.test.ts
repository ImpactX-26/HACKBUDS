/**
 * GigVault - HTTP Integration Tests
 * 
 * Verifies local HTTP microservices and fail-closed security gates:
 * - Mock FIP account listing, consent issuance, and signed envelope retrieval
 * - Consent expiry and revocation gates
 * - Mandatory worker identity and wallet authentication gates
 * - Reconstruction authentication gate
 * - Rejection of untrusted keys and unauthorized access
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import type { Server } from 'node:http';
import { ethers } from 'ethers';
import { createUnifiedApp } from '../src/http/unified-app.js';
import { createFipApp } from '../src/http/fip-app.js';
import { createAttestationApp } from '../src/http/attestation-app.js';
import { MockFIPStorage } from '../src/fip/storage.js';
import { ConsentService } from '../src/fip/consent-service.js';
import { MockFIPService } from '../src/fip/fip-service.js';
import { MockIdentityProvider, defaultMockIdp } from '../src/identity/mock-idp.js';
import { signWorkerAuthorization } from '../src/identity/wallet-auth.js';
import { PERSONAS } from '../src/fip/personas/index.js';

describe('HTTP Interfaces & Attestation Pipeline Integration', () => {
  const referenceCutoff = Date.UTC(2026, 9, 8, 12, 0, 0) / 1000;
  const testWallet = ethers.Wallet.createRandom();

  it('GET /fip/accounts should list all 7 synthetic persona accounts', async () => {
    const app = createUnifiedApp();
    const res = await request(app).get('/fip/accounts');

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.accounts.length, 7);

    const ramesh = res.body.accounts.find((a: any) => a.accountId === PERSONAS.RAMESH.accountId);
    assert.ok(ramesh);
    assert.strictEqual(ramesh.ownerName, 'Ramesh Kumar');
    assert.strictEqual(ramesh.identityNullifierHash, PERSONAS.RAMESH.identityNullifierHash);
  });

  it('POST /fip/consent and GET /fip/data/:consentId should issue and fetch signed envelope', async () => {
    const app = createUnifiedApp();

    // 1. Create consent
    const consentRes = await request(app)
      .post('/fip/consent')
      .send({
        accountId: PERSONAS.RAMESH.accountId,
        authorizedIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
        durationSeconds: 3600,
        toTimestamp: referenceCutoff,
      });

    assert.strictEqual(consentRes.status, 201);
    assert.strictEqual(consentRes.body.success, true);
    const consentId = consentRes.body.consent.consentId;
    assert.ok(consentId.startsWith('CONSENT_'));

    // 2. Inspect consent
    const inspectRes = await request(app).get(`/fip/consent/${consentId}`);
    assert.strictEqual(inspectRes.status, 200);
    assert.strictEqual(inspectRes.body.consent.status, 'ACTIVE');

    // 3. Server-to-server fetch signed data
    const dataRes = await request(app).get(`/fip/data/${consentId}`);
    assert.strictEqual(dataRes.status, 200);
    assert.strictEqual(dataRes.body.success, true);
    const envelope = dataRes.body.envelope;
    assert.strictEqual(envelope.payload.schemaVersion, 'GIGVAULT_FIP_MOCK_V1');
    assert.strictEqual(envelope.payload.accountId, PERSONAS.RAMESH.accountId);
    assert.ok(envelope.payload.transactions.length > 50);
    assert.ok(envelope.signature);
    assert.ok(envelope.fipPublicKey);
  });

  it('MUST REJECT: unauthorized consent creation attempt returns HTTP 403', async () => {
    const app = createUnifiedApp();

    // Attacker tries to create consent for Ramesh's account using Arjun's identity
    const consentRes = await request(app)
      .post('/fip/consent')
      .send({
        accountId: PERSONAS.RAMESH.accountId,
        authorizedIdentityNullifier: PERSONAS.ARJUN.identityNullifierHash, // Wrong owner!
      });

    assert.strictEqual(consentRes.status, 403);
    assert.strictEqual(consentRes.body.error, 'UNAUTHORIZED_CONSENT_CREATION');
  });

  it('MUST REJECT: consent expiration returns HTTP 410 over /fip/data/:consentId', async () => {
    const storage = new MockFIPStorage();
    const consentService = new ConsentService(storage);
    const fipService = new MockFIPService(storage, consentService);

    // Create consent that expires in 0 seconds
    const consent = consentService.createConsent({
      accountId: PERSONAS.RAMESH.accountId,
      durationSeconds: -1, // Expired immediately
    });

    const app = createUnifiedApp({ storage, consentService, fipService });
    const dataRes = await request(app).get(`/fip/data/${consent.consentId}`);

    assert.strictEqual(dataRes.status, 410);
    assert.strictEqual(dataRes.body.error, 'FIP_CONSENT_EXPIRED');
  });

  it('MUST REJECT: revoked consent returns HTTP 403 over /fip/data/:consentId', async () => {
    const app = createUnifiedApp();

    const consentRes = await request(app)
      .post('/fip/consent')
      .send({
        accountId: PERSONAS.RAMESH.accountId,
        authorizedIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
      });

    const consentId = consentRes.body.consent.consentId;

    // Revoke consent
    const revokeRes = await request(app).post(`/fip/consent/${consentId}/revoke`);
    assert.strictEqual(revokeRes.status, 200);
    assert.strictEqual(revokeRes.body.consent.status, 'REVOKED');

    // Fetch should fail
    const dataRes = await request(app).get(`/fip/data/${consentId}`);
    assert.strictEqual(dataRes.status, 403);
    assert.strictEqual(dataRes.body.error, 'FIP_CONSENT_REVOKED');
  });

  it('MUST REJECT: worker-supplied transaction JSON to /attestation/attest returns HTTP 400', async () => {
    const app = createUnifiedApp();

    // Attacker tries to submit worker-editable transactions
    const res = await request(app)
      .post('/attestation/attest')
      .send({
        consentId: 'CONSENT_FAKE_123',
        workerWalletAddress: testWallet.address,
        workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
        expectedPassportId: 101,
        transactions: [
          {
            txnId: 'FAKE_TXN_01',
            amountMinor: 50000000,
            narration: 'SWIGGY PAYOUT',
          },
        ],
      });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, 'WORKER_SUPPLIED_DATA_REJECTED');
    assert.ok(res.body.message.includes('Worker cannot self-certify financial evidence'));
  });

  it('MUST REJECT: missing authentication artifacts returns HTTP 401 (fail-closed default)', async () => {
    const app = createUnifiedApp();

    // 1. Consent
    const consentRes = await request(app)
      .post('/fip/consent')
      .send({
        accountId: PERSONAS.RAMESH.accountId,
        authorizedIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
      });

    // 2. Attestation without identityAssertion or walletAuthorization
    const res = await request(app)
      .post('/attestation/attest')
      .send({
        consentId: consentRes.body.consent.consentId,
        workerWalletAddress: testWallet.address,
        workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
        expectedPassportId: 101,
      });

    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.error, 'AUTHENTICATION_REQUIRED');
  });

  it('POST /attestation/attest executes end-to-end verified attestation pipeline with mandatory auth', async () => {
    const app = createUnifiedApp();

    // 1. Worker authorizes consent
    const consentRes = await request(app)
      .post('/fip/consent')
      .send({
        accountId: PERSONAS.RAMESH.accountId,
        authorizedIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
        durationSeconds: 3600,
        toTimestamp: referenceCutoff,
      });

    const consentId = consentRes.body.consent.consentId;

    // 2. Create valid identity assertion and wallet authorization
    const assertion = defaultMockIdp.issueAssertion({
      workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
      workerWalletAddress: testWallet.address,
      durationSeconds: 3600,
    });

    const auth = await signWorkerAuthorization({
      action: 'MINT_PASSPORT',
      workerWalletAddress: testWallet.address,
      consentId,
      expectedPassportId: 101,
    }, testWallet);

    // 3. Attestation request
    const attestRes = await request(app)
      .post('/attestation/attest')
      .send({
        consentId,
        workerWalletAddress: testWallet.address,
        workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
        expectedPassportId: 101,
        sourceDirectoryVersion: 2,
        cutoffTimestamp: referenceCutoff,
        identityAssertion: assertion,
        walletAuthorization: auth,
      });

    assert.strictEqual(attestRes.status, 200);
    assert.strictEqual(attestRes.body.success, true);
    assert.strictEqual(attestRes.body.verified, true);
    assert.strictEqual(attestRes.body.passportId, 101);
    assert.strictEqual(attestRes.body.holderBinding, testWallet.address.toLowerCase());
    assert.strictEqual(attestRes.body.identityNullifierHash, PERSONAS.RAMESH.identityNullifierHash);
    assert.ok(attestRes.body.evidenceDataHash);
    assert.strictEqual(attestRes.body.monthlyGigIncomeTotals.length, 36);
    assert.strictEqual(attestRes.body.weeklyActivity.length, 156);
    assert.strictEqual(attestRes.body.monthlyActivity.length, 36);
  });

  it('MUST REJECT: account owner identity mismatch returns HTTP 403 over /attestation/attest', async () => {
    const app = createUnifiedApp();

    // Arjun creates consent for his account
    const consentRes = await request(app)
      .post('/fip/consent')
      .send({
        accountId: PERSONAS.ARJUN.accountId,
        authorizedIdentityNullifier: PERSONAS.ARJUN.identityNullifierHash,
      });

    const consentId = consentRes.body.consent.consentId;

    // Caller gets assertion for Ramesh's identity
    const assertion = defaultMockIdp.issueAssertion({
      workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
      workerWalletAddress: testWallet.address,
    });

    const auth = await signWorkerAuthorization({
      action: 'MINT_PASSPORT',
      workerWalletAddress: testWallet.address,
      consentId,
      expectedPassportId: 102,
    }, testWallet);

    // Attacker presents Arjun's consentId with Ramesh's identity nullifier
    const attestRes = await request(app)
      .post('/attestation/attest')
      .send({
        consentId,
        workerWalletAddress: testWallet.address,
        workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
        expectedPassportId: 102,
        identityAssertion: assertion,
        walletAuthorization: auth,
      });

    assert.strictEqual(attestRes.status, 403);
    assert.strictEqual(attestRes.body.error, 'ACCOUNT_OWNER_MISMATCH');
    assert.ok(attestRes.body.message.includes('Account owner binding mismatch'));
  });

  it('POST /attestation/reconstruct securely reconstructs snapshot for authorized worker', async () => {
    const app = createUnifiedApp();

    // 1. Initial consent
    const consent1 = await request(app)
      .post('/fip/consent')
      .send({
        accountId: PERSONAS.RAMESH.accountId,
        authorizedIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
        toTimestamp: referenceCutoff,
      });

    const consentId1 = consent1.body.consent.consentId;

    const assertion = defaultMockIdp.issueAssertion({
      workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
      workerWalletAddress: testWallet.address,
    });

    const auth1 = await signWorkerAuthorization({
      action: 'MINT_PASSPORT',
      workerWalletAddress: testWallet.address,
      consentId: consentId1,
      expectedPassportId: 103,
    }, testWallet);

    const attestRes = await request(app)
      .post('/attestation/attest')
      .send({
        consentId: consentId1,
        workerWalletAddress: testWallet.address,
        workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
        expectedPassportId: 103,
        sourceDirectoryVersion: 1,
        cutoffTimestamp: referenceCutoff,
        identityAssertion: assertion,
        walletAuthorization: auth1,
      });

    assert.strictEqual(attestRes.status, 200);

    // 2. Proof reconstruction under new consent
    const consent2 = await request(app)
      .post('/fip/consent')
      .send({
        accountId: PERSONAS.RAMESH.accountId,
        authorizedIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
        toTimestamp: referenceCutoff,
      });

    const consentId2 = consent2.body.consent.consentId;

    // Reconstruction requires RECONSTRUCT_EVIDENCE action signed by worker
    const authReconstruct = await signWorkerAuthorization({
      action: 'RECONSTRUCT_EVIDENCE',
      workerWalletAddress: testWallet.address,
      consentId: consentId2,
      expectedPassportId: 103,
    }, testWallet);

    const reconstructRes = await request(app)
      .post('/attestation/reconstruct')
      .send({
        consentId: consentId2,
        workerWalletAddress: testWallet.address,
        workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
        passportId: 103,
        sourceDirectoryVersion: 1,
        evidenceUpdatedAt: referenceCutoff,
        identityAssertion: assertion,
        walletAuthorization: authReconstruct,
      });

    assert.strictEqual(reconstructRes.status, 200);
    assert.strictEqual(reconstructRes.body.reconstructed, true);

    // Verify bit-exact equality of evidenceDataHash and arrays
    assert.strictEqual(
      reconstructRes.body.snapshot.evidenceDataHash,
      attestRes.body.evidenceDataHash,
      'Reconstructed evidenceDataHash must match original attestation'
    );
    assert.deepStrictEqual(
      reconstructRes.body.snapshot.monthlyGigIncomeTotals,
      attestRes.body.monthlyGigIncomeTotals
    );
    assert.deepStrictEqual(
      reconstructRes.body.snapshot.monthlyActivity,
      attestRes.body.monthlyActivity
    );
  });

  it('MUST REJECT: unauthorized evidence reconstruction returns HTTP 401', async () => {
    const app = createUnifiedApp();

    const res = await request(app)
      .post('/attestation/reconstruct')
      .send({
        consentId: 'CONSENT_123',
        workerWalletAddress: testWallet.address,
        workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
        passportId: 103,
        sourceDirectoryVersion: 1,
        evidenceUpdatedAt: referenceCutoff,
      });

    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.error, 'AUTHENTICATION_REQUIRED');
  });

  it('Distributed HTTP mode: Attestation Service communicates with Mock FIP over network', async () => {
    const storage = new MockFIPStorage();
    const consentService = new ConsentService(storage);
    const fipService = new MockFIPService(storage, consentService);

    // Start standalone Mock FIP server on dynamic port
    const fipApp = createFipApp({ storage, consentService, fipService });
    let fipServer: Server;
    let fipPort = 0;

    await new Promise<void>((resolve) => {
      fipServer = fipApp.listen(0, () => {
        fipPort = (fipServer.address() as any).port;
        resolve();
      });
    });

    try {
      // Create Attestation app pointing to FIP HTTP base URL with trusted key
      const attestationApp = createAttestationApp({
        fipBaseUrl: `http://localhost:${fipPort}`,
        trustedFipPublicKeys: [storage.getPublicKeyPem()],
        idp: defaultMockIdp,
      });

      // 1. Create consent on FIP server
      const consentRes = await request(fipApp)
        .post('/fip/consent')
        .send({
          accountId: PERSONAS.RAMESH.accountId,
          authorizedIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
          toTimestamp: referenceCutoff,
        });

      const consentId = consentRes.body.consent.consentId;

      const assertion = defaultMockIdp.issueAssertion({
        workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
        workerWalletAddress: testWallet.address,
      });

      const auth = await signWorkerAuthorization({
        action: 'MINT_PASSPORT',
        workerWalletAddress: testWallet.address,
        consentId,
        expectedPassportId: 104,
      }, testWallet);

      // 2. Call attestation service, which calls FIP over HTTP fetch
      const attestRes = await request(attestationApp)
        .post('/attestation/attest')
        .send({
          consentId,
          workerWalletAddress: testWallet.address,
          workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
          expectedPassportId: 104,
          sourceDirectoryVersion: 2,
          cutoffTimestamp: referenceCutoff,
          identityAssertion: assertion,
          walletAuthorization: auth,
        });

      assert.strictEqual(attestRes.status, 200);
      assert.strictEqual(attestRes.body.verified, true);
      assert.strictEqual(attestRes.body.passportId, 104);
      assert.ok(attestRes.body.evidenceDataHash);
    } finally {
      await new Promise<void>((resolve) => fipServer.close(() => resolve()));
    }
  });
});
