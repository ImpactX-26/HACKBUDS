# Independent Backend B eligibility circuits

Implemented 9 October 2026 without a Backend A service, checkout or new shared
schema. Locked income/activity semantics are implemented as local Circom
components; exact uint64 limits, disabled-zero parameters and unit encoding are
explicitly provisional implementation experiments, not approved protocol changes.

## Run

From `circuits/`, using the existing pinned compiler and installed dependencies:

```powershell
npm run predicates:test
npm run predicates:proof
```

The separate build command is `npm run predicates:build`. No dependencies, shared
codec files, Backend A files or existing hash circuit profiles change. The next
v0.2 milestone adds history, context binding and consumer contracts under Backend
B ownership; see [the versioned interface](../docs/review/BACKEND_B_ELIGIBILITY_V0_2.md).

## Behavior

- `prototypes/income-activity-core.circom` computes actual `incomePass` and
  `activityPass`. Results are constrained equal to comparisons, not free booleans
  or one-way implications. A genuine FAIL is a valid witness.
- Average income uses `sum(last N completed months) >= thresholdPaise * N`.
  Arrays are supplied in the locked oldest-to-newest order; all N months count,
  including zero-income months. No division, rounding or universal income rule.
- Activity compares the sum of the selected newest monthly or weekly binary
  flags against the requested minimum. Windows are 1..36 months or 1..156 weeks;
  minima cannot exceed windows. Nonbinary flags and enable/unit selectors fail.
- `prototypes/income-activity.circom` is a standalone predicate harness. Its two
  result bits and seven criterion parameters are public; all arrays are private.
- `prototypes/snapshot-income-activity.circom` supplies the SAME private arrays
  to the predicates and the existing provisional hierarchical Poseidon component.
  It exposes only the two computed bits, expected commitment and seven criterion
  parameters. Branch roots, amounts and activity counts are not public outputs.
- The prototype range-checks EVERY income amount and income threshold to uint64,
  even outside a selected window or disabled condition. N <= 36 means both sum
  and threshold*N are below 2^70; both comparison operands also have explicit
  70-bit checks. These bounded values cannot wrap around the BN254 field.
- Disabled criteria output 1 and require zero-valued parameters. Prototype unit
  mapping: 0 = MONTH, 1 = WEEK. These are local conventions pending shared review.

## Actual verification

The strict TypeScript compilation and new test suite passed: **13 passed,
0 failed**. Tests compare both compiled Circom witnesses against independent
BigInt arithmetic. Cases cover exact thresholds, a one-paise deficit, zero-month
denominators, exclusion of older periods, 8/12 vs 9/12 activity, welfare-style
income-disabled 4/6, monthly/weekly selection, maximum windows, maximum uint64
sums, malformed policy parameters, field aliases and nonbinary input rejection.
Changing a private amount or flag cannot satisfy the original commitment.
Actual snarkjs R1CS checks accept valid FAIL and reject flipped PASS and FAIL bits.

Compiled standalone circuit: **6,035 constraints**, 7 public criterion inputs,
228 private inputs, 2 public result outputs. Combined circuit: **75,693
constraints**, 8 public inputs, 235 private inputs, 2 public result outputs.

`npm run predicates:proof` completed successfully: real Groth16 PASS and FAIL
proofs verified; the same proofs with changed result bits or income thresholds
were rejected. The command uses a disposable single-party local power-13 setup
for the STANDALONE predicate circuit and deletes its scratch witness, proof and
setup artifacts in `finally`. These keys are unsuitable for deployment.

The existing `npm test` regression suite also passed: **50 passed, 0 failed**.
The first predicate run exposed TypeScript test-harness typing errors; these
were corrected before strict compilation and the complete 13-test run passed.
No comparator/circuit failure was suppressed. No full-stack or deployment tests
are claimed.

## Original income/activity milestone boundary

The original income/activity milestone advanced the circuit work independently;
its standalone proof is not a finished application
proof or financial consumer. The combined circuit is tested through compiled
witnesses/R1CS, not yet a combined Groth16 setup. The standalone proof lacks a
snapshot commitment and therefore cannot be used as attested income evidence.

The v0.2 extension implements a constrained provisional calendar history rule,
combined private snapshot predicates, request/domain context binding, controlled
prover preflight and local authorization/consumer contracts. Shared approval of
history arithmetic, signing/manifest encoding, Poseidon tags/order and monetary
width is still required. No live deployment or shared format freeze is introduced.

`npm run eligibility:test` compiles all profiles and runs 22 predicate/calendar/
commitment/privacy/range tests. Actual run: 22 passed, 0 failed. Strict TypeScript
build and existing 50-test regressions passed. Combined v0.2: 80,274 constraints,
25 public inputs, 238 private inputs and 4 public outputs (three result bits plus
a context digest). No private start date, array, amount or count is public.

`npm run eligibility:proof` runs combined Groth16 and generated Solidity verifier
consumer tests in one disposable power-17 ceremony. Final proof evidence and
performance results are recorded in the versioned review and
`reports/eligibility-v02-local.json`: 14 real proofs and 56 local consumer checks
passed in the complete run. Authorization/reconstruction/hash-parity suite:
9 passed, 0 failed. The complete run used a hash-verified public prepared
transcript and disposable local phase-2 keys; deployment remains out of scope.

Backend A can continue authentication, normalization and snapshot work against an
injected commitment/contract boundary. It does not need these proving artifacts
to complete those modules. Later integration supplies its authenticated snapshot
through the agreed versioned adapter and reruns the same predicate cases.
