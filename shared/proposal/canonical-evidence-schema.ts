/**
 * GigVault - Proposed Shared Evidence & Wire Schema (Gate 1 Proposal for Backend B)
 * 
 * STATUS: PROPOSED / UNDER REVIEW
 * Awaiting joint sign-off with Backend B before freezing into contracts/circuits.
 * 
 * Defines:
 * 1. Normalized byte serialization for evidenceDataHash computation
 * 2. Big-endian digest-to-field mapping onto BN254 scalar field
 * 3. Exact 10-slot metadata array layout for EvidenceSnapshot commitment
 */

import {
  hashToFieldElement,
  addressToFieldElement,
  providerIdToFieldElement,
} from './field-mappings.js';

export {
  hashToFieldElement,
  addressToFieldElement,
  providerIdToFieldElement,
};

import crypto from 'node:crypto';
import { FIELD } from './poseidon5.js';

/**
 * BN254 / alt_bn128 scalar field modulus:
 * r = 21888242871839275222246405745257275088696311157297823662689037894645226208583
 */
export const BN254_SCALAR_FIELD_MODULUS = FIELD;

/**
 * Proposed Canonical Preimage Structure for evidenceDataHash:
 * Strictly excludes ephemeral consent metadata (consentId, signature, generatedAt).
 * Retains authenticated account-owner binding, scoped time bounds, and normalized transactions.
 */
export interface CanonicalTransactionInput {
  txnId: string;
  timestamp: number;
  amountMinor: number | bigint; // exact integer paise
  currency?: 'INR';
  direction: 'CREDIT' | 'DEBIT';
  rail: string;
  remitterName?: string; // Authenticated remitter name (vital for platform classification)
  remitterAccount?: string;
  remitterVpa?: string;
  reference?: string;
}

/**
 * Canonical Preimage Structure for evidenceDataHash:
 * Strictly excludes ephemeral consent metadata (consentId, signature, generatedAt).
 * Retains authenticated account-owner binding, scoped time bounds, and normalized transactions.
 */
export interface CanonicalEvidencePreimage {
  version: 'GIGVAULT_CANONICAL_DATA_V1';
  accountOwner: {
    accountId: string;
    identityNullifierHash: string;
  };
  timeBounds: {
    fromTimestamp: number;
    toTimestamp: number;
  };
  transactions: CanonicalTransactionInput[];
}

/**
 * Deterministically normalize, sort, and serialize canonical evidence preimage to UTF-8 bytes.
 * 
 * Invariants:
 * 1. String fields trimmed; VPA lowercased; nullifier lowercased.
 * 2. Deterministic sort: timestamp ascending, then byte-wise UTF-8 txnId ascending.
 * 3. Enforces strict ASCII txnId grammar (/^[A-Za-z0-9_.:#/-]+$/) and global ID uniqueness.
 * 4. Rejects duplicate transaction IDs across all timestamps before aggregation.
 * 5. Alphabetically sorted object keys for deterministic JSON encoding.
 */
