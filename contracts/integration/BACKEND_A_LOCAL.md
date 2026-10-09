# B6 — actual Backend A runtime → local Backend B

Current B uses approved Fr profile `gv-poseidon-hash-only-0.2.0` and passport
schemaVersion 2. Pinned A c765b2d7 still uses the old evidence mapping and schema 1;
its prior ten-test financial report is historical v0.1 evidence. The unchanged
B6 test remains preserved for rerun after A publishes corrected code. Do not run
the old flow and label it v0.2, or rewrite A's cached blobs to make it pass.
Current B validation/dependency: `docs/review/BACKEND_B_FR_V0_2.md`.

This harness executes A's published financial pipeline unchanged, in process,
against B's actual deployment and real Groth16 engine. It uses A's synthetic
Ramesh bank records and Mock IDP. It does not connect a separately running A HTTP
service or real Aadhaar/banking. B5's independent persistent session is preserved.

## Reproduce

Complete the B4 prerequisites in `contracts/local/README.md`, then:

```powershell
cd contracts
npm run integration:a:prepare
npm run integration:a:test
```

Prepare fetches public Git objects from `Manas150706/HACKBUDS`, commit
`c765b2d7f014d702af3c8ee0d0e391055e05d840`. It verifies 36 required TypeScript
blobs and transpiles them into ignored `contracts/artifacts/backend-a-b6/`.
No A branch/checkout is changed and no A financial pipeline is copied into B's
committed source. Dependency junctions select existing ethers 6.15 and circomlibjs
0.1.7 and snarkjs 0.7.5; upstream logic is not patched. Type-only imports are
elided consistently with A's tsconfig. This is not a full A build/test claim.

The focused reconciliation adds `npm run integration:a:trust`. This intentionally
fails on unresolved upstream security invariants; see
`docs/review/BACKEND_B_B6_COMPATIBILITY_RECONCILIATION.md`. A working synthetic
financial flow is not approval of the real-Aadhaar or shared scalar boundaries.

The test executes the continuous demonstration and negative gates. The demo
command is an alias for the same test, not a second independently measured result.
`contracts/reports/b6-backend-a-local.json` records public source/blob IDs, addresses,
passport state, receipts and proof metrics for a stopped ephemeral deployment.
There are no bank rows, private arrays, witness files or signing keys in the report.

## What actually executes

1. B5 deploys/initializes its existing session. Its independent passport 1 remains
   available; A's distinct Ramesh identity obtains the next actual ID, initially 2.
2. A's Mock IDP issues its signed synthetic identity assertion. The worker signs
   CREATE_CONSENT; A's strict ConsentService checks the bank-owned identity binding.
3. Worker signs MINT_PASSPORT for the exact ID and chain 1337. A's actual
   AttestationService authenticates identity, wallet, current consent and pinned
   FIP signer; verifies the signed owner binding; classifies and derives evidence.
   A's PoseidonEvidenceCommitmentAdapter computes the commitment.
4. B's injected `createBackendAPassportClient` submits an actual attester transaction
   to GigPassport. It preserves A's safe-integer interface without rounding, uses
   real roles, and maps only a missing passport to null. Transport failures throw.
   Mint-time financial evidence is discarded.
5. Verifier signs the exact existing consumer policy. Worker explicitly approves
   EIP-712. A reconstruction authorization is a separate signed action bound to
   consent/passport/wallet/chain, not a substitute for B's policy approval.
6. A one-use opaque handle stores only identity/authorization artifacts. B checks
   approval/current state before invoking the private callback. The callback reads
   current chain cutoff and event directory version and calls A's actual
   reconstructEvidenceSnapshot under valid current consent and replay checks.
7. A recomputes Poseidon and builds its existing witness payload. B's existing
   exact-value translator validates dual representations and commitment. Existing
   Circom/Groth16 proves the regenerated data and rechecks chain authorization.
8. Actual generated Solidity verifies both proofs. Separate local transactions
   execute welfare claim, 100 MockUSDC borrowing, exact allowance and repayment.
   Contracts independently repeat policy/signature/current-state/replay checks.

No B financial fixture arrays substitute for A reconstruction. Source records
remain in A's separate Mock FIP memory. There is no snapshot cache, private financial
file or public prover endpoint. Handles are dropped before reconstruction, cleared
on shutdown and require fresh caller authorization after failure. A's replay store
is explicitly memory-only here, with no persistence-across-restart guarantee.

## Callable local example

```javascript
import {createBackendAIntegration} from './integration/backend-a-session.mjs';
const h = await createBackendAIntegration();
try {
  const signed = await h.signedRequest('loan');
  // Explicit LOCAL synthetic signing helpers; no real-user signing endpoint.
  signed.evidenceHandle = h.registerReconstruction({
    identityAssertion: h.issueAssertion(),
    walletAuthorization: await h.signAction(
      'RECONSTRUCT_EVIDENCE', h.upstream.consentId, Number(h.passportId))
  });
  const approved = await h.approve(signed);
  const proof = await h.api.generateProof(approved);
  const conditions = await h.api.verify(approved, proof);
  await h.api.borrow(approved, proof, h.worker);
  await h.api.approveRepayment(h.worker);
  await h.api.repay(h.passportId, h.worker);
} finally { await h.close(); }
```

Welfare needs its own policy/request/approval and handle; do not reuse the loan
domain. This fixture factory owns synthetic signers in memory. A real caller must
instead supply wallet approvals. An independently running A service still needs
agreed authenticated transport at the existing callback hook. Never expose
unauthenticated `/prove` or forward private evidence to a browser.

## Pending shared decisions

This tests existing provisional local profiles; it does not approve/freeze them.
B4 matrix D1/D6 documentation conflicts remain: epoch-day history and equal-cutoff
refresh with changed commitment. The runtime follows locked semantics without
reinterpreting committed values.

D2–D5/D7 need joint review: Poseidon tags/metadata/mappings; private envelope and
versions; policy/approval/domain and 29-signal order; authenticated live transport.
A's four mock public signals are never used as actual Solidity verifier inputs.
A's ASCII-padded provider reference is passed unchanged to the ABI, separate from
the Poseidon provider scalar. A's safe integers are a subset of B's bounded domains.
Intended signer provisioning and deployable ceremony remain pending. Passing this
local harness grants no approval for public deployment or production readiness.

No shared/locked reference, A branch, circuit, contract or frontend is edited.
₹0 additional spend; loopback chain, synthetic identity/bank and test token only.
