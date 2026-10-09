/**
 * GigVault - Twilio Verify Phone Provider (Optional Live SMS Adapter)
 * 
 * Provides an optional production SMS verification adapter via Twilio Verify API v2:
 * 
 * Architectural & Regulatory Notes:
 * 1. Indian DLT Compliance:
 *    Under Telecom Regulatory Authority of India (TRAI) regulations, all SMS traffic
 *    dispatched to Indian mobile numbers (+91) requires pre-registration on a
 *    Distributed Ledger Technology (DLT) platform (e.g. Vilpower, PingConnect, JIO DLT).
 *    A registered Principal Entity (PE) ID, approved Sender ID (Header), and pre-approved
 *    Content Template ID are mandatory to avoid telecom carrier filtering.
 * 2. Fail-Closed Design:
 *    When unconfigured, disabled, or encountering network/provider errors, this adapter
 *    STRICTLY FAILS CLOSED. It never silently falls back to a simulated or mock OTP.
 * 3. Secret Isolation:
 *    Twilio Account SID, Auth Token, and Service SID are strictly kept server-side.
 */

import {
  type IPhoneVerificationProvider,
  type StartVerificationParams,
  type StartVerificationResult,
  type CheckVerificationParams,
  type CheckVerificationResult,
  normalizeIndianPhoneNumber,
  maskIndianPhoneNumber,
  hashPhoneNumber,
  TwilioProviderNotConfiguredError,
  InvalidOtpCodeError,
  OtpExpiredOrNotFoundError,
  OtpRateLimitExceededError,
} from './types.js';

export interface TwilioVerifyConfig {
  accountSid?: string;
  authToken?: string;
  serviceSid?: string;
  verifyServiceSid?: string; // Common alias for serviceSid
  enabled?: boolean;
  hmacSecret?: string;
  customFetch?: typeof fetch; // Injected for unit testing without live network calls
}

export class TwilioVerifyPhoneProvider implements IPhoneVerificationProvider {
  public readonly providerName = 'TwilioVerifyPhoneProvider';
  public readonly isMockProvider = false;

  private accountSid?: string;
  private authToken?: string;
  private serviceSid?: string;
  private enabled: boolean;
  private hmacSecret: string;
  private fetchFn: typeof fetch;

  constructor(config: TwilioVerifyConfig = {}) {
    this.accountSid = config.accountSid;
    this.authToken = config.authToken;
    this.serviceSid = config.serviceSid || config.verifyServiceSid;
    this.enabled = config.enabled ?? false;
    this.hmacSecret = config.hmacSecret || 'GIGVAULT_TWILIO_PHONE_SALT_2026';
    this.fetchFn = config.customFetch || fetch;
  }

  public isConfigured(): boolean {
    return Boolean(this.enabled && this.accountSid && this.authToken && this.serviceSid);
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

  private assertConfigured(): void {
    if (!this.enabled || !this.accountSid || !this.authToken || !this.serviceSid) {
      throw new TwilioProviderNotConfiguredError(
        'TwilioVerifyNotConfigured: Twilio Verify credentials (accountSid, authToken, serviceSid) are missing or provider is disabled. Backend A fails closed.'
      );
    }
  }

  private getAuthHeader(): string {
    const creds = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');
    return `Basic ${creds}`;
  }

  /**
   * Start Twilio Verify SMS verification dispatch.
   */
  public async startVerification(params: StartVerificationParams): Promise<StartVerificationResult> {
    this.assertConfigured();
    const normalized = this.normalizePhoneNumber(params.phoneNumber);

    const url = `https://verify.twilio.com/v2/Services/${this.serviceSid}/Verifications`;
    const body = new URLSearchParams({
      To: normalized,
      Channel: 'sms',
    });

    const response = await this.fetchFn(url, {
      method: 'POST',
      headers: {
        Authorization: this.getAuthHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    const resJson = (await response.json().catch(() => ({}))) as any;

    if (!response.ok) {
      if (response.status === 429 || resJson.code === 60203) {
        throw new OtpRateLimitExceededError('Twilio rate limit exceeded: maximum verification attempts reached');
      }
      throw new Error(`Twilio Verify start failed (${response.status}): ${resJson.message || response.statusText}`);
    }

    const expiresAt = Math.floor(Date.now() / 1000) + 600; // Twilio Verify codes default to 10 minutes

    return {
      verificationId: resJson.sid || 'twilio-verification',
      maskedPhoneNumber: this.maskPhoneNumber(normalized),
      expiresAt,
      cooldownSeconds: 60,
    };
  }

  /**
   * Check submitted verification code against Twilio Verify API.
   */
  public async checkVerification(params: CheckVerificationParams): Promise<CheckVerificationResult> {
    this.assertConfigured();
    const normalized = this.normalizePhoneNumber(params.phoneNumber);

    const url = `https://verify.twilio.com/v2/Services/${this.serviceSid}/VerificationCheck`;
    const body = new URLSearchParams({
      To: normalized,
      Code: params.code.trim(),
    });

    const response = await this.fetchFn(url, {
      method: 'POST',
      headers: {
        Authorization: this.getAuthHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    const resJson = (await response.json().catch(() => ({}))) as any;

    if (!response.ok) {
      if (resJson.code === 20404 || resJson.code === 60200) {
        throw new OtpExpiredOrNotFoundError('Verification code expired or not found on Twilio Verify service');
      }
      throw new Error(`Twilio VerificationCheck failed (${response.status}): ${resJson.message || response.statusText}`);
    }

    if (resJson.status !== 'approved') {
      throw new InvalidOtpCodeError('Twilio Verify code is incorrect or unapproved', 1);
    }

    return {
      verified: true,
      normalizedPhoneNumber: normalized,
      phoneHash: this.hashPhoneNumber(normalized),
    };
  }
}
