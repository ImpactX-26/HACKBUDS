# GigVault — Complete Locked Implementation Plan

**Audience:** entire engineering team (attestation/FIP, blockchain, ZK, frontend, consumer applications, integration and QA)  
**Status:** approved product/architecture decisions consolidated into an execution handoff; this is a **build specification, not a record that features are already implemented**.  
**Revision:** 8 October 2026, synchronized with subsequent approved decisions (see Decision Register `GV-001`–`GV-096`); supersedes previous team-reference revision. Existing architectural scope is preserved.  
**Budget constraint:** **₹0 additional monetary cost**. Use open-source/local tooling, free testnets/faucets/free tiers, and already-included tools. Core functionality must not depend on paid services.

## 0. Reading rules and decision provenance

- **LOCKED** means explicitly settled in our GigVault planning. Implement it; do not relitigate or silently simplify it.
- **IMPLEMENTATION GUIDANCE** means a suggested engineering sequence, organizational boundary, or test approach to implement locked behavior. It is **not** approval to introduce a new product requirement.
- **PENDING APPROVAL** means a real unresolved detail. Ask rather than quietly choosing if it affects user experience, protocol semantics, privacy, security, policy, or architecture.
- **FUTURE / OUT OF MVP** means explicitly excluded/deferred, not something to build opportunistically.
- **Not implemented yet** and **not approved yet** are different. Nothing in this file claims a particular workstream is complete.
- **Source priority:** decisions explicitly locked in the GigVault conversation > prior proposal/master-plan draft > older generated frontend implementation draft. Earlier drafts are background, **not permission** to restore superseded personas, scores, thresholds or flows.
- The traceability IDs below identify **topics of confirmed decisions**, not invented timestamps, approval screenshots or a formal meeting log.

**Decision tracking:** The local `GV-01`–`GV-17` topic-map labels below are navigation aids. The authoritative decision-level IDs are `GV-001`–`GV-096` in `GIGVAULT_DECISION_REGISTER.md`. The separately supplied Poseidon interface draft is **REVIEW / NOT YET LOCKED** for exact tags, final ordering and golden vectors.

### Decision map (locate implementation requirements by agreement)

| ID | Confirmed decision cluster | Main specification sections |
|---|---|---|
| GV-01 | Neutral, worker-held portable work passport; no scoring | 1, 2 |
| GV-02 | FIP supplies signed financial provenance; GigVault classifies gig payouts | 2–5 |
| GV-03 | Append-only versioned payout-source registry | 4, 6 |
| GV-04 | Deterministic EvidenceSnapshot, `evidenceDataHash`, no persisted snapshot | 6–8 |
| GV-05 | App-scoped identity nullifier; one ACTIVE passport/identity | 9, 10 |
| GV-06 | SBT on Polygon Amoy; ACTIVE/REVOKED only; refresh history | 10, 11 |
| GV-07 | Separate ATTESTER and ADMIN roles; terminal revocation/reissue | 10–12 |
| GV-08 | Signed, immutable, composable verifier policy | 13, 14 |
| GV-09 | Circom/Groth16 private facts + public per-condition results | 15–17 |
| GV-10 | Proof request/passport/verifier/evidence/domain binding | 16, 18 |
| GV-11 | No global proof-consumed registry; consumers enforce valuable actions | 18–20 |
| GV-12 | WelfareVault policy and gated Verify → Claim | 19 |
| GV-13 | Microcredit policy and gated Verify → Borrow → Repay → new request | 20 |
| GV-14 | Worker/verifier/admin/consumer frontend flows, realistic transaction UI | 21–23 |
| GV-15 | Seven defined personas, including Arjun security cases | 24, 25 |
| GV-16 | No repeated “demo/mock” in product UI; technical honesty preserved | 21, 26 |
| GV-17 | Zero-cost implementation and staged fallbacks | 27 |

## 1. LOCKED — Product contract

**One-line description:** GigVault is a **worker-owned, portable, privacy-preserving, independently verifiable work passport**, derived from authenticated work-payment evidence, that can be used across platforms and services without revealing raw financial data.

> **GigVault proves facts; it does not judge the worker.**

The system must support portability, worker-initiated sharing, selective disclosure, and independent verification. It must **not** create a GigVault credit score, reliability score, worker-quality label or universal eligibility determination. Income, history, activity and freshness are **factual claims**; each downstream service chooses its own acceptance policy. A policy failure never implies fraud or passport revocation.

## 2. LOCKED — Trust boundaries and architectural flow

```text
WORKER / HOLDER
  | connects holder wallet; verifies identity; grants FIP consent
  | initiates issuance/refresh; reviews and approves exact verifier requests
  v
MOCK BANK/FIP  [separate evidence-provider trust boundary]
  | owns transaction histories and consents; signs financial provenance
  | server-to-server signed data fetch by consentId
  v
GIGVAULT ATTESTATION / PROOF LAYER
  | validate FIP signature + consent
  | match authenticated payer/remitter IDs with payout-source directory
  | normalize/aggregate transactions; derive deterministic private snapshot
  | compute commitment; ATTESTER mint/refresh; later regenerate for ZK proof
  v
POLYGON AMOY: GigPassport.sol
  | SBT holder/identity binding, ACTIVE/REVOKED, CURRENT evidence version/commitment
  | refresh/revocation lifecycle events; no raw financial data
  v
SIGNED VERIFIER POLICY + WORKER APPROVAL
  | immutable requested facts; exact verifier and request binding
  v
CIRCOM/GROTH16 ZK PROOF
  | private income/history/activity witness -> per-condition PASS/FAIL
  v
VERIFIER OR CONSUMER
  | independent signature/chain/ZK/public checks; no bank rows
  | WelfareVault / Microcredit enforce their own action/claim/loan state
```

**Worker:** passport holder/controller, not financial-evidence certifier. **Mock FIP:** signer of financial evidence, not gig-income classifier. **GigVault attester:** certifies a commitment derived from authenticated provenance, not a platform employer. **Blockchain:** credential/evidence lifecycle anchor. **Verifier:** policy author identified by EVM signing address. **Consumer:** independently decides and executes its business action.

These can be modules in one repository, but the trust boundary between evidence provider and attestation layer must be visible in code and in the explanation. Do not allow user-edited/uploaded JSON to masquerade as the signed server-to-server FIP record.

**LOCKED account ownership bridge:** Anon Aadhaar (or the declared mock-identity fallback) proves unique worker identity; it does **not** inherently prove bank-account ownership. The separately controlled Mock FIP retains pre-established, trusted synthetic account-owner→identity bindings, includes the authenticated owner binding in its signed evidence response, and confirms owner consent. The GigVault Attestation Service verifies signature, consent **and equality with the verified worker identity binding** before both issuance and refresh. Mismatch rejects. This simulates bank-side KYC, not a claim of official AA/Aadhaar-bank matching.

## 3. LOCKED — Mock FIP, consent and signed financial provenance

### Mock FIP responsibilities

