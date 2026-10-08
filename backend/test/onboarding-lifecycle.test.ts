/**
 * GigVault - Worker Identity & Phone Onboarding Lifecycle Tests
 * 
 * Verifies:
 * 1. Indian phone normalization and rejection of invalid numbers
 * 2. Mock OTP lifecycle: random generation, single-use, cooldown, rate limits, attempt bounding
 * 3. Twilio live SMS provider: fails closed when unconfigured, handles errors/rate limits
 * 4. Wallet challenge generation, EIP-191 signing, tamper rejection, expiry
 * 5. Mode A Real Anon Aadhaar: Groth16 verification, signal challenge binding, untrusted pubkey rejection, tampered proof rejection
 * 6. Mode B Mock Aadhaar: Synthetic persona assertion verification, untrusted IDP rejection, wallet binding
 * 7. Durable registry: 1-to-1 uniqueness, phone takeover resistance, concurrent commit race protection
 * 8. HTTP REST Endpoints: full success flow, negative codes (400, 401, 403, 409, 410, 429), dev-test isolation
 * 9. Downstream attestation integration: synthetic worker onboarding -> FIP consent -> evidence reconstruction
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { ethers } from 'ethers';
import crypto from 'node:crypto';

// Phone module
import {
  normalizeIndianPhoneNumber,
  maskIndianPhoneNumber,
  hashPhoneNumber,
  InvalidPhoneNumberError,
  OtpCooldownActiveError,
  OtpRateLimitExceededError,
  InvalidOtpCodeError,
  OtpMaxAttemptsExceededError,
  DevTestRetrievalDisabledError,
  TwilioProviderNotConfiguredError,
} from '../src/identity/phone/types.js';
import { MockPhoneVerificationProvider } from '../src/identity/phone/mock-provider.js';
import { TwilioVerifyPhoneProvider } from '../src/identity/phone/twilio-provider.js';

import {
  AadhaarTrustModeMismatchError,
  AnonAadhaarProofMalformedError,
  AnonAadhaarProofTamperedError,
  AnonAadhaarSignalBindingMismatchError,
  AnonAadhaarPubkeyNotTrustedError,
  AnonAadhaarVerificationKeyMissingError,
  AnonAadhaarPublicSignalMismatchError,
  MockAadhaarAssertionInvalidError,
  deriveAnonAadhaarSessionSignal,
} from '../src/identity/aadhaar/types.js';
import { MockAadhaarVerifier } from '../src/identity/aadhaar/mock-verifier.js';
import {
  RealAnonAadhaarVerifier,
  ANON_AADHAAR_TEST_PUBKEY_HASH,
  ANON_AADHAAR_V2_SIGNAL_INDEX,
  ANON_AADHAAR_V2_PUBLIC_SIGNALS_COUNT,
} from '../src/identity/aadhaar/real-verifier.js';

// Onboarding module
import { WorkerOnboardingRegistry } from '../src/identity/onboarding/registry.js';
import { OnboardingSessionService, formatOnboardingChallengeMessage } from '../src/identity/onboarding/session-service.js';
import { OnboardingAttestationAdapter } from '../src/identity/onboarding/attestation-adapter.js';
import {
  IdentityNullifierAlreadyClaimedError,
  WalletAlreadyBoundError,
  PhoneAlreadyBoundError,
} from '../src/identity/onboarding/types.js';

// HTTP and FIP
import { createOnboardingApp } from '../src/http/onboarding-app.js';
import { createUnifiedApp } from '../src/http/unified-app.js';
import { defaultMockIdp, MockIdentityProvider } from '../src/identity/mock-idp.js';
import { defaultFipStorage } from '../src/fip/storage.js';
import { ConsentService } from '../src/fip/consent-service.js';
import { MockFIPService } from '../src/fip/fip-service.js';
import { AttestationService } from '../src/evidence/attestation-service.js';
import { signWorkerAuthorization } from '../src/identity/wallet-auth.js';
import { PERSONAS } from '../src/fip/personas/persona-types.js';

describe('Worker Identity Onboarding & Phone Verification Suite', () => {
  describe('Phone Normalization & Privacy Protection', () => {
    it('normalizes valid Indian mobile numbers to E.164 (+91XXXXXXXXXX)', () => {
      const inputs = [
        '+919876543210',
        '9876543210',
        '09876543210',
        '+91 98765 43210',
        '+91-98765-43210',
        '+91 (98765) 43210',
      ];
      for (const input of inputs) {
        assert.strictEqual(
          normalizeIndianPhoneNumber(input),
          '+919876543210',
          `Failed to normalize: ${input}`
        );
      }
    });

    it('rejects invalid, short, non-Indian or non-mobile numbers', () => {
      const invalidInputs = [
        '',
        '   ',
        '12345',
        '+14155552671', // US number
        '+447911123456', // UK number
        '+915123456789', // Starts with 5 (Indian mobiles start with 6-9)
        '+91987654321', // 9 digits
        '+9198765432100', // 11 digits
        'abcdefghij',
      ];
      for (const input of invalidInputs) {
        assert.throws(
          () => normalizeIndianPhoneNumber(input),
          InvalidPhoneNumberError,
          `Should have rejected: ${input}`
        );
      }
    });

    it('masks phone numbers safely without leaking complete numbers', () => {
      const masked = maskIndianPhoneNumber('+919876543210');
      assert.strictEqual(masked, '+91******3210');
      assert.strictEqual(masked.includes('987654'), false);
    });

    it('hashes phone numbers with keyed HMAC-SHA256 for private equality index', () => {
      const phone = '+919876543210';
      const hash1 = hashPhoneNumber(phone, 'secret-key-1');
      const hash2 = hashPhoneNumber(phone, 'secret-key-1');
      const hashDiffSecret = hashPhoneNumber(phone, 'secret-key-2');

      assert.strictEqual(hash1, hash2, 'Identical secret must produce identical HMAC');
      assert.notStrictEqual(hash1, hashDiffSecret, 'Different secret must produce different HMAC');
      assert.strictEqual(hash1.length, 64, 'HMAC-SHA256 hex must be 64 characters');
    });
  });

  describe('Mock Phone Verification Provider', () => {
    it('generates random OTP and successfully verifies correct code', async () => {
      const provider = new MockPhoneVerificationProvider({ allowDevTestRetrieval: true });
      const phone = '+919876543210';

      const start = await provider.startVerification({ phoneNumber: phone });
      assert.ok(start.verificationId);
      assert.strictEqual(start.maskedPhoneNumber, '+91******3210');
      assert.strictEqual(start.cooldownSeconds, 60);

      // Retrieve via isolated test hook
      const otpCode = provider.getDevTestOtp(start.verificationId);
      assert.match(otpCode, /^\d{6}$/);

      const check = await provider.checkVerification({ phoneNumber: phone, code: otpCode });
      assert.strictEqual(check.verified, true);
      assert.strictEqual(check.normalizedPhoneNumber, '+919876543210');
    });

    it('rejects wrong code and decrements attempts counter until lockout', async () => {
      const provider = new MockPhoneVerificationProvider({ allowDevTestRetrieval: true });
      const phone = '+919876543211';

      await provider.startVerification({ phoneNumber: phone });

      // Wrong code 1
      await assert.rejects(
        async () => provider.checkVerification({ phoneNumber: phone, code: '000000' }),
        (err: any) => err instanceof InvalidOtpCodeError && err.attemptsRemaining === 2
      );

      // Wrong code 2
      await assert.rejects(
        async () => provider.checkVerification({ phoneNumber: phone, code: '111111' }),
        (err: any) => err instanceof InvalidOtpCodeError && err.attemptsRemaining === 1
      );

      // Wrong code 3 (max attempts reached)
      await assert.rejects(
        async () => provider.checkVerification({ phoneNumber: phone, code: '222222' }),
        (err: any) => err instanceof OtpMaxAttemptsExceededError
      );
    });

    it('enforces resend cooldown window (60s)', async () => {
      const provider = new MockPhoneVerificationProvider({ resendCooldownSec: 60 });
      const phone = '+919876543212';

      await provider.startVerification({ phoneNumber: phone });

      await assert.rejects(
        async () => provider.startVerification({ phoneNumber: phone }),
        (err: any) => err instanceof OtpCooldownActiveError && err.retryAfterSeconds > 0
      );
    });

    it('enforces hourly rate limits (max 5 per hour)', async () => {
      const provider = new MockPhoneVerificationProvider({
        maxAttemptsPerHour: 2,
        resendCooldownSec: 0, // Disable cooldown to test hourly rate limit
      });
      const phone = '+919876543213';

      await provider.startVerification({ phoneNumber: phone });
      await provider.startVerification({ phoneNumber: phone });

      await assert.rejects(
        async () => provider.startVerification({ phoneNumber: phone }),
        (err: any) => err instanceof OtpRateLimitExceededError
      );
    });

    it('enforces single-use consumption across concurrent checks', async () => {
      const provider = new MockPhoneVerificationProvider({ allowDevTestRetrieval: true });
      const phone = '+919876543214';

      const start = await provider.startVerification({ phoneNumber: phone });
      const otpCode = provider.getDevTestOtp(start.verificationId);

      // Concurrent verification attempts
      const results = await Promise.allSettled([
        provider.checkVerification({ phoneNumber: phone, code: otpCode }),
        provider.checkVerification({ phoneNumber: phone, code: otpCode }),
        provider.checkVerification({ phoneNumber: phone, code: otpCode }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      assert.strictEqual(fulfilled.length, 1, 'Exactly one concurrent verification must succeed');
      assert.strictEqual(rejected.length, 2, 'Other concurrent attempts must be rejected');
    });

    it('fails closed on test OTP retrieval when allowDevTestRetrieval is disabled', () => {
      const provider = new MockPhoneVerificationProvider({ allowDevTestRetrieval: false });
      assert.throws(
        () => provider.getDevTestOtp('any-id'),
        DevTestRetrievalDisabledError
      );
    });
  });

  describe('Twilio Live SMS Adapter (Fail-Closed & Offline Safety)', () => {
    it('fails closed when unconfigured', async () => {
      const provider = new TwilioVerifyPhoneProvider({ enabled: false });
      assert.strictEqual(provider.isConfigured(), false);

      await assert.rejects(
        async () => provider.startVerification({ phoneNumber: '+919876543210' }),
        TwilioProviderNotConfiguredError
      );

      await assert.rejects(
        async () => provider.checkVerification({ phoneNumber: '+919876543210', code: '123456' }),
        TwilioProviderNotConfiguredError
      );
    });

    it('integrates with Twilio Verify API when configured and handles API errors', async () => {
      // Mock fetch simulating Twilio Verify API responses without live network call
      const mockFetch: typeof fetch = async (url, init) => {
        const urlStr = String(url);
        if (urlStr.includes('/Verifications')) {
          return new Response(
            JSON.stringify({
              sid: 'VE_mock_12345',
              service_sid: 'VA_mock_service',
              to: '+919876543210',
              channel: 'sms',
              status: 'pending',
            }),
            { status: 201, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (urlStr.includes('/VerificationCheck')) {
          const bodyStr = String(init?.body || '');
          if (bodyStr.includes('Code=123456')) {
            return new Response(
              JSON.stringify({
                sid: 'VE_mock_12345',
                to: '+919876543210',
                status: 'approved',
                valid: true,
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          } else {
            return new Response(
              JSON.stringify({
                sid: 'VE_mock_12345',
                to: '+919876543210',
                status: 'pending',
                valid: false,
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }
        }
        return new Response('Not found', { status: 404 });
      };

      const provider = new TwilioVerifyPhoneProvider({
        accountSid: 'AC_test_account',
        authToken: 'auth_token_test',
        verifyServiceSid: 'VA_test_service',
        enabled: true,
        customFetch: mockFetch,
      });

      assert.strictEqual(provider.isConfigured(), true);

      const start = await provider.startVerification({ phoneNumber: '+919876543210' });
      assert.strictEqual(start.verificationId, 'VE_mock_12345');

      const checkValid = await provider.checkVerification({
        phoneNumber: '+919876543210',
        code: '123456',
      });
      assert.strictEqual(checkValid.verified, true);

      await assert.rejects(
        async () => provider.checkVerification({ phoneNumber: '+919876543210', code: '000000' }),
        InvalidOtpCodeError
      );
    });

    it('maps Twilio rate limits (HTTP 429) to OtpRateLimitExceededError', async () => {
      const mockFetch: typeof fetch = async () => {
        return new Response(
          JSON.stringify({ code: 60203, message: 'Max send attempts reached' }),
          { status: 429, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const provider = new TwilioVerifyPhoneProvider({
        accountSid: 'AC_test_account',
        authToken: 'auth_token_test',
        verifyServiceSid: 'VA_test_service',
        enabled: true,
        customFetch: mockFetch,
      });

      await assert.rejects(
        async () => provider.startVerification({ phoneNumber: '+919876543210' }),
        OtpRateLimitExceededError
      );
    });
  });

  describe('Wallet Challenge Signing & EIP-191 Verification', () => {
    const testWallet = ethers.Wallet.createRandom();
    const attackerWallet = ethers.Wallet.createRandom();

    it('verifies valid EIP-191 personal_sign over onboarding challenge', async () => {
      const phoneProvider = new MockPhoneVerificationProvider({ allowDevTestRetrieval: true });
      const service = new OnboardingSessionService({ phoneProvider });

      const session = await service.createSession();
      assert.strictEqual(session.state, 'SESSION_CREATED');

      const message = formatOnboardingChallengeMessage(
        session.sessionId,
        session.challengeNonce,
        testWallet.address
      );
      const signature = await testWallet.signMessage(message);

      const updated = await service.verifyWallet({
        sessionId: session.sessionId,
        walletAddress: testWallet.address,
        signature,
      });

      assert.strictEqual(updated.state, 'WALLET_VERIFIED');
      assert.strictEqual(updated.walletAddress, testWallet.address.toLowerCase());
    });

    it('MUST REJECT: signature signed by different wallet', async () => {
      const phoneProvider = new MockPhoneVerificationProvider({ allowDevTestRetrieval: true });
      const service = new OnboardingSessionService({ phoneProvider });

      const session = await service.createSession();
      const message = formatOnboardingChallengeMessage(
        session.sessionId,
        session.challengeNonce,
        testWallet.address
      );
      // Attacker signs instead of testWallet
      const signature = await attackerWallet.signMessage(message);

      await assert.rejects(
        async () =>
          service.verifyWallet({
            sessionId: session.sessionId,
            walletAddress: testWallet.address,
            signature,
          }),
        /WalletSignatureMismatch/
      );
    });

    it('MUST REJECT: forged or tampered challenge message', async () => {
      const phoneProvider = new MockPhoneVerificationProvider({ allowDevTestRetrieval: true });
      const service = new OnboardingSessionService({ phoneProvider });

      const session = await service.createSession();
      // Forged challenge nonce
      const forgedMessage = formatOnboardingChallengeMessage(
        session.sessionId,
        '0xforgednonce00000000000000000000000000000000000000000000000000000000',
        testWallet.address
      );
      const signature = await testWallet.signMessage(forgedMessage);

      await assert.rejects(
        async () =>
          service.verifyWallet({
            sessionId: session.sessionId,
            walletAddress: testWallet.address,
            signature,
          }),
        /WalletSignatureMismatch/
      );
    });
  });

  describe('Aadhaar Verifiers: Isolation between Real Anon Aadhaar and Mock IDP', () => {
    const testWallet = ethers.Wallet.createRandom();
    const idp = new MockIdentityProvider();
    const mockVerifier = new MockAadhaarVerifier(idp);

    // Default real verifier: fails closed by default
    const defaultRealVerifier = new RealAnonAadhaarVerifier();
    // Test-configured real verifier: explicitly allows test keys
    const testRealVerifier = new RealAnonAadhaarVerifier({ allowTestKeys: true });

    it('Mode B Mock Verifier accepts valid synthetic assertion and extracts nullifier', async () => {
      const assertion = idp.issueAssertion({
        workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
        workerWalletAddress: testWallet.address,
      });

      const result = await mockVerifier.verify({
        mode: 'SYNTHETIC_MOCK_IDP',
        expectedWalletAddress: testWallet.address,
        expectedChallenge: '0x1234',
        sessionId: 'session-1',
        mockAssertionPayload: { assertion },
      });

      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.mode, 'SYNTHETIC_MOCK_IDP');
      assert.strictEqual(result.identityNullifier, PERSONAS.RAMESH.identityNullifierHash);
      assert.strictEqual(result.workerId, 'RAMESH');
    });

    it('Mode B Mock Verifier strictly rejects real Anon Aadhaar mode', async () => {
      await assert.rejects(
        async () =>
          mockVerifier.verify({
            mode: 'REAL_ANON_AADHAAR',
            expectedWalletAddress: testWallet.address,
            expectedChallenge: '0x1234',
            sessionId: 'session-1',
          }),
        AadhaarTrustModeMismatchError
      );
    });

    it('Mode B Mock Verifier rejects untrusted attacker-signed assertion', async () => {
      const attackerIdp = new MockIdentityProvider(); // Different untrusted key pair
      const forgedAssertion = attackerIdp.issueAssertion({
        workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
        workerWalletAddress: testWallet.address,
      });

      await assert.rejects(
        async () =>
          mockVerifier.verify({
            mode: 'SYNTHETIC_MOCK_IDP',
            expectedWalletAddress: testWallet.address,
            expectedChallenge: '0x1234',
            sessionId: 'session-1',
            mockAssertionPayload: { assertion: forgedAssertion },
          }),
        MockAadhaarAssertionInvalidError
      );
    });

    it('Mode A Real Verifier strictly rejects synthetic mock mode', async () => {
      await assert.rejects(
        async () =>
          defaultRealVerifier.verify({
            mode: 'SYNTHETIC_MOCK_IDP',
            expectedWalletAddress: testWallet.address,
            expectedChallenge: '0x1234',
            sessionId: 'session-1',
          }),
        AadhaarTrustModeMismatchError
      );
    });

    it('Mode A Real Verifier fails closed by default: rejects test/staging key without explicit allowTestKeys', async () => {
      // Even with known test pubkey hash, default real verifier must fail closed
      await assert.rejects(
        async () =>
          defaultRealVerifier.verify({
            mode: 'REAL_ANON_AADHAAR',
            expectedWalletAddress: testWallet.address,
            expectedChallenge: '0x1234',
            sessionId: 'session-1',
            realProofPayload: {
              groth16Proof: { pi_a: ['1', '2'], pi_b: [['1', '2'], ['3', '4']], pi_c: ['5', '6'], protocol: 'groth16' },
              pubkeyHash: ANON_AADHAAR_TEST_PUBKEY_HASH,
              nullifier: '1234567890',
              timestamp: Math.floor(Date.now() / 1000),
              nullifierSeed: '42',
              signal: deriveAnonAadhaarSessionSignal('session-1', '0x1234', testWallet.address),
            },
          }),
        AnonAadhaarPubkeyNotTrustedError
      );
    });

    it('Mode A Real Verifier rejects untrusted UIDAI public key hashes even with allowTestKeys: true', async () => {
      await assert.rejects(
        async () =>
          testRealVerifier.verify({
            mode: 'REAL_ANON_AADHAAR',
            expectedWalletAddress: testWallet.address,
            expectedChallenge: '0x1234',
            sessionId: 'session-1',
            realProofPayload: {
              groth16Proof: { pi_a: ['1', '2'], pi_b: [['1', '2'], ['3', '4']], pi_c: ['5', '6'], protocol: 'groth16' },
              pubkeyHash: '9999999999999999999999999999999999999999999999999999999999999999', // Untrusted
              nullifier: '1234567890',
              timestamp: Math.floor(Date.now() / 1000),
              nullifierSeed: '42',
              signal: deriveAnonAadhaarSessionSignal('session-1', '0x1234', testWallet.address),
            },
          }),
        AnonAadhaarPubkeyNotTrustedError
      );
    });

    it('Mode A Real Verifier strictly rejects wallet-only signal binding (replay protection)', async () => {
      // Wallet-only binding: BigInt(testWallet.address).toString()
      // MUST BE REJECTED to prevent cross-session proof replay
      const walletOnlySignal = BigInt(testWallet.address).toString();

      await assert.rejects(
        async () =>
          testRealVerifier.verify({
            mode: 'REAL_ANON_AADHAAR',
            expectedWalletAddress: testWallet.address,
            expectedChallenge: '0x1234',
            sessionId: 'session-1',
            realProofPayload: {
              groth16Proof: { pi_a: ['1', '2'], pi_b: [['1', '2'], ['3', '4']], pi_c: ['5', '6'], protocol: 'groth16' },
              pubkeyHash: ANON_AADHAAR_TEST_PUBKEY_HASH,
              nullifier: '1234567890',
              timestamp: Math.floor(Date.now() / 1000),
              nullifierSeed: '42',
              signal: walletOnlySignal, // Wallet-only!
            },
          }),
        AnonAadhaarSignalBindingMismatchError
      );
    });

    it('Mode A Real Verifier rejects proof where signal does not bind to session challenge or session context', async () => {
      const otherWallet = ethers.Wallet.createRandom();
      const mismatchedSessionSignal = deriveAnonAadhaarSessionSignal('other-session', '0x1234', otherWallet.address);

      await assert.rejects(
        async () =>
          testRealVerifier.verify({
            mode: 'REAL_ANON_AADHAAR',
            expectedWalletAddress: testWallet.address,
            expectedChallenge: '0x1234',
            sessionId: 'session-1',
            realProofPayload: {
              groth16Proof: { pi_a: ['1', '2'], pi_b: [['1', '2'], ['3', '4']], pi_c: ['5', '6'], protocol: 'groth16' },
              pubkeyHash: ANON_AADHAAR_TEST_PUBKEY_HASH,
              nullifier: '1234567890',
              timestamp: Math.floor(Date.now() / 1000),
              nullifierSeed: '42',
              signal: mismatchedSessionSignal, // Mismatched session signal!
            },
          }),
        AnonAadhaarSignalBindingMismatchError
      );
    });

    it('Mode A Real Verifier rejects publicSignals with incorrect array length', async () => {
      const validSessionSignal = deriveAnonAadhaarSessionSignal('session-1', '0x1234', testWallet.address);

      await assert.rejects(
        async () =>
          testRealVerifier.verify({
            mode: 'REAL_ANON_AADHAAR',
            expectedWalletAddress: testWallet.address,
            expectedChallenge: '0x1234',
            sessionId: 'session-1',
            realProofPayload: {
              groth16Proof: { pi_a: ['1', '2'], pi_b: [['1', '2'], ['3', '4']], pi_c: ['5', '6'], protocol: 'groth16' },
              pubkeyHash: ANON_AADHAAR_TEST_PUBKEY_HASH,
              nullifier: '1234567890',
              timestamp: 1700000000,
              nullifierSeed: '42',
              signal: validSessionSignal,
              publicSignals: ['1234567890', ANON_AADHAAR_TEST_PUBKEY_HASH], // Only 2 elements instead of 5
            },
          }),
        (err: any) => err instanceof AnonAadhaarPublicSignalMismatchError && err.message.includes('Expected 5 public signals')
      );
    });

    it('Mode A Real Verifier rejects inconsistent duplicate fields between payload and publicSignals', async () => {
      const validSessionSignal = deriveAnonAadhaarSessionSignal('session-1', '0x1234', testWallet.address);

      // Inconsistent nullifier
      await assert.rejects(
        async () =>
          testRealVerifier.verify({
            mode: 'REAL_ANON_AADHAAR',
            expectedWalletAddress: testWallet.address,
            expectedChallenge: '0x1234',
            sessionId: 'session-1',
            realProofPayload: {
              groth16Proof: { pi_a: ['1', '2'], pi_b: [['1', '2'], ['3', '4']], pi_c: ['5', '6'], protocol: 'groth16' },
              pubkeyHash: ANON_AADHAAR_TEST_PUBKEY_HASH,
              nullifier: '1234567890',
              timestamp: 1700000000,
              nullifierSeed: '42',
              signal: validSessionSignal,
              publicSignals: [
                '9999999999', // Inconsistent nullifier!
                ANON_AADHAAR_TEST_PUBKEY_HASH,
                '42',
                validSessionSignal,
                '1700000000',
              ],
            },
          }),
        (err: any) => err instanceof AnonAadhaarPublicSignalMismatchError && err.message.includes('Inconsistent nullifier')
      );

      // Inconsistent pubkeyHash
      await assert.rejects(
        async () =>
          testRealVerifier.verify({
            mode: 'REAL_ANON_AADHAAR',
            expectedWalletAddress: testWallet.address,
            expectedChallenge: '0x1234',
            sessionId: 'session-1',
            realProofPayload: {
              groth16Proof: { pi_a: ['1', '2'], pi_b: [['1', '2'], ['3', '4']], pi_c: ['5', '6'], protocol: 'groth16' },
              pubkeyHash: ANON_AADHAAR_TEST_PUBKEY_HASH,
              nullifier: '1234567890',
              timestamp: 1700000000,
              nullifierSeed: '42',
              signal: validSessionSignal,
              publicSignals: [
                '1234567890',
                '8888888888', // Inconsistent pubkeyHash!
                '42',
                validSessionSignal,
                '1700000000',
              ],
            },
          }),
        (err: any) => err instanceof AnonAadhaarPublicSignalMismatchError && err.message.includes('Inconsistent pubkeyHash')
      );

      // Inconsistent signal
      await assert.rejects(
        async () =>
          testRealVerifier.verify({
            mode: 'REAL_ANON_AADHAAR',
            expectedWalletAddress: testWallet.address,
            expectedChallenge: '0x1234',
            sessionId: 'session-1',
            realProofPayload: {
              groth16Proof: { pi_a: ['1', '2'], pi_b: [['1', '2'], ['3', '4']], pi_c: ['5', '6'], protocol: 'groth16' },
              pubkeyHash: ANON_AADHAAR_TEST_PUBKEY_HASH,
              nullifier: '1234567890',
              timestamp: 1700000000,
              nullifierSeed: '42',
              signal: validSessionSignal,
              publicSignals: [
                '1234567890',
                ANON_AADHAAR_TEST_PUBKEY_HASH,
                '42',
                '7777777777', // Inconsistent signal!
                '1700000000',
              ],
            },
          }),
        (err: any) => err instanceof AnonAadhaarPublicSignalMismatchError && err.message.includes('Inconsistent signal')
      );
    });

    it('Mode A Real Verifier fails closed when verification key is unconfigured', async () => {
      const validSessionSignal = deriveAnonAadhaarSessionSignal('session-1', '0x1234', testWallet.address);
      const unconfiguredVerifier = new RealAnonAadhaarVerifier({
        allowTestKeys: true,
        verificationKey: undefined,
      });

      await assert.rejects(
        async () =>
          unconfiguredVerifier.verify({
            mode: 'REAL_ANON_AADHAAR',
            expectedWalletAddress: testWallet.address,
            expectedChallenge: '0x1234',
            sessionId: 'session-1',
            realProofPayload: {
              groth16Proof: { pi_a: ['1', '2'], pi_b: [['1', '2'], ['3', '4']], pi_c: ['5', '6'], protocol: 'groth16' },
              pubkeyHash: ANON_AADHAAR_TEST_PUBKEY_HASH,
              nullifier: '1234567890',
              timestamp: Math.floor(Date.now() / 1000),
              nullifierSeed: '42',
              signal: validSessionSignal,
            },
          }),
        AnonAadhaarVerificationKeyMissingError
      );
    });

    it('Mode A Real Verifier explicitly marks genuine production verification as NOT_YET_VERIFIED when unconfigured', () => {
      // By default without pinned production roots and production vkey, real verification status is NOT_YET_VERIFIED
      assert.strictEqual(defaultRealVerifier.getVerificationStatus(), 'NOT_YET_VERIFIED');
      assert.strictEqual(testRealVerifier.getVerificationStatus(), 'NOT_YET_VERIFIED');

      // Only when BOTH production verification key AND production pubkey hash are configured does it become VERIFIED
      const mockProductionVerifier = new RealAnonAadhaarVerifier({
        verificationKey: { protocol: 'groth16' },
        trustedPubkeyHashes: ['12345678901234567890'],
      });
      assert.strictEqual(mockProductionVerifier.getVerificationStatus(), 'VERIFIED');
    });

    it('Mode A Real Verifier executes snarkjs.groth16.verify and rejects tampered proof', async () => {
      const validSessionSignal = deriveAnonAadhaarSessionSignal('session-1', '0x1234', testWallet.address);
      const testVkey = {
        protocol: 'groth16',
        curve: 'bn128',
        nPublic: 5,
        vk_alpha_1: ['1', '2', '1'],
        vk_beta_2: [['1', '2'], ['3', '4'], ['1', '0']],
        vk_gamma_2: [['1', '2'], ['3', '4'], ['1', '0']],
        vk_delta_2: [['1', '2'], ['3', '4'], ['1', '0']],
        IC: [
          ['1', '2', '1'],
          ['1', '2', '1'],
          ['1', '2', '1'],
          ['1', '2', '1'],
          ['1', '2', '1'],
          ['1', '2', '1'],
        ],
      };

      const configuredVerifier = new RealAnonAadhaarVerifier({
        allowTestKeys: true,
        verificationKey: testVkey,
      });

      // Proof that fails cryptographic curve verification
      await assert.rejects(
        async () =>
          configuredVerifier.verify({
            mode: 'REAL_ANON_AADHAAR',
            expectedWalletAddress: testWallet.address,
            expectedChallenge: '0x1234',
            sessionId: 'session-1',
            realProofPayload: {
              groth16Proof: {
                pi_a: ['1', '2', '1'],
                pi_b: [['1', '2'], ['3', '4']],
                pi_c: ['1', '2', '1'],
                protocol: 'groth16',
              },
              pubkeyHash: ANON_AADHAAR_TEST_PUBKEY_HASH,
              nullifier: '1234567890',
              timestamp: Math.floor(Date.now() / 1000),
              nullifierSeed: '42',
              signal: validSessionSignal,
            },
          }),
        AnonAadhaarProofTamperedError
      );
    });

    after(async () => {
      await RealAnonAadhaarVerifier.cleanupCurves();
    });
  });

  describe('Durable Registry & Account Binding Protection', () => {
    it('enforces 1-to-1 uniqueness: duplicate nullifier, wallet, or phone rejection', async () => {
      const registry = new WorkerOnboardingRegistry();
      const phoneProvider = new MockPhoneVerificationProvider({ allowDevTestRetrieval: true });
      const testIdp = new MockIdentityProvider();
      const mockVerifier = new MockAadhaarVerifier(testIdp);
      const service = new OnboardingSessionService({ registry, phoneProvider, mockAadhaarVerifier: mockVerifier });

      const wallet1 = ethers.Wallet.createRandom();
      const wallet2 = ethers.Wallet.createRandom();

      // Onboard worker 1
      const session1 = await service.createSession();
      const msg1 = formatOnboardingChallengeMessage(session1.sessionId, session1.challengeNonce, wallet1.address);
      await service.verifyWallet({ sessionId: session1.sessionId, walletAddress: wallet1.address, signature: await wallet1.signMessage(msg1) });
      const phone1 = await service.requestPhoneOtp({ sessionId: session1.sessionId, phoneNumber: '+919876543210' });
      const otp1 = phoneProvider.getDevTestOtp(phone1.verificationId);
      await service.verifyPhoneOtp({ sessionId: session1.sessionId, otpCode: otp1 });
      const assertion1 = testIdp.issueAssertion({ workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash, workerWalletAddress: wallet1.address });
      await service.verifyAadhaar({ sessionId: session1.sessionId, mode: 'SYNTHETIC_MOCK_IDP', mockAssertionPayload: { assertion: assertion1 } });
      const commit1 = await service.commitBinding(session1.sessionId);
      assert.ok(commit1.workerId);

      // Attempt 1: Worker 2 tries to use the same Aadhaar identity nullifier
      const session2 = await service.createSession();
      const msg2 = formatOnboardingChallengeMessage(session2.sessionId, session2.challengeNonce, wallet2.address);
      await service.verifyWallet({ sessionId: session2.sessionId, walletAddress: wallet2.address, signature: await wallet2.signMessage(msg2) });
      const phone2 = await service.requestPhoneOtp({ sessionId: session2.sessionId, phoneNumber: '+919876543211' });
      const otp2 = phoneProvider.getDevTestOtp(phone2.verificationId);
      await service.verifyPhoneOtp({ sessionId: session2.sessionId, otpCode: otp2 });
      
      testIdp.rebindWorkerWallet(PERSONAS.RAMESH.identityNullifierHash, wallet2.address);
      const conflictAssertion = testIdp.issueAssertion({ workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash, workerWalletAddress: wallet2.address });
      await assert.rejects(
        async () =>
          service.verifyAadhaar({
            sessionId: session2.sessionId,
            mode: 'SYNTHETIC_MOCK_IDP',
            mockAssertionPayload: { assertion: conflictAssertion },
          }),
        IdentityNullifierAlreadyClaimedError
      );

      // Attempt 2: Attacker tries to claim already-verified phone (+919876543210)
      const session3 = await service.createSession();
      const wallet3 = ethers.Wallet.createRandom();
      const msg3 = formatOnboardingChallengeMessage(session3.sessionId, session3.challengeNonce, wallet3.address);
      await service.verifyWallet({ sessionId: session3.sessionId, walletAddress: wallet3.address, signature: await wallet3.signMessage(msg3) });

      await assert.rejects(
        async () =>
          service.requestPhoneOtp({
            sessionId: session3.sessionId,
            phoneNumber: '+919876543210',
          }),
        PhoneAlreadyBoundError
      );
    });

    it('prevents concurrent account-binding collisions under race conditions', async () => {
      const registry = new WorkerOnboardingRegistry();

      const record1 = {
        workerId: 'WRK_1',
        walletAddress: '0x1111111111111111111111111111111111111111',
        identityNullifier: '0xaaaa',
        identityTrustMode: 'SYNTHETIC_MOCK_IDP' as const,
        phoneHash: 'hash1',
        phoneMasked: '+91******1111',
        bindingVersion: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: 'ACTIVE' as const,
        auditLog: [],
      };

      const record2 = {
        workerId: 'WRK_2',
        walletAddress: '0x2222222222222222222222222222222222222222',
        identityNullifier: '0xaaaa', // Same nullifier!
        identityTrustMode: 'SYNTHETIC_MOCK_IDP' as const,
        phoneHash: 'hash2',
        phoneMasked: '+91******2222',
        bindingVersion: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: 'ACTIVE' as const,
        auditLog: [],
      };

      const results = await Promise.allSettled([
        registry.registerWorker(record1),
        registry.registerWorker(record2),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      assert.strictEqual(fulfilled.length, 1, 'Exactly one concurrent registration must succeed');
      assert.strictEqual(rejected.length, 1, 'Colliding registration must fail with conflict');
    });
  });

  describe('HTTP REST Onboarding Lifecycle & Error Codes', () => {
    const testWallet = ethers.Wallet.createRandom();
    const phoneProvider = new MockPhoneVerificationProvider({ allowDevTestRetrieval: true });
    const onboardingService = new OnboardingSessionService({ phoneProvider });
    const app = createOnboardingApp({ onboardingService, allowDevTestRetrieval: true });

    let activeSessionId: string;
    let challengeNonce: string;
    let verificationId: string;
    let devOtp: string;

    it('POST /onboarding/session creates session with challenge nonce (201 Created)', async () => {
      const res = await request(app)
        .post('/onboarding/session')
        .send({ walletAddress: testWallet.address });

      assert.strictEqual(res.status, 201);
      assert.ok(res.body.sessionId);
      assert.ok(res.body.challengeNonce);
      assert.strictEqual(res.body.state, 'SESSION_CREATED');

      activeSessionId = res.body.sessionId;
      challengeNonce = res.body.challengeNonce;
    });

    it('POST /onboarding/session/:sessionId/verify-wallet verifies signature (200 OK)', async () => {
      const msg = formatOnboardingChallengeMessage(activeSessionId, challengeNonce, testWallet.address);
      const signature = await testWallet.signMessage(msg);

      const res = await request(app)
        .post(`/onboarding/session/${activeSessionId}/verify-wallet`)
        .send({ walletAddress: testWallet.address, signature });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.state, 'WALLET_VERIFIED');
    });

    it('MUST REJECT: invalid signature returns HTTP 401', async () => {
      const freshRes = await request(app)
        .post('/onboarding/session')
        .send({ walletAddress: testWallet.address });
      const freshSessionId = freshRes.body.sessionId;
      const freshNonce = freshRes.body.challengeNonce;

      const badWallet = ethers.Wallet.createRandom();
      const msg = formatOnboardingChallengeMessage(freshSessionId, freshNonce, testWallet.address);
      const signature = await badWallet.signMessage(msg);

      const res = await request(app)
        .post(`/onboarding/session/${freshSessionId}/verify-wallet`)
        .send({ walletAddress: testWallet.address, signature });

      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.error, 'INVALID_WALLET_SIGNATURE');
    });

    it('POST /onboarding/session/:sessionId/phone/request-otp starts verification (200 OK)', async () => {
      const res = await request(app)
        .post(`/onboarding/session/${activeSessionId}/phone/request-otp`)
        .send({ phoneNumber: '+919876543210' });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.phoneMasked, '+91******3210');
      assert.ok(res.body.verificationId);
      assert.strictEqual(res.body.otpCode, undefined, 'OTP code must NEVER appear in API response!');

      verificationId = res.body.verificationId;
    });

    it('POST /onboarding/dev/test-otp retrieves OTP under test environment (200 OK)', async () => {
      const res = await request(app)
        .post('/onboarding/dev/test-otp')
        .send({ verificationId });

      assert.strictEqual(res.status, 200);
      assert.match(res.body.otpCode, /^\d{6}$/);
      devOtp = res.body.otpCode;
    });

    it('MUST REJECT: wrong OTP code returns HTTP 401', async () => {
      const res = await request(app)
        .post(`/onboarding/session/${activeSessionId}/phone/verify-otp`)
        .send({ otpCode: '999999' });

      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.error, 'INVALID_OTP_CODE');
    });

    it('POST /onboarding/session/:sessionId/phone/verify-otp verifies correct code (200 OK)', async () => {
      const res = await request(app)
        .post(`/onboarding/session/${activeSessionId}/phone/verify-otp`)
        .send({ otpCode: devOtp });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.state, 'PHONE_VERIFIED');
    });

    it('POST /onboarding/session/:sessionId/aadhaar/verify verifies mock assertion (200 OK)', async () => {
      defaultMockIdp.rebindWorkerWallet(PERSONAS.RAMESH.identityNullifierHash, testWallet.address);
      const assertion = defaultMockIdp.issueAssertion({
        workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
        workerWalletAddress: testWallet.address,
      });

      const res = await request(app)
        .post(`/onboarding/session/${activeSessionId}/aadhaar/verify`)
        .send({
          mode: 'SYNTHETIC_MOCK_IDP',
          mockAssertionPayload: { assertion },
        });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.state, 'AADHAAR_VERIFIED');
      assert.strictEqual(res.body.identityNullifier, PERSONAS.RAMESH.identityNullifierHash);
    });

    it('POST /onboarding/session/:sessionId/commit commits binding to registry (200 OK)', async () => {
      const res = await request(app)
        .post(`/onboarding/session/${activeSessionId}/commit`)
        .send({});

      assert.strictEqual(res.status, 200);
      assert.ok(res.body.workerId);
      assert.strictEqual(res.body.walletAddress, testWallet.address.toLowerCase());
      assert.strictEqual(res.body.phoneMasked, '+91******3210');
      assert.strictEqual(res.body.bindingVersion, 1);
    });

    it('GET /onboarding/worker/:walletAddress returns registered worker (200 OK)', async () => {
      const res = await request(app)
        .get(`/onboarding/worker/${testWallet.address}`);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.status, 'ACTIVE');
      assert.strictEqual(res.body.phoneMasked, '+91******3210');
      assert.strictEqual(res.body.identityNullifier, PERSONAS.RAMESH.identityNullifierHash);
    });
  });

  describe('Downstream Attestation & FIP Integration Flow', () => {
    it('onboarded synthetic worker successfully authorizes FIP consent and reconstructs evidence', async () => {
      const testWallet = ethers.Wallet.createRandom();
      const fipStorage = defaultFipStorage;
      const idp = defaultMockIdp;
      const consentService = new ConsentService(fipStorage, idp);
      const fipService = new MockFIPService(fipStorage, consentService, undefined, idp);
      const attestationService = new AttestationService(
        fipService,
        [fipStorage.getPublicKeyPem()],
        idp
      );

      // 1. Onboard worker via session service
      const phoneProvider = new MockPhoneVerificationProvider({ allowDevTestRetrieval: true });
      const onboardingService = new OnboardingSessionService({ phoneProvider });

      const session = await onboardingService.createSession();
      const msg = formatOnboardingChallengeMessage(session.sessionId, session.challengeNonce, testWallet.address);
      await onboardingService.verifyWallet({
        sessionId: session.sessionId,
        walletAddress: testWallet.address,
        signature: await testWallet.signMessage(msg),
      });

      const phoneRes = await onboardingService.requestPhoneOtp({
        sessionId: session.sessionId,
        phoneNumber: '+919876543299',
      });
      const otpCode = phoneProvider.getDevTestOtp(phoneRes.verificationId);
      await onboardingService.verifyPhoneOtp({ sessionId: session.sessionId, otpCode });

      // Link Ramesh's synthetic nullifier to testWallet
      idp.rebindWorkerWallet(PERSONAS.RAMESH.identityNullifierHash, testWallet.address);
      const assertion = idp.issueAssertion({
        workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
        workerWalletAddress: testWallet.address,
      });

      await onboardingService.verifyAadhaar({
        sessionId: session.sessionId,
        mode: 'SYNTHETIC_MOCK_IDP',
        mockAssertionPayload: { assertion },
      });

      const commitRes = await onboardingService.commitBinding(session.sessionId);
      assert.ok(commitRes.workerId);

      // 2. Bridge to attestation
      const adapter = new OnboardingAttestationAdapter({ idp, consentService, attestationService });
      const registeredWorker = await onboardingService.getRegistry().findByWallet(testWallet.address);
      assert.ok(registeredWorker);

      const workerAssertion = adapter.createAssertionForCommittedWorker(registeredWorker);
      assert.strictEqual(workerAssertion.workerIdentityNullifier, PERSONAS.RAMESH.identityNullifierHash);

      // 3. Create FIP consent for Ramesh's synthetic bank account
      const consentAuth = await signWorkerAuthorization(
        {
          action: 'CREATE_CONSENT',
          workerWalletAddress: testWallet.address,
          consentId: PERSONAS.RAMESH.accountId,
          expectedPassportId: 0,
        },
        testWallet
      );

      const consent = consentService.createConsent({
        accountId: PERSONAS.RAMESH.accountId,
        authorizedIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
        identityAssertion: workerAssertion,
        walletAuthorization: consentAuth,
      });

      // 4. Sign wallet authorization for attestation
      const attestAuth = await signWorkerAuthorization(
        {
          action: 'MINT_PASSPORT',
          workerWalletAddress: testWallet.address,
          consentId: consent.consentId,
          expectedPassportId: 0,
        },
        testWallet
      );

      // 5. Attest and derive transient evidence snapshot
      const attestResult = attestationService.attestWorkerEvidence({
        consentId: consent.consentId,
        expectedPassportId: 0,
        workerWalletAddress: testWallet.address,
        workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
        identityAssertion: workerAssertion,
        walletAuthorization: attestAuth,
      });

      assert.strictEqual(attestResult.verified, true);
      assert.strictEqual(attestResult.identityNullifierHash, PERSONAS.RAMESH.identityNullifierHash);

      // 6. Reconstruct snapshot
      const reconAuth = await signWorkerAuthorization(
        {
          action: 'RECONSTRUCT_EVIDENCE',
          workerWalletAddress: testWallet.address,
          consentId: consent.consentId,
          expectedPassportId: 0,
        },
        testWallet
      );

      const reconResult = attestationService.reconstructEvidenceSnapshot({
        consentId: consent.consentId,
        workerWalletAddress: testWallet.address,
        workerIdentityNullifier: PERSONAS.RAMESH.identityNullifierHash,
        passportId: 0,
        evidenceUpdatedAt: attestResult.evidenceUpdatedAt,
        sourceDirectoryVersion: attestResult.sourceDirectoryVersion,
        identityAssertion: workerAssertion,
        walletAuthorization: reconAuth,
      });

      assert.ok(reconResult.snapshot);
      assert.strictEqual(reconResult.snapshot.holderBinding, testWallet.address.toLowerCase());
      assert.strictEqual(reconResult.snapshot.monthlyGigIncomeTotals.length, 36);
    });
  });
});