export function serializeCanonicalEvidence(preimage: CanonicalEvidencePreimage): string {
  // 1. Normalize and clean transactions
  const cleanedTxns = preimage.transactions.map((t) => {
    const rawId = String(t.txnId);
    const cleanId = rawId.trim();
    if (!cleanId) {
      throw new Error('Canonical serializer error: transaction txnId cannot be empty');
    }
    // Strict ASCII validation: prevents Unicode surrogate inversions and encoding divergence
    if (!/^[A-Za-z0-9_.:#/-]+$/.test(cleanId)) {
      throw new Error(
        `Canonical serializer error: transaction txnId must be strict ASCII matching /^[A-Za-z0-9_.:#/-]+$/, got "${cleanId}"`
      );
    }
    const amountVal = typeof t.amountMinor === 'bigint' ? Number(t.amountMinor) : t.amountMinor;
    if (!Number.isSafeInteger(amountVal) || amountVal < 0) {
      throw new Error(`Canonical serializer error: invalid amountMinor ${t.amountMinor}`);
    }

    return {
      amountMinor: amountVal,
      currency: 'INR' as const,
      direction: t.direction,
      rail: String(t.rail).trim(),
      reference: String(t.reference || '').trim(),
      remitterAccount: String(t.remitterAccount || '').trim(),
      remitterName: String(t.remitterName || '').trim(),
      remitterVpa: String(t.remitterVpa || '').toLowerCase().trim(),
      timestamp: t.timestamp,
      txnId: cleanId,
    };
  });

  // 2. Global uniqueness check: reject duplicate normalized transaction IDs across the entire dataset
  const seenTxnIds = new Set<string>();
  for (const t of cleanedTxns) {
    if (seenTxnIds.has(t.txnId)) {
      throw new Error(
        `Duplicate transaction ID detected in authenticated dataset: ${t.txnId}`
      );
    }
    seenTxnIds.add(t.txnId);
  }

  // 3. Deterministic sorting: timestamp ascending, then byte-wise UTF-8 comparison on txnId
  cleanedTxns.sort((a, b) => {
    if (a.timestamp !== b.timestamp) {
      return a.timestamp - b.timestamp;
    }
    return Buffer.compare(Buffer.from(a.txnId, 'utf8'), Buffer.from(b.txnId, 'utf8'));
  });

  // 4. Deterministic JSON serialization with alphabetically sorted keys
  return JSON.stringify({
    accountOwner: {
      accountId: preimage.accountOwner.accountId.trim(),
      identityNullifierHash: preimage.accountOwner.identityNullifierHash.toLowerCase().trim(),
    },
    timeBounds: {
      fromTimestamp: preimage.timeBounds.fromTimestamp,
      toTimestamp: preimage.timeBounds.toTimestamp,
    },
    transactions: cleanedTxns.map((t) => ({
      amountMinor: t.amountMinor,
      currency: t.currency,
      direction: t.direction,
      rail: t.rail,
      reference: t.reference,
      remitterAccount: t.remitterAccount,
      remitterName: t.remitterName,
      remitterVpa: t.remitterVpa,
      timestamp: t.timestamp,
      txnId: t.txnId,
    })),
    version: preimage.version,
  });
}

/**
 * Compute evidenceDataHash: SHA-256 of canonical bytes.
 */
export function computeCanonicalEvidenceDataHash(preimage: CanonicalEvidencePreimage): {
  sha256Hex: string;
  fieldElementDecimal: string;
} {
  const serialized = serializeCanonicalEvidence(preimage);
  const sha256Hex = crypto.createHash('sha256').update(serialized, 'utf8').digest('hex');
  const fieldElement = hashToFieldElement(sha256Hex);
  return {
    sha256Hex,
    fieldElementDecimal: fieldElement.toString(),
  };
}

/**
 * Proposed 10-Slot Metadata Vector Layout:
 * Bound to the three array roots (incomeRoot, weeklyRoot, monthlyRoot) in final commitment.
 */
export interface ProposedMetadataSlots {
  M0_passportId: string; // decimal string
  M1_holderBinding: string; // decimal string (EVM address as uint160)
  M2_evidenceProviderId: string; // decimal string
  M3_evidenceDataHash: string; // decimal string (SHA256 mod r)
  M4_verifiedHistoryStartDate: string; // decimal string (UTC Unix epoch days)
  M5_evidenceUpdatedAt: string; // decimal string (UTC Unix epoch seconds)
  M6_sourceDirectoryVersion: string; // decimal string (integer)
  M7_incomeRoot: string; // decimal string (from Poseidon 4-way tree)
  M8_weeklyRoot: string; // decimal string (from Poseidon 4-way tree)
  M9_monthlyRoot: string; // decimal string (from Poseidon 4-way tree)
}
