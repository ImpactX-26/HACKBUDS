# GigVault — Backend A Hybrid Identity & Phone Onboarding Specification

**Status:** IMPLEMENTED (Backend A Milestone)  
**Package:** `@gigvault/backend` (`src/identity/onboarding/`, `src/identity/phone/`, `src/identity/aadhaar/`, `src/http/onboarding-app.ts`)  
**Target Repository:** `Manas150706/HACKBUDS`  
**Branch:** `feature/evidence`  
**Reference Document:** `docs/ONBOARDING_INTEGRATION_SPEC.md`

---

## 1. Architectural Overview & Workflow

The GigVault onboarding pipeline provides privacy-preserving, hybrid verification binding a worker's EVM wallet to verified phone possession and zero-knowledge Aadhaar identity:

```
+----------------------------------------------------------------------------------------------------+
|                                    WORKER ONBOARDING FLOW                                          |
|                                                                                                    |
|  1. Session Init   2. Wallet Proof      3. Phone OTP        4. Aadhaar Proof     5. Commit Binding |
|  [Server Nonce] -> [EIP-191 personal] -> [E.164 +91 OTP] -> [Anon Aadhaar /] -> [Durable Atomic]   |
|                    [sign challenge]     [single-use]        [Mock IDP assertion]  [Registry]       |
+----------------------------------------------------------------------------------------------------+
```

### State Progression
An onboarding session progresses through strict, unidirectional state gates:
1. `SESSION_CREATED`: Server issues a cryptographically random, short-lived 32-byte hex challenge nonce.
2. `WALLET_VERIFIED`: Worker signs challenge using `personal_sign`. Server recovers address and checks uniqueness.
3. `PHONE_VERIFIED`: Phone number normalized to E.164 (`+91XXXXXXXXXX`), single-use OTP verified.
4. `AADHAAR_VERIFIED`: Mode A (Real Anon Aadhaar Groth16) or Mode B (Mock IDP assertion) verified; public signal challenge binding validated.
5. `COMMITTED`: Atomically registered in persistent `WorkerOnboardingRegistry`.

---

## 2. API Routes & Request/Response Contracts

All routes are mounted under `/onboarding/*` in the unified HTTP application (`createOnboardingApp`).

### 2.1 `POST /onboarding/session`
Initiates a new onboarding session and generates an unpredictable challenge nonce.
- **Request Body:**
  ```json
  {
    "walletAddress": "0x7587975965d97843365c87c090927b52955a31fa",
    "ttlSeconds": 1800,
    "challengeTtlSeconds": 300
  }
  ```
- **Response `201 Created`:**
  ```json
  {
    "sessionId": "7cdc803a-db62-45a4-90c8-400014f8cf3d",
    "challengeNonce": "0x8fb4b483d6749b54faa3e511f6065d502b02dabd5a43e1168ca8acf997b56ea6",
    "challengeExpiresAt": 1728448800000,
    "state": "SESSION_CREATED",
    "expiresAt": 1728450300000
  }
  ```

### 2.2 `POST /onboarding/session/:sessionId/verify-wallet`
Verifies EVM personal_sign over the server challenge.
- **Canonical Message Format:**
  ```
  GigVault Worker Onboarding Challenge
  Session: <sessionId>
  Challenge: <challengeNonce>
  Wallet: <walletAddress>
  ```
- **Request Body:**
  ```json
  {
    "walletAddress": "0x7587975965d97843365c87c090927b52955a31fa",
    "signature": "0x..."
  }
  ```
- **Response `200 OK`:**
  ```json
  {
    "sessionId": "7cdc803a-db62-45a4-90c8-400014f8cf3d",
    "walletAddress": "0x7587975965d97843365c87c090927b52955a31fa",
    "state": "WALLET_VERIFIED",
    "walletVerifiedAt": 1728448510000
  }
  ```
- **Rejection Codes:**
  - `401 Unauthorized` (`INVALID_WALLET_SIGNATURE`): Signature from wrong signer or forged message.
  - `409 Conflict` (`REGISTRATION_CONFLICT`): Wallet already registered to an active worker.
  - `410 Gone` (`CHALLENGE_EXPIRED`): Challenge nonce expired.

