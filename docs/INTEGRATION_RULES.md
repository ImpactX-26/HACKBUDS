# GigVault — Cross-Team Integration and Ownership Rules

**Status:** Implementation workflow proposal; locked architecture remains in `docs/reference`.

## Ownership / interfaces

| Path (suggested) | Owner | Outputs | Consumers |
|---|---|---|---|
| `frontend/` | Frontend | Worker / verifier / consumer UI | Backend A/B read-only interface docs |
| `backend/fip/` | Backend A | Consents, signed envelope, persona rows, owner binding | Backend A attestation only |
| `backend/evidence/` | Backend A | verified/provenance check, normalized transactions, directory registry, snapshot values | Backend B prover |
| `shared/` | Backend A and B jointly | Schema, canonical codec, Poseidon adapter, policy/public signal manifests | Everyone |
| `contracts/` | Backend B | GigPassport, Groth16 verifier, WelfareVault, Microcredit, mock token | Frontend/Backend A |
| `circuits/` | Backend B | Circom source, witness manifest, proving/verification keys | Backend B proof generation, verifiers |
| `tests/integration/` | Backend A+B, frontend assists | Cross-language and end-to-end tests | Entire team |
| `docs/reference/` | Locked by user | Product specifications/decision register | Everyone |

Paths are suggested rather than product requirements. Choose project framework only after agreeing with other owners where it affects shared interfaces.

## Contract-first interfaces, not separately invented routes

Before adding an endpoint or frontend response shape, share an interface proposal specifying:
- operation purpose; caller; authority/authentication; required request fields; response fields; required visibility/privacy; errors; version;
- what is public vs private and whether data may be persisted;
- whether the result is FIP-authenticated, attested, proof-generated, chain-confirmed, or simply UI pending;
- one valid fixture and one failure fixture.

**Critical principle:** The frontend never sends editable bank JSON to issuance. Worker initiates with consent ID, identity proof/binding and wallet authorization. Attestation fetches signed data directly from Mock FIP. Any proof-response package excludes private witness and transactions.

## Shared evidence/proof handoff

**Locked snapshot fields:** `passportId`, `holderBinding`, `evidenceProviderId`, `evidenceDataHash`, `verifiedHistoryStartDate`, `evidenceUpdatedAt`, `monthlyGigIncomeTotals[36]`, `weeklyActivity[156]`, `monthlyActivity[36]`, `sourceDirectoryVersion`, and output-only `evidenceCommitment`.

- Backend A builds and tests provenance/normalization/aggregation, then provides **transient** private snapshot to authorized proving process.
- Backend B provides a **single** Poseidon adapter / hash-tree code and circuit-compatible ordered input/public-signal manifest.
- Backend A and Backend B run identical fixtures (including corrected signature-envelope regeneration).
- Use decimal strings or BigInt for field values; JSON numbers MUST NOT lose precision.
- The on-chain commitment represents exactly the same canonical data that the circuit constrains. No bypass where backend simply supplies a trusted claimed hash.
- Never store private transaction responses or EvidenceSnapshot in Git, logs, frontend persistence or off-chain GigVault database.
- The FIP, a separate logical trust boundary, retains synthetic source data and pre-established trusted persona-to-owner mapping.

## Runtime responsibility separation

**Worker:** signs/authorizes only approved request, never signs new verified income values.

**Mock FIP:** signs transaction provenance/account ownership metadata after consent; never sets `isGigIncome`.

**GigVault attestation:** verifies signature/consent/owner matching; recognizes payouts from versioned source directory; derives snapshot; attester wallet mints/refreshes.

**On-chain passport:** authoritative passport ID/status/identity/current evidence commitment & version.

**Prover:** can reconstruct authenticated data and prove predicates, but cannot replace worker approval or change verifier's signed policy.

**Verifier / consumer:** verifies canonical signed policy/worker approval, current on-chain state, Groth16 and consumer business conditions before any action.

## Integration gates

**Gate 0 — branch setup:** all read refs; keep secrets local; unrelated directories untouched.

**Gate 1 — canonical vector review:** FIP sorting/normalization; account-owner mapping; completed UTC buckets; numeric coercion; Poseidon tags/ordering; policy signing/binding; decision sign-off.

**Gate 2 — isolated tests:** Mock FIP signature tamper rejection; contract mint roles and expected ID; circuit witness/proof correctness; frontend states using explicitly simulated adapters.

**Gate 3 — cross-language tests:** Actual matching Poseidon outputs in JS and compiled Circom; snapshot regeneration under new consent and same cutoff; committed witness tamper fails; policy fail outputs honest per-bit results.

**Gate 4 — integrated off-chain verifier:** exact signed immutable policy + worker approval + current passport proof binding; no raw transactions flow to verifier.

**Gate 5 — value actions:** welfare one-claim-per-identity incl. replacement; microloan one-active-per-identity incl. replacement; spent requests rejected; contract can't accept relaxed policy or borrowed/verifier identities.

**Gate 6 — visible demo:** real tx hashes/explorer links; all seven personas seeded; Arjun security failures at correct stages; fallback technical labels honest; no unsupported production claims.

## Branch hygiene

- One feature branch per developer; make small coherent commits and open PRs into shared main. Avoid shared source-file edits concurrently.
- Shared codec/circuit changes require Backend A + B review, then frontend updates if UI metadata changes.
- No changes to `docs/reference` without explicit approval and a new synchronized version.
- Run own tests before PR, post exact commands and pass/fail evidence. Unrun tests are NOT complete.
- Never commit `.env`, private keys, witness files, raw bank rows with real identities or sensitive material, generated proofs containing private witness inputs, or production credentials.
