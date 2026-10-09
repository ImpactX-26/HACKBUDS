# B6 compatibility reconciliation — 2026-10-09

Historical v0.1 reconciliation. B's subsequent approved Fr correction and scoped
independent validation are in `BACKEND_B_FR_V0_2.md`. A c765b2d7's three failures
remain; its source/assertions have not been patched. Original publication decision
below describes this earlier reconciliation, not the later authorized B-only work.

**Security reconciliation is blocked; do not freeze or publish a passing checkpoint.**
The financial runtime is unchanged between A's two revisions. The new real-Aadhaar
guards improve defaults but two configuration/status invariants fail. A separate,
pre-existing shared field-modulus error also requires joint correction. Successful
synthetic proofs cannot establish correctness of those untested domains.

Compared `Manas150706/HACKBUDS`:
`d71c66f88ce8bc6d43c739be41a29b5077e66b22` →
`c765b2d7f014d702af3c8ee0d0e391055e05d840`.
B's published starting checkpoint remains
`f7d80c37b5af9b6907aeef7f566c95162dbb5ca9` on `feature/blockchain-zk`.
Neither A's branch nor its source, shared files, references, circuits, contracts or
frontend was edited. PR #2 and PR #3 were both observed draft and unmerged.

## What changed upstream

Only six files differ: `backend/src/identity/aadhaar/{real-verifier,types}.ts`,
`backend/src/http/onboarding-app.ts`, `backend/src/demo/onboarding-demo.ts`,
`backend/test/onboarding-lifecycle.test.ts`, `docs/ONBOARDING_INTEGRATION_SPEC.md`.
There are no changes to financial normalization, consent/FIP authentication,
reconstruction, Mock IDP, onboarding registry/attestation bridge, commitment code,
passport client or private witness interface.

Real verifier now defaults staging keys off, rejects wallet-only binding, supports
session/wallet/challenge signals, checks five Aadhaar signal duplicates/order,
extracts output from the verified vector and reports a configuration status.
HTTP now maps signal inconsistency to 403; docs/demo/tests describe these changes.
The five Aadhaar signals are a different circuit from B's 29 eligibility signals.
A's stated 147 upstream tests are not an independently executed result here.

## B-owned changes

- `contracts/integration/backend-a-source.mjs`: latest exact pin; ignored cache
  with 36 SHA-verified Git blobs (previous financial 32 plus four identity guard
  modules), dependency junctions including existing snarkjs 0.7.5. Type-only
  import elision follows A's tsconfig; no financial/crypto source patching.
- `contracts/test/backend-a-b6.test.mjs`: asserts latest pin and source count;
  all ten original real integration tests preserved.
- `contracts/test/backend-a-trust-reconciliation.test.mjs`: executes A's actual
  mode/bridge/pre-proof guards and deliberately failing security invariants.
  `integration:a:trust` runs it; it is not a mock successful Aadhaar verifier.
- Integration instructions and public reports record current source and findings.
  No plaintext snapshot, financial arrays, signing keys or witness files retained.

## Exact blockers and minimal fixes

| Boundary | Reproduction / result | Owner and minimal fix |
|---|---|---|
| Staging root promoted to production | `new RealAnonAadhaarVerifier({trustedPubkeyHashes:[ANON_AADHAAR_TEST_PUBKEY_HASH],allowTestKeys:false}).isTrustedPubkeyHash(TEST)` returns **true**. Constructor copies all configured roots into production; `addTrustedPubkeyHash(hash)` has the same default promotion path. | **A**, `backend/src/identity/aadhaar/real-verifier.ts`, constructor/addTrustedPubkeyHash/isTrustedPubkeyHash. Classify known staging hashes independently of caller allowlist. Reject production promotion; require explicit staging opt-in even when configured in another set. Test constructor and setter paths. |
| Configuration advertised as genuine verification | With that staging-only allowlist and `verificationKey:{}`, `getVerificationStatus()` returns **VERIFIED**. It checks only object truthiness and nonempty production set. A mixed production/staging instance also returns its global status for a staging proof. | **A**, same file, getVerificationStatus and verify result classification. Require explicitly pinned/validated official artifacts and production roots for genuine readiness; staging proofs must remain marked staging/NOT_YET_VERIFIED regardless of other configured roots. A status getter is not evidence of a successful proof. |
| Evidence scalar boundary uses base modulus | Both existing evidence adapters define `FIELD=q=21888242871839275222246405745257275088696311157297823662689037894645226208583`; Groth16/Poseidon use `r=21888242871839275222246405745257275088548364400416034343698204186575808495617`. A's new Aadhaar types correctly use r. | **A+B jointly**, `shared/proposal/poseidon5.ts`, `field-mappings.ts`, compiled B adapter boundary and shared review documentation. Approve strict `[0,r)` validation and named digest reduction modulo r, then regenerate mappings/parity vectors with a versioned compatibility/migration decision. The review's q-labelled-as-r text must be corrected. Do not silently change existing committed values. |

