# GigVault — Backend B: Solidity / Circom / Groth16 / Polygon Amoy

**Owner:** User + ChatGPT/Codex. **Constraints:** Real cryptographic proofs, zero additional spend, preserve all locked decisions.

## Mandatory reading

Read root `AGENTS.md`, complete Decision Register, Implementation Plan, Poseidon review draft, worker-approval/consumer review draft, integration rules. Before coding shared commitments, consult Backend A on normalization/field list and freeze one versioned manifest.

## Deliverables

### GigPassport.sol
- Non-transferable passport; ACTIVE/REVOKED only; one ACTIVE per stable app-scoped identity; `activePassportByIdentity`, `latestPassportByIdentity`, current evidence commitment/version/time/provider ref, events and identity hash.
- `ATTESTER_ROLE` mint/refresh; `ADMIN_ROLE` revoke/reissue authorization; independent keys. Worker cannot mint or refresh arbitrary evidence.
- **Sequential contract-controlled passport IDs**. Attester reads expected next ID, computes commitment with it, passes expected ID into mint; atomic mismatch rejects and requires recompute/retry. Never silently reassign ID.
- Refresh current ACTIVE passport only, increments version internally, monotonic timestamp, changed commitment, event containing historical `sourceDirectoryVersion` and evidence timestamp.
- REVOKED terminal; admin revocation clears active pointer; separate reissue authorization consumed on successful authorized mint; original stays REVOKED; new wallet fresh identity/FIP validation.
- Public stable `identityNullifierHash` links same person across authorized replacement; user accepted cross-contract pseudonymous linkability for MVP.

### Evidence Poseidon adapter and circuit
- Share one `H5(tag,c0,c1,c2,c3)` implementation with Backend A, using actual pinned `circomlibjs` and `circomlib` compatibility; never implement own ad-hoc Poseidon.
- Arrays fixed 36/156/36, oldest→newest, completed UTC periods only; four-way hashing with distinct array/level/root domain tags and zero-padded incomplete nodes. Hash all metadata fields; commitment output not in preimage.
- Proposed exact tags/ordering remain under REVIEW. Implement an isolated adapter/prototype with fixtures if useful, but **do not anchor evidence on-chain using unapproved protocol constants**.
- Circom recomputes entire committed snapshot from private witness; enforce strict binary flags, nonnegative/bounded paise, safe inequality comparators, well-formed policy bounds/window selectors; not modular-overflow susceptible.
- Expose `incomePass`, `historyPass`, `activityPass` as computed/fully constrained actual predicate values. Do not allow prover to choose arbitrary PASS/FAIL. Disabled criteria nonblocking and omitted from UI.
- Proof binds passportId, current evidenceVersion/commitment, requestId, verifierId, policyHash, deployment domainHash; exact private amount/history/activity never public.

### GigVaultVerifier.sol
- Minimal mathematical Groth16 verifier only, no welfare/loan/platform/passport logic.
- Off-chain verification may use snarkjs + on-chain passport reads.

### WelfareVault.sol
- Independent consumer policy: ACTIVE, history>=6 months, activity>=4 of latest 6 completed months, max evidence age 90 days, one claim **per stable identity** (not per passport). No income rule.
- Verify and Claim separate frontend actions. Claim independently enforces correct signed policy/worker approval/current passport/version/public results/proof/one-time claim; bypass frontend must fail.
- Claim state keyed `identityNullifierHash` persists through reissue; benefit transfer test POL only if available; exact test amount not locked; state-changing claim/event fallback honest.

### DemoLendingPool.sol + MockUSDC
- Microcredit consumer policy: ACTIVE; 6-completed-month average recognized income >=₹20,000/month; history>=12 months; active months >=9 latest 12 completed months; evidence age<=30 days; one ACTIVE loan **per stable identity**.
- Verify/Borrow separate. `borrow()` enforces correct policy, current passport/version/commitment, ZK, valid worker authorization and request freshness, no active debt; transfers 100 MockUSDC (test asset).
- Repay 100 MockUSDC, clear active debt; loan persists through wallet recovery and may be repaid via replacement passport. Re-borrow requires new verifier request/proof, no stale request reuse. No interest/collateral/liquidation/credit score.

### Contract-specific approval boundary
- Do **not** equate any valid Groth16 `incomePass=1` with permission to borrow. Exact consumer threshold/window/verifier/policy consistency and holder approval are needed. See `docs/review/VERIFICATION_AUTH_AND_CONSUMERS_REVIEW.md` for a proposal, **not approved canonical encoding yet**.
- Worker wallet approval mechanism must block a backend from executing a claim/borrow without a signed worker-approved request; if proving service could still compute a mathematical proof, the consumer must reject missing approval.

## Testing gate (must actually run)

- Role separation, SBT transfer restrictions, mint race/expected-ID mismatch, duplicate identity, reissue authorization consumption, refresh version/current event, REVOKED terminal.
- Same TypeScript and Circom roots/commitment on actual fixtures; changed input/wrong tags reject. No invented golden values.
- Policy lower-threshold substitution, wrong signer, changed expiry/window, cross-verifier, wrong contract/domain, missing worker approval, replay, revoked/stale passport all reject.
- Welfare already-claimed via replacement passport reject; active Microcredit loan carries to replacement and prevents second borrow; repay with replacement works.
- Groth16 mathematical verification is insufficient on its own for consumer execution; negative tests must prove contract enforcement.

## Free-only operational constraints

- Start on local EVM testing. Deploy to Polygon Amoy with free faucet test POL only when ready. Never require paid hosted RPC, paid identity provider or real asset.
- Avoid uploading attester/admin/FIP private keys to GitHub or prompts; use local `.env` and `.env.example` placeholders.
- If Circom compilation or trusted setup/ptau is blocked, report factual blocker; do not silently downgrade to insecure boolean or call it ZK.

## First instruction to Codex

“Read the entire GigVault locked reference pack and proposed shared reviews, then write a dependency-ordered plan for `GigPassport.sol`, Poseidon adapter, Circom circuits, verifier and consumer contracts. Implement and run isolated contract tests first. Before freezing poseidon/policy encodings, coordinate a versioned shared manifest with Backend A and report any non-locked details for user approval. Never replace the actual Groth16 proof with a mocked success.”
