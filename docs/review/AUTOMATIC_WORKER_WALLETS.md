# Local automatic worker accounts

## Implemented boundary

On the configured loopback origin, Create Account verifies a Mock OTP and an exact fictional identity before generating an independent cryptographically random wallet. The trusted Mock IDP signs a fresh wallet-bound assertion; its signature and claims are independently checked. Registration retains the existing wallet challenge, onboarding verifier, unique phone/identity registry, signed consent and real passport transaction. To reuse the unchanged Mock onboarding service, the controller bridges the already-verified phone through a second internal Mock OTP check; this bridge is explicitly unsuitable for real SMS.

Sign In requires the registered phone, a fresh Mock OTP and matching fictional identity. It decrypts the existing account key, signs a fresh wallet challenge and establishes the existing protected session. It neither generates another wallet nor repeats registration. Ordinary signup and login need no extension or wallet selection. Pending phone verification does not create a worker session.

`managed-wallets.json` stores authenticated AES-256-GCM ciphertext, random IVs and tags, with identity/address authenticated as associated data. The separate master key is protected with Windows DPAPI CurrentUser, or file permissions 0600 under a 0700 directory on other hosts. Generated private keys and recovery phrases are never returned to the frontend, included in public application information, added to logs or committed. Losing the master key fails closed. Existing application-profile locking and atomic file writes are reused. Vault allocation precedes registry commit; an interrupted registration can reuse that pending allocation only for the same identity and phone hash.

Only backend-created reviewed action messages, exact owned worker approvals and fixed consumer/repayment transactions can be signed. No generic signing, transfer, key-export or arbitrary-transaction endpoint is provided. Local gas funding is the existing fixed, rate-limited 0.25 valueless ETH transfer to the authenticated worker. Existing EIP-712 verification, consent, proof, consumer and obligation checks remain enforced.

## Compatibility and limits

Existing known unlocked local worker accounts can use phone-first login without changing their address or passport. An existing external-wallet account still requires its original browser-wallet connection, since the server does not possess that private key. The separate Connection options panel preserves both original wallet paths. Existing verifier authorization and administrator-controlled recovery remain unchanged. Automatic replacement-wallet provisioning/recovery is not implemented; recovery still requires the administrator-approved replacement connection, original phone and matching identity.

This is local custody, not a production custody service. The simulated mailbox does not prove real phone possession, and fictional identifiers do not authenticate a real person. A malicious local evaluator able to read Mock codes and the evaluation guide can impersonate a fictional identity. Neither live UIDAI nor real SMS/bank connectivity is claimed. DPAPI protection does not protect against compromise of the owning OS account; non-Windows file protection is not an HSM or managed secret vault. Existing unlocked development keys remain evaluation infrastructure. Do not host this configuration publicly or use it for valuable funds or real identity data.

Sessions and pending OTP/recovery grants expire and do not survive backend restart. Accounts, encrypted wallet associations, consent/history and local blockchain state do survive. Real contracts, circuits, eligibility and lending/welfare accounting are unchanged.

## Verification

Targeted automated tests cover two independently generated wallets, activation after OTP and identity, invalid identifiers, duplicates, foreign-worker authorization, signed consent, real passport issuance, logout, encrypted persistence and matching wallet/passport after restart. A real signed verifier request and managed worker approval are checked; consumer execution without a proof is rejected. Original wallet authentication and authorized replacement-wallet recovery regressions pass. HTTP checks cover origin rejection, cookie-only authority, forged flow/session tokens, managed-session injection, arbitrary-signing rejection and private-key absence in public information.

Executed on October 10, 2026:

- `node --test --test-force-exit test/managed-auth.test.mjs`: 1 integration test passed, including two new wallets, real issuance, fresh returning login after backend restart and signed verifier/worker approval.
- `node --test --test-force-exit test/application-auth.test.mjs test/workflow-polish.test.mjs` (in the initial three-file invocation): both existing integration tests passed. The new test initially failed on error assertion formatting, was corrected, and then passed separately; security logic was not relaxed.
- `node --test --test-force-exit test/local-wallet-auth.test.mjs test/fictional-aadhaar.test.mjs test/browser-wallet.test.mjs test/workflow-feedback.test.mjs`: 15 tests passed.
- `node test/managed-auth-http.mjs`: 8 checks against the actual localhost application passed.
- `npm run build` in frontend: final production build and type checks passed, 31 static pages generated. The initial restricted build could not resolve imports through linked dependencies; the build passed with access to the existing dependency location, without package installation.
- Actual browser: Farhan signed up on `/signup?entry=create`, completed OTP, fictional identity, signed consent and real ACTIVE passport #8, without opening Connection options. Sign out and phone-first sign in restored #8; browser refresh retained the authenticated account. A subsequent actual backend restart and fresh OTP/identity login restored the same public wallet `0x9dd225527F054D6742d08F813bB9aBBc0Dd649A4`, passport #8, evidence version/commitment and consent/issuance history.
- Existing-account browser compatibility: phone-first login restored Suresh's already recovered ACTIVE passport #7, the unchanged replacement wallet `0x2f9FBb2D1c25f3790eDC7be919aD4556D1EB50C1` and original recovery/consent/issuance history. No wallet controls were opened during that login. No existing passport was revoked or reissued in this change's browser walkthrough.

No real UIDAI/SMS or browser extension was used. Full expensive proof suites and new lending/welfare end-to-end proving journeys were intentionally not rerun for this authentication change. The managed consumer transaction boundary was tested for unauthorized/missing-proof rejection, not a fresh funded claim/loan.
