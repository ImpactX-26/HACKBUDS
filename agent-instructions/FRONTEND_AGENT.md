# GigVault — Frontend AI Coding Agent

**Owner:** Frontend teammate. **Status:** Implementation instructions implementing locked UX, not a new feature request.

## Mandatory reading

Read root `AGENTS.md`, `docs/reference/GIGVAULT_FRONTEND_REQUIREMENTS_LOCKED.md`, `docs/reference/GIGVAULT_DECISION_REGISTER.md`, `docs/INTEGRATION_RULES.md`. Read the relevant sections of implementation plan. Do not interpret the older 2026 frontend implementation plan as authority over the synchronized requirements.

## Scope / deliverables

Implement all approved UI surfaces as responsive, coherent product experiences:

**Worker:** wallet state, identity (Anon Aadhaar preferred/mock fallback accurately indicated in technical context), FIP consent, worker-visible realistically seeded bank transaction table with *Bank/FIP data | GigVault analysis*, authenticated/classified counts, evidence summary, Create Passport, chain status/version/explorer link, refresh same passport, view transactions, request review and approve/decline, proof generation progress, per-condition results, local-only activity history (20 records or 90 days whichever smaller).

**General verifier:** EVM signer identity, optional criteria (min average income + month window, WEEK/MONTH activity unit + N + minimum active periods, minimum history, maximum evidence age, expiration), canonical immutable signed request, primary embedded “Verify with GigVault” and secondary verifier-request QR/deep link, waiting/approval/proof results, chain/ZK/signature/condition pipeline and technical drawer. Core does **not** assign verifier type or impose a universal 20k threshold.

**Passport QR:** shows public passport information and starts a signed verifier request; never silently yields private proof. **Verifier-request QR:** opens exact signed policy for worker approval; same verification engine.

**WelfareVault:** looks like separate “Gig Worker Support Benefit” service. Locked criteria: ACTIVE passport, >=6-month history, >=4 active months in latest 6 completed months, <=90-day evidence age, one lifetime claim per stable identity. Verify and Claim must be separate visible steps. Hide/disable Claim when any check fails. Show claimed/already-claimed transaction states even after authorized reissue. No welfare income threshold.

**Microcredit:** separate app; >=₹20,000 average monthly recognized income over latest 6 **completed** months, >=12-month history, >=9 active months of latest 12 **completed** months, <=30-day freshness, ACTIVE, no active loan. Verify and Borrow separately. 100 MockUSDC/test asset in technical details; product face may say 100 USDC with Amoy/test-asset disclosure. Borrow gated by all checks and contract; repay; active debt persists after passport replacement; fresh verification required to re-borrow.

**Admin/recovery:** tiny wallet-gated passport lookup/status, revoke reason, allow-reissue toggle; replacement passport supersedes revoked old one. No tickets, manual mint or claims editing.

**Security checks:** Arjun Mehta human baseline with five controlled failures: FIP signature invalid (provenance step), commitment mismatch (evidence/proof preparation), old evidence version (verification), revoked passport (verification), duplicate identity (issuance). Stop pipeline at actual stage, not all “ZK failed.” Distinguish policy FAIL from integrity REJECT.

## UI privacy / trust boundaries

- Workers may see their authenticated bank/FIP rows and GigVault classifications; **verifiers/consumers see only requested PASS/FAIL**, relevant public chain/signature checks, never exact private financial values, evidence arrays, transactions, account numbers or private witness.
- Never imply FIP itself labels gig payouts. GigVault derives recognition from authenticated metadata.
- Never say “passport expired” merely because evidence freshness fails; passport status only ACTIVE/REVOKED.
- Do not let UI create arbitrary signed verifier requests after approval or silently alter thresholds.
- Privacy notice before worker approval, showing exact criteria, requesting verifier and expiry. Visible worker approval required for each changed policy.
- Show status `not yet available` / `failed` when backend cryptography isn't wired; no fabricated “proof verified” UI and no hardcoded pretend explorer transactions.
- Technical context explicitly identifies simulated Mock FIP, identity fallback, Polygon Amoy, mock/test asset. Normal product headlines avoid repeated “mock/demo.”

## Allowed scaffolding and interface restrictions

- You may stub UI rendering with clearly labeled local fixtures while APIs are in development. Keep adapters separate so real backend swaps in without changing locked screens.
- Do **not** invent final API routes/response types or contract public signals. Agree on interface manifests with backend owners first.
- Don't alter Circom, Solidity, payout-source directory, FIP signatures or canonical evidence codec.
- Avoid arbitrary additional roles, tokens, worker scores, income upper bounds, gap criteria, mandatory proof JSON export.

## Definition of done

1. Every approved screen is accessible (route names are implementation choice).
2. Worker/private/verifier visibility separation tested, including deep link and QR entry.
3. Every signed-policy request review displays exact thresholds/window/expiry; changed criteria require a new approval.
4. UI correctly displays per-condition PASS/FAIL and differentiates unsupported/incomplete/invalid states.
5. Welfare Claim and Microcredit Borrow remain distinct, disabled on policy failures; contract rejects bypass.
6. Recovery and identity-linked claim/debt statuses reconcile correctly after replacement.
7. Arjun's five scenarios fail at the correct pipeline stage.
8. Real successful verification/chain results appear only when real backend/chain tests pass.

## First instruction to coding AI

“Read the listed authoritative GigVault references and implement **only frontend-owned surfaces**. Present a page/state map and exact backend integration requirements before coding. Build with adapter interfaces using placeholder fixtures only where clearly labeled, and do not invent cryptographic validity, eligibility criteria or backend contracts.”
