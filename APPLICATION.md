# Connected local GigVault application

Run `.\Start-GigVault.ps1` from this repository on Windows, then open http://localhost:3000. The frontend owns Backend A services, Backend B's trusted prover and a loopback local EVM through private child-process IPC. Later starts reuse verified proving prerequisites; they do not regenerate Groth16 keys.

## Authentication and registration

`/signup` uses an EIP-1193 browser wallet. `/development` explicitly isolates unlocked local test wallets and synthetic identity personas. An address or preselected persona never grants account access.

A new worker signs a random, expiring, single-use wallet challenge and then completes the independent registration challenge, random Mock OTP and trusted synthetic identity binding. The server returns only pending registration until all required checks finish. Mock OTP delivery opens inline, has expiry/cooldown/attempt limits, and is not SMS possession verification. Genuine Anon Aadhaar remains unavailable.

A registered worker signs a fresh wallet challenge and restores the backend account without repeating phone or identity registration. Consent expiry/revocation does not delete the account or prevent returning login. Verifier and administrator authority remain restricted to their configured wallets. Cookie presence is only a session locator; every protected page/API checks the backend session and role, and resource operations independently check ownership.

Challenges retain the existing application EIP-712 context: wallet, random nonce, origin hash, expiry, chain and purpose-specific domain/type. Sessions are opaque, held only in backend memory, and expire after 30 minutes. Cookies are HttpOnly, SameSite Strict and Secure on HTTPS; mutation requests require the configured Origin. Logout invalidates the server session. Browser account/network/disconnect events clear the session, and signing/transaction preflight checks the current wallet and chain. No localStorage flag authorizes anything.

## Aadhaar Verification experience

After phone verification, the existing onboarding screen now asks for a formatted 12-digit Aadhaar Number and offers Verify Aadhaar. This is an Aadhaar-themed **Mock IDP** experience, not UIDAI or genuine Aadhaar verification. Only seven exact fictional, zero-prefixed evaluation identifiers are accepted; arbitrary numbers or persona names are rejected. The server resolves the stable existing identity, issues its wallet-bound signed assertion, and the existing onboarding verifier independently verifies it before committing registration. First registration still requires wallet ownership and OTP. Duplicate binding/recovery rules and returning wallet login remain unchanged.

The input is transient, cleared after submission and never added to account records, assertions or history. The fixed allowlist is evaluation configuration. Use only the identifiers in [the teammate evaluation guide](docs/review/IDENTITY_EVALUATION_GUIDE.md); never submit a real Aadhaar number. Repetitive primary-screen warnings were removed; technical disclosures remain here and in the existing environment section. OTP still uses the disclosed local Mock mailbox. See [focused validation](docs/review/AADHAAR_EXPERIENCE_VALIDATION.md).

## Persistent local state

The normal frontend uses `contracts/artifacts/application-state`, ignored by Git. Set `GIGVAULT_APPLICATION_DATA` before starting to select another private profile. Keep the **whole directory** together: it contains Ganache's chain database, stable development-wallet seed/RPC port, deployment addresses/code hashes, trusted synthetic signing keys, protected phone references, registry/account records, consent metadata, requests, public proof packages and bounded history. It contains private service material; do not publish it or put it in a served directory.

One live backend owns a profile. Competing owners fail closed. Account snapshots use an atomic rename and file sync. Backend A's file-backed replay protection persists consumed authorizations. Restart verifies the proving setup and deployed bytecode, restores the same chain/contracts and accounts, and requires a new login. Sessions, OTPs, pending wallet challenges, onboarding sessions and recovery grants are temporary. No raw bank statement, financial snapshot arrays or private witness is persisted by GigVault. Mock FIP regenerates its own fixed synthetic source records.

This is verified for orderly process restarts. Chain writes and the account JSON are separate stores, not a production transaction database; an abrupt crash between mining and metadata persistence can require reconciliation. Back up the complete private profile with the service stopped. No migration or automatic reset replaces an incompatible profile. RPC port conflicts and mismatched/missing chain state fail closed.

## Worker journey

After first registration, review and sign financial consent, then separately authorize passport issuance. Backend A checks FIP signature, account ownership and recognized payout sources; the attester derives the schema-2 Poseidon commitment and mines the actual passport. Private summaries derive from that same authenticated snapshot.

Worker routes remain Overview, My GigPassport, Work Evidence, Consent & Privacy, Verification Requests, Welfare Benefits, Microcredit and Activity & Settings. Work Evidence requires fresh signed FETCH_FINANCIAL_DATA authorization and returns only the latest 100 sanitized authenticated rows to their owner. Verifiers never receive these records.