- Use one shared Mock FIP database/API for **all seven personas**, with plausible synthetic **individual transaction rows**; no persona-only hardcoded monthly totals substituted for source evidence.
- Owns transaction history and FIP consent record(s).
- Provides a consent ID and consented time/data scope; GigVault attestation fetches signed data **server-to-server by `consentId`**.
- Signs the financial envelope with an FIP-held signing key; attestation verifies against a trusted public key. A practical mock signing algorithm such as secp256k1 was considered acceptable, but do **not** call it official RBI AA/FIP signing protocol.
- Envelope concepts: `schemaVersion`, `fipId`, consent reference/scope, data range, `generatedAt`, account/provider reference, transaction records, `payloadHash`, signature.
- Transaction provenance concepts: transaction ID; amount in **integer paise (`amountMinor`)**; currency; direction; timestamp; payer/remitter identifiers; account/VPA/processor/ref references where present; payment rail; UTR/reference; narration.
- Must **not** supply invented bank trust assertions such as `isGigIncome`, `gigPlatform=true`, gig-work tenure, worker cadence or `payerCategory=GIG_PLATFORM`.

### Critical verification path

1. Worker grants FIP consent.
2. Attestation backend receives `consentId`, wallet/holder information, wallet signature and identity proof/verification result.
3. Attestation backend fetches FIP-signed financial data directly from provider.
4. Verify FIP signature **before** reading transactions as authenticated evidence; verify consent reference/scope.
5. A changed amount, remitter, date or any signed content must fail integrity verification.
6. Pass the verified dataset to GigVault payout-source classification.

**Failure:** No valid consent/signature means **no new attested evidence/passport refresh/proof**, not an ordinary verifier-policy failure.

## 4. LOCKED — Recognized gig-payout classification

Bank/FIP establishes **that transactions are authentic**. GigVault establishes **which authenticated credits match recognized gig payout originators**.

**Inclusion rule:** CREDIT transactions count toward gig-income metrics **only** when authenticated payer/remitter or payment-processor identifiers match the curated payout-source registry. Candidate evidence includes authenticated remitter account identity, VPA, settlement/processor reference, UTR/reference and rail metadata. The registry must not assume that human-readable narration alone is trustworthy.

**Exclusions:** friend/family credits, self-transfers, unrelated salary, refunds/unrelated credits and unknown senders do **not** count. DEBIT rows remain visible as bank transactions but are not gig income. Recurrence may add context; it is **not** the primary trust signal. Unknown means **exclude, do not guess**.

**Worker view:** Show FIP columns alongside **GigVault analysis** (`Counted · Swiggy`, `Counted · Uber`, `Excluded · Personal transfer`, `Excluded · Unrecognized payer`, `Not relevant · Debit`). That classification is GigVault's, **not a label allegedly supplied by the bank**.

## 5. LOCKED — Payout-source directory maintenance

- Off-chain curated GigVault directory, not a worker-editable payout source list.
- **Append-only historical versioning**: an identifier/mapping has `introducedInVersion` and optional `deactivatedInVersion`.
- To interpret version `v`, select records active in that version; do **not** duplicate an entire v1/v2/v3 directory snapshot for each change.
- An existing evidence version is reproducible using **its recorded `sourceDirectoryVersion`** even after current directory changes.
- An authenticated unrecognized source may count **after later recognition and a fresh evidence refresh** if historical authenticated data is available. **Do not** build a large source-onboarding/review queue or encrypted evidence archive for the MVP.
- Do not invent signing/onboarding ceremonies for synthetic source names.

## 6. LOCKED — Exact private EvidenceSnapshot semantics

```text
EvidenceSnapshot
  passportId
  holderBinding
  evidenceProviderId
  evidenceDataHash
  verifiedHistoryStartDate
  evidenceUpdatedAt
  monthlyGigIncomeTotals[36]   // integer paise totals per month
  weeklyActivity[156]         // binary activity buckets
  monthlyActivity[36]         // binary activity buckets
  sourceDirectoryVersion
  evidenceCommitment
```

**Not fields:** raw transaction list, worker cadence label, score, verifier criteria/results, worker “role,” claimed benefit or loan status.

- Both weekly and monthly activity arrays are **precomputed** from recognized authenticated payouts, not inferred from a fixed payment cadence.
- Monthly gig-income totals support average-income threshold proofs; monthly activity is binary occurrence of recognized activity: **not the same measure**.
- Detailed circuit-time rolling history uses **36 months** and **156 weeks**. Separately committed `verifiedHistoryStartDate` enables claims about longer verified history. Do not say GigVault erases or cannot represent longer tenure; do not claim arbitrary long detailed proof windows are implemented.
- Private snapshot amounts and activity vectors are **not** public blockchain fields or sent to verifier/consumer.

### LOCKED — Completed UTC periods and numeric conventions (Decision Register GV-036–GV-039)

- `monthlyGigIncomeTotals[36]` and `monthlyActivity[36]`: **36 fully completed UTC calendar months** relative to the evidence version's fixed `evidenceUpdatedAt` cutoff; omit the current partial month.
- `weeklyActivity[156]`: **156 fully completed Monday–Sunday ISO weeks** relative to the same fixed cutoff; omit the current partial ISO week.
- Arrays are **oldest → newest**; all completed missing periods are `0`; activity is exactly `1` when the bucket contains at least one authenticated recognized gig payout, otherwise `0`.
- Average monthly income over verifier-chosen `N` completed months includes months with zero recognized payouts. `verifiedHistoryStartDate` is a separate verified-tenure fact; public evidence freshness uses `evidenceUpdatedAt`, **not** the last full month/week.
- Canonical categories: **nonnegative integer paise**; dates = integer **UTC Unix epoch days**; timestamps = integer **Unix seconds**; activity flags = `0|1`; cryptographic identifiers = fixed-width Circom-compatible field elements.
- These bucket/number rules are **LOCKED**. Exact string normalization, field-element conversion, date-to-calendar-tenure arithmetic and circuit integer-range parameters are **OPEN** technical interfaces, not silently approved constants.

### LOCKED — Poseidon commitment structure (GV-040–GV-044)

- The commitment is **Poseidon-based**, **hierarchical**, and **domain-separated**; the signature validation of source FIP evidence is a separate prerequisite.
- Hash three private arrays independently: monthly income `[36]`, weekly activity `[156]`, monthly activity `[36]`.
- Each array uses a **fixed four-child (4-ary) Poseidon tree**. Each node hashes **one domain tag + four children**; pad incomplete child groups with **zero field elements** deterministically.
- Expected tree stages are `36→9→3→1`, `156→39→10→3→1`, and `36→9→3→1`, with deterministic padding at intermediate levels.
- Use distinct actual hash-input tags for evidence type and leaf/internal/root roles. The final EvidenceSnapshot commitment binds the three array roots and **seven other canonical scalar metadata fields**: passport ID, holder binding, provider ID, authenticated evidence-data hash, verified-history start date, evidence timestamp, directory version.
- **Do not hash `evidenceCommitment` into itself.** Both TypeScript and Circom must use the same canonical encodings/ordering, pinned compatible libraries and **independently verified golden test vectors**.
- **PENDING APPROVAL:** exact integer tag constants, scalar encoding, internal-level treatment, metadata/root field order, byte-serialization and real golden hashes. These appear **only as proposals** in `docs/review/SHARED_EVIDENCE_POSEIDON_SPEC_REVIEW.md`; no proposed number is approved merely by appearing in that file.

### Why `evidenceDataHash` replaces `signedEvidenceHash`

