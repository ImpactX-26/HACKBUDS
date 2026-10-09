# Backend B independent eligibility and consumers — v0.2

Status: **LOCAL PROTOTYPE / PROPOSED INTERFACE**, 2026-10-09. This implements
locked behavior independently of Backend A. It neither changes `docs/reference`
nor finalizes shared schema, Poseidon constants, signing encodings or history
arithmetic. No Amoy deployment, live evidence anchoring or production ceremony.

## What the circuit proves

`circuits/prototypes/eligibility-v02.circom` recomputes the existing four-child
Poseidon snapshot commitment from all seven metadata scalars and the private
36/156/36 arrays. The same arrays supply exact income/activity comparisons.
Income is `sum(last N months) >= thresholdPaise * N`, including zero months.
Activity counts selected newest completed UTC months or completed ISO weeks.
Three output bits equal actual comparisons; a genuine FAIL has a valid proof.
Neither amounts, start date, arrays, branch roots nor exact counts are public.

The history component constrains Gregorian date conversion, leap years (including
century exceptions), timestamp division, target year/month and last-day clamping.
All calendar witness values are checked; a TypeScript date result is not trusted.
Provisional rule inherited from the v0.1 proposal: start epoch-day is nonzero and
at/before the evidence cutoff date minus N calendar months, with anniversary day
clamped to the target month's last day. Date granularity is UTC day. `0` means no
history and fails an enabled criterion. Disabled history passes with zero months.

This tenure rule is distinct from completed-period income/activity buckets. It
does not silently adopt a count of fully worked months. The anniversary versus
completed-calendar-month tenure decision remains open for shared approval.

Prototype bounds: uint64 paise, sums/products below 2^70, binary flags, 1..36
income months, 1..36 monthly or 1..156 weekly activity windows, minimum activity
not above window; history 1..360 months, dates 1970..9999, epoch-day 22 bits,
timestamps/expiry 40 bits. A policy whose target date precedes 1970 is outside
this local profile and has no witness. Disabled fields are canonical zeros.

## Public signal manifest and signatures

Backend B-owned `contracts/proposal/authorization-v02.mjs` defines the versioned
manifest. Circom declaration order determines public-signal order; tests compare
the actual compiler symbol table with all 29 entries. Outputs precede inputs:

1. incomePass, historyPass, activityPass, authorizationBinding.
2. expectedCommitment, passportId, holderBinding, evidenceUpdatedAt,
   evidenceVersion, verifierId, chainId, consumer, requestHi, requestLo,
   policyHi, policyLo, domainHi, domainLo, expiresAt, maxEvidenceAgeDays.
3. incomeEnabled, incomeWindowMonths, minAverageIncomePaise, activityEnabled,
   activityIsWeekly, activityWindow, minActivePeriods, historyEnabled,
   minHistoryMonths.

`authorizationBinding` is Poseidon(16) over the ordered context in item 2. It
ensures context signals participate in constraints, including request, version
and domain. The signed policy binds item 3 and expiry/freshness; consumers compare
all of them independently. The circuit does not verify ECDSA or keccak.

Request ID, complete EIP-712 policy digest and domain separator are represented
as high then low uint128 limbs, preserving full bytes32 values without reduction
modulo the scalar field. Holder/verifier/consumer are uint160; ID/version/chain
are uint64. Typed policy uses uint256 criterion fields with explicit validation.
Freshness `0` is disabled in this prototype; nonzero is maximum age in days.

EIP-712 domain: name `GigVaultEligibility`, version `0.2-provisional`, chain ID
and intended consumer address. Verifier signs the complete `VerificationPolicy`.
Current holder separately signs `WorkerApproval(requestId,passportId,
evidenceVersion,evidenceCommitment,policyHash,verifierId,expiresAt,domainHash)`.
Exact type definitions are executable in the module and mirrored in Solidity.

