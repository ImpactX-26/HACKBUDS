/**
 * GigVault - Attestation Service Orchestrator
 * 
 * Orchestrates the full authenticated attestation and on-chain issuance pipeline:
 * 1. Validates Tripartite Authentication:
 *    - Worker wallet control via signed authorization
 *    - Verified identity assertion from Mock IDP (Anon Aadhaar simulated)
 *    - Bank account-owner identity binding from Mock FIP
 * 2. Fetches signed data directly server-to-server from Mock FIP
 * 3. Classifies transactions against versioned payout directory
 * 4. Derives completed 36-month / 156-week EvidenceSnapshot transiently
 * 5. Interacts with GigPassport contract via dedicated ATTESTER_ROLE with
 *    atomic sequential ID contention retry.
 * 
 * Zero-persistence guarantee:
 * Never persists raw bank records or plaintext EvidenceSnapshot to disk or database.
 */

import { FIPVerifier } from './fip-verifier.js';
import { EvidenceSnapshotBuilder, type EvidenceSnapshot } from './snapshot-builder.js';
import type { MockFIPService } from '../fip/fip-service.js';
import { CURRENT_DIRECTORY_VERSION, getDirectoryForVersion } from './directory/registry.js';
import type { VerifiedIdentityAssertion, WorkerWalletAuthorization, WorkerActionType } from '../identity/types.js';
import { MockIdentityProvider, defaultMockIdp } from '../identity/mock-idp.js';
import { verifyWorkerAuthorization, ReplayProtectionRegistry, defaultReplayRegistry } from '../identity/wallet-auth.js';
import {
  type IGigPassportClient,
  type EvidenceCommitmentData,
  LiveAdapterNotConfiguredError,
  LiveSubmissionProhibitedError,
  ExpectedIdMismatchError,
  ReissueNotAuthorizedError,
} from './passport-client.js';
import {
  type IEvidenceCommitmentAdapter,
  type CommitmentResult,
  defaultCommitmentAdapter,
} from './commitment-adapter.js';
import {
  type ITrustedProverAdapter,
  defaultProverAdapter,
  buildProverWitnessPayload,
  type ProverHandoffResult,
} from './prover-boundary.js';

/**
 * Current approved evidence schema version for on-chain commitments.
 * Schema 2 represents the aligned v0.2.0 profile (gv-poseidon-hash-only-0.2.0) over BN254 Fr.
 */
export const CURRENT_EVIDENCE_SCHEMA_VERSION = 2;

export interface AttestationRequest {
  consentId: string;
  workerWalletAddress: string;
  workerIdentityNullifier: string;
  expectedPassportId: number;
  sourceDirectoryVersion?: number;
  cutoffTimestamp?: number;
  // Cryptographic identity & authorization artifacts (MANDATORY in fail-closed design)
  identityAssertion: VerifiedIdentityAssertion;
  walletAuthorization: WorkerWalletAuthorization;
}

export interface AttestationResult {
  verified: boolean;
  passportId: number;
  holderBinding: string;
  identityNullifierHash: string;
  evidenceProviderId: string;
  evidenceDataHash: string;
  verifiedHistoryStartDate: number;
  evidenceUpdatedAt: number;
  sourceDirectoryVersion: number;
  monthlyGigIncomeTotals: number[];
  weeklyActivity: Array<0 | 1>;
  monthlyActivity: Array<0 | 1>;
  snapshot: EvidenceSnapshot;
}

export interface ReconstructEvidenceRequest {
  consentId: string;
  workerWalletAddress: string;
  workerIdentityNullifier: string;
  passportId: number;
  evidenceUpdatedAt: number;
  sourceDirectoryVersion: number;
  identityAssertion: VerifiedIdentityAssertion;
  walletAuthorization: WorkerWalletAuthorization;
}

export class AttestationService {
  private fipService: MockFIPService;
  private fipVerifier: FIPVerifier;
  private idp: MockIdentityProvider;
  private replayRegistry: ReplayProtectionRegistry;
  private expectedChainId?: number;
  private commitmentAdapter: IEvidenceCommitmentAdapter;
  private passportContract?: IGigPassportClient;

