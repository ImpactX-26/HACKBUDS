# GigVault Backend A — Gate 1 Reconciliation Response & Protocol Proposals

**Status: PROPOSED / REVIEW ONLY; NOT APPROVED PROTOCOL SPECIFICATIONS.**  
**Date:** 2026-10-09  
**Responding Commit:** Backend A Gate 1 Corrections  
**Referenced Backend B Commit:** [`3fc0e1dc8139a809873cd3337772fab731b9767d`](https://github.com/ImpactX-26/HACKBUDS/pull/2)  
**Author:** Backend A (Evidence & Normalization Agent)

---

## 1. Summary of Confirmed Corrections Implemented in Backend A

Following Backend B's v0.1.2 review (`BACKEND_B_FINAL_GATE1_RECONCILIATION_V0_1_2.md`), Backend A has resolved all 8 confirmed gaps:

| Item | Finding | Implementation in Backend A | Verification Evidence |
|---|---|---|---|
| **1** | Nonadjacent duplicate transaction IDs | Enforced global `Set<string>` uniqueness check across all transactions regardless of timestamp or sorting in both `EvidenceSnapshotBuilder` and `serializeCanonicalEvidence`. Nonadjacent duplicates and whitespace-padded duplicates immediately throw. | `poseidon-parity.test.ts`, `proposal-schema.test.ts` assert rejection |
| **2** | Normalization & classification divergence | Both classification (`TransactionClassifier`) and canonical preimage serialization (`buildCanonicalPreimage`) operate on identical normalized fields (`rail`, `remitterName`, `remitterVpa`, `remitterAccount`). Whitespace padding normalizes invariantly. | `poseidon-parity.test.ts` test verifying whitespace invariance |
| **3** | Authorization & replay boundary | Unified `IReplayStore`, `MemoryReplayStore`, and `ReplayProtectionRegistry` with atomic consumption, TTL pruning based on server `consumedAt`, and HTTP 409 `REPLAY_ATTACK_DETECTED`. Multi-instance replicas sharing store detect replay. | `http-integration.test.ts`, `identity-auth.test.ts` tests passing |
| **4** | Action enforcement, directory versions & bounds | Allowed attestation actions constrained to `['MINT_PASSPORT', 'REFRESH_PASSPORT', 'REISSUE_PASSPORT']`. `getDirectoryForVersion` validates `PUBLISHED_DIRECTORY_VERSIONS = [1, 2, 3]`; version `999999` returns HTTP 400. Positive integer bounds enforced on passport IDs and timestamps. | `http-integration.test.ts` tests assert HTTP 400 on invalid action, directory 999999, negative/float IDs |
| **5** | Fail-closed direct consent/retrieval | `ConsentService` and `MockFIPService` default `strictAuthentication = true`. Direct unauthenticated calls reject with `AuthenticationRequired`. Explicit `_TEST_ONLY` methods isolate internal unit tests. | `fip-foundation.test.ts` tests assert rejection of unauthenticated direct calls |
| **6** | Tightened encodings & retired duplicate schema | Removed obsolete `backend/src/proposal/canonical-evidence-schema.ts`. Unified on `shared/proposal/canonical-evidence-schema.ts` and `shared/proposal/field-mappings.ts`. Enforced strict 32-byte hex for digests, 20-byte hex for addresses, canonical provider grammar. | `proposal-schema.test.ts` asserts rejection of 1-byte digest and padded provider ID |
| **7** | Enforced ASCII grammar & UTF-8 byte ordering | Transaction IDs must match `/^[A-Za-z0-9_.:#/-]+$/`. Sort order uses `Buffer.compare(Buffer.from(a.txnId, 'utf8'), Buffer.from(b.txnId, 'utf8'))`. | `proposal-schema.test.ts` asserts non-ASCII rejection and deterministic sorting |
| **8** | Confine mock SHA-256 test commitments | `AttestationService.attestAndMintOnChain` checks `passportContract.isMockClient`. Submitting mock commitment to live contract client throws `LiveSubmissionProhibited`. | `poseidon-parity.test.ts` asserts `LiveSubmissionProhibited` rejection |

---

## 2. Independent Regeneration & Vector Validation Results

Backend A independently regenerated the canonical dataset and cryptographic outputs from **327 authentic synthetic transactions for Ramesh Kumar** in `MockFIPStorage` with cutoff `1791460800` (2026-10-08 12:00 UTC), passport ID `101`, holder `0x111111cf1046e68e36e1aa2e0e07105eddd1f08e`:

```text
Canonical UTF-8 length: 82,134 bytes
SHA-256: 432394cab6b2caa83ed0c69e975b5766cd08c7c1fa167e81a7a01faae65ab303
Digest mod r: 8479584554115755712227973106457499606067708830244852437925920972305787106748
verifiedHistoryStartDate (days): 19727
incomeRoot: 20119275159189889380691640169503521072267433455885550380794051959666890461667
weeklyRoot: 21852563639151117767628491974987827408917650138870771480290417841191760527724
monthlyRoot: 13559395075388244745760140214469017241871546221208979575604441749602464732002
commitment (Directory Version 3): 10726476670528999076866107901464198313257170751774472100053243783233552060424
commitment (Directory Version 1): 3434642233711873443323895407087161423409459365193261731849263244990213477830
```

**Parity Assessment:**
- Exact match across all four Poseidon roots and commitments with Backend B commit `3fc0e1d` and `circuits/fixtures/backend-a-e991-vectors.json`.
- Tested in `backend/test/poseidon-parity.test.ts`.

---

## 3. Separately Proposed Decisions for Joint Approval

The following sections are **PROPOSED / REVIEW ONLY** and are not approved protocol specifications.

### 3.1 Monetary Representation & Integer Ranges
- **Current implementation:** Values in paise integer `0..9,007,199,254,740,991` (`MAX_SAFE_INTEGER`). Aggregations use BigInt addition before casting back to safe integers.
- **Joint Proposal:**
  - Standard JSON numbers can lose precision above $2^{53}-1$ in standard JavaScript runtimes.
  - While $9 \times 10^{15}$ paise ($\approx$ ₹90,000 crore) is practically sufficient for individual worker earnings, Backend A supports Backend B's recommendation: **if full uint64 support is required, represent all monetary amounts across the network wire as decimal string representations** (e.g. `"monthlyGigIncomeTotalsPaise": ["2831650", ...]`).
  - Circuits will parse these as BigInt scalar field elements, constrained to uint64 range checks in R1CS.

### 3.2 Completed-Calendar-Month Tenure Arithmetic
- **Definition:** Tenure is the number of completed calendar months between `verifiedHistoryStartDate` and `cutoffTimestamp`.
- **Proposed Arithmetic Rules:**
  1. Let `(startYear, startMonth, startDay)` be the UTC calendar date of `verifiedHistoryStartDateDays * 86400`.
  2. Let `(cutoffYear, cutoffMonth, cutoffDay)` be the UTC calendar date of `cutoffTimestamp`.
  3. Raw difference in calendar months: `deltaMonths = (cutoffYear - startYear) * 12 + (cutoffMonth - startMonth)`.
  4. Day-of-month anniversary test:
     - If `cutoffDay < startDay`, subtract 1 month from `deltaMonths`.
     - *Leap Day Clamping:* If `startDay == 29` in February and the cutoff month has only 28 days (non-leap February), Feb 28 satisfies the anniversary.
  5. If `verifiedHistoryStartDateDays == 0` (no verified payouts), tenure is strictly `0`.
  6. Final tenure: `max(0, deltaMonths)`.
- *Negative constraint:* `days / 30` is strictly rejected as non-calendar tenure.

### 3.3 Provenance Coverage & TimeBounds Semantics
- **Current Canonical Encoding:** `timeBounds.fromTimestamp` is the earliest eligible transaction timestamp within the window (or 0 if none), and `timeBounds.toTimestamp` is the cutoff timestamp.
- **Joint Proposal:**
  - Formally bind `timeBounds.fromTimestamp` to the **consented query lower bound** (`consent.dataRange.fromTimestamp`), ensuring that query scope is cryptographically locked regardless of whether transactions occurred in early months.
  - Retain `timeBounds.toTimestamp` as the cutoff timestamp.
  - Narration and IFSC remain excluded from the hash for v1, but the schema must reserve optional slots for future directory versions that match bank IFSC or clearing codes.

### 3.4 Worker Signature Domains & Replay Store Persistence
- **Action Types:**
  - `MINT_PASSPORT`: Sequential passport minting.
  - `REFRESH_PASSPORT`: Updating evidence on an existing active passport.
  - `REISSUE_PASSPORT`: Claiming replacement passport after admin revocation.
  - `RECONSTRUCT_EVIDENCE`: Private worker-side view of decrypted snapshot.
- **Replay Store Interface:**
  - Minimal state stored: `{ signature, nonce, walletAddress, action, consumedAt, requestId, requestFingerprint }`.
  - Zero financial data or transaction details stored.
  - Idempotent retries permitted only for read-only actions (`RECONSTRUCT_EVIDENCE`) with matching `requestFingerprint`. State-changing actions (`MINT`, `REFRESH`, `REISSUE`) strictly consume signatures and fail on retry (HTTP 409).
- **Domain Migration:** Propose migrating from `personal_sign` string formatting to EIP-712 structured data signing for production testnets.

### 3.5 Verifier Policy Hash & Public Signal Manifest
- Circuit public signals must be explicitly manifested in order:
  1. `evidenceCommitment`
  2. `passportId`
  3. `holderBinding`
  4. `verifierPolicyHash` (binding the immutable criteria evaluated by the circuit)
  5. Boolean evaluation flags (e.g. `incomeThresholdSatisfied`, `tenureThresholdSatisfied`)
- A proof is valid only for the exact policy approved by the worker. Changing criteria requires a new request and signature.