The first two findings are configuration bypass/misclassification, not proof forgery:
no genuine Aadhaar proof, official artifact or real identity was supplied. Default
staging rejection, missing-vkey failure, Mock/real mode isolation, malformed-vector
rejection and refusal to bridge real identities to synthetic bank personas pass.
The modulus problem predates c765b2d7 and is shared by both financial adapters;
equality between them does not make the boundary correct. It can admit noncanonical
values in `[r,q)`, and changing digest reduction changes committed meaning.

## Shared decision matrix

L = locked semantics/documentation correction; P = compatible local proposal,
joint approval pending; X = incompatible security/interface boundary requiring code.
Recommendations below are proposals to the owners, not a protocol freeze.

| Item | Class | Observed compatibility / exact recommended decision |
|---|---|---|
| History start | L; calendar arithmetic P | Preserve **UTC epoch days**, earliest authenticated recognized payout, zero=no history. Cutoff remains epoch seconds. Correct A adapter docs saying seconds/lookback start; never divide a committed value. Approve existing calendar-month predicate with its boundary vectors separately; no days/30 approximation. |
| Equal-cutoff refresh | L | A runtime and B contract permit nondecreasing cutoff plus changed commitment and internal version increment. Correct strict-increase documentation; preserve equal-cutoff refresh. |
| Snapshot/buckets | L | Same seven metadata scalars; income[36], weeks[156], months[36], oldest first, completed UTC months/ISO weeks, flags 0/1, integer paise. Commitment output excluded from preimage; directory read from current lifecycle event. |
| Poseidon tags/order | P | Keep candidate H5(tag,c0,c1,c2,c3), four-child zero padding. Income 1100/1101/1102; weeks 1200/1201/1202/1203; months 1300/1301/1302; metadata 1400/1499. Metadata order: passportId, holder, provider, dataset hash, history days, cutoff seconds, directory version, income root, weekly root, monthly root; 10→3→1. Approve one manifest only after scalar correction/parity. |
| Field mappings | X then P | Holder is exact uint160. Provider is SHA-256 UTF-8 `GIGVAULT_PROVIDER_ID_V1\|<id>`; dataset is exact 32-byte SHA-256; big-endian digest reduction must use **r above**, not current q. On-chain padded ASCII provider reference is a different ABI value. Approve corrected version and migration; do not reinterpret old commitments. |
| Monetary domain | P; full-range mismatch X | Current A numbers/sums are exact `0..9007199254740991` paise; decimal witness strings fit B uint64. Local subset compatible. Recommend formalize current safe-integer A transport as a restricted profile and preserve B uint64 constraint. Full uint64 A support requires A-owned decimal strings/BigInt end-to-end and a new approved envelope; no rounding through Number. |
| EIP-712 policy | P | Approve exact `VerificationPolicy` in `contracts/proposal/authorization-v02.mjs`: bytes32 requestId, address verifierId, nine uint256 criterion fields, maxEvidenceAgeDays and expiresAt. Disabled criteria zeroed. Domain GigVaultEligibility / 0.2-provisional / exact chain / exact consumer. Each consumer independently enforces its exact locked policy and signer. |
| Worker approval | L + encoding P | Explicit approval remains mandatory; approve exact eight-field WorkerApproval type in that module. Full request/policy/domain hashes split high/low uint128, never reduced. A's signed RECONSTRUCT_EVIDENCE action is additional private-access authorization, not this policy approval. |
| Public signals | P; mock mismatch X | Approve all **29** ordered values listed below and existing Solidity G2 conversion. A's four-value mock response cannot be padded/translated into a real proof. Directory remains committed/private, not signal 30. Aadhaar's five signals never enter this verifier. |
| Evidence envelope/version | P; direct handoff X | A payload has snapshot/circuitInputs/expectedPublicSignals/createdAt, no B protocol/profile/schema/current-version envelope or signed policy. Existing B translator checks both A representations and wraps trusted current chain schemaVersion=1/evidenceVersion with gv-local-prover-b4/1, gv-eligibility-0.2-provisional and gv-poseidon-hash-only-0.1.0. Approve a revised envelope jointly after mapping correction; never infer version from createdAt. |
| Private transport | L privacy; live interface X | Local one-use in-process callback/private IPC works with B preflight before private access and A consent/IDP/wallet/FIP-owner checks during reconstruction. A LiveProverServiceAdapter fetch(`/prove`) carries no implemented client authentication or signed-policy envelope; documentation mentioning mTLS is insufficient. A+B must agree/version authenticated service identity plus approved-request context or use the existing trusted callback. No public unauthenticated endpoint. |
| Passport ABI/lifecycle | L; adapter compatible | Existing injected B transport calls actual role-separated contracts; exact safe number conversions, missing-passport-only null, atomic expected IDs. A's standalone LiveGigPassportContractClient still throws connection pending; **A** can inject the tested transport/configured signer rather than redesign contracts. |
| Identity trust | L separation; real readiness X | Use explicit SYNTHETIC_MOCK_IDP for local fixtures. Real identities must not be mapped to Ramesh or issued Mock IDP authority. Keep OnboardingAttestationAdapter's rejection until authenticated real FIP ownership bridge exists. Fix A's root/status gaps above; official artifact pinning and genuine proof validation are still absent here. |