  constructor(
    fipService: MockFIPService,
    trustedFipPublicKeys?: string[],
    idp: MockIdentityProvider = defaultMockIdp,
    replayRegistry: ReplayProtectionRegistry = defaultReplayRegistry,
    expectedChainId?: number,
    commitmentAdapter: IEvidenceCommitmentAdapter = defaultCommitmentAdapter,
    passportContract?: IGigPassportClient
  ) {
    this.fipService = fipService;
    this.fipVerifier = new FIPVerifier(trustedFipPublicKeys);
    this.idp = idp;
    this.replayRegistry = replayRegistry;
    this.expectedChainId = expectedChainId;
    this.commitmentAdapter = commitmentAdapter;
    this.passportContract = passportContract;

    // Link trusted IDP with fipService so that private FIP data fetches verify caller authorization against the configured IDP
    const fipIdp = this.fipService?.getIdp?.();
    if (fipIdp && typeof fipIdp.registerTrustedIdpKey === 'function') {
      fipIdp.registerTrustedIdpKey(this.idp.getPublicKeyPem());
    }
  }

  public getCommitmentAdapter(): IEvidenceCommitmentAdapter {
    return this.commitmentAdapter;
  }

  public getPassportContract(): IGigPassportClient | undefined {
    return this.passportContract;
  }

  /**
   * Execute attestation pipeline with mandatory identity assertion and wallet authorization.
   * Fail closed: issuance or refresh CANNOT proceed without both valid artifacts.
   */
  public attestWorkerEvidence(request: AttestationRequest): AttestationResult {
    const {
      consentId,
      workerWalletAddress,
      workerIdentityNullifier,
      expectedPassportId,
      sourceDirectoryVersion = CURRENT_DIRECTORY_VERSION,
      cutoffTimestamp,
      identityAssertion,
      walletAuthorization,
    } = request;

    // MANDATORY SECURITY GATE: Fail closed if either artifact is missing
    if (!identityAssertion) {
      throw new Error('AuthenticationRequired: missing verified identityAssertion artifact');
    }
    if (!walletAuthorization) {
      throw new Error('AuthenticationRequired: missing worker walletAuthorization artifact');
    }

    // 0. Enforce allowed worker actions for attestation/issuance
    const allowedActions: WorkerActionType[] = ['MINT_PASSPORT', 'REFRESH_PASSPORT', 'REISSUE_PASSPORT'];
    if (!allowedActions.includes(walletAuthorization.action)) {
      throw new Error(
        `UnauthorizedWorkerAction: action ${walletAuthorization.action} is not permitted for attestation (allowed: ${allowedActions.join(', ')})`
      );
    }

    // Validate bounded request inputs
    if (typeof expectedPassportId !== 'number' || !Number.isSafeInteger(expectedPassportId) || expectedPassportId < 0) {
      throw new Error(`Invalid expectedPassportId: must be non-negative safe integer, got ${expectedPassportId}`);
    }
    if (cutoffTimestamp !== undefined && (typeof cutoffTimestamp !== 'number' || !Number.isSafeInteger(cutoffTimestamp) || cutoffTimestamp <= 0)) {
      throw new Error(`Invalid cutoffTimestamp: must be positive integer Unix timestamp, got ${cutoffTimestamp}`);
    }
    if (sourceDirectoryVersion !== undefined) {
      getDirectoryForVersion(sourceDirectoryVersion);
    }

    if (this.expectedChainId !== undefined) {
      if (walletAuthorization.chainId === undefined) {
        throw new Error(
          `ChainDomainMissing: wallet authorization must specify chainId matching expected chain ${this.expectedChainId}`
        );
      }
      if (walletAuthorization.chainId !== this.expectedChainId) {
        throw new Error(
          `ChainDomainMismatch: wallet authorization chainId ${walletAuthorization.chainId} does not match expected chainId ${this.expectedChainId}`
        );
      }
    }

    const cleanWallet = workerWalletAddress.toLowerCase().trim();
    const cleanNullifier = workerIdentityNullifier.toLowerCase().trim();

    // 1. Verify Identity Assertion against pinned Mock Identity Provider key
    // Invariant: Expiry uses trusted server clock, NEVER caller-supplied cutoffTimestamp!
    const idResult = this.idp.verifyAssertion(identityAssertion);
    if (idResult.workerWalletAddress !== cleanWallet) {
      throw new Error(
        `Identity assertion wallet mismatch: assertion bound to ${idResult.workerWalletAddress}, request claimed ${cleanWallet}`
      );
    }
    if (idResult.workerIdentityNullifier !== cleanNullifier) {
      throw new Error(
        `Identity assertion nullifier mismatch: assertion bound to ${idResult.workerIdentityNullifier}, request claimed ${cleanNullifier}`
      );
    }

    // 2. Verify Wallet Authorization signature
    // Invariant: Freshness uses trusted server clock, NEVER caller-supplied cutoffTimestamp!
    if (walletAuthorization.workerWalletAddress.toLowerCase() !== cleanWallet) {
      throw new Error('Wallet authorization address does not match requested holder address');
    }
    if (walletAuthorization.consentId !== consentId) {
      throw new Error('Wallet authorization is not bound to this consentId');
    }
    if (walletAuthorization.expectedPassportId !== expectedPassportId) {
      throw new Error(
        `Wallet authorization expectedPassportId mismatch: signed for ${walletAuthorization.expectedPassportId}, request has ${expectedPassportId}`
      );
    }
    verifyWorkerAuthorization(walletAuthorization, 300);
    this.replayRegistry.consume(walletAuthorization);

    // 3. Server-to-server signed fetch from Mock FIP
    // Cutoff timestamp is strictly for evidence transaction filtering, not consent expiry
    const signedEnvelope = this.fipService.fetchSignedDataByConsent(
      consentId,
      cutoffTimestamp,
      undefined,
      { identityAssertion, walletAuthorization }
    );

    // 4. Cryptographic verification & account-owner identity matching gate (fail closed)
    const verification = this.fipVerifier.verifyEnvelope(signedEnvelope, cleanNullifier);

    // 5. Transient in-memory snapshot derivation
    const cutoff = cutoffTimestamp ?? verification.payload.generatedAt;
    const { snapshot } = EvidenceSnapshotBuilder.buildSnapshot({
      fipPayload: verification.payload,
      passportId: expectedPassportId,
      holderWallet: cleanWallet,
      evidenceUpdatedAt: cutoff,
      sourceDirectoryVersion,
    });

    return {
      verified: true,
      passportId: snapshot.passportId,
      holderBinding: snapshot.holderBinding,
      identityNullifierHash: cleanNullifier,
      evidenceProviderId: snapshot.evidenceProviderId,
      evidenceDataHash: snapshot.evidenceDataHash,
      verifiedHistoryStartDate: snapshot.verifiedHistoryStartDate,
      evidenceUpdatedAt: snapshot.evidenceUpdatedAt,
      sourceDirectoryVersion: snapshot.sourceDirectoryVersion,
      monthlyGigIncomeTotals: snapshot.monthlyGigIncomeTotals,
      weeklyActivity: snapshot.weeklyActivity,
      monthlyActivity: snapshot.monthlyActivity,
      snapshot,
    };
  }

