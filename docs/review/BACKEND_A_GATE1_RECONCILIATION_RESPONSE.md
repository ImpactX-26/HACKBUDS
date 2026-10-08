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

### 3.4 Worker Signature Domains, Chain Validation & Replay Store Persistence

#### Action Types & Mandatory Chain Validation
- **Action Types:**
  - `MINT_PASSPORT`: Sequential passport minting.
  - `REFRESH_PASSPORT`: Updating evidence on an existing active passport.
  - `REISSUE_PASSPORT`: Claiming replacement passport after admin revocation.
  - `RECONSTRUCT_EVIDENCE`: Private worker-side view of decrypted snapshot.
- **Chain Domain Enforcement:**
  - When an `expectedChainId` is configured on the service or HTTP app, both `/attestation/attest` and direct `attestWorkerEvidence` reject missing chain IDs (`CHAIN_DOMAIN_MISSING`) or mismatched chain IDs (`CHAIN_DOMAIN_MISMATCH`).
  - Migration from `personal_sign` text to EIP-712 structured data signing is **PROPOSED** for production testnet integration.

#### Replay Store Persistence, Concurrency & Security Hardening
- **Zero-Cost Host Persistence & Mutual Exclusion (`FileReplayStore`):**
  - Implemented `FileReplayStore` implementing `IReplayStore` with transactional cross-process mutual exclusion (`fs.openSync` with atomic `O_CREAT | O_EXCL` flags on `${filePath}.lock`) and atomic file writes (`node:fs` write-to-temp + atomic rename).
  - Guarantees true read-check-write atomicity across contending OS child processes: tested with actual child processes contending concurrently for identical signatures or duplicate nonces, verifying exactly one process succeeds and the other is rejected.
  - Persists minimal authorization records `{ signature, nonce, walletAddress, action, timestamp, consumedAt, requestId, requestFingerprint }` without any monetary cost or external database dependencies.
  - Invariant: Zero financial evidence, transaction data, or snapshots are stored.
  - Survives process restarts and synchronizes safely across separate operating system processes on the same host.
- **Live-Owner Lock Protection & Verified Dead-Owner Recovery:**
  - **Live-Owner Invariant:** Elapsed time alone CANNOT invalidate or evict a live owner's lock. Even if an owner process pauses beyond 10 seconds (e.g. GC pause, OS scheduling, or I/O delay), contending processes inspect the lock metadata, verify that the owner PID is alive in the OS process table via `isProcessAlive(pid)`, and strictly refuse to evict or delete the lock.
  - **Dead-Owner Recovery:** If and only if the owner PID is verified dead in the OS process table (`process.kill(pid, 0)` returns `ESRCH`), the abandoned lockfile is safely recovered and unlinked after verifying that the file still matches the dead owner's token.
  - **Ownership Verification on Release:** `releaseLock()` strictly parses the lockfile and verifies that both the unique lock token and process PID match the releasing instance. It never deletes another owner's lock if the lock was usurped or replaced.
  - **Pre-Persistence Lock Assertion:** `assertLockHeld()` runs immediately before disk persistence, failing closed with `FileReplayStoreLockLostError` if the lock was missing or usurped while in-flight, preventing split-brain persistence.
  - **Fail-Closed Contention Timeouts:** If a contender's timeout expires while a live owner holds the lock, the contender fails closed with `FileReplayStoreLockTimeoutError` without consuming the authorization.
  - **Manual Crash Recovery:** Documented utility `FileReplayStore.recoverAbandonedLock(filePath)` safely clears orphaned locks only after verifying that the owner PID is dead. If an orphaned lock from a hard machine crash or container recreation with recycled PIDs prevents acquisition, operators can inspect `${filePath}.lock` (recording `pid`, `token`, `createdAt`, `hostname`) and manually remove the lock file.
- **Fail-Closed on Corrupted, Malformed, or Unreadable Storage:**
  - `syncFromDisk()` strictly validates existing storage: malformed JSON, empty/whitespace files, non-array roots, or invalid record schemas immediately throw `FileReplayStoreCorruptedError`.
  - Errors are never swallowed; the store fails closed on both initialization and subsequent calls (`consume`, `isConsumed`), preventing acceptance of already-consumed authorizations when storage integrity is compromised.
- **Freshness-Aligned Expiry Retention:**
  - Consumed records are retained until `Math.max(record.timestamp, record.consumedAt) + maxAgeSeconds`.
  - Authorizations signed up to 60 seconds ahead (within allowed clock-skew) remain protected against replay throughout their entire cryptographic validity period (tested at `T + 301s` and the exact `T + 360s` validity boundary).
  - Records are pruned only at `T + 361s` when the signature can no longer pass `verifyWorkerAuthorization`.
