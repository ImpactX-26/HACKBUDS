# GigVault — AI Development Handoff (review version)

**Purpose:** Let four teammates use one GitHub repository and different AI coding assistants without drifting from the agreed GigVault architecture.

**IMPORTANT:** This package is a *pre-implementation review handoff*. It does not assert that the unresolved Poseidon wire constants, data serializer, calendar-history comparator, approval-signature format, or on-chain consumer policy guard have been approved/tested. Marked **PROPOSED** details need explicit review before being frozen into on-chain commitments or shared interfaces.

## Folder map

- `AGENTS.md` — root constraints for actual code repo; Codex should read at repo root.
- `docs/reference/` — synchronized implementation/frontend/presenter/decision-register snapshot, preserved except for the documented filename and synchronization-note corrections; authoritative **LOCKED** behavior.
- `docs/review/SHARED_EVIDENCE_POSEIDON_SPEC_REVIEW.md` — previous detailed candidate array tree, tag choices and encoding; proposed wire constants.
- `docs/review/VERIFICATION_AUTH_AND_CONSUMERS_REVIEW.md` — precise proposed worker approval, immutable policy and consumer verification boundary.
- `docs/review/CRYPTO_AND_TEST_GATES.md` — explicit unresolved cryptographic fields, tests and required golden-vector generation instructions.
- `docs/INTEGRATION_RULES.md` — repo/branch/ownership/shared artifacts/test gates.
- `agent-instructions/FRONTEND_AGENT.md` — give to frontend AI.
- `agent-instructions/BACKEND_EVIDENCE_AGENT.md` — give to Mock FIP/evidence AI.
- `agent-instructions/BLOCKCHAIN_ZK_AGENT.md` — give to user + Codex for Backend B.

## Team and role boundaries (locked)

| Teammate | Focus |
|---|---|
| Presenter | Pitch and judge Q&A, truthful demo/test checks |
| Frontend developer | Worker, Verifier, WelfareVault, Microcredit, Admin, Security checks |
| Backend A | Mock FIP, account binding, consent, source directory, classification, deterministic evidence |
| Backend B (user + ChatGPT/Codex) | Solidity, Circom/Groth16, Poseidon adapter, Amoy, welfare/lending contract integration |

## How to use

1. Create/open the **real shared GitHub repository**, not the `.chatgpt-projects` source mirror. Copy this package into its root.
2. Ensure all agents read `AGENTS.md`, their own role instruction file, and `docs/reference` before editing anything.
3. Start on branches (suggestions: `feature/frontend`, `feature/evidence`, `feature/blockchain-zk`). The *actual names* are a team workflow suggestion, not a product decision.
4. Frontend and Mock FIP may build isolated UI/API scaffolding with interface adapters; label stub results and do not simulate success in place of real cryptographic checks.
5. **Gate 1:** Backend A/B jointly freeze canonical serialization, expected field order/values, Poseidon implementation versions, signed policy and worker-approval schema.
6. **Gate 2:** Run real Poseidon golden fixtures across TypeScript and compiled Circom before anchoring evidence on-chain.
7. **Gate 3:** Demonstrate policy-specific on-chain verification rejects weaker policies, unauthorized workers, stale evidence and replays.
8. Integrate frontend through agreed APIs, not direct assumptions about contract internals.

## Things still awaiting decision / verification

- Proposed exact Poseidon constants, tree-node tags and metadata ordering; these are not automatically approved by generating this pack.
- Canonical FIP transaction normalization and digest-to-field encoding.
- Precise cryptographic library versions and actual matching hash outputs (local environment lacks `circomlibjs` and Circom; **not verified here**).
- Circuit-safe paise bounds and calendar-history comparison formula.
- Exact shared signed-policy and worker-approval encoding plus the consumer's enforcement implementation.
- Exact API route names and Git workflow mechanics are implementation decisions, not architecture changes.
- Final judge-demo order is genuinely pending.

## Documentation safety

The full four main reference documents from the uploaded ZIP are preserved in `docs/reference/`, with only five shared-Poseidon filename references and the stale Decision Register synchronization reminder corrected. This handoff adds operational instructions and **review proposals**, not unapproved product changes. Once the remaining details are reviewed, replace review labels with approved version identifiers and regenerate the golden values from real code.

## Package verification and approval provenance

Publication preparation on 8 October 2026 verified all 20 uploaded ZIP entries by decompression/CRC and all 14 original manifest entries by byte count and SHA-256. All 15 expected files were present; no duplicate or unsafe paths, symlinks, or encrypted entries were found. The source ZIP SHA-256 is `0fb3322d881bd8faa1ec7279a96a87740a277c6c99468c91e3b0ab0957453fcd`. The manifest is regenerated for this edited revision and intentionally excludes its own checksum. These checks establish internal consistency, not independent authentication of the package's origin or its claimed approvals.

The retrieved planning conversation does not expose every later approval or the full earlier assistant responses. Decision Register IDs are topic labels, not approval citations. The three local project-reference files differ from the uploaded ZIP versions and cannot independently substantiate the package's earlier "copied unchanged" claim. For this publication, the uploaded ZIP is the content baseline; historical project files and the original ZIP remain untouched. Existing **LOCKED** and **PROPOSED / REVIEW** classifications are retained as the handoff states them, without asserting newly verified historical approval or approving pending protocol details.

This revision contains documentation only. No cryptographic implementation tests, golden vectors, Solidity proof verification, deployment, or audit are claimed by the package-integrity checks. Suggested code directories in `docs/INTEGRATION_RULES.md` remain workflow proposals; no scaffold or generated cryptographic artifacts are added.