  /**
   * Deterministically reconstruct EvidenceSnapshot for authorized worker / prover.
   * Secure gate: requires valid identity assertion, wallet authorization, and active consent.
   */
  public reconstructEvidenceSnapshot(request: ReconstructEvidenceRequest): { snapshot: EvidenceSnapshot } {
    const {
      consentId,
      workerWalletAddress,
      workerIdentityNullifier,
      passportId,
      evidenceUpdatedAt,
      sourceDirectoryVersion,
      identityAssertion,
      walletAuthorization,
    } = request;

    if (!identityAssertion) {
      throw new Error('AuthenticationRequired: reconstruction requires verified identityAssertion');
    }
    if (!walletAuthorization) {
      throw new Error('AuthenticationRequired: reconstruction requires worker walletAuthorization');
    }

    const cleanWallet = workerWalletAddress.toLowerCase().trim();
    const cleanNullifier = workerIdentityNullifier.toLowerCase().trim();

    // 1. Verify identity assertion
    const idResult = this.idp.verifyAssertion(identityAssertion);
    if (idResult.workerWalletAddress !== cleanWallet || idResult.workerIdentityNullifier !== cleanNullifier) {
      throw new Error('Identity assertion does not match requested worker or wallet');
    }

    // 2. Verify wallet authorization
    if (walletAuthorization.workerWalletAddress.toLowerCase() !== cleanWallet) {
      throw new Error('Wallet authorization address does not match requested holder address');
    }
    if (walletAuthorization.action !== 'RECONSTRUCT_EVIDENCE') {
      throw new Error('Wallet authorization action must be RECONSTRUCT_EVIDENCE');
    }
    if (walletAuthorization.consentId !== consentId) {
      throw new Error('Wallet authorization is not bound to this consentId');
    }
    if (walletAuthorization.expectedPassportId !== passportId) {
      throw new Error('Wallet authorization passport ID mismatch');
    }
    // Input bounds validation
    if (typeof passportId !== 'number' || !Number.isSafeInteger(passportId) || passportId < 0) {
      throw new Error(`Invalid passportId: must be non-negative safe integer, got ${passportId}`);
    }
    if (typeof evidenceUpdatedAt !== 'number' || !Number.isSafeInteger(evidenceUpdatedAt) || evidenceUpdatedAt <= 0) {
      throw new Error(`Invalid evidenceUpdatedAt: must be positive integer Unix timestamp, got ${evidenceUpdatedAt}`);
    }
    if (sourceDirectoryVersion !== undefined) {
      getDirectoryForVersion(sourceDirectoryVersion);
    }
    if (this.expectedChainId !== undefined) {
      if (walletAuthorization.chainId === undefined) {
        throw new Error(
          `ChainDomainMissing: wallet authorization must specify chainId matching expected chain ${this.expectedChainId}`
        );
      }
      if (walletAuthorization.chainId !== this.expectedChainId) {
        throw new Error(
          `ChainDomainMismatch: wallet authorization chainId ${walletAuthorization.chainId} does not match expected chainId ${this.expectedChainId}`
        );
      }
    }

    verifyWorkerAuthorization(walletAuthorization, 300);
    this.replayRegistry.consume(walletAuthorization);

    // 3. Server-to-server signed fetch from Mock FIP
    const signedEnvelope = this.fipService.fetchSignedDataByConsent(
      consentId,
      evidenceUpdatedAt,
      undefined,
      { identityAssertion, walletAuthorization }
    );

    // 4. Verify FIP signature & account-owner identity matching gate
    const verification = this.fipVerifier.verifyEnvelope(signedEnvelope, cleanNullifier);

    // 5. Transient in-memory snapshot derivation (zero persistence)
    const { snapshot } = EvidenceSnapshotBuilder.buildSnapshot({
      fipPayload: verification.payload,
      passportId,
      holderWallet: cleanWallet,
      evidenceUpdatedAt,
      sourceDirectoryVersion,
    });

    return { snapshot };
  }

