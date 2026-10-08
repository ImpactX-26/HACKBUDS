# GigVault — Verification Authorization and Consumer Policy Interface

**Status: REVIEW / PROPOSED TECHNICAL ENFORCEMENT DETAILS.**

This document translates previously approved security requirements into a concrete interoperability proposal. It is **not permission to silently lock new fields or signature schemas**. Before using these exact wire formats in production code, agree on them across Backend A, Backend B and the frontend, then record the protocol version.

## 1. Already locked behavior

- Verifier uses EVM signing address `verifierId`; signs an immutable policy containing the approved optional criteria and expiry.
- Worker reviews the verifier's exact request, criteria, expiry and disclosure before approving/declining. Changed criteria = new request ID, signature and worker approval.
- One proof binds passport ID, current evidence version/commitment, verifier ID, request ID, policy hash and deployment domain.
- Prover must not issue a meaningful application proof without worker approval; downstream consumers also enforce authorization so frontend bypass cannot claim/borrow.
- Groth16 prover proves private income/history/activity conditions and commitment match; public PASS/FAIL bits are constrained; public checks for passport ACTIVE/version/freshness/expiry/signature happen outside ZK.
- WelfareVault and Microcredit have **their own fixed, exact policies**, not whichever easy thresholds an arbitrary verifier supplied. Consumer contracts prevent replay/state abuse and use stable identity hash for claims/loans.
- No global GigVault consumed-request DB or consumption contract.

## 2. Threat model to address

- An attacker uses a valid proof from an easier policy to trigger a loan whose minimum income/activity/history is stricter.
- An attacker substitutes another verifier's signed request or redirects a request to a different consuming contract.
- A backend with access to Mock FIP could compute proofs without the worker initiating a request; **a mathematical proof by itself cannot certify user approval**.
- Someone changes an approved condition while retaining the same request ID.
- Someone replays a used request for a second monetary action.
- A wallet switch/recovered passport resets claimed benefit/active debt.

## 3. Proposed signed VerificationPolicy serialization

**The logical fields and optional criteria are LOCKED; exact binary encoding/EIP-712 layout below is PROPOSED.**

Use a canonical typed EIP-712 structure with these conceptual fields:

- `requestId` unique identifier (candidate: bytes32);
- `verifierId` EVM signer address;
- enabled flags and values for `minAverageIncomePaise`, `incomeWindowMonths`;
- enabled flags and values for `continuityUnit` (WEEK/MONTH), `continuityWindow`, `minActivePeriods`;
- enabled flag and value for `minHistoryMonths`;
- enabled flag and value for `maxEvidenceAgeDays`;
- `expiresAt` Unix seconds;
- `schemaVersion` and deployment domain binding.

Canonicalization proposal: disabled optional fields are encoded as zeros and cannot carry arbitrary hidden alternative values. Validation requires incomeWindowMonths within 1–36 when enabled, activity windows 1–36 months or 1–156 weeks when enabled, minActivePeriods<=window, nonnegative paise thresholds, and consistent enable/disable flags. The exact byte widths and policy typehash remain **open**.

The verifier signs the hash with EVM wallet; verifier signature checked outside Circom. `verifierId` MUST equal recovered signer. Signing metadata may show human-readable verifier name but name is not canonical identity.

### Consumer policy enforcement (mandatory security rule)

The consumer contract must independently compare every relevant **canonical public policy field** with its own allowed values, including all enable flags and windows. It must verify the intended signer (`verifierId`), not merely see a PASS bit from another policy.

**WelfareVault expected policy:** income disabled; history enabled >=6 months; continuity enabled MONTH, 6 completed months, minimum 4 active; freshness enabled <=90 days; correct expiry/request/signing context. No extra income test.

**Microcredit expected policy:** income enabled >=₹20,000/month average, window 6 completed months, history enabled >=12 months, continuity MONTH 12/9, freshness enabled <=30 days; correct expiry/request/signing context. No arbitrary weaker policy accepted. The consumer logic `no active loan` is **not** a ZK predicate.

`maxEvidenceAgeDays` is public: contract recomputes whether `block.timestamp - evidenceUpdatedAt <= signedPolicy.maxEvidenceAgeDays` (with appropriate checks for future-dated evidence). Historical period arrays use fixed `evidenceUpdatedAt`, independent of current network time.

When verification uses the same generic ZK circuit, the Solidity consumer must check that *exactly* its own expected policy fields are bound in the public inputs and signed policy hash, with the correct proof binding. A proof valid for a different policy cannot be accepted.

## 4. Proposed worker approval scheme

**LOCKED intention:** explicit approval is required. **PROPOSED mechanism:** worker's current holder-wallet EIP-712 signature, separate from verifier signature.

A worker approval authorizes one `requestId` for a specified passport/current evidence version + commitment, signed policy hash, verifier ID and expiry, and is tied to chain/contract/schema domain. A candidate typed payload:

```text
WorkerApproval(
  requestId,
  passportId,
  evidenceVersion,
  evidenceCommitment,
  policyHash,
  verifierId,
  expiresAt,
  domainHash
)
```