Apply for Microcredit or Check Welfare eligibility requests a policy from the **authorized local service wallet**. The backend signs only the existing exact consumer policy for the session-owned passport. Caller-supplied criteria, signer, signature or passport cannot change it. The worker separately reviews the criteria/deadline, signs EIP-712 approval, and authorizes private reconstruction. Backend B checks current commitment/version and generates an actual Groth16 proof; Solidity verifies the proof. A valid proof can return FAIL without implying fraud or revoking the passport.

Borrow or Claim is a separate actual transaction. Lending transfers 100 MockUSDC; exact allowance and repayment clear identity-keyed debt. Reborrowing requires a new service request, worker approval and proof. Welfare records one lifetime claim per stable identity and transfers no token. Balances, debt and claim status come from chain reads, not UI constants. Browser wallets can request a fixed 0.25 local test ETH gas transfer after registration, limited to their session-owned address once per day; these assets have no monetary value.

Expired/rejected/completed requests remain visible for up to 90 days, within the bounded local archive. Old results cannot execute against changed evidence. Renew consent before fresh evidence access; after refresh, request a new policy/approval/proof. Ineligible or obsolete results do not lock out a new application. Refresh changes evidence, not the worker account.

## Account entry and guided recovery

Create Account starts with a phone form, then follows backend-confirmed OTP, signed fictional identity, financial consent and actual passport creation. Sign In restores an existing account or reports an unregistered connection. Recover Account checks the original passport and replacement approval before allowing original-phone and matching-identity onboarding. Local unlocked test wallets are explicitly selected inside the collapsed Connection options panel; browser-wallet challenges remain supported. No new key custody or embedded-wallet service is configured.

The intended future worker experience is phone → OTP → Aadhaar verification → automatic unique wallet provisioning → consent → passport; returning access is phone → OTP → Aadhaar authentication. Those walletless flows are not implemented by the current backend. Signup still requires wallet challenges before OTP, and returning login currently authenticates with a fresh registered-wallet signature. Discreet Service information and Account information sections disclose these limitations. Primary screens use natural product language and do not render dummy phone-login or wallet-provisioning actions. Fictional identifiers alone are not genuine identity authentication. See docs/review/WORKER_ENTRY_BROWSER_VALIDATION.md for current browser evidence.

The authorized administrator loads a passport's actual recovery status and follows Revoke Passport → Authorize Reissue → Approve Replacement Wallet. The approved wallet automatically starts recovery onboarding; it re-verifies the original phone and matching identity, signs fresh financial consent and creates the replacement passport. The read-only status endpoint is limited to the administrator, original passport holder and approved replacement wallet. Replacement approval expires after 30 minutes and is intentionally temporary across server restart. Completion is reported only from a real replacement passport on chain.

New verifier results focus the exact signed request ID. PENDING_WORKER means no approved proof exists; share the displayed link/QR so its holder can sign in and approve. History retains other permitted requests. Focused executed evidence is in [Ideathon workflow validation](docs/review/IDEATHON_WORKFLOW_POLISH.md).

## Verifier and recovery

The verifier portal retains public lookup, custom optional fact policies, fixed service policies, signed request creation, permitted proof results and request history. Only the configured verifier signs these requests; workers explicitly approve them. Public passport lookup/QR exposes the chain record, never private financial summaries.

Admin recovery remains separate: revoke the old passport, authorize reissue on chain, approve a particular replacement binding, then complete replacement wallet/OTP/matching identity checks, fresh consent and reissuance. Stable identity debt and lifetime welfare state survive replacement. Repayment requires actual test-token funds on the replacement wallet.

## Validation

From the repository root, with the public proving cache configured:

```powershell
$env:GIGVAULT_LOCAL_SETUP_CACHE=(Resolve-Path contracts/artifacts/demo-setup-cache).Path
node --test --test-force-exit --test-concurrency=1 contracts/test/application-auth.test.mjs contracts/test/application.test.mjs contracts/test/application-persistence.test.mjs contracts/test/external-wallet.test.mjs contracts/test/browser-wallet.test.mjs contracts/test/application-profile.test.mjs contracts/test/local-wallet-auth.test.mjs
# While the production frontend runs:
node --test contracts/test/application-http.mjs
npm --prefix frontend run build
npm --prefix backend test
```

See `docs/review/AUTHENTICATION_AND_WORKFLOWS_VALIDATION.md` for actual executed results and limits. Historical reports retain their original test evidence; this document supersedes their temporary-state and returning-OTP descriptions.

The application retains the restored original design from commit 1372b64 and the protected multipage architecture. No circuits, Solidity sources, shared financial/proof formats or EIP-712 consumer authorization rules changed. Synthetic OTP/IDP/FIP, MockUSDC and local EVM remain disclosed. This is a local evaluation application; unlocked development RPC accounts do not secure the service against a hostile local machine user. No wallet extension is installed on this device: independent EIP-1193 test-provider acceptance is distinct from unperformed MetaMask extension acceptance.