### 2.3 `POST /onboarding/session/:sessionId/phone/request-otp`
Dispatches a single-use OTP code to an Indian mobile number.
- **Request Body:**
  ```json
  {
    "phoneNumber": "+91 98765 43210"
  }
  ```
- **Response `200 OK`:**
  ```json
  {
    "sessionId": "7cdc803a-db62-45a4-90c8-400014f8cf3d",
    "verificationId": "mock-verify-0df63d335d229501",
    "phoneMasked": "+91******3210",
    "cooldownSeconds": 60
  }
  ```
  *(Notice: Plaintext OTP code and full phone number are NEVER returned)*
- **Rejection Codes:**
  - `400 Bad Request` (`INVALID_PHONE_NUMBER`): Number is not a valid 10-digit Indian mobile.
  - `409 Conflict` (`REGISTRATION_CONFLICT`): Phone number already bound to another active worker.
  - `429 Too Many Requests` (`OTP_COOLDOWN_ACTIVE`): Request made within 60s cooldown window.
  - `429 Too Many Requests` (`OTP_RATE_LIMIT_EXCEEDED`): Max hourly dispatch attempts exceeded.

### 2.4 `POST /onboarding/session/:sessionId/phone/verify-otp`
Verifies possession of the phone number.
- **Request Body:**
  ```json
  {
    "otpCode": "283737"
  }
  ```
- **Response `200 OK`:**
  ```json
  {
    "sessionId": "7cdc803a-db62-45a4-90c8-400014f8cf3d",
    "phoneMasked": "+91******3210",
    "state": "PHONE_VERIFIED",
    "phoneVerifiedAt": 1728448520000
  }
  ```
- **Rejection Codes:**
  - `401 Unauthorized` (`INVALID_OTP_CODE`): Incorrect OTP code (returns remaining attempts).
  - `410 Gone` (`OTP_EXPIRED_OR_NOT_FOUND`): OTP expired (300s window) or already consumed.
  - `429 Too Many Requests` (`OTP_MAX_ATTEMPTS_EXCEEDED`): Attempt limit reached (max 3).

### 2.5 `POST /onboarding/session/:sessionId/aadhaar/verify`
Submits either Mode A (Real Anon Aadhaar Groth16) or Mode B (Mock IDP assertion) proof.
- **Request Body (Mode B — Synthetic Personas):**
  ```json
  {
    "mode": "SYNTHETIC_MOCK_IDP",
    "mockAssertionPayload": {
      "assertion": { ... }
    }
  }
  ```
- **Request Body (Mode A — Real Anon Aadhaar):**
  ```json
  {
    "mode": "REAL_ANON_AADHAAR",
    "realProofPayload": {
      "groth16Proof": { "pi_a": [...], "pi_b": [...], "pi_c": [...], "protocol": "groth16" },
      "pubkeyHash": "153344406208579485121408801822606821217596075402008436573802272506162804618",
      "nullifier": "1234567890",
      "timestamp": 1728448500,
      "nullifierSeed": "42",
      "signal": "67041539209778248473950293750239572"
    }
  }
  ```
- **Response `200 OK`:**
  ```json
  {
    "sessionId": "7cdc803a-db62-45a4-90c8-400014f8cf3d",
    "identityNullifier": "0x1111111111111111111111111111111111111111111111111111111111111111",
    "identityTrustMode": "SYNTHETIC_MOCK_IDP",
    "state": "AADHAAR_VERIFIED",
    "aadhaarVerifiedAt": 1728448530000
  }
  ```
- **Rejection Codes:**
  - `403 Forbidden` (`AADHAAR_VERIFICATION_FAILED`): Tampered Groth16 proof, untrusted UIDAI RSA public key hash, mismatched public signal binding, or untrusted mock IDP signature.
  - `409 Conflict` (`REGISTRATION_CONFLICT`): Identity nullifier is already bound to a different wallet.

