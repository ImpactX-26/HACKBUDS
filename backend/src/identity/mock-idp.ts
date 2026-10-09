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
  private trustedIdpPublicKeys: Set<string>;
  private registeredWorkers: Map<string, string> = new Map(); // identityNullifier -> walletAddress
  public readonly providerId = 'MOCK_IDP_UIDAI_SIMULATED' as const;

  constructor(customKeyPair?: KeyPair, trustedPublicKeys?: string[]) {
    this.keyPair = customKeyPair || generateFipKeyPair();
    this.trustedIdpPublicKeys = new Set(trustedPublicKeys || [this.keyPair.publicKeyPem]);
  }

  public getPublicKeyPem(): string {
    return this.keyPair.publicKeyPem;
  }

  public registerTrustedIdpKey(publicKeyPem: string): void {
    this.trustedIdpPublicKeys.add(publicKeyPem);
  }

  /**
   * Rebind worker identity to a new wallet address upon authorized recovery / key rotation.
   */
  public rebindWorkerWallet(workerIdentityNullifier: string, newWalletAddress: string): void {
    this.registeredWorkers.set(workerIdentityNullifier.toLowerCase().trim(), newWalletAddress.toLowerCase().trim());
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
   * Enforces that an identity nullifier cannot be claimed by multiple conflicting wallets.
   */
  public issueAssertion(params: IssueAssertionParams): VerifiedIdentityAssertion {
    const { workerIdentityNullifier, workerWalletAddress, durationSeconds = 86400 } = params;

    const cleanNullifier = workerIdentityNullifier.toLowerCase().trim();
    const cleanWallet = workerWalletAddress.toLowerCase().trim();

    // Check identity-wallet binding registry to prevent conflicting identity claims
    const existing = this.registeredWorkers.get(cleanNullifier);
    if (existing && existing !== cleanWallet) {
      throw new Error(
        `IdentityRegistrationConflict: identity nullifier ${cleanNullifier} is already registered to wallet ${existing}`
      );
    }
    if (!existing) {
      this.registeredWorkers.set(cleanNullifier, cleanWallet);
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const payload = {
      schemaVersion: 'GIGVAULT_IDENTITY_ASSERTION_V1' as const,
      providerId: this.providerId,
      workerIdentityNullifier: cleanNullifier,
      workerWalletAddress: cleanWallet,
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
   * 
   * Security Invariants:
   * 1. Rejects untrusted / self-signed attacker public keys not in trustedIdpPublicKeys.
   * 2. Uses trusted server clock for expiry. Never permits caller-supplied backdated timestamps.
   * 3. Verifies cryptographic secp256k1 signature against pinned key.
   */
  public verifyAssertion(
    assertion: VerifiedIdentityAssertion,
    trustedServerTimeSec?: number
  ): { valid: boolean; workerIdentityNullifier: string; workerWalletAddress: string } {
    if (assertion.schemaVersion !== 'GIGVAULT_IDENTITY_ASSERTION_V1') {
      throw new Error(`Unsupported identity assertion schema: ${assertion.schemaVersion}`);
    }
    if (assertion.providerId !== this.providerId) {
      throw new Error(`Unrecognized identity provider: ${assertion.providerId}`);
    }

    // PINNED TRUST CHECK: Reject attacker-controlled / self-signed keys
    if (!this.trustedIdpPublicKeys.has(assertion.idpPublicKey)) {
      throw new Error('Untrusted identity provider public key: key not recognized by Attestation Authority');
    }

    // Always use trusted server clock
    const nowSec = trustedServerTimeSec ?? Math.floor(Date.now() / 1000);
    if (nowSec > assertion.expiresAt) {
      throw new Error(`Identity assertion expired at ${assertion.expiresAt} (server time: ${nowSec})`);
    }
    if (assertion.issuedAt > nowSec + 60) {
      throw new Error(`Identity assertion issuedAt is in the future: ${assertion.issuedAt}`);
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