- **Operational Recovery Limitations (Reported Boundary):**
  - **Single-Host Limitation:** `isProcessAlive(pid)` checks the local host OS process table. In multi-container, serverless, or multi-host Kubernetes topologies sharing a network volume (NFS/EFS), POSIX PID inspection cannot verify process liveness across separate container namespaces or virtual machines.
  - **PID Recycling:** On POSIX kernels with low PID wrap-around limits, an extremely delayed dead-owner recovery (>several hours after crash) could theoretically collide with a recycled PID. Timestamp and token matching mitigate this on active hosts.
  - **Distributed Cloud Infrastructure Requirement:** Multi-host horizontal scaling requires distributed mutual exclusion and replay tracking (e.g. Redis Redlock with atomic Lua scripts or PostgreSQL transaction WAL). This remains an **UNRESOLVED operational requirement** pending shared infrastructure provisioning.

#### Reconciliation of Reconstruction Retry Semantics
- **CURRENT BEHAVIOR (ENFORCED IN CODE):**
  - All entry points, including `/attestation/reconstruct`, strictly enforce single-use authorization with `allowIdempotentReplay: false`.
  - Any re-submission of an identical authorization signature or nonce immediately fails with HTTP 409 `REPLAY_ATTACK_DETECTED`.
- **PROPOSED BEHAVIOR (PENDING JOINT DECISION):**
  - If the joint teams decide that worker-side reconstruction retries (e.g. client dropped network connection or transient prover failure without re-signing) should succeed safely, `allowIdempotentReplay: true` can be enabled conditionally for `RECONSTRUCT_EVIDENCE` only when `requestFingerprint` matches the previously consumed record.
  - Until joint approval, Backend A maintains the strict fail-closed single-use behavior (`allowIdempotentReplay: false`).

---

### 3.5 Verifier Policy & Public Signal Manifest (PROPOSED — NOT APPROVED)

Circuit public signals must strictly account for every locked binding established in `AGENTS.md` and reference architecture:
1. `passport`: Stable passport identifier.
2. `current evidence version`: Version number of evidence on the passport.
3. `current evidence commitment`: Poseidon root of historical 36-month / 156-week financial evidence.
4. `holder`: Worker EVM wallet control.
5. `request`: Instance freshness and query cutoff bounds.
6. `verifier`: Consumer contract / recipient authorization.
7. `policy`: Immutable criteria and threshold rules.
8. `deploymentDomain`: Chain ID and contract address scope.

#### Comprehensive Binding Specification

| Binding | Target Field | Exposure Mode | Technical Specification & Constraints | Verification Gate Responsibility |
|---|---|---|---|---|
| **Passport Identity** | `passportId` | **Direct** (Public Signal) | Exposed directly as uint256 / BN254 scalar. | Consumer contract checks `passportId` existence and active status in `GigPassport.sol`. |
| **Current Evidence Version** | `evidenceVersion` | **Direct** (Public Signal) | Exposed directly as uint256 / BN254 scalar. | Consumer contract checks `passport.evidenceVersion == publicEvidenceVersion` to prevent stale evidence attacks. |
| **Current Evidence Commitment** | `evidenceCommitment` | **Direct** (Public Signal) | Root of hierarchical 4-child Poseidon tree. Exposed directly as BN254 scalar. | Consumer contract checks `passport.evidenceCommitment == publicEvidenceCommitment`. |
| **Worker Holder** | `holderBinding` | **Direct** (Public Signal) | 20-byte EVM address converted to uint160 field element via big-endian byte mapping. | Consumer contract checks `holderBinding == msg.sender` (or approved operator). |
| **Request Instance** | `requestCommitment` | **Constrained Hash** | `Poseidon(requestIdField, cutoffTimestamp, requestNonceField)`. Constrains cutoff timestamp and request freshness in circuit. | Consumer contract verifies request was not previously consumed / replayed for this claim. |
| **Authorized Verifier** | `verifierBinding` | **Direct / Bound** | 20-byte consumer contract address converted to uint160 field element (or bound in policy). | Consumer contract checks that proof was generated specifically for its own address (`this == verifierBinding`). |
| **Signed Policy** | `policyHash` | **Constrained Hash** | `Poseidon(policyId, minMonthsActive, minTotalIncome, maxThreshold, ...)` or SHA-256 mod $r$ of immutable signed policy criteria JSON. | Consumer contract verifies `policyHash == expectedConsumerPolicyHash` and worker explicitly approved this exact hash. |
| **Deployment Domain** | `domainSeparator` | **Constrained Hash** | `Poseidon(chainId, passportContractAddress, verifierContractAddress)`. Prevents cross-chain replay (e.g. Amoy vs local). | Consumer contract computes domain separator locally and compares against public signal. |
| **Condition Decisions** | `evaluationFlags[k]` | **Direct** (Public Signals) | Per-condition boolean flags (`0` or `1`) for each policy criterion (e.g. `isIncomeSatisfied`, `isTenureSatisfied`). | Consumer contract checks that all required flags equal `1` without learning private amounts or exact dates. |

*Note: All public-signal encodings and circuit templates above remain strictly PROPOSED; no protocol freeze or consumer contract deployment should proceed until joint approval.*

