/**
 * GigVault - Aadhaar Proof Verification Types
 * 
 * Defines type contracts and explicit separation between:
 * - Mode A: Real Anon Aadhaar (Groth16 cryptographic proof over UIDAI RSA signature)
 * - Mode B: Mock Aadhaar (Cryptographically signed synthetic assertion for hackathon personas)
 * 
 * Non-negotiable Security Invariants:
 * 1. Real and Mock modes must NEVER be interchangeable.
 * 2. Mock identities must NEVER be accepted as real Aadhaar identities.
 * 3. Never receive or persist Aadhaar numbers, Aadhaar QR payloads, or demographic data.
 */

import crypto from 'node:crypto';
import type { VerifiedIdentityAssertion } from '../types.js';

export type AadhaarTrustMode = 'SYNTHETIC_MOCK_IDP' | 'REAL_ANON_AADHAAR';

/**
 * SnarkJS / Groth16 proof format produced by Anon Aadhaar circuit.
 */
export interface AnonAadhaarGroth16Proof {
  pi_a: string[];
  pi_b: string[][];
  pi_c: string[];
  protocol: 'groth16';
  curve?: string;
}

/**
 * Real Anon Aadhaar payload submitted by client.
 */
export interface AnonAadhaarProofPayload {
  groth16Proof: AnonAadhaarGroth16Proof;
  pubkeyHash: string;
  nullifier: string;
  timestamp: number;
  nullifierSeed: string;
  signal: string; // Must bind to session signal (deriveAnonAadhaarSessionSignal)
  ageAbove18?: boolean;
  gender?: string;
  pincode?: string;
  state?: string;
  publicSignals?: string[]; // Raw public signal vector from Groth16 proof
}

/**
 * Synthetic Mock Aadhaar payload submitted by client.
 */
export interface MockAadhaarPayload {
  assertion: VerifiedIdentityAssertion;
}

/**
 * Request to verify Aadhaar identity.
 */
export interface VerifyAadhaarRequest {
  mode: AadhaarTrustMode;
  expectedWalletAddress: string;
  expectedChallenge: string;
  sessionId: string;
  realProofPayload?: AnonAadhaarProofPayload;
  mockAssertionPayload?: MockAadhaarPayload;
}

/**
 * Result of Aadhaar identity verification.
 */
export interface VerifyAadhaarResult {
  valid: boolean;
  mode: AadhaarTrustMode;
  identityNullifier: string;
  workerId?: string;
  verifiedAt: number;
  error?: string;
  verificationStatus?: RealVerificationStatus;
  metadata?: {
    pubkeyHash?: string;
    timestamp?: number;
    nullifierSeed?: string;
    signal?: string;
    isTestKey?: boolean;
  };
}

export type RealVerificationStatus = 'VERIFIED' | 'NOT_YET_VERIFIED';

/**
 * Authenticated artifact provenance required for genuine production verification.
 */
export interface AnonAadhaarArtifactProvenance {
  circuit: string; // Must match official circuit identifier (e.g. 'anon-aadhaar-v2')
  releaseVersion: string; // Official release tag or commit
  artifactHash: string; // SHA-256 hex digest of verified production verification key
  authority: string; // Trusted authority (e.g. 'UIDAI_OFFICIAL' or 'ANON_AADHAAR_OFFICIAL')
  trustRegistryUri?: string;
  verifiedAt?: number;
}

export interface IAadhaarProofVerifier {
  getTrustMode(): AadhaarTrustMode;
  verify(request: VerifyAadhaarRequest): Promise<VerifyAadhaarResult>;
  getVerificationStatus?(): RealVerificationStatus;
}

/**
 * BN254 scalar field order (group order r)
 */
export const BN254_SCALAR_FIELD_ORDER: bigint =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/**
 * Supported Anon Aadhaar session-bound signal construction.
 * Binds sessionId, challengeNonce, and workerWalletAddress into a valid BN254 field element scalar.
 * Wallet-only signal binding is explicitly prohibited to prevent cross-session proof replay.
 */
export function deriveAnonAadhaarSessionSignal(
  sessionId: string,
  challengeNonce: string,
  walletAddress: string
): string {
  const cleanSession = sessionId.trim();
  const cleanChallenge = challengeNonce.toLowerCase().trim();
  const cleanWallet = walletAddress.toLowerCase().trim();

  const digest = crypto
    .createHash('sha256')
    .update(`GIGVAULT_ANON_AADHAAR_SESSION_SIGNAL_V2:${cleanSession}:${cleanChallenge}:${cleanWallet}`, 'utf8')
    .digest('hex');

  const scalar = BigInt('0x' + digest) % BN254_SCALAR_FIELD_ORDER;
  return scalar.toString();
}

// Typed error definitions
export class AadhaarTrustModeMismatchError extends Error {
  constructor(expected: AadhaarTrustMode, actual: string) {
    super(`AadhaarTrustModeMismatch: expected verifier mode ${expected}, got ${actual}`);
    this.name = 'AadhaarTrustModeMismatchError';
  }
}

export class AnonAadhaarProofMalformedError extends Error {
  constructor(message: string) {
    super(`AnonAadhaarProofMalformed: ${message}`);
    this.name = 'AnonAadhaarProofMalformedError';
  }
}

export class AnonAadhaarProofTamperedError extends Error {
  constructor(message: string = 'Groth16 cryptographic proof verification failed') {
    super(`AnonAadhaarProofTampered: ${message}`);
    this.name = 'AnonAadhaarProofTamperedError';
  }
}

export class AnonAadhaarSignalBindingMismatchError extends Error {
  constructor(expected: string, received: string) {
    super(`AnonAadhaarSignalBindingMismatch: proof signal ${received} does not match expected binding ${expected}`);
    this.name = 'AnonAadhaarSignalBindingMismatchError';
  }
}

export class AnonAadhaarPubkeyNotTrustedError extends Error {
  constructor(pubkeyHash: string) {
    super(`AnonAadhaarPubkeyNotTrusted: public key hash ${pubkeyHash} is not in trusted root configuration`);
    this.name = 'AnonAadhaarPubkeyNotTrustedError';
  }
}

export class AnonAadhaarTestKeyAsProductionProhibitedError extends Error {
  constructor(pubkeyHash: string) {
    super(
      `AnonAadhaarTestKeyAsProductionProhibited: Staging/test public key hash ${pubkeyHash} cannot be registered or trusted as a genuine production root`
    );
    this.name = 'AnonAadhaarTestKeyAsProductionProhibitedError';
  }
}

export class AnonAadhaarVerificationKeyMissingError extends Error {
  constructor(message: string = 'Anon Aadhaar verification key not configured') {
    super(`AnonAadhaarVerificationKeyMissing: ${message}`);
    this.name = 'AnonAadhaarVerificationKeyMissingError';
  }
}

export class AnonAadhaarPublicSignalMismatchError extends Error {
  constructor(message: string) {
    super(`AnonAadhaarPublicSignalMismatch: ${message}`);
    this.name = 'AnonAadhaarPublicSignalMismatchError';
  }
}

export class MockAadhaarAssertionInvalidError extends Error {
  constructor(message: string) {
    super(`MockAadhaarAssertionInvalid: ${message}`);
    this.name = 'MockAadhaarAssertionInvalidError';
  }
}
