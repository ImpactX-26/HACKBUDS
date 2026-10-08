# Backend B Gate 1 interoperability review — 0.1.1

**PROPOSED / REVIEW — 2026-10-08. Recommendation: accept hash/mapping compatibility for prototyping; withhold final protocol approval pending the corrections below and independent Backend A reproduction.** No locked architecture, reference documentation, Backend A files or branches were modified. No deployment or canonical wire-format freeze occurred.

Inspected [Backend A PR #3](https://github.com/ImpactX-26/HACKBUDS/pull/3), fork `Manas150706/HACKBUDS:feature/evidence`, exact head `8c5042bd37d6a74bb3c765f58eb6ac855caa1b6f`. Its 38 tests/typecheck/build are **reported by Backend A**, not independently rerun as a full suite here. Focused reproductions execute frozen, unmodified published modules; every source/fixture is verified against its Git blob SHA before transpilation. Source lines are stored as JSON to preserve original whitespace/bytes without modifying the original modules. Transpilation is not a claim that the complete Backend A application was typechecked.

## Accepted provisionally for testing

| Interface | Result / approval status |
|---|---|
| Logical snapshot fields | The seven scalars plus income[36], weekly[156], monthly[36], and output-only commitment match locked semantics. Oldest-to-newest completed buckets, integer paise, epoch days/seconds and binary activity are locked. |
| Holder | Actual fixture address decodes to `97433507141326869998073493959856501856247345294`, matching A. Candidate uint160 big-endian mapping is tested, not a stable identity substitute. |
| Provider | `MOCK_APNA_BANK_FIP_01` maps to `2918073423441781409142330843142884098247476530334926146722899203699064754212` using the candidate domain-prefixed SHA256/mod-r rule, matching A. Canonical ID grammar remains proposed. |
| Dataset digest field | Fixture digest `346fcb72afd753e34b1ca3db33a03d199d513933e8a67d1238e82d20f736d663` maps to `1829549425141527887927010202705065143469641877581537614954577543701989021980`, matching A. This verifies conversion, not the omitted canonical dataset byte preimage. |
| Trees / metadata | Candidate review tags and 10-slot ordering match the earlier proposal: seven scalars then income/weekly/monthly roots; four children, zero padding at every incomplete level. Exact constants/order remain unapproved. |
| Witness transport | Exact named scalar/array inputs, canonical unsigned decimal strings or in-memory BigInt, binary flags and strict `[0,r)` boundary. Circom input adds public `expectedCommitment`; four root/commitment outputs are diagnostics only, not the application public-signal manifest. |
| Amount experiment | A second circuit independently constrains monthly paise to uint64 and holder to uint160. Max uint64 passes; 2^64, field-minus-one amount and 2^160 holder fail even with their matching field hashes. These bounds are provisional experiments, not approved money/comparator policy. |

The new single adapter lives in `shared/proposal/poseidon5.ts`; the prior lab import re-exports it. A's canonical schema and fixture are not overwritten. Libraries remain Circom 2.2.3, circomlib 2.0.5, circomlibjs 0.1.7, snarkjs 0.7.5 and TypeScript 5.9.3. Dependency pins/audit findings from Milestone 2 are unchanged and unresolved.

## Actual hash outputs and tests

Backend A's **actual published synthetic snapshot**, not the earlier fixed-literal hash example:

| Output | Real decimal field value |
|---|---|
| incomeRoot | `20119275159189889380691640169503521072267433455885550380794051959666890461667` |
| weeklyRoot | `21852563639151117767628491974987827408917650138870771480290417841191760527724` |
| monthlyRoot | `13559395075388244745760140214469017241871546221208979575604441749602464732002` |
| evidenceCommitment | `17057776044314545379576656229478007760108694673197752276092855675165560572398` |

`circuits/fixtures/backend-a-gate1-vectors.json` records 14 genuine deterministic vectors, metadata slots and source commit. Outputs were recorded only after real TypeScript/compiled WASM parity; normal tests do not rewrite them. All 14 vectors match the original and bounded Circom profiles. Every scalar, each array's last value and reversal of each array affect the commitment; modified inputs cannot satisfy the old expected commitment. Earlier 15 vectors remain unchanged and passing.

Actual validation: Circom/R1CS/WASM compilation and strict Backend B TypeScript check succeeded; combined circuit suite **50 passed, 0 failed** (22 earlier tests + 28 Gate 1 tests). Real snarkjs R1CS witness check accepts the valid witness and rejects a modified output. Both profiles reject matching-hash nonbinary activity. Newly signed real secp256k1 synthetic envelopes with changed consent ID/generatedAt reconstruct identical snapshot roots/commitment at the same cutoff/directory. This reconstruction uses a small public synthetic dataset, not the unpublished byte preimage behind A's Ramesh digest; it does not validate current consent by itself. Original hash circuit: 69,498 constraints; bounded experiment: 71,999; H5: 835. `node scripts/groth16-smoke.mjs` generated/verified a real H5 Groth16 proof and rejected its altered public hash, deleting disposable setup artifacts. This proves only the primitive, not financial predicates or authorization.

Passport preservation: `npm test` in `contracts/` **23 passed, 0 failed**, with the existing Ganache JavaScript uWS fallback warning. No passport source/test changes.

Reproduce from `circuits/`: `npm ci --ignore-scripts`, `npm run setup:circom` (or documented checksum-verified offline compiler), `npm test`, `npm run proof:smoke`. Explicit vector regeneration: `npm run gate1:record`. All inputs here are public synthetic fixtures; no real plaintext evidence/private keys or production proof artifacts are retained.

## Confirmed discrepancies and exact Backend A corrections

Passing review-finding tests reproduce upstream weaknesses; they are **not assertions that these behaviors are secure**. Backend A must repair them on its own branch and add rejection regressions.

| Finding / severity | Evidence | Required Backend A change |
|---|---|---|
| **High: provenance omitted from digest** | `classifier.ts` counts a curated `remitter.name`. Changing it from unknown to `BUNDL TECHNOLOGIES PRIVATE LIMITED` changes income while **both** runtime and proposed dataset digests stay equal. Signature still binds the raw name; final Poseidon binds changed arrays, so this is not a Poseidon collision or demonstrated commitment forgery. It is an incomplete stable dataset digest. | Include normalized authenticated name (and every input that affects counted financial evidence) in the one canonical dataset. Align normalization used for classification and hashing. Specify currency/IFSC handling; validate INR and relevant enums instead of relying on TS types. Narration need not be a payout-authority input. |
| **Blocking interoperability mismatch** | Runtime `normalizer.ts` hashes `{accountOwnerBinding,transactions}`; proposal hashes `{accountOwner,timeBounds,transactions,version}` with different key order. The same dataset produces different SHA256 values. Fixture generator consumes runtime digest, not proposed serializer. | Replace divergent/duplicated codecs with one jointly reviewed versioned serializer used by runtime, proposal tests and fixture generator. Publish exact synthetic UTF-8 canonical bytes plus full SHA256/field output. Regenerate fixture and commitments explicitly if bytes change; preserve old versioned vectors. |
| **Medium: ambiguous normalization/order** | Proposal only maps rows, so reversing input changes hash. Runtime sorts raw IDs with `localeCompare` before trimming; whitespace-normalized equivalent IDs can yield different order, and duplicate normalized IDs survive. | Normalize before sorting; define timestamp + normalized transaction-ID byte ordering, string case/Unicode rules and duplicate-ID rejection. Test input permutations, whitespace, tie timestamps and duplicate IDs. Serializer must sort itself or enforce/validate an explicit already-sorted contract. |
| **High: monetary precision loss** | FIP verifier uses `Number.isInteger`, accepts values beyond MAX_SAFE_INTEGER. Two individually safe amounts `9007199254740991` and `2` aggregate to `9007199254740992` instead of `9007199254740993`. BN254/uint64 validation after rounding cannot recover the lost paise. | Reject unsafe source numbers immediately; migrate paise totals to BigInt/canonical decimal transport before addition. Add overflow limits and select finite sum/product/comparator bounds together. Candidate monthly/threshold uint64 and N<=36 give sum/threshold*N below 2^70, but predicate constraints remain future work. |
| **High: fail-open FIP trust configuration** | `new FIPVerifier()` has an empty trusted set and accepts a correctly self-signed envelope. A nonempty configured set rejects that same key. Default attestation/fixture paths can use the empty set. | Require a nonempty configured trusted-key set and fail initialization/verification when missing. Initialize all attestation paths with the Mock FIP authority key; test self-signed/untrusted key rejection, valid trusted signature, tampered data and owner mismatch. |
| **High: expired-consent bypass during historical reconstruction** | Attestation passes caller `cutoffTimestamp` as FIP `currentTimestamp`, which becomes consent expiry clock. A consent expired at server-now-60 is accepted using server-now-120 cutoff, then rejected using current time. | Separate server-owned current clock/consent validation from evidence reconstruction cutoff. Require currently valid consent for historical records, enforce its coverage, and validate requested cutoff/range without changing the current clock. Add expired-consent historical-cutoff rejection tests. Test-only clock injection must not be request-controlled. |

The proposed serializer preserves account ID + identity binding, range, IDs, timestamps, paise, direction, rail, VPA, account and reference. Tests show changes to these affect the digest and envelope entropy is excluded. It omits owner display name/verification timestamp, currency, IFSC and remitter name; only the last is currently demonstrated to affect financial classification. Agree which fields are intentionally redundant/validated constants versus retained authenticated provenance. Confirm top-level account ID, owner binding and consent account/range consistency at the signature/consent gate. No claim is made that all possible provenance attacks have been audited.

## Remaining decisions and approval recommendation

Approve **prototype compatibility only** now. Before final approval, A must fix the table, supply the canonical bytes/updated fixture, and independently run/import the single shared adapter to reproduce all four outputs above (or explicitly new versioned outputs after corrections). Backend B must then recheck the corrected dataset-to-hash/circuit path. The current Ramesh hash comes from the old runtime serializer; its numeric parity cannot approve that serializer.

Joint decisions still required: exact retained source fields and fixed range/cutoff coverage (avoid consent-envelope-dependent ranges); source string/order/duplicate conventions; exact tag/metadata manifest and digest/provider/holder rules; integer widths/overflow and comparison constraints; history anniversary/leap-day calculation and explicit no-history sentinel (`0` currently means absence and must not imply Jan 1970 tenure); EIP-712 policy/worker approval, disabled-zero rules and request/policy/domain bytes32 public-signal representation (the earlier two-128-bit-limb proposal remains under review). Require fresh-consent reconstruction under **current** consent validity and original directory/cutoff after fixes.

Final format approval requires both owners' matching independently executed results and user sign-off on the remaining exact encodings. No financial PASS flags, consumer contracts, deployable trusted setup or on-chain commitment using provisional constants is authorized by this review.