A fresh FIP consent changes consent ID, signature and fetch-generated metadata even when the underlying authenticated records have not changed. Hashing that whole envelope would break deterministic reconstruction. The attester **first verifies the actual FIP signature**, then hashes the normalized authenticated financial dataset into stable `evidenceDataHash`. **Data hash does not replace signature verification.**

## 7. LOCKED — No GigVault snapshot/transaction persistence

The hackathon GigVault implementation does **not persist** an EvidenceSnapshot in browser, cloud database, server database or encrypted vault. GigVault also does **not** retain its own raw FIP transaction-response archive. The Mock FIP remains the source retaining transaction histories.

### Issue/refresh

- Authenticated FIP data is fetched/processed transiently, canonical snapshot derived in memory, commitment minted/refreshed.
- Worker can view the transaction breakdown, but the canonical snapshot is **not** a browser-trusted source of truth.

### Generate later proof

1. Retrieve FIP-authenticated transactions again under valid consent; renew consent if required.
2. Verify FIP signature.
3. Regenerate the canonical snapshot using **the existing evidence version's rules, cutoff and directory version**.
4. Recompute commitment and match it to the **current on-chain evidence commitment** for that version.
5. Generate proof from private data.
6. Discard plaintext snapshot after use.

**Important:** An evidence refresh and a deterministic reconstruction are **different** operations. A reconstruction must not silently use a new directory version or later transactions and pretend it matches the earlier commitment.

**LOCKED event-based directory recovery (GV-034–GV-035):** Passport **issuance and evidence-refresh events** record the exact `sourceDirectoryVersion` for that evidence version, alongside relevant commitment/cutoff information. The off-chain service retrieves the matching historical event; the append-only directory reconstructs that version; the Mock FIP retains and re-serves authenticated historical transactions. This solves version recovery in our hackathon environment without storing a GigVault EvidenceSnapshot. Production dependence on continued external bank-data availability remains an explicitly disclosed future trade-off; event gas and public directory-version metadata are minor consequences, not new unsolved hackathon blockers.

## 8. LOCKED — Deterministic replay checklist

For any recorded evidence version:

1. Fix `evidenceUpdatedAt` as that version's cutoff; exclude later transactions.
2. Use normalized authenticated transactions on/before cutoff.
3. Stable sort: timestamp then transaction ID.
4. Normalize strings identically on every replay.
5. Use integer paise; no floating-point financial derivation.
6. Reconstruct exact historical `sourceDirectoryVersion`.
7. Apply the identical payer-recognition and weekly/monthly aggregation rules.
8. Hash normalized authenticated **data**, excluding consent IDs, envelope signature and fetch/generated timestamp.
9. Rebuild snapshot and its circuit-friendly commitment identically.
10. Any genuinely changed source data/rules belong in a **new refresh/evidence version**, not a counterfeit reconstruction.

**IMPLEMENTATION GUIDANCE:** Create shared deterministic fixtures/test vectors for the FIP → normalize → registry → snapshot → commitment pipeline, and use those vectors both in backend and ZK integration tests. Exact serialization/field encoding is an engineering interface to agree and freeze before coding multiple consumers; it has not been specified as a finalized wire format.

## 9. LOCKED — Identity binding

- One **ACTIVE** passport per person/identity; not “one passport ever.”
- Use an **app-scoped GigVault identity nullifier hash**. Wallet address is a holder, not the identity.
- Preferred: **Anon Aadhaar test/demo** if reliable.
- Explicit fallback: a **clearly identified mock identity provider** issuing a stable GigVault-specific nullifier for each persona.
- No Aadhaar number, identity name or other raw identity proof goes on-chain.
- Reissue to a new wallet must reverify the **same identity**, with revocation/reissue authorization checks and fresh FIP evidence.

- **LOCKED FIP owner binding (GV-019):** The signed Mock FIP response includes its trusted seeded synthetic account-owner binding. Match this binding to the verified app-specific identity before mint **or refresh**. The worker cannot enter or edit this mapping. A consent ID, bank signature or Anon Aadhaar proof **alone** does not establish the cross-system ownership match.

## 10. LOCKED — `GigPassport.sol` specification

This is a **non-transferable SBT/passport** on **Polygon Amoy**; mint, refresh and revoke are real contract actions. Passport is persistent while its evidence is refreshable.

### On-chain/current credential concepts

- `passportId`
- `holderWallet`
- `identityNullifierHash`
- `current evidenceCommitment`
- `current evidenceVersion`
- `evidenceUpdatedAt`
- `issuedAt`
- `status`: `ACTIVE` or `REVOKED`
- `schemaVersion`
- `evidenceProvider` reference/hash where needed
- mappings: `activePassportByIdentity`, `latestPassportByIdentity` and reissue authorization state
- optional `supersedes` relation/event for replacement passport

Never store: bank statements, exact earning totals, tenure/activity arrays, Aadhaar details, policy thresholds/results, verifier application histories, welfare/loan state.

### Authority

| Authority | Allowed contract action |

### LOCKED — Contract-controlled issuance ID and one-transaction mint (GV-055)

1. ATTESTER first reads **the next contract-controlled sequential passport ID**.
2. It constructs the complete canonical snapshot with that **expected** `passportId`, and calculates the commitment before minting.
3. It submits mint with **expected ID**, commitment, validated identity/holder/evidence binding and authorized role.
4. `GigPassport.sol` **atomically** checks the expected ID equals its current next-ID counter and also checks all identity/role/mint rules. It mints exactly that ID and increments the counter; it **never silently substitutes** a new ID.
5. If concurrent issuance consumes that ID first, the mint fails; ATTESTER reads the new next ID, **recomputes the commitment with that ID**, and retries.
6. The same process applies to authorized recovery/reissue; **no separate reservation transaction** is added. The contract cannot decode an opaque Poseidon commitment, so attester-side correct ID binding and cross-language tests remain essential.

### Authority

| Authority | Allowed contract action |
|---|---|
| Worker | Initiate business flow; hold/present wallet/passport; **no direct attested mint/refresh** |
| `ATTESTER_ROLE` | Mint after validated identity/FIP; refresh attested commitment |
| `ADMIN_ROLE` | Exceptional revoke; separately authorize reissue |

Use **two separate local demo EVM wallets** for ATTESTER and ADMIN, with private keys only in non-committed environment/config or actual wallet signing. No multisig/DAO/HSM production setup required in MVP.

### Non-transferability

Normal owner-to-owner token transfers must fail. Display SBT/passport as a credential, not a tradable collectible.

## 11. LOCKED — Evidence refresh/history

- Worker chooses **Refresh**; GigVault performs fresh FIP verification/classification and computes new evidence commitment.
- **Same passport** remains, unless exceptional revocation/reissue pathway is used.
- ATTESTER-only refresh, ACTIVE-only passport.
- Contract increments version **itself**; caller does not choose arbitrary `evidenceVersion`.
- New commitment must differ from current; evidence timestamp must be monotonic (not older).
- Current commitment/version/timestamp update in storage; **issuance and `EvidenceRefreshed` events include `sourceDirectoryVersion`** (as well as the corresponding evidence version, commitment and timestamp/cutoff metadata needed for reconstruction). Historical events are retrieved off-chain.
- Historical commitments in events, not a costly duplicate stored history array.
- Old proof remains historically attributable to its version but cannot be used for **new** requests requiring current evidence.
- Evidence age is a verifier policy (`maxEvidenceAgeDays`), not a reason to revoke.

