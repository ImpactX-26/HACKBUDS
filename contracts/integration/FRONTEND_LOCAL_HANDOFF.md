# Frontend ↔ Backend B local handoff

₹0, local chain 1337, synthetic identity/FIP and MockUSDC. No public deployment.
Frontend source inspected read-only at `origin/feature/frontend` commit `1372b64`;
its owner may have unpublished changes. Do not overwrite their branch.

## Running session

An independent seeded session was started on 9 October 2026 at
`http://127.0.0.1:8545`. Passport 1 is ACTIVE, schema 2, unclaimed, with zero debt.
Its live public bundle is:

`contracts/artifacts/local/session-dcnO5I/integration-bundle.json`

This contains inline ABIs, addresses, profiles, public-signal ordering and EIP-712
types. These addresses are ephemeral: use the ready event/bundle from the current
session, never a historical test report. Keep this process running; Ctrl+C or the
private `close` command stops it and cleans up. If it has stopped, run
`npm run local:start` in `contracts` to get a fresh bundle/session. Chain time is
the fixed synthetic fixture time, not current wall-clock time.

The running controller uses independent B synthetic evidence. The A→B integration
tests run separate temporary chains and close them; their receipts do not imply
that this foreground controller is connected to A's live HTTP service.

## Browser calls

Use `createBackendClient({bundle, provider})` from `client.mjs` (ethers 6.15.0).
No private prover is passed to the browser. Read with `getPassport` and
`getIdentityState`; get typed worker approval with `getApproval`, or use
`approveRequest` with an actual current-holder EVM signer. A backend supplies the
exact verifier-signed policy. After trusted proving, call `verify` and display
enabled PASS/FAIL conditions. Then invoke separate `claim` / `borrow`; repayment
uses `approveRepayment` / `repay`. Do not auto-approve, auto-claim or auto-borrow.

Local development wallets must actually control the synthetic holder address.
A generated P-256 browser wallet is not an EVM signing wallet. Do not export B's
private fixture signing capabilities to a browser or expose the unlocked local
RPC beyond this development machine.

## Authenticated backend → private prover

`worker-proof-bridge.mjs` exports a backend-only adapter. It provides no HTTP
listener or authentication service. The application supplies a callback that
verifies its server-owned session and wallet authentication and returns the
authenticated EVM address. A wallet string from request JSON is not authentication.

```js
import {createWorkerProofBridge} from './worker-proof-bridge.mjs';
const bridge = createWorkerProofBridge({
  client: trustedBackendClient,
  authenticateWorker: verifiedWalletFromApplicationSession
});
// Called by an authenticated backend handler, not directly from a browser:
const proof = await bridge.generateProof(approvedRequest, serverOwnedAuthContext);
```

With private parent/child IPC, the backend client can be composed as:

```js
const trustedBackendClient = {
  getPassport: passportId => host.call('getPassport', {passportId}),
  generateProof: request => host.call('generateProof', {request})
};
```

The host is owned by the backend through `startLocalBackend` in `process-client.mjs`;
it starts its own session. It does not attach to the separate foreground session.
Never forward generic `host.call`, `fixturePolicy` or `fixtureApproval` through a
browser API. Only expose specific authenticated operations. Preserve the exact
worker/verifier EIP-712 signatures; do not sign on a worker's behalf.

For A-derived evidence, `createBackendAIntegration()` exposes `h.api` as the
trusted client. Backend A owns identity assertion and signed
`RECONSTRUCT_EVIDENCE` action authentication. Register those explicit artifacts via
`h.registerReconstruction` to obtain a one-use private handle, attach it to the
worker-approved request, and call the bridge. A reconstructs its signed FIP data
afresh; B checks commitment/current state before proving. Do not send financial
arrays in browser requests. The bridge additionally checks the authenticated
wallet against the chain holder before invoking the existing secured SDK/prover.

## Exact changes needed in the inspected frontend

| Published frontend file | Required integration replacement |
|---|---|
| `lib/api.ts` | Its speculative `/relay/issue`, `/pay`, consent and registry paths are not B endpoints. Map public reads/actions to B SDK; use A's actual authenticated onboarding/attestation APIs for A operations. |
| `lib/prove.ts` | Replace `mockProof`, SHA-256 salted summary commitment and three public signals with the actual proof package and all 29 signals from B. Score band is not a proof signal. |
| `lib/wallet.ts` | Replace mock P-256 signatures/derived address in real mode with an EVM holder signer and exact EIP-712 approval. |
| `lib/types.ts` / verification view | Preserve complete decimal-string proof/public context; display only enabled condition results to verifier/consumer. Never forward exact summary amounts. |
| `lib/score.ts` | Keep categories frontend-owned. Its three-factor formula matches the user fallback; income is rupees here but B helper input is paise. Score remains separate from proof and consumer eligibility. |

No new universal role thresholds, missed-weeks condition, score-based lending
policy or score commitments are implemented by B. Existing welfare/lending
contracts and signed-policy checks remain authoritative.

## Remaining connection work

Frontend owner must provide the actual wallet/provider and application-authenticated
backend handler. B supplies callable bridge/SDK, not a publicly exposed proof URL.
Live A HTTP composition and all seven personas are not established by the single
synthetic Ramesh integration test. Keep simulated UI paths labelled until replaced
with actual backend results. Genuine real Aadhaar remains unverified.
