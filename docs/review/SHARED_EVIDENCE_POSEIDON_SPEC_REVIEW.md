# GigVault — Shared Evidence Encoding & Poseidon Interface

**Status: REVIEW DRAFT — locked principles + explicitly PROPOSED wire details.**  
**Audience:** Backend A (Mock FIP / attestation), Backend B (Circom / Solidity), frontend integration reviewer.  
**Scope:** Canonical private EvidenceSnapshot, numeric encodings, deterministic time buckets, hierarchical Poseidon tree construction, test fixtures, and integration checks.  
**Important:** This is **not** evidence that any code has been implemented or validated. Newly proposed constants/encodings below are **not locked** merely because they appear here. The original three team reference files are unchanged.

## 1. Approval labels

- **LOCKED:** already approved in GigVault planning; do not change while implementing.
- **PROPOSED — REVIEW NEEDED:** exact engineering convention now recommended for approval.
- **OPEN / MUST TEST:** requirement needing an implemented result or a still-unsettled design choice. Do not claim it has passed.

## 2. The trust boundary — LOCKED

1. Mock FIP is a separate logical provenance authority. It holds account/transaction histories and signed consent-bound evidence. Its signed account-owner binding must match the worker's verified identity binding in the attestation service.
2. The attestation service verifies FIP signature, consent, account-owner matching and recognized payout-source identifiers **before** deriving private financial evidence. Text narration alone never proves a payout source.
3. The worker initiates issuance and approval but cannot self-certify income. Only the authorized GigVault ATTESTER mints/refreshes the passport.
4. GigVault does **not** persist raw FIP responses or the plaintext EvidenceSnapshot. The Mock FIP keeps the original records. On later proof generation, GigVault fetches authenticated records under valid consent, reconstructs the original evidence version and checks its commitment against the on-chain current commitment.
5. `evidenceDataHash` is the stable digest of normalized **authenticated data**, not the changing consent/signed envelope, and never replaces verification of the FIP's actual signature.
6. One active passport per stable app-scoped identity hash. Contract controls sequential passport IDs. ATTESTER reads next ID, commits snapshot with that ID, calls mint(expectedId), and recomputes/retries if expectedId changed before mint.
7. The issuance/refresh event exposes `sourceDirectoryVersion`; historical directory entries remain available through the append-only registry. On reconstruction, use exactly the version and `evidenceUpdatedAt` for that evidence version.

## 3. Exact logical EvidenceSnapshot schema — LOCKED

```text
EvidenceSnapshot
  passportId
  holderBinding
  evidenceProviderId
  evidenceDataHash
  verifiedHistoryStartDate
  evidenceUpdatedAt
  monthlyGigIncomeTotals[36]
  weeklyActivity[156]
  monthlyActivity[36]
  sourceDirectoryVersion
  evidenceCommitment              // OUTPUT ONLY, excluded from hash preimage
```

No raw transaction list, score, worker cadence label, consumer-specific rules, policy results, or loan/benefit state belongs in this snapshot.

## 4. Already-approved scalar conventions — LOCKED

| Logical type | Encoded representation |
|---|---|
| Money | Nonnegative **integer paise** (no floats) |
| Calendar date | Integer days since Unix epoch, UTC |
| Timestamp | Integer Unix seconds |
| Activity | Exactly `0` or `1` |
| Hash/identifier inputs to Circom | Fixed-width BN254-compatible field elements |
| Array order | Oldest completed bucket first; newest last |

**PROPOSED — REVIEW NEEDED:** Every field element must be an integer `0 <= value < r`, where the BN254 scalar-field modulus is:

```text
r = 21888242871839275222246405745257275088696311157297823662689037894645226208583
```

Do not silently reduce arbitrary inputs modulo `r` **inside the circuit**. Only explicitly specified off-chain digest-to-field operations may reduce; other scalar fields should undergo strict range validation and fail on overflow or negative values. Money should additionally undergo a chosen bounded-bit range check to avoid modular wraparound in threshold comparisons (**bound not yet selected**).

## 5. Completed-period time buckets — LOCKED

