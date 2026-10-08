# Backend B B4 — Backend A compatibility review

Status: local testing only; no shared protocol freeze or live Backend A integration.

Reviewed Backend A: `Manas150706/HACKBUDS`, `feature/evidence`, commit
`4e456d5e3c3bb1c717bea4816612898ebd64eb09`. Read through Git objects; no checkout,
branch changes or edits to Backend A. Backend B starting checkpoint:
`a66dddfd90cc20a33be63a71b651e99af6846737`.

Sources inspected: `docs/BACKEND_A_INTEGRATION_CONTRACT.md`,
`backend/src/evidence/{snapshot-builder,poseidon-adapter,commitment-adapter,prover-boundary,passport-client,attestation-service}.ts`,
`shared/proposal/{poseidon5,field-mappings,canonical-evidence-schema}.ts`.
Locked decisions take precedence over statements marked “Frozen” in A's adapter document.

| Boundary | Published A runtime | B4 local interface | Compatibility / required action |
|---|---|---|---|
| Snapshot fields | Seven scalars, income[36], weeks[156], months[36]; commitment output | Same ten-field preimage; decimal strings / bigint internally; output commitment excluded | Compatible provisional preimage. Translation validates both A representations, then recomputes commitment. |
| Holder | Lowercase EVM address; circuit handoff has `holderAddressScalar` | `holderBinding` is unsigned uint160 decimal | Exact byte-to-integer rename; no hash/reduction. Current holder independently read on-chain. |
| Provider | ASCII identifier, `providerIdScalar` | `evidenceProviderId` scalar | Same provisional SHA-256 of UTF-8 `GIGVAULT_PROVIDER_ID_V1\|<id>`, big-endian modulo BN254 r. Not a newly approved provider encoding. |
| Dataset digest | SHA-256 hex, `evidenceDataHashScalar` | `evidenceDataHash` scalar | Same exact 32-byte big-endian digest modulo r. B does not regenerate source transactions or canonical serialization. |
| History date | Runtime and shared proposal: UTC epoch **days**; handoff `verifiedHistoryStartDateDays` copies days | `verifiedHistoryStartDate` days; uint22, 0 = absent | Runtime compatible. A document incorrectly says seconds and lookback start. **D1:** correct documentation to locked units/recognized-history meaning; never divide a committed seconds value silently. |
| Cutoff | `evidenceUpdatedAt` / handoff `evidenceUpdatedAtSeconds` are UTC seconds | Exact UTC seconds, uint40; Gregorian witness domain 1970–9999 | Rename only. No conversion or changing bucket cutoff. Circuit checks calendar arithmetic; timestamp/freshness read on-chain. |
| Money | Snapshot safe integer JS numbers; witness exact decimal paise strings | Per-month unsigned uint64; comparisons constrain sums/products, never INR floats | A range is a subset of B. Translation rejects unsafe/negative numbers; never rounds. Large values above JS safe range need an explicitly agreed A representation, not conversion through Number. |
| Activity | Binary flags, oldest to newest, 156 completed ISO weeks / 36 completed UTC months | Same lengths, binary flags and order | Compatible. No sorting, shifting, inclusion of partial periods or reaggregation by B. |
| Poseidon | H5(tag,c0,c1,c2,c3), four-child hierarchical trees, zero padding | Existing pinned Circom/circomlib/circomlibjs; same provisional hash profile | Tags/order/mappings match published code. Differences in module loading/build dependency injection do not change hash arithmetic. **D2:** joint cryptographic approval still required before public-network/live rollout. |
| Hash tags | Income 1100/1101/1102; weeks 1200/1201/1202/1203; months 1300/1301/1302; metadata 1400/1499 | Identical | REVIEW constants, not locked merely because tested. |
| Metadata order | id, holder, provider, dataset hash, history days, cutoff seconds, directory version, income root, weekly root, monthly root | Identical; metadata 10→3→1, zero-padded groups | A's document's conceptual direct “Poseidon10” notation is misleading; actual runtime tree matches B. Do not replace it with direct Poseidon(10). |
| Scalar field | r = 21888242871839275222246405745257275088696311157297823662689037894645226208583 | Same BN254 scalar field | Only named digest/provider mappings reduce; witness scalars themselves must be canonical and below r. |
| Snapshot metadata/version | A payload has `createdAt`, directory version and snapshot but no explicit eligibility profile/schema version/current evidence version | Envelope explicitly carries `gv-local-prover-b4/1`, commitment profile, eligibility profile, schemaVersion=1, current evidenceVersion | **D3:** versioned private handoff envelope must be agreed. Adapter takes trusted current schema/version separately; cannot infer them from a payload's clock. Directory version checked against current issuance/refresh event. |
| Signed policy | Current private handoff carries no verifier EIP-712 policy | Exact `VerificationPolicy` type; all criteria/windows, signer, request, expiry and freshness bound | **D4:** A caller must supply a separate verifier-signed policy and matching worker approval. Existing reconstruction authorization is insufficient. No policy synthesized from arrays. Unknown extra policy conditions rejected. |
| Worker approval | `RECONSTRUCT_EVIDENCE` wallet authorization permits authenticated reconstruction | EIP-712 `WorkerApproval` signs requestId, passportId, evidenceVersion, evidenceCommitment, policyHash, verifierId, expiresAt, domainHash | Both boundaries required. Reconstruction approval cannot authorize Verify/Claim/Borrow. **D4** includes exact encoding, domain and limb sign-off. |
| EIP-712 domain | No consumer domain in published prover payload | name `GigVaultEligibility`, version `0.2-provisional`, local chainId 1337, exact consumer address | Separate policies/signatures per consumer; cross-chain/domain substitution rejects. Shared review pending; no rollout promise. |
| Public signals | A mock outputs 4: id, holder, commitment, directory version; doc lists an incomplete verifier view | Actual combined circuit has 29 public values; directory version remains committed/private, not an extra output | **D5:** use B's complete ordered manifest for real proofs; A's mock output cannot be translated into a proof or accepted by Solidity. |
| Passport client | Friendly number/status wrapper; live class currently throws “connection pending” | Actual deployed Solidity ABI: nextPassportId, activePassportByIdentity, getPassport, reissueAllowed, mint/refresh/revoke/authorizeReissue | Wrapper naming, bigint/safe number and enum ACTIVE=0/REVOKED=1 conversions are routine adapters. Missing passport read reverts; wrapper may explicitly map this one error to null. Transport failures must still throw. |
| Refresh semantics | Runtime rejects regressed timestamp; changed commitment required; equal timestamp accepted | Same nondecreasing timestamp + changed commitment, internal version increment | Compatible runtime. A document says strictly advancing timestamp: **D6** documentation correction under locked rules, not a new protocol choice. |
| Roles/lifecycle | Separate administrator/attester, expected-ID issuance and identity recovery APIs | Same; sequential atomic mint, ACTIVE identity uniqueness, lifetime claims/debt survive reissue | ABI/roles validated locally. Never replace addresses with client-provided role claims. Public directory metadata lives in lifecycle events, not current passport tuple. |
| Private transport | A live adapter calls fetch(`/prove`) without implementation of mutual TLS or a signed-policy envelope; defaults to explicitly simulated mock | B4 in-process capability + private parent/child IPC; no HTTP proof route | **D7:** live process-to-process transport/authentication requires agreement and implementation. B does not expose an unauthenticated HTTP bridge to satisfy this placeholder. Connect A only behind the authenticated reconstruction capability. |

