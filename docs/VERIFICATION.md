# Reproduce the evidence

Install dependencies and build circuits using the root README. Run commands from the indicated directory.

| Directory | Command | Coverage |
|---|---|---|
| `backend` | `npm run typecheck && npm test` | A consent, signatures, normalization, originators, identity and lifecycle |
| `frontend` | `npm run typecheck` | Next.js/TypeScript consistency |
| `circuits` | `npm test` | Real Poseidon parity, Fr boundaries, historical profiles |
| `circuits` | `npm run eligibility:test` | Actual circuit witnesses, constraints, predicates and malformed inputs |
| `contracts` | `npm test` | Passport lifecycle and recovery |
| `contracts` | `npm run auth:test` | Immutable policy, worker approval and consumer enforcement |
| `contracts` | `npm run prover:test` | Trusted prover preflight and envelope checks |
| `contracts` | `npm run integration:a:trust` | Ten pinned identity/Fr trust checks |
| `contracts` | `npm run integration:a:test` | Two real A→B proofs, local transactions and negative cases |
| `contracts` | `node test/frontend-a-boundary.mjs` | Twelve HTTP checks against the running A-connected website at localhost:3000 |

For the last command, connect the worker on `/role` first. It checks unauthenticated proving/consumer/onboarding/reconstruction rejection, origin checks, forged login, real cookie authentication, replay and rejected approval before any private A read.

Recorded final browser demonstration: `contracts/reports/local-demo-a-final.json`. Independent A regression: `contracts/reports/v02-backend-a-local.json`. HTTP checks: `contracts/reports/frontend-a-boundary.json`. Historical milestone reports remain available with their original scope; totals from different runs must not be added as if they were one suite.

Local proof jobs take roughly 20–25 seconds and around 400–485 MB maximum worker RSS in the recorded Windows/Node 24 runs. Allow additional memory for the EVM, compiler and web server. Ganache may use its JavaScript fallback on Node 24. Local setup keys are single-party development artifacts, not a production ceremony.

Negative cases include forged FIP provenance, wrong owner, altered evidence, missing approval, policy mutation, stale/revoked evidence, request replay, consumed reconstruction authorization, repeat welfare claims and outstanding debt across recovery. Only tests actually run are recorded as passing in `contracts/reports/repository-integration.json`.

## Integrated repository rerun

The merged A/B/frontend working tree passed the following checks on 2026-10-09, before the documentation/CI-only publication commit:

| Check | Actual result |
|---|---|
| Backend A typecheck and tests | Typecheck clean; **151/151**, 25 suites |
| Frontend typecheck | Clean |
| Circom 2.2.3 compilation and circuit TypeScript build | Passed, including eligibility-v02 (80,274 constraints, 29 public signals) |
| Field/parity, eligibility and historical source review | **86/86** |
| Passport, signed policy and trusted prover regressions | **74/74** |
| Actual A→B, ten identity trust checks and wallet authentication | **25/25** (10 + 10 + 5) |

Current A integration evidence: [repository-a-local.json](../contracts/reports/repository-a-local.json); trust checks: [repository-a-trust.json](../contracts/reports/repository-a-trust.json). Two new proofs were generated in 32.25s and 32.56s; maximum prover RSS was 428 MB. Welfare, borrowing, repayment allowance and repayment receipts all had status 1; final principal debt was zero.

The 86-test suite intentionally reproduces findings against an older, frozen review source as well as checking active circuit behavior. A passing historical finding test does not mean that old source is secure. The ten current trust checks independently read the newer SHA-pinned A source.

The new GitHub workflow reproduces the core build, regression and real local proof checks. Hosted CI status is separate from these completed local results; no hosted green result is claimed before GitHub runs it.

Independent synthetic session, private IPC, schema boundary, score and frontend authorization regressions also passed **34/34**. This includes real independent proofs/transactions and identity-bound recovery state. Across the five listed test commands, **370 tests passed, zero failed**. The commands and their separate scopes are recorded in [repository-integration.json](../contracts/reports/repository-integration.json).
