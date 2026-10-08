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

/**
 * BN254 / alt_bn128 scalar field modulus:
 * r = 21888242871839275222246405745257275088696311157297823662689037894645226208583
 */
export const BN254_SCALAR_FIELD_MODULUS = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;

/**
 * Proposed BN254 digest-to-field reduction:
 * Treats 32-byte hex hash as big-endian unsigned integer modulo r.
 */
export function hashToFieldElement(hexDigest: string): bigint {
  const cleanHex = hexDigest.startsWith('0x') ? hexDigest.slice(2) : hexDigest;
  const bigIntVal = BigInt(`0x${cleanHex}`);
  return bigIntVal % BN254_SCALAR_FIELD_MODULUS;
}

/**
 * Proposed EVM Address to field element mapping:
 * Converts 20-byte address to 160-bit unsigned integer (big-endian).
 */
export function addressToFieldElement(address: string): bigint {
  const clean = address.toLowerCase().replace(/^0x/, '');
  if (clean.length !== 40) {
    throw new Error(`Invalid EVM address length: expected 40 hex chars, got ${clean.length}`);
  }
  return BigInt(`0x${clean}`);
}

/**
 * Proposed canonical provider ID mapping:
 * SHA-256("GIGVAULT_PROVIDER_ID_V1|" + canonicalProviderId) mod r
 */
import crypto from 'node:crypto';

export function providerIdToFieldElement(canonicalProviderId: string): bigint {
  const preimage = `GIGVAULT_PROVIDER_ID_V1|${canonicalProviderId}`;
  const digest = crypto.createHash('sha256').update(preimage, 'utf8').digest('hex');
  return hashToFieldElement(digest);
}

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
 * 2. Deterministic sort: timestamp ascending, then bytewise ASCII txnId ascending.
 * 3. Rejects duplicate transaction IDs.
 * 4. Alphabetically sorted object keys for deterministic JSON encoding.
 */
export function serializeCanonicalEvidence(preimage: CanonicalEvidencePreimage): string {
  // 1. Normalize and clean transactions
  const cleanedTxns = preimage.transactions.map((t) => {
    const cleanId = String(t.txnId).trim();
    if (!cleanId) {
      throw new Error('Canonical serializer error: transaction txnId cannot be empty');
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

  // 2. Deterministic sorting: timestamp ascending, then ASCII txnId ascending
  cleanedTxns.sort((a, b) => {
    if (a.timestamp !== b.timestamp) {
      return a.timestamp - b.timestamp;
    }
    return a.txnId < b.txnId ? -1 : (a.txnId > b.txnId ? 1 : 0);
  });

  // 3. Reject duplicate normalized transaction IDs
  for (let i = 1; i < cleanedTxns.length; i++) {
    if (cleanedTxns[i].txnId === cleanedTxns[i - 1].txnId) {
      throw new Error(
        `Duplicate transaction ID detected in authenticated dataset: ${cleanedTxns[i].txnId}`
      );
    }
  }

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
