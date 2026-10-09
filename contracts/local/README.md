# Backend B B4/B5: reproducible local EVM and trusted prover

This is a real Groth16 / Solidity demonstration using fixed **synthetic** evidence,
ephemeral Ganache development accounts and MockUSDC. It costs ₹0. It is ready for
independent local testing, subject to the recorded test results. It is not a live
Backend A integration, production trusted setup, or Amoy deployment.

## Run from a fresh checkout

Node 24 / npm 11 were used for verification. Install the pinned existing lockfiles:

```powershell
cd circuits
npm ci
npm run setup:circom
npm run eligibility:test
cd ../contracts
npm ci
npm run local:demo
```

The demo starts a loopback-only local RPC on an available port, generates a fresh
local phase2 key, exports its actual Solidity verifier, deploys all six contracts,
funds lending, runs the trusted prover and submits real transactions. It stops the
chain and removes the session directory in `finally`. Public ABIs, addresses,
setup digests, receipt hashes, statuses and timing evidence remain in
`contracts/reports/b4-local-demo.json` and `contracts/reports/b4-abis/`.
Historical report addresses/receipts belong to a stopped ephemeral chain; they are
not public explorer links or reusable addresses on the next run.

For a persistent foreground **local development session**:

```powershell
cd contracts
npm run local:start
```

This deploys to `http://127.0.0.1:8545` and prints the generated manifest path under
ignored `contracts/artifacts/local/session-*/manifest.json`. The live manifest
contains addresses, ABI file references, roles, chain/domain, protocol profiles,
29-signal order and setup fingerprints. Ctrl+C stops it and deletes the disposable
setup/manifest. Do not expose this synthetic unlocked development RPC externally.
There is no public proof-generation HTTP endpoint. `local:start` now initializes
the B5 synthetic worker/passport and stays callable over private stdin/parent-child
IPC. Its ready line also reports `integration-bundle.json` with inline ABIs.
See `contracts/integration/README.md` for backend/SDK calls and Backend A's resolver
hook. `local:demo` remains the independent B4 complete-flow regression.

## Callable private boundary

`circuits/service/trusted-prover.mjs` exports `createTrustedProver`; its adjacent
`.d.mts` file defines `ProofRequest`, `EvidenceEnvelope`, `Policy` and `ProofResult`.
The callback-based in-process interface is the trusted service adapter. Only its
owner supplies a private authenticated reconstruction capability and deployed
contract configuration. Requests carry an opaque evidence handle, not source bank
rows, a client-supplied passport state or a user-selected RPC/domain.

Composition (the complete runnable example is `contracts/local/demo.mjs`):

```javascript
const local = await deployLocal();
const prover = createTrustedProver({
  setupId: local.setup.id,
  hashes: await createProvisionalPoseidon(),
  readState: localChainReader({
    provider: local.provider,
    passport: local.passport,
    consumers: local.consumers,
    chainId: 1337,
    mathVerifier: await local.math.getAddress()
  }),
  reconstruct: trustedAuthenticatedReconstruction,
  prove: createProofEngine(local.setup)
});
const result = await prover.prove(approvedRequest);
// result.solidity is { a, b, c, signals }; combine with signed request for consumer.
// Always close local in a finally block.
```

Versioned request shape:

- `protocolVersion`: `gv-local-prover-b4/1`.
- `eligibilityProfile`: `gv-eligibility-0.2-provisional`.
- `consumer`: `gate`, `welfare` or `loan`; maps only to owner-configured contracts.
- `passportId`: nonzero canonical unsigned decimal, below 2^64.
- `evidenceHandle`: opaque private resolver reference.
- `policy`: exactly the existing EIP-712 `VerificationPolicy` fields; wire integers
  are canonical decimal strings. Unknown additional conditions fail closed.
- `verifierSignature`, `workerSignature`: exact typed-data signatures for this
  consumer domain/current passport; reconstruction-only authorization is insufficient.

The trusted resolver returns `EvidenceEnvelope`: protocol and eligibility profiles,
`commitmentProfile=gv-poseidon-hash-only-0.1.0`, `schemaVersion=1`, current
`evidenceVersion`, and the exact ten-field preimage. Scalar/paise values are canonical
decimal strings or bigint internally. Income is uint64 per bucket; holder uint160;
passport/version/directory supported as uint64; cutoff seconds uint40; history days
uint22 and not future; 36/156/36 arrays, strict binary flags. Provider/digest scalars
must be below BN254 r. No arbitrary modular reduction in the private witness.
These are this local adapter's supported bounds, not a new shared protocol freeze.

