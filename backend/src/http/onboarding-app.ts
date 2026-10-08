/**
 * GigVault - Worker Onboarding HTTP Application
 * 
 * Exposes REST endpoints for the hybrid worker onboarding lifecycle:
 * - POST /onboarding/session                         - Start onboarding session & issue challenge
 * - POST /onboarding/session/:sessionId/verify-wallet - Verify EIP-191 signature over challenge
 * - POST /onboarding/session/:sessionId/phone/request-otp - Start phone possession OTP check
 * - POST /onboarding/session/:sessionId/phone/verify-otp  - Verify phone possession OTP
 * - POST /onboarding/session/:sessionId/aadhaar/verify     - Verify Mock IDP or Real Anon Aadhaar proof
 * - POST /onboarding/session/:sessionId/commit       - Atomically commit identity/wallet/phone binding
 * - GET  /onboarding/session/:sessionId              - Retrieve active session status
 * - POST /onboarding/session/:sessionId/revoke       - Revoke onboarding session
 * - GET  /onboarding/worker/:walletAddress          - Query registered worker status
 * - POST /onboarding/dev/test-otp                    - Local test OTP retrieval (isolated behind config)
 * 
 * Non-negotiable Security Invariants:
 * 1. Single-use, short-lived challenge nonces.
 * 2. Strict step progression.
 * 3. Never return OTP codes or plaintext phone/Aadhaar numbers in public responses or logs.
 * 4. Mode isolation: Mock identities cannot escalate to real mode privileges.
 * 5. Rejection of conflicting wallet, phone, or identity nullifier bindings.
 */

import express, { type Request, type Response, type Express } from 'express';
import { OnboardingSessionService } from '../identity/onboarding/session-service.js';
import {
  OnboardingSessionNotFoundError,
  OnboardingSessionExpiredError,
  OnboardingSessionRevokedError,
  OnboardingSessionStateError,
  IdentityNullifierAlreadyClaimedError,
  WalletAlreadyBoundError,
  PhoneAlreadyBoundError,
  IdentityTakeoverProhibitedError,
} from '../identity/onboarding/types.js';
import {
  InvalidPhoneNumberError,
  OtpCooldownActiveError,
  OtpRateLimitExceededError,
  InvalidOtpCodeError,
  OtpExpiredOrNotFoundError,
  OtpMaxAttemptsExceededError,
  DevTestRetrievalDisabledError,
} from '../identity/phone/types.js';
import { MockPhoneVerificationProvider } from '../identity/phone/mock-provider.js';
import {
  AadhaarTrustModeMismatchError,
  AnonAadhaarProofMalformedError,
  AnonAadhaarProofTamperedError,
  AnonAadhaarSignalBindingMismatchError,
  AnonAadhaarPubkeyNotTrustedError,
  AnonAadhaarVerificationKeyMissingError,
  MockAadhaarAssertionInvalidError,
} from '../identity/aadhaar/types.js';

export interface OnboardingAppOptions {
  onboardingService: OnboardingSessionService;
  allowDevTestRetrieval?: boolean;
}