Use `evidenceUpdatedAt` as the fixed UTC reference/cutoff for a particular evidence version.

- `monthlyGigIncomeTotals[36]` and `monthlyActivity[36]` cover the **36 most recent fully completed UTC calendar months**, oldest → newest.
- `weeklyActivity[156]` covers the **156 most recent fully completed ISO Monday–Sunday weeks**, oldest → newest.
- The partial current month/week is excluded, even if recent authenticated transactions are available.
- A period with no recognized gig payout is `0` income and/or `0` activity.
- An activity bucket is `1` exactly when at least one recognized FIP-authenticated payout occurs in that completed period.
- Custom verifier policy windows refer to the most recent `N` buckets in the relevant array; there is **no universal** ₹20,000 threshold or six-month window.
- Average monthly gig income over `N` completed months includes zero-income months in the denominator; history and freshness are independent concepts.

**Example (LOCKED consequence):** cutoff 2026-10-08 UTC → latest completed calendar month = September 2026. A 6-month income window means April–September 2026. For the weekly array, the latest completed ISO week is 2026-09-28 through 2026-10-04, inclusive.

**PROPOSED — REVIEW NEEDED:** Normalize timestamps before bucketing using integer Unix seconds; a month's bucket is a half-open interval `[UTC month start, next UTC month start)`, and a week's bucket is `[Monday 00:00 UTC, next Monday 00:00 UTC)`. Use these exact interval boundaries in TypeScript and test vectors.

## 6. Hash primitive — LOCKED

- Poseidon is the ZK-friendly EvidenceSnapshot commitment primitive.
- All array commitments use a fixed **4-way tree**.
- Each node contains **four ordered children plus an in-hash domain tag**, meaning **five Poseidon inputs** total.
- Incomplete groups pad missing child slots with field element `0`.
- Domain separation distinguishes income, weekly activity, monthly activity, their different tree roles/levels, and the final EvidenceSnapshot commitment.
- TypeScript and Circom implementations must compute identical outputs from identical canonical inputs.
- `evidenceCommitment` must **never** be included in its own preimage.

**Implementation caution:** `Poseidon(5)` in `circomlib` corresponds to a five-input Poseidon hash; JavaScript must use compatible `circomlibjs` `buildPoseidon()` parameters/versions. Pin exact dependency versions and compare raw field outputs; similarly named Poseidon implementations may differ.

## 7. Exact proposed array tree — PROPOSED, NOT YET LOCKED

Define one primitive on five field elements:

```text
H5(domainTag, c0, c1, c2, c3) := circomlib-Poseidon([domainTag,c0,c1,c2,c3])
```

Use the fixed integer domain tags proposed below (all are small field elements):

| Array/tree role | Level / tag | Proposed integer |
|---|---|---:|
| Monthly gig-income | leaf level 0 | 1100 |
| Monthly gig-income | internal level 1 | 1101 |
| Monthly gig-income | root level 2 | 1102 |
| Weekly activity | leaf level 0 | 1200 |
| Weekly activity | internal level 1 | 1201 |
| Weekly activity | internal level 2 | 1202 |
| Weekly activity | root level 3 | 1203 |
| Monthly activity | leaf level 0 | 1300 |
| Monthly activity | internal level 1 | 1301 |
| Monthly activity | root level 2 | 1302 |
| Final snapshot metadata | leaf level | 1400 |
| Final snapshot metadata | root level | 1499 |

The numbers above are **proposals**. Their distinctness and use inside each hash input are what matter; the team must approve the exact constants and freeze them as part of the protocol/schema version.

For each array, build tree levels by grouping children in their existing sequence in batches of four. If the last batch has one, two or three children, append zeros until there are four. Apply that level's domain tag to every group at that level. Continue until exactly one root is produced.

**Lengths/number of hashes by level:**

```text
monthlyGigIncomeTotals[36] : 36 values → 9 leaf hashes → 3 hashes → 1 root hash
weeklyActivity[156]       : 156 flags → 39 leaf hashes → 10 hashes → 3 hashes → 1 root hash
monthlyActivity[36]       : 36 flags → 9 leaf hashes → 3 hashes → 1 root hash
```