  /**
   * Complete on-chain passport issuance with sequential ID contention handling.
   * 
   * Security Invariant:
   * On ExpectedIdMismatch, NEVER silently modify an already-signed expected passport ID.
   * Requires a fresh worker authorization from reauthorizeWorker callback, or halts.
   */
  /**
   * Compute evidence commitment for an EvidenceSnapshot using the configured commitment adapter.
   */
  public async computeEvidenceCommitment(snapshot: EvidenceSnapshot): Promise<CommitmentResult> {
    const res = await this.commitmentAdapter.computeCommitment(snapshot);
    snapshot.evidenceCommitment = res.evidenceCommitment;
    return res;
  }

  /**
   * Execute attestation pipeline and compute evidence commitment.
   */
  public async attestWorkerEvidenceWithCommitment(request: AttestationRequest): Promise<AttestationResult> {
    const result = this.attestWorkerEvidence(request);
    await this.computeEvidenceCommitment(result.snapshot);
    return result;
  }

  /**
   * Complete on-chain passport issuance with sequential ID contention handling.
   * 
   * Security Invariant:
   * On ExpectedIdMismatch, NEVER silently modify an already-signed expected passport ID.
   * Requires a fresh worker authorization from reauthorizeWorker callback, or halts.
   */
  public async attestAndMintOnChain(
    request: AttestationRequest,
    passportContract = this.passportContract,
    reauthorizeWorker?: (newExpectedPassportId: number) => Promise<WorkerWalletAuthorization>,
    maxContentionRetries = 3
  ): Promise<{ passportId: number; attestation: AttestationResult }> {
    if (!passportContract) {
      throw new LiveAdapterNotConfiguredError(
        'PassportContractNotConfigured: no passport contract client was provided or configured.'
      );
    }

    let currentRequest = { ...request };
    let attempts = 0;

    while (attempts < maxContentionRetries) {
      attempts++;
      // 1. Read next available sequential passport ID from contract
      const nextId = await passportContract.getNextPassportId();

      // 2. If expected ID does not match contract next ID, require worker reauthorization
      if (currentRequest.expectedPassportId !== nextId) {
        if (!reauthorizeWorker) {
          throw new Error(
            `ExpectedIdMismatch: requested passport ID ${currentRequest.expectedPassportId} does not match contract next ID ${nextId}; worker reauthorization required`
          );
        }
        const freshAuth = await reauthorizeWorker(nextId);
        if (freshAuth.expectedPassportId !== nextId) {
          throw new Error(
            `ReauthorizationFailed: fresh worker authorization was not signed for expected ID ${nextId}`
          );
        }
        currentRequest = {
          ...currentRequest,
          expectedPassportId: nextId,
          walletAuthorization: freshAuth,
        };
      }

      // 3. Attest and derive snapshot with exact expectedId
      const attestation = this.attestWorkerEvidence(currentRequest);

      // 4. Construct evidence commitment data via injected commitment adapter
      const commitmentRes = await this.commitmentAdapter.computeCommitment(attestation.snapshot);
      attestation.snapshot.evidenceCommitment = commitmentRes.evidenceCommitment;

      // Invariant: Mock commitments MUST NOT be submitted to live contracts
      if (!passportContract.isMockClient && commitmentRes.isMockCommitment) {
        throw new LiveSubmissionProhibitedError(
          'LiveSubmissionProhibited: mock SHA-256 test commitment minting is strictly confined to local MockGigPassportContract simulators. Live contract submission requires verified Poseidon commitment adapter.'
        );
      }

      const evidenceData: EvidenceCommitmentData = {
        commitment: commitmentRes.evidenceCommitment,
        updatedAt: attestation.evidenceUpdatedAt,
        schemaVersion: CURRENT_EVIDENCE_SCHEMA_VERSION,
        providerRef: '0x' + Buffer.from(attestation.evidenceProviderId.padEnd(32, '\0')).toString('hex').slice(0, 64),
        sourceDirectoryVersion: attestation.sourceDirectoryVersion,
      };

      try {
        const passportId = await passportContract.mint(
          nextId,
          attestation.holderBinding,
          attestation.identityNullifierHash,
          evidenceData
        );
        return { passportId, attestation };
      } catch (err: any) {
        if (err.message && err.message.includes('ExpectedIdMismatch') && attempts < maxContentionRetries) {
          if (!reauthorizeWorker) {
            throw new Error(
              `ExpectedIdMismatch: concurrent mint occurred; worker reauthorization required for new passport ID`
            );
          }
          // Retry with fresh authorization on next loop iteration
          continue;
        }
        throw err;
      }
    }

    throw new Error(`Passport issuance failed after ${maxContentionRetries} contention retries`);
  }