Public signal order, zero-based:

```text
0 incomePass; 1 historyPass; 2 activityPass; 3 authorizationBinding;
4 expectedCommitment; 5 passportId; 6 holderBinding; 7 evidenceUpdatedAt;
8 evidenceVersion; 9 verifierId; 10 chainId; 11 consumer;
12 requestHi; 13 requestLo; 14 policyHi; 15 policyLo; 16 domainHi; 17 domainLo;
18 expiresAt; 19 maxEvidenceAgeDays; 20 incomeEnabled; 21 incomeWindowMonths;
22 minAverageIncomePaise; 23 activityEnabled; 24 activityIsWeekly; 25 activityWindow;
26 minActivePeriods; 27 historyEnabled; 28 minHistoryMonths.
```

## Validation and publication

`npm run integration:a:test`: **10/10 passed**, zero failed/skipped/cancelled,
166.896 seconds (report scope 165.533 seconds). **Two actual Groth16 proofs** from
fresh A-authenticated reconstruction accepted by deployed Solidity; six successful
transactions: mint, refresh, welfare claim, 100 MockUSDC borrowing, exact repayment
allowance and repayment. Final welfare claimed, debt zero, cleanup asserted.
Proof workers took 20.384 and 19.252 seconds, maximum RSS about 393–395 MiB each,
excluding parent/compiler/EVM and other overlapping tests.

Existing regression command from `contracts`:
`node --test test/GigPassport.test.mjs test/authorization-v02.test.mjs test/policy-solidity-v02.test.mjs test/trusted-prover-b4.test.mjs test/local-deployment-b4.test.mjs`:
**72/72 passed**, zero failed/skipped/cancelled, 86.667 seconds.

`npm run integration:test`: unchanged B5 session and private IPC regressions
**14/14 passed**, zero failed/skipped/cancelled, 248.731 seconds, **eight actual
Groth16 proofs** and local consumer transactions. Lifetime welfare/debt state across
reissue, exact repayment, authorization/replay and shutdown cleanup passed.
Historical B5 reports were restored after copying this run's metrics into
`contracts/reports/b6-reconciliation.json`.

Trust suite: **7 pass, 3 fail**, no skipped/cancelled, 3.879 seconds, exit 1.
Failures are the two A root/status invariants and shared scalar modulus; zero real
Aadhaar proofs were generated. Both strict consumer typechecks passed.
Commands: `node --test test/backend-a-trust-reconciliation.test.mjs`,
`npm run integration:types`, `npm run prover:types` from `contracts`.

Final total: **103 passing, 3 failing Node cases**, **10 actual eligibility proofs**,
two successful strict typechecks. Do not report this as an all-passing security gate.
Public detailed evidence: `contracts/reports/b6-backend-a-local.json`,
`b6-trust-reconciliation.json`, and combined `b6-reconciliation.json`.

Verified source preparation called `prepareBackendASource()` using already fetched
exact Git objects, rather than its CLI's second network fetch. Windows dependency
junction creation needed authorized filesystem access. Current source manifest is
in the ignored commit-specific cache and the public `b6-backend-a-local.json` report.

The first restricted-sandbox EVM attempts were interrupted after stalling; their
counts are not accepted results. Final EVM runs use authorized local networking.
Windows/Node 24 Ganache uses its existing JavaScript fallback. No circuit rebuild
or full upstream A onboarding suite is claimed. Existing circuit results remain
historical. Local funds, ephemeral development identities/accounts only; spend ₹0.

Because security reconciliation is incompatible, leave B-owned pin/tests/reports
reviewable locally; no commit/push or PR metadata update, no new implementation
cycle. Existing draft PRs remain unchanged. Next corrections belong to A's verifier
and a narrowly coordinated shared field/mapping revision, not new circuits/contracts.
