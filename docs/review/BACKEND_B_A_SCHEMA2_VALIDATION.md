# Backend B — verified A schema-2 integration

9 October 2026. Source pin:
`Manas150706/HACKBUDS:51ac3e5db7dc7ff032e1256e6b7f71da7c9d770c`.
Compared with b43b1708: only A attestation-service schema constant/three uses and
three lifecycle test assertions changed. Thirty-six unchanged/updated upstream
TypeScript blobs are SHA-verified and transpiled into a separate ignored cache.
No A branch, source, frontend, locked reference, circuit or Solidity edit.

## Implemented B files

- `integration/backend-a-source.mjs`: new verified pin; explicit historical SHA
  can use its own cache. Reject non-SHA source selection.
- `integration/backend-a-session.mjs`: optional historical source pin for the
  preserved schema-1 regression; default always current A checkpoint.
- `integration/worker-proof-bridge.mjs` / `.d.mts`: backend-only authenticated
  worker check before invoking existing SDK/private prover; no HTTP listener,
  public proof capability, signing helper or new financial policy.
- Tests: schema-2 mint/refresh assertions, preserved historical schema-1 negative,
  bridge rejection/mutation checks, real private-IPC bridge exercise and types.
- `integration/FRONTEND_LOCAL_HANDOFF.md`: live-session bundle, concrete SDK and
  private backend composition, exact incompatibilities in published frontend.

## Actual validation

Run from `contracts`:

| Command | Actual result |
|---|---|
| `npm run integration:a:trust` | 10 passed, 0 failed, 4.359 s; unchanged assertions |
| `npm run integration:a:test` | 10 passed, 0 failed, 205.847 s |
| `node --test test/worker-proof-bridge.test.mjs` | 6 passed, 0 failed |
| `node --test test/session-ipc-b5.test.mjs test/backend-a-v02-boundary.test.mjs` | 3 passed, 0 failed, 157.019 s |
| `npm run integration:types` | Strict TypeScript passed, including bridge types |

Total 29 passing Node cases for this increment. Tests ran partly concurrently;
durations are not additive. Existing financial circuits/contracts were reused,
not rebuilt or redesigned. Full prior 206-case regression was not rerun here.
A's reported 151 tests/build are upstream claims, not independently rerun by B.

A financial suite: actual authenticated Mock FIP/consent/owner checks and fresh
A reconstruction → actual local schema-2 mint → exact verifier-signed policy →
explicit worker approval → **two real Groth16 proofs** → generated Solidity
verification → welfare claim → 100 MockUSDC borrow → exact allowance/repayment →
refresh. Six successful receipts, final principal zero, claim state retained.
Actual A proof jobs took 22.65 and 33.33 seconds in this concurrent run, with
approximately 405–463 MiB maximum worker RSS; parent/EVM/setup memory is additional.
Public records: `contracts/reports/v02-backend-a-local.json`.

Negatives cover unauthorized FIP retrieval, altered signed source, wrong owner,
missing worker approval, changed policy, incorrect/replayed A action, reused
private handle, changed reconstructed snapshot, stale/expired evidence/request,
consumer replay before/after repayment, old approval/proof after refresh and
revoked consent. None substitute B-generated financial arrays for A evidence.

Private-IPC bridge suite: **two additional real Groth16 proofs**, successful
welfare/loan/repayment transactions, replay rejection and shutdown cleanup.
Its test uses a synthetic server-owned authentication fixture, not production
application authentication. Public metrics: `reports/v02-frontend-private-ipc.json`.
Historical schema-1 test still loads actual A b43b1708 and confirms rejection before
private reconstruction/proving; it is not an old-passport upgrade.

## Session and remaining integration work

Independent B foreground session remains on loopback port 8545, schema-2 passport
1 ACTIVE, unclaimed and no debt. It is independent of temporary A test chains.
Readiness/bundle verified through private controller reads; live session has not
consumed its welfare/loan requests. It remains available until explicit shutdown.

Frontend owner must replace its published mock three-signal proof, salted SHA
commitment, P-256 wallet and speculative HTTP paths. Use actual 29-signal proof
package, EVM signing, public SDK and an application-authenticated backend handler
composed with the private bridge. These are the exact gaps in inspected published
frontend 1372b64, not claims about its unpublished work. Four categories remain
frontend-owned and never change eligibility. Score helper stays worker-only.

No financial format blocker remains for this tested single-worker local flow.
Reviewed Poseidon tags/order and EIP-712/public-signal layouts remain provisional
joint protocol details; this test does not silently finalize them. Approved Fr,
profile 0.2 and schema 2 are enforced. Live A HTTP composition, seven-persona
frontend coverage, genuine real Aadhaar and production readiness are not claimed.
₹0, local test assets only, both PRs draft/unmerged.
