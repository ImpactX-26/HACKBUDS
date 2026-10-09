# Gig Score and frontend integration — focused handoff

The user authorized Gig Score on 9 October 2026, replacing the previous no-score
product decision for this feature. Reference documents have not been edited.
Categories belong to the frontend owner. Contracts, proof predicates, signed
policies and consumer eligibility remain unchanged. ₹0; local synthetic setup.

## Callable score helper

`contracts/integration/gig-score.mjs` and its `.d.mts` declaration export:

```js
import {calculateGigScore} from './contracts/integration/gig-score.mjs';
const result = calculateGigScore({
  tenureMonths: 18, weeksPaid: 45, missedWeeks: 7,
  averageMonthlyIncomePaise: '2400000'
});
// score: 81, unroundedScore: 81.038461538..., mode: 'three-factor'
// Add paidWeeksLast12Weeks only when the actual recent twelve-week count is known.
```

The helper implements the user's exact 25/35/40 fallback or 20/30/30/20 formula.
Tenure caps at 24 months; income caps at 3,000,000 paise (₹30,000). Zero paid and
missed weeks means consistency 0. An absent recent count selects the fallback;
an actual count of zero selects four factors with activity 0. Final display rounds
once to the nearest integer; components remain unrounded. Invalid counts, unsafe
numbers, non-integer paise and recent counts outside 0–12 are rejected.

Use only worker-owned metrics derived from authenticated recognized payouts.
Public passports and proof results do not contain exact income or paid-week counts.
The calculation itself does not authenticate its inputs and is not a ZK proof.
Keep score/input metrics in worker UI memory; do not send them to verifier/consumer
proof responses or persist them in activity logs. No new score endpoint exists.

For snapshot-derived metrics, label the actual income and consistency windows.
The canonical arrays have 36 completed UTC months and 156 completed ISO weeks,
oldest first; recent activity can use the final twelve weekly flags. All credits
are not gig income. The score formula does not specify the average-income or
consistency lookback: consume existing explicitly labelled metrics, rather than
silently choosing a new window or copying the lending policy. Missing recent
information must use the three-factor fallback. Category labels/cutoffs are
frontend choices and have no backend effects.

## Existing backend calls to wire first

Use `contracts/integration/client.mjs` / `client.d.mts` and a live integration
bundle. `contracts/integration/README.md` has complete examples. Calls:

1. `getPassport`, `getIdentityState`: actual chain state.
2. `getApproval` / `approveRequest`: explicit worker wallet approval of the exact
   verifier-signed request. Keep worker and verifier signing distinct.
3. Backend-owned `generateProof`: existing trusted reconstruction/prover boundary;
   no unauthenticated browser proof URL or private witness submission.
4. `verify`: actual Solidity verification and enabled per-condition PASS/FAIL.
5. Separate `claim` or `borrow`; then `approveRepayment` and `repay`.

`npm run local:start` in `contracts` starts the independent seeded schema-2
session and emits its live RPC/bundle location. The browser owner supplies a
wallet/provider; public SDK calls cannot use backend fixture signing keys.
The secured prover is in-process/private IPC, not an HTTP endpoint. A browser
bridge must use the application's authenticated backend. Published frontend
branch inspected in this session contains reference documents but no app code;
frontend integration could not be reported as finished at that checkpoint. The
subsequently published frontend `1372b64` has been inspected read-only; see
`contracts/integration/FRONTEND_LOCAL_HANDOFF.md` for its exact remaining wiring.

## A's newly published checkpoint

Pinned source: `Manas150706/HACKBUDS` at
`51ac3e5db7dc7ff032e1256e6b7f71da7c9d770c`.
All ten unchanged B trust checks pass. This verifies the tested guards; it is not
genuine real-Aadhaar integration (zero real Aadhaar proofs).

The previous schema mismatch is resolved: A mint, refresh and reissue send the
approved schema 2 for newly reconstructed profile 0.2 commitments. The actual
A→B proof/welfare/100-MockUSDC/repayment suite now passes. Do not relabel existing
v0.1 passports/proofs. Historical schema-1 rejection remains tested separately.
Exact new validation: `docs/review/BACKEND_B_A_SCHEMA2_VALIDATION.md`.

| Boundary | Latest comparison / action |
|---|---|
| Fr/profile/digest mapping | A and B agree on approved Fr and profile 0.2; tested boundary reductions match |
| History start | Epoch days; unchanged, no translation to seconds |
| Cutoff / equal-cutoff refresh | Epoch seconds; unchanged locked monotonic refresh behavior |
| Poseidon tags/tree/scalar order | Match; still provisional joint profile details, no new constants approved |
| Money | Exact paise; A safe-integer domain, B circuit uint64; reject outside A's supported range |
| EIP-712 policy / approval | Unchanged exact signed request, consumer domain and current worker approval |
| All 29 public signals | Existing order unchanged; score adds no signals |
| Evidence envelope | Fr profile 0.2 and on-chain schema 2 compatible; historical schema 1 remains rejected |
| Private transport | Existing authenticated A reconstruction callback + private B capability; no browser arrays |

Do not begin a new security or protocol redesign to make this demo connect.
Keep genuine Aadhaar unverified until actual authenticated artifacts/proofs exist.

## Validation for this increment

- `node --test test/gig-score.test.mjs`: 10 passed, zero failed.
- `npm run integration:types`: strict TypeScript passed, including score declarations.
- `npm run integration:a:trust`: 10 passed, zero failed against unchanged A blobs.
- `node --test test/backend-a-v02-boundary.test.mjs`: 2 passed, zero failed;
  76.697 seconds. Actual authenticated A passport mint succeeded; schema mismatch
  rejected before private reconstruction/proving. Zero new Groth16 proofs and
  zero welfare/loan transactions. Public transaction evidence is in
  `contracts/reports/v02-a-schema-boundary.json`.
- Previously verified B checkpoint `f07fe33`: 206 passing tests (149 current + 57
  historical), eight real Groth16 proofs and local consumer transactions. Those
  full suites were not rerun for this score-only addition/source-pin update.

Draft PR #2 remains unmerged. Preserve all earlier reports and independent session.
