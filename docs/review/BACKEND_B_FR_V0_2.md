# Backend B — approved Fr correction, v0.2

B's independent implementation is verified locally. A→B v0.2 integration remains
pending A's corrected published source; no real Aadhaar or production claim.

## Recovery audit and preservation

Started on `feature/blockchain-zk`, published HEAD
`f7d80c37b5af9b6907aeef7f566c95162dbb5ca9`. Audited all 14 existing tracked diffs:
six prior Codex reconciliation files plus eight partial Antigravity Fr/profile edits.
Preserved the untracked reconciliation/security reports and test. Unrelated pitch
document/PDF outputs remain untouched and outside this implementation commit.
An ignored recovery copy of initial tracked diffs, patch and reconciliation files
is `contracts/artifacts/recovery-v02-1791507899655/`.
No reset, clean, checkout, discard or A branch/source modification occurred.

Antigravity correctly changed the scalar modulus/profile, public client declaration,
session/deployment profile and circuit comment. Missing work was compiled adapter
rebuild, remaining demo profile, version binding, golden-vector regeneration and
boundary tests. The circuit change was only a profile comment; existing mathematical
constraints already use Fr through Circom's bn128 backend and were not redesigned.

The original v0.1 fixture files remain byte-for-byte equal to HEAD. Historical B
test-only adapters reproduce frozen v0.1 A interoperability/security findings;
active application/prover code never imports them. Their old Fq boundary is
explicitly unsafe and is not current acceptance evidence. The three upstream
security assertions and all A Git blobs are unchanged. Historical B5/B6 reports
are preserved; new v0.2 proof reports use separate names.

## Approved correction and implemented code

User approved Fr:
`21888242871839275222246405745257275088548364400416034343698204186575808495617`
and profile `gv-poseidon-hash-only-0.2.0`, then explicitly approved passport
`schemaVersion=2` with B prover/client rejecting schema 1.

- `shared/proposal/poseidon5.ts`, `field-mappings.ts`: all active scalar/Poseidon
  inputs strictly `[0,r)`; only named full SHA-256/provider digest mappings reduce
  modulo Fr. Canonical decimal/BigInt rules, uint160 addresses and malformed-input
  rejection preserved. Fq is exported only as a named diagnostic base modulus.
- Trusted prover/envelope and A translator reject old profile/schema and scalar
  aliases. Public proof packages declare commitment profile/schema 2. The public
  client rejects legacy bundles, profile packages and schema-1 passports before
  private reconstruction, using `EVIDENCE_SCHEMA_UNSUPPORTED` for the latter.
- Session/deployment/demo metadata and fresh mint/refresh/recovery use schema 2.
  Existing B4 request version, eligibility profile, exact signed policy/approval,
  all 29 public signals, predicate comparisons and Solidity consumer logic stay
  unchanged. Repayment/business state still follows stable identity.
- `provisional-v02-vectors.json`: 15 synthetic vectors recorded only after actual
  TypeScript/circomlibjs and compiled Circom parity. `fr-v02-mapping-vectors.json`:
  six exact digest-boundary mappings checked against both compiled hash profiles.
  Normal tests do not regenerate fixtures. `fr-v02.test.mjs` tests r−1, r, multiple
  points in `[r,q)`, q, named reductions, actual circomlibjs F.p and mapped golden
  outputs. Strict host validation rejects noncanonical integer encodings before
  WTNS generation; raw Circom field inputs inherently use modular arithmetic.
- Standard circuit scripts include the new checks. Historical v0.1 review suites
  explicitly import preserved test-only adapters; old vectors are not relabeled.

Fr/profile/schema declarations are version axes distinct from evidenceVersion,
which still increments per passport refresh. schemaVersion 2 is chain metadata,
not a newly added Poseidon preimage slot or public signal 30. This revision approves
only the requested correction/version binding; remaining review tags/order, policy
and private transport choices have not been silently frozen.

## Actual validation — 2026-10-09

