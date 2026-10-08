# GigVault — mandatory shared instructions for coding agents

**Scope:** Actual shared GigVault development repository (NOT the read-only `.codex/.chatgpt-projects/...` synchronization mirror).

## Reading order before edits
1. `docs/reference/GIGVAULT_DECISION_REGISTER.md`
2. `docs/reference/GIGVAULT_LOCKED_IMPLEMENTATION_PLAN.md`
3. `docs/reference/GIGVAULT_FRONTEND_REQUIREMENTS_LOCKED.md` (for UI or consumer surfaces)
4. `docs/review/SHARED_EVIDENCE_POSEIDON_SPEC_REVIEW.md`
5. `docs/review/VERIFICATION_AUTH_AND_CONSUMERS_REVIEW.md`
6. `docs/INTEGRATION_RULES.md` and your assigned `agent-instructions/*_AGENT.md`

For every significant work session, report: implemented files, actual tests/results, unresolved blockers, decisions needed. Never claim unrun tests pass.

## Authority hierarchy
- **LOCKED** decisions in Decision Register and synced reference specs are authoritative; no silent redesigns.
- **PROPOSED / REVIEW** sections are *not* approved protocol commitments. Stop at a compatibility boundary and request a shared decision if they affect cross-team wire formats, contract validity, signed policy or ZK security.
- Routine internal implementation details may be selected within your ownership provided they preserve locked behavior; label choices in code/documentation as implementation details, not new product rules.
- Conflicting references? Escalate. Never silently prefer an older architecture draft.

## Non-negotiable requirements
- GigVault is neutral proof infrastructure: **no worker score**, no verifier-wide fixed ₹20,000 income rule, no tokenomics/DAO.
- Mock FIP signature + valid consent + bank-owner/worker identity matching are prerequisites for evidence attestation.
- Only curated authenticated gig payout originators count; narration alone never counts.
- Never store raw FIP data or plaintext EvidenceSnapshot persistently within GigVault; retained source transactions belong to Mock FIP.
- The worker owns the passport; `ATTESTER_ROLE` mints/refreshes; `ADMIN_ROLE` exceptionally revokes/authorizes recovery.
- Use **ACTIVE/REVOKED**, one ACTIVE passport per identity, contract-controlled sequential IDs with atomic expected-ID mint checks.
- Canonical snapshot is 36 completed UTC months of income and month activity, 156 completed ISO weeks, oldest to newest; paise integer; flags 0/1.
- Commitment is Poseidon hierarchical four-child trees with domain separation and zero padding; don't invent or treat review constants/golden vectors as locked.
- Worker approves a particular signed immutable verifier policy. Changed criteria = new request and new worker approval. A mathematically valid Groth16 proof does not by itself authorize a consumer action.
- Expose per-condition PASS/FAIL to worker and verifier; no exact private amounts/history/raw transactions to verifiers.
- Separate Verify/Claim and Verify/Borrow. Welfare one-time claims and lending obligations keyed by the stable identity binding across passport replacement.
- Preserve Polygon Amoy/test asset/mock FIP transparency in technical UI/judge docs; user-facing product names should not be cluttered with “demo.”
- Everything must be runnable without additional monetary spend. Use local/free tooling and testnet; fallback must be honestly labeled.
- No real worker/Aadhaar/payment account secrets, real credentials, or API tokens in source, commits, logs, prompts, or screenshots.

## Security/test gate
- All state-changing consumer contracts independently verify correct passport, current version/commitment, appropriate proof and **their exact intended policy**, valid worker approval and no replay/business-state violation. A disabled UI button is never a security check.
- Range-check inputs, prevent field wraparound, constrain PASS/FAIL as actual comparisons in circuit. Never fake ZK results or substitute hardcoded booleans.
- Required negative tests: tampered FIP signature; altered snapshot/commitment; revoked passport; stale evidence; duplicate ACTIVE identity; modified policy; unauthorized worker; mismatched consumer policy; replay; second welfare claim after reissue; loan persistence after reissue.

## Collaboration boundaries
- Frontend agent owns UI; Evidence agent owns Mock FIP and canonical financial normalization; Blockchain/ZK agent owns contracts/circuit/proof verifier. Shared schema and commitment libraries change **only with both backend owners coordinating**.
- Separate branches; no force-push to main; avoid editing teammate-owned areas. Integration PRs must state interface/version changes and test evidence.
- Do not edit `docs/reference` unless user explicitly authorizes the documentation update. Log proposed edits separately.
