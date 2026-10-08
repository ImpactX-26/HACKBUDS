# GigPassport isolated lifecycle work

Backend B implementation start, 8 October 2026. Implements the locked passport
semantics in GV-050 through GV-055 and directory lifecycle events in GV-034.
This is local EVM work, not an Amoy deployment or an integrated attestation/ZK stack.

## Run

From `contracts/`, with Node.js and npm installed:

```sh
npm ci --ignore-scripts
npm test
```

Pinned dependencies and transitive integrity hashes are in `package-lock.json`.
The tests compile Solidity 0.8.30 with optimization (200 runs), target Shanghai,
and deploy on a fresh in-process Ganache EVM per test. No RPC account, real
credentials, faucet funds or paid services are needed. Test accounts are ephemeral;
the suite never logs their keys. On Node 24, Ganache reports a missing native uWS
binary and uses its JavaScript fallback. That fallback is sufficient for these tests.
On this Windows host the sandbox blocked Ganache initialization; the successful
test run used the same command outside the sandbox.

## Implemented

- Attester-only mint/refresh; admin-only revoke and separate reissue authorization.
- Independent role keys, including overlap rejection on later grants; admin-managed
  role rotation through OpenZeppelin AccessControl.
- Contract-assigned sequential IDs, atomic expected-ID rejection, one ACTIVE
  passport per stable identity, latest/active mappings.
- Version increments, changed commitments and nondecreasing evidence timestamps.
- Issuance/refresh events retain cutoff and source-directory version.
- Terminal REVOKED state, stable identity on replacement, supersession link,
  explicit authorization consumed only after a successful replacement mint.
- ERC721 holder/balance/interface reads; transfers, burns and approvals are blocked.
- Missing-passport reads revert rather than returning an ACTIVE enum default.

## Interface and integration boundary

The ABI is a **local implementation proposal**, not a frozen cross-team codec.
`Evidence` carries opaque commitment/provider values and public lifecycle metadata;
`getPassport` returns the current credential. No private snapshot, transactions,
policy, benefit/debt state or proof result is stored. A test commitment such as
`123` is only an opaque state-machine fixture, never a Poseidon golden vector.

Implementation details: IDs begin at 1 (zero is the absent pointer); the constructor
grants role-management and lifecycle admin authority to the admin key, with a
separate attester key; future-dated evidence is rejected as timestamp sanity;
minting uses `_mint` without a receiver callback to avoid callback-driven lifecycle
changes while issuing a nontransferable credential. Contract-wallet receipt semantics
and ABI widths must be reviewed with integrators before deployment. Revocation
reasons are public: use non-sensitive reason text, never private identity data.

The authorized attester is trusted to validate worker initiation, identity, FIP
signature, consent and authenticated account-owner matching before mint/refresh,
and fresh identity/FIP before replacement. The contract cannot inspect an opaque
commitment or enforce those off-chain checks. ADMIN can manage roles; disjoint keys
do not make role management decentralized or prevent a malicious administrator.

No Poseidon tags, field modulus, digest mapping, signed-policy types or public-signal
ordering are frozen here. Consumers and proofs are not implemented. The stable
identity retained across replacement supports consumer-keyed claim/debt continuity;
actual welfare/loan persistence still requires consumer implementation and tests.

## Next dependencies

1. Review this isolated lifecycle implementation and its ABI with Backend A/frontend.
2. Jointly freeze the versioned evidence serializer, field mappings, Poseidon input
   order/tags and numeric bounds; generate matching TypeScript/Circom vectors.
3. Implement constrained circuit and mathematical verifier; freeze signed-policy,
   worker-approval and public-signal interfaces before consumer integration.
4. Test exact-policy enforcement, replay and identity-linked claim/debt persistence.
5. Deploy to Amoy only after the relevant integration gates pass.

Locked reference documents are unchanged. Passing lifecycle tests is not evidence
that FIP validation, ZK, consumers or the full security gate have passed.
