# Plans, implementation and demo scope

The historical locked documents in `docs/reference/` are preserved unchanged. This index records implementation status; it does not rewrite their approvals or silently freeze REVIEW constants.

| Area | Locked intent | Current implementation / remaining work |
|---|---|---|
| Income provenance | Signed FIP + valid consent + worker/account owner match; curated authenticated payout sources | Backend A code and positive/negative tests exist. Real bank adapters are not connected. Narration alone is insufficient. |
| Canonical history | 36 completed UTC months, 156 completed ISO weeks, oldest first, integer paise and binary activity | Deterministic evidence, circuits and local integration implemented. No editable browser financial arrays. |
| Commitment | Four-child domain-separated Poseidon trees with zero padding and consistent metadata | Real TS/Circom parity, corrected Fr profile and schema 2. Remaining REVIEW tags/encodings are provisional; historical v0.1 preserved. |
| Passport | Worker-owned, nontransferable, sequential IDs, ACTIVE/REVOKED, evidence refresh and authorized recovery | Solidity lifecycle and identity-bound recovery regressions implemented. Normal website exposes a smaller subset. |
| Verification | Exact immutable verifier policy; explicit worker approval; condition PASS/FAIL | Real EIP-712 authorization, private reconstruction and 29-signal Groth16/Solidity checks implemented. |
| Welfare | Separate Verify/Claim; lifetime claim bound to identity across replacement | Local claim/event consumer implemented. No public-network POL disbursement is claimed. |
| Lending | Separate Verify/Borrow; exact policy; 100 test tokens; debt survives replacement; exact repayment | Real local MockUSDC transfers and repayment implemented. Fresh approval/proof required after request consumption. |
| Preferred identity | Genuine Aadhaar verification under the locked trust rules, with honest fallback | Backend A has trust-mode adapters and rejection tests. Website uses sample phone/Aadhaar and Mock IDP; production identity provider is not connected. |
| Onboarding | Worker initiates, approves consent, financial data comes from FIP | Local website gates connection on explicit consent, then uses actual A synthetic services. Phone OTP and Aadhaar confirmation are UI sample steps, not independent security credentials. |
| Worker UX | Worker/verifier/consumer/admin/security journeys, EN/Kannada, no private values to verifiers | Worker and public passport/consumer flow connected. Full admin/recovery, all scenarios and physical-wallet browser coverage remain incomplete. |
| Deployment | Polygon Amoy/test assets, transparent fallback, zero additional spend | Local EVM demonstrated. Amoy/public deployment requires approved ceremony/protocol setup; no public deployment claimed. |
| Payer tampering | Count genuine curated originators, reject family/friend transfers and fabricated provenance | Signed source/owner validation and directory classification implemented. This does not prove a real-world originator directory is exhaustive or eliminate upstream bank fraud. |

## Explicit session approvals after the original reference snapshot

- Correct BN254 scalar modulus: `21888242871839275222246405745257275088548364400416034343698204186575808495617`.
- Provisional commitment profile `gv-poseidon-hash-only-0.2.0`; v0.2 passport schemaVersion **2**.
- Illustrative frontend Gig Score and four UI categories were requested by the user. They do not change backend eligibility. This later UI request is recorded separately from the original no-score reference rather than editing history.
- Local sample phone OTP and Aadhaar confirmation were requested for the demonstration. Genuine identity trust rules remain unchanged.
- For this repository merge, the user explicitly approved retaining A's legacy helpers and adding B's constant-name aliases. Active modulus, mappings, tags and order remain unchanged. See `docs/review/REPOSITORY_SHARED_MERGE.md`.

## Pending shared decisions

Exact domain tags/root order, digest and holder/provider encodings, monetary bound/comparator conventions, calendar-history arithmetic, wire envelopes and deployment ceremony retain their existing REVIEW status where not separately approved. A successful local proof is test evidence, not approval of the whole production protocol.

## Navigation

- Product/security decisions: `docs/reference/GIGVAULT_DECISION_REGISTER.md`.
- Complete intended implementation: `docs/reference/GIGVAULT_LOCKED_IMPLEMENTATION_PLAN.md`.
- Full frontend scope: `docs/reference/GIGVAULT_FRONTEND_REQUIREMENTS_LOCKED.md`.
- Presenter and pitch references: remaining files in `docs/reference/`.
- Protocol details and unresolved choices: `docs/review/SHARED_EVIDENCE_POSEIDON_SPEC_REVIEW.md`, `docs/review/VERIFICATION_AUTH_AND_CONSUMERS_REVIEW.md`, `docs/review/CRYPTO_AND_TEST_GATES.md`.
- Team boundaries: `AGENTS.md`, `docs/INTEGRATION_RULES.md`, `agent-instructions/`.
