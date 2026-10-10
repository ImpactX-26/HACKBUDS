# Product completion validation — 2026-10-10

Base: published main `a1e902dae141560ae7c6462bc2db54db528c2d90`. Isolated branch `codex/product-completion`; no edits to original developer checkout or synced reference sources. Remote refs refreshed during this run. PR #2 and #3 are already merged/closed, as verified via GitHub; this work did not merge or close them. Backend A remains executed from SHA-verified blobs at `51ac3e5db7dc7ff032e1256e6b7f71da7c9d770c`; loader now includes five already-implemented onboarding/phone modules. No changes to `circuits/`, `shared/`, Solidity sources or locked references.

## Targeted reconciliation

The existing A provenance, owner/consent checks, calendar/classifier, Fr/Poseidon/schema-2 codec, B trusted prover and consumers were reusable. The missing product boundary was actual onboarding/session/identity selection connected to those services: emergency pages used a seeded worker and simulated success/metrics, and lacked a usable verifier/admin journey. The new private application controller connects A's existing wallet/onboarding/OTP/registry/IDP/consent/attestation modules to B's real deployment and prover. It begins with no seeded passport. Roles are wallet-gated; public addresses are not authentication. Actual worker signatures authorize consent, mint/refresh/reissue, immutable policy approval and reconstruction. Consumer transactions are signed by the connected worker rather than server fixture keys.

The scalar-field and Aadhaar trust corrections were verified by existing regressions, not reimplemented. No new cross-team protocol, circuit, policy rule or universal score was introduced. Application-specific session/route metadata remains separate from the existing signed financial/proof formats. Freshness requires consent covering the actual evidence cutoff; refresh obtains fresh consent instead of relabelling older scope as current evidence.

## Executed local results

| Gate | Actual result |
|---|---|
| Backend A `node --import tsx --test test/*.test.ts` | 151 passed, 0 failed |
| Fr, TS/Circom commitment interoperability and income/activity predicates | 49 passed, 0 failed |
| Selected passport, authorization, policy Solidity, A trust/schema, wallet auth, worker bridge, A/B real proofs, persistent IPC and trusted-prover regressions | 122 passed, 0 failed; 362.382 s |
| New application lifecycle acceptance | 1 passed, 0 failed; final 89.488 s; three actual Groth16 proofs |
| New connected frontend HTTP boundary | 1 passed, 0 failed |
| Frontend TypeScript | Passed |
| Final Next.js production build | Passed; all 27 routes built; middleware quarantines old routes |
| Reused proving prerequisites | All six artifact digests and setup ID verified; setup `078aecf920f5b0deae701f92c1119f3e14f7bef8421d352773dcd23d6340201a` |

Total: **324 passing Node cases** across the selected final runs. The single application case contains sequential multi-role and adversarial assertions; it is not 324 browser tests. Initial implementation runs exposed an incorrect test error assertion and a signer-bound preflight call; both were fixed and the complete application test rerun successfully. A restricted build initially hit a filesystem permission error; the final build completed using authorized local access.

Coverage includes signed FIP forgery/wrong-owner rejection; conservative payout classification; staging-root/arbitrary-key rejection; Fr/Fq boundaries; 36 completed months/156 completed ISO weeks and epoch-day parity; full 29-signal context and EIP-712 binding; tampered private evidence and proof packages; stale/expired evidence; modified policies; forged approvals; cookie/login/action replay; unauthorized private mailbox, evidence and admin access; terminal revocation and duplicate ACTIVE identity; replayed welfare/lending requests; debt/lifetime welfare persistence through replacement; actual exact repayment; and absence of financial arrays/witness/key fields from verifier HTTP responses.

The new application test mints Ramesh, generates/executes welfare and lending proofs, revokes/authorizes recovery, requires replacement wallet/OTP/matching signed identity, reissues a stable-identity passport, transfers actual borrowed tokens to the replacement and repays. It then mints Imran, generates a real income PASS/activity FAIL loan proof, rejects borrowing, refreshes under renewed consent and rejects further refresh after consent revocation.

## Browser acceptance actually exercised

Against the built Next.js application at localhost:3000, using actual unlocked loopback EVM wallets:

1. Worker server-challenge login; separate signed onboarding challenge.
2. Random, authenticated mock OTP mailbox; OTP entry; signed synthetic Ramesh identity binding.
3. Explicit signed FIP consent and actual passport #1 issuance; dashboard showed schema 2/current chain commitment.
4. Separate verifier login; signed exact loan and welfare requests.
5. Worker login; separate exact-policy approvals and signed reconstruction authorizations.
6. Real loan proof verified in Solidity: income/history/activity PASS. Actual 100 MockUSDC transfer and 100 debt appeared.
7. Actual exact allowance and repayment: debt and balance returned to zero.
8. Real welfare proof verified: income disabled/history and activity PASS. Actual claim transaction, lifetime claim true, no token benefit.

Observed borrow receipt: `0x0d945bdb9174e3827f5f17defb7448f309ad5c5bb36a27203cfa8e4d2ff9d787`.
Observed welfare receipt: `0xb5f114fc68b1e7479d6f7e1b29334773126dd1fcabdf818cd5c1c88ce588e09f`.
Browser screenshot retained as a local deliverable, outside Git: `GigVault_browser_acceptance.jpg`. It contains clearly synthetic worker aggregate data, not raw financial arrays. Browser automation encountered modal timeouts; fresh tabs confirmed server-side approval state and continued the flow. The final UI moves approval confirmation after request retrieval to avoid the synchronous modal click issue.

Final QR/session presentation edits were typechecked and rebuilt after the complete browser flow. Final HTTP security checks and browser smoke checks verify that built presentation separately; the expensive Groth16 flows were not needlessly rerun for QR rendering. Controlled recovery and valid-FAIL flows were exercised at the actual service/EVM boundary, not through browser clicks. Injected browser-wallet extensions and translation were not exercised. All original demo sources are preserved but redirects/410 prevent them authorizing product actions. No generated raw witnesses, private keys, proving entropy or runtime financial reports are added to Git.

## Limits

This meets the supplied local development-wallet acceptance environment. It is not production, genuine Aadhaar/SMS, live bank, public Polygon deployment or persistent hosted service. Onboarding/requests and Ganache state are in memory. Development RPC wallets are unlocked: application wallet authentication cannot secure them against a hostile local machine user. External/replacement wallets require their own local gas/test-token funds. The original protected phone reference remains registered through recovery. Proof generation is serialized. See `APPLICATION.md` for the single startup command and reproducible checks. Hosted CI results must be checked on the PR; local results above are not represented as hosted results.
