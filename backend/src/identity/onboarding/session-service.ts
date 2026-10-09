/**
 * GigVault - Worker Onboarding Session Service
 * 
 * Orchestrates multi-step onboarding flow:
 * Session Creation (Challenge) -> Wallet EIP-191 Verification ->
 * Phone Possession OTP Verification -> Privacy-Preserving Aadhaar Proof ->
 * Atomic Registry Binding Commit.
 * 
 * Architectural & Security Invariants:
 * 1. Single-use, short-lived server challenge nonces.
 * 2. Strict state progression:
 *    SESSION_CREATED -> WALLET_VERIFIED -> PHONE_VERIFIED -> AADHAAR_VERIFIED -> COMMITTED.
 * 3. Phone possession alone CANNOT take over an existing Aadhaar identity.
 * 4. Replay and conflict resistance: Prevents duplicate nullifier, wallet, or phone registration.
 * 5. Expired or revoked sessions fail closed.
 * 6. Never stores plaintext Aadhaar numbers or raw phone numbers.
 */

import crypto from 'node:crypto';
import { ethers } from 'ethers';
import type { IPhoneVerificationProvider } from '../phone/types.js';
import { normalizeIndianPhoneNumber, maskIndianPhoneNumber, hashPhoneNumber } from '../phone/types.js';
import type { IAadhaarProofVerifier } from '../aadhaar/types.js';
import { MockAadhaarVerifier } from '../aadhaar/mock-verifier.js';
import { RealAnonAadhaarVerifier } from '../aadhaar/real-verifier.js';
import type { IWorkerOnboardingRegistry } from './registry.js';
import { WorkerOnboardingRegistry } from './registry.js';
import {
  type OnboardingSession,
  type CreateSessionParams,
  type VerifyWalletStepParams,
  type RequestPhoneOtpStepParams,
  type VerifyPhoneOtpStepParams,
  type VerifyAadhaarStepParams,
  type CommitOnboardingResult,
  type WorkerOnboardingRecord,
  OnboardingSessionNotFoundError,
  OnboardingSessionExpiredError,
  OnboardingSessionRevokedError,
  OnboardingSessionStateError,
  IdentityNullifierAlreadyClaimedError,
  WalletAlreadyBoundError,
  PhoneAlreadyBoundError,
  IdentityTakeoverProhibitedError,
} from './types.js';

export function formatOnboardingChallengeMessage(sessionId: string, nonce: string, walletAddress: string): string {
  return [
    'GigVault Worker Onboarding Challenge',
    `Session: ${sessionId}`,
    `Challenge: ${nonce}`,
    `Wallet: ${walletAddress.toLowerCase().trim()}`,
  ].join('\n');
}

export interface OnboardingSessionServiceOptions {
  registry?: IWorkerOnboardingRegistry;
  phoneProvider: IPhoneVerificationProvider;
  mockAadhaarVerifier?: IAadhaarProofVerifier;
  realAadhaarVerifier?: IAadhaarProofVerifier;
  phoneHmacSecret?: string;
  defaultSessionTtlSec?: number;
  defaultChallengeTtlSec?: number;
}

export class OnboardingSessionService {
  private registry: IWorkerOnboardingRegistry;
  private phoneProvider: IPhoneVerificationProvider;
  private mockAadhaarVerifier: IAadhaarProofVerifier;
  private realAadhaarVerifier: IAadhaarProofVerifier;
  private phoneHmacSecret?: string;
  private defaultSessionTtlSec: number;
  private defaultChallengeTtlSec: number;
  private sessions: Map<string, OnboardingSession> = new Map();

  constructor(options: OnboardingSessionServiceOptions) {
    this.registry = options.registry || new WorkerOnboardingRegistry();
    this.phoneProvider = options.phoneProvider;
    this.mockAadhaarVerifier = options.mockAadhaarVerifier || new MockAadhaarVerifier();
    this.realAadhaarVerifier = options.realAadhaarVerifier || new RealAnonAadhaarVerifier();
    this.phoneHmacSecret = options.phoneHmacSecret;
    this.defaultSessionTtlSec = options.defaultSessionTtlSec ?? 1800; // 30 mins
    this.defaultChallengeTtlSec = options.defaultChallengeTtlSec ?? 300; // 5 mins
  }

  public getRegistry(): IWorkerOnboardingRegistry {
    return this.registry;
  }

  public getPhoneProvider(): IPhoneVerificationProvider {
    return this.phoneProvider;
  }

  private assertSessionActive(session: OnboardingSession): void {
    const now = Date.now();
    if (session.state === 'REVOKED') {
      throw new OnboardingSessionRevokedError(session.sessionId, session.revocationReason);
    }
    if (session.state === 'EXPIRED' || now > session.expiresAt) {
      session.state = 'EXPIRED';
      throw new OnboardingSessionExpiredError(session.sessionId);
    }
  }