  /**
   * Refresh evidence on an existing ACTIVE passport on-chain (ATTESTER_ROLE).
   */
  public async refreshPassportEvidenceOnChain(
    request: AttestationRequest,
    passportId: number,
    passportContract = this.passportContract
  ): Promise<{ passportId: number; attestation: AttestationResult }> {
    if (!passportContract) {
      throw new LiveAdapterNotConfiguredError(
        'PassportContractNotConfigured: no passport contract client was provided or configured.'
      );
    }
    if (request.walletAuthorization?.action !== 'REFRESH_PASSPORT') {
      throw new Error(
        `InvalidAction: refresh requires wallet authorization action REFRESH_PASSPORT, got ${request.walletAuthorization?.action}`
      );
    }

    const attestation = this.attestWorkerEvidence(request);
    const commitmentRes = await this.commitmentAdapter.computeCommitment(attestation.snapshot);
    attestation.snapshot.evidenceCommitment = commitmentRes.evidenceCommitment;

    if (!passportContract.isMockClient && commitmentRes.isMockCommitment) {
      throw new LiveSubmissionProhibitedError(
        'LiveSubmissionProhibited: mock test commitment refresh is strictly confined to local MockGigPassportContract simulators. Live contract submission requires verified Poseidon commitment adapter.'
      );
    }

    const evidenceData: EvidenceCommitmentData = {
      commitment: commitmentRes.evidenceCommitment,
      updatedAt: attestation.evidenceUpdatedAt,
      schemaVersion: CURRENT_EVIDENCE_SCHEMA_VERSION,
      providerRef: '0x' + Buffer.from(attestation.evidenceProviderId.padEnd(32, '\0')).toString('hex').slice(0, 64),
      sourceDirectoryVersion: attestation.sourceDirectoryVersion,
    };

    await passportContract.refresh(passportId, evidenceData);
    return { passportId, attestation };
  }