### 2.6 `POST /onboarding/session/:sessionId/commit`
Atomically records the binding into the durable registry.
- **Request Body:** `{}`
- **Response `200 OK`:**
  ```json
  {
    "workerId": "WRK_0x11111111_758797",
    "walletAddress": "0x7587975965d97843365c87c090927b52955a31fa",
    "identityNullifier": "0x1111111111111111111111111111111111111111111111111111111111111111",
    "identityTrustMode": "SYNTHETIC_MOCK_IDP",
    "phoneMasked": "+91******3210",
    "bindingVersion": 1,
    "committedAt": 1728448540000
  }
  ```

### 2.7 `GET /onboarding/worker/:walletAddress`
Queries active worker registration. Returns `200 OK` with public binding metadata or `404 Not Found`.

### 2.8 `POST /onboarding/dev/test-otp` (Isolated Development Hook)
- Enabled strictly when `allowDevTestRetrieval: true` in development or unit tests.
- Rejects with `403 Forbidden` (`DEV_TEST_RETRIEVAL_DISABLED`) in ordinary production environments.

---

## 3. Separation of Identity Elements & Trust Boundaries

The system strictly distinguishes between factors of authentication and does NOT conflate them:

| Authentication Factor | What It Verifies | What It DOES NOT Verify |
|---|---|---|
| **EVM Wallet Challenge** | Possession of private key corresponding to public address. | Does not verify identity or human individuality. |
| **Phone OTP** | Possession of Indian SIM card / mobile number. | **Does NOT prove ownership of Aadhaar or bank account.** |
| **Mode B Mock IDP** | Synthetic persona identity assertion signed by trusted hackathon authority. | Not real Aadhaar; cannot access real bank accounts. |
| **Mode A Real Anon Aadhaar** | Genuine Groth16 ZK proof over UIDAI RSA signature on Aadhaar QR code. | Does not prove bank account ownership without FIP e-KYC binding. |

> [!IMPORTANT]
> **Aadhaar Phone Disclaimer:**  
> Phone OTP in GigVault verifies mobile possession by the worker. It **does NOT** verify that this phone number is registered with UIDAI on the citizen's Aadhaar record, because offline QR codes generated by UIDAI do not contain plaintext mobile numbers or phone verification channels. Do not claim UIDAI phone linkage.

---

## 4. Privacy & Data Storage Guarantees

Persistent storage in `WorkerOnboardingRegistry` records **only the strict minimum**:
- `workerId`: Internal opaque identifier.
- `walletAddress`: Canonical lowercase 20-byte EVM address.
- `identityNullifier`: Privacy-preserving application-scoped nullifier.
- `identityTrustMode`: `SYNTHETIC_MOCK_IDP` or `REAL_ANON_AADHAAR`.
- `phoneHash`: Keyed HMAC-SHA256 digest of normalized E.164 phone number.
- `phoneMasked`: Display string (e.g. `+91******3210`).
- `bindingVersion`, `createdAt`, `updatedAt`, `status`, `auditLog`.

### Strictly Excluded from Persistence:
- ❌ Plaintext Aadhaar numbers or demographic details.
- ❌ Aadhaar QR images or raw signed payloads.
- ❌ Plaintext mobile phone numbers.
- ❌ FIP transactions, bank balances, or plaintext EvidenceSnapshots.

---

## 5. Provider Configuration

### 5.1 Mock Phone Provider (`MockPhoneVerificationProvider`)
Default offline provider for local development, demo, and CI test suites:
- `otpExpirySeconds`: 300 (5 minutes).
- `resendCooldownSeconds`: 60 (1 minute cooldown between requests).
- `maxAttempts`: 3 attempts before lockout.
- `maxHourlyRequests`: 5 per hour per phone.
- `allowDevTestRetrieval`: Enabled only in test/demo mode.

### 5.2 Optional Live SMS Provider (`TwilioVerifyPhoneProvider`)
Configured via dependency injection behind environment variables:
```bash
TWILIO_ACCOUNT_SID=ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_VERIFY_SERVICE_SID=VAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
TWILIO_ENABLED=true
```
- **India DLT Compliance Notice:** Dispatches to Indian mobile numbers (+91) require registered Principal Entity (PE) ID, approved Header (Sender ID), and registered Content Template ID under TRAI regulations.
- **Fail-Closed Guarantee:** When unconfigured or disabled, throws `TwilioProviderNotConfiguredError`. It **never silently falls back** to mock OTP in live mode.

