# GigVault local demo

Open http://localhost:3000/role to connect the authenticated Backend A record, or http://localhost:3000 for the designed landing page. The old port 3200 redirects to this site.

## Start again

Run `./Start-Local-Demo.ps1` from PowerShell. Keep the terminal running. Dependencies are installed locally. The verified proving setup is preserved in the ignored `contracts/artifacts/demo-setup-cache` folder; the runtime checks all six artifact digests and the setup ID before using it. This key is local only, not a production ceremony.

## Present the flow

1. Open the passport. It reads the actual seeded local EVM passport.
2. Choose Loan or Welfare and review its exact signed requirements.
3. Click Login & Sign Policy Approval using the selected local development wallet.
4. Generate the real Groth16 proof (about 25 seconds), then Verify on Solidity.
5. Borrow 100 MockUSDC or claim welfare. Each action has its own policy and approval.
6. Repay a loan to return principal debt to zero. The UI shows mined transaction hashes.
7. Use Show to a verifier for the public passport QR. This link grants no private evidence access.

A welfare claim is once per identity. Restart the local server to initialize a fresh test chain for another full welfare presentation. Refreshing the page does not reset contract state. A new loan needs a fresh policy request and approval; consumed proof requests cannot be replayed.

## Boundaries

The normal onboarding path authenticates the local worker wallet and connects Backend A's actual SHA-pinned Mock FIP, consent, bank-owner checks and Poseidon implementation to the same local deployment. Passport #2 uses its schema-2 evidence commitment. The browser separately signs A reconstruction authorization and B's exact verifier policy approval. Private evidence is reconstructed through A's private loopback HTTP router before real Groth16 proving. This is locally executed A source, not a separately deployed remote A server. Identity remains synthetic Mock IDP; no genuine Aadhaar or external bank is connected. MockUSDC has no monetary value. The illustrative Gig Score never changes backend eligibility. The large warning banner has been removed; technical details remain available in the dashboard drawer.

No changes were committed or pushed to GitHub in this local demo task. Existing uncommitted Backend A integration work was preserved.

## Verification performed

- Frontend TypeScript compilation: passed.
- Wallet authentication: 5/5 tests passed.
- Actual HTTP authentication/security checks: 10/10 passed.
- Main routes `/`, `/proof`, `/show`, `/verify`, `/passport`: HTTP 200.
- Local setup cache: exact digest/setup parity passed; altered digest rejected.
- Browser loan proof: actual 29-signal Groth16 proof, 24.05 seconds; income/history/activity PASS via Solidity.
- Browser loan: 100 MockUSDC borrowed, exact approval and repayment mined; principal returned to zero.
- Browser welfare: actual independent 29-signal proof in 21.46 seconds; enabled conditions passed Solidity verification and claim mined.
- All four transaction receipts independently checked on the local RPC: status 0x1. Final identity state: welfare claimed, principal zero.

Additional final browser results and transaction receipt checks are stored in `contracts/reports/local-demo-final.json`.

## Backend connection correction

- Replaced the mock persona/qualification picker at `/role` with authenticated backend onboarding.
- Added protected onboarding and reconstruction routes; consumer routes use the actual active passport ID.
- Actual pinned A private HTTP reconstruction smoke check passed.
- Existing A-to-B integration and trust regressions: 20/20 passed, including two real proofs and contract transactions on an independent regression chain.
- A-connected HTTP boundary checks: 12/12 passed, including no private reconstruction for forged approval.
- Browser A-backed loan proof generated in 22.82 seconds, accepted by Solidity, followed by real 100 MockUSDC borrowing and exact repayment.