  /**
   * Reissue replacement passport on-chain after administrative revocation (ATTESTER_ROLE).
   */
  public async reissuePassportOnChain(
    request: AttestationRequest,
    passportContract = this.passportContract
  ): Promise<{ passportId: number; attestation: AttestationResult }> {
    if (!passportContract) {
      throw new LiveAdapterNotConfiguredError(
        'PassportContractNotConfigured: no passport contract client was provided or configured.'
      );
    }
    if (request.walletAuthorization?.action !== 'REISSUE_PASSPORT') {
      throw new Error(
        `InvalidAction: reissue requires wallet authorization action REISSUE_PASSPORT, got ${request.walletAuthorization?.action}`
      );
    }

    const cleanNullifier = request.workerIdentityNullifier.toLowerCase().trim();
    const isAllowed = await passportContract.isReissueAllowed(cleanNullifier);
    if (!isAllowed) {
      throw new ReissueNotAuthorizedError(
        `ReissueNotAuthorized: identity nullifier ${cleanNullifier} is not authorized for reissue`
      );
    }

    const nextId = await passportContract.getNextPassportId();
    if (request.expectedPassportId !== nextId) {
      throw new ExpectedIdMismatchError(
        `ExpectedIdMismatch: requested passport ID ${request.expectedPassportId} does not match contract next ID ${nextId}`
      );
    }

    const attestation = this.attestWorkerEvidence(request);
    const commitmentRes = await this.commitmentAdapter.computeCommitment(attestation.snapshot);
    attestation.snapshot.evidenceCommitment = commitmentRes.evidenceCommitment;

    if (!passportContract.isMockClient && commitmentRes.isMockCommitment) {
      throw new LiveSubmissionProhibitedError(
        'LiveSubmissionProhibited: mock test commitment reissue is strictly confined to local MockGigPassportContract simulators. Live contract submission requires verified Poseidon commitment adapter.'
      );
    }

    const evidenceData: EvidenceCommitmentData = {
      commitment: commitmentRes.evidenceCommitment,
      updatedAt: attestation.evidenceUpdatedAt,
      schemaVersion: CURRENT_EVIDENCE_SCHEMA_VERSION,
      providerRef: '0x' + Buffer.from(attestation.evidenceProviderId.padEnd(32, '\0')).toString('hex').slice(0, 64),
      sourceDirectoryVersion: attestation.sourceDirectoryVersion,
    };

    const passportId = await passportContract.mint(
      nextId,
      attestation.holderBinding,
      attestation.identityNullifierHash,
      evidenceData
    );

    return { passportId, attestation };
  }

  /**
   * Terminal revocation of a compromised passport (ADMIN_ROLE).
   */
  public async revokePassportOnChain(
    passportId: number,
    reason: string,
    adminCaller?: string,
    passportContract = this.passportContract
  ): Promise<void> {
    if (!passportContract) {
      throw new LiveAdapterNotConfiguredError(
        'PassportContractNotConfigured: no passport contract client was provided or configured.'
      );
    }
    await passportContract.revoke(passportId, reason, adminCaller);
  }

  /**
   * Authorize replacement passport reissue for a revoked identity (ADMIN_ROLE).
   */
  public async authorizeReissueOnChain(
    identityNullifier: string,
    adminCaller?: string,
    passportContract = this.passportContract
  ): Promise<void> {
    if (!passportContract) {
      throw new LiveAdapterNotConfiguredError(
        'PassportContractNotConfigured: no passport contract client was provided or configured.'
      );
    }
    await passportContract.authorizeReissue(identityNullifier, adminCaller);
  }

  /**
   * Private witness handoff to trusted Prover component boundary.
   */
  public async handoffToProver(
    request: ReconstructEvidenceRequest,
    proverAdapter: ITrustedProverAdapter = defaultProverAdapter
  ): Promise<ProverHandoffResult> {
    const { snapshot } = this.reconstructEvidenceSnapshot(request);
    const commitmentRes = await this.commitmentAdapter.computeCommitment(snapshot);
    snapshot.evidenceCommitment = commitmentRes.evidenceCommitment;

    const payload = buildProverWitnessPayload(snapshot, commitmentRes.evidenceCommitment);
    return proverAdapter.handoffWitness(payload);
  }
}
