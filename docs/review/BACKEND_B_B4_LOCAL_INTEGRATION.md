# Backend B B4 — local integration acceptance report

Verified on 9 October 2026, Windows / Node 24.19 / npm 11.17. Starting published
checkpoint `a66dddfd90cc20a33be63a71b651e99af6846737` was confirmed on
`feature/blockchain-zk` before editing. Existing predicates, passport and consumers
were reused; their Solidity/Circom behavior was not rewritten.

**Outcome: Backend B is integration-ready for independent synthetic local testing.**
An authenticated-reconstruction capability interface, actual Groth16 engine,
consistent local deployment, real welfare/MockUSDC execution, recovery/replay
demonstrations, public deployment evidence and Backend A compatibility review exist.
No production readiness, live Backend A connection or public-network setup is claimed.

## Implemented files

- `circuits/service/trusted-prover.mjs` and `.d.mts`: typed versioned callable
  adapter; trusted chain reads, exact policy and both signatures before private access;
  strict witness bounds/metadata/commitment; public-only response; reauthorization after proving.
- `circuits/service/{engine,proof-worker}.mjs`: isolated real snarkjs engine using
  existing compiled WASM, in-memory WTNS, setup fingerprints, one job at a time,
  redacted errors, failure/timeout process cleanup. No private witness files.
- `circuits/service/backend-a-v1.mjs`: exact field/unit-preserving translation of
  published A-shaped witnesses; duplicate representations and commitment cross-checks.
- `contracts/local/{setup,compile,deploy,start,demo}.mjs` and `README.md`: reusable
  local setup/deployment, six real contracts, funded test asset, runtime manifest,
  foreground local RPC and complete real integration demonstration.
- `contracts/test/{trusted-prover-b4,local-deployment-b4}.test.mjs`,
  `trusted-prover-types.mts`: security/interface, artifact cleanup and deployment checks.
- `contracts/package.json`: callable commands. Existing lockfiles unchanged.
- `contracts/proposal/authorization-v02.mjs`: exports the already used typed encoder
  for the service; authorization behavior unchanged.
- `contracts/test/eligibility-integration.mjs`: uses the extracted shared compiler;
  existing consumer regression harness retained.
- `contracts/reports/b4-local-demo.json` and `b4-abis/*.abi.json`: public actual
  deployment, receipt/status/timing evidence and usable ABI references.
- `circuits/reports/eligibility-v02-local.json`: refreshed actual legacy proof metrics.
- This report and `BACKEND_B_B4_BACKEND_A_COMPATIBILITY.md`.

No Backend A branch/source, frontend, shared proposal codec or locked reference was
edited. Preexisting pitch/output files were excluded. No credentials, private keys,
real identities, worker account data or private financial witness were committed.

## Actual commands and results

All listed commands completed with exit code 0 in this session. Directories are
relative to the repository root. Counts describe separate suites/harnesses and do
not turn known-gap assertions into live-source security acceptance.

| Working directory | Command | Actual result |
|---|---|---|
| circuits | `npm run eligibility:test` | Pinned Circom 2.2.3 O1 compilation of four predicates/combined circuits; strict TS build; 22 witness/R1CS tests passed, 0 failed. |
| circuits | `npm test` | Hash/bounded/H5 compilation, strict TS build; 50 interoperability/legacy review tests passed, 0 failed. |
| circuits | `npm run gate1:final` | Existing frozen final Gate 1 suite: 29 passed, 0 failed; includes unsigned FIP tampering/owner mismatch. Known-gap tests document old frozen source behavior, not approval of A's current branch. |
| circuits | `npm run proof:smoke` | One actual H5 Groth16 proof verified; altered public hash rejected. Disposable setup removed. |
| circuits | `npm run predicates:proof` | Two actual standalone income/activity proofs (PASS and honest FAIL) verified; result-bit and threshold substitution rejected for both. Disposable setup removed. |
| circuits | `$env:GIGVAULT_TEST_PTAU=(Resolve-Path '.tools/powersOfTau28_hez_final_17.ptau').Path; npm run eligibility:proof` | 14 actual combined Groth16 proofs generated/verified, including income/history/activity FAIL; 19 altered public-signal cases rejected; existing generated-verifier consumer harness: 56 checks passed. |
| contracts | `npm test` | 23 existing passport local Solidity/EVM tests passed, 0 failed. |
| contracts | `npm run auth:test` | 9 EIP-712 authorization/reconstruction/Solidity hash-parity tests passed, 0 failed; rerun after encoder export also passed. |
| contracts | `npm run prover:types` | Strict declaration-consumer typecheck passed, including no private snapshot in typed result. |
| contracts | `npm run prover:test` | Final 38 secured-interface, translation, error-redaction, concurrency, timeout and file-cleanup tests passed, 0 failed. |
| contracts | `npm run deployment:test` | 2 actual deployment/setup-failure tests passed, 0 failed: live bytecode, six ABIs, setup digests, chain/domain/verifier/roles/liquidity and cleanup. |
| contracts | `npm run local:demo` | Final 55 checks passed; 6 actual trusted-service Groth16 proofs accepted by deployed Solidity; 31 recorded EVM transactions (7 deploy/fund, 14 successful flow actions, 10 mined reverted negatives). |
| repository | `git diff --check` | Passed. Scoped private-key/token literal scan found no matches; synthetic in-memory account code is intentionally present. |