## 12. LOCKED — Exceptional revocation / small reissue

Passport state machine is **ACTIVE → REVOKED**. `REVOKED` is terminal for that passport: **no REVOKED → ACTIVE**.

1. ADMIN revokes with logged reason; clear `activePassportByIdentity`.
2. ADMIN may **separately** `authorizeReissue(identityHash)`; this sets `reissueAllowed`.
3. Worker re-verifies same identity and supplies **fresh** FIP evidence.
4. ATTESTER replacement-mints only if prior passport is revoked, no active passport for identity, authorization exists and validations pass.
5. Successful mint **consumes** the reissue allowance.
6. Old token stays REVOKED; replacement can reference old passport; latest/active identity mappings updated.
7. Fraud/integrity revocation is **not automatically** reissuable.

**LOCKED downstream obligations across replacement (GV-067, GV-070):** Authorized wallet/passport recovery must not reset WelfareVault's one-time benefit **or** any outstanding Microcredit debt. Both consumer contracts resolve the public stable `identityNullifierHash` from the passport and key business state by that hash. Old token remains revoked; new token for the same identity has the **same binding**. Welfare uses `claimedByIdentity[identityHash]`; lending uses identity-keyed active debt/principal. Replacement holder may repay an outstanding loan **without a fresh income proof**; new borrowing still needs a new signed request/proof after full repayment. The hash permits **cross-contract on-chain linkability**, an explicitly accepted MVP privacy trade-off. Consumer-scoped nullifiers plus proof-bound recovery are future work, not implemented.

Admin UI is deliberately tiny: passport lookup, status/holder/version, revoke, reason, allow reissue toggle, ADMIN wallet confirmation. No tickets, manual editing of financial evidence, appeals queue or manual admin mint.

## 13. LOCKED — Exact verification policy vocabulary

```text
VerificationPolicy
  requestId
  verifierId                    // EVM signing address
  minAverageIncome?             // optional, integer threshold semantics
  incomeWindowMonths?           // required if income condition enabled
  continuityUnit?               // WEEK | MONTH
  continuityWindow?
  minActivePeriods?
  minHistoryMonths?
  maxEvidenceAgeDays?
  expiresAt
  verifierSignature
```

- Criteria compose freely; **GigVault core is not lender- or welfare-specific**.
- No `purpose`, `workerRole`, `verifierType`, `eligibilityScore`, `maxAverageIncome`, `maxInactivePeriods`.
- No worker cadence classification.
- Disabled/omitted criteria are **non-blocking**; normalize them in the proof system with enable bits/values and **omit disabled results in UI**.
- `maxEvidenceAgeDays` is evaluated as a public freshness check. Expiry is also public. Both remain **bound to the signed policy hash**.
- `verifierId` is the wallet/public-key **signer address**. Verifier display name and optional consumer contract address are presentation metadata, not the cryptographic identity.

### Anti-probing invariant

> **One application/request has one immutable signed policy. If a verifier changes *any* criterion, that requires a new `requestId`, new worker approval and new proof.**

Canonicalize the policy, compute `policyHash`, and verify `recoverSigner(policyHash, verifierSignature) == verifierId`. No gas required merely to sign the policy. Do not silently mutate a signed request.

**PENDING APPROVAL / engineering interface:** Exact policy binary/JSON encoding, signature encoding and endpoint routes are not locked; implementers must coordinate one canonical representation across frontend, backend, ZK and consumers. Do not invent new policy fields while selecting encoding.

## 14. LOCKED — Worker authorization and request journey

1. Verifier connects EVM signer, builds policy from supported fields, sets expiry.
2. System creates `requestId`, canonical `policyHash`; verifier signs.
3. Request is immutable; primary delivery is embedded **Verify with GigVault**, with QR/deep link as secondary delivery path.
4. Worker sees verifier identity, exact thresholds/window/unit/freshness, expiry, and clear privacy notice.
5. Worker **Approves & Generates Proof** or **Declines**. No silent proof generation for changed criteria.
6. Reconstruct current private snapshot from FIP (re-consent if needed), check commitment.
7. Produce proof bound to exact request and current passport/evidence.
8. Show worker and verifier factual condition results, plus independent public/cryptographic status.
9. Consumer applies own policy/business state; GigVault itself does **not** determine creditworthiness or benefit award.

## 15. LOCKED — Circom/Groth16 proof system

Prefer **one parameterized Circom/Groth16 system** rather than hardcoded separate lending/welfare proofs.

### Private ZK facts

- Average recognized gig income for **requested** month window compared with `minAverageIncome`.
- Verified history compared with `minHistoryMonths`.
- Activity/continuity count across selected `WEEK` or `MONTH` window compared with `minActivePeriods`.
- Consistency of private snapshot/preimage with attested commitment.

No subjective risk/reliability score and no verifier-business-category branch inside the circuit.

### Public proof-binding signals

- `passportId`
- `evidenceVersion`
- `evidenceCommitment`
- `requestId`
- `verifierId`
- `policyHash`
- `domainHash` (chain ID + `GigPassport` contract + schema version context)

Public policy fields/enable bits are hashed/bound, including enabled thresholds/window values, `maxEvidenceAgeDays`, and `expiresAt`, even where checked outside the circuit.

### Private witness categories

EvidenceSnapshot preimage: monthly totals[36], weekly flags[156], monthly flags[36], history start date, holder binding, `evidenceDataHash`, source directory version, and other snapshot preimage fields as required by the commitment.

### Public result bits — explicitly agreed

- `incomePass`
- `historyPass`
- `activityPass`

A proof can be valid while **one or more requested conditions FAIL**. The circuit must faithfully bind the bits to private facts; the verifier/consumer checks the required result bits. This preserves the important distinction between **valid-but-ineligible** (e.g. Imran) and **invalid evidence/proof**.

Both worker and verifier see the relevant **per-condition PASS/FAIL** bits, not exact income/history/activity values. This leaks more than an overall eligibility bit; it is an explicitly accepted product trade-off, bounded by worker approval and immutable policy.

### Public/outside-ZK checks

- Passport exists and ACTIVE.
- Current on-chain evidence version/commitment.
- Verifier signature, request/policy identity and expiry.
- Public `evidenceUpdatedAt` and verifier-specified freshness.
- Holder/passport/network/domain checks.
- Downstream one-time claim/loan/request consumption state.

Do **not** misrepresent freshness/signature/ACTIVE status as private circuit checks.

## 16. LOCKED — Proof/request/domain binding

Every proof must unambiguously bind:

```text
passportId + evidenceVersion + evidenceCommitment
+ requestId + verifierId + policyHash + domainHash
```

Domain must prevent cross-chain/cross-contract/schema confusion. Verifier signature is checked **outside Circom**. A proof for request A or verifier A cannot be used for another policy/request/verifier; proof tied to superseded evidence is not accepted for a new application.

**IMPLEMENTATION GUIDANCE:** Use joint ZK/backend/contract test vectors validating public-signal ordering, policy hashing, circuit commitment, deployment domain and result-bit interpretation. The exact signal encoding is an integration contract that still must be made explicit by implementers; do not call an arbitrary encoding “already approved.”

## 17. LOCKED — Mathematical verifier vs application checks

