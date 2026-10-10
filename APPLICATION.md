# Connected local GigVault application

Start from the repository root on Windows with Node.js 24, npm and Git:

```powershell
.\Start-GigVault.ps1
```

Open http://localhost:3000. This command installs only missing dependencies, builds only missing circuit artifacts and compiles shared TypeScript. The frontend server owns a private child process containing Backend A services, Backend B's trusted prover and a loopback EVM. There is no unauthenticated evidence or witness HTTP endpoint. First start may download the free pinned compiler/transcript and create a local proving key. Later starts reuse public proving prerequisites from `contracts/artifacts/demo-setup-cache`, after checking all six artifact digests and setup identity. No wallet keys or ceremony entropy are saved in that cache. Circom and Solidity consumer rules are unchanged.

## Acceptance journey

1. Select a local development wallet and verify ownership using the server-issued EIP-712 challenge. This creates a restricted HttpOnly bootstrap session, not a completed worker login; it expires after 30 minutes. Private worker access is denied until authentication completes.
2. Begin identity registration and sign the independent wallet challenge. Select RAMESH, use the supplied synthetic phone and send a phone code. The local test mailbox opens inline automatically. Enter that random code, then complete signed synthetic identity verification. Until both checks complete, the UI shows pending registration rather than signed-in worker status. Resend has a live cooldown; a rejected resend retains the current mailbox. Reload resumes the active onboarding session. There is no fixed OTP and no real SMS or government verification.
On later sign-ins, wallet ownership is followed by a fresh OTP to the already registered phone. The server checks its protected phone hash, rejects a different number, and withholds the worker dashboard, evidence, consent and consumer access until OTP verification. Admin and verifier accounts retain their distinct wallet-authenticated roles. The test mailbox emulates delivery, not actual SMS possession.
3. Review and sign FIP consent, then mint. The attester verifies the signed FIP records, owner and recognized payout sources, calculates schema-2 Poseidon and mines the passport transaction. The private summary comes from that same authenticated snapshot, not frontend constants.
4. Disconnect; choose Verifier; sign in. Enter the actual passport ID, select welfare, loan or a custom optional policy, and sign/send the request. Consumer policies retain their exact existing thresholds. Custom policies have no universal income rule.
5. Disconnect; choose the original worker; sign in. Review the exact policy and expiry, approve it, then separately authorize private reconstruction. The trusted prover reconstructs Backend A evidence, checks current commitment/version and generates a real Groth16 proof. The deployed consumer verifies the proof. PASS and valid FAIL are separate from rejected integrity/authentication requests.
6. Execute welfare claim or loan separately. Welfare is a lifetime claim event/state benefit with **no token transfer**. The loan transfers exactly 100 MockUSDC. Approve exactly 100 MockUSDC and repay it; the dashboard reads actual debt and token balance.
7. Public passport QR/link exposes only the chain record. Request QR/link leads to the signed request in the authenticated worker dashboard. Verifiers see policy PASS/FAIL and public passport context, never private financial amounts or activity arrays.

RAMESH is eligible; IMRAN demonstrates income PASS/activity FAIL; MANJUNATH demonstrates insufficient history. All seven signed FIP personas are supplied by Backend A. Raw evidence stays in Mock FIP; only aggregate worker-specific summaries and bounded action history are retained by the app.

## Refresh and recovery

Refresh asks for a new consent covering the current cutoff, then a separate refresh signature. A consent with an older scope cannot make newer evidence appear fresh. Consent revocation blocks further reconstruction; it does not retroactively delete an already verified proof or revoke the passport. Refresh changes the version/commitment and invalidates previous approvals/proofs.

Connect Administrator. Enter the old passport ID and revoke it, authorize reissue on-chain, then approve a specific replacement wallet address. Sign in as that replacement, enter the granted stable identity in the recovery field, complete its own challenge/OTP and matching synthetic persona verification, give fresh consent and reissue. The original identity remains unchanged; the old wallet loses service access. Welfare claims and outstanding debt survive replacement. Recovery requires both the on-chain admin authorization and private admin-approved replacement binding.

A replacement wallet needs its own local ETH and 100 MockUSDC to repay existing debt. The app does not manufacture a replacement balance or erase debt. In the automated test the old wallet transfers its actual borrowed balance to the replacement. A real lost-wallet scenario requires the replacement to obtain test tokens separately. The originally registered protected phone reference remains in the identity registry; replacement OTP authenticates the recovery session.

## Validation

```powershell
$env:GIGVAULT_LOCAL_SETUP_CACHE=(Resolve-Path contracts/artifacts/demo-setup-cache).Path
node --test --test-force-exit --test-concurrency=1 contracts/test/application-auth.test.mjs contracts/test/application.test.mjs
# While the frontend runs:
node --test contracts/test/application-http.mjs
npm --prefix frontend run typecheck
npm --prefix frontend run build
npm --prefix backend test
```

The application test runs genuine PASS/FAIL proofs and mined issuance, welfare, borrowing, recovery, repayment and refresh; it also rejects forged approvals, replay, unauthorized roles and revoked consent. HTTP checks cover origin, cookie-owned identity, expired/used login challenges, private mailbox ownership, private-data disclosure, missing passports and quarantined legacy endpoints. Existing contract/prover/circuit tests cover modified policies, stale evidence, tampered Groth16 packages, duplicate identities, Fr/Fq bounds and untrusted Aadhaar configurations. See `docs/review/PRODUCT_COMPLETION_VALIDATION.md` for this run's executed results and browser evidence.

## Limits and preservation

This is a local synthetic application, not public-chain, live bank, SMS or genuine Aadhaar deployment. Development Ganache wallets are unlocked on loopback; anyone with local machine/RPC access can use them. HttpOnly authentication protects application endpoints against another remote web origin, not a hostile local machine user. A production system needs locked user wallets, durable chain/service metadata, verified identity artifacts and restricted service infrastructure.

State is intentionally in memory and the local chain restarts with the server. Persisted login cookies become invalid after restart. Requests expire after 15 minutes; approvals do not survive changed passport evidence. Proving is serialized and can take several minutes. The retained UI is English; translation and injected-wallet extension acceptance were not exercised in this run. External wallets need ETH on chain 1337; the default supplied development-wallet flow is the acceptance environment.

Legacy emergency UI sources and branches remain in Git history. Their routes redirect to the connected application and their APIs return 410. The old P-256 QR owner-signature bypass is removed. The old mock libraries are preserved for comparison and cannot authorize this application. No legacy circuits/commitments were relabelled, no consumer rules changed, and main was not merged by this work.