`prepareAuthorizedWitness` checks these signatures, current state and time BEFORE
calling an injected private-evidence reconstruction function. It then checks the
reconstructed snapshot against current passport ID, holder, timestamp and
commitment. Backend A supplies authenticated reconstruction later; this module
does not validate or replace FIP authentication/consent/identity matching.
The caller must supply current passport state from its trusted on-chain read,
configured domain and intended verifier; these are internal inputs, never
editable frontend attestations. Consumers independently read their passport
contract and reconstruct their domain and immutable intended signer.
It retains no plaintext witness or source response. Synthetic test harnesses
temporarily write witnesses only inside ignored scratch directories and delete
them along with disposable ceremony keys.

A backend possessing private data can compute a mathematical proof without the
worker. Application authorization comes from the signature checks as well as
the proof. The local synthetic math harness deliberately tests that distinction.

## Consumer boundary

`contracts/src/proposal/EligibilityGateV02.sol` checks intended signer, immutable
policy signature, current-holder approval, exact public signals, deployment
domain, ACTIVE passport, current version/commitment/holder/timestamp, expiry,
freshness and the injected real generated Groth16 verifier. Generic `verify`
returns all three bits and can return genuine FAIL without changing state.
No global proof consumption registry is introduced.

Welfare policy is exactly income disabled, history 6, MONTH activity 4/6,
freshness 90. `claim` reruns verification, requires current holder as caller,
PASS bits and unused request, and records lifetime claim by stable identity.
**Benefit fallback is an honest claim event/state change, not a POL transfer.**
The benefit amount is still unapproved and no faucet funds are assumed.

Lending policy is exactly 2,000,000 paise average over 6 months, history 12,
MONTH activity 9/12, freshness 30. `borrow` reruns verification and transfers
100 MockUSDC (6 decimals). Principal and consumed requests are consumer state,
with debt keyed by stable identity. `repay` takes exactly 100 MockUSDC from the
current ACTIVE holder, including a replacement passport, without a new income
proof. Subsequent borrow needs an unused, independently approved request.
Transfers use SafeERC20 and a reentrancy guard. Test asset has no real value.

The generated Solidity Groth16 verifier is math only and is created inside the
disposable local ceremony by `snarkjs zkey export solidityverifier`. Its verifier
key is not committed or deployed. Test commitments are anchored only to a local
Ganache passport fixture, never to Amoy using unapproved shared constants.

## Reproduce

Install each existing pinned package lock in `circuits` and `contracts`; use the
existing pinned Circom 2.2.3 binary. No new dependencies or monetary spend.

```powershell
cd circuits
npm run eligibility:test
npm run eligibility:proof
npm test
cd ../contracts
npm run auth:test
npm test
```

Full proof command uses a disposable power-17, single-party local setup. It is
computationally expensive and unsuitable for deployment. Actual measured timings
and sampled child-process working-set sizes are saved in
`circuits/reports/eligibility-v02-local.json` after a successful complete run.
Memory samples are every three seconds, not a guaranteed peak or browser estimate.
`null` means a child was not successfully sampled; it does not mean zero memory.

