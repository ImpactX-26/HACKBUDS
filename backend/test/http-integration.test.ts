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
import type { WorkerActionType } from '../src/identity/types.js';

describe('HTTP Interfaces & Attestation Pipeline Integration', () => {
  const referenceCutoff = Date.UTC(2026, 9, 8, 12, 0, 0) / 1000;
  const testWallet = ethers.Wallet.createRandom();

  async function createValidWorkerAuth(
    persona = PERSONAS.RAMESH,
    wallet = testWallet,
    action: WorkerActionType = 'CREATE_CONSENT',
    targetId = persona.accountId,
    expectedPassportId = 0
  ) {
    defaultMockIdp.rebindWorkerWallet(persona.identityNullifierHash, wallet.address);
    const assertion = defaultMockIdp.issueAssertion({
      workerIdentityNullifier: persona.identityNullifierHash,
      workerWalletAddress: wallet.address,
      durationSeconds: 3600,
    });

    const auth = await signWorkerAuthorization(
      {
        action,
        workerWalletAddress: wallet.address,
        consentId: targetId,
        expectedPassportId,
      },
      wallet
    );

    return { assertion, auth };
  }

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
    const { assertion, auth } = await createValidWorkerAuth(
      PERSONAS.RAMESH,
      testWallet,
      'CREATE_CONSENT',
      PERSONAS.RAMESH.accountId
    );

    // 1. Create consent with valid worker authentication
    const consentRes = await request(app)
      .post('/fip/consent')
      .send({
        accountId: PERSONAS.RAMESH.accountId,
        durationSeconds: 3600,
        toTimestamp: referenceCutoff,
        identityAssertion: assertion,
        walletAuthorization: auth,
      });

    assert.strictEqual(consentRes.status, 201);
    assert.strictEqual(consentRes.body.success, true);
    const consentId = consentRes.body.consent.consentId;
    assert.ok(consentId.startsWith('CONSENT_'));

    // 2. Inspect consent
    const inspectRes = await request(app).get(`/fip/consent/${consentId}`);
    assert.strictEqual(inspectRes.status, 200);
    assert.strictEqual(inspectRes.body.consent.status, 'ACTIVE');

    // 3. Server-to-server fetch signed data with valid authorization headers
    const fetchAuth = await signWorkerAuthorization(
      {
        action: 'FETCH_FINANCIAL_DATA',
        workerWalletAddress: testWallet.address,
        consentId,
        expectedPassportId: 0,
      },
      testWallet
    );

    const dataRes = await request(app)
      .get(`/fip/data/${consentId}`)
      .set('x-identity-assertion', JSON.stringify(assertion))
      .set('x-wallet-authorization', JSON.stringify(fetchAuth));

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

    // Attacker (Arjun) signs with valid credentials for his own identity/wallet,
    // but tries to create consent for Ramesh's account
    const arjunWallet = ethers.Wallet.createRandom();
    const { assertion: arjunAssertion, auth: arjunAuth } = await createValidWorkerAuth(
      PERSONAS.ARJUN,
      arjunWallet,
      'CREATE_CONSENT',
      PERSONAS.RAMESH.accountId
    );

    const consentRes = await request(app)
      .post('/fip/consent')
      .send({
        accountId: PERSONAS.RAMESH.accountId, // Wrong owner!
        durationSeconds: 3600,
        identityAssertion: arjunAssertion,
        walletAuthorization: arjunAuth,
      });

    assert.strictEqual(consentRes.status, 403);
    assert.strictEqual(consentRes.body.error, 'UNAUTHORIZED_CONSENT_CREATION');
  });

  it('MUST REJECT: consent expiration returns HTTP 410 over /fip/data/:consentId', async () => {
    const storage = new MockFIPStorage();
    const consentService = new ConsentService(storage);
    const fipService = new MockFIPService(storage, consentService);

    const { assertion, auth } = await createValidWorkerAuth(
      PERSONAS.RAMESH,
      testWallet,
      'CREATE_CONSENT',
      PERSONAS.RAMESH.accountId
    );

    // Create consent that expires in 0 seconds
    const consent = consentService.createConsent({
      accountId: PERSONAS.RAMESH.accountId,
      durationSeconds: -1, // Expired immediately
      identityAssertion: assertion,
      walletAuthorization: auth,
    });

    const app = createUnifiedApp({ storage, consentService, fipService });
    const fetchAuth = await signWorkerAuthorization(
      {
        action: 'FETCH_FINANCIAL_DATA',
        workerWalletAddress: testWallet.address,
        consentId: consent.consentId,
        expectedPassportId: 0,
      },
      testWallet
    );

    const dataRes = await request(app)
      .get(`/fip/data/${consent.consentId}`)
      .set('x-identity-assertion', JSON.stringify(assertion))
      .set('x-wallet-authorization', JSON.stringify(fetchAuth));

    assert.strictEqual(dataRes.status, 410);
    assert.strictEqual(dataRes.body.error, 'FIP_CONSENT_EXPIRED');
  });

  it('MUST REJECT: revoked consent returns HTTP 403 over /fip/data/:consentId', async () => {
    const app = createUnifiedApp();
    const { assertion, auth } = await createValidWorkerAuth(
      PERSONAS.RAMESH,
      testWallet,
      'CREATE_CONSENT',
      PERSONAS.RAMESH.accountId
    );

    const consentRes = await request(app)
      .post('/fip/consent')
      .send({
        accountId: PERSONAS.RAMESH.accountId,
        durationSeconds: 3600,
        identityAssertion: assertion,
        walletAuthorization: auth,
      });

    const consentId = consentRes.body.consent.consentId;

    // Revoke consent
    const revokeRes = await request(app).post(`/fip/consent/${consentId}/revoke`);
    assert.strictEqual(revokeRes.status, 200);
    assert.strictEqual(revokeRes.body.consent.status, 'REVOKED');

    // Fetch should fail with 403 FIP_CONSENT_REVOKED
    const fetchAuth = await signWorkerAuthorization(
      {
        action: 'FETCH_FINANCIAL_DATA',
        workerWalletAddress: testWallet.address,
        consentId,
        expectedPassportId: 0,
      },
      testWallet
    );

    const dataRes = await request(app)
      .get(`/fip/data/${consentId}`)
      .set('x-identity-assertion', JSON.stringify(assertion))
      .set('x-wallet-authorization', JSON.stringify(fetchAuth));

    assert.strictEqual(dataRes.status, 403);
    assert.strictEqual(dataRes.body.error, 'FIP_CONSENT_REVOKED');
  });

  it('MUST REJECT: missing authentication artifacts to /fip/consent returns HTTP 401', async () => {
    const app = createUnifiedApp();
    const res = await request(app)
      .post('/fip/consent')
      .send({
        accountId: PERSONAS.RAMESH.accountId,
      });

    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.error, 'AUTHENTICATION_REQUIRED');
  });

  it('MUST REJECT: forged identity assertion signed by untrusted IDP to /fip/consent returns HTTP 401', async () => {
    const app = createUnifiedApp();
    const rogueIdp = new MockIdentityProvider();
    const forgedAssertion = rogueIdp.issueAssertion({
      workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
      workerWalletAddress: testWallet.address,
    });

    const auth = await signWorkerAuthorization(
      {
        action: 'CREATE_CONSENT',
        workerWalletAddress: testWallet.address,
        consentId: PERSONAS.RAMESH.accountId,
        expectedPassportId: 0,
      },
      testWallet
    );

    const res = await request(app)
      .post('/fip/consent')
      .send({
        accountId: PERSONAS.RAMESH.accountId,
        identityAssertion: forgedAssertion,
        walletAuthorization: auth,
      });

    assert.strictEqual(res.status, 400);
    assert.ok(res.body.error.includes('Untrusted identity provider public key'));
  });

  it('MUST REJECT: forged wallet authorization signed by attacker wallet to /fip/consent returns HTTP 400', async () => {
    const app = createUnifiedApp();
    const attackerWallet = ethers.Wallet.createRandom();
    const { assertion } = await createValidWorkerAuth(
      PERSONAS.RAMESH,
      testWallet,
      'CREATE_CONSENT',
      PERSONAS.RAMESH.accountId
    );

    // Signed by attackerWallet but claims to be testWallet
    const forgedAuth = await signWorkerAuthorization(
      {
        action: 'CREATE_CONSENT',
        workerWalletAddress: testWallet.address,
        consentId: PERSONAS.RAMESH.accountId,
        expectedPassportId: 0,
      },
      attackerWallet
    );

    const res = await request(app)
      .post('/fip/consent')
      .send({
        accountId: PERSONAS.RAMESH.accountId,
        identityAssertion: assertion,
        walletAuthorization: forgedAuth,
      });

    assert.strictEqual(res.status, 400);
    assert.ok(res.body.error.includes('Worker authorization signer mismatch'));
  });

  it('MUST REJECT: forged identity assertion signed by untrusted IDP to /attestation/attest returns HTTP 403', async () => {
    const app = createUnifiedApp();
    const { assertion: consentAssertion, auth: consentAuth } = await createValidWorkerAuth(
      PERSONAS.RAMESH,
      testWallet,
      'CREATE_CONSENT',
      PERSONAS.RAMESH.accountId
    );

    const consentRes = await request(app)
      .post('/fip/consent')
      .send({
        accountId: PERSONAS.RAMESH.accountId,
        identityAssertion: consentAssertion,
        walletAuthorization: consentAuth,
      });

    const consentId = consentRes.body.consent.consentId;

    const rogueIdp = new MockIdentityProvider();
    const forgedAssertion = rogueIdp.issueAssertion({
      workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
      workerWalletAddress: testWallet.address,
    });

    const auth = await signWorkerAuthorization(
      {
        action: 'MINT_PASSPORT',
        workerWalletAddress: testWallet.address,
        consentId,
        expectedPassportId: 105,
      },
      testWallet
    );

    const res = await request(app)
      .post('/attestation/attest')
      .send({
        consentId,
        workerWalletAddress: testWallet.address,
        workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
        expectedPassportId: 105,
        identityAssertion: forgedAssertion,
        walletAuthorization: auth,
      });

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.error, 'IDENTITY_ASSERTION_INVALID');
  });

  it('MUST REJECT: tampered wallet authorization to /attestation/attest returns HTTP 401', async () => {
    const app = createUnifiedApp();
    const { assertion: consentAssertion, auth: consentAuth } = await createValidWorkerAuth(
      PERSONAS.RAMESH,
      testWallet,
      'CREATE_CONSENT',
      PERSONAS.RAMESH.accountId
    );

    const consentRes = await request(app)
      .post('/fip/consent')
      .send({
        accountId: PERSONAS.RAMESH.accountId,
        identityAssertion: consentAssertion,
        walletAuthorization: consentAuth,
      });

    const consentId = consentRes.body.consent.consentId;

    const assertion = defaultMockIdp.issueAssertion({
      workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
      workerWalletAddress: testWallet.address,
    });

    const attackerWallet = ethers.Wallet.createRandom();
    const forgedAuth = await signWorkerAuthorization(
      {
        action: 'MINT_PASSPORT',
        workerWalletAddress: testWallet.address,
        consentId,
        expectedPassportId: 106,
      },
      attackerWallet
    );

    const res = await request(app)
      .post('/attestation/attest')
      .send({
        consentId,
        workerWalletAddress: testWallet.address,
        workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
        expectedPassportId: 106,
        identityAssertion: assertion,
        walletAuthorization: forgedAuth,
      });

    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.error, 'WALLET_AUTHORIZATION_INVALID');
  });

  it('MUST REJECT: missing or forged auth headers to /fip/data/:consentId returns HTTP 401 or 403', async () => {
    const app = createUnifiedApp();
    const { assertion, auth } = await createValidWorkerAuth(
      PERSONAS.RAMESH,
      testWallet,
      'CREATE_CONSENT',
      PERSONAS.RAMESH.accountId
    );

    const consentRes = await request(app)
      .post('/fip/consent')
      .send({
        accountId: PERSONAS.RAMESH.accountId,
        identityAssertion: assertion,
        walletAuthorization: auth,
      });

    const consentId = consentRes.body.consent.consentId;

    // 1. Missing headers -> HTTP 401
    const noHeaderRes = await request(app).get(`/fip/data/${consentId}`);
    assert.strictEqual(noHeaderRes.status, 401);

    // 2. Attacker credentials (wrong wallet/identity) -> HTTP 403
    const attackerWallet = ethers.Wallet.createRandom();
    const { assertion: attAssertion, auth: attAuth } = await createValidWorkerAuth(
      PERSONAS.ARJUN,
      attackerWallet,
      'FETCH_FINANCIAL_DATA',
      consentId
    );

    const forgedRes = await request(app)
      .get(`/fip/data/${consentId}`)
      .set('x-identity-assertion', JSON.stringify(attAssertion))
      .set('x-wallet-authorization', JSON.stringify(attAuth));

    assert.strictEqual(forgedRes.status, 403);
    assert.strictEqual(forgedRes.body.error, 'UNAUTHORIZED_FIP_RETRIEVAL');
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
    const { assertion, auth } = await createValidWorkerAuth(
      PERSONAS.RAMESH,
      testWallet,
      'CREATE_CONSENT',
      PERSONAS.RAMESH.accountId
    );

    // 1. Create consent with valid auth
    const consentRes = await request(app)
      .post('/fip/consent')
      .send({
        accountId: PERSONAS.RAMESH.accountId,
        identityAssertion: assertion,
        walletAuthorization: auth,
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
    const { assertion: consentAssertion, auth: consentAuth } = await createValidWorkerAuth(
      PERSONAS.RAMESH,
      testWallet,
      'CREATE_CONSENT',
      PERSONAS.RAMESH.accountId
    );

    // 1. Worker authorizes consent
    const consentRes = await request(app)
      .post('/fip/consent')
      .send({
        accountId: PERSONAS.RAMESH.accountId,
        durationSeconds: 3600,
        toTimestamp: referenceCutoff,
        identityAssertion: consentAssertion,
        walletAuthorization: consentAuth,
      });

    const consentId = consentRes.body.consent.consentId;

    // 2. Create valid identity assertion and wallet authorization for minting
    const assertion = defaultMockIdp.issueAssertion({
      workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
      workerWalletAddress: testWallet.address,
      durationSeconds: 3600,
    });

    const auth = await signWorkerAuthorization(
      {
        action: 'MINT_PASSPORT',
        workerWalletAddress: testWallet.address,
        consentId,
        expectedPassportId: 101,
      },
      testWallet
    );

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
    const arjunWallet = ethers.Wallet.createRandom();

    // Arjun creates consent for his account with valid auth
    const { assertion: arjunAssertion, auth: arjunAuth } = await createValidWorkerAuth(
      PERSONAS.ARJUN,
      arjunWallet,
      'CREATE_CONSENT',
      PERSONAS.ARJUN.accountId
    );

    const consentRes = await request(app)
      .post('/fip/consent')
      .send({
        accountId: PERSONAS.ARJUN.accountId,
        identityAssertion: arjunAssertion,
        walletAuthorization: arjunAuth,
      });

    const consentId = consentRes.body.consent.consentId;

    // Caller gets assertion for Ramesh's identity
    const assertion = defaultMockIdp.issueAssertion({
      workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
      workerWalletAddress: testWallet.address,
    });

    const auth = await signWorkerAuthorization(
      {
        action: 'MINT_PASSPORT',
        workerWalletAddress: testWallet.address,
        consentId,
        expectedPassportId: 102,
      },
      testWallet
    );

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
    assert.ok(
      attestRes.body.message.includes('Account owner binding mismatch') ||
      attestRes.body.message.includes('UnauthorizedFIPRetrieval')
    );
  });

  it('POST /attestation/reconstruct securely reconstructs snapshot for authorized worker', async () => {
    const app = createUnifiedApp();
    const { assertion: consentAssertion, auth: consentAuth } = await createValidWorkerAuth(
      PERSONAS.RAMESH,
      testWallet,
      'CREATE_CONSENT',
      PERSONAS.RAMESH.accountId
    );

    // 1. Initial consent
    const consent1 = await request(app)
      .post('/fip/consent')
      .send({
        accountId: PERSONAS.RAMESH.accountId,
        toTimestamp: referenceCutoff,
        identityAssertion: consentAssertion,
        walletAuthorization: consentAuth,
      });

    const consentId1 = consent1.body.consent.consentId;

    const assertion = defaultMockIdp.issueAssertion({
      workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
      workerWalletAddress: testWallet.address,
    });

    const auth1 = await signWorkerAuthorization(
      {
        action: 'MINT_PASSPORT',
        workerWalletAddress: testWallet.address,
        consentId: consentId1,
        expectedPassportId: 103,
      },
      testWallet
    );

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
    const { assertion: cAssert2, auth: cAuth2 } = await createValidWorkerAuth(
      PERSONAS.RAMESH,
      testWallet,
      'CREATE_CONSENT',
      PERSONAS.RAMESH.accountId
    );

    const consent2 = await request(app)
      .post('/fip/consent')
      .send({
        accountId: PERSONAS.RAMESH.accountId,
        toTimestamp: referenceCutoff,
        identityAssertion: cAssert2,
        walletAuthorization: cAuth2,
      });

    const consentId2 = consent2.body.consent.consentId;

    // Reconstruction requires RECONSTRUCT_EVIDENCE action signed by worker
    const authReconstruct = await signWorkerAuthorization(
      {
        action: 'RECONSTRUCT_EVIDENCE',
        workerWalletAddress: testWallet.address,
        consentId: consentId2,
        expectedPassportId: 103,
      },
      testWallet
    );

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

      const { assertion: consentAssertion, auth: consentAuth } = await createValidWorkerAuth(
        PERSONAS.RAMESH,
        testWallet,
        'CREATE_CONSENT',
        PERSONAS.RAMESH.accountId
      );

      // 1. Create consent on FIP server with valid auth
      const consentRes = await request(fipApp)
        .post('/fip/consent')
        .send({
          accountId: PERSONAS.RAMESH.accountId,
          toTimestamp: referenceCutoff,
          identityAssertion: consentAssertion,
          walletAuthorization: consentAuth,
        });

      const consentId = consentRes.body.consent.consentId;

      const assertion = defaultMockIdp.issueAssertion({
        workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
        workerWalletAddress: testWallet.address,
      });

      const auth = await signWorkerAuthorization(
        {
          action: 'MINT_PASSPORT',
          workerWalletAddress: testWallet.address,
          consentId,
          expectedPassportId: 104,
        },
        testWallet
      );

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
