# Pre-coding review — remaining shared interface decisions

**Purpose:** One concise checklist for team sign-off, not another indefinite product planning cycle.

## Already approved — do not reopen

1. GigVault evidence provenance, signed Mock FIP, trusted bank-account-owner binding, source directory, exact snapshot logical fields.
2. Contract-controlled passport numbering, ACTIVE/REVOKED, authorized reissue, identity-linked consumer claim/debt state.
3. Completed UTC monthly/ISO weekly buckets, paise/date/time/boolean scalars.
4. Hierarchical Poseidon, in-hash domain separation, four children/node, deterministic zero padding, 36/156/36 vectors.
5. Generic immutable signed verifier policy, per-condition PASS/FAIL, exact policy and worker approval enforced for monetary actions.
6. Welfare/Microcredit rules, personas, frontend journeys and stage-accurate tamper demo.

## Decisions requiring a single shared sign-off before cryptographic wire compatibility is frozen

- [ ] **Canonical evidence digest** — exact normalized signed-record serializer and digest-to-field conversion, including trusted owner binding.
- [ ] **Poseidon v1** — adopt/revise specific domain integers, level order, 10 metadata slots, holder/provider-to-field encodings, root formula from Poseidon review doc.
- [ ] **Circuit numeric safety** — integer bit limits and fully constrained predicates; history-month comparator meaning and time-boundary fixture.
- [ ] **Signed policy / approval v1** — exact EIP-712 type/domain, worker approval signature, bytes32-to-field mapping, current wallet binding and consumer-specific enforceable policy check.
- [ ] **Golden test evidence** — independently executed matching TypeScript and compiled Circom Poseidon outputs for pinned package versions; Solidity proof verification and wrong-policy negative tests.

The first four are engineering design choices to approve or revise. The last one is **test evidence**, not something an approval alone can replace.

## Ready immediately, independent of the wire-freeze

- Frontend shell/forms/components using approved visible fields and clearly marked fixture adapters.
- Mock FIP persona data, consent state/signature verification and independent source-directory entries.
- Solidity passport role/identity/mint/refresh/revoke/reissue tests independent of final Poseidon outputs.
- Presentation material based on locked references; don't claim untested code is deployed.

## Not ready to claim implemented/secure until gates pass

- On-chain accepted evidence commitments derived from an unapproved encoding.
- Circuit/verifier compatibility and golden proof values.
- Welfare/Microcredit state-changing actions driven by untested generic policy/approval schemas.

## Recommended coordination

Backend A and Backend B propose one versioned schema together and run the same fixtures. Frontend consumes that schema, never defines it. User approves deviations from locked architecture; engineering details may be jointly selected only where they do not become new product/security behavior. If a technical choice changes public proof interpretation or consumer authorization, request explicit user sign-off.
