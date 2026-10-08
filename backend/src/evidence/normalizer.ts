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

import crypto from 'node:crypto';
import type { RawTransaction, AccountOwnerBinding } from '../fip/types.js';

export interface NormalizedEvidenceDataset {
  accountOwnerBinding: {
    accountId: string;
    identityNullifierHash: string;
  };
  transactions: Array<{
    txnId: string;
    timestamp: number;
    amountMinor: number;
    direction: string;
    rail: string;
    remitterVpa: string;
    remitterAccount: string;
    reference: string;
  }>;
}

/**
 * Deterministically normalize authenticated transaction dataset.
 */
export function normalizeAuthenticatedData(
  accountOwnerBinding: AccountOwnerBinding,
  transactions: RawTransaction[],
  cutoffTs: number
): NormalizedEvidenceDataset {
  // Filter on or before cutoff
  const eligibleTxns = transactions.filter((t) => t.timestamp <= cutoffTs);

  // Stable sort: timestamp ascending, then bytewise ASCII txnId ascending (no locale dependency)
  const sortedTxns = [...eligibleTxns].sort((a, b) => {
    if (a.timestamp !== b.timestamp) {
      return a.timestamp - b.timestamp;
    }
    const idA = a.txnId.trim();
    const idB = b.txnId.trim();
    return idA < idB ? -1 : (idA > idB ? 1 : 0);
  });

  // Reject duplicate normalized transaction IDs
  for (let i = 1; i < sortedTxns.length; i++) {
    if (sortedTxns[i].txnId.trim() === sortedTxns[i - 1].txnId.trim()) {
      throw new Error(
        `Duplicate transaction ID detected in authenticated dataset: ${sortedTxns[i].txnId.trim()}`
      );
    }
  }

  return {
    accountOwnerBinding: {
      accountId: accountOwnerBinding.accountId.trim(),
      identityNullifierHash: accountOwnerBinding.identityNullifierHash.toLowerCase().trim(),
    },
    transactions: sortedTxns.map((t) => ({
      txnId: t.txnId.trim(),
      timestamp: t.timestamp,
      amountMinor: t.amountMinor,
      direction: t.direction,
      rail: t.rail,
      remitterVpa: (t.remitter.vpa || '').toLowerCase().trim(),
      remitterAccount: (t.remitter.account || '').trim(),
      reference: t.reference.trim(),
    })),
  };
}

/**
 * Deterministically serialize normalized dataset to UTF-8 bytes and compute SHA-256 hash.
 */
export function computeEvidenceDataHash(
  accountOwnerBinding: AccountOwnerBinding,
  transactions: RawTransaction[],
  cutoffTs: number
): string {
  const normalized = normalizeAuthenticatedData(accountOwnerBinding, transactions, cutoffTs);
  const serialized = JSON.stringify(normalized);
  return crypto.createHash('sha256').update(serialized, 'utf8').digest('hex');
}
