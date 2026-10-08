# GigVault — Decision Register

**Purpose:** Durable, team-readable reference of decisions explicitly approved during GigVault planning; protect against partial chat history, mistaken "TBD" labels, and AI coding agents redesigning the product.  
**Updated:** 8 October 2026.  
**Status:** Register of approved decisions and genuine open issues; **not a report of implemented code**. Synchronized with the three refreshed team references.

## How to use this register

- **LOCKED:** Agreed product or engineering choice. Implement as specified; don't quietly replace it.
- **FUTURE / EXCLUDED:** Explicitly deferred or not part of the hackathon MVP.
- **OPEN / PENDING:** Not yet finalized. A draft recommendation is not approval.
- **GUIDANCE:** Team execution advice, not a product requirement.
- **Traceability:** IDs are topic references for team documents, **not** manufactured timestamps, verbatim approval quotes, or links to inaccessible past messages. The approved decisions are synchronized into the three updated team references in this pack; an older source copy is superseded, not automatically edited.
- **Conflict precedence:** Explicitly approved later decisions supersede older generated plans. Any conflict with a source draft should be reviewed, not silently merged.
- **Changes require approval:** Before changing a LOCKED behavior, threshold, trust boundary, privacy guarantee or persona, ask the user. No file edits should be mistaken for new authorization.

**Canonical companion documents:** `GIGVAULT_LOCKED_IMPLEMENTATION_PLAN.md` (full build), `GIGVAULT_FRONTEND_REQUIREMENTS_LOCKED.md` (UX boundary), `GIGVAULT_PRESENTER_QA_REFERENCE.md` (pitch/Q&A). The separate `docs/review/SHARED_EVIDENCE_POSEIDON_SPEC_REVIEW.md` contains **unapproved exact encoding proposals** and is NOT itself a locked interface.

## A. Mission and system boundaries

| ID | Status | Decision |
|---|---|---|
| GV-001 | LOCKED | GigVault is a worker-held, portable, privacy-preserving, independently verifiable work passport derived from authenticated gig-payment histories. |
| GV-002 | LOCKED | **Prove facts, do not judge the worker**: no subjective credit/reliability/worker-quality score or universal eligibility verdict. |
| GV-003 | LOCKED | Worker initiates passport creation, refresh and verification approval; worker **cannot self-certify** financial evidence. |
| GV-004 | LOCKED | Distinct logical trust boundaries: worker; Mock FIP/evidence provider; GigVault attestation/proof layer; Polygon passport; verifier; downstream consumers. Modules may share a repo, but trust responsibilities must remain separate. |
| GV-005 | LOCKED | **₹0 additional monetary cost**: open-source/local, existing subscriptions, testnets, faucets/free tiers; no essential paid infrastructure. |
| GV-006 | FUTURE / EXCLUDED | No native GigVault coin/tokenomics, DAO, verifier-payment flow, fees/fee split, GigVault credit score, production-grade support/admin organization or Aave-style production DeFi complexity in MVP. |

## B. Mock FIP, identity, evidence trust

