/**
 * GigVault - Mock Phone Verification Provider
 * 
 * Provides offline, deterministic, rate-limited phone possession verification for local development,
 * synthetic hackathon personas, and automated regression testing:
 * 
 * Invariants:
 * 1. Indian Mobile Validation: normalizes to E.164 (+91XXXXXXXXXX) and rejects invalid formats.
 * 2. Cryptographic Randomness: generates secure 6-digit numeric OTPs.
 * 3. Protected Verifier Storage: stores only salted SHA-256 hashes of OTPs, never plaintext.
 * 4. Timing-Attack Resistance: uses constant-time crypto.timingSafeEqual for code verification.
 * 5. Bounded Attempts: maximum 3 incorrect verification attempts before irreversible invalidation.
 * 6. Cooldown & Rate Limits: 60-second cooldown between resends; maximum 5 OTP dispatches per hour per phone.
 * 7. Single-Use Atomicity: successfully verified OTPs are atomically purged to block concurrent re-use.
 * 8. Zero Leakage: OTP codes are NEVER included in ordinary start/check return objects or production logs.
 * 9. Controlled Dev Access: local test retrieval is quarantined behind an explicit allowDevTestRetrieval flag.
 */

import crypto from 'node:crypto';
import {
  type IPhoneVerificationProvider,
  type StartVerificationParams,
  type StartVerificationResult,
  type CheckVerificationParams,
  type CheckVerificationResult,
  normalizeIndianPhoneNumber,
  maskIndianPhoneNumber,
  hashPhoneNumber,
  OtpCooldownActiveError,
  OtpRateLimitExceededError,
  InvalidOtpCodeError,
  OtpExpiredOrNotFoundError,
  OtpMaxAttemptsExceededError,
  DevTestRetrievalDisabledError,
} from './types.js';

interface StoredOtpRecord {
  phoneHash: string;
  normalizedPhone: string;
  hashedOtp: string;
  salt: string;
  expiresAt: number; // Unix seconds
  createdAt: number;
  attemptsRemaining: number;
}

export interface MockPhoneProviderOptions {
  hmacSecret?: string;
  otpExpirySeconds?: number; // Default 300 (5 mins)
  resendCooldownSeconds?: number; // Default 60 seconds
  resendCooldownSec?: number; // Alias for resendCooldownSeconds
  maxAttempts?: number; // Default 3 attempts
  maxHourlyRequests?: number; // Default 5 requests per hour
  maxAttemptsPerHour?: number; // Alias for maxHourlyRequests
  allowDevTestRetrieval?: boolean; // Set true ONLY in test/dev environments
}

export class MockPhoneVerificationProvider implements IPhoneVerificationProvider {
  public readonly providerName = 'MockPhoneVerificationProvider';
  public readonly isMockProvider = true;

  private hmacSecret: string;
  private otpExpirySeconds: number;
  private resendCooldownSeconds: number;
  private maxAttempts: number;
  private maxHourlyRequests: number;
  private allowDevTestRetrieval: boolean;

  // State maps
  private activeOtps: Map<string, StoredOtpRecord> = new Map(); // phoneHash -> record
  private requestTimestamps: Map<string, number[]> = new Map(); // phoneHash -> timestamps
  private devTestOtpCache: Map<string, string> = new Map(); // phoneHash -> plaintext OTP (dev only)

  constructor(options: MockPhoneProviderOptions = {}) {
    this.hmacSecret = options.hmacSecret || 'GIGVAULT_PHONE_MOCK_SALT_2026';
    this.otpExpirySeconds = options.otpExpirySeconds ?? 300;
    this.resendCooldownSeconds = options.resendCooldownSeconds ?? options.resendCooldownSec ?? 60;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.maxHourlyRequests = options.maxHourlyRequests ?? options.maxAttemptsPerHour ?? 5;
    this.allowDevTestRetrieval = options.allowDevTestRetrieval ?? false;
  }

  public normalizePhoneNumber(rawPhone: string): string {
    return normalizeIndianPhoneNumber(rawPhone);
  }

  public hashPhoneNumber(normalizedPhone: string): string {
    return hashPhoneNumber(normalizedPhone, this.hmacSecret);
  }

  public maskPhoneNumber(normalizedPhone: string): string {
    return maskIndianPhoneNumber(normalizedPhone);
  }

  /**
   * Internal hash calculation for OTP verifier.
   */
  private hashOtp(salt: string, code: string): string {
    return crypto.createHash('sha256').update(`${salt}:${code}`).digest('hex');
  }