For faster reruns, optionally set `GIGVAULT_TEST_PTAU` to a previously downloaded
public prepared power-17 transcript listed in the
[official snarkjs README](https://github.com/iden3/snarkjs#7-prepare-phase-2).
The proof runner verifies its complete BLAKE2b-512 digest before use:
`6247a3433948b35fbfae414fa5a9355bfb45f56efa7ab4929e669264a0258976741dfbe3288bfb49828e5df02c2e633df38d2245e30162ae7e3bcca5b8b49345`.
The transcript is public, ignored and not a private key. Its source is
`https://circom.info/powersOfTau28_hez_final_17.ptau`; downloading is optional.
Circuit-specific setup/contribution, proofs and generated verifier remain local
and disposable. This option does not make them suitable for deployment.

## Shared decisions still required

- Approve history arithmetic/no-history domain, monetary limits, existing
  Poseidon tags/order and full evidence serializer/mapping with Backend A.
- Agree v0.2 policy/approval EIP-712 types/domain, full-limb signal manifest,
  optional freshness encoding and intended verifier provisioning with frontend/A.
- Approve a deployment ceremony/key distribution and actual test-POL benefit
  amount if a welfare transfer is wanted. Local ceremony artifacts are not keys
  for deployment.

These are integration decisions, not reasons for A and B to block independent
module development. Backend A files, branch and schemas remain untouched.

## Executed evidence — 9 October 2026

| Check | Actual result |
|---|---|
| Strict TypeScript / all new Circom profile builds | Passed |
| Income/activity + history/combined witness/R1CS suite | 22 passed, 0 failed |
| Authorization, reconstruction and Solidity/ethers signing-hash parity | 9 passed, 0 failed |
| Existing circuit regressions | 50 passed, 0 failed; historical review-gap reproductions are not source-security acceptance |
| Existing GigPassport local EVM suite | 23 passed, 0 failed |
| Combined Groth16 run | 14 real proofs generated and verified |
| Generated math verifier + local consumer integration | 56 checks passed; negative calls check exact custom error reasons |
| Diff formatting and candidate-source secret scan | Passed; only ephemeral Ganache key access in test code, no retained key value |

Proof cases include exact-threshold PASS, zero-income months, no-history sentinel,
sparse activity, a one-paise six-month deficit, insufficient recent history,
and real PASS proofs for an easier signed policy. Altered public result/context/
threshold signals fail mathematical verification. Consumer tests reject missing
or forged holder approval, wrong signer/request/domain/consumer, modified or
easier policy, absent/revoked/stale/refreshed passport, failed criteria, caller
redirection, replay and partial repayment. Lifetime claim and active debt survive
replacement; revoked holder cannot authorize it; replacement repays exact debt
without an income proof; a new approved request permits another loan after repay,
but an already spent request does not.

The first full run failed at the borrow after replacement repayment. Test clock
restoration and RPC caching were corrected; the final run uses an exact EVM
checkpoint for the freshness test, uncached RPC reads, explicit mined borrow
validation, and exact rejection reasons. No Solidity consumer change was needed.
The individual contribution of clock versus RPC caching was not isolated. The
failed initial run is not counted as a successful end-to-end run.

Successful measured O1 profile: **80,274 constraints**, 29 public signals,
R1CS **11,827,552 bytes**, WASM **5,163,099 bytes**. Synthetic witness generation
**0.066–0.211 s**, CLI proof generation **3.407–4.105 s**, positive CLI verification
**0.495–0.687 s**. Maximum successfully sampled child working set in that run:
**1,430.7 MiB**, not a guaranteed peak or browser benchmark. Public prepared
transcript setup took **18.54 s** and the disposable phase-2 contribution
**10.80 s**. Earlier local preparation took **959.16 s**; a hash-verified public
prepared transcript avoids repeating that preprocessing. Proof timings include
CLI startup and monitoring overhead. Ganache used its Node transport fallback.

An isolated `--O2` compilation produced **34,668 constraints / 34,194 wires**.
It was not the profile proved in this run; no optimized-profile proving time or
security acceptance is claimed. The existing tested O1 profile stays in place.

Implemented paths: `circuits/prototypes/{history-core,history,eligibility-v02,
income-activity-core,income-activity,snapshot-income-activity}.circom`; independent
build/proof/calendar/reconstruction scripts and predicate tests; Backend B-owned
`contracts/proposal/authorization-v02.mjs`; four local proposal contracts,
authorization/hash-parity tests and real-verifier integration harness. The JSON
performance report contains metrics only, no snapshot, proof, authorization or key.

Unresolved blockers: shared profile approval and authenticated Backend A end-to-end
integration; no live deployment is attempted. Decisions needed are listed above.
Backend A, frontend, locked references and unrelated pitch/output files are untouched.
