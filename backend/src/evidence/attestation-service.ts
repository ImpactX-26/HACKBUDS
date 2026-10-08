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
import { CURRENT_DIRECTORY_VERSION } from './directory/registry.js';
import type { VerifiedIdentityAssertion, WorkerWalletAuthorization } from '../identity/types.js';
import { MockIdentityProvider, defaultMockIdp } from '../identity/mock-idp.js';
import { verifyWorkerAuthorization, ReplayProtectionRegistry } from '../identity/wallet-auth.js';
import type { IGigPassportClient, EvidenceCommitmentData } from './passport-client.js';

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

  constructor(
    fipService: MockFIPService,
    trustedFipPublicKeys?: string[],
    idp: MockIdentityProvider = defaultMockIdp
  ) {
    this.fipService = fipService;
    this.fipVerifier = new FIPVerifier(trustedFipPublicKeys);
    this.idp = idp;
    this.replayRegistry = new ReplayProtectionRegistry();

    // Link trusted IDP with fipService so that private FIP data fetches verify caller authorization against the configured IDP
    const fipIdp = this.fipService?.getIdp?.();
    if (fipIdp && typeof fipIdp.registerTrustedIdpKey === 'function') {
      fipIdp.registerTrustedIdpKey(this.idp.getPublicKeyPem());
    }
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
  public async attestAndMintOnChain(
    request: AttestationRequest,
    passportContract: IGigPassportClient,
    reauthorizeWorker?: (newExpectedPassportId: number) => Promise<WorkerWalletAuthorization>,
    maxContentionRetries = 3
  ): Promise<{ passportId: number; attestation: AttestationResult }> {
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

      // 4. Construct mock evidence commitment data
      // MOCK TEST COMMITMENT ONLY: Local testing scalar digest prior to shared Poseidon freeze.
      // Invariant: MUST NOT be submitted as a production Poseidon evidence commitment.
      const mockTestCommitment = BigInt(`0x${attestation.evidenceDataHash}`).toString();
      const evidenceData: EvidenceCommitmentData = {
        commitment: mockTestCommitment,
        updatedAt: attestation.evidenceUpdatedAt,
        schemaVersion: 1,
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
}
