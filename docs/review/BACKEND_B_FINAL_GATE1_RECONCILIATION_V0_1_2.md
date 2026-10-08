# Final Gate 1 reconciliation — Backend B v0.1.2

**Status: verified provisional interoperability; NOT ready for final joint protocol approval.** Date: 2026-10-08. Reviewed Backend A [`e991f9036b2e563e2ecc1420d1b3ebad0968710e`](https://github.com/Manas150706/HACKBUDS/tree/e991f9036b2e563e2ecc1420d1b3ebad0968710e), Draft PR #3. This supersedes the current-readiness conclusions of the earlier v0.1.1 report. Its frozen `8c5042b` reproductions remain historical evidence, not findings against the corrected revision.

## Verified source and actual execution

Inspected the corrected shared serializer, active normalizer, classifier/directory, calendar, snapshot builder, FIP signature/consent/ownership checks, identity/wallet authentication, orchestrator and HTTP routes. The exact public commit is downloaded into ignored `circuits/.scratch/backend-a-e991`; no checkout, merge or Backend A branch/file edit occurred. A committed manifest checks 54 exact source/test/config/lock Git blobs. Runtime now uses the shared serializer. The obsolete `backend/src/proposal/canonical-evidence-schema.ts` still exists as another implementation; migrate remaining references and retire it explicitly.

| Actual validation | Result |
|---|---|
| Isolated Backend A `npm ci --ignore-scripts` | Success; 177 packages installed from its lock |
| Isolated Backend A strict typecheck / build | Both successful |
| Isolated Backend A `npm test` | **72 passed, 0 failed** |
| Backend B `circuits/` existing tests | **50 passed, 0 failed**, including actual R1CS/witness checks |
| Backend B final reconciliation suite | **29 passed, 0 failed**, nine fresh parity vectors plus focused security checks |
| Existing GigPassport lifecycle tests | **23 passed, 0 failed**; Ganache reported and used its JavaScript uWS fallback |

Tests named `KNOWN GAP` assert the observed unsafe upstream behavior. Passing those tests demonstrates a gap; it does not approve that behavior. An initial review test assumed directory version `999999` would throw. Actual execution disproved that assumption; the corrected test records its acceptance. A separate expired-consent case tests nonce consumption before downstream failure.

Backend B's exact pins remain Circom **2.2.3**, circomlib **2.0.5**, circomlibjs **0.1.7**, snarkjs **0.7.5**, TypeScript **5.9.3**, Node **24.19.0**, npm **11.17.0**. A's published lock resolves TypeScript 5.9.3, ethers 6.17.0, express 5.2.1, tsx 4.23.15, circomlibjs 0.1.7. No pins or contract logic changed. A's isolated install reports 15 advisory entries (12 low, 2 moderate, 1 high); this review does not remediate or assess their exploitability. Existing Backend B tooling advisories remain separately documented.

Reproduce on tested Windows x64 from `circuits/`, after the existing pinned compiler setup:

```powershell
npm run gate1:prepare
npm run gate1:final
npm test
```

The preparation command downloads the exact public revision, extracts only backend/shared-proposal into the ignored review directory, verifies all manifested blobs, installs A's lock, and runs its typecheck/build/72 tests. It changes no Git configuration or teammate checkout. The final command rebuilds B's circuits and tests the independently compiled A modules. Normal tests never rewrite fixtures. Explicit `gate1:final:record` writes only after both TS adapters and both compiled Circom profiles agree for every vector.

## Fresh authenticated source and real cross-language results

Regenerated from **327 actual synthetic Ramesh records in the latest Mock FIP storage**, with valid account-owner consent, a freshly signed real secp256k1 envelope, a trusted mock-IDP assertion and a real ephemeral EVM wallet signature. Keys, signatures and consent identifiers remain in memory. Source mutations are re-signed only with this ephemeral synthetic FIP authority before verification. Unsigned payload tampering, altered signatures and mismatched bank-owner identities reject.

Deterministic hash parameters: cutoff `1791460800` (2026-10-08 12:00 UTC), passport `101`, prior public holder parameter `0x111111cf1046e68e36e1aa2e0e07105eddd1f08e`, current published directory version **3**. The holder is a hash-fixture parameter, **not** mint authorization; service/HTTP tests use the actual ephemeral wallet. A separate historical directory-1 vector isolates the corrected digest from directory changes when comparing the old fixture.

Canonical output is **82,134 exact UTF-8 bytes**, no BOM/trailing newline. The saved bytes are explicitly public synthetic test data. Fields retained: normalized owner account/nullifier, cutoff/derived lower time bound, transaction ID/timestamp, safe integer paise, INR, credit/debit, rail, reference, remitter account/name/VPA. Consent ID, generatedAt, owner verifiedAt and envelope key/signature are excluded. Active normalizer/shared serializer bytes match.

```text
SHA-256: 432394cab6b2caa83ed0c69e975b5766cd08c7c1fa167e81a7a01faae65ab303
digest mod r: 8479584554115755712227973106457499606067708830244852437925920972305787106748
incomeRoot: 20119275159189889380691640169503521072267433455885550380794051959666890461667
weeklyRoot: 21852563639151117767628491974987827408917650138870771480290417841191760527724
monthlyRoot: 13559395075388244745760140214469017241871546221208979575604441749602464732002
commitment (directory 3): 10726476670528999076866107901464198313257170751774472100053243783233552060424
commitment (directory 1): 3434642233711873443323895407087161423409459365193261731849263244990213477830
```

Both independently implemented TS adapters and **both actually compiled Circom WASM circuits** reproduce all four outputs for nine vectors: latest, historical directory 1, authenticated amount/name/reference changes, each private-array change, and reversed income ordering. Changed witnesses reject against the original expected commitment. Reordered source transactions preserve canonical bytes and hashes; reordered private period arrays change the commitment. Incorrect padding changes roots; bad dimensions and activity bits reject. The original 50 tests preserve broader tag, metadata ordering, padding, field-alias and uint64/uint160 checks.

All three roots match the old fixture because recognized period arrays remain unchanged. With the same old holder and directory-1 parameters, the remitter-name-inclusive digest produces a **different final commitment**. A's parity test currently reproduces the old frozen fixture; add active authenticated regeneration and compare the new values. Full arrays, ten metadata slots and nine outputs: `circuits/fixtures/backend-a-e991-vectors.json`. Exact canonical bytes: sibling `backend-a-e991-canonical.synthetic.json`.

## Concrete corrections required from Backend A

| Confirmed finding | Actual evidence / required correction |
|---|---|
| **Nonadjacent duplicate IDs double-count** | `DUP`, `MIDDLE`, ` DUP ` at successive timestamps survive the adjacent-only check and all three payouts are included. Validate uniqueness with a set of normalized IDs before aggregation across all eligible timestamps. Reject duplicates rather than deduplicating arbitrarily; add whitespace/nonadjacent regressions. |
| **Normalization and classification diverge** | Whitespace changes to name/VPA/account/rail preserve the canonical digest but change recognized income. Classify and aggregate the same normalized authenticated representation used for hashing, or consistently reject noncanonical fields. Test each matching field and rail; preserve narration-alone exclusion. The final commitment binds the changed arrays; this is not a Poseidon collision. |
| **HTTP replay accepted** | Two identical strict attestation submissions and two identical strict reconstruction submissions each return 200; HTTP bypasses the orchestrator registry. Use one authorization boundary. Specify reconstruction retry/idempotency semantics, then enforce them consistently without permitting reuse for a new state-changing action. |
| **Restart/replica replay accepted** | One instance rejects signature/nonce reuse; another instance accepts the exact consumed request. Constructors allocate independent in-memory sets. Inject an atomic shared replay store with restart, expiry and idempotency rules; test concurrent instances. Persist minimal authorization metadata, never raw evidence. This is worker-action state, not a global consumed-Groth16-proof registry. |
| **Issuance action/domain unchecked** | Attestation accepts `RECONSTRUCT_EVIDENCE` with chain ID 1. Mint orchestration calls this method without another action check. Enforce allowed actions at issuance/refresh/reconstruction boundaries. Jointly define required application/chain/contract/request bindings; compare against the expected deployment domain. Nonce/chain remain optional and a legacy message fallback exists. Do not silently freeze a replacement signature format. |
| **Direct FIP authentication optional** | Omitted or partial authentication retrieves signed private rows through the service. Strict HTTP `/fip/data` does reject missing headers. Make direct retrieval/consent creation fail closed or isolate explicitly named internal/mock adapters that cannot become public entry points; add direct-method negatives. |
| **Unpublished directory accepted** | Attestation returns directory version `999999`. Validate membership in the published immutable registry, plus bounded integer request IDs/timestamps/cutoffs. |
| **Shared mappings accept malformed encodings** | A accepts one-byte digest `01` and a leading-space provider ID; B rejects both. Valid mappings match. Enforce agreed digest/address widths and provider grammar at every shared entry point; retire duplicated mapping/schema implementations. |
| **ASCII-order claim lacks enforcement** | Equal-time U+E000/U+10000 transaction IDs sort by UTF-16 differently from UTF-8 byte order. Agree enforced ASCII grammar or explicit Unicode normalization/UTF-8 comparison, then add cross-runtime cases. |

Nonce consumption precedes FIP/snapshot success: an expired consent burns the authorization, and retry fails on replay. Agree fresh-approval versus atomic reservation/result semantics. Registry sets also grow without expiry. The five-minute freshness window limits restart replay duration but cannot prevent replay inside it or across replicas. Repeated attestation alone has not been shown to bypass GigPassport's independent expected-ID/identity gates.

`attestAndMintOnChain` still explicitly constructs a **mock test commitment** from the full SHA-256 digest and passes it to the mint client. It is not the hierarchical Poseidon value. Confine this to a mock client and fail live submission until the approved adapter is integrated. This review submitted no on-chain commitment and implemented no financial consumer or fake proof.

## Monetary range, history and shared decisions

**LOCKED:** integer paise; 36 completed UTC income/month-activity periods and 156 completed ISO weeks, oldest first; binary flags; four-child domain-separated zero-padded trees; seven scalar fields plus three roots; FIP authenticity/valid consent/owner match; independent worker approval/policy/consumer gates.

**Verified implementation detail, not an approved financial constraint:** source amounts and monthly sums are limited to `0..9,007,199,254,740,991` paise (`MAX_SAFE_INTEGER`). BigInt addition prevents intermediate rounding; larger sums reject before conversion back to Number. The exact maximum passes both Circom profiles; maximum plus one fails A's boundary. A uint64 maximum BigInt also fails its serializer. This is safe for tested synthetic data but narrower than the proposed uint64 range; no LOCKED requirement approves either cap.

Choose one shared contract before approval: explicitly approve safe-integer number JSON, or retain proposed uint64 and use canonical decimal strings/BigInt end-to-end. Backend B recommends decimal strings if uint64 is retained; that recommendation is **PROPOSED**. Thirty-six maximum safe monthly values require 59 sum bits; 36 uint64 maxima require 70. Future comparisons must range-check sums and `N * threshold`, count zero months, and avoid field wraparound. Current circuits hash only, without income/history comparisons.

Completed periods pass: October 2023–September 2026; latest completed week ends Monday 2026-10-05. Current partial month/week are excluded. History start is the earliest recognized payout's UTC day, separate from arrays; a payout only in the current partial period gives zero completed activity but nonzero history start. **The completed-calendar-month tenure comparator remains unimplemented/unapproved.** Decide anniversary/start-month treatment, leap-day clamping, no-history sentinel and cutoff conversion; share exact boundary vectors. Do not substitute days/30 or claim persona benchmarks test this comparator.

Remaining joint approvals:

1. Versioned UTF-8/string grammar, duplicate rejection, timestamp widths and provenance coverage. Current `timeBounds.fromTimestamp` is the earliest included row (or zero), not signed consent/dataRange lower scope; explicitly define this meaning and check owner/account/scope consistency. Narration/IFSC are omitted; neither changes current financial recognition, but future matching criteria must bind every relevant authenticated field.
2. Tag integers, root/metadata order, provider prefix/grammar, digest reduction, holder/address representation, decimal witness encoding and widths. Real parity does **not** approve these constants.
3. Money representation/ranges and completed-month tenure arithmetic.
4. Immutable signed verifier-policy bytes/hash/domain, worker action/request/nonce/expiry, public-signal ordering/widths and current passport/version/commitment binding. Hash-only diagnostic roots are not a production public-signal manifest.

**Recommendation:** accept the provisional interoperability evidence. Request these Backend A corrections and independent regenerated-data tests on both sides, resolve the remaining decisions jointly, then approve one versioned format. Gate 1 is ready for reconciliation discussion, **not** a canonical format freeze, live attestation or proof-dependent financial integration. Passport behavior and locked documentation remain unchanged.