---

## 6. Real Anon Aadhaar Integration & Trust-Boundary Corrections

### Verifier Implementation (`RealAnonAadhaarVerifier`)
1. **Genuine Server-Side SnarkJS Verification:** Executes `snarkjs.groth16.verify` against verified public signals and Groth16 proof.
2. **Fail-Closed Staging Key Policy:** Trusted issuer keys fail closed by default. Staging/test public key hashes (such as `153344406208579485121408801822606821217596075402008436573802272506162804618`) require explicit test-only configuration (`allowTestKeys: true`) and are **never silently trusted** in genuine production mode.
3. **Canonical Circuit Signal Schema & Ordering (Anon Aadhaar v2):**
   - Signal index 0: `nullifier`
   - Signal index 1: `pubkeyHash`
   - Signal index 2: `nullifierSeed`
   - Signal index 3: `signal`
   - Signal index 4: `timestamp`
   - Verified output fields are extracted strictly from the verified public signals array.
   - Any inconsistency between top-level payload fields and `publicSignals` array is strictly rejected with `AnonAadhaarPublicSignalMismatchError`.
4. **Session-Bound Proof Authorization (Replay Prevention):**
   - The verifier **strictly rejects wallet-only binding** (`BigInt(walletAddress).toString()`) as an insecure substitute for session-specific proof authorization.
   - Requires supported session-bound signal construction: `deriveAnonAadhaarSessionSignal(sessionId, challengeNonce, walletAddress)` reduced modulo the BN254 scalar field order `r`, or single-use session challenge scalar.
5. **Truth in Production Readiness (`NOT_YET_VERIFIED` Status):**
   - Production verification keys and UIDAI RSA trust roots must be officially pinned; production keys are never invented or guessed.
   - Unless genuine production keys and official vkey are explicitly configured, real verification status is honestly reported as `'NOT_YET_VERIFIED'` via `getVerificationStatus()`.

### Documented Upstream Protocol Limitations
1. **UIDAI RSA Key Rotations:** UIDAI periodically rotates RSA 2048 signing keys. A hardcoded key hash list requires periodic updates or verifiable trust-registry sync.
2. **Production Groth16 Artifact Distribution:** Full production Anon Aadhaar zkey artifacts are large (~100MB+) and require out-of-band provisioning. Genuine production verification remains `NOT_YET_VERIFIED` until production artifacts are deployed.
3. **Offline Data Boundary:** An offline Anon Aadhaar proof does not verify bank account ownership. In GigVault, connecting a real Anon Aadhaar proof to synthetic personas (e.g. Ramesh) is rejected by `OnboardingAttestationAdapter` with `UnsupportedIdentityBridgeError`. Real-user banking requires an authenticated FIP with Aadhaar e-KYC account binding.

---

## 7. How to Run the Local Synthetic Onboarding Demo

Run the end-to-end local demo:
```bash
cd backend
npm run demo:onboarding
```

The script will demonstrate:
1. Synthetic worker (Ramesh Kumar) onboarding happy path.
2. EIP-191 wallet challenge verification.
3. Mock phone OTP verification.
4. Mode B Mock Aadhaar assertion verification.
5. Atomic registry commit.
6. Downstream FIP consent and 36-month evidence snapshot reconstruction.
7. 6 adversarial rejection gates:
   - Wrong OTP code
   - Wallet signature mismatch
   - Identity nullifier takeover
   - Untrusted IDP key
   - Fail-closed default rejecting test pubkey hash
   - Wallet-only signal binding rejection (requiring session signal)

---

## 8. Verification & Test Evidence

Run the full test suite:
```bash
npm test
npm run typecheck
npm run build
```

- **Tests Passing:** 147 tests across 25 suites (0 failures, 0 skipped).
- **TypeScript:** Strict typecheck passing with 0 errors.
- **Build:** Clean compilation to `dist/`.
