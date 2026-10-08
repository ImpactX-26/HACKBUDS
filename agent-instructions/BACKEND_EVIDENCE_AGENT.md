# GigVault — Backend A / Mock FIP and Evidence Agent

**Owner:** Backend A teammate. **Goal:** independently reproducible, authenticated, classified private evidence for GigVault attestation.

## Mandatory reading

Read root `AGENTS.md`, Decision Register, Implementation Plan, shared Poseidon review, integration rules. Confirm jointly with Backend B all cross-language wire formats before freezing them.

## Required modules

1. **Mock FIP / Bank**: one separate logical source DB/API for all seven synthetic personas. Consent creation/approval/expiry; source-retained individual transaction rows; realistic timestamps, rails, synthetic payer/processor metadata, credits/debits/self-transfers. Store pre-established trusted synthetic persona-to-account-owner mappings. No worker-editable bank JSON as evidence input.
2. **Signed provenance**: Mock FIP private signing key distinct from ATTESTER and ADMIN; signed response with account owner binding, consent, provider, transaction records, time range, payload hash and signature; use authenticated metadata only. Signature changes if transaction amount/remitter/timestamp changed after signing. Accurately label it a **mock FIP signing protocol**, not official AA format.
3. **Attestation verification**: server-to-server fetch by consentId; validate signature, consent, date range, trusted provider and owner mapping to Anon Aadhaar nullifier/mock identity binding, and wallet request authorization. Wrong-account FIP data must reject before mint/refresh.
4. **Payout-source directory**: curated, append-only mappings carrying `introducedInVersion` / optional `deactivatedInVersion`, reconstruct historical versions; authenticate payer/remitter/processor/account references, not narration only; exclude unknown/personal/self-transfer/salary/irrelevant debits.
5. **Canonical evidence derivation**: deterministic normalization (timestamp, txnId sort, stable string normalization), signed dataset `evidenceDataHash` independent of consent envelope ID/fetch timestamp/signature, nonnegative integer paise, earliest legitimate verified work start, fixed `evidenceUpdatedAt` cutoff, sourceDirectoryVersion. Arrays: 36 completed UTC months income/month-activity and 156 completed ISO weeks activity, oldest->newest, no partial periods, zeros for inactivity.
6. **Transient snapshot workflow**: reproduce approved snapshot fields exactly, including expected sequential `passportId` provided by contract, holder wallet binding, provider ID, stable authenticated digest, arrays. No GigVault persistent raw transactions or snapshot. Regenerate on new consent with original cutoff/directory version and commitment-match against current passport.
7. **Response boundaries**: Worker can view authenticated source rows + GigVault classification; downstream verifier receives only public metadata/results. Don't send mutable bank JSON to attester as proof of authenticity.

## Cross-team contract with Backend B

- Do not invent new Poseidon tree tags, hashes, holder/provider ID encoding, field order, policy hash, public-signal indices or calendar history formula. Ask Backend B for versioned shared manifest.
- Provide a **typed private snapshot fixture** with decimal-string field elements, `BigInt`/paise safe handling and expected dated bucket indexes. No floats, 53-bit JS integer overflow, or modulo reduction of unchecked scalar money.
- Build stable normalized dataset serialization test vectors. Exact serializer must be reviewed before treating `evidenceDataHash` as final.
- Import/use Backend B's shared Poseidon adapter, not a parallel homegrown implementation. Verify same fixture hashes match the compiled Circom output.
- FIP remains source of truth for raw rows; encrypted snapshot archive / private cache is not MVP.
- Recovery/reissue must validate same stable identity, new/current wallet and fresh FIP; old passport remains revoked.

## Persona fixtures (locked)

Ramesh Swiggy hero passes welfare and Microcredit; Suresh Uber+Ola parallel aggregation; Imran income/history PASS but activity 8/12 FAIL against Microcredit 9/12; Manjunath ~4 months history fails 6-month welfare history; Venkatesh clustered Porter payouts yet passes applicable activity; Farhan Swiggy→Zomato with same passport; Arjun clean baseline with controlled signature/commitment/stale/revoked/duplicate variants. All rows must be synthetic realistic transactions, not smooth aggregates.

## Must-fail tests

- Payload tampering invalidates signature; FIP signature cannot be bypassed by client-provided data.
- Anon Aadhaar verified worker A + FIP-signed account-owner binding for B rejects issuance/refresh.
- Narration “Swiggy” from unrecognized payer excluded.
- Friend/self transfers/debits excluded from gig earnings.
- Directory v3 replay still uses v3 even after adding a v4 source; new consent envelope with same data yields identical commitment.
- One paise changed in recognized payout changes normalized evidence hash and commitment (assuming no collision).
- ISO week UTC boundary, leap/year-end month boundary, partial current period, zero-filled months and week flags correct.
- Do not log/private-persist FIP responses or EvidenceSnapshot within GigVault.

## First instruction to coding AI

“Implement a separate signed Mock FIP and deterministic evidence pipeline under the locked GigVault trust model. Before shared serialization and Poseidon work, send Backend B the proposed canonical signed envelope, normalized byte format and a representative fixture; do not silently choose a different cryptographic format or fabricate signed provenance.”
