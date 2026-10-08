/**
 * GigVault - Attestation Service Orchestrator
 * 
 * Orchestrates the full attestation pipeline:
 * 1. Server-to-server fetch of signed data by consentId
 * 2. Cryptographic signature and account-owner identity validation
 * 3. Conservative classification against versioned payout registry
 * 4. Deterministic aggregation into 36 months / 156 weeks
 * 5. Transient EvidenceSnapshot preparation for on-chain ATTESTER mint/refresh
 * 
 * Zero-persistence guarantee:
 * Never persists raw bank records or EvidenceSnapshot to disk or database.
 */

import { FIPVerifier } from './fip-verifier.js';
import { EvidenceSnapshotBuilder, type EvidenceSnapshot } from './snapshot-builder.js';
import type { MockFIPService } from '../fip/fip-service.js';
import { CURRENT_DIRECTORY_VERSION } from './directory/registry.js';

export interface AttestationRequest {
  consentId: string;
  workerWalletAddress: string;
  workerIdentityNullifier: string;
  expectedPassportId: number;
  sourceDirectoryVersion?: number;
  cutoffTimestamp?: number;
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
  // Output snapshot (transient)
  snapshot: EvidenceSnapshot;
}

export class AttestationService {
  private fipService: MockFIPService;
  private fipVerifier: FIPVerifier;

  constructor(fipService: MockFIPService, trustedFipPublicKeys?: string[]) {
    this.fipService = fipService;
    this.fipVerifier = new FIPVerifier(trustedFipPublicKeys);
  }

  /**
   * Execute attestation pipeline for an authorized worker request.
   */
  public attestWorkerEvidence(request: AttestationRequest): AttestationResult {
    const {
      consentId,
      workerWalletAddress,
      workerIdentityNullifier,
      expectedPassportId,
      sourceDirectoryVersion = CURRENT_DIRECTORY_VERSION,
      cutoffTimestamp,
    } = request;

    // 1. Server-to-server signed fetch from Mock FIP
    const signedEnvelope = this.fipService.fetchSignedDataByConsent(consentId, cutoffTimestamp);

    // 2. Cryptographic verification & account-owner identity matching gate
    const verification = this.fipVerifier.verifyEnvelope(signedEnvelope, workerIdentityNullifier);

    // 3. Transient in-memory snapshot derivation
    const cutoff = cutoffTimestamp ?? verification.payload.generatedAt;
    const { snapshot } = EvidenceSnapshotBuilder.buildSnapshot({
      fipPayload: verification.payload,
      passportId: expectedPassportId,
      holderWallet: workerWalletAddress,
      evidenceUpdatedAt: cutoff,
      sourceDirectoryVersion,
    });

    return {
      verified: true,
      passportId: snapshot.passportId,
      holderBinding: snapshot.holderBinding,
      identityNullifierHash: workerIdentityNullifier,
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
}