## Exact B public-signal order (zero-based)

0 incomePass; 1 historyPass; 2 activityPass; 3 authorizationBinding;
4 expectedCommitment; 5 passportId; 6 holderBinding; 7 evidenceUpdatedAt;
8 evidenceVersion; 9 verifierId; 10 chainId; 11 consumer;
12 requestHi; 13 requestLo; 14 policyHi; 15 policyLo; 16 domainHi; 17 domainLo;
18 expiresAt; 19 maxEvidenceAgeDays; 20 incomeEnabled; 21 incomeWindowMonths;
22 minAverageIncomePaise; 23 activityEnabled; 24 activityIsWeekly; 25 activityWindow;
26 minActivePeriods; 27 historyEnabled; 28 minHistoryMonths.

High/low limbs preserve complete bytes32 hashes as uint128 halves (not mod-r signed IDs).
Solidity G2 coordinates reverse each of snarkjs `pi_b`'s first two rows; a/c use first two coordinates.
The adapter returns this exact ordering and conversion; the consumer independently checks it.

## What B4 implements without a shared decision

`circuits/service/backend-a-v1.mjs` translates field names and exact safe integers only.
It cross-checks snapshot, circuitInputs and expectedPublicSignals against a freshly recomputed
provisional commitment, rejects seconds masquerading as days, and returns a transient private
envelope for B's authorized resolver. It does not copy A's evidence pipeline or add an HTTP route.

This translation is tested with synthetic A-shaped payloads. It is **not a claim that A's running
service has been connected**. A's FIP signatures, current consent, identity assertion, authenticated
owner matching and curated payout recognition remain prerequisites owned by A. B's local attester
uses an explicitly synthetic commitment; it does not independently establish bank provenance.

D1/D6 are documentation conflicts with already locked behavior. D2–D5/D7 require shared
review before live integration/public anchoring. No shared file or locked specification is changed
by this milestone. These choices do not block the independent B4 local fixture demonstration.
