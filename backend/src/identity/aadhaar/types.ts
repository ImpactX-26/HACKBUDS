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
  signal: string; // Must bind to wallet address or session challenge
  ageAbove18?: boolean;
  gender?: string;
  pincode?: string;
  state?: string;
  publicSignals?: string[]; // Raw public signal vector if available
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
  metadata?: {
    pubkeyHash?: string;
    timestamp?: number;
    nullifierSeed?: string;
    signal?: string;
  };
}

export interface IAadhaarProofVerifier {
  getTrustMode(): AadhaarTrustMode;
  verify(request: VerifyAadhaarRequest): Promise<VerifyAadhaarResult>;
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

export class AnonAadhaarVerificationKeyMissingError extends Error {
  constructor(message: string = 'Anon Aadhaar verification key not configured') {
    super(`AnonAadhaarVerificationKeyMissing: ${message}`);
    this.name = 'AnonAadhaarVerificationKeyMissingError';
  }
}

export class MockAadhaarAssertionInvalidError extends Error {
  constructor(message: string) {
    super(`MockAadhaarAssertionInvalid: ${message}`);
    this.name = 'MockAadhaarAssertionInvalidError';
  }
}