`GigVaultVerifier.sol` is a **minimal Groth16 mathematical proof verifier**. It does not own passport state, welfare, loans, payment or verification history. It checks the mathematical proof/public signals; consumers **separately** read `GigPassport.sol`, confirm binding/freshness/request/signature as required, and apply their own business state.

General off-chain verifiers may read Polygon and verify Groth16 with `snarkjs` off-chain. On-chain valuable-action consumers invoke the Solidity verifier and passport checks in their contract execution. Frontend gating **never substitutes** for contract-enforced checks.

## 18. LOCKED — Replay and application execution

Mathematical proofs can be re-verified indefinitely; do not claim otherwise. There is **no global GigVault consumed-proof registry**, because it creates linkage/fees/centralized application history.

- Policy changes demand new request + new approval, preventing silent verifier threshold-probing.
- **Consumers** enforce one-time execution when acceptance grants a valuable/state-changing benefit.

**LOCKED policy isolation + OPEN exact mechanism:** Each downstream consumer must accept only its **own intended signed policy/thresholds/window/verifier binding**, not a weaker arbitrary request whose output bits happen to PASS. The business/security requirement is agreed; the exact canonical policy encoding and on-chain enforcement mechanism are still **PENDING**, and must be specified/tested before borrowing or claims can be called secure.
- WelfareVault enforces **`claimedByIdentity[identityNullifierHash]`** so even a replacement passport cannot claim again.
- Lending consumer rejects active loans and previously consumed borrowing requests and requires a fresh request after repayment.
- Ordinary off-chain consumer can maintain its own application consumed state if needed; this is not a mandatory GigVault verifier-history DB.
- Re-displaying an existing verification result does not automatically violate policy.

## 19. LOCKED — WelfareVault (separate consumer)

**Contract:** `WelfareVault.sol`, independent from core passport/attestation. `BenefitClaimed` is an event; welfare claim state is not in GigPassport.

**Product-facing service:** **Gig Worker Support Benefit**, one-time support for verified active gig workers.

### Welfare policy — exact conditions

| Type | Condition |
|---|---|
| Passport | ACTIVE |
| Private ZK | verified history **≥ 6 months** |
| Private ZK | active months **≥ 4 of last 6** |
| Public freshness | evidence age **≤ 90 days** |
| Consumer state | **not previously claimed by this identity**, including on a revoked/replaced passport |

**No income threshold.** Do not add maximum-income/means test.

### Flow and enforceable state

1. WelfareVault shows requirements and **Verify with GigVault**.
2. Worker reviews/approves immutable signed request; GigVault proof is evaluated.
3. Results and live pipeline are shown, including factual PASS/FAIL.
4. **Claim benefit** is a **separate action**, enabled/shown **only if all conditions pass**; if any fails, Claim must be hidden/disabled and failed condition visible.
5. `WelfareVault.sol` must **independently re-check** required passport/proof/policy/public and one-claim conditions when called directly; invalid call **reverts** even when user bypasses UI.
6. On success mark claimed, emit `BenefitClaimed`, show actual transaction/Polygon explorer and success state; second attempt must reject.

**Benefit transfer:** Prefer a **small amount of Amoy test POL** if faucet funds permit; a real state-changing claim + event remains the no-cost fallback. **Exact amount not locked.** Do not call test POL real welfare money.

**LOCKED recovery-safe claim tracking:** `WelfareVault.sol` reads the stable identity nullifier hash from `GigPassport.sol` and checks/sets `claimedByIdentity[identityHash]`. A new passport for that same identity does **not** reset the one-time benefit. The contract enforces this independently from frontend UI. The shared hash may publicly link activity across consumer contracts; disclose this accurately rather than claiming full unlinkability.

## 20. LOCKED — Microcredit/DeFi (separate consumer)

**Contract:** `DemoLendingPool.sol` (technical/internal name), with a simple zero-value mock ERC-20 stable asset such as `MockUSDC`, on Polygon Amoy. User-facing service may be called **Microcredit**; technical details must disclose testnet/mock asset.

### Lending policy — exact conditions

| Type | Condition |
|---|---|
| Passport | ACTIVE |
| Private ZK | average recognized gig income over **last 6 months ≥ ₹20,000/month** |
| Private ZK | verified history **≥ 12 months** |
| Private ZK | active months **≥ 9 of last 12** |
| Public freshness | evidence age **≤ 30 days** |
| Consumer state | **no existing active loan** |
| Borrow action | **100 MockUSDC** test tokens |

These are prototype underwriting thresholds, **not a claim about real bank lending requirements**.

**LOCKED identity-linked lending state:** The lending consumer keys active-loan/outstanding-principal records by the **stable `identityNullifierHash`**, not solely `passportId`. An outstanding loan survives ADMIN revocation and replacement mint. While its debt remains active, the replacement passport cannot borrow again. The replacement holder can repay the existing debt without re-proving income. After repayment, the next borrow still requires a **fresh signed, worker-approved GigVault request and proof**. Contract logic (not UI) must enforce this.

### Verify → Borrow (separate actions)

1. **Verify with GigVault**; worker approves immutable request.
2. Live verification and per-condition PASS/FAIL; no raw/private values.
3. Only after all relevant conditions and consumer checks PASS: **Borrow 100 USDC** available.
4. If any condition fails, Borrow hidden/disabled with specific failed check; no transfer.
5. `borrow()` **re-checks on-chain**: passport ACTIVE; current evidence/commitment; valid proof; required result bits PASS; policy/request binding/unused status; no active loan. **YES → transfer 100 MockUSDC; set `loanActive = true`. NO → revert.**
6. With active loan: no second borrow.
7. Repay **100 MockUSDC**; `loanActive = false`.
8. After repayment: a **new signed GigVault verification request and proof** is required before any subsequent borrow. Old used request/proof cannot be reused.

**Explicit exclusions:** interest, collateral, liquidation, repayment due-date engine, credit scores, Aave-style architecture. No extra loans/products/limits without approval.

## 21. LOCKED — Worker frontend experience

### LOCKED — Two QR entry paths (GV-083)

- **Worker Passport QR:** resolves to the worker passport's **public** identity/status metadata. It can let a verifier initiate a new signed request; scanning it **does not** disclose private income/activity or run threshold tests.
- **Verifier Request QR/deep link:** carries or resolves the verifier's **signed immutable policy** for worker review of identity, exact criteria, expiration and privacy before **Approve/Decline**.
- Both converge on the **same signed-policy, worker-approved request-bound proof**. QR scanning cannot silently probe or bypass consent.



Minimum connected journey:

1. Wallet connection → detect ACTIVE passport by identity/holder; new worker create, existing worker dashboard.
2. Unique-person identity verification (Anon Aadhaar or labelled mock fallback).
3. FIP consent; signed data fetched by backend.
4. **Prominent real-looking transaction table**: `Bank/FIP data | GigVault analysis`; counted recognized payouts vs unrelated credits/debits; signature status/summary. This is transparency **not an extra approval ceremony**.
5. Evidence summary → **Create Passport**; explain raw transactions not on-chain.
6. Dashboard: passport ID/status, evidence version/update, recognized sources, Polygon Amoy tx/explorer, visible credential/QR. Actions: **Verify for a service**, **Refresh evidence**, **View evidence transactions**, **View activity history**.
7. Verification request review: verifier name/address, **exact signed immutable criteria**, expiry/privacy and Approve/Decline.
8. After approval: snapshot regenerated via FIP; compare on-chain commitment; proof generated; renew expired consent if necessary.
9. Show worker per-condition PASS/FAIL plus public checks; don't show exact private metrics in **proof results**.