| Command / scope | Final result |
|---|---|
| `circuits: npm test` — rebuild hash circuits, transpile verified historical sources, strict tsc, active/historical parity plus Fr tests | **64 passed**, 0 failed, 8.290s test runtime; 36 active and 28 historical cases |
| `circuits: npm run eligibility:test` — compile four existing predicate circuits, strict tsc, actual witness/R1CS checks | **22 passed**, 0 failed, 8.877s test runtime |
| `circuits: node --test test/final-gate1.test.mjs test/fr-v02.test.mjs` | **43 passed**, 0 failed, 25.994s; 29 historical cases and 14 active Fr cases |
| `contracts: node --test test/GigPassport.test.mjs test/authorization-v02.test.mjs test/policy-solidity-v02.test.mjs test/trusted-prover-b4.test.mjs test/local-deployment-b4.test.mjs` | Original **72 passed**, 0 failed, 71.133s; then expanded trusted-prover suite below |
| `contracts: node --test test/trusted-prover-b4.test.mjs` — final expanded suite | **42 passed**, 0 failed, 3.911s; replaces its original 38 cases, yielding **76 distinct current contract/interface cases** |
| `contracts: npm run integration:test` — independent v0.2 in-process session and persistent private IPC | **15 passed**, 0 failed, 250.497s; **8 actual Groth16 proofs** and local Solidity/token transactions |
| `contracts: npm run integration:types`, `npm run prover:types` | Both passed strict typechecks, exit 0 |
| `contracts: npm run integration:a:trust` — unchanged A c765b2d7 source/assertions | **7 passed, 3 failed**, 5.542s, exit 1; expected unresolved upstream invariants |

Deduplicated final B validation: **206 passing cases** (149 current B acceptance
cases plus 57 explicitly historical review cases), zero B failures. The 14 Fr
cases in the 43-case command also appear in `npm test` and are counted once.
Upstream trust is separate: 7 pass/3 fail, not an all-passing integration gate.

The independent session exercised proof generation, actual deployed Solidity
verification, welfare claim, 100 MockUSDC borrowing, exact repayment, replay,
genuine eligibility FAIL, stale evidence, refresh and stable-identity recovery.
Eight proof jobs and both sessions' shutdown cleanup are recorded in
`contracts/reports/v02-b5-integration.json`, `v02-b5-private-ipc.json` and
`fr-v02-validation.json`. No financial witness/plaintext snapshot/key logs exported.
Synthetic hash golden fixtures are explicitly public test inputs, not retained
worker evidence. Ganache uses its Windows/Node 24 JavaScript fallback. Existing
local transcript/library setup retained; only ephemeral funds/accounts, spend ₹0.
No public deployment or fresh official Aadhaar artifact verification.

## Remaining A dependency and precise handoff

PR #3 was read and still points to
`c765b2d7f014d702af3c8ee0d0e391055e05d840`, draft/unmerged. Its staging-root
promotion, misleading VERIFIED status and evidence Fq boundary still fail the
unchanged ten-check trust suite. Current A also hardcodes `schemaVersion:1` in
`backend/src/evidence/attestation-service.ts` mint/refresh/reissue calls.

A must publish its corrected `real-verifier.ts`, shared Fr mappings/profile and
schema-2 evidence submissions. Do not override schema in B's passport shim,
patch cached A code, reduce/relabel old commitments or replace A financial arrays.
When the new commit exists: verify/fetch exact Git blobs, update B's pin/source
manifest and cache, rerun all ten trust checks, then B6's unchanged real-flow tests
using newly reconstructed v0.2 A evidence. Any newly changed envelope/interface
must be reconciled explicitly before adapting.

Old v0.1 passports/proofs remain historical. Reconstruction under v0.2 can change
provider/dataset scalars and the commitment, requiring an actual attester refresh
or fresh local deployment/mint, current evidenceVersion and new worker approval.
Current B tooling refuses old schema/profile; existing historical contract
deployments are not retroactively upgraded by editing a JavaScript profile label.
The isolated Groth16 verifier verifies field math, not a human profile string.

Publication is a **B-only independently tested checkpoint**. It includes the
preserved reconciliation and failing upstream regression evidence transparently;
it does not claim the entire A→B v0.2 acceptance gate passed. Keep Draft PR #2
unmerged. Remaining A work is a source-publication/integration dependency, not a
reason to redo B's completed predicates/contracts.