**Proposal details requiring sign-off:** exact EIP-712 domain, byte types, whether the current passport holder signature is additionally used as witness/session proof, and whether a separate approval nonce is necessary given requestId uniqueness.

Process:

1. Verifier signs immutable policy (off-chain, no gas).
2. Worker reviews criteria and selects Approve or Decline.
3. On Approve, connected holder wallet signs exact approval payload. The backend validates signer against current passport holder before generating witness/proof; on Decline there is no approval signature.
4. Prover receives only the authorized request/session and regenerates committed private evidence from FIP. It produces proof bound to current chain commitment and approved request/policy/domain.
5. The verifier/consumer **also** validates the worker approval signature (outside ZK) before accepting the proof for an application/benefit/borrow. This ensures a backend-generated Groth16 proof alone is not equivalent to worker consent.

Caveat: A backend that controls FIP/private evidence can mathematically compute a proof without approval; **proof verification plus worker signature** is what enforces accepted application authorization. Never promise that the proving service is physically incapable of computing a proof.

### Recovery nuance

After authorized passport replacement, new application proofs require approval from the **new ACTIVE passport holder wallet**, not the revoked old wallet. The consumer resolves the same stable identity hash for welfare/loan state. A worker may repay an existing loan with replacement passport and should not need a *new income ZK proof* for repayment.

## 5. Proposed binding/check order at consumer

Checks (ordering may be optimized, semantics are mandatory):

1. Verify current chain/domain/consumer, correct expected verifier signer and signed policy hash; policy has not expired.
2. Validate `requestId`/policy not modified and worker approval signature tied to that exact request/passport/evidence version/policy hash/current holder. Check unique request if state-changing.
3. Read `GigPassport.sol`: passport exists, ACTIVE, current identity/holder/version/commitment match, current time/evidenceUpdatedAt reasonable, domain correct.
4. Check **every intended consumer policy criterion and enabled flag** matches exactly (not a weaker policy with PASS bits).
5. Verify mathematical Groth16 proof using `GigVaultVerifier.sol`, including public binding signals and constrained per-criterion outputs.
6. Require all enabled consumer criteria PASS and public freshness/expiry checks PASS.
7. Resolve `identityNullifierHash` and consumer business state: Welfare not claimed by identity; Microcredit no active loan for identity and request unused.
8. Atomically mark request used (if applicable) and benefit claimed / loan active, then perform testnet asset transfer; revert entire transaction on failure.

**Replay rule:** Store `consumedRequests[requestId]` **within each value-moving consumer** (or a hash including namespace/domain if chosen). This is NOT a global GigVault proof-consumption registry. Wallet/identity binding prevents another person from using a request approved by the worker. The same mathematical proof may be reverified for display; valuable action must not repeat.

## 6. Exact public-proof signal consistency

LOCKED names: passportId, evidenceVersion, evidenceCommitment, requestId, verifierId, policyHash, domainHash; plus enabled policy parameters, expiry/freshness binding and result bits (`incomePass`, `historyPass`, `activityPass`).

**OPEN:** A Circom field element cannot directly encode every arbitrary 256-bit `bytes32` without a defined mapping. The team must approve a collision-aware digest-to-field mapping for requestId, policyHash and domainHash and ensure Solidity/TypeScript compute the same mapping and compare it to the full signed bytes32 values. Do not truncate unpredictably or assume `uint256(bytes32)` is always a valid BN254 field element.

Signatures are verified with EVM cryptography **outside Circom**, and canonical parameter values are compared in the consumer contract with the signed policy, not trusted from the frontend.

## 7. Required tests before any claim of enforcement

- Correctly signed policy and worker approval + current ACTIVE passport + constrained ZK conditions → can verify.
- Modified min income / continuity window / expiry → invalid policy signature or hash mismatch.
- Easier signed verifier policy (e.g., income minimum 100 paise) plus valid PASS proof → **Microcredit borrow reverts**; same for wrong welfare history/activity window.
- Different verifier signer / wrong consumer contract or chain / wrong holder or old wallet after recovery → reverts.
- No worker approval, forged worker signature, approval for other request or declined request → no claim/borrow.
- Valid ZK proof with `activityPass=0` → mathematical verification can succeed but borrow rejects on policy result.
- Stale or revoked passport, old evidenceVersion after refresh, changed commitment → reject.
- Repeating claim after passport #old → #new replacement → reject via `claimedByIdentity`.
- Loan after passport #old → #new replacement while old debt active → reject; repayment from replacement wallet succeeds without new income proof.
- Consumed borrow request cannot be used again after repayment; fresh signed request and approval required.
- Browser/frontend block bypass does not allow contract action; tests call contracts directly.

## 8. Decision needed before freeze

Approve one exact canonical policy/EIP-712/approval/public-signal encoding as a **single shared interface**, including consumer intended-signer checks and digest-to-field mapping. The principles above are already locked; the proposed wire details here are not yet approved. Both backends must use the same versioned manifest and real negative tests.
