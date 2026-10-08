# Backend B cryptographic lab — 0.1.0

Status: **PROVISIONAL, isolated hash-only interoperability prototype**. No canonical shared wire format has been approved. Nothing here mints/refreshes a passport, anchors commitments, accepts application proofs, computes financial PASS flags, or deploys a verifier/consumer. Existing passport code and tests are unchanged.

The adapter uses real `circomlibjs.buildPoseidon()`; the circuits use real `circomlib.Poseidon(5)`. There is no replacement cryptographic primitive or mocked verification. The implementation follows the locked four-child/domain-separated/zero-padded structure with the review's **unapproved test tags and metadata order**. See the [shared-interface proposal](../docs/review/BACKEND_B_SHARED_INTERFACE_V0_1_PROPOSAL.md).

## Reproduce locally for zero additional cost

Run from `circuits/` with Node.js 24 and npm 11:

```powershell
npm ci --ignore-scripts
npm run setup:circom
npm test
npm run proof:smoke
```

The installer downloads the pinned official compiler asset, checks its SHA-256 **before installation**, and builds recheck both digest and version. If browser/manual download is necessary, the offline path performs the same check:

```powershell
npm run setup:circom -- --from C:/path/to/circom-windows-amd64.exe
```

No global compiler, Rust build, hosted prover, paid RPC, testnet transaction, or external ceremony is needed for these tests. Only Windows x64 was actually tested. Linux/macOS x64 assets are pinned but untested; unsupported architectures fail explicitly.

| Tool | Exact tested version |
|---|---|
| Node.js / npm | 24.19.0 / 11.17.0 |
| Circom | 2.2.3 |
| circomlib | 2.0.5 |
| circomlibjs | 0.1.7 |
| snarkjs | 0.7.5 |
| TypeScript / @types/node | 5.9.3 / 24.10.1 |

Dependencies are exact dev pins with npm integrity records in `package-lock.json`. Compiler platform/version/digests are in `toolchain.json`; Windows SHA-256 is `e43f132ee6f0aa79b705beceb59c2a7e6a54d7bdeab917ca34e9fc1951d185e1`. These were compared with the [official Circom 2.2.3 release](https://github.com/iden3/circom/releases/tag/v2.2.3) asset metadata. Library sources: [circomlibjs](https://github.com/iden3/circomlibjs), [snarkjs](https://github.com/iden3/snarkjs).

Actual setup on 2026-10-08: `npm install --ignore-scripts` and a subsequent clean `npm ci --ignore-scripts` both succeeded (98 packages); a direct Node download from GitHub timed out, so a locally available official compiler was copied through the checksum-validated `--from` path successfully. The Windows sandbox could not resolve an installed Circom include; the same build succeeded outside that sandbox. Builds use BN254 (`--prime bn128`), `--O1`, R1CS/WASM/SYM output and strict TypeScript compilation.

## Actual validation

`npm test`: **22 passed, 0 failed**. Fifteen deterministic snapshots matched **all three roots and final commitment** across TypeScript, compiled Circom WASM witnesses, and recorded decimal golden vectors. Other tests cover H5 primitive parity, field boundaries, altered scalars/arrays, reversed array order, wrong metadata/branch/tag order, nonzero padding at every incomplete level, malformed inputs, binary flags independently constrained in Circom, and snarkjs R1CS witness checking with a rejected tampered output.

Compilation: snapshot circuit has 69,498 constraints (27,084 nonlinear + 42,414 linear), 235 private inputs, one public input and four diagnostic public outputs. H5 has 835 constraints (324 nonlinear + 511 linear), five private inputs and one public output. The diagnostic root outputs are **not** a production public-signal manifest.

`npm run proof:smoke`: **actual Groth16 H5 proof verified; the same proof with a modified public hash was rejected**. This runs a disposable, single-party, local power-10 ceremony and proves only a five-field Poseidon hash. It tests proving machinery, not application authorization or financial predicates. Its keys are unsuitable for deployment; scratch witness/proof/setup files are removed in `finally`. Proofs/setup randomness are nondeterministic; hash fixtures are deterministic.

Preservation check: `npm test` from `contracts/` passed **23/23 lifecycle tests**. Ganache warned that its native uWS binary does not support this Node build and used its JavaScript fallback; the local EVM tests still completed successfully.

Baseline outputs (decimal BN254 field elements, actually generated):

| Output | Value |
|---|---|
| incomeRoot | `5843021400246959454426645039486659169436537113254838001036007297138003151189` |
| weeklyRoot | `19512571743125935689323863729183937512124773593979056893861349721584648680294` |
| monthlyRoot | `21425943818108819646680264661829246965044530134333493389056942597275748411129` |
| evidenceCommitment | `8142951566335183629243222902988928544569622411848194646731848882198372776781` |

`fixtures/provisional-vectors.json` records the full baseline, ten metadata slots and outputs for every named mutation. Variant inputs are defined deterministically in `test/synthetic-fixtures.ts`. All data are **public synthetic hash-only inputs**. Provider `202` and data hash `123456789` are intentional field literals, not derived from a provider mapping or authenticated FIP data. The field/u64-boundary vector does not approve a monetary bound. Normal tests never rewrite expected vectors. Explicit regeneration is `npm run fixtures:record`; it refuses to record outputs until real TypeScript/Circom parity succeeds.

## Security limits and remaining dependencies

The adapter rejects noncanonical decimal strings, numbers/floats, negatives, field overflow, wrong array lengths/holes, nonbinary activity, unknown fields and self-inclusion of the output commitment. Circom constrains binary flags and recomputes/binds the commitment. Circom fields do not enforce a canonical external integer encoding; the strict TypeScript boundary must be retained, and future predicate circuits must add approved bounded-bit money/date/policy checks. No monetary comparisons, history calculation, stable dataset serialization, FIP signature/consent verification, policy binding, worker approval, current-chain/version checks, or replay enforcement are implemented by this lab. Fresh-consent reconstruction and full satisfied/failed financial proofs remain integration gates after shared decisions.

On 2026-10-08 the lab's `npm audit --json` reported **19 affected package entries: 13 low, 2 moderate, 4 high, 0 critical**, all development tooling. Counts changed from 18 at initial installation as advisory data changed; they are a dated observation, not a permanent guarantee. High entries: `bfj`, `jsonpath`, `underscore`, `ws`; moderate: `ethers`, `@ethersproject/providers`. `underscore` has recursion DoS ([advisory](https://github.com/advisories/GHSA-qpx9-hpmf-5gmw)); `ws` has memory disclosure and fragment-exhaustion DoS ([disclosure](https://github.com/advisories/GHSA-58qx-3vcg-4xpx), [DoS](https://github.com/advisories/GHSA-96hv-2xvq-fx4p)). The deterministic harness opens no WebSocket and accepts no external JSONPath expressions; this does not establish general toolchain safety. Keep inputs synthetic and local. Safe remediation work should evaluate patched transitive packages/compatible overrides and rerun parity/proof tests; npm's suggested major `circomlibjs` downgrade is not an acceptable automatic fix. No audit fix or dependency override was applied. The earlier contract toolchain's 39 affected entries (five critical) remain tracked in `contracts/LIFECYCLE_REVIEW.md`; this milestone does not resolve them.

Only source, lockfiles and explicit synthetic vectors belong in Git. `node_modules`, native binaries, builds, temporary witnesses, proofs, ceremony files, keys and `.env` are ignored. Never use real worker/private financial data with the public fixture recorder.