export function createOnboardingApp(options: OnboardingAppOptions): Express {
  const { onboardingService, allowDevTestRetrieval = false } = options;
  const app = express();
  app.use(express.json({ limit: '512kb' }));

  // Helper error response mapper
  function handleError(res: Response, err: unknown) {
    if (err instanceof OnboardingSessionNotFoundError) {
      return res.status(404).json({ error: 'SESSION_NOT_FOUND', message: err.message });
    }
    if (err instanceof OnboardingSessionExpiredError) {
      return res.status(410).json({ error: 'SESSION_EXPIRED', message: err.message });
    }
    if (err instanceof OnboardingSessionRevokedError) {
      return res.status(410).json({ error: 'SESSION_REVOKED', message: err.message });
    }
    if (err instanceof OnboardingSessionStateError) {
      return res.status(400).json({ error: 'INVALID_SESSION_STATE', message: err.message });
    }
    if (
      err instanceof IdentityNullifierAlreadyClaimedError ||
      err instanceof WalletAlreadyBoundError ||
      err instanceof PhoneAlreadyBoundError
    ) {
      return res.status(409).json({ error: 'REGISTRATION_CONFLICT', message: err.message });
    }
    if (err instanceof IdentityTakeoverProhibitedError) {
      return res.status(403).json({ error: 'IDENTITY_TAKEOVER_PROHIBITED', message: err.message });
    }
    if (err instanceof InvalidPhoneNumberError) {
      return res.status(400).json({ error: 'INVALID_PHONE_NUMBER', message: err.message });
    }
    if (err instanceof OtpCooldownActiveError) {
      return res.status(429).json({
        error: 'OTP_COOLDOWN_ACTIVE',
        retryAfterSeconds: err.retryAfterSeconds,
        message: err.message,
      });
    }
    if (err instanceof OtpRateLimitExceededError) {
      return res.status(429).json({ error: 'OTP_RATE_LIMIT_EXCEEDED', message: err.message });
    }
    if (err instanceof InvalidOtpCodeError) {
      return res.status(401).json({
        error: 'INVALID_OTP_CODE',
        remainingAttempts: err.attemptsRemaining,
        message: err.message,
      });
    }
    if (err instanceof OtpExpiredOrNotFoundError) {
      return res.status(410).json({ error: 'OTP_EXPIRED_OR_NOT_FOUND', message: err.message });
    }
    if (err instanceof OtpMaxAttemptsExceededError) {
      return res.status(429).json({ error: 'OTP_MAX_ATTEMPTS_EXCEEDED', message: err.message });
    }
    if (err instanceof DevTestRetrievalDisabledError) {
      return res.status(403).json({ error: 'DEV_TEST_RETRIEVAL_DISABLED', message: err.message });
    }
    if (
      err instanceof AadhaarTrustModeMismatchError ||
      err instanceof AnonAadhaarProofMalformedError ||
      err instanceof AnonAadhaarProofTamperedError ||
      err instanceof AnonAadhaarSignalBindingMismatchError ||
      err instanceof AnonAadhaarPubkeyNotTrustedError ||
      err instanceof AnonAadhaarVerificationKeyMissingError ||
      err instanceof MockAadhaarAssertionInvalidError
    ) {
      return res.status(403).json({ error: 'AADHAAR_VERIFICATION_FAILED', message: err.message });
    }

    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('InvalidWalletSignature') || message.includes('WalletSignatureMismatch')) {
      return res.status(401).json({ error: 'INVALID_WALLET_SIGNATURE', message });
    }
    if (message.includes('OnboardingChallengeExpired')) {
      return res.status(410).json({ error: 'CHALLENGE_EXPIRED', message });
    }

    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message });
  }

  // POST /onboarding/session
  app.post('/onboarding/session', async (req: Request, res: Response) => {
    try {
      const { walletAddress, ttlSeconds, challengeTtlSeconds } = req.body || {};
      const session = await onboardingService.createSession({
        walletAddress,
        ttlSeconds,
        challengeTtlSeconds,
      });
      return res.status(201).json({
        sessionId: session.sessionId,
        challengeNonce: session.challengeNonce,
        challengeExpiresAt: session.challengeExpiresAt,
        state: session.state,
        expiresAt: session.expiresAt,
      });
    } catch (err) {
      return handleError(res, err);
    }
  });

  // POST /onboarding/session/:sessionId/verify-wallet
  app.post('/onboarding/session/:sessionId/verify-wallet', async (req: Request, res: Response) => {
    try {
      const sessionId = String(req.params.sessionId);
      const { walletAddress, signature } = req.body || {};

      if (!walletAddress || typeof walletAddress !== 'string') {
        return res.status(400).json({ error: 'BAD_REQUEST', message: 'walletAddress is required' });
      }
      if (!signature || typeof signature !== 'string') {
        return res.status(400).json({ error: 'BAD_REQUEST', message: 'signature is required' });
      }

      const session = await onboardingService.verifyWallet({
        sessionId,
        walletAddress,
        signature,
      });

      return res.status(200).json({
        sessionId: session.sessionId,
        walletAddress: session.walletAddress,
        state: session.state,
        walletVerifiedAt: session.walletVerifiedAt,
      });
    } catch (err) {
      return handleError(res, err);
    }
  });

  // POST /onboarding/session/:sessionId/phone/request-otp
  app.post('/onboarding/session/:sessionId/phone/request-otp', async (req: Request, res: Response) => {
    try {
      const sessionId = String(req.params.sessionId);
      const { phoneNumber } = req.body || {};

      if (!phoneNumber || typeof phoneNumber !== 'string') {
        return res.status(400).json({ error: 'BAD_REQUEST', message: 'phoneNumber is required' });
      }

      const result = await onboardingService.requestPhoneOtp({
        sessionId,
        phoneNumber,
      });

      return res.status(200).json({
        sessionId: result.sessionId,
        verificationId: result.verificationId,
        phoneMasked: result.phoneMasked,
        cooldownSeconds: result.cooldownSeconds,
      });
    } catch (err) {
      return handleError(res, err);
    }
  });

  // POST /onboarding/session/:sessionId/phone/verify-otp
  app.post('/onboarding/session/:sessionId/phone/verify-otp', async (req: Request, res: Response) => {
    try {
      const sessionId = String(req.params.sessionId);
      const { otpCode } = req.body || {};

      if (!otpCode || typeof otpCode !== 'string') {
        return res.status(400).json({ error: 'BAD_REQUEST', message: 'otpCode is required' });
      }

      const session = await onboardingService.verifyPhoneOtp({
        sessionId,
        otpCode,
      });

      return res.status(200).json({
        sessionId: session.sessionId,
        phoneMasked: session.phoneMasked,
        state: session.state,
        phoneVerifiedAt: session.phoneVerifiedAt,
      });
    } catch (err) {
      return handleError(res, err);
    }
  });

  // POST /onboarding/session/:sessionId/aadhaar/verify
  app.post('/onboarding/session/:sessionId/aadhaar/verify', async (req: Request, res: Response) => {
    try {
      const sessionId = String(req.params.sessionId);
      const { mode, realProofPayload, mockAssertionPayload } = req.body || {};

      if (!mode || (mode !== 'SYNTHETIC_MOCK_IDP' && mode !== 'REAL_ANON_AADHAAR')) {
        return res.status(400).json({
          error: 'BAD_REQUEST',
          message: 'mode must be either SYNTHETIC_MOCK_IDP or REAL_ANON_AADHAAR',
        });
      }

      const session = await onboardingService.verifyAadhaar({
        sessionId,
        mode,
        realProofPayload,
        mockAssertionPayload,
      });

      return res.status(200).json({
        sessionId: session.sessionId,
        identityNullifier: session.identityNullifier,
        identityTrustMode: session.identityTrustMode,
        state: session.state,
        aadhaarVerifiedAt: session.aadhaarVerifiedAt,
      });
    } catch (err) {
      return handleError(res, err);
    }
  });

  // POST /onboarding/session/:sessionId/commit
  app.post('/onboarding/session/:sessionId/commit', async (req: Request, res: Response) => {
    try {
      const sessionId = String(req.params.sessionId);
      const result = await onboardingService.commitBinding(sessionId);
      return res.status(200).json(result);
    } catch (err) {
      return handleError(res, err);
    }
  });

  // GET /onboarding/session/:sessionId
  app.get('/onboarding/session/:sessionId', async (req: Request, res: Response) => {
    try {
      const sessionId = String(req.params.sessionId);
      const session = await onboardingService.getSession(sessionId);
      return res.status(200).json({
        sessionId: session.sessionId,
        walletAddress: session.walletAddress,
        phoneMasked: session.phoneMasked,
        identityNullifier: session.identityNullifier,
        identityTrustMode: session.identityTrustMode,
        state: session.state,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        committedWorkerId: session.committedWorkerId,
      });
    } catch (err) {
      return handleError(res, err);
    }
  });

  // POST /onboarding/session/:sessionId/revoke
  app.post('/onboarding/session/:sessionId/revoke', async (req: Request, res: Response) => {
    try {
      const sessionId = String(req.params.sessionId);
      const { reason } = req.body || {};
      await onboardingService.revokeSession(sessionId, reason);
      return res.status(200).json({ success: true, message: 'Session revoked' });
    } catch (err) {
      return handleError(res, err);
    }
  });

  // GET /onboarding/worker/:walletAddress
  app.get('/onboarding/worker/:walletAddress', async (req: Request, res: Response) => {
    try {
      const walletAddress = String(req.params.walletAddress);
      const registry = onboardingService.getRegistry();
      const record = await registry.findByWallet(walletAddress);
      if (!record) {
        return res.status(404).json({ error: 'WORKER_NOT_FOUND', message: `No registered worker found for wallet ${walletAddress}` });
      }
      return res.status(200).json({
        workerId: record.workerId,
        walletAddress: record.walletAddress,
        identityNullifier: record.identityNullifier,
        identityTrustMode: record.identityTrustMode,
        phoneMasked: record.phoneMasked,
        bindingVersion: record.bindingVersion,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        status: record.status,
      });
    } catch (err) {
      return handleError(res, err);
    }
  });

  // POST /onboarding/dev/test-otp (strictly quarantined under allowDevTestRetrieval)
  app.post('/onboarding/dev/test-otp', async (req: Request, res: Response) => {
    if (!allowDevTestRetrieval) {
      return res.status(403).json({
        error: 'DEV_TEST_RETRIEVAL_DISABLED',
        message: 'Test OTP retrieval is disabled in this environment',
      });
    }
    const { verificationId } = req.body || {};
    if (!verificationId || typeof verificationId !== 'string') {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'verificationId is required' });
    }
    const phoneProvider = onboardingService.getPhoneProvider();
    if (phoneProvider instanceof MockPhoneVerificationProvider) {
      try {
        const otpCode = phoneProvider.getDevTestOtp(verificationId);
        return res.status(200).json({ otpCode });
      } catch (err) {
        return handleError(res, err);
      }
    }
    return res.status(400).json({
      error: 'NOT_A_MOCK_PROVIDER',
      message: 'Test OTP retrieval is only available for MockPhoneVerificationProvider',
    });
  });

  return app;
}
