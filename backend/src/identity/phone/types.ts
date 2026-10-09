/**
 * GigVault - Phone Verification Provider Types & Interface
 * 
 * Defines the pluggable interface for phone possession verification:
 * - MockPhoneVerificationProvider: Offline, deterministic, rate-limited mock for testing.
 * - TwilioVerifyPhoneProvider: Optional production SMS adapter via Twilio Verify API.
 * 
 * Invariants:
 * 1. Plaintext phone numbers must NEVER be exposed in public API logs or blockchain records.
 * 2. OTP codes must NEVER appear in ordinary API responses.
 * 3. Constant-time comparisons for verifiers to avoid timing side-channels.
 * 4. Single-use OTPs with bounded attempt counters and resend cooldowns.
 */

import crypto from 'node:crypto';

export interface StartVerificationParams {
  phoneNumber: string; // Indian mobile number (formatted or raw)
  customSessionId?: string;
}

export interface StartVerificationResult {
  verificationId: string;
  maskedPhoneNumber: string; // e.g. "+91******3210"
  expiresAt: number; // Unix seconds
  cooldownSeconds: number;
}

export interface CheckVerificationParams {
  phoneNumber: string;
  code: string; // User-submitted OTP code
}

export interface CheckVerificationResult {
  verified: boolean;
  normalizedPhoneNumber: string;
  phoneHash: string; // Keyed HMAC representation for storage
}

export interface IPhoneVerificationProvider {
  readonly providerName: string;
  readonly isMockProvider: boolean;

  /**
   * Normalize an Indian mobile number to E.164 format (+91XXXXXXXXXX).
   * Throws InvalidPhoneNumberError if input does not represent a valid 10-digit Indian mobile.
   */
  normalizePhoneNumber(rawPhone: string): string;

  /**
   * Derive a keyed HMAC hash of the normalized phone number.
   */
  hashPhoneNumber(normalizedPhone: string): string;

  /**
   * Mask a phone number for user-facing display without leaking the full number.
   */
  maskPhoneNumber(normalizedPhone: string): string;

  /**
   * Start OTP delivery to the phone number.
   */
  startVerification(params: StartVerificationParams): Promise<StartVerificationResult>;

  /**
   * Verify the submitted OTP code.
   */
  checkVerification(params: CheckVerificationParams): Promise<CheckVerificationResult>;
}

// Error Classes
export class InvalidPhoneNumberError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPhoneNumberError';
  }
}

export class OtpCooldownActiveError extends Error {
  public readonly retryAfterSeconds: number;
  constructor(message: string, retryAfterSeconds: number) {
    super(message);
    this.name = 'OtpCooldownActiveError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class OtpRateLimitExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OtpRateLimitExceededError';
  }
}

export class InvalidOtpCodeError extends Error {
  public readonly attemptsRemaining: number;
  constructor(message: string, attemptsRemaining: number) {
    super(message);
    this.name = 'InvalidOtpCodeError';
    this.attemptsRemaining = attemptsRemaining;
  }
}

export class OtpExpiredOrNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OtpExpiredOrNotFoundError';
  }
}

export class OtpMaxAttemptsExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OtpMaxAttemptsExceededError';
  }
}

export class DevTestRetrievalDisabledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DevTestRetrievalDisabledError';
  }
}

export class TwilioProviderNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TwilioProviderNotConfiguredError';
  }
}

/**
 * Standard utility: Validate and normalize Indian mobile phone number to E.164 (+91XXXXXXXXXX).
 * 
 * Valid Indian mobile rules:
 * - Country code +91
 * - 10 digits starting with 6, 7, 8, or 9
 */
export function normalizeIndianPhoneNumber(raw: string): string {
  if (!raw || typeof raw !== 'string') {
    throw new InvalidPhoneNumberError('Invalid phone number: empty or non-string input');
  }

  // Remove whitespace, hyphens, parentheses, and dots
  const cleaned = raw.replace(/[\s\-\(\)\.]/g, '');

  let digits = '';
  if (cleaned.startsWith('+91')) {
    digits = cleaned.slice(3);
  } else if (cleaned.startsWith('091')) {
    digits = cleaned.slice(3);
  } else if (cleaned.startsWith('91') && cleaned.length === 12) {
    digits = cleaned.slice(2);
  } else if (cleaned.startsWith('0') && cleaned.length === 11) {
    digits = cleaned.slice(1);
  } else {
    digits = cleaned;
  }

  // Check that digits is exactly 10 numeric characters
  if (!/^\d{10}$/.test(digits)) {
    throw new InvalidPhoneNumberError(
      `Invalid Indian mobile number: expected 10 digits, got '${digits}' (from '${raw}')`
    );
  }

  // First digit must be 6, 7, 8, or 9 for Indian cellular networks
  const firstDigit = digits.charAt(0);
  if (!['6', '7', '8', '9'].includes(firstDigit)) {
    throw new InvalidPhoneNumberError(
      `Invalid Indian mobile number: must start with 6, 7, 8, or 9, got '${firstDigit}'`
    );
  }

  return `+91${digits}`;
}

/**
 * Mask an E.164 Indian mobile number (+91XXXXXXXXXX) -> +91******XXXX
 */
export function maskIndianPhoneNumber(e164Phone: string): string {
  if (!e164Phone.startsWith('+91') || e164Phone.length !== 13) {
    return '+91******XXXX';
  }
  const last4 = e164Phone.slice(-4);
  return `+91******${last4}`;
}

/**
 * Deterministically hash a normalized phone number with an HMAC key.
 */
export function hashPhoneNumber(normalizedPhone: string, secretKey = 'GIGVAULT_PHONE_SALT_DEFAULT'): string {
  return crypto.createHmac('sha256', secretKey).update(normalizedPhone).digest('hex');
}
