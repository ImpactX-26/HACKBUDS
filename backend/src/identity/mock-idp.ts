/**
 * GigVault - Mock Identity Provider (Simulated Anon Aadhaar / UIDAI Test Authority)
 * 
 * Simulates a trusted identity verification authority that issues cryptographically
 * signed identity assertions binding a worker's app-scoped identity nullifier
 * to their EVM wallet address.
 * 
 * Architectural Notice:
 * This is an explicit, clearly labeled mock identity provider for testing and the
 * hackathon MVP, simulating what Anon Aadhaar or an authorized KYC bridge produces.
 * It is NOT real Aadhaar verification.
 */

import crypto from 'node:crypto';
import { generateFipKeyPair, signPayloadHash, verifySignature, type KeyPair } from '../fip/crypto.js';
import type { VerifiedIdentityAssertion } from './types.js';

export interface IssueAssertionParams {
  workerIdentityNullifier: string;
  workerWalletAddress: string;
  durationSeconds?: number; // Default 24 hours
}

export class MockIdentityProvider {
  private keyPair: KeyPair;
  public readonly providerId = 'MOCK_IDP_UIDAI_SIMULATED' as const;

  constructor(customKeyPair?: KeyPair) {
    this.keyPair = customKeyPair || generateFipKeyPair();
  }

  public getPublicKeyPem(): string {
    return this.keyPair.publicKeyPem;
  }

  /**
   * Deterministically hash assertion payload fields.
   */
  private hashAssertion(payload: Omit<VerifiedIdentityAssertion, 'signature' | 'idpPublicKey'>): string {
    const canonical = JSON.stringify({
      expiresAt: payload.expiresAt,
      issuedAt: payload.issuedAt,
      providerId: payload.providerId,
      schemaVersion: payload.schemaVersion,
      workerIdentityNullifier: payload.workerIdentityNullifier.toLowerCase().trim(),
      workerWalletAddress: payload.workerWalletAddress.toLowerCase().trim(),
    });
    return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
  }

  /**
   * Issue a signed identity assertion for a worker's wallet.
   */
  public issueAssertion(params: IssueAssertionParams): VerifiedIdentityAssertion {
    const { workerIdentityNullifier, workerWalletAddress, durationSeconds = 86400 } = params;

    const nowSec = Math.floor(Date.now() / 1000);
    const payload = {
      schemaVersion: 'GIGVAULT_IDENTITY_ASSERTION_V1' as const,
      providerId: this.providerId,
      workerIdentityNullifier: workerIdentityNullifier.toLowerCase().trim(),
      workerWalletAddress: workerWalletAddress.toLowerCase().trim(),
      issuedAt: nowSec,
      expiresAt: nowSec + durationSeconds,
    };

    const hash = this.hashAssertion(payload);
    const signature = signPayloadHash(hash, this.keyPair.privateKeyPem);

    return {
      ...payload,
      signature,
      idpPublicKey: this.keyPair.publicKeyPem,
    };
  }

  /**
   * Cryptographically verify an identity assertion.
   * Throws on tampering, expiry, or invalid signature.
   */
  public verifyAssertion(
    assertion: VerifiedIdentityAssertion,
    currentTimestamp?: number
  ): { valid: boolean; workerIdentityNullifier: string; workerWalletAddress: string } {
    if (assertion.schemaVersion !== 'GIGVAULT_IDENTITY_ASSERTION_V1') {
      throw new Error(`Unsupported identity assertion schema: ${assertion.schemaVersion}`);
    }
    if (assertion.providerId !== this.providerId) {
      throw new Error(`Unrecognized identity provider: ${assertion.providerId}`);
    }

    const nowSec = currentTimestamp ?? Math.floor(Date.now() / 1000);
    if (nowSec > assertion.expiresAt) {
      throw new Error(`Identity assertion expired at ${assertion.expiresAt} (current: ${nowSec})`);
    }

    const hash = this.hashAssertion({
      schemaVersion: assertion.schemaVersion,
      providerId: assertion.providerId,
      workerIdentityNullifier: assertion.workerIdentityNullifier,
      workerWalletAddress: assertion.workerWalletAddress,
      issuedAt: assertion.issuedAt,
      expiresAt: assertion.expiresAt,
    });

    const isSigValid = verifySignature(hash, assertion.signature, assertion.idpPublicKey);
    if (!isSigValid) {
      throw new Error('Identity assertion signature invalid: cryptographic verification failed');
    }

    return {
      valid: true,
      workerIdentityNullifier: assertion.workerIdentityNullifier.toLowerCase().trim(),
      workerWalletAddress: assertion.workerWalletAddress.toLowerCase().trim(),
    };
  }
}

// Global default Mock IDP instance
export const defaultMockIdp = new MockIdentityProvider();
