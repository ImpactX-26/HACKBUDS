# GigVault — Cryptographic and Cross-Language Test Gates

**Status: engineering checklist; no cryptographic tests were run while preparing this handoff.**

## A. What has already been approved

- BN254/Circom-compatible field elements for cryptographic identifiers; monetary paise integer; Unix seconds timestamps; Unix-epoch-day calendar dates; flags 0/1.
- 36 completed UTC income/month-activity buckets; 156 completed ISO Monday–Sunday activity weeks; oldest→newest; zeros for empty periods.
- EvidenceSnapshot logical fields in Decision Register; `evidenceCommitment` is output-only.
- Hierarchical Poseidon commitment with separate monthly-income, weekly-activity and monthly-activity roots; domain separation inside hash preimages; **4-way tree; zero pad incomplete groups**.
- Deterministic regeneration of version with original `evidenceUpdatedAt`, original historical source registry version, authenticated FIP records. No GigVault snapshot persistence.
- Public per-criterion PASS/FAIL bits, with exact values private and comparisons constrained by committed witness.

## B. Shared wire format review (do not silently lock)

Candidate tags and tree levels are in `SHARED_EVIDENCE_POSEIDON_SPEC_REVIEW.md`:

```text
H5(tag, a, b, c, d) = circomlib-compatible Poseidon([tag,a,b,c,d]);
monthly income [36]: 36 → 9 → 3 → 1;
weekly activity [156]: 156 → 39 → 10 → 3 → 1;
monthly activity [36]: 36 → 9 → 3 → 1;
last incomplete group: append 0 field elements to four child slots.
```

The candidate domain IDs (1100..1499), metadata 10-slot order, holder-wallet big-endian address representation, provider SHA-256 mapping, `evidenceDataHash` digest-to-field rule and root H5 construction are **PROPOSED**. Product behavior does not change, but changing these after deployment would change commitments and require a schema version bump.

**Before freeze, resolve together:**

1. Canonical signed FIP record and normalized authenticated dataset serializer. Which signed metadata (owner binding, account ID, source, data range) is included? Exact Unicode/string/time/currency/paise handling; exclude consent/envelope-only entropy.
2. Field conversion: EVM holder address to field, provider identifier to field, authenticated evidenceDataHash to field, date/time/amount ranges and overflow behavior.
3. Exact domain separation and metadata/root ordering; Poseidon package/compiler versions and arity. No confusion between binary byte hash, field-hash and EIP-712 digest.
4. Finite-field safe month-amount bounds and comparator bit width. Proposed candidate: unsigned 64-bit monthly totals/threshold paise with wide-range sum comparison; **not yet approved or formally tested**.
5. Exact month-history calculation from `verifiedHistoryStartDate` (Unix days) and public cutoff, including worker first payout in mid-month, month boundaries and leap days.
6. Exact signed policy/worker approval and public signals to which the circuit binds (see authorization review).
7. Confirm every public result bit is mathematically *equal to* the relevant predicate, not free witness boolean or one-way `pass => condition` implication. Disabled predicates are nonblocking but the enabled predicates are fully constrained.

## C. Real golden vector procedure

**No hashes in the prior review have been verified in a real compiler. Do not invent them.**

1. Pin compatible versions for Circom, `circomlib`, `circomlibjs`, `snarkjs`, and record checksums/commands in lockfiles and test README.
2. Build one shared TypeScript `poseidon5` adapter through the pinned Poseidon library and a circuit with identical five-input Poseidon.
3. Use deterministic *hash-only* fixture with concrete field elements; where serializer not ready, use a clearly labeled fixed `evidenceDataHash` field literal only in this hash-only fixture.
4. Record decimal field values for all 10 metadata slots, the array vectors (all positions), incomeRoot, weeklyRoot, monthlyRoot, final evidenceCommitment. Check full BN254 ranges.
5. Run compiled Circom witness on the same fixture. Assert **identical numeric roots and commitment**.
6. Change exactly one monthly paise, one weekly flag, one monthly flag, passportId, holderBinding, date, directory version, and provider ID; each should produce a different commitment for fixture values.
7. Test incomplete 4-way branch padding positions, zero values in actual data vs padding (domain/known fixed-length structure), and different domain tags.
8. Reconstruct after new Mock FIP consent envelope ID/signature but unchanged authenticated transaction dataset; must produce same commitment for original cutoff/directory version.
9. Create valid ZK proof for satisfied and failed conditions; compare constrained result bits to independent plain TypeScript reference predicates. Ensure altered witness cannot prove against unaltered commitment.
10. Full proof verifies in snarkjs and Solidity verifier with matching public signals; wrong requestId/verifierId/policyHash/domain/current version rejects at consumer application level.

## D. Security properties and limits

- Comparing commitments does **not** prove bank records were honest in the real world. Our FIP is a separate simulated signer. Signature verifies that content came from that Mock FIP key, and unchanged after signing.
- Hash collision resistance is a cryptographic assumption, not a formally proven unique mapping of every possible real-world input. Exact-length fixed arrays, domain separation, and canonical serialization reduce ambiguity.
- Snapshots do not persist in GigVault; FIP retains test records, source directory retains historical versions, Polygon events retain evidence version/cutoff/registry metadata. Production bank data availability is an external constraint, not an unresolved hackathon data-retention problem.
- Public stable identity hash supports recovery-safe claims/loans but permits cross-contract linkability. Consumer-specific nullifiers remain future-only.
- Script output and test logs may contain sensitive witness values; avoid checking them into Git or sharing actual financial/private records.

## E. Stop conditions

Do not call the ZK/contract stack complete if:

- Poseidon matching outputs are not actually tested.
- The circuit allows a prover to set PASS flags arbitrarily.
- Income arithmetic can overflow the BN254 field or an unchecked bit width.
- The contract accepts valid proof for a wrong or weaker consumer policy.
- The backend can successfully **execute** a benefit/loan without valid worker approval.
- Recovery changes active loan or claimed state keyed to the stable identity hash.
- Any core security check is replaced by a hardcoded true flag while UI says verified.