### Proposed TypeScript-style reference pseudocode

```ts
function hashTree4(inputs: bigint[], tagsByLevel: bigint[]): bigint {
  let layer = inputs;
  for (const tag of tagsByLevel) {
    const next: bigint[] = [];
    for (let i = 0; i < layer.length; i += 4) {
      const children = layer.slice(i, i + 4);
      while (children.length < 4) children.push(0n);
      next.push(poseidon5([tag, ...children]));
    }
    layer = next;
  }
  if (layer.length !== 1) throw new Error('Wrong tree depth / arity');
  return layer[0];
}

const incomeRoot = hashTree4(monthlyGigIncomeTotals,
  [1100n, 1101n, 1102n]);
const weeklyRoot = hashTree4(weeklyActivity,
  [1200n, 1201n, 1202n, 1203n]);
const monthlyRoot = hashTree4(monthlyActivity,
  [1300n, 1301n, 1302n]);
```

`poseidon5` is a symbol for an adapter around the actual pinned library, not an independently implemented cryptographic primitive. Check every numeric element's range **before** hashing. Do not hash JSON strings directly through Poseidon.

## 8. Final EvidenceSnapshot root — PROPOSED, NOT YET LOCKED

The ten **ordered scalar slots** of the final tree are:

```text
M[0] = passportId
M[1] = holderBinding
M[2] = evidenceProviderId
M[3] = evidenceDataHash
M[4] = verifiedHistoryStartDate
M[5] = evidenceUpdatedAt
M[6] = sourceDirectoryVersion
M[7] = incomeRoot
M[8] = weeklyRoot
M[9] = monthlyRoot
```

Proposed root construction:

```text
m0 = H5(1400, M[0], M[1], M[2], M[3])
m1 = H5(1400, M[4], M[5], M[6], M[7])
m2 = H5(1400, M[8], M[9], 0, 0)
evidenceCommitment = H5(1499, m0, m1, m2, 0)
```

This structure binds all canonical fields and all three array roots; the commitment is **not** included in its own preimage. Distinct node/root tags keep tree roles separate. A new incompatible ordering, scalar conversion or tag table must require a new schema/protocol version, not silent migration.

## 9. Specific scalar-field mappings — PROPOSED, NOT YET LOCKED

These choices complete the proposed wire format without inventing new product features:

- `passportId` → contract-controlled sequential integer, read before issuance as `expectedId`; check `0 <= id < r`.
- `holderBinding` → the unsigned 160-bit value of the canonical holder EVM address (20 bytes interpreted big-endian, no address-string hashing). **This identifies wallet binding, not real-world identity**. The on-chain `identityNullifierHash` separately prevents duplicate ACTIVE passports and carries recovery obligations.
- `evidenceProviderId` → field derived from a pre-agreed canonical provider ID using a domain-prefixed SHA-256 digest and explicit digest-to-field rule below; exact provider ID string is stable across fetches.
- `evidenceDataHash` → SHA-256 over **canonical normalized authenticated dataset bytes**, then digest-to-field mapping. Exclude ephemeral consent ID, envelope signature and fetch/generated timestamp; signature/consent validation still mandatory before hashing. The exact normalized dataset serializer is **OPEN** (see §11).
- `verifiedHistoryStartDate` → UTC Unix epoch days, strict nonnegative integer.
- `evidenceUpdatedAt` → UTC Unix epoch seconds, strict nonnegative integer.
- `sourceDirectoryVersion` → integer of the historical append-only registry version recorded in the relevant passport issuance/refresh event.
- Array money and flags → validated nonnegative paise and exact booleans (0/1) in chronological order.

**Digest-to-field proposal:** Interpret the full 32-byte SHA-256 digest as a big-endian unsigned integer and compute `digest % r`. The `r` modulus is the scalar-field modulus above. Use identical decimal-string or `BigInt` representations in TypeScript; inside Circom this digest-derived value is simply a private witness field constrained by the final Poseidon commitment. Keep the original full digest in transient attestation internals where useful; it is not an extra on-chain snapshot field.

