# Authentication and functional workflows — verified integration

Validated 10 October 2026 on `codex/product-completion`, starting from `bca87990ca8cf0ace2a175f931a36acd735fae3b`. This report supersedes the returning-OTP and ephemeral-state descriptions in the historical completion reports. It does not recast their earlier test runs as current evidence.

## Audit and recovery

Original frontend design source: `1372b64` (with later motion refinements in `598eb9e`). The design restoration commit `bca8799` retains its sky-blue grid, glass cards, serif GigVault wordmark, gradient primary actions, pills, checklist and responsive navigation. This change retains that restoration and the protected multipage architecture; no static mockup replaced an integrated page. Dedicated onboarding, overview, passport, evidence, privacy, requests, welfare, lending, activity and verifier routes remain. Development details stay in labeled disclosure panels. No new visual theme or assets were introduced in this functional correction.

| Before this correction | Implemented behavior and evidence |
| --- | --- |
| Account registry and chain were temporary application state | Private profile restores the same registry, signing keys, consent metadata, chain, deployment addresses, passport, requests and public proofs across separate backend processes. Sessions/OTPs/challenges remain temporary. |
| Returning accounts required another phone OTP | Fresh context-bound wallet signature restores a registered account without repeating registration, as required by the latest request. First registration still requires independent wallet challenge, random OTP and trusted synthetic identity binding. |
| Worker lending/welfare pages required a verifier-created request | Worker applies; authorized local service signs its fixed existing policy. Worker separately approves and authorizes reconstruction. No automatic approval, proof or consumer transaction. |
| Wallet provider handling lacked explicit change lifecycle | EIP-1193 account/network/disconnect events invalidate the frontend session; signature/transaction preflight checks account and chain. Newly added local chain is explicitly selected. Rejections propagate. |
| Expired requests vanished; stale/failed results could block reapplication | Bounded history retains expired requests and rejects their actions. Failed or obsolete verification allows a fresh policy, approval and proof. |
| Review metadata could advertise a later evidence cutoff | Reconstruction review uses the actual passport evidence timestamp; retrieval review respects provider consent scope. Signed authorization formats are unchanged. |

The existing implementations already supplied wallet signature verification, OTP limits, IDP/FIP signatures, provider consent, ownership, real Poseidon commitments, Groth16 verification and local consumers. These were reused rather than replaced. Pinned Backend A source is `51ac3e5db7dc7ff032e1256e6b7f71da7c9d770c` (41 module blobs verified). No changes to Backend A source, circuit source, Solidity source, shared financial/proof formats or EIP-712 consumer authorization rules are part of this correction.

## Changed integration surfaces

- `contracts/local/application-profile.mjs`: exclusive process ownership, private profile, atomic synced JSON replacement and fail-closed incompatible state.
- `contracts/local/deploy.mjs`, `session.mjs`, `app-session.mjs`, `app-start.mjs`: stable local chain/seed/RPC, deployment/setup/code checks, existing registry/consent restoration, durable Backend A replay store, serialized state mutations, worker applications and bounded history.
- `contracts/integration/process-client.mjs`, `local-wallet-auth.mjs`: profile propagation and authenticated connection mode. No address-based switching from external wallet to unlocked development wallet.
- `frontend/lib/application-server.ts`, `browser-wallet.mjs`, `app/api/app/[action]/route.ts`, `components/ProductApplication.tsx`: persistent normal application profile, wallet lifecycle, authenticated application actions, consent-expiry/renewal guidance, stale-result guidance and fixed local gas funding in the technical section.
- Test files add persistence, ownership, independent external-wallet transport and wallet-event regressions; existing authenticated application tests remain and were updated to the latest returning-login requirement.

`applyService` derives holder/passport from the authenticated worker and takes only the supported service selection. Caller-supplied policy criteria, passport, signer and signature cannot override the service policy. Consumer receipts must match authenticated sender, target, method, request ID, passport and successful chain consumption. `localGas` is a fixed 0.25 local test ETH transfer only to the registered session wallet, only below 0.1 ETH, once per day. These assets have no monetary value.

## Executed automated verification

349 passing checks across the following suites, counting Node's reported parent/subtest totals once per suite. Repeated runs are not added to that number.