  /**
   * Step 1: Create a new onboarding session and issue a cryptographically random challenge nonce.
   */
  public async createSession(params: CreateSessionParams = {}): Promise<OnboardingSession> {
    const now = Date.now();
    const sessionId = crypto.randomUUID();
    const challengeNonce = '0x' + crypto.randomBytes(32).toString('hex');
    const challengeTtl = (params.challengeTtlSeconds ?? this.defaultChallengeTtlSec) * 1000;
    const sessionTtl = (params.ttlSeconds ?? this.defaultSessionTtlSec) * 1000;

    const session: OnboardingSession = {
      sessionId,
      challengeNonce,
      challengeExpiresAt: now + challengeTtl,
      walletAddress: params.walletAddress ? params.walletAddress.toLowerCase().trim() : undefined,
      state: 'SESSION_CREATED',
      createdAt: now,
      expiresAt: now + sessionTtl,
    };

    this.sessions.set(sessionId, session);
    return { ...session };
  }

  /**
   * Step 2: Verify that the claimed EVM wallet signed the server's challenge nonce via personal_sign.
   */
  public async verifyWallet(params: VerifyWalletStepParams): Promise<OnboardingSession> {
    const session = this.sessions.get(params.sessionId);
    if (!session) {
      throw new OnboardingSessionNotFoundError(params.sessionId);
    }
    this.assertSessionActive(session);

    if (session.state !== 'SESSION_CREATED') {
      throw new OnboardingSessionStateError('SESSION_CREATED', session.state);
    }

    const now = Date.now();
    if (now > session.challengeExpiresAt) {
      throw new Error('OnboardingChallengeExpired: wallet challenge has expired; please create a new session');
    }

    const cleanWallet = params.walletAddress.toLowerCase().trim();

    // Verify EVM personal_sign
    const expectedMessage = formatOnboardingChallengeMessage(
      session.sessionId,
      session.challengeNonce,
      cleanWallet
    );

    let recoveredAddress: string;
    try {
      recoveredAddress = ethers.verifyMessage(expectedMessage, params.signature);
    } catch (err) {
      throw new Error(`InvalidWalletSignature: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (recoveredAddress.toLowerCase().trim() !== cleanWallet) {
      throw new Error(
        `WalletSignatureMismatch: expected signature from ${cleanWallet}, recovered ${recoveredAddress}`
      );
    }

    // Check if wallet is already bound to an active registered worker
    const existingBinding = await this.registry.findByWallet(cleanWallet);
    if (existingBinding) {
      throw new WalletAlreadyBoundError(cleanWallet, existingBinding.workerId);
    }

    session.walletAddress = cleanWallet;
    session.walletVerifiedAt = now;
    session.state = 'WALLET_VERIFIED';

    return { ...session };
  }

  /**
   * Step 3: Request phone verification OTP for Indian mobile number.
   */
  public async requestPhoneOtp(
    params: RequestPhoneOtpStepParams
  ): Promise<{ sessionId: string; verificationId: string; phoneMasked: string; cooldownSeconds: number }> {
    const session = this.sessions.get(params.sessionId);
    if (!session) {
      throw new OnboardingSessionNotFoundError(params.sessionId);
    }
    this.assertSessionActive(session);

    if (session.state !== 'WALLET_VERIFIED') {
      throw new OnboardingSessionStateError('WALLET_VERIFIED', session.state);
    }

    const normalizedPhone = normalizeIndianPhoneNumber(params.phoneNumber);
    const phoneHash = hashPhoneNumber(normalizedPhone, this.phoneHmacSecret);
    const phoneMasked = maskIndianPhoneNumber(normalizedPhone);

    // Prevent claiming a phone number already linked to another active worker identity
    const existingPhoneWorker = await this.registry.findByPhoneHash(phoneHash);
    if (existingPhoneWorker) {
      throw new PhoneAlreadyBoundError(phoneMasked);
    }

    const startResult = await this.phoneProvider.startVerification({
      phoneNumber: normalizedPhone,
      customSessionId: session.sessionId,
    });

    session.phoneNumberNormalized = normalizedPhone;
    session.phoneHash = phoneHash;
    session.phoneMasked = phoneMasked;
    session.phoneVerificationId = startResult.verificationId;

    return {
      sessionId: session.sessionId,
      verificationId: startResult.verificationId,
      phoneMasked,
      cooldownSeconds: startResult.cooldownSeconds,
    };
  }

  /**
   * Step 4: Verify submitted OTP code for phone possession.
   */
  public async verifyPhoneOtp(params: VerifyPhoneOtpStepParams): Promise<OnboardingSession> {
    const session = this.sessions.get(params.sessionId);
    if (!session) {
      throw new OnboardingSessionNotFoundError(params.sessionId);
    }
    this.assertSessionActive(session);

    if (session.state !== 'WALLET_VERIFIED' || !session.phoneNumberNormalized) {
      throw new OnboardingSessionStateError('WALLET_VERIFIED', session.state);
    }

    const checkResult = await this.phoneProvider.checkVerification({
      phoneNumber: session.phoneNumberNormalized,
      code: params.otpCode,
    });

    if (!checkResult.verified) {
      throw new Error('Phone verification failed: invalid or expired OTP code');
    }

    const now = Date.now();
    session.phoneVerifiedAt = now;
    session.state = 'PHONE_VERIFIED';

    return { ...session };
  }

  /**
   * Step 5: Verify privacy-preserving Aadhaar proof or Mock IDP assertion.
   */
  public async verifyAadhaar(params: VerifyAadhaarStepParams): Promise<OnboardingSession> {
    const session = this.sessions.get(params.sessionId);
    if (!session) {
      throw new OnboardingSessionNotFoundError(params.sessionId);
    }
    this.assertSessionActive(session);

    if (session.state !== 'PHONE_VERIFIED') {
      throw new OnboardingSessionStateError('PHONE_VERIFIED', session.state);
    }

    if (!session.walletAddress) {
      throw new Error('Missing verified wallet address on session');
    }

    let result;
    if (params.mode === 'SYNTHETIC_MOCK_IDP') {
      result = await this.mockAadhaarVerifier.verify({
        mode: 'SYNTHETIC_MOCK_IDP',
        expectedWalletAddress: session.walletAddress,
        expectedChallenge: session.challengeNonce,
        sessionId: session.sessionId,
        mockAssertionPayload: params.mockAssertionPayload,
      });
    } else if (params.mode === 'REAL_ANON_AADHAAR') {
      result = await this.realAadhaarVerifier.verify({
        mode: 'REAL_ANON_AADHAAR',
        expectedWalletAddress: session.walletAddress,
        expectedChallenge: session.challengeNonce,
        sessionId: session.sessionId,
        realProofPayload: params.realProofPayload,
      });
    } else {
      throw new Error(`Unsupported Aadhaar trust mode: ${params.mode}`);
    }

    if (!result.valid || !result.identityNullifier) {
      throw new Error(`Aadhaar proof verification failed: ${result.error || 'unspecified failure'}`);
    }

    // Check registry: ensure this identity nullifier is not already bound to another wallet
    const cleanNullifier = result.identityNullifier.toLowerCase().trim();
    const existingRecord = await this.registry.findByIdentityNullifier(cleanNullifier);

    if (existingRecord) {
      if (existingRecord.walletAddress.toLowerCase().trim() !== session.walletAddress.toLowerCase().trim()) {
        throw new IdentityNullifierAlreadyClaimedError(cleanNullifier, existingRecord.walletAddress);
      }
    }

    const now = Date.now();
    session.identityNullifier = cleanNullifier;
    session.identityTrustMode = result.mode;
    session.aadhaarVerifiedAt = now;
    session.state = 'AADHAAR_VERIFIED';

    return { ...session };
  }

  /**
   * Step 6: Atomically commit the onboarding binding into the persistent registry.
   */
  public async commitBinding(sessionId: string): Promise<CommitOnboardingResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new OnboardingSessionNotFoundError(sessionId);
    }
    this.assertSessionActive(session);

    if (session.state !== 'AADHAAR_VERIFIED') {
      throw new OnboardingSessionStateError('AADHAAR_VERIFIED', session.state);
    }

    if (
      !session.walletAddress ||
      !session.identityNullifier ||
      !session.identityTrustMode ||
      !session.phoneHash ||
      !session.phoneMasked
    ) {
      throw new Error('OnboardingSessionIncomplete: missing required verified attributes for commit');
    }

    const cleanWallet = session.walletAddress.toLowerCase().trim();
    const cleanNullifier = session.identityNullifier.toLowerCase().trim();

    // Determine canonical worker ID
    const workerId = `WRK_${cleanNullifier.slice(0, 10)}_${cleanWallet.slice(2, 8)}`;
    const now = Date.now();

    const record: WorkerOnboardingRecord = {
      workerId,
      walletAddress: cleanWallet,
      identityNullifier: cleanNullifier,
      identityTrustMode: session.identityTrustMode,
      phoneHash: session.phoneHash,
      phoneMasked: session.phoneMasked,
      bindingVersion: 1,
      createdAt: now,
      updatedAt: now,
      status: 'ACTIVE',
      auditLog: [
        {
          action: 'ONBOARDING_COMMITTED',
          timestamp: now,
          details: `Session ${sessionId} completed via ${session.identityTrustMode}`,
        },
      ],
    };

    // Atomic registry registration
    await this.registry.registerWorker(record);

    // Scrub transient in-memory raw phone immediately upon commit
    delete session.phoneNumberNormalized;

    session.state = 'COMMITTED';
    session.committedWorkerId = workerId;

    return {
      workerId,
      walletAddress: cleanWallet,
      identityNullifier: cleanNullifier,
      identityTrustMode: session.identityTrustMode,
      phoneMasked: session.phoneMasked,
      bindingVersion: 1,
      committedAt: now,
    };
  }

  /**
   * Revoke an onboarding session.
   */
  public async revokeSession(sessionId: string, reason?: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new OnboardingSessionNotFoundError(sessionId);
    }
    session.state = 'REVOKED';
    session.revocationReason = reason;
  }

  /**
   * Retrieve active session state.
   */
  public async getSession(sessionId: string): Promise<OnboardingSession> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new OnboardingSessionNotFoundError(sessionId);
    }
    this.assertSessionActive(session);
    return { ...session };
  }
}