**Provider ID domain separation proposal:** `SHA-256(UTF8("GIGVAULT_PROVIDER_ID_V1|") || UTF8(canonicalProviderId)) mod r`. Provider IDs are case-sensitive ASCII canonical identifiers set by the trusted Mock FIP/attestation configuration, not worker-entered free text.

**OPEN:** Specific canonical transaction normalization/serialization into `evidenceDataHash` remains to be agreed by backend implementers. It must deterministically sort by timestamp then transaction ID and normalize strings, exclude envelope-only metadata, retain authenticated financial/account-owner provenance and transaction contents that the attester consumed, and create the same byte sequence on every re-fetch.

## 10. ZK/circuit correctness requirements — LOCKED PRINCIPLES, IMPLEMENTATION OPEN

- Circuit must recompute each tree root and `evidenceCommitment` from private witness values, and constrain it to the public commitment bound to the **current** on-chain evidence version.
- Constrain every weekly/monthly activity flag to `0` or `1`.
- Constrain every monetary value's range so a malicious prover cannot exploit modulo-field arithmetic to make false comparisons pass. **Exact bound/comparator design requires technical review.**
- Income criterion: minimum **average monthly recognized gig income** over verifier-selected completed months. When the threshold is in paise, safely enforce `sum(last N monthly totals) >= minAverageMonthlyIncomePaise * N`; include zero months in `N`. No universal six-month/₹20K requirement.
- History criterion: compare the committed verified start date against the verifier's requested duration using clearly specified calendar semantics (**exact months arithmetic still OPEN**).
- Activity criterion: sum the last `N` precomputed weekly or monthly activity flags and compare with signed policy `minActivePeriods`.
- Disabling a criterion must be nonblocking, but the circuit cannot allow the prover to freely choose a passing result bit. PASS/FAIL outputs must be **constrained by actual comparisons** to the committed data.
- Request binding includes `passportId`, `evidenceVersion`, `evidenceCommitment`, `requestId`, `verifierId`, `policyHash`, and deployment/domain hash. Signatures and public passport/expiry/freshness checks are done outside the ZK circuit as previously agreed.
- Proof reveals per-condition PASS/FAIL, not actual private income, month counts, or raw records. Consumers must enforce exact intended signed policies and their own one-time financial state, not only rely on arbitrary PASS bits.

## 11. Remaining open technical choices — DO NOT INVENT APPROVAL

1. The proposed tag constants, 10-field ordering, final metadata tree, and `holderBinding`/provider ID representations in §§7–9 need the user's approval as a **single interface revision**.
2. The normalized authenticated transaction dataset serialization for `evidenceDataHash`, including stable account-owner-binding representation, must be specified and cross-tested. Signed envelope fields excluded from stable hash are already locked.
3. Select a sensible bounded-bit integer width for monthly paise, plus safe comparator/range-check implementation in Circom; don't silently leave field-wraparound possible.
4. Specify how to calculate and prove calendar-month history duration from `verifiedHistoryStartDate` relative to cutoff (completed-month rule is locked for the *arrays*, but date-to-history-month formula is not yet locked).
5. Define exact policy-field encoding/hash and approval enforcement for backend proof generation, and ensure each consumer enforces its **own expected policy**.
6. Pin exact compatible versions of `circom`, `circomlib`, `circomlibjs`, `snarkjs`, and record reproducible circuit/build configurations; cross-language outputs must be checked, not assumed.
7. Produce **real cryptographic golden output values** from the pinned libraries and verify in both TypeScript and a compiled Circom circuit. Golden outputs have **not** been generated in this draft; do not fabricate numeric digests.

## 12. Shared cross-language test fixtures — LOCKED TEST REQUIREMENT / PROPOSED INPUTS

**Required tests (already agreed):** Same canonical data → identical TypeScript/Circom Poseidon roots/commitment; changed committed value → changed commitment; witness tampering rejected; old evidence version rejected for new applications; original directory version/cutoff reconstructs same value.

The following fixture inputs are **proposed examples**, not real financial records or precomputed Poseidon outputs:

