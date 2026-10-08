# Backend B — local integration package (B5)

Backend only. No frontend source, Backend A branch, shared codec, locked protocol or
consumer/circuit behavior is changed. ₹0; local Ganache, ephemeral development accounts,
actual Groth16 and MockUSDC. B4's cryptographic profiles remain explicitly provisional.

## What is callable now

From `contracts`, run `npm run local:start`. Initialization takes roughly a minute
on the tested machine. The foreground session remains alive until Ctrl+C or an
explicit close command. It deploys all six B4 contracts, funds the lending pool,
mints synthetic passport 1 with its correct commitment, and gives the synthetic
worker 100 MockUSDC for testing. It does not submit a welfare claim or loan on startup.

A `ready` JSON line reports the loopback RPC, bundle path, public synthetic worker
and passport. The bundle is `contracts/artifacts/local/session-*/integration-bundle.json`:

- `bundleVersion=gv-local-integration-b5/1`; existing B4 protocol/commitment/eligibility profiles.
- Six contract addresses with complete inline ABIs; no dependency on deleted ABI paths.
- Local chain/RPC, setup fingerprints, exact 29-public-signal order and EIP-712 types.
- Existing consumer-specific policies and public bootstrap worker/identity/passport data.
- Explicit local/synthetic labels and `publicProofEndpoint=null`.

No financial arrays, snapshots, witness files or private signing keys are exported.
The synthetic resolver regenerates a fresh transient fixture for each authorized job;
it does not retain a snapshot archive. Bundle/setup files are removed at shutdown.
Historical test-report bundles describe stopped chains, not current live addresses.

## Public SDK: frontend owner and Backend A chain reads

`integration/client.mjs` exports `createBackendClient`; `client.d.mts` supplies its
TypeScript types. It uses ethers and the exported bundle. It has no frontend UI or
private circuit dependency. The consuming application supplies its own provider/wallet.

```javascript
import {createBackendClient} from './integration/client.mjs';
// bundle is the public JSON from the running session, obtained through your backend.
const api = createBackendClient({bundle, provider});
const passport = await api.getPassport('1');
const identityState = await api.getIdentityState('1');
const nextId = await api.getNextPassportId();
const activeId = await api.getActivePassportByIdentity(passport.identityNullifierHash);
const canReissue = await api.isReissueAllowed(passport.identityNullifierHash);
```

IDs, monetary on-chain values, versions and timestamps are exact decimal strings;
status is ACTIVE/REVOKED. `getPassport` includes the directory version from the
current issuance/refresh event. Absent passports throw `PASSPORT_NOT_FOUND`; RPC
errors are not converted into a fake empty/ACTIVE result. Caller signers are required
for all transaction methods; this client has no default worker/admin/attester key.

Given the exact **verifier-signed** request and a connected current-holder signer:

```javascript
const approved = await api.approveRequest(signedRequest, workerSigner);
// Or getApproval() returns the public typed-data object for a separate wallet prompt.
const proof = await trustedBackend.generateProof(approved);
const conditions = await api.verify(approved, proof);
// conditions: per-condition PASS/FAIL and enabled flags; no exact private amounts/counts.
const claimReceipt = await api.claim(approvedWelfareRequest, welfareProof, workerSigner);
const borrowReceipt = await api.borrow(approvedLoanRequest, loanProof, workerSigner);
await api.approveRepayment(workerSigner); // exactly 100 MockUSDC allowance
const repayReceipt = await api.repay(passportId, workerSigner);
```

Worker approval is a separate explicit call; no proof or transaction helper silently
signs it. Each consumer has a distinct address/domain/request. Changing criteria
needs a newly signed policy, request and approval. `verify` does not claim/borrow.
Repayment does not require a new income proof; the current holder/replacement and
identity debt checks still apply. Transaction methods return hash, block, status and
gas-used strings after a real mined receipt. Contracts independently repeat all
authorization, math, exact-policy and identity/replay checks.

A valid FAIL proof is returned and verifiable; its failed conditions block Claim/Borrow.
`generateProof` on a public SDK without a trusted prover capability throws
`PROVER_UNAVAILABLE`. A browser cannot generate a proof merely by sending private arrays.
The frontend owner can immediately use the public read/approval/verification/transaction
SDK and bundle. Proving requires a backend-owned capability, not an unauthenticated URL.

## Persistent private controller: backend-owned local testing

`integration/process-client.mjs` starts/owns the foreground host over a private Node
parent/child IPC channel. It starts a fresh seeded session; it does not attach to an
unrelated running session. Use port 0 for an available loopback port or 8545 explicitly.

```javascript
import {startLocalBackend} from './integration/process-client.mjs';
const backend = await startLocalBackend({port: 0});
try {
  const signed = await backend.call('fixturePolicy', {consumer: 'loan'});
  // Explicit synthetic-only test approval; never a general real worker signer service.
  const request = await backend.call('fixtureApproval', {request: signed});
  const proof = await backend.call('generateProof', {request});
  const result = await backend.call('verify', {request, proof});
  await backend.call('borrow', {request, proof});
  await backend.call('approveRepayment');
  await backend.call('repay', {passportId: '1'});
} finally {
  await backend.close();
}
```

Methods: `getPassport`, `getNextPassportId`, `getActivePassportByIdentity`,
`isReissueAllowed`, `getIdentityState`, `getApproval`, `generateProof`, `verify`,
`claim`, `borrow`, `approveRepayment`, `repay`, `status`, `close`.
`fixturePolicy` and `fixtureApproval` are **explicit synthetic test helpers**, confined
to this private controller. Transaction actor selectors worker/replacement/other
refer only to ephemeral local development accounts. Actual policy/worker signatures
are still checked; supplying a forged/missing approval to `generateProof` rejects
before the private resolver is accessed. No HTTP route exposes these signer helpers.