### Worker activity log

Local-only convenience: **max 20 entries OR 90 days, whichever is smaller**. Store verifier/request/time/criteria/per-condition/overall result. Do **not** store proof object, private witness, raw transactions or exact income. No mandatory central verifier-history database.

## 22. LOCKED — Verifier frontend experience

1. EVM verifier signing wallet + optional display name.
2. Policy builder exposes **only** approved composable criteria; presets are UI convenience, not protocol verifier categories.
3. Generate request ID, expiry, policy hash, wallet signature; immutable afterward.
4. Deliver via primary **Verify with GigVault** integration or secondary QR/deep link.
5. Waiting for worker approval; no worker data disclosed before it.
6. After proof, **automated** verifier signature/expiry/binding/chain ACTIVE/current version/commitment/public freshness/Groth16 checks.
7. Show **per-condition PASS/FAIL**, independent chain/public checks, and consumer outcome where applicable.
8. Technical drawer: network, passport ID, evidence version/commitment, request ID, policy hash, verifier address, proof validity/status, explorer.

**Visible live verification pipeline**: ~5–7 meaningful stages (request integrity; passport lookup/status; current evidence/freshness; ZK proof; condition results; consumer state/outcome). States waiting/checking/pass/fail; minimal fast animation; stop at blocking integrity failure. Do not show raw transaction rows or exact income to verifier.

## 23. LOCKED — Admin, Welfare and Microcredit frontend boundaries

- **Admin:** tiny ADMIN-wallet gated revoke/reissue tool, not a support CRM; reason and optional `reissueAllowed`; old status REVOKED and replacement can show supersession in technical detail.
- **WelfareVault:** looks like **external** service, not a main GigVault tab; eligibility shown; Verify then separate Claim; no Claim after failure; on-chain result + duplicate prevention.
- **Microcredit:** separate external lending service; eligibility; Verify then separate Borrow; active loan/repayment; fresh-verification requirement for later borrow; no actual-value disclosure.
- **Security:** small **Security checks** scenario using Arjun; triggers one verified failure condition at a time; same verification pipeline stops at appropriate failure.

No platform should be presented as an internal GigVault financing decision engine.

## 24. LOCKED — Persona dataset and outcomes

**All people below are synthetic fixture personas, not real bank customers.** Generate natural individual bank rows (timestamps, irregular non-round rupee amounts, payment rails/UTR references, remitter metadata, unrelated credits and debits), derive metrics from those rows rather than typing persona totals into a verifier.

| Persona | Recognized sources/history | Locked demonstration and expected result |
|---|---|---|
| **Ramesh Kumar** | Swiggy; about Jan 2024–Oct 2026, ~1–2 weekly payouts roughly ₹3k–₹8k, recognized monthly ~₹24k–₹35k, ~44–48 active weeks of 52, **12/12 active months** | **Hero PASS**; mint, classify, refresh, welfare **PASS + claim**, Microcredit **PASS + borrow/repay**. Include unrelated transfers/refunds. Never tamper/revoke hero. |
| **Suresh Gowda** | Uber + Ola concurrently, about 18–24 months; 10–11 active months of 12; combined recognized income above lending threshold | Shows independent aggregation across two platforms; both sources counted. |
| **Imran Pasha** | Cab work, ~18 months, fresh ACTIVE evidence, last-6-month avg >₹20k, only **8 active months/12** | Valid proof and income/history PASS, but Microcredit activity **FAIL** (min 9/12). Policy failure, **not fraud**. |
| **Manjunath S** | Urban Company/home services, ~4 months fresh recognized data, substantial recent activity | Valid ACTIVE passport but **min history ≥6 months FAIL**. |
| **Venkatesh R** | Porter/goods, legitimate uneven/clustered payouts, some weeks no credits, longer adequate history/activity | **PASS** under applicable activity/history policy; illustrates no worker cadence label. |
| **Farhan Ali** | Earlier Swiggy → transition both → later Zomato, one passport, adequate continuous history/activity | **PASS**; portable identity/evidence despite platform switch. |
| **Arjun Mehta** | Delivery partner with legitimate baseline evidence/passport | Security persona only, one controlled failure per scenario (below). Do not treat base persona as fraudulent. |

**Source recognition in fixtures must be based on authenticated remitter metadata/registry entries, not narration magic or hardcoded results.** Exact rail and reference strings should be synthetic and credible, not copied from real accounts.

## 25. LOCKED — Security/integrity vs normal policy failure

### LOCKED — Display failure at its actual stage (GV-084)

- Tampered signed FIP data → **evidence-provider signature/authentication** stage, before attestation.
- Modified derived snapshot → **commitment matching/proof preparation**, not an imaginary new issuance.
- Old version proof / revoked passport → **verification** stage.
- Duplicate ACTIVE identity → **passport mint/issuance** rejection, not a ZK failure.
- Reuse the visual check pipeline where appropriate, but never suggest a nonexistent passport/request/verification was already successful.



**Normal policy failure:** Proof, provenance and passport are valid; a requested condition genuinely fails (Imran, Manjunath). Display truthful PASS/FAIL and do **not** revoke/passport-invalidate.

**Security/integrity failure:** System cannot trust or accept the evidence/proof/current passport:

| Arjun scenario | Engine behavior | Frontend failure |
|---|---|---|
| Change signed FIP amount/remitter/date after signing | FIP signature verification rejects | `FIP signature invalid` |
| Change derived snapshot/witness data | On-chain commitment mismatch / invalid committed witness | `commitment mismatch` |
| Reuse old proof after evidence refresh for new application | Current evidence version check rejects | `evidence version outdated` |
| Revoke active passport | Current status check rejects | `passport REVOKED` |
| Attempt second ACTIVE passport for same identity | Identity uniqueness check rejects mint | `active passport already exists for this identity` |

Also include a **real but unrecognized friend transfer**: counted as authenticated financial data, **excluded** from gig income. An altered QR/policy must fail signature/hash/binding; don't oversell mere DOM edits.

Use compact **Security checks** scenario with one case at a time. Reuse live verifier pipeline, mark the failing check, later checks **not continued**. Never label valid policy failure as tampering.

## 26. LOCKED — Product copy and privacy guardrails

Normal product UI should not repeatedly prepend **demo/mock/test/prototype** to names and screens. Appropriate copy: **Gig Worker Support Benefit**, **Microcredit**, **Verify with GigVault**, **Claim benefit**. Technical/environment surfaces must disclose **Polygon Amoy**, **MockUSDC test asset**, **simulated Mock FIP**, and **mock identity fallback** as applicable. This is a **copy/presentation rule only**—not a waiver of honesty or a reason to replace a real contract with fake frontend success.

Visibility matrix:

