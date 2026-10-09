# Contributing

Read `AGENTS.md`, the locked decision register and your ownership instructions before changing code. Work on a branch and keep changes focused.

- Frontend: `frontend/`; evidence/Mock FIP/identity: `backend/`; ZK/Solidity/prover: `circuits/` and `contracts/`.
- Changes to `shared/proposal/` need both backend owners to reconcile encodings and test real TS/Circom parity. REVIEW constants are not new approvals.
- Preserve `docs/reference/`; record later approvals and implementation status separately.
- Include concrete behavior, interface/version changes, exact test commands/results and remaining gaps in each PR.
- Never commit raw financial records, private witnesses, identity secrets, credentials, wallet keys, proving keys, generated dependency caches or real Aadhaar documents.
- UI sample steps must stay separate from authenticated backend authority. A disabled button is never a security boundary.
- No force pushes to main. Merge only after relevant tests and compatibility review pass.

No new license is assumed. Maintainers must decide licensing explicitly.
