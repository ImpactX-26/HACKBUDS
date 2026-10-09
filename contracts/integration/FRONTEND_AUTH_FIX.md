# Tested frontend authorization patch

Prepared against frontend commit `4e9e77cb5d872aa247309a1f26da29d6c8940e56`.
The owner's branch/checkout was not edited. A separate ignored copy was patched,
typechecked, served on loopback and used through the actual browser UI.

## Apply in the frontend owner's checkout

First merge the Backend B commit containing this file, `local-wallet-auth.mjs`,
its types and `frontend-auth-fix.patch`. Keep PRs draft and unmerged.
From repository root:

```powershell
git apply --check contracts/integration/frontend-auth-fix.patch
git apply contracts/integration/frontend-auth-fix.patch
cd frontend
npm ci
npm run typecheck
npm run dev -- --hostname 127.0.0.1
```

Open `http://localhost:3000/live`. If using another origin/port, set server-only
`GIGVAULT_APP_ORIGIN` to exactly the browser origin before starting Next.
If patch check fails because the owner has subsequent edits, preserve them and
reconcile the patch; do not reset or overwrite the checkout. This is a concrete
patch, not a request to invent another implementation.

## What changed

- Login challenge is server-created, expires in two minutes, binds wallet,
  nonce, app origin and live passport-contract domain. Verify the actual EVM
  signature before issuing an HttpOnly, SameSite=Strict cookie. Nonces are
  single-use, sessions expire after 30 minutes, tokens are hashed in memory.
- Protected routes ignore caller-supplied wallet identity. Verify the cookie and
  current ACTIVE holder before invoking the bridge or signing local transactions.
  Wrong-origin mutating requests are rejected. No global fake verified session.
- Policy route returns only verifier-signed policy plus actual `getApproval`
  domain/types/value. Browser obtains a real signature; no dummy signature,
  hardcoded consumer address or exposed fixture worker-approval helper.
- Explicit checkbox selects the local synthetic unlocked Ganache EVM signer;
  signatures are real and locally verified, with no private-key export. Unchecking
  it uses an actual injected EVM wallet controlling the current passport. The
  injected-wallet mode has not been tested with a physical MetaMask installation.
- Singleton startup promise prevents duplicate local chains on concurrent loads.
  Added direct pinned ethers dependency and bounded Next tracing root. Existing
  UI/design/categories remain; existing hardcoded score is labelled illustrative.

This authentication encoding is a local application implementation detail, not
a new shared financial commitment, signed verifier policy or ZK protocol choice.
Financial circuits, policies, consumer contracts and 29 signals are unchanged.

## Actual verification

- `node --test test/local-wallet-auth.test.mjs`: 5 passed, 0 failed.
- `node test/frontend-auth-http.mjs` against the patched Next server: 10 passed.
  Actual routes reject copied public holder addresses on prove/claim/borrow/repay,
  wrong origin, forged login, nonce replay and dummy worker approval. Positive
  login and exact approval signatures recover the real synthetic holder.
- `npm run typecheck` in the isolated frontend: passed after final changes.
- Patch application check passed against an untouched copy of the exact frontend
  checkpoint, preserving original line endings.
- Actual browser clicks: real login + policy approval; unauthenticated proving
  and borrowing rejected; two real 29-signal Groth16 proofs (23.94 s and 26.65 s);
  Solidity PASS for the loan and separate welfare policy; 100 MockUSDC borrowing,
  exact allowance/repayment and welfare claim. All four mined receipts independently
  confirmed through RPC; final identity debt zero, claim true.

Public evidence: `reports/frontend-auth-http.json` and
`reports/frontend-auth-browser.json`. No authentication cookies, nonces, private
keys, financial arrays or witnesses appear in those reports.

The test app remains at `http://localhost:3200/live` while its process is running.
It is an isolated review copy, not the owner's deployed frontend. Its fixture has
already claimed welfare and repaid its loan; restart for a fresh unclaimed fixture.
The UI uses B's independent synthetic evidence, not live Backend A HTTP. Main
persona screens remain outside this patch. Production build and physical-wallet
connector testing were not run. Local unlocked accounts are disposable test
accounts, not production authentication infrastructure. Spend remains ₹0.