| Information | Worker-owned interface | General verifier | Chain | Downstream consumer |
|---|---|---|---|---|
| FIP raw transaction rows | Yes, transaction view | **Never** | **Never** | **Never** |
| Counted/excluded row classification | Yes | No | No | No |
| Exact private aggregate monthly income / activity vectors | Private computation, not proof result | **Never** | **Never** | **Never** |
| Evidence commitment/version and ACTIVE/REVOKED | Yes | Yes | Yes | Yes |
| Per-condition PASS/FAIL for approved request | Yes | Yes | Not global verification-history state | Yes |
| Welfare claim/loan action state | Worker sees relevant consumer | Consumer-specific | Its own consumer contract | Its own consumer |

Do not claim per-condition PASS/FAIL reveals *zero* information; the bits intentionally reveal the signed thresholds' factual outcomes. Worker must explicitly approve each signed policy.

## 27. LOCKED — Cost and fallback policy

- Zero additional spend: free open-source/local dependencies and Amoy testnet/faucets, not paid accounts, subscriptions, domains, hosted RPC or mainnet gas.
- **Real** testnet chain transactions for passport mint/refresh and consumer actions where feasible; do not cosmetically fake them while claiming on-chain verification.
- Signed Mock FIP and mock identity fallback are intentional/testable substitutes for unavailable production AA or Anon Aadhaar infrastructure; disclose accurately in technical context.
- Small Amoy test POL benefit preferred if available; state-changing claimed event/state remains fallback.
- Lending uses valueless MockUSDC, **not real USDC**.
- Judge pitch should explain current testnet/simulated boundaries and differentiate production extensions.

## 28. IMPLEMENTATION GUIDANCE — Sequenced build and integration gates

This is a **dependency-based execution plan**, not an invented sprint deadline or extra feature set. Each gate has explicit work and acceptance evidence.

### Gate A — Freeze cross-module meaning and create fixtures

**Dependencies:** none.  
**Work:** list locked schema semantics; common integer units/date bucket conventions; transaction fixture requirements; payout-source directory history; EvidenceSnapshot field order; policy semantics; current chain/domain meaning. Agree serialization/encoding between implementers before parallelizing.  
**Deliverables:** agreed data dictionary/interface mapping (not new user-facing fields), seeded authentic-looking bank rows for all 7 personas, initial registry entries, deterministic input→expected-output fixtures.  
**Exit:** fixture transactions alone reproduce Ramesh/Imran/Manjunath outcomes; unrelated credits excluded; no bank-provided gig-category field.  
**Watch:** completed UTC calendar-month and completed ISO-week buckets, oldest→newest, partial-period exclusion and zero activity/income treatment are **already LOCKED**. Remaining technical arithmetic (e.g., verified-tenure calendar-month comparator, field ranges/rounding) still needs an interoperable specification and tests.

### Gate B — Mock FIP signing/consent boundary

**Dependencies:** Gate A.  
**Work:** shared Mock FIP source; consent path; signed envelope; server-to-server retrieval by consent ID; FIP signature verification; tamper mutation test.  
**Deliverables:** signed fixture response; consent success/deny/expired paths; negative signature test.  
**Exit:** user-uploaded/altered JSON never becomes accepted evidence; tampered signed transactions reject.

### Gate C — Normalization/source directory/evidence derivation

**Dependencies:** A+B.  
**Work:** deterministic source normalization and recognition; registry `introducedInVersion`/`deactivatedInVersion` lookup; income totals[36], activity[156]/[36]; cutoff/history/date; evidenceDataHash; commitment.  
**Deliverables:** reproducible snapshot derivation in memory; no persisted snapshot; historical-directory reconstruction tests.  
**Exit:** same data+cutoff+directory yields same commitment across reruns/new consent envelope; changed data or historical-directory mismatch fails.

### Gate D — Identity and `GigPassport.sol`

**Dependencies:** A/C for commitments; identity mechanism for nullifier.  
**Work:** SBT uniqueness/non-transferability; attester/admin roles; mint; version refresh and events; ACTIVE/REVOKED; revoke, authorize reissue, replacement mint.  
**Deliverables:** deployed passport contract on Amoy, wallet/env setup, explorer-visible test transactions, tests.  
**Exit:** no duplicate ACTIVE identity; nontransferability; refresh increments version; revoked cannot refresh; terminal revocation; reissue consumes authorization.

### Gate E — Circuit, Groth16 verifier and proof binding

**Dependencies:** canonical snapshot/commitment, passport/domain, canonical signed policy representation.  
**Work:** single parameterized circuit, witness generation from regenerated private snapshot, income/history/activity condition bits, commitment and policy/request binding, Solidity mathematical verifier and off-chain verifier compatibility.  
**Deliverables:** proving artifacts; Solidity `GigVaultVerifier`; public-signal manifest; positive/negative test vectors.  
**Exit:** true PASS and valid-but-failing policy examples work; witness tampering fails; changed policy/request/verifier/domain cannot reuse proof; no raw values leaked.

### Gate F — Worker issuance and verifier integration

**Dependencies:** B–E.  
**Work:** worker wallet/identity/consent, transaction classification screen, evidence summary, mint/refresh dashboard, policy review/approval, regeneration/proof progress; verifier wallet policy builder/signature, QR/embedded flow, independent status and ZK checks, live verification line/results.  
**Deliverables:** end-to-end Ramesh flow and Imran normal policy fail; explorer links; worker activity log.  
**Exit:** verifier never receives raw statement or exact totals; proof generated only against approved immutable request/current commitment; fresh consent renewal path works.

### Gate G — Welfare consumer

**Dependencies:** D–F and consumer proof/public-check integration.  
**Work:** WelfareVault independent state/claim, worker-approved policy, conditions, onchain checks, separate Verify and Claim UX, duplicate rejection.  
**Deliverables:** pass/claim and fail/blocked traces; event/tx explorer.  
**Exit:** bypassing frontend still cannot claim on failed/revoked/stale/used conditions.

### Gate H — Microcredit consumer

**Dependencies:** D–F and token/consumer checks.  
**Work:** MockUSDC, lending contract and state, separate Verify/Borrow UI, borrow/repay, consumed requests, current evidence checks.  
**Deliverables:** Ramesh borrow, Imran valid-but-fails, second loan reject, repay, fresh-request reborrow.  
**Exit:** direct `borrow()` bypass fails for any unsatisfied check; old proof/request not reusable after repayment.

### Gate I — Security/recovery/presentation integration

**Dependencies:** B–H.  
**Work:** Arjun 5 failures, status pipeline stops correctly, tiny admin page/reissue, product-vs-technical disclosures and cross-app visual consistency.  
**Deliverables:** deterministic negative demo scenarios with repeatable resets as needed; recovery flow; complete QA matrix.  
**Exit:** each failure arises from appropriate signature/commitment/version/status/identity check, **not just a preprogrammed red UI message**.

**Priority/cut principle:** Protect evidence provenance → commitment/passport → valid ZK/selective proof → verifier integrity first. Welfare, lending, recovery and security are approved product requirements, but prioritize integrations according to working dependencies. Do **not** replace their locked behavior with a different product without discussion. Final live-demo ordering is **pending approval**.

## 29. IMPLEMENTATION GUIDANCE — Ownership/interface handoffs

This is an accountability matrix, not a prescribed team structure or invented REST contract.