| ID | Status | Decision |
|---|---|---|
| GV-010 | LOCKED | One shared, separately scoped Mock Bank/FIP DB/API provides synthetic transaction histories and consent records for all seven personas. Never claim official AA/FIP protocol compliance or real transactions. |
| GV-011 | LOCKED | Mock FIP signs authenticated consent-bound payloads containing financial transaction provenance; `consentId` is used for attestation's server-to-server fetch. Worker-uploaded editable JSON is not authoritative evidence. |
| GV-012 | LOCKED | Signature verification and valid consent **precede** evidence classification/attestation. Changed signed data must fail validation. |
| GV-013 | LOCKED | FIP proves transaction provenance, not whether a transaction is gig income; it must not supply `isGigIncome`, `payerCategory=GIG_PLATFORM`, worker scores, work tenure or analogous made-up fields. |
| GV-014 | LOCKED | GigVault counts authenticated CREDITs from recognized originators using conservative, curated identifiers (remitter/account/VPA/processor/rail/reference); **narration alone is insufficient**. Unknown or personal/self/unrelated credits are excluded; debits aren't gig income. |
| GV-015 | LOCKED | Payout-source directory is append-only off-chain versioned mappings with `introducedInVersion` and optional `deactivatedInVersion`. Old versions can be reconstructed; no duplicated full directory snapshots. |
| GV-016 | LOCKED | Unknown authenticated source may count on a later fresh evidence refresh if registry recognition and historical authenticated data become available; no large source onboarding/review workflow in MVP. |
| GV-017 | LOCKED | Financial amounts use **integer paise**, not floating point. Synthetic source rows should look like realistic transaction rows with varied timestamps, non-round amounts, rails/references, credits, debits and unrelated transfers. |
| GV-018 | LOCKED | Preferred identity method Anon Aadhaar test/demo if reliable; clearly identified mock identity provider fallback. A stable GigVault app-specific nullifier/hash supports one ACTIVE passport per person and recovery; wallet ≠ identity. No raw Aadhaar details on-chain. |
| GV-019 | LOCKED | Mock FIP owns pre-established trusted **synthetic account-owner bindings** (not worker-editable). Signed FIP evidence includes the authenticated binding; attestation checks it against the verified worker's identity binding before mint **and refresh**, rejecting mismatches. This simulates bank KYC/ownership, not a real bank-side cryptographic bridge. |
| GV-020 | FUTURE / EXCLUDED | Actual regulated AA/bank linking would require appropriate authorization/trusted bank-side identity-linking process; not implemented by Anon Aadhaar alone. |

## C. Deterministic snapshot and persistence

| ID | Status | Decision |
|---|---|---|
| GV-030 | LOCKED | Private EvidenceSnapshot fields (in approved logical order): `passportId`, `holderBinding`, `evidenceProviderId`, `evidenceDataHash`, `verifiedHistoryStartDate`, `evidenceUpdatedAt`, `monthlyGigIncomeTotals[36]`, `weeklyActivity[156]`, `monthlyActivity[36]`, `sourceDirectoryVersion`, `evidenceCommitment` (hash output). |
| GV-031 | LOCKED | `evidenceDataHash` represents normalized **authenticated source data** after signature validation; it excludes changing consent ID, signed envelope signature and fetch/generated timestamp. Do not hash the whole consent-specific envelope. |
| GV-032 | LOCKED | No persistent EvidenceSnapshot in browser or GigVault DB; no GigVault raw-FIP-response archive. For proof generation, re-fetch from Mock FIP under consent, regenerate snapshot deterministically, compare against current on-chain commitment and discard plaintext. |
| GV-033 | LOCKED | Replay fixed to that evidence version's `evidenceUpdatedAt` cutoff and recorded historical source-directory version, normalized sorted authenticated transactions (timestamp + txnId) and identical rules. Changes belong in a new refresh. |
| GV-034 | LOCKED | Issuance and refresh blockchain events record the `sourceDirectoryVersion` alongside evidence lifecycle data; historical directory mappings stay in the append-only registry. Mock FIP keeps original transactions. |
| GV-035 | LOCKED | The above solves version recovery and historical data availability **for the hackathon**; production access to real historical FIP records is a future availability consideration, not a new unresolved MVP deficiency. Event retrieval/gas/public version metadata are minor implications. |
| GV-036 | LOCKED | Detailed evidence arrays: 36 fully completed **UTC calendar months** for monthly income and monthly activity, and 156 fully completed **ISO Monday–Sunday weeks** for weekly activity. Partial current periods excluded. |
| GV-037 | LOCKED | Oldest→newest bucket order; empty completed period = 0; binary activity 1 iff at least one recognized gig payout in that completed bucket. Income averages include zero-income months. |
| GV-038 | LOCKED | Verified-history start date is conceptually distinct from activity buckets; evidence freshness uses public `evidenceUpdatedAt`, independent of last completed month/week. Verifiers select custom supported windows. |
| GV-039 | LOCKED | Canonical numeric categories: money as nonnegative integer paise; dates as integer days since Unix epoch; timestamps Unix seconds; activity flags 0/1; cryptographic identifiers as fixed-width Circom-compatible field elements. |

## D. Poseidon commitment and shared implementation