The reader pins reads to one block and validates chain, contract domain, intended
verifier, passport and actual math-verifier addresses. It reads current passport
state and the matching issuance/refresh event (directory version is not in current
passport storage). Schema/version, signatures, expiry, freshness and consumer's exact
existing policy are checked **before the resolver is called**. Private metadata,
arrays, commitment and circuit context are checked next. After proving, chain state
and authorization are reread, so a refresh/revoke/expiry race rejects the result.
Consumers repeat their own authoritative checks at execution, including identity
claim/debt state and spent requests. This adapter does not invent a global proof-use
ledger; repeated read-only Verify is distinct from replaying Claim/Borrow.

The engine reuses the existing O1 Circom WASM/R1CS and actual snarkjs Groth16 prover.
It verifies the real proof against the session's exported verification key. It checks
artifact fingerprints before each job. One isolated job at a time bounds memory.
A private parent/child IPC pipe carries the transient input; WTNS is a memory buffer,
not a file. The child returns only proof/public signals and nonfinancial resource
metrics. stdout/stderr are discarded; errors after private access are redacted.
Success, failure and the 120-second timeout terminate the child; buffers are released
with process exit, and the explicit WTNS buffer is overwritten. This is process
isolation on a trusted local host, not a promise of forensic erasure of every JS/OS
memory copy. No plaintext evidence or witness file is written by the service.

Only public proof/29 signals and Solidity coordinates leave the service. Per-condition
FAIL remains an honest mathematically valid result; it cannot execute a consumer
action requiring all PASS. G2 coordinate conversion and ordering are documented in
the B4 compatibility review. No monthly amounts, activity arrays, raw transactions,
branch roots, exact counts or private start date are returned.

## Local setup, resources and boundaries

The existing prepared public power17 transcript is reused when available at
`circuits/.tools/powersOfTau28_hez_final_17.ptau`. A fresh machine downloads it from
`https://circom.info/powersOfTau28_hez_final_17.ptau` for free (about 144 MB).
`GIGVAULT_TEST_PTAU` optionally selects an already downloaded file. All paths require
the same pinned BLAKE2b-512 digest:

```text
6247a3433948b35fbfae414fa5a9355bfb45f56efa7ab4929e669264a0258976741dfbe3288bfb49828e5df02c2e633df38d2245e30162ae7e3bcca5b8b49345
```

The circuit-specific phase2 contribution is random, single-party and disposable.
The zkey, verification key, generated Solidity source, WASM and calculator fingerprints
bind the live setup. Each new session has new keys and contract addresses. Do not mix
proofs/ABIs/addresses from different sessions or label these keys production approved.

This O1 circuit has 80,274 constraints, 79,776 wires and 29 public signals. Existing
CLI regressions sampled roughly 1.4 GiB child working set; a several-GB free-memory
machine is advisable for setup/compilation. Service jobs intentionally use a
single-thread prover in an isolated child and take longer than the existing CLI
benchmark. Exact measured times and available OS child max-RSS measurements are
reported in the current B4 JSON; parent RSS is separately labeled and is not peak
total memory. Provisioning on a new machine additionally needs download/disk space
for pinned dependencies, the transcript and local keys. No browser/device benchmark
or hard minimum memory requirement has been established.

Ganache's optional native µWS binary is unavailable on this Windows/Node 24 build;
it uses its JavaScript fallback. All recorded EVM tests use this actual fallback.
Welfare remains the existing honest claim-event/state fallback, with no POL payout.
Lending transfers and repayment are real local MockUSDC token transactions.

The Backend A compatibility matrix is
`docs/review/BACKEND_B_B4_BACKEND_A_COMPATIBILITY.md`. Its legacy HTTP placeholder
and mock proof output cannot be connected as-is. Versioned metadata, verifier policy,
worker approval and an authenticated private transport still require shared review.
The implemented translator only renames/validates exact committed values after
authenticated reconstruction; it never supplies missing authorization or silently
converts committed units. Public-network deployment and live integration remain blocked
on those approvals; independent synthetic local testing is complete when tests pass.
