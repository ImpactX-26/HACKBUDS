# Backend B shared crypto proposal

**PROVISIONAL / REVIEW.** User-authorized Gate 1 prototyping, not final protocol approval.

`poseidon5.ts` is the single implementation of the five-input adapter, fixed four-child trees, proposed tags/order, strict field validation and commitment calculation. It uses actual `circomlibjs` **0.1.7**. `field-mappings.ts` implements the candidate full-SHA256 big-endian/mod-r, uint160 EVM address and domain-prefixed provider mappings with explicit byte-width/ASCII validation. It does not implement or approve a transaction serializer. Backend A's proposed schema is preserved as a frozen test input in `circuits/review-inputs/`, not overwritten here.

The lab compiles both shared modules from a common repository root into its own `dist/`, where its pinned npm dependency resolves. A consumer should install exact `circomlibjs@0.1.7`, include these source files in its own TypeScript build using a common source root (or agreed bundling/package setup), and consume the same implementation. Do not copy/rewrite the hash algorithm. The minimal private ESM package marks module/dependency expectations; it is not a published production package or independent installed toolchain.

```typescript
const hashes = await createProvisionalPoseidon();
const result = hashes.commit(input); // bigint or canonical unsigned decimal strings
// result: incomeRoot, weeklyRoot, monthlyRoot, evidenceCommitment, metadataSlots
```

All input fields must be in `[0,r)`, arrays exactly 36/156/36 and flags binary. Commitment is output-only. Use canonical decimal strings in the witness transport; explicit digest-to-field conversion is the only mapping that reduces modulo r. Provider ID grammar `[A-Za-z0-9][A-Za-z0-9._-]{0,127}` and the 0x-prefixed address convention are prototype validation choices requiring coordinated sign-off.

Run `npm test` from `circuits/` for the independently compiled Circom parity checks. Published Backend A fixture outputs are in `circuits/fixtures/backend-a-gate1-vectors.json`; all values are public synthetic review fixtures. Read [Gate 1 review](../../docs/review/BACKEND_B_GATE1_INTEROPERABILITY_REVIEW.md) before integration. No issuance, shared-format freeze or deployment is authorized by this package.