| ID | Status | Decision |
|---|---|---|
| GV-040 | LOCKED | Use Poseidon for canonical ZK-friendly EvidenceSnapshot commitment; FIP signature validation is separate. `evidenceCommitment` is **never** included in its own hash input. |
| GV-041 | LOCKED | Hierarchical design: separate array hashes for 36 monthly income values, 156 weekly flags, and 36 monthly flags, combined with seven other snapshot scalar metadata fields into final commitment. |
| GV-042 | LOCKED | Distinct domain-separation tags **inside hash inputs** for branches/roles; hashing leaves/internal/root must not accidentally conflate purposes. |
| GV-043 | LOCKED | Fixed **4-ary Poseidon trees** (four children per node + domain tag). Incomplete groups deterministically **zero-pad to four children**. |
| GV-044 | LOCKED | Array tree stage counts: 36→9→3→1, 156→39→10→3→1, 36→9→3→1. TypeScript/Circom use identical field order/encodings and shared positive/negative tests. |
| GV-045 | OPEN / PENDING | Exact integer tag constants, input order of final metadata root, numerical representation of holder/provider identifiers, and digest-to-field method. **A coherent proposal exists in `docs/review/SHARED_EVIDENCE_POSEIDON_SPEC_REVIEW.md`; NOT yet approved.** |
| GV-046 | OPEN / PENDING | Exact stable byte serialization/normalization for `evidenceDataHash`; secure paise range bound/comparator; exact calendar-month history computation; actual validated TypeScript/Circom golden output vectors, dependency versions. |

## E. Passport contract / attester / recovery

| ID | Status | Decision |
|---|---|---|
| GV-050 | LOCKED | `GigPassport.sol` is a non-transferable soulbound passport on Polygon **Amoy** with current evidence commitment/version/timestamp, holder binding, app-scoped identity hash, schema/provider ref and lifecycle events. No raw finance/criteria/results on-chain. |
| GV-051 | LOCKED | Only passport states in MVP: **ACTIVE** and terminal **REVOKED**. Stale/failed verification never revokes. `SUSPENDED` is out of scope. |
| GV-052 | LOCKED | `ATTESTER_ROLE` only mints after validated identity/FIP and refreshes evidence. `ADMIN_ROLE` separately handles exceptional revoke and authorizes reissue. Separate demo role wallets; no DAO. |
| GV-053 | LOCKED | Refresh reuses same ACTIVE passport, ATTESTER-only; contract increments version itself; requires changed commitment and nondecreasing update timestamp; emits event; historical commitments in events, current one in state. |
| GV-054 | LOCKED | Revocation clears `activePassportByIdentity`; old passport remains REVOKED forever. ADMIN separately sets `reissueAllowed`; worker re-verifies identity and supplies fresh FIP; replacement mints only if no active passport and authorization exists; authorization consumed on mint. Track latest passport and optionally supersedes. |
| GV-055 | LOCKED | Contract controls **sequential passport ID allocation**. ATTESTER reads next available ID, commits snapshot with that expected ID, passes expected ID to mint. Contract atomically rejects wrong/colliding ID, mints expected ID and increments counter. On race, ATTESTER recomputes snapshot with next ID and retries; no extra reservation tx. |

## F. Verification protocol and consumers

