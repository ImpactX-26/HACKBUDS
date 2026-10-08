/**
 * GigVault - Worker Onboarding & Identity Binding Types
 * 
 * Defines schemas, states, and error types for:
 * 1. Multi-step onboarding sessions (wallet -> phone -> Aadhaar -> commit)
 * 2. Privacy-preserving durable worker onboarding registry
 * 3. Recovery and audit logs without private demographic or financial data
 */

import type { AadhaarTrustMode } from '../aadhaar/types.js';

export type OnboardingSessionState =
  | 'SESSION_CREATED'
  | 'WALLET_VERIFIED'
  | 'PHONE_VERIFIED'
  | 'AADHAAR_VERIFIED'
  | 'COMMITTED'
  | 'REVOKED'
  | 'EXPIRED';

export interface OnboardingAuditEntry {
  action: string;
  timestamp: number;
  details?: string;
}

export interface WorkerOnboardingRecord {
  workerId: string;
  walletAddress: string; // Lowercase EIP-55 hex
  identityNullifier: string;
  identityTrustMode: AadhaarTrustMode;
  phoneHash: string; // Keyed HMAC-SHA256 of E.164 phone number
  phoneMasked: string; // e.g. +91******4321
  bindingVersion: number;
  createdAt: number;
  updatedAt: number;
  status: 'ACTIVE' | 'REVOKED';
  auditLog: OnboardingAuditEntry[];
}

export interface OnboardingSession {
  sessionId: string;
  challengeNonce: string; // 32-byte hex nonce issued by server
  challengeExpiresAt: number;
  walletAddress?: string;
  walletVerifiedAt?: number;
  phoneNumberNormalized?: string; // Transient in-memory only during active session
  phoneHash?: string;
  phoneMasked?: string;
  phoneVerificationId?: string;
  phoneVerifiedAt?: number;
  identityNullifier?: string;
  identityTrustMode?: AadhaarTrustMode;
  aadhaarVerifiedAt?: number;
  state: OnboardingSessionState;
  createdAt: number;
  expiresAt: number;
  committedWorkerId?: string;
  revocationReason?: string;
}

export interface CreateSessionParams {
  walletAddress?: string; // Optional preliminary wallet address
  ttlSeconds?: number; // Session TTL (default 1800s / 30m)
  challengeTtlSeconds?: number; // Challenge nonce TTL (default 300s / 5m)
}

export interface VerifyWalletStepParams {
  sessionId: string;
  walletAddress: string;
  signature: string; // EIP-191 personal_sign over the server challenge
}

export interface RequestPhoneOtpStepParams {
  sessionId: string;
  phoneNumber: string; // Raw input (normalized by service)
}

export interface VerifyPhoneOtpStepParams {
  sessionId: string;
  otpCode: string;
}

export interface VerifyAadhaarStepParams {
  sessionId: string;
  mode: AadhaarTrustMode;
  realProofPayload?: import('../aadhaar/types.js').AnonAadhaarProofPayload;
  mockAssertionPayload?: import('../aadhaar/types.js').MockAadhaarPayload;
}

export interface CommitOnboardingResult {
  workerId: string;
  walletAddress: string;
  identityNullifier: string;
  identityTrustMode: AadhaarTrustMode;
  phoneMasked: string;
  bindingVersion: number;
  committedAt: number;
}

// Typed error definitions
export class OnboardingSessionNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`OnboardingSessionNotFound: session ${sessionId} does not exist`);
    this.name = 'OnboardingSessionNotFoundError';
  }
}

export class OnboardingSessionExpiredError extends Error {
  constructor(sessionId: string) {
    super(`OnboardingSessionExpired: session ${sessionId} has expired`);
    this.name = 'OnboardingSessionExpiredError';
  }
}

export class OnboardingSessionRevokedError extends Error {
  constructor(sessionId: string, reason?: string) {
    super(`OnboardingSessionRevoked: session ${sessionId} was revoked (${reason || 'no reason'})`);
    this.name = 'OnboardingSessionRevokedError';
  }
}

export class OnboardingSessionStateError extends Error {
  constructor(expected: OnboardingSessionState | OnboardingSessionState[], actual: OnboardingSessionState) {
    super(`OnboardingSessionStateError: expected state ${Array.isArray(expected) ? expected.join(' or ') : expected}, got ${actual}`);
    this.name = 'OnboardingSessionStateError';
  }
}

export class IdentityNullifierAlreadyClaimedError extends Error {
  constructor(nullifier: string, existingWallet: string) {
    super(`IdentityNullifierAlreadyClaimed: identity nullifier ${nullifier} is already bound to wallet ${existingWallet}`);
    this.name = 'IdentityNullifierAlreadyClaimedError';
  }
}

export class WalletAlreadyBoundError extends Error {
  constructor(walletAddress: string, existingWorkerId: string) {
    super(`WalletAlreadyBound: wallet ${walletAddress} is already registered to worker ${existingWorkerId}`);
    this.name = 'WalletAlreadyBoundError';
  }
}

export class PhoneAlreadyBoundError extends Error {
  constructor(phoneMasked: string) {
    super(`PhoneAlreadyBound: phone number (${phoneMasked}) is already bound to another active worker identity`);
    this.name = 'PhoneAlreadyBoundError';
  }
}

export class IdentityTakeoverProhibitedError extends Error {
  constructor(message: string = 'Phone possession alone cannot take over an existing Aadhaar identity') {
    super(`IdentityTakeoverProhibited: ${message}`);
    this.name = 'IdentityTakeoverProhibitedError';
  }
}

export class UnauthorizedRecoveryError extends Error {
  constructor(message: string = 'Wallet rotation or recovery requires existing authority and explicit reauthorization') {
    super(`UnauthorizedRecovery: ${message}`);
    this.name = 'UnauthorizedRecoveryError';
  }
}