```text
Fixture A — baseline
passportId = 101
holderBinding = 101  // illustrative EVM address 0x000...0065 interpreted as integer
provider canonical string = "FIP-MOCK-01"  // pending provider-ID field mapping
verifiedHistoryStartDate = UTC days from 2024-01-01
evidenceUpdatedAt = 2026-10-08T00:00:00Z expressed in Unix seconds
sourceDirectoryVersion = 3
monthlyGigIncomeTotals = [0 repeated 36], except index 29 = 2800000 paise, index 35 = 2300000 paise
weeklyActivity = [0 repeated 156], except index 0 = 1, index 77 = 1, index 155 = 1
monthlyActivity = [0 repeated 36], except index 29 = 1, index 35 = 1
evidenceDataHash = hashToField(SHA-256(canonical authenticated dataset bytes))

Fixture B — tamper one monthly income entry
identical to Fixture A except monthlyGigIncomeTotals[35] = 2300001
=> expected commitment MUST differ

Fixture C — activity boundary
identical to A except weeklyActivity[155] = 0
=> expected commitment MUST differ

Fixture D — historical directory version
identical to A except sourceDirectoryVersion = 4
=> expected commitment MUST differ

Fixture E — passport identity binding
identical to A except passportId = 102
=> expected commitment MUST differ

Fixture F — reproducibility
same fixture A regenerated from a new FIP consent envelope (new consentId / signature / fetch timestamp)
but same normalized authenticated dataset, same fixed cutoff, same historical directory
=> expected commitment MUST match A
```

**Golden-output checklist for Backend B, checked independently by Backend A:**

```text
[ ] Pinned library versions documented
[ ] Fixture A canonical encoded scalar list recorded
[ ] Fixture A incomeRoot (decimal field string) recorded
[ ] Fixture A weeklyRoot recorded
[ ] Fixture A monthlyRoot recorded
[ ] Fixture A evidenceCommitment recorded
[ ] All outputs independently reproduced by compiled Circom witness
[ ] Fixtures B-E produce distinct commitments
[ ] Fixture F matches Fixture A
[ ] Negative tests verify tampered witness cannot pass current on-chain commitment
```

No placeholder digest may be passed off as a validated golden hash. If a fixture cannot supply canonical normalized bytes yet, fixture that scalar **explicitly** in a dedicated hash-only unit test (e.g. fixed `evidenceDataHash = 123456789`) and separately test normalization→hash mapping when its serialization is approved.

## 13. Backend integration handoff

| Owner | Delivers | Consumer / check |
|---|---|---|
| Backend A | Mock FIP signed envelope + consent/account-owner binding validation | Attestation rejects forged or wrong-account data |
| Backend A | Canonical dataset normalization and stable `evidenceDataHash` | Backend B validates identical digest-to-field fixture |
| Backend A | Exact `EvidenceSnapshot` values and time-bucket arrays (transient) | Backend B compares known snapshot → Poseidon roots |
| Backend A | Directory-version reconstruction + cutoff from chain event | Proving backend reconstructs current commitment |
| Backend B | Single shared Poseidon 5-input implementation wrapper and tree function | Backend A imports/tests same library adapter rather than rewriting hash |
| Backend B | Circom circuit implementing committed input constraints | Proof verification rejects mismatched inputs |
| Backend B | Public-signal manifest + verified proof artifact | On-chain/off-chain verifier validates current passport/request |
| Both | Test vectors, positive and negative tests | Must pass before claiming cross-system cryptographic correctness |

## 14. Pitch/implementation honesty

- Signed Mock FIP inputs **simulate** authenticated bank-origin data; they are not evidence of a real regulated FIP integration.
- Blockchain stores no raw transactions. It anchors commitments/status/version; it doesn't certify that synthetic transactions happened in the real world.
- ZK proves statements about the **attested commitment**, not independently that the FIP's transactions are genuine beyond the prior trust boundary.
- Existing shared on-chain identity hash can link welfare and loan activity across contracts; this is an accepted MVP privacy trade-off. Consumer-specific nullifiers and private recovery are future work, not implemented.
- Historical directory versions and Mock FIP transactions are retained in this hackathon. Long-term production access to real FIP histories is a genuine future availability question, not an unsolved hackathon blocker.
