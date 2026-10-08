/**
 * GigVault - Backend A Independent Adapter Boundaries & Lifecycle Tests
 * 
 * Verifies Backend A's independent deliverables without requiring Backend B:
 * 1. Commitment Adapter Boundary:
 *    - PoseidonEvidenceCommitmentAdapter computes exact BN254 tree commitments.
 *    - MockEvidenceCommitmentAdapter derives deterministic test scalars.
 * 2. Passport Contract Client Adapter Boundary:
 *    - MockGigPassportContract executes simulated state machine.
 *    - LiveGigPassportContractClient FAILS CLOSED when unconfigured.
 *    - Live submission of mock commitments is strictly rejected.
 * 3. Prover Boundary:
 *    - Private witness payload sanitization, array length enforcement, and range checks.
 *    - MockProverAdapter simulates proof generation for tests.
 *    - LiveProverServiceAdapter FAILS CLOSED when unconfigured.
 * 4. End-to-End HTTP Endpoints for Attestation & Lifecycle:
 *    - POST /attestation/mint-on-chain
 *    - POST /attestation/refresh-on-chain
 *    - POST /attestation/reissue-on-chain
 *    - GET  /attestation/passport/:passportId
 *    - POST /attestation/prover/handoff
 *    - POST /attestation/admin/revoke (admin auth protected)
 *    - POST /attestation/admin/authorize-reissue (admin auth protected)
 * 5. Full Lifecycle State Machine (Mint -> Refresh -> Revoke -> AuthorizeReissue -> Reissue).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { ethers } from 'ethers';

import { MockFIPStorage } from '../src/fip/storage.js';
import { ConsentService } from '../src/fip/consent-service.js';
import { MockFIPService } from '../src/fip/fip-service.js';
import { PERSONAS } from '../src/fip/personas/index.js';
import { MockIdentityProvider } from '../src/identity/mock-idp.js';
import { signWorkerAuthorization, MemoryReplayStore, ReplayProtectionRegistry } from '../src/identity/wallet-auth.js';
import { AttestationService } from '../src/evidence/attestation-service.js';
import {
  MockGigPassportContract,
  LiveGigPassportContractClient,
  LiveAdapterNotConfiguredError,
  LiveSubmissionProhibitedError,
  ExpectedIdMismatchError,
  ActivePassportExistsError,
  ReissueNotAuthorizedError,
  PassportNotActiveError,
  CommitmentUnchangedError,
  EvidenceTimestampRegressedError,
} from '../src/evidence/passport-client.js';
import {
  PoseidonEvidenceCommitmentAdapter,
  MockEvidenceCommitmentAdapter,
} from '../src/evidence/commitment-adapter.js';
import {
  buildProverWitnessPayload,
  MockProverAdapter,
  LiveProverServiceAdapter,
  LiveProverNotConfiguredError,
} from '../src/evidence/prover-boundary.js';
import { createAttestationApp } from '../src/http/attestation-app.js';
import { createUnifiedApp } from '../src/http/unified-app.js';

describe('Backend A Independent Adapter Boundaries & Lifecycle', () => {
  const adminWallet = ethers.Wallet.createRandom();
  const attesterWallet = ethers.Wallet.createRandom();
  const workerWallet = ethers.Wallet.createRandom();
  const fixedCutoff = Date.UTC(2026, 9, 8, 12, 0, 0) / 1000;

  function createSetup() {
    const idp = new MockIdentityProvider();
    const storage = new MockFIPStorage();
    const consentService = new ConsentService(storage, idp, false);
    const fipService = new MockFIPService(storage, consentService, 'MOCK_APNA_BANK_FIP_01', idp, false);
    const replayStore = new MemoryReplayStore();
    const replayRegistry = new ReplayProtectionRegistry(replayStore);
    const mockPassportContract = new MockGigPassportContract(
      adminWallet.address,
      attesterWallet.address
    );

    return {
      storage,
      idp,
      consentService,
      fipService,
      replayRegistry,
      mockPassportContract,
    };
  }

  describe('1. Commitment Adapter Boundary', () => {
    it('PoseidonEvidenceCommitmentAdapter computes valid BN254 scalar commitment', async () => {
      const { storage, idp, consentService, fipService } = createSetup();
      const poseidonAdapter = new PoseidonEvidenceCommitmentAdapter();
      assert.strictEqual(poseidonAdapter.isMockAdapter, false);

      const attestationService = new AttestationService(
        fipService,
        [storage.getPublicKeyPem()],
        idp,
        undefined,
        undefined,
        poseidonAdapter
      );

      const consent = consentService.createConsent({
        accountId: PERSONAS.RAMESH.accountId,
        authorizedIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
        durationSeconds: 3600,
        toTimestamp: fixedCutoff,
      });
      const assertion = idp.issueAssertion({
        workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
        workerWalletAddress: workerWallet.address,
      });
      const auth = await signWorkerAuthorization(
        {
          action: 'MINT_PASSPORT',
          workerWalletAddress: workerWallet.address,
          consentId: consent.consentId,
          expectedPassportId: 101,
        },
        workerWallet
      );

      const result = await attestationService.attestWorkerEvidenceWithCommitment({
        consentId: consent.consentId,
        workerWalletAddress: workerWallet.address,
        workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
        expectedPassportId: 101,
        cutoffTimestamp: fixedCutoff,
        identityAssertion: assertion,
        walletAuthorization: auth,
      });

      assert.ok(result.snapshot.evidenceCommitment, 'evidenceCommitment must be set');
      assert.ok(BigInt(result.snapshot.evidenceCommitment!) > 0n);
      const r = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
      assert.ok(BigInt(result.snapshot.evidenceCommitment!) < r, 'Commitment must be within BN254 field');
    });

    it('MockEvidenceCommitmentAdapter derives deterministic test scalar labeled as mock', async () => {
      const { storage, idp, consentService, fipService } = createSetup();
      const mockAdapter = new MockEvidenceCommitmentAdapter();
      assert.strictEqual(mockAdapter.isMockAdapter, true);

      const attestationService = new AttestationService(
        fipService,
        [storage.getPublicKeyPem()],
        idp,
        undefined,
        undefined,
        mockAdapter
      );

      const consent = consentService.createConsent({
        accountId: PERSONAS.RAMESH.accountId,
        authorizedIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
      });
      const assertion = idp.issueAssertion({
        workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
        workerWalletAddress: workerWallet.address,
      });
      const auth = await signWorkerAuthorization(
        {
          action: 'MINT_PASSPORT',
          workerWalletAddress: workerWallet.address,
          consentId: consent.consentId,
          expectedPassportId: 101,
        },
        workerWallet
      );

      const result = await attestationService.attestWorkerEvidenceWithCommitment({
        consentId: consent.consentId,
        workerWalletAddress: workerWallet.address,
        workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
        expectedPassportId: 101,
        cutoffTimestamp: fixedCutoff,
        identityAssertion: assertion,
        walletAuthorization: auth,
      });

      assert.ok(result.snapshot.evidenceCommitment);
      const res = await mockAdapter.computeCommitment(result.snapshot);
      assert.strictEqual(res.isMockCommitment, true);
    });
  });

  describe('2. Passport Contract Client Boundary & Fail-Closed Checks', () => {
    it('LiveGigPassportContractClient fails closed when unconfigured', async () => {
      const liveClient = new LiveGigPassportContractClient();
      assert.strictEqual(liveClient.isMockClient, false);

      await assert.rejects(
        async () => await liveClient.getNextPassportId(),
        LiveAdapterNotConfiguredError
      );
      await assert.rejects(
        async () => await liveClient.getPassport(1),
        LiveAdapterNotConfiguredError
      );
      await assert.rejects(
        async () =>
          await liveClient.mint(1, '0x123', '0x456', {
            commitment: '123',
            updatedAt: 12345,
            schemaVersion: 1,
            providerRef: '0x0',
            sourceDirectoryVersion: 1,
          }),
        LiveAdapterNotConfiguredError
      );
      await assert.rejects(
        async () =>
          await liveClient.refresh(1, {
            commitment: '123',
            updatedAt: 12345,
            schemaVersion: 1,
            providerRef: '0x0',
            sourceDirectoryVersion: 1,
          }),
        LiveAdapterNotConfiguredError
      );
      await assert.rejects(
        async () => await liveClient.revoke(1, 'compromised'),
        LiveAdapterNotConfiguredError
      );
      await assert.rejects(
        async () => await liveClient.authorizeReissue('0x456'),
        LiveAdapterNotConfiguredError
      );
      await assert.rejects(
        async () => await liveClient.isReissueAllowed('0x456'),
        LiveAdapterNotConfiguredError
      );
    });

    it('MUST REJECT: submitting mock commitment to live contract client fails closed', async () => {
      const { storage, idp, consentService, fipService } = createSetup();
      const liveClient = {
        isMockClient: false,
        getNextPassportId: async () => 1,
        mint: async () => 1,
      } as any;
      const mockCommitmentAdapter = new MockEvidenceCommitmentAdapter();

      const attestationService = new AttestationService(
        fipService,
        [storage.getPublicKeyPem()],
        idp,
        undefined,
        undefined,
        mockCommitmentAdapter,
        liveClient
      );

      const consent = consentService.createConsent({
        accountId: PERSONAS.RAMESH.accountId,
      });
      const assertion = idp.issueAssertion({
        workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
        workerWalletAddress: workerWallet.address,
      });
      const auth = await signWorkerAuthorization(
        {
          action: 'MINT_PASSPORT',
          workerWalletAddress: workerWallet.address,
          consentId: consent.consentId,
          expectedPassportId: 1,
        },
        workerWallet
      );

      // Should be rejected by LiveSubmissionProhibitedError
      await assert.rejects(
        async () =>
          await attestationService.attestAndMintOnChain({
            consentId: consent.consentId,
            workerWalletAddress: workerWallet.address,
            workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
            expectedPassportId: 1,
            identityAssertion: assertion,
            walletAuthorization: auth,
          }),
        LiveSubmissionProhibitedError
      );
    });
  });

  describe('3. Prover Boundary & Witness Payload Validation', () => {
    it('LiveProverServiceAdapter fails closed when unconfigured', async () => {
      const liveProver = new LiveProverServiceAdapter();
      assert.strictEqual(liveProver.isMockAdapter, false);

      const mockPayload = {
        passportId: 101,
        holderBinding: '0x123',
        evidenceCommitment: '123',
        evidenceDataHash: '0xabc',
        verifiedHistoryStartDate: 1000,
        evidenceUpdatedAt: 2000,
        sourceDirectoryVersion: 1,
        monthlyGigIncomeTotals: new Array(36).fill('0'),
        weeklyActivity: new Array(156).fill(0),
        monthlyActivity: new Array(36).fill(0),
      };

      await assert.rejects(
        async () => await liveProver.handoffWitness(mockPayload as any),
        LiveProverNotConfiguredError
      );
    });

    it('buildProverWitnessPayload validates all 36 monthly incomes and 156 weekly flags strictly', () => {
      const validSnapshot = {
        passportId: 101,
        holderBinding: '0x' + '11'.repeat(20),
        evidenceProviderId: 'MOCK_APNA_BANK_FIP_01',
        evidenceDataHash: '0x' + '22'.repeat(32),
        verifiedHistoryStartDate: 1000,
        evidenceUpdatedAt: 2000,
        sourceDirectoryVersion: 1,
        monthlyGigIncomeTotals: new Array(36).fill(2500000), // paise
        weeklyActivity: new Array(156).fill(1) as Array<0 | 1>,
        monthlyActivity: new Array(36).fill(1) as Array<0 | 1>,
      };

      const payload = buildProverWitnessPayload(validSnapshot, '987654321');
      assert.strictEqual(payload.circuitInputs.passportId, 101);
      assert.strictEqual(payload.circuitInputs.monthlyGigIncomeTotalsPaise.length, 36);
      assert.strictEqual(payload.circuitInputs.weeklyActivityFlags.length, 156);
      assert.strictEqual(payload.circuitInputs.monthlyActivityFlags.length, 36);

      // Verify rejection of malformed snapshot arrays
      assert.throws(
        () =>
          buildProverWitnessPayload(
            { ...validSnapshot, monthlyGigIncomeTotals: new Array(35).fill(100) },
            '987654321'
          ),
        /Invalid monthlyGigIncomeTotals length: expected 36/
      );

      assert.throws(
        () =>
          buildProverWitnessPayload(
            { ...validSnapshot, weeklyActivity: new Array(100).fill(1) as any },
            '987654321'
          ),
        /Invalid weeklyActivity length: expected 156/
      );

      assert.throws(
        () =>
          buildProverWitnessPayload(
            {
              ...validSnapshot,
              monthlyGigIncomeTotals: [-500, ...new Array(35).fill(100)],
            },
            '987654321'
          ),
        /must be non-negative/
      );
    });

    it('MockProverAdapter successfully accepts valid witness and returns simulated proof', async () => {
      const mockProver = new MockProverAdapter();
      assert.strictEqual(mockProver.isMockAdapter, true);

      const validSnapshot = {
        passportId: 101,
        holderBinding: '0x' + '11'.repeat(20),
        evidenceProviderId: 'MOCK_APNA_BANK_FIP_01',
        evidenceDataHash: '0x' + '22'.repeat(32),
        verifiedHistoryStartDate: 1000,
        evidenceUpdatedAt: 2000,
        sourceDirectoryVersion: 1,
        monthlyGigIncomeTotals: new Array(36).fill(0),
        weeklyActivity: new Array(156).fill(0) as Array<0 | 1>,
        monthlyActivity: new Array(36).fill(0) as Array<0 | 1>,
      };

      const payload = buildProverWitnessPayload(validSnapshot, '987654321');
      const result = await mockProver.handoffWitness(payload);
      assert.strictEqual(result.success, true);
      assert.ok(result.simulatedProof);
      assert.strictEqual(result.simulatedProof.protocol, 'groth16');
    });
  });

  describe('4. Full State Machine Lifecycle (Mint -> Refresh -> Revoke -> Reissue)', () => {
    it('executes full passport lifecycle with atomic state transitions and role checks', async () => {
      const { storage, idp, consentService, fipService, mockPassportContract } = createSetup();
      const commitmentAdapter = new PoseidonEvidenceCommitmentAdapter();

      const attestationService = new AttestationService(
        fipService,
        [storage.getPublicKeyPem()],
        idp,
        undefined,
        undefined,
        commitmentAdapter,
        mockPassportContract
      );

      // Step A: Initial Mint
      const consent1 = consentService.createConsent({
        accountId: PERSONAS.RAMESH.accountId,
        toTimestamp: fixedCutoff,
      });
      const assertion1 = idp.issueAssertion({
        workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
        workerWalletAddress: workerWallet.address,
      });
      const authMint = await signWorkerAuthorization(
        {
          action: 'MINT_PASSPORT',
          workerWalletAddress: workerWallet.address,
          consentId: consent1.consentId,
          expectedPassportId: 1,
        },
        workerWallet
      );

      const mintResult = await attestationService.attestAndMintOnChain({
        consentId: consent1.consentId,
        workerWalletAddress: workerWallet.address,
        workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
        expectedPassportId: 1,
        cutoffTimestamp: fixedCutoff,
        identityAssertion: assertion1,
        walletAuthorization: authMint,
      });

      assert.strictEqual(mintResult.passportId, 1);
      const passportAfterMint = await mockPassportContract.getPassport(1);
      assert.ok(passportAfterMint);
      assert.strictEqual(passportAfterMint.status, 'ACTIVE');
      assert.strictEqual(passportAfterMint.evidenceVersion, 1);

      // Step B: Duplicate Mint must fail
      const consentDup = consentService.createConsent({
        accountId: PERSONAS.RAMESH.accountId,
        toTimestamp: fixedCutoff,
      });
      const assertionDup = idp.issueAssertion({
        workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
        workerWalletAddress: workerWallet.address,
      });
      const authDup = await signWorkerAuthorization(
        {
          action: 'MINT_PASSPORT',
          workerWalletAddress: workerWallet.address,
          consentId: consentDup.consentId,
          expectedPassportId: 2,
        },
        workerWallet
      );

      await assert.rejects(
        async () =>
          await attestationService.attestAndMintOnChain({
            consentId: consentDup.consentId,
            workerWalletAddress: workerWallet.address,
            workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
            expectedPassportId: 2,
            identityAssertion: assertionDup,
            walletAuthorization: authDup,
          }),
        ActivePassportExistsError
      );

      // Step C: Evidence Refresh with advanced cutoff
      const advancedCutoff = fixedCutoff + 86400 * 30; // 30 days later
      const consentRefresh = consentService.createConsent({
        accountId: PERSONAS.RAMESH.accountId,
        toTimestamp: advancedCutoff,
      });
      const assertionRefresh = idp.issueAssertion({
        workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
        workerWalletAddress: workerWallet.address,
      });
      const authRefresh = await signWorkerAuthorization(
        {
          action: 'REFRESH_PASSPORT',
          workerWalletAddress: workerWallet.address,
          consentId: consentRefresh.consentId,
          expectedPassportId: 1,
        },
        workerWallet
      );

      // Add a transaction to Ramesh to produce a new commitment
      storage.getTransactions(PERSONAS.RAMESH.accountId).push({
        txnId: 'TXN_RAMESH_NEW_MONTH_01',
        timestamp: advancedCutoff - 3600,
        amountMinor: 3500000,
        currency: 'INR',
        direction: 'CREDIT',
        rail: 'IMPS',
        reference: 'RRN_REF_NEW_01',
        narration: 'Swiggy Delivery Payout',
        remitter: { name: 'Bundl Technologies Pvt Ltd' },
      });

      const refreshResult = await attestationService.refreshPassportEvidenceOnChain(
        {
          consentId: consentRefresh.consentId,
          workerWalletAddress: workerWallet.address,
          workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
          expectedPassportId: 1,
          cutoffTimestamp: advancedCutoff,
          identityAssertion: assertionRefresh,
          walletAuthorization: authRefresh,
        },
        1
      );

      assert.strictEqual(refreshResult.passportId, 1);
      const passportAfterRefresh = await mockPassportContract.getPassport(1);
      assert.strictEqual(passportAfterRefresh?.evidenceVersion, 2);
      assert.strictEqual(passportAfterRefresh?.evidenceUpdatedAt, advancedCutoff);

      // Step D: Administrative Revocation
      await attestationService.revokePassportOnChain(1, 'Device compromised', adminWallet.address);
      const passportAfterRevoke = await mockPassportContract.getPassport(1);
      assert.strictEqual(passportAfterRevoke?.status, 'REVOKED');

      // Attempting to refresh a revoked passport must fail
      const authRefreshRevoked = await signWorkerAuthorization(
        {
          action: 'REFRESH_PASSPORT',
          workerWalletAddress: workerWallet.address,
          consentId: consentRefresh.consentId,
          expectedPassportId: 1,
        },
        workerWallet
      );
      await assert.rejects(
        async () =>
          await attestationService.refreshPassportEvidenceOnChain(
            {
              consentId: consentRefresh.consentId,
              workerWalletAddress: workerWallet.address,
              workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
              expectedPassportId: 1,
              identityAssertion: assertionRefresh,
              walletAuthorization: authRefreshRevoked,
            },
            1
          ),
        PassportNotActiveError
      );

      // Step E: Reissue without admin authorization must fail
      const consentReissue = consentService.createConsent({
        accountId: PERSONAS.RAMESH.accountId,
        toTimestamp: advancedCutoff,
      });
      const assertionReissue = idp.issueAssertion({
        workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
        workerWalletAddress: workerWallet.address,
      });
      const authReissue = await signWorkerAuthorization(
        {
          action: 'REISSUE_PASSPORT',
          workerWalletAddress: workerWallet.address,
          consentId: consentReissue.consentId,
          expectedPassportId: 2,
        },
        workerWallet
      );

      await assert.rejects(
        async () =>
          await attestationService.reissuePassportOnChain({
            consentId: consentReissue.consentId,
            workerWalletAddress: workerWallet.address,
            workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
            expectedPassportId: 2,
            identityAssertion: assertionReissue,
            walletAuthorization: authReissue,
          }),
        ReissueNotAuthorizedError
      );

      // Step F: Admin authorizes reissue
      await attestationService.authorizeReissueOnChain(
        PERSONAS.RAMESH.identityNullifierHash,
        adminWallet.address
      );
      assert.strictEqual(
        await mockPassportContract.isReissueAllowed(PERSONAS.RAMESH.identityNullifierHash),
        true
      );

      // Fresh authorization for reissue
      const authReissueFresh = await signWorkerAuthorization(
        {
          action: 'REISSUE_PASSPORT',
          workerWalletAddress: workerWallet.address,
          consentId: consentReissue.consentId,
          expectedPassportId: 2,
        },
        workerWallet
      );

      const reissueResult = await attestationService.reissuePassportOnChain({
        consentId: consentReissue.consentId,
        workerWalletAddress: workerWallet.address,
        workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
        expectedPassportId: 2,
        cutoffTimestamp: advancedCutoff,
        identityAssertion: assertionReissue,
        walletAuthorization: authReissueFresh,
      });

      assert.strictEqual(reissueResult.passportId, 2);
      const passport2 = await mockPassportContract.getPassport(2);
      assert.strictEqual(passport2?.status, 'ACTIVE');

      // Reissue authorization must be consumed
      assert.strictEqual(
        await mockPassportContract.isReissueAllowed(PERSONAS.RAMESH.identityNullifierHash),
        false
      );
    });
  });

  describe('5. HTTP Integration: On-chain Endpoints & Admin Controls', () => {
    it('executes /attestation/mint-on-chain, /refresh-on-chain, /admin/revoke, and /reissue-on-chain', async () => {
      const { storage, idp, consentService, fipService, mockPassportContract } = createSetup();
      const commitmentAdapter = new PoseidonEvidenceCommitmentAdapter();
      const adminApiKey = 'secret-admin-key-2026';

      const app = createAttestationApp({
        fipService,
        trustedFipPublicKeys: [storage.getPublicKeyPem()],
        idp,
        commitmentAdapter,
        passportContract: mockPassportContract,
        adminApiKey,
      });

      // 1. Mint via HTTP
      const consent1 = consentService.createConsent({
        accountId: PERSONAS.RAMESH.accountId,
        toTimestamp: fixedCutoff,
      });
      const assertion1 = idp.issueAssertion({
        workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
        workerWalletAddress: workerWallet.address,
      });
      const auth1 = await signWorkerAuthorization(
        {
          action: 'MINT_PASSPORT',
          workerWalletAddress: workerWallet.address,
          consentId: consent1.consentId,
          expectedPassportId: 1,
        },
        workerWallet
      );

      const mintRes = await request(app)
        .post('/attestation/mint-on-chain')
        .send({
          consentId: consent1.consentId,
          workerWalletAddress: workerWallet.address,
          workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
          expectedPassportId: 1,
          cutoffTimestamp: fixedCutoff,
          identityAssertion: assertion1,
          walletAuthorization: auth1,
        });

      assert.strictEqual(mintRes.status, 200);
      assert.strictEqual(mintRes.body.success, true);
      assert.strictEqual(mintRes.body.passportId, 1);
      assert.ok(mintRes.body.evidenceCommitment);

      // 2. Read passport via GET /attestation/passport/:id
      const getRes = await request(app).get('/attestation/passport/1');
      assert.strictEqual(getRes.status, 200);
      assert.strictEqual(getRes.body.passport.status, 'ACTIVE');

      // 3. Admin revocation: rejected without admin API key
      const unauthRevokeRes = await request(app)
        .post('/attestation/admin/revoke')
        .send({ passportId: 1, reason: 'Test compromise' });
      assert.strictEqual(unauthRevokeRes.status, 403);

      // Admin revocation: success with admin API key
      const authRevokeRes = await request(app)
        .post('/attestation/admin/revoke')
        .set('x-admin-key', adminApiKey)
        .send({ passportId: 1, reason: 'Test compromise' });
      assert.strictEqual(authRevokeRes.status, 200);
      assert.strictEqual(authRevokeRes.body.status, 'REVOKED');

      // Verify passport status changed to REVOKED
      const getRevokedRes = await request(app).get('/attestation/passport/1');
      assert.strictEqual(getRevokedRes.body.passport.status, 'REVOKED');

      // 4. Admin authorize reissue
      const authReissueRes = await request(app)
        .post('/attestation/admin/authorize-reissue')
        .set('x-admin-key', adminApiKey)
        .send({ identityNullifier: PERSONAS.RAMESH.identityNullifierHash });
      assert.strictEqual(authReissueRes.status, 200);
      assert.strictEqual(authReissueRes.body.reissueAuthorized, true);

      // 5. Reissue via HTTP
      const consent2 = consentService.createConsent({
        accountId: PERSONAS.RAMESH.accountId,
        toTimestamp: fixedCutoff,
      });
      const assertion2 = idp.issueAssertion({
        workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
        workerWalletAddress: workerWallet.address,
      });
      const auth2 = await signWorkerAuthorization(
        {
          action: 'REISSUE_PASSPORT',
          workerWalletAddress: workerWallet.address,
          consentId: consent2.consentId,
          expectedPassportId: 2,
        },
        workerWallet
      );

      const reissueRes = await request(app)
        .post('/attestation/reissue-on-chain')
        .send({
          consentId: consent2.consentId,
          workerWalletAddress: workerWallet.address,
          workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
          expectedPassportId: 2,
          cutoffTimestamp: fixedCutoff,
          identityAssertion: assertion2,
          walletAuthorization: auth2,
        });

      assert.strictEqual(reissueRes.status, 200);
      assert.strictEqual(reissueRes.body.passportId, 2);

      // 6. Prover handoff endpoint
      const consent3 = consentService.createConsent({
        accountId: PERSONAS.RAMESH.accountId,
        toTimestamp: fixedCutoff,
      });
      const assertion3 = idp.issueAssertion({
        workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
        workerWalletAddress: workerWallet.address,
      });
      const authHandoff = await signWorkerAuthorization(
        {
          action: 'RECONSTRUCT_EVIDENCE',
          workerWalletAddress: workerWallet.address,
          consentId: consent3.consentId,
          expectedPassportId: 2,
        },
        workerWallet
      );

      const handoffRes = await request(app)
        .post('/attestation/prover/handoff')
        .send({
          consentId: consent3.consentId,
          workerWalletAddress: workerWallet.address,
          workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
          passportId: 2,
          evidenceUpdatedAt: fixedCutoff,
          sourceDirectoryVersion: 1,
          identityAssertion: assertion3,
          walletAuthorization: authHandoff,
        });

      assert.strictEqual(handoffRes.status, 200);
      assert.strictEqual(handoffRes.body.handoff.success, true);
    });

    it('returns HTTP 503 LIVE_ADAPTER_NOT_CONFIGURED when live contract client is not configured', async () => {
      const { storage, idp, consentService, fipService } = createSetup();
      const liveUnconfiguredClient = new LiveGigPassportContractClient();

      const app = createAttestationApp({
        fipService,
        trustedFipPublicKeys: [storage.getPublicKeyPem()],
        idp,
        passportContract: liveUnconfiguredClient,
      });

      const consent = consentService.createConsent({
        accountId: PERSONAS.RAMESH.accountId,
        toTimestamp: fixedCutoff,
      });
      const assertion = idp.issueAssertion({
        workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
        workerWalletAddress: workerWallet.address,
      });
      const auth = await signWorkerAuthorization(
        {
          action: 'MINT_PASSPORT',
          workerWalletAddress: workerWallet.address,
          consentId: consent.consentId,
          expectedPassportId: 101,
        },
        workerWallet
      );

      const res = await request(app)
        .post('/attestation/mint-on-chain')
        .send({
          consentId: consent.consentId,
          workerWalletAddress: workerWallet.address,
          workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
          expectedPassportId: 101,
          identityAssertion: assertion,
          walletAuthorization: auth,
        });

      assert.strictEqual(res.status, 503);
      assert.strictEqual(res.body.error, 'LIVE_ADAPTER_NOT_CONFIGURED');
    });
  });
});
