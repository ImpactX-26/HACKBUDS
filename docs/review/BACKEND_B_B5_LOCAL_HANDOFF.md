# Backend B B5 — persistent local backend handoff

Status: integration-ready for independent **synthetic local testing**. Backend A is
not connected. This package preserves the B4 contracts, circuits, real prover and
provisional protocol; no shared format is newly approved. Additional spend: ₹0.

## Call immediately

From `contracts`, run `npm run local:start` after the existing B4 prerequisites in
`contracts/local/README.md`. The foreground process deploys six contracts, seeds
passport 1 with its correct synthetic evidence commitment, funds lending and gives
the synthetic worker 100 MockUSDC. It stays alive until shutdown. The ready line
identifies the loopback RPC and live `integration-bundle.json`. Each restart creates
new addresses/accounts/setup; historical test bundles are not live deployments.

The frontend owner can import `contracts/integration/client.mjs` with the public
bundle, ethers provider and caller wallet. Callable methods cover passport/identity
reads, public approval typed data, explicit worker approval, verification, welfare
claim, borrowing, token allowance and exact repayment. No UI was implemented.
Verification returns per-condition PASS/FAIL; it does not execute Claim/Borrow.
The public client cannot prove without a backend-owned private capability.

Backend callers can use `contracts/integration/process-client.mjs` to start and own
the seeded host over private parent/child IPC. Its explicit synthetic policy and
approval helpers enable immediate end-to-end local tests. The foreground host also
accepts one JSON command per stdin line. There is no unauthenticated web prover or
worker-signing endpoint. The bundle includes inline ABIs, addresses, setup IDs,
existing profiles, EIP-712 types and the exact 29-public-signal ordering.

Backend A connects via `session.createClient({reconstruct: authenticatedCallback})`.
The callback resolves an opaque handle, revalidates current consent/FIP signature/
owner/source eligibility and reconstructs the fixed committed snapshot transiently.
It returns the existing B4 envelope, using the existing exact-value translator when
appropriate. Backend B authenticates the policy/current holder before invoking it,
validates the reconstructed commitment, and rechecks current chain state after proving.
A also supplies its authenticated attestation/mint flow against the exported passport
ABI and correct roles; arbitrary A evidence will not match the synthetic passport.

Exact imports, callable examples, request/response shapes, errors and the A hook are
in `contracts/integration/README.md`. A owns its reconstruction authentication; the
hook is not proof that A's live implementation is connected or approved.

## Actual validation — 2026-10-09

All commands below ran successfully in this B5 session. Counts are Node test cases,
not individual assertions. No tests were skipped or cancelled.

| Directory | Command | Actual result |
|---|---|---|
| contracts | `npm run integration:test` | 14/14 pass; 187.288 seconds; eight actual Groth16 proofs across two deployed sessions |
| contracts | `npm run integration:types` | Strict declaration-consumer TypeScript check passes |
| contracts | `npm run prover:types` | Existing strict prover declaration-consumer check passes |
| contracts | `node --test test/GigPassport.test.mjs test/authorization-v02.test.mjs test/policy-solidity-v02.test.mjs test/trusted-prover-b4.test.mjs test/local-deployment-b4.test.mjs` | 72/72 pass; 52.355 seconds: passport 23, authorization/hash parity 9, trusted prover 38, deployment 2 |
| circuits | `npm test` | Real hash Circom compilation, TS build, parity and R1CS/witness checks; 50/50 pass |
| circuits | `npm run eligibility:test` | Real predicate/history/combined eligibility compilation and witness checks; 22/22 pass |
| circuits | `npm run gate1:final` | Frozen Backend A compatibility/review gate; 29/29 pass |

Total: **187 passing Node tests**, plus two passing strict TypeScript checks. The
frozen review's KNOWN GAP assertions reproduce previously reviewed source; they
do not establish that the current Backend A runtime has those gaps or has fixed them.

The new in-process session test has 13 cases and six actual proofs. The private IPC
host test has one case and two actual proofs. Both verify real Groth16 in deployed
Solidity, execute actual welfare/100 MockUSDC loan/allowance/repayment transactions,
and assert shutdown removes the bundle/setup and rejects subsequent calls.
In-process recovery additionally obtains valid replacement proofs and confirms that
lifetime claims and active debt survive replacement; replacement repayment clears debt.

Negative checks cover absent/forged worker approval before evidence access, unknown
policy fields, modified public signals, wrong setup, weaker or substituted consumer
policy, expired request, stale evidence, altered reconstruction, redacted private
errors, old approval/proof after refresh, honest activity FAIL, unauthorized caller,
replay after repayment, revoked passport and identity-based recovery duplication.
Consumer transactions still enforce all checks in Solidity independently of adapters.

Public evidence: `contracts/reports/b5-integration.json` and
`contracts/reports/b5-private-ipc.json`. They contain test results, public bundle/ABIs
and metrics; no plaintext financial arrays, raw transactions or private signing keys.
Previous B4 full-demo and standalone proof reports remain unchanged. Those separate
standalone scripts were not rerun for B5; B5 instead ran the eight real adapter proofs
and all the regression commands explicitly listed above.

## Local limits and decisions

On this Windows/Node 24 machine, B5 proving jobs took 12.614–15.809 seconds; observed
worker OS maximum RSS was approximately 374–426 MiB, excluding parent/EVM/compiler
memory. Parallel test sessions took roughly a minute to seed. The deployment still
uses a fresh disposable local phase2 contribution; build/setup can need appreciably
more memory than a proof worker. Ganache reports and uses its JavaScript fallback.
The existing free pinned transcript/tool downloads and prerequisites remain required.
Job timeout is 120 seconds; the private controller's startup timeout defaults to 180
seconds. Shutdown waits for an active job before deleting setup files. Local process
memory and chain state are ephemeral; persistence means until shutdown, not across
restart. The RPC is an unlocked synthetic development RPC bound to loopback.

Shared decisions remain those in `BACKEND_B_B4_BACKEND_A_COMPATIBILITY.md`: D1/D6
documentation corrections to locked epoch-day/equal-cutoff behavior; D2–D5/D7 joint
approval of commitment constants/mappings/metadata, handoff versions, signed-policy/
approval/domain/public layout and authenticated transport. Intended signer provisioning
and a deployable setup ceremony also require review. B5 does not freeze any of these.
No implementation blocker remains for independent synthetic local testing.

Welfare preserves the existing event/state fallback without a POL transfer. No real
workers, Aadhaar data, payment accounts, paid infrastructure, public network deployment
or production readiness are claimed. Frontend, Backend A, shared codec, contracts,
circuits and `docs/reference` were not edited.

## Implemented files

- `contracts/local/session.mjs`: seeded persistent lifecycle and authenticated resolver hook.
- `contracts/local/start.mjs`: persistent private controller and shutdown.
- `contracts/integration/{client.mjs,client.d.mts,protocol.mjs,errors.mjs,process-client.mjs,README.md}`: callable adapters, public bundle profile, safe errors and examples.
- `contracts/test/{integration-b5.test.mjs,session-ipc-b5.test.mjs,integration-b5-types.mts}`: real local integration, IPC persistence and types.
- `contracts/package.json`, `contracts/local/README.md`: runnable commands/documentation.
- `contracts/reports/b5-*.json` and this handoff: actual public test evidence.

All changes belong on `feature/blockchain-zk`, existing Draft PR #2, kept draft and
unmerged. B4 starting checkpoint: `8ecd8de21790f4f2e652b740b5c44d599361442f`.
