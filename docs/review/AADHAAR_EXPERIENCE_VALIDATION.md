# Aadhaar Verification experience — focused validation

10 October 2026, integration branch `codex/product-completion`, PR #4, starting at `12e0127`.

## Change

The existing onboarding card now presents **Aadhaar Verification**, “Verify your identity to secure your GigPassport.”, a labeled numeric-text input grouped into 4-digit blocks (12 underlying digits), **Verify Aadhaar**, and **Identity verification complete** on success. Original styling and five-step onboarding remain. The persona selector and repeated primary onboarding warnings are removed. Technical disclosure stays in APPLICATION.md, the environment section and the separate ID evaluation guide. There are no government-response or UIDAI-integration claims.

A server-only adapter (`contracts/local/fictional-aadhaar.mjs`) maps seven exact zero-prefixed fictional identifiers to the existing Mock IDP identities. It rejects malformed, unknown, numeric-type and arbitrary 12-digit values with a fixed error, without invoking the signer or echoing input. The old persona-name API path is rejected. Wallet ownership and PHONE_VERIFIED state are checked before issuing an assertion. The existing trusted IDP signs it; the existing onboarding verifier independently verifies its signature and wallet binding before committing. Existing duplicate binding and controlled recovery checks remain. Submitted identifiers are not added to persisted registry/worker records, assertions or history; frontend state clears after submission. Allowlist constants are test configuration, not captured inputs.

UI and adapter changes do not touch circuits, Solidity, proof formats, financial evidence or consent rules. Existing application/persistence/external-wallet test fixtures now submit fictional identifiers instead of persona names, including recovery fixtures; expensive proof suites were not rerun.

## Actually executed

- `node --test contracts/test/fictional-aadhaar.test.mjs`: **2 passed**, 0 failed (0.149 seconds). Covers all seven unique mappings; assertion payload has only the existing identity/wallet fields; invalid, unknown and old persona inputs never invoke the signer.
- From `contracts`, `node --test --test-force-exit test/application-auth.test.mjs test/external-wallet.test.mjs`: **2 passed**, 0 failed (43.518 seconds). Actual signed onboarding, correct/wrong OTP, pre-OTP identity rejection, malformed/unknown/arbitrary identifiers, rejection of old persona parameter, session ownership, duplicate identity on a second OTP-verified wallet, returning fresh-wallet login, onboarding-to-consent and authenticated FIP progression. Independent EIP-1193 test wallet and second registered identity still issue actual passports/send mined local EVM transactions.
- Frontend `npm run build`: **passed**, including type checking and production route generation; compilation 9.1 seconds.
- `git diff --check`: **passed** after whitespace cleanup.

The initial unit-test run had one assertion failure because its fabricated zero-filled nullifier contained the fictional identifier as a substring. The fixture was corrected to an unrelated nullifier; the final two-test run passed. No application failure was hidden by that fixture correction.

## Remaining limits

This is not genuine Aadhaar, UIDAI, Anon Aadhaar or SMS verification. Only documented fictional credentials are supported. No real credentials were used. Actual MetaMask extension UX remains unverified because none is installed; the independent EIP-1193 provider test is distinct. No new browser walkthrough or expensive full proof/persistence suite is claimed for this focused change. Prior complete workflow evidence remains in AUTHENTICATION_AND_WORKFLOWS_VALIDATION.md and is explicitly historical.

Publication is limited to the existing integration branch and PR #4. No deployment, hosting or merge to main is part of this change.