| Producer | Consumer | Required interface semantics (not endpoint names) | Contract tests |
|---|---|---|---|
| Mock FIP | Attestation | consent ID/scope, authenticated transaction envelope + signature | mutation fails, expired consent rejected |
| Source directory | Attestation | historical versioned authenticated remitter matching | unknown excluded; historical version stable |
| Attestation | GigPassport | validated identity binding, computed commitment, evidence timestamp/provider ref | only ATTESTER; version increments; no caller forged state |
| Attestation/reconstruction | ZK witness builder | deterministic EvidenceSnapshot matching **current** onchain commitment | same cutoff/version reproduces; changed data rejects |
| Verifier policy builder | Worker approval/ZK | signed immutable policy with criteria/hash/verifier/request/expiry | changed threshold needs new ID/signature/approval |
| ZK system | Generic verifier/consumers | proof, public signals, result bits, verification key compatibility | correct binding/results; no private value leakage |
| Polygon GigPassport | Off-chain verifier/consumers | current status/version/commitment/timestamp, holder/identity binding | stale/revoked rejected |
| Generic verifier | WelfareVault/Microcredit | valid proof + requested factual results | consumer rechecks its own rules, not just UI flag |
| Consumer contracts | Consumer frontend | tx outcome, claim/loan state | direct-call bypass and replay tests |

**Boundary rule:** Frontend may optimistically display backend statuses, but financial/state-changing acceptance must not trust frontend-generated booleans. **No new `isEligible` authority** inside GigVault core.

## 30. IMPLEMENTATION GUIDANCE — Scenario-based acceptance suite

A build is not ready merely because screenshots look correct. Run at least the following scenarios:

### Provenance and classification

- Signed FIP original accepted; modify transaction amount/remitter/timestamp → signature failure.
- Real authenticated unknown/self/family transfer appears in worker table but changes **zero** recognized gig-income totals.
- Changing narration alone to “Swiggy” does not count unknown payer.
- All 7 personas share the same Mock FIP source logic; metrics trace to rows.

### Deterministic evidence

- Repeat signed fetch under new consent envelope for identical underlying data → same `evidenceDataHash`/commitment.
- Reconstruct previous evidence version after adding newer transactions → cutoff prevents silent changes.
- Reconstruct previous evidence version after directory update → historical version preserves old recognition.
- Tamper derived array/metadata → commitment fails against chain.
- Verify GigVault did not persist canonical snapshot or raw FIP response in browser/GigVault DB.

### Identity/passport

- Mint to one identity: ACTIVE; second ACTIVE mint for same identity rejects.
- Normal SBT transfer attempt fails.
- Unauthorized mint/refresh/revoke calls fail.
- Refresh same ACTIVE passport increments version and emits event; old proof cannot satisfy new current-version application.
- Revoked stays REVOKED, no refresh/restore; explicit admin reissue, fresh identity/FIP, replacement token, old token remains REVOKED, authorization consumed.

- Contract sequential ID contention must reject stale expected ID without mint; recomputed next-ID snapshot commitment must succeed on retry. FIP account-owner binding mismatch must reject issuance **and refresh**. Welfare claim persists across replacement; outstanding Microcredit debt persists and can be repaid by the replacement holder without a new income proof.

### Policy/ZK/verifier

- Disabled criteria do not block or appear in UI.
- Worker approves exact signed policy and can decline.
- Edited threshold/expiry/verifier invalidates binding; changed criteria require new signed request.
- Groth16 verifier proves correct result bits; exact aggregates/witness never delivered to verifier.
- Imran has **valid proof** but `activityPass=false`; do not report “invalid proof.”
- Valid proof fails current-status check for REVOKED passport or old evidence version.
- For requested conditions, worker/verifier both see PASS/FAIL, no exact private values.

### Welfare

- Ramesh passes history/4-of-6/freshness and can independently **Claim**.
- Any failed condition hides/disables Claim; direct claim call still rejects.
- After successful claim, `claimedByIdentity[identityHash]` blocks any second claim **including after passport replacement**.
- Technical UI identifies any test POL as non-real.

### Lending

- Ramesh passes income/history/9-of-12/freshness; `borrow()` transfers 100 MockUSDC and sets active.
- Imran fails 9-of-12 only, with valid proof; Borrow unavailable and direct call reverts.
- Second loan while active reverts.
- Repay resets active false.
- Reborrow with **old request/proof** fails; fresh approved request/proof is required.

### Security and UI integrity

- Arjun each of five cases stops at correct live pipeline stage, later steps not continued.
- Failing FIP signature is not misreported as failed income policy.
- Passport ACTIVE with stale evidence remains ACTIVE; verifier freshness condition fails without revocation.
- No user-facing fake bank-sourced `isGigIncome` column, credit score, DAO/payment feature, raw data disclosure or duplicated “demo” labels.

## 31. PENDING APPROVAL — Precisely scoped open choices

**Do not relabel the locked architecture above as unknown.** The following remain unapproved/implementation choices, to coordinate or seek approval as appropriate:

1. Exact project/repository directories and framework selections (not a reason to alter trust boundaries).
2. Exact Mock FIP/source-directory database technology.
3. Exact API route/JSON/TypeScript wire schema; only **semantic requirements** above are locked.
4. Exact canonical serialized policy encoding, proof-signal encoding and circuit field encodings. Must be agreed internally and verified against all consumers before integration; any **product-semantic** change needs user approval.
5. Exact practical identity integration fallback trigger (the preferred/fallback options are locked).
6. Exact choice of browser vs controlled backend for ZK witness/proof generation; privacy/trust outcomes cannot change silently.
7. Exact WelfareVault amount of test POL (and whether faucet actually permits transfer).
8. Exact QR/deep-link representation and screen URLs.
9. Final main-stage demo sequence, persona order, and which security scenarios shown live vs backup.
10. Precise UI design system/animations beyond locked content, copy and behavior.
11. **Still open:** Exact domain-tag integer constants, Poseidon root/metadata ordering, provider/holder/digest field encoding, stable FIP-data byte serialization, comparator range limits and month-history arithmetic, plus generated cross-language golden test hashes. Four-way tree/zero padding/domain separation/period buckets/numeric units are **already LOCKED**.
12. **Resolved (not open):** Contract-controlled sequential `passportId` with pre-mint lookup, expected-ID atomic check, recalculation/retry on collision and no reservation transaction. See §10.
13. **Still open:** Exact on-chain consumer enforcement of its required verifier/policy and backend worker-approval authorization where proof generation is off-chain; do not weaken agreed request binding. See Decision Register GV-072.

If a proposed implementation choice **changes a locked policy, identity/security guarantee, trust boundary, public disclosure or product flow**, stop and request explicit approval.

## 32. FUTURE / OUT OF MVP

No `$GIG` token/tokenomics, DAO, verifier payment/fee split, platform-dependent worker reputation score, normal-UI JSON proof export, `SUSPENDED` lifecycle, worker cadence classification, max-average-income / max-inactive-period criterion, encrypted GigVault evidence archive, universal source onboarding system, rich support/recovery/appeals, production bank integration or mainnet money, advanced borrowing economics, global used-proof ledger, and production HSM/multisig. Production ideas may be discussed as **future**, never represented as completed hackathon scope.

### Final consistency sentence

> **FIP authenticates provenance. GigVault recognizes payout sources and attests a deterministic private evidence commitment. Polygon anchors a non-transferable passport and its current evidence/version/status. The worker approves an exact signed policy. ZK proves requested facts with per-condition PASS/FAIL but not exact values. A verifier verifies; a separate consumer decides and enforces its own action.**
