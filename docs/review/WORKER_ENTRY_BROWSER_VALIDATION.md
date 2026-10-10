# Worker entry browser validation — 2026-10-10

## Scope and implementation

WorkerEntry.tsx provides three different journeys using the existing ProductApplication actions and protected backend. Create Account starts with a phone form and proceeds through OTP, independently signed fictional identity, financial consent and actual issuance. Sign In restores an existing registered account and reports unregistered connections. Recover Account looks up public passport status, then protected recovery authorization, before offering original-phone and matching-identity recovery. Private status denied to a connection is labeled unavailable rather than guessed.

The original blue design, typography, route architecture, signed wallet challenges, EIP-712 consent and authorization, persistent accounts and blockchain operations remain. Local unlocked evaluation wallets are explicitly selected in collapsed Prototype testing mode. No backend, contracts, ZK circuits, financial logic, dependency additions or custody architecture changed.

## Tests actually executed

From contracts: `node --test --test-force-exit test/workflow-polish.test.mjs test/application-auth.test.mjs test/workflow-feedback.test.mjs test/fictional-aadhaar.test.mjs` — **7 passed, 0 failed**. Covers wallet/OTP/identity registration, fresh returning-wallet challenge, all seven valid fictional credentials, malformed/unknown/real-format identifiers, duplicate binding, original-phone recovery through actual replacement issuance, exact verifier request state, expired recovery grants and friendly exception messages. Ganache used its existing JavaScript fallback after an optional native-module warning.

Frontend: `npm run build --prefix frontend` — **passed**, including TypeScript checks and all 31 pages. Initial checks found and corrected a missing UI prop and a local build-output permission issue; the final build passed. No expensive unrelated Groth16 proof suites were rerun.

## Actual production-browser acceptance

Used the existing persistent local application profile, without resetting saved accounts or chain state.

- Create Account: explicitly selected unused evaluation connection B; a phone already bound to another identity was rejected. Unused fictional phone completed real OTP verification, fictional SURESH identifier resolved through the trusted signed provider, identity completed, fresh financial consent signed, passport authorization signed. The local chain issued **passport #6 ACTIVE** for Suresh Gowda with 12/12 completed-month activity.
- Returning Sign In: signed out, selected the same test connection and signed a fresh wallet challenge. Restored Suresh's existing ACTIVE #6 directly; no duplicate identity, new registration or OTP-success fabrication.
- Unapproved Recover Account: connection E checked #6. Public ACTIVE status remained visible; private reissue status was unavailable and recovery was not offered. Administrator UI confirmed ACTIVE / not authorized with later stages disabled.
- Explicitly approved full recovery test: after automatic approval review declined revocation, the user expressly approved revoking fictional #6 and completing its replacement. Administrator revoked #6 (confirmed local block 35), authorized reissue (block 36) and approved unused connection E. Worker UI read real REVOKED / Authorized / Approved status and the grant deadline. Begin verified recovery used the original phone and matching SURESH identity, obtained fresh signed consent and signed replacement issuance. The actual worker dashboard showed **replacement passport #7 ACTIVE**, Suresh Gowda and the same 12/12 completed-month activity. No claim is made about transferring a nonzero loan or welfare entitlement in this particular browser fixture; unchanged identity-keyed contract logic handles those obligations.

## Current authentication boundary

The finalized target is phone → OTP → Aadhaar verification → automatically provision a unique wallet → consent → passport, with phone → OTP → Aadhaar authentication for returning access. This task does **not** implement that backend.

Currently signup requires wallet challenges before OTP; returning sign-in requires a fresh signature from the registered wallet. No automatic wallet provisioning, secure wallet custody, phone-and-identity login, real SMS or UIDAI integration is available. Fictional identifier matching alone is not genuine authentication. Recovery still requires prior administrator approval, the approved replacement wallet, the original phone, matching signed identity and fresh consent. The UI explicitly explains these limits instead of providing dummy phone-login or provisioning controls. Browser-wallet extension acceptance remains untested because no extension is installed; the local demonstration requires none.

Historical validation documents retain their original evidence; this report describes this worker-entry change.

## Responsive final-build browser check

Desktop entry was visually checked at the browser's 1280-pixel viewport. The browser viewport override did not actually change its dimensions, so a temporary same-origin harness rendered the actual app inside a 390 × 844 iframe. Its content client width and document scroll width were both 375 pixels (390 minus its scrollbar), including the worker dashboard and recovery form: no horizontal page overflow. The harness was removed and is not part of the change.

At that mobile width, invalid phone input kept Continue disabled; Sign In contained no signup phone form; Recover Account contained the original-passport lookup rather than a registration form. Explicit testing-mode sign-in on replacement connection E restored Suresh's ACTIVE #7 after server restart. Original connection B's recovery lookup read #6 REVOKED and replacement #7 already issued, with no Begin recovery action. The completed record's issuance label was corrected to Completed instead of implying it needed another administrator authorization after the grant had been consumed.

## Consumer-facing presentation update — 2026-10-10

Primary worker screens now use natural product language: Verify Phone, Verify Aadhaar and Create GigPassport. The former Prototype testing mode label is now Connection options; local evaluation accounts remain explicitly described inside that collapsed section. Account information and Service information retain environment, security and walletless-authentication limitations. Consent identifies Apna Bank as the local provider without implying live bank connectivity. The accessible service disclosure explicitly states that UIDAI, SMS and bank connectivity are not live.

Actual checks for this wording-only update: frontend production build passed, including TypeScript and 31 pages; browser inspected the signup page and opened/closed Service information, then used the existing local account connection to sign in and restore Suresh Gowda's persisted ACTIVE passport #7 after server restart. No backend, persistence, signing, contract, proof, eligibility or accounting changes. No new onboarding, recovery or proof suite was executed for this copy-only update; earlier results above remain historical evidence.
