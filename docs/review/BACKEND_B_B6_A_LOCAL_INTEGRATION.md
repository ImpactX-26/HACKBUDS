# Backend B B6 — authenticated A → B local integration

Historical B6 checkpoint report. For the latest A pin and security reconciliation,
see `BACKEND_B_B6_COMPATIBILITY_RECONCILIATION.md`; current public integration report
now records c765b2d7. The earlier counts/timings below describe the original run.

The continuous local flow now executes A's actual published authenticated evidence
pipeline and B's actual Groth16/Solidity consumers. This is synthetic local testing,
not a separately running A HTTP integration or approved production protocol.

## Implemented

- `contracts/integration/backend-a-source.mjs`: reproducible fetch/read of A commit
  `d71c66f88ce8bc6d43c739be41a29b5077e66b22`, SHA-verified 32 source blobs, TypeScript
  transpilation and dependency resolution in an ignored cache. No A branch/checkout
  edits and no A pipeline copied into committed B code.
- `contracts/integration/backend-a-passport.mjs`: injected A-compatible client for
  actual GigPassport reads and role-separated transactions, exact safe integers,
  missing-passport/null handling and real receipt recording.
- `contracts/integration/backend-a-session.mjs`: A's strict consent, Mock FIP,
  pinned signature/owner validation, classification, snapshot reconstruction and
  actual A Poseidon adapter, connected through B's existing trusted callback.
- `contracts/test/backend-a-b6.test.mjs`: continuous real local demonstration and
  provenance/authorization/staleness/replay/refresh negatives.
- `contracts/package.json`, integration docs and public B6 report: runnable commands,
  examples and actual evidence. Existing B5 session, circuits/contracts, shared
  files, locked references, Backend A and frontend source are unchanged.

A's Ramesh evidence mints passport 2 through A's actual attestation orchestration
and B's real attester transport. B5's independent synthetic passport 1 stays usable.
Mint-time evidence is discarded; every proof witness comes from a fresh authenticated
A reconstruction at the on-chain cutoff and event-recorded directory version.
A reconstruction authorization and B's exact EIP-712 policy approval are separate
explicit signed actions. No B-generated financial arrays substitute for A data.

## Actual B6 test result — 2026-10-09

`npm run integration:a:prepare` fetched the pinned public commit and prepared 32
verified source blobs. This is transpilation of required runtime modules, not an
upstream full build, onboarding test suite or live service claim.

`npm run integration:a:test`: **10/10 pass**, zero failed/skipped/cancelled;
130.829 seconds for the final corrected suite. It generated **two actual Groth16
proofs** from separate fresh A reconstructions. The deployed generated verifier and
consumer verification accepted the proofs. Six recorded real successful transactions:
mint, welfare claim, loan, exact token allowance, repayment and evidence refresh.
Final stable-identity welfare state remains claimed; debt is zero. Setup/bundle
cleanup is asserted after shutdown.

Negative checks: unauthenticated FIP retrieval; altered signed payload; mismatched
bank owner; missing B approval before A access; easier unsigned policy; missing or
wrong A action; repeated A reconstruction authorization; consumed private handle;
altered reconstructed private snapshot; consumer request replay before/after repay;
stale evidence; expired policy; old approval and proof after actual A refresh;
revoked consent; transport error incorrectly treated as absent passport.

`npm run integration:types` and `npm run prover:types` both passed strict TypeScript
consumer checks. Existing circuits/contracts were not changed. Earlier B5 circuit
compilation/witness and frozen-source results remain in its report; they are not
claimed as newly rerun B6 checks.

Existing contract/interface regression command also passed **72/72** in 51.326 seconds:
`node --test test/GigPassport.test.mjs test/authorization-v02.test.mjs test/policy-solidity-v02.test.mjs test/trusted-prover-b4.test.mjs test/local-deployment-b4.test.mjs`.
Breakdown: passport 23, authorization/hash parity 9, trusted prover 38, deployment 2.

`npm run integration:test` reran the unchanged B5 in-process and persistent private
IPC suites: **14/14 pass**, 208.797 seconds, **eight actual proofs** and real local
transactions, including recovery and cleanup. Its current regression metrics are
retained in `contracts/reports/b6-regression.json`; the original B5 checkpoint reports
are preserved. Final validation total: **96 passing Node cases**, **10 actual proofs**
across final B6/B5 runs, and two passing strict TypeScript checks.

Public evidence is `contracts/reports/b6-backend-a-local.json`: exact source/blob
manifest, test names, public passport/contract state, transaction hashes/statuses,
proof timings and cleanup. No private arrays, raw FIP rows, witness artifacts or
signing keys are retained in the report. Failed preliminary assertions were fixed
and the entire final B6 suite rerun before recording this passing result.

Final B6 worker proving/verification jobs measured 13.811 and 22.806 seconds;
worker maximum RSS approximately 400–410 MiB, excluding parent/EVM/compiler.
Some work overlapped B5 regression setup. Ganache used its JavaScript fallback on
Windows/Node 24. Existing local transcript/tool prerequisites and memory requirements
still apply. All keys/funds are ephemeral local test assets. Additional spend ₹0.

## What the team can do now

Run the preparation and test commands from `contracts`; `integration:a:demo` is an
alias for the same tested demonstration. Use the callable factory/examples in
`contracts/integration/BACKEND_A_LOCAL.md` for longer local sessions. A can reuse the
injected passport transport and existing reconstruction hook rather than wait for
new circuits/contracts. Frontend reads/results still use B5's public adapters; a
browser proof bridge and real caller wallet provisioning are separate integration
work, not implemented by this harness.

The B4 compatibility matrix remains authoritative for unresolved decisions. D1/D6
document epoch-day history and equal-cutoff refresh conflicts with locked behavior.
D2–D5/D7 require joint approval of exact tags/metadata/mappings, handoff schema/version,
signed-policy/approval/domain/public-signal encoding and authenticated live transport.
A's ASCII provider reference is preserved on chain; its mock four-signal response
is not an actual verifier input. Intended signer provisioning and deployable ceremony
remain review items. Existing provisional local profiles are tested, not silently
approved. These pending choices do not block the authorized synthetic local harness.

No public deployment, paid services, real identity/bank secrets or production readiness
claim. Welfare preserves its existing claim-state/event fallback without POL transfer.
Commit to `feature/blockchain-zk`, existing Draft PR #2, kept draft and unmerged.
