/**
 * GigVault - Deterministic Evidence Normalizer & Data Hash
 * 
 * Normalizes authenticated source data for stable evidenceDataHash computation:
 * - Stable sort: timestamp ascending, then txnId ascending
 * - Trims and normalizes strings
 * - Strictly excludes ephemeral envelope fields (consentId, signature, generatedAt)
 * - Retains authenticated transaction records, account-owner binding, and data range
 * 
 * Note: The exact byte serializer and digest-to-field mapping remain a REVIEW item
 * requiring coordination with Backend B before freezing.
 */

import type { RawTransaction, AccountOwnerBinding } from '../fip/types.js';
import {
  serializeCanonicalEvidence,
  computeCanonicalEvidenceDataHash,
  type CanonicalEvidencePreimage,
} from '../../../shared/proposal/canonical-evidence-schema.js';

export {
  serializeCanonicalEvidence,
  computeCanonicalEvidenceDataHash,
  type CanonicalEvidencePreimage,
};

export interface NormalizedEvidenceDataset {
  accountOwner: {
    accountId: string;
    identityNullifierHash: string;
  };
  timeBounds: {
    fromTimestamp: number;
    toTimestamp: number;
  };
  transactions: Array<{
    txnId: string;
    timestamp: number;
    amountMinor: number;
    currency: 'INR';
    direction: 'CREDIT' | 'DEBIT';
    rail: string;
    remitterName: string;
    remitterVpa: string;
    remitterAccount: string;
    reference: string;
  }>;
  version: 'GIGVAULT_CANONICAL_DATA_V1';
}

/**
 * Build canonical evidence preimage adhering to jointly reviewed Gate 1 format.
 */
export function buildCanonicalPreimage(
  accountOwnerBinding: AccountOwnerBinding,
  transactions: RawTransaction[],
  cutoffTs: number
): CanonicalEvidencePreimage {
  const eligibleTxns = transactions.filter((t) => t.timestamp <= cutoffTs);
  const fromTs = eligibleTxns.length > 0 ? Math.min(...eligibleTxns.map((t) => t.timestamp)) : 0;

  return {
    version: 'GIGVAULT_CANONICAL_DATA_V1',
    accountOwner: {
      accountId: accountOwnerBinding.accountId.trim(),
      identityNullifierHash: accountOwnerBinding.identityNullifierHash.toLowerCase().trim(),
    },
    timeBounds: {
      fromTimestamp: fromTs,
      toTimestamp: cutoffTs,
    },
    transactions: eligibleTxns.map((t) => ({
      txnId: t.txnId,
      timestamp: t.timestamp,
      amountMinor: t.amountMinor,
      currency: t.currency ?? 'INR',
      direction: t.direction,
      rail: t.rail,
      remitterName: (t.remitter.name || '').trim(),
      remitterAccount: (t.remitter.account || '').trim(),
      remitterVpa: (t.remitter.vpa || '').toLowerCase().trim(),
      reference: t.reference.trim(),
    })),
  };
}

/**
 * Deterministically normalize authenticated transaction dataset.
 */
export function normalizeAuthenticatedData(
  accountOwnerBinding: AccountOwnerBinding,
  transactions: RawTransaction[],
  cutoffTs: number
): NormalizedEvidenceDataset {
  const preimage = buildCanonicalPreimage(accountOwnerBinding, transactions, cutoffTs);
  const serialized = serializeCanonicalEvidence(preimage);
  return JSON.parse(serialized);
}

/**
 * Deterministically serialize normalized dataset to UTF-8 bytes and compute SHA-256 hash.
 */
export function computeEvidenceDataHash(
  accountOwnerBinding: AccountOwnerBinding,
  transactions: RawTransaction[],
  cutoffTs: number
): string {
  const preimage = buildCanonicalPreimage(accountOwnerBinding, transactions, cutoffTs);
  return computeCanonicalEvidenceDataHash(preimage).sha256Hex;
}