  /**
   * Dispatch a new mock OTP.
   */
  public async startVerification(params: StartVerificationParams): Promise<StartVerificationResult> {
    const normalized = this.normalizePhoneNumber(params.phoneNumber);
    const pHash = this.hashPhoneNumber(normalized);
    const nowSec = Math.floor(Date.now() / 1000);

    // 1. Check rate limits (hourly bucket)
    const timestamps = (this.requestTimestamps.get(pHash) || []).filter((ts) => ts > nowSec - 3600);
    if (timestamps.length >= this.maxHourlyRequests) {
      throw new OtpRateLimitExceededError(
        `RateLimitExceeded: maximum of ${this.maxHourlyRequests} OTP dispatches per hour exceeded for this phone`
      );
    }

    // 2. Check resend cooldown
    const existing = this.activeOtps.get(pHash);
    if (existing && nowSec - existing.createdAt < this.resendCooldownSeconds) {
      const remainingCooldown = this.resendCooldownSeconds - (nowSec - existing.createdAt);
      throw new OtpCooldownActiveError(
        `CooldownActive: please wait ${remainingCooldown}s before requesting a new OTP`,
        remainingCooldown
      );
    }

    // 3. Generate cryptographically random 6-digit numeric OTP
    const rawOtp = crypto.randomInt(100000, 1000000).toString();
    const salt = crypto.randomBytes(16).toString('hex');
    const hashedOtp = this.hashOtp(salt, rawOtp);
    const expiresAt = nowSec + this.otpExpirySeconds;

    // 4. Invalidate any superseded record and save fresh record
    this.activeOtps.set(pHash, {
      phoneHash: pHash,
      normalizedPhone: normalized,
      hashedOtp,
      salt,
      expiresAt,
      createdAt: nowSec,
      attemptsRemaining: this.maxAttempts,
    });

    timestamps.push(nowSec);
    this.requestTimestamps.set(pHash, timestamps);

    const verificationId = `mock-verify-${crypto.randomBytes(8).toString('hex')}`;

    // 5. If dev/test retrieval is explicitly enabled, retain plaintext in private dev cache
    if (this.allowDevTestRetrieval) {
      this.devTestOtpCache.set(pHash, rawOtp);
      this.devTestOtpCache.set(verificationId, rawOtp);
    }

    return {
      verificationId,
      maskedPhoneNumber: this.maskPhoneNumber(normalized),
      expiresAt,
      cooldownSeconds: this.resendCooldownSeconds,
    };
  }

  /**
   * Verify an OTP code using timing-safe comparison.
   */
  public async checkVerification(params: CheckVerificationParams): Promise<CheckVerificationResult> {
    const normalized = this.normalizePhoneNumber(params.phoneNumber);
    const pHash = this.hashPhoneNumber(normalized);
    const nowSec = Math.floor(Date.now() / 1000);

    const record = this.activeOtps.get(pHash);
    if (!record || nowSec > record.expiresAt) {
      this.activeOtps.delete(pHash);
      this.devTestOtpCache.delete(pHash);
      throw new OtpExpiredOrNotFoundError('OtpExpiredOrNotFound: active OTP expired or does not exist');
    }

    if (record.attemptsRemaining <= 0) {
      this.activeOtps.delete(pHash);
      this.devTestOtpCache.delete(pHash);
      throw new OtpMaxAttemptsExceededError('OtpMaxAttemptsExceeded: verification attempts exhausted; request a new OTP');
    }

    // Decrement attempts counter
    record.attemptsRemaining--;

    // Timing-safe comparison of SHA-256 hashes
    const candidateHash = this.hashOtp(record.salt, params.code.trim());
    const candidateBuf = Buffer.from(candidateHash, 'hex');
    const storedBuf = Buffer.from(record.hashedOtp, 'hex');

    const isMatch = candidateBuf.length === storedBuf.length && crypto.timingSafeEqual(candidateBuf, storedBuf);

    if (!isMatch) {
      if (record.attemptsRemaining <= 0) {
        this.activeOtps.delete(pHash);
        this.devTestOtpCache.delete(pHash);
        throw new OtpMaxAttemptsExceededError('OtpMaxAttemptsExceeded: verification attempts exhausted; request a new OTP');
      }
      throw new InvalidOtpCodeError(
        `InvalidOtpCode: incorrect OTP code (${record.attemptsRemaining} attempt(s) remaining)`,
        record.attemptsRemaining
      );
    }

    // Atomic consumption: single-use enforcement
    this.activeOtps.delete(pHash);
    this.devTestOtpCache.delete(pHash);

    return {
      verified: true,
      normalizedPhoneNumber: normalized,
      phoneHash: pHash,
    };
  }

  /**
   * Isolated development/test helper to retrieve the mock OTP for automated integration tests.
   * Throws DevTestRetrievalDisabledError if allowDevTestRetrieval is false.
   */
  public getDevTestOtp(identifier: string): string {
    if (!this.allowDevTestRetrieval) {
      throw new DevTestRetrievalDisabledError(
        'DevTestRetrievalDisabled: mock OTP retrieval is disabled in this environment configuration'
      );
    }
    // Check direct match (e.g. verificationId)
    let otp = this.devTestOtpCache.get(identifier);
    if (!otp) {
      try {
        const normalized = this.normalizePhoneNumber(identifier);
        const pHash = this.hashPhoneNumber(normalized);
        otp = this.devTestOtpCache.get(pHash);
      } catch {
        // Not a phone number
      }
    }
    if (!otp) {
      throw new OtpExpiredOrNotFoundError('No active OTP found in dev test cache for this phone number or verification ID');
    }
    return otp;
  }
}