The Node test suites above contain 173 passing test cases. Proof harnesses and
integration checks are separately reported; the 23 proof generations across the four
listed harnesses are actual proofs, not 23 extra unit tests. Earlier successful
reruns are not added repeatedly to counts. B4's final demonstration is reproducible
from the local README and uses the final adapter. No mocked Groth16 verifier is used.

## Final demonstration evidence

Same synthetic worker/identity: mint correct commitment → exact signed welfare and
lending policies → worker approvals → private resolver → real WASM/Groth16 proofs →
actual generated Solidity verifier. Separate Verify calls return PASS; claim records
lifetime identity state/event; borrowing transfers exactly 100 MockUSDC. Approval and
exact repayment clear debt. Reusing the spent request after repayment reverts.

Modified public results fail actual math verification and a mined consumer transaction.
Unauthorized caller, duplicate active loan, repeat welfare claim, refreshed evidence,
insufficient activity and recovery-related identity duplicates also produce mined
reverted transactions. Malformed/forged authorization, expired request, unknown protocol
and incorrect policy are rejected by the service before evidence access; the dedicated
interface suite additionally uses a cryptographically valid signature from the wrong
holder. The previous combined consumer suite covers forged signer/approval, wrong
request/domain/consumer, weaker signed PASS policy, stale/revoked evidence, exact
one-paise income deficit, short history and partial repayment.

An eligible fresh request reborrows after repayment; admin revokes and authorizes
reissue for the same identity/new holder. Real replacement proofs cannot reset lifetime
welfare or outstanding debt. A second ACTIVE identity mint reverts. Replacement
repayment clears inherited debt; final debt is zero.

`b4-local-demo.json` retains actual addresses, manifest profiles/setup digests, public
ABIs, transaction hashes/statuses and all check names. The chain is stopped and its
session directory removal is asserted. These hashes belong to the ephemeral local
chain; they have no public explorer confirmation. No private snapshot, arrays, WTNS,
source bank transactions or private account keys are in the report.

## Measured performance and setup limits

Final B4 session elapsed **162.003 seconds** including disposable setup, Solidity
compilation, six deployments/funding, six isolated proving jobs and all demonstration
transactions/checks. Individual service proving+verification child jobs took
**12.805–18.256 seconds**. OS-reported maximum child RSS ranged **380.254–415.387 MiB**;
these measurements describe the isolated child, not total parent+child peak. Parent
RSS is separately recorded in JSON. Concurrent regression activity may affect timing.

The existing faster multithread CLI proof regression sampled maximum child working
set about **1,410.7 MiB** in this run (sampled, not guaranteed peak). The combined
setup took 22.85 seconds and local contribution 9.78 seconds using the hash-verified
prepared public transcript. Circuit profile remains O1: 80,274 constraints,
79,776 wires, 29 public signals; R1CS/WASM sizes are recorded in the legacy report.
No O2 profile or browser/client-device proof performance claim is introduced.

Fresh setup requires free public transcript/dependency downloads and several GB of
available memory/disk. The README records transcript URL/digest and reproducible
commands. Ganache uses its real JavaScript µWS fallback on this Windows/Node build.
All keys/accounts are disposable local development material. The single-party phase2
setup is deliberately not production approved. Welfare uses the existing explicit
event/state benefit fallback; no POL payout is claimed. No public-network transactions,
paid RPC, paid SMS, paid identity service or real funds were used.

## Unresolved boundaries / decisions

No unresolved issue blocks independent B4 synthetic local testing. Live A integration
and public anchoring remain gated by the compatibility review: joint approval of
provisional tags/metadata/mappings/history predicate and monetary domains, EIP-712
types/domain/full public manifest, explicit versioned private handoff and authenticated
transport, intended signer provisioning, deployable verifier/ceremony. A's published
document has epoch-unit/refresh conflicts with its runtime and the locked decisions;
these are explicitly identified, never silently adopted. B4 does not establish FIP
provenance from a synthetic fixture; A retains authentication, consent/owner binding,
source data and curated originator recognition responsibility.

PR #2 must remain draft and unmerged. This milestone makes its existing implementation
callable and reproducible locally without waiting for A's hybrid onboarding work.