| ID | Status | Decision |
|---|---|---|
| GV-060 | LOCKED | Generic `VerificationPolicy`: `requestId`, EVM-wallet `verifierId`, optional `minAverageIncome` + `incomeWindowMonths`, optional `continuityUnit` WEEK/MONTH + `continuityWindow` + `minActivePeriods`, optional `minHistoryMonths`, optional `maxEvidenceAgeDays`, `expiresAt`, `verifierSignature`. No `purpose`, verifier category, worker role, score, `maxAverageIncome` or `maxInactivePeriods`. |
| GV-061 | LOCKED | Verifier signs a canonical immutable policy hash off-chain; worker sees exact criteria/expiry/privacy before approving/declining. Changing any criterion requires **new requestId/new signed policy/new worker approval**. |
| GV-062 | LOCKED | Proof bound to passportId, current evidenceVersion/commitment, requestId, verifierId, policyHash, deployment domain; signature checked outside circuit. |
| GV-063 | LOCKED | ZK circuit proves private income/history/activity comparisons and commitment binding; reveals per-condition `incomePass`, `historyPass`, `activityPass` to worker and verifier, not exact amounts/history/activity counts. Disabled criteria are nonblocking/omitted in UI. |
| GV-064 | LOCKED | Passport ACTIVE/version/commitment, evidence freshness, request expiry, verifier signature, domain and consumer state checked publicly/outside ZK. `GigVaultVerifier.sol` is minimal Groth16 math verifier, no product/benefit/loan logic. |
| GV-065 | LOCKED | No global consumed-proof ledger in GigVault. Consumers enforce one-time/state-changing actions; mathematically verifying an already-generated proof again is distinct from executing an action twice. |
| GV-066 | LOCKED | WelfareVault is separate consumer; policy: ACTIVE passport, verified history ≥6 months, active months ≥4 of last 6, evidence age ≤90 days, one support benefit per identity. No income criterion. Verify then separate Claim; contract independently rejects failed checks and duplicate claims. |
| GV-067 | LOCKED | WelfareVault one-time claim tracked by shared stable public `identityNullifierHash` (`claimedByIdentity`), so reissue/new passport cannot claim again. Accept cross-service on-chain pseudonymous linkability in MVP. |
| GV-068 | LOCKED | Microcredit separate consumer on Polygon Amoy: ACTIVE passport, average monthly recognized gig income last 6 completed months ≥₹20,000, history ≥12 months, active months ≥9 of last 12, evidence age ≤30 days, no active loan. Borrow 100 MockUSDC test asset. These are **Microcredit's policy**, not global GigVault policy. |
| GV-069 | LOCKED | Microcredit separate Verify/Borrow steps; contract independently checks passport/current evidence/proof/policy result/request unused/no active loan. LoanActive true blocks another; repay 100 MockUSDC → loan inactive; subsequent borrow requires fresh signed verification request. No interest, collateral, liquidation, score. |
| GV-070 | LOCKED | Microcredit active debt/principal tracked by stable `identityNullifierHash`, not only old passportId. After authorized recovery, outstanding debt survives, second borrow blocked, repayment possible with replacement passport without fresh income ZK proof. |
| GV-071 | LOCKED | Public identity hash across contracts makes claims/loans linkable. Production could use consumer-specific nullifiers with appropriate identity/recovery proofs, but this is **future**, not implemented or automatically solved by using different hashes. |
| GV-072 | OPEN / PENDING | Exact on-chain mechanism requiring consumer's **specific signed policy**, not an arbitrary easier PASS policy; proof-generation enforcement of worker approval (especially if backend-run); canonical policy encoding and public-signal manifest. Do not bypass approval or replay limits. |

## G. Frontend and presentation

| ID | Status | Decision |
|---|---|---|
| GV-080 | LOCKED | Frontend surfaces: Worker, generic Verifier, external-feeling WelfareVault, external-feeling Microcredit, small ADMIN/recovery, compact security checks. |
| GV-081 | LOCKED | Worker journey: wallet/unique identity → FIP consent → visibly realistic transaction table with **Bank/FIP data | GigVault analysis** → evidence summary → Create Passport → passport dashboard with ID/status/version/chain links/QR/refresh/transactions/history → signed verifier request review → ZK proof and per-condition results. |
| GV-082 | LOCKED | Verifier connects EVM signing wallet, builds optional custom criteria, signs immutable policy, delivers embedded Verify with GigVault or QR/deep link; worker explicitly approves; verifier shows concise live request/passport/evidence/ZK/conditions/consumer check pipeline and per-condition results. |
| GV-083 | LOCKED | Two QR experiences: **Passport QR** identifies public passport and may lead verifier to start a signed request; **Verifier Request QR** carries/resolves signed immutable policy for worker review. Neither can bypass worker approval or silently reveal private income/work facts. |
| GV-084 | LOCKED | Security UX accurately shows actual rejection stage: tampered FIP at source authentication; modified snapshot at commitment validation/proof preparation; old proof and REVOKED passport at verification; duplicate identity at issuance. Reuse live-check visualization but do not imply nonexistent successful stages. |
| GV-085 | LOCKED | Arjun Mehta security persona: FIP signature invalid; commitment mismatch; evidence version outdated; passport REVOKED; active passport exists for identity. Distinguish normal policy FAIL from security/integrity rejection. |
| GV-086 | LOCKED | Worker history is local convenience (max 20 records OR 90 days, whichever smaller) with criteria/results, no raw transactions/private snapshot/proof object. No global verifier-history DB. |
| GV-087 | LOCKED | Normal product copy avoids constantly saying "demo/mock/test"; technical drawers/environment/docs honestly disclose Polygon Amoy, Mock FIP/identity fallback, MockUSDC/test asset. |
| GV-088 | OPEN / PENDING | Final 3–5-minute judge-demo sequence, which personas live/backup and exact stage order; do not portray as approved. |