The foreground CLI also accepts one JSON command per stdin line:

```json
{"id":1,"method":"getPassport","params":{"passportId":"1"}}
{"id":2,"method":"status"}
{"id":3,"method":"close"}
```

Responses are `{id,ok:true,result}` or `{id,ok:false,error:{code,message}}`.
Only public JSON is written to stdout; setup diagnostics go to stderr. IPC/stdin are
capabilities of the trusted local process owner, not public web transports. The RPC
itself is a synthetic unlocked development RPC; keep it on the local machine.
Parent disconnect, explicit close and SIGINT/SIGTERM stop the session. Shutdown waits
for active proving work to exit before removing its key/setup files; private jobs keep
B4's 120-second timeout and memory-only WTNS behavior.

## Exactly where Backend A connects

For real authenticated reconstruction use the **in-process owner factory**, not the
synthetic controller signer helpers. Backend A owns consent, identity assertion,
RECONSTRUCT authorization, trusted FIP signature/owner validation, curated source
classification and deterministic reconstruction. Backend B never replaces these.

```javascript
import {createSeededSession} from './local/session.mjs';
import {translateBackendAWitness} from '../circuits/service/backend-a-v1.mjs';
const session = await createSeededSession(); // local synthetic bootstrap remains available
const aClient = session.createClient({
  reconstruct: async handle => {
    // Trusted server callback; resolves an authorized source reference, not uploaded JSON.
    // Implement this using A's existing authenticated reconstruction + payload builder.
    const {passportId, payload} = await reconstructFromBackendA(handle);
    const current = await session.client.getPassport(passportId);
    return translateBackendAWitness(payload, {
      schemaVersion: current.schemaVersion,
      evidenceVersion: current.evidenceVersion
    }, session.hashes);
  }
});
// aClient.generateProof(approvedRequest) runs preflight BEFORE invoking this callback.
// Close session in the owning backend's finally/shutdown handler.
```

The callback receives only an opaque handle and returns the transient versioned B4
envelope (or translates A's exact current payload as shown). A must regenerate using
the passport's fixed evidence cutoff and event-recorded directory version, validate
current consent and owner binding, and discard plaintext after the call. The supplied
data must match the particular current passport/holder/version/commitment; metadata
copied from a different source/identity still fails commitment and holder checks.
Backend B rechecks chain state after proving. Never send the payload to the frontend
or keep a GigVault snapshot cache. A's four mock public signals are not real verifier inputs.

Use the bundle's actual passport ABI/addresses to implement A's existing live client
with the correct attester/admin signer. Expected-ID mint and lifecycle are still
authoritative in Solidity; this package does not attest worker-supplied JSON.
The synthetic passport will not match an arbitrary real A snapshot; connecting A also
requires its authenticated attestation/mint flow against this local deployment.

This is a precise callable integration point, not a claim of live A compatibility.
The B4 matrix still governs pending shared approval: tags/order/mappings and history/
monetary domains, EIP-712/domain/public manifest, versioned handoff/transport,
intended signer provisioning and deployable ceremony. No shared wire format is frozen
by `gv-local-integration-b5/1`.

## Stable local error codes

| Code | Meaning / caller response |
|---|---|
| REQUEST_EXPIRED | Request expired; obtain new policy/request/worker approval. |
| EVIDENCE_STALE | Current evidence exceeds that policy's freshness limit; refresh evidence. |
| EVIDENCE_CHANGED | Supplied proof binds an older current commitment/version; reapprove/reprove. |
| WORKER_APPROVAL_INVALID | Missing/wrong holder signature or approval for a different request/current evidence. |
| VERIFIER_SIGNATURE_INVALID | Policy signer/domain does not match the selected consumer. |
| INVALID_POLICY / CONSUMER_MISMATCH | Unsupported criteria or wrong exact consumer policy/action. |
| CONDITION_FAILED | Real proof verified but required conditions are FAIL. |
| REQUEST_REPLAY | This consumer already executed this request; Verify remains read-only. |
| ALREADY_CLAIMED / ACTIVE_LOAN | Stable identity business state blocks a fresh action, including after recovery. |
| PASSPORT_REVOKED / PASSPORT_NOT_FOUND | Use the current ACTIVE passport or complete issuance/recovery. |
| UNAUTHORIZED_WORKER | Transaction/approval signer is not the current holder. |
| INVALID_PROOF / PROOF_PACKAGE_INVALID | Invalid math or wrong setup/profile/public package. |
| PROVER_UNAVAILABLE / PROVER_REJECTED | Private capability absent or private preparation rejected; no financial details disclosed. |
| INSUFFICIENT_ALLOWANCE / INSUFFICIENT_BALANCE / NO_ACTIVE_LOAN | Exact local test-token repayment cannot proceed. |
| SESSION_CLOSED / BACKEND_UNAVAILABLE | Restart/reconnect local infrastructure; do not invent a successful result. |

Preflights improve diagnostics; they are not the security boundary. A concurrent state
change can still make a mined transaction revert. Ambiguous contract authorization or
transport failures return AUTHORIZATION_INVALID/BACKEND_UNAVAILABLE, not a fabricated
precise cause. Never forward private resolver errors or log source/witness data.

## Verification and handoff

Run `npm run integration:types` and `npm run integration:test` in `contracts`.
The latter starts actual deployments and real proof engines, tests the public adapters,
private persistent controller, claim/borrow/repay, honest FAIL, expiry/freshness,
altered evidence/public signals, replay and recovery. Reports contain only public
bundles, test names and timings under `contracts/reports/b5-*.json`.
No frontend work, paid infrastructure or public-network transactions are involved.
