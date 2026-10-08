/**
 * GigVault - Attestation Service FIP Verifier Gate
 * 
 * Cryptographically verifies Mock FIP envelopes before any evidence processing:
 * 1. Validates envelope schema version and structure.
 * 2. Recomputes SHA-256 payload hash and compares with envelope.payloadHash.
 * 3. Verifies secp256k1 ECDSA signature against trusted FIP public key.
 * 4. Strictly validates account-owner identity binding against verified worker identity nullifier.
 * 
 * Rejects tampered payloads, forged signatures, or wrong-account evidence.
 */

import { hashPayload, verifySignature } from '../fip/crypto.js';
import type { SignedFIPEnvelope, SignedFIPPayload } from '../fip/types.js';

export interface FIPVerificationResult {
  valid: boolean;
  payload: SignedFIPPayload;
  verifiedAt: number;
}

export class FIPVerifier {
  private trustedFipPublicKeys: Set<string>;

  constructor(trustedPublicKeys?: string[]) {
    this.trustedFipPublicKeys = new Set(trustedPublicKeys || []);
  }

  public registerTrustedFipKey(publicKeyPem: string): void {
    this.trustedFipPublicKeys.add(publicKeyPem);
  }

  /**
   * Cryptographically verify FIP envelope and match account-owner identity binding.
   * Throws detailed errors on any validation failure.
   */
  public verifyEnvelope(
    envelope: SignedFIPEnvelope,
    expectedWorkerIdentityNullifier: string
  ): FIPVerificationResult {
    const { payload, payloadHash, signature, fipPublicKey } = envelope;

    // 1. Schema check
    if (payload.schemaVersion !== 'GIGVAULT_FIP_MOCK_V1') {
      throw new Error(`Unsupported FIP schema version: ${payload.schemaVersion}`);
    }

    // 2. Trusted key check
    if (this.trustedFipPublicKeys.size > 0 && !this.trustedFipPublicKeys.has(fipPublicKey)) {
      throw new Error(`Untrusted FIP public key: key not recognized by Attestation Authority`);
    }

    // 3. Payload hash integrity
    const computedHash = hashPayload(payload);
    if (computedHash !== payloadHash) {
      throw new Error(
        `FIP signature invalid: payload hash mismatch (computed ${computedHash.slice(0, 8)}..., envelope has ${payloadHash.slice(0, 8)}...)`
      );
    }

    // 4. Cryptographic signature check
    const isSigValid = verifySignature(payloadHash, signature, fipPublicKey);
    if (!isSigValid) {
      throw new Error('FIP signature invalid: cryptographic signature verification failed');
    }

    // 5. Account owner identity binding gate
    const bankOwnerNullifier = payload.accountOwnerBinding?.identityNullifierHash;
    if (!bankOwnerNullifier) {
      throw new Error('FIP account owner binding missing in signed payload');
    }

    if (bankOwnerNullifier.toLowerCase() !== expectedWorkerIdentityNullifier.toLowerCase()) {
      throw new Error(
        `Account owner binding mismatch: Bank account owner identity (${bankOwnerNullifier}) does not match worker identity (${expectedWorkerIdentityNullifier})`
      );
    }

    // 6. Transaction sanity checks (integer paise, non-negative)
    for (const txn of payload.transactions) {
      if (typeof txn.amountMinor !== 'number' || !Number.isInteger(txn.amountMinor) || txn.amountMinor < 0) {
        throw new Error(`Invalid transaction amountMinor: must be non-negative integer paise, got ${txn.amountMinor}`);
      }
      if (typeof txn.timestamp !== 'number' || !Number.isInteger(txn.timestamp) || txn.timestamp <= 0) {
        throw new Error(`Invalid transaction timestamp: must be positive integer Unix seconds, got ${txn.timestamp}`);
      }
    }

    return {
      valid: true,
      payload,
      verifiedAt: Math.floor(Date.now() / 1000),
    };
  }
}