## H. Persona fixtures — LOCKED

| ID | Persona | Confirmed intent / relevant data |
|---|---|---|
| GV-090 | Ramesh Kumar — Swiggy | Hero positive path. ~Jan 2024–Oct 2026. Recognized amounts ~₹3K–8K per payout, roughly ₹24K–35K/month, 12/12 active months, ~44–48 active weeks/52; unrelated rows. Passes welfare and Microcredit. Do not revoke/tamper him. |
| GV-091 | Suresh Gowda — Uber + Ola | Concurrent multi-platform aggregation, 18–24 months, ~10–11/12 active months, comfortably meets loan-income target. |
| GV-092 | Imran Pasha — cab | Valid ACTIVE/evidence; fresh, ~18 months, income above ₹20K average, only 8 active months/12; loan activity condition fails without fraud. |
| GV-093 | Manjunath S — Urban Company | ~4 months legitimate recent work; fails ≥6-month-history policy, not proof integrity. |
| GV-094 | Venkatesh R — Porter | Uneven/clustered authentic payout activity, adequate history/activity; no "irregular worker" type label. |
| GV-095 | Farhan Ali — Swiggy → Zomato | Earlier Swiggy, overlap, later Zomato, same passport; shows longitudinal portability through platform switch. |
| GV-096 | Arjun Mehta — delivery partner | Legitimate baseline with separately triggered security/tamper variants, not inherently fraudulent. |

## I. Open implementation questions and execution rules

## J. Documentation sync and immutable guardrails

- The four *synchronized* documents in this distribution are a consistent snapshot of decisions approved through the four-way Poseidon tree, zero padding, domain separation, mock FIP account-owner binding, sequential contract-ID mint, recovery-safe welfare/lending, dual QR routing, stage-accurate tamper UX, and directory events.
- The `docs/review/SHARED_EVIDENCE_POSEIDON_SPEC_REVIEW.md` is a **proposal/reference for the next approval**, not permission to hardcode its domain constants or digest mapping as final.
- Neither AI-generated drafts nor this register establish that contracts/circuits have been deployed, audited, or integration tests run. Presenter must check implementation status before making live claims.
- Three project handoff references plus this register should be versioned together. Previous original files remain intact; distribute **this dated synchronized pack** to every teammate and coding agent.



The following are **not newly approved product features** and should not be casually converted into locked requirements by an AI agent:

1. **Review proposal:** `docs/review/SHARED_EVIDENCE_POSEIDON_SPEC_REVIEW.md` contains a proposed complete numeric/hash input ordering and domain constants, but values are not yet approved. Shared golden Poseidon values require cross-checked implementation.
2. Exact normalization into `evidenceDataHash`; byte serialization and digest-to-field; paise range bound and calendar-history arithmetic.
3. Canonical signed VerificationPolicy/public-signal encoding, and backend worker-approval authorization binding if it generates witnesses/proofs.
4. How on-chain consumers enforce their **particular exact policy** and verifier identity, not just free-floating result bits.
5. Actual final library versions/build scripts, files/repo/API endpoints, deployment setup and UX visual choices, provided they preserve the locked architecture.
6. Final judge-demo ordering and selection of live/backup segments.

**Execution allocation (GUIDANCE, not architecture):** Four people: one pitch/Q&A, one full frontend, two backend. Suggested backend boundary: Backend A handles Mock FIP/consent/identity/payout registry/deterministic evidence; Backend B handles Poseidon/Circom/Solidity/chain consumers; both must share one committed interface. Team uses ChatGPT Plus/Codex/Google Antigravity and free tooling, tests, faucets and local fallbacks.

**Synchronization note:** This packaged revision already contains the refreshed implementation/frontend/presenter references described above. Further changes to those references require an explicit edit request/approval; this note does not authorize new product decisions or changes to historical originals.