| Suite | Passed | Observed final duration |
| --- | ---: | ---: |
| Existing Backend A tests (`npm --prefix backend test`) | 151 | 30.288 s |
| Existing passport, authorization v0.2, policy Solidity and trusted-prover tests | 74 | 38.072 s |
| Existing interoperability, Backend A gate, income/activity, field and eligibility tests | 86 | 18.183 s |
| Local wallet authentication | 5 | Passed |
| Application authentication / current evidence scope | 1 | 39.372 s |
| Independent external wallet integration | 1 | 29.336 s |
| Browser wallet lifecycle helpers | 5 | 0.164 s |
| Private profile ownership / corruption tests | 3 | 0.207 s |
| Separate-process persistence and service workflow test | 21 | 298.947 s |
| Full authenticated application, real proofs and consumers | 1 | 129.284 s |
| Production HTTP boundary, latest restart | 1 | 2.963 s |

Frontend production build and type checking passed, producing 31 routes. `git diff --check` passed. The complete older contract suite was not rerun: the table identifies the affected suites actually executed. Ganache used its Node fallback because its optional native uWS binary does not support this Node version; it did not prevent verification.

The persistence suite has 20 named subtests plus its parent: empty registry; first-registration ordering; real issuance; exact service policy/signature despite forged caller criteria; duplicate and role denial; foreign-wallet denial; explicit approval; same chain/address/commitment after restart; invalidated old sessions/challenges; fresh returning wallet login; restored FIP/consent; actual Groth16 borrow; persisted debt/receipt; actual allowance/repayment; fresh reborrow approval/proof; actual welfare claim; persistent revocation; lifetime claim; expired-history denial; and absence of persisted OTP/session/private financial arrays. The external-wallet integration also registers a second worker and checks private cross-worker access denial using an independently generated wallet, actual signatures and actual EVM transactions.

## Browser evidence

Production browser flow used labeled development wallets and synthetic RAMESH data:

1. Wallet connection remained pending registration. Independent registration challenge was signed. Random inline Mock OTP was visible; a wrong code was rejected; correct OTP still required explicit identity binding.
2. Reviewed/signed provider consent and separately authorized issuance of actual passport #1 (block 8).
3. Actual session expiry and orderly server restart required a fresh signature, restored the registered worker without OTP, and preserved the protected destination route.
4. Worker initiated Microcredit, received the service signature, explicitly approved the policy, renewed expired consent, authorized actual Groth16 reconstruction, then separately borrowed 100 MockUSDC (block 9).
5. Approved exact repayment allowance (block 10) and repaid (block 11). Live principal and wallet token balance became zero; a fresh application was available.
6. Renewed consent and refreshed actual evidence (block 12, evidence version 2).
7. Worker initiated Welfare, explicitly approved and generated an actual passing proof. Restarted the production server, signed in afresh, restored the VERIFIED public proof and separately claimed the lifetime benefit (block 13). UI showed CLAIMED and the actual receipt.
8. Signed owner-only evidence access: FIP signature/account verification succeeded; 327 authenticated rows, 144 recognized payouts, latest 100 displayed. No raw financial table was persisted by the application.
9. Logout returned to public signup. Configured verifier signed in through its separate entry and saw only requested criteria/PASS/FAIL, public context and receipts; the worker's private income and table were absent.
10. All eight worker and five verifier routes rendered at a 390 × 844 viewport. Document widths were at most 390 pixels. Evidence table scrolls inside its container; mobile navigation intentionally scrolls horizontally. Desktop onboarding, worker/service flows and verifier results were inspected. Temporary viewport override was reset.

Screenshots retained outside Git in the project workspace: `GigVault_functional_welfare.png` and `GigVault_functional_mobile.png`. They show the restored visual design with the actual confirmed welfare claim.

## Limits and publication

- No wallet extension is installed on this machine (user confirmed). Independent EIP-1193 test-provider acceptance is verified; actual MetaMask extension prompts/permission UX are not verified. Do not describe that as extension acceptance.
- OTP, identity and FIP are explicitly synthetic, and local service signatures use configured local verifier authority. Genuine SMS possession, Aadhaar, bank integrations and remote production service operation remain unavailable.
- The private profile contains service keys/dev seed and needs host protection; it is ignored by Git. Unlocked loopback development RPC accounts do not secure against a hostile local user. No credentials or generated private profile is included in the commit.
- Orderly separate-process restart is verified. Chain and account JSON are separate stores, not a cross-store transaction database. Abrupt crashes between mining and metadata persistence may require reconciliation. Preserve/back up the complete stopped profile; do not blindly reset chain or registration.
- Local archive is bounded to 512 requests / 90 days and 20 worker activity entries; expired actions fail closed. It is not an unlimited audit database.
- GitHub's configured remote is `https://github.com/ImpactX-26/HACKBUDS.git`. The push account must be `10Stardust01`; a different configured connector identity explained the earlier failure. Command-scoped credential selection is used without printing credentials, changing global configuration, rewriting history or force-pushing. Publication targets only existing `codex/product-completion` and PR #4; main is not merged.
