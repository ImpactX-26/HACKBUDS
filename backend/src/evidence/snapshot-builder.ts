/**
 * GigVault - Transient EvidenceSnapshot Builder
 * 
 * Derives the canonical EvidenceSnapshot in memory under the locked trust model:
 * - Passport holder and sequential ID binding
 * - Stable evidenceDataHash from normalized authenticated records
 * - 36 completed UTC months of income totals & activity flags
 * - 156 completed ISO weeks of activity flags
 * - Earliest verified history start date & fixed cutoff timestamp
 * - Historical sourceDirectoryVersion
 * 
 * PRIVACY INVARIANT:
 * Plaintext EvidenceSnapshot is NEVER stored in database, logs, or disk.
 * It is derived transiently for attestation / proving and discarded.
 */

import { TransactionClassifier } from './classifier.js';
import { aggregateEvidenceCalendar, type CalendarAggregationResult } from './calendar.js';
import { computeEvidenceDataHash } from './normalizer.js';
import type { SignedFIPPayload } from '../fip/types.js';

export interface EvidenceSnapshot {
  passportId: number;
  holderBinding: string; // 20-byte EVM address (e.g. 0x...)
  evidenceProviderId: string; // e.g. "MOCK_APNA_BANK_FIP_01"
  evidenceDataHash: string; // Hex SHA-256 digest
  verifiedHistoryStartDate: number; // UTC Unix epoch days
  evidenceUpdatedAt: number; // Unix seconds (fixed cutoff)
  monthlyGigIncomeTotals: number[]; // 36 integers (paise)
  weeklyActivity: Array<0 | 1>; // 156 binary flags
  monthlyActivity: Array<0 | 1>; // 36 binary flags
  sourceDirectoryVersion: number;
  evidenceCommitment?: string; // OUTPUT ONLY (computed by Poseidon adapter)
}

export interface BuildSnapshotParams {
  fipPayload: SignedFIPPayload;
  passportId: number;
  holderWallet: string;
  evidenceUpdatedAt?: number;
  sourceDirectoryVersion?: number;
}

export class EvidenceSnapshotBuilder {
  /**
   * Derive canonical EvidenceSnapshot transiently in memory.
   */
  public static buildSnapshot(params: BuildSnapshotParams): {
    snapshot: EvidenceSnapshot;
    aggregationDetails: CalendarAggregationResult;
  } {
    const {
      fipPayload,
      passportId,
      holderWallet,
      evidenceUpdatedAt = fipPayload.generatedAt,
      sourceDirectoryVersion = 1,
    } = params;

    // 1. Classify transactions with the specified historical directory version
    const classifier = new TransactionClassifier(sourceDirectoryVersion);
    const classifiedTxns = classifier.classifyAll(fipPayload.transactions);

    // 2. Aggregate into completed UTC month and ISO week intervals
    const aggregationDetails = aggregateEvidenceCalendar(classifiedTxns, evidenceUpdatedAt);

    // 3. Compute stable evidenceDataHash over normalized authenticated source data
    const evidenceDataHash = computeEvidenceDataHash(
      fipPayload.accountOwnerBinding,
      fipPayload.transactions,
      evidenceUpdatedAt
    );

    const snapshot: EvidenceSnapshot = {
      passportId,
      holderBinding: holderWallet.toLowerCase(),
      evidenceProviderId: fipPayload.fipId,
      evidenceDataHash,
      verifiedHistoryStartDate: aggregationDetails.verifiedHistoryStartDate,
      evidenceUpdatedAt,
      monthlyGigIncomeTotals: aggregationDetails.monthlyGigIncomeTotals,
      weeklyActivity: aggregationDetails.weeklyActivity,
      monthlyActivity: aggregationDetails.monthlyActivity,
      sourceDirectoryVersion,
    };

    return {
      snapshot,
      aggregationDetails,
    };
  }
}
