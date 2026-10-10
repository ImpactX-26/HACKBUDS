# Original frontend design integration

> Historical validation record. For the subsequent persistent-account and worker-initiated workflow delivery, see [AUTHENTICATION_AND_WORKFLOWS_VALIDATION.md](AUTHENTICATION_AND_WORKFLOWS_VALIDATION.md). Its current behavior supersedes earlier returning-OTP and ephemeral-state descriptions below.

## Source and comparison before edits

The earliest imported frontend is `1372b64cf68489c6ef1ca7a7876b914a2724713c` (9 October 2026, 07:05 IST). Its `globals.css`, `SiteHeader`, `Checklist`, `FourFigures` and landing markup establish the visual identity. `598eb9e4043ac3fe584961de031386957b6e25fb` adds tactile controls and motion. Later demo/auth/integration commits were not used as design authority. The original imported UI already used client-side session state; its visual provenance does not make that login mechanism authoritative.

| Earlier design | Multipage version before this change | Integration |
|---|---|---|
| Blue gradient serif GigVault wordmark | G icon and plain wordmark | Original wordmark, shared Brand component |
| Sky-blue radial backdrop and 40px grid | Flat grey/navy surfaces | Original background and color tokens on every route |
| Translucent rounded cards, blur and depth | Opaque shallow cards | Glass treatment applied to existing cards/auth/forms |
| Blue gradient buttons and tactile hover/focus | Flat rectangular controls | Restored gradients, rounded controls, accessible focus and reduced motion |
| Selectable panels, pill navigation | Dedicated sidebar and public links | Original panel/pill treatment; current real routes preserved |
| Colored metrics/checklist | Plain tiles and green status chips | Original unchanged Checklist used for real signed/approval/context/proof outcomes; context failure is red |
| Four gig-work categories | Generic passport illustration | Original category names/icons returned as informational chips |
| Role-specific score/weekly assumptions | Real current backend summaries | Retained authenticated totals and exact policy conditions; no invented score mapping |

No image/logo/font binaries existed in the original tracked public directory: only `video/.gitkeep` and `zk/.gitkeep`. The old hero referenced Google sample videos unrelated to actual gig work; these were not restored. The canvas decoration is represented by the original grid/radial CSS, without a perpetual canvas loop. English/Kannada old header controls are not presented as translating the new English product routes. The product retains its new public passport illustration, sidebar, dedicated routes and guided stepper rather than recreating the old role-first page.

## Scope

Only frontend presentation and this report change. `original-design.css` adapts original tokens to existing `gv-*` surfaces; the original global stylesheet and components remain in history. The existing Checklist is imported unchanged. Actual wallet signing, OTP, identity, consent, session/role guards, controller/prover and contract behavior are not modified. Primary screens retain concise synthetic-data disclosures; detailed environment information is expandable. Consent and test-token disclosures remain visible where they affect a decision.

## Validation

Production build/typecheck passed. Staged authentication and wallet-auth regression: 6 cases passed, 25.902 seconds. Production HTTP boundary: 1 case passed, 26.185 seconds, including anonymous/forged-cookie/pending-worker/private route and role checks. Browser acceptance and publication results follow below.

## GitHub publication diagnosis

Origin is `https://github.com/ImpactX-26/HACKBUDS.git`. Configured helper is Git Credential Manager 2.6.1; account enumeration needs the permitted host context. Two existing accounts are stored: `10Stardust01` and `divyanshuacharya0990-lab`. The connected GitHub app authenticates as the latter; PR #4 is owned by the former. A command-scoped `credential.username=10Stardust01` with interactive prompting disabled successfully read the branch. At inspection the integration head was `10a76ab9ad4f087bcafd275c3e56207becd0bd1d`, main `a1e902dae141560ae7c6462bc2db54db528c2d90`. No secrets were printed, and no credential or account was replaced. Git author configuration is separate from authentication. Publication must use the existing account and a normal fast-forward push after checking the current remote head.
Restored browser journey so far: supplied development worker completed wallet/registration signatures, wrong OTP rejection, random-code verification, explicit RAMESH identity, reviewed signed consent and actual passport #1 issuance. Private signed FIP view returned 327 authenticated rows, 144 recognized payouts and latest 100 sanitized rows. Separate verifier signed loan and welfare policies. Worker deep link preserved its request ID through logout, fresh registered-phone OTP and protected redirect. Actual loan proof verified in Solidity; borrowing/allowance/repayment mined in blocks 9/10/11, with real debt and balance returning to zero.
The independent welfare proof passed and the lifetime claim mined in block 12. Protected reload retained the authenticated worker and actual results. Mobile browser test at 390x844: document/body 375px, no page-width overflow; navigation has a deliberate 908px scrollable track inside 338px, and the restored checklist is one 289.6px column. Mobile provider consent revocation was exercised. Desktop checked at 1440x1000. Screenshots are local deliverables outside Git. Final changes align mobile heading actions below the title and soften technical disclosure panels; a final build/smoke check follows these presentation-only adjustments.
Final production rebuild passed and the final HTTP boundary rerun passed (37.976 seconds). The final mobile signup smoke check exposed a 599px grid min-content overflow at a 390px viewport; the auth grid/story now use explicit shrinkable tracks and min-width:0. This was caught before committing; the final mobile signup check is repeated after the CSS repair. No authorization or backend code changes are involved.
The CSS repair production rebuild passed. Repeated mobile signup measurement is now viewport 390px, body/document 375px; heading, disclaimer, stepper and authentication card remain within the page. The stepper scrolls inside its own container. No page overflow remains. Both viewport overrides were reset and temporary test tabs closed. Final visual-only adjustments were smoke-checked after the expensive real proof/transaction browser flow; the unchanged crypto flows were not regenerated for CSS sizing.
