# GigPassport lifecycle milestone review

Reviewed 8 October 2026 against AGENTS.md, Backend B instructions, the complete
Decision Register and Locked Implementation Plan, integration rules, and all
three review documents. This report records local implementation evidence; it
does not approve a shared encoding or constitute an independent security audit.

## Repository gate

- Repository root: `C:/Users/DELL/OneDrive/BIT/GigVault/HACKBUDS`.
- Fetch/push origin: `https://github.com/ImpactX-26/HACKBUDS.git`.
- Active branch: `feature/blockchain-zk`; initial working tree clean.
- Existing draft PR: https://github.com/ImpactX-26/HACKBUDS/pull/2.

## Locked requirement comparison

| Requirement | Implementation and actual test evidence |
|---|---|
| GV-050 worker-held nontransferable passport | ERC721 owner/balance and holder metadata; direct/safe/self/zero-address transfers and approvals reject. `_update` also prevents moving or burning existing tokens. Current public evidence metadata only; no private finance or policy state. Amoy deployment remains outstanding. |
| GV-051 ACTIVE / terminal REVOKED | Missing-token reads revert; refresh and repeat revoke reject revoked tokens, including all predecessors after repeated replacement. Advancing time by 366 days does not revoke. |
| GV-052 separate attester/admin authority | Constructor and later role grants enforce disjoint keys. Unauthorized lifecycle calls reject. Rotation, renunciation and removal tested. Identity/FIP/worker initiation checks are attester-side dependencies. |
| GV-053 same-token refresh | Changed commitment, nondecreasing cutoff and future-time sanity checks; internally incremented version; immutable holder/identity/issuance metadata. Mined invalid refreshes preserve all state and emit no logs. |
| GV-054 separate recovery authorization | Revocation clears active pointer, retains latest pointer and old token; separate authorization required and consumed on successful mint. Multiple recovery cycles retain identity, supersession and terminal predecessors. Failed transactions preserve authorization. |
| GV-055 sequential expected-ID mint | IDs start at 1; contract rejects stale expected ID atomically. Initial issuance and recovery contention tested with mined failures and successful retry using a different opaque fixture commitment. Actual cryptographic ID binding remains an integration test. |
| GV-034 event directory recovery | Issuance and successive refresh logs preserve each version's commitment/cutoff/directory/schema/provider metadata, while state retains current evidence. |
| GV-018 identity rather than wallet uniqueness | Duplicate ACTIVE identity fails across different holders; distinct identities can share a holder. Recovery preserves the same public stable identity hash. |

## Findings and changes

No confirmed contract lifecycle vulnerability or missing locked on-chain invariant
was found in this review. `src/GigPassport.sol`, its ABI, and dependency lockfile
are unchanged. Six regression tests were added to `test/GigPassport.test.mjs`:

1. Mined duplicate issuance / invalid refresh rollback and absence of events.
2. Historical issuance/refresh event reconstruction and current metadata.
3. Repeated recovery with terminal predecessors and one-use authorization.
4. Recovery ID contention and preserved authorization until retry.
5. Identity/wallet independence and stale evidence remaining ACTIVE.
6. Renounced attester / removed admin authorization and separate role management.

Security boundaries to retain:

- An authorized attester can submit opaque incorrect evidence. Signature, consent,
  worker initiation, stable identity, bank-owner matching and fresh recovery FIP
  validations must be enforced before mint/refresh. These were not tested here.
- Role-management admin remains trusted and can rotate authorities. Key separation
  is not protection against a malicious role-management admin. Removing all role
  managers can lock further administration; no new governance rule was introduced.
- `_mint` deliberately makes no ERC721 receiver callback. Contract-wallet receipt
  compatibility must be reviewed before deployment; receiver acceptance is not tested.
- Commitment/provider/schema/directory encodings remain opaque. No unapproved
  modulus, zero-value exclusion, tag, codec or provider restriction was introduced.
- Public revocation reason strings must contain no private identity or financial data.

## Actual commands and results

- Initial `npm test`: failed before compilation (`solc` not installed).
- `npm ci --ignore-scripts` in sandbox: failed with registry DNS `ENOTFOUND`
  and cleanup permission warnings. Same command outside sandbox: succeeded.
- Sandboxed EVM attempt: compiled, then stalled before test results; interrupted.
- First completed EVM runs: all 17 existing tests passed; five new tests passed;
  one new test failed on comparison of ethers `Result` proxies. Corrected the test
  to compare decoded arrays; no contract change was needed.
- Final `npm test` outside sandbox: **23 passed, 0 failed, 0 skipped**, exit 0,
  approximately 16.3 seconds. Solidity 0.8.30, optimizer 200 runs, Shanghai,
  fresh in-process Ganache per test. Node 24 used Ganache's JavaScript uWS fallback.
- `git diff --check`: passed (Git also noted normal LF-to-CRLF conversion).
- `npm audit --json`: exit 1; **39 dependency advisories** (2 low, 9 moderate,
  23 high, 5 critical). Affected direct development tools include Ganache, ethers
  and solc; critical reports are in Ganache-bundled cipher-base, elliptic, pbkdf2,
  sha.js and webpack. This is a tooling dependency finding, not evidence of an
  exploitable Solidity lifecycle defect. No automatic/forced dependency upgrade
  was applied. Toolchain remediation and reachability assessment remain follow-up.

## Publication verification and dependency investigation

Publication verification on 8 October 2026 re-ran `npm test`: 23/23 passed,
0 failures/skips. Assertions were also tightened to require all three historical
events, the current cutoff, ACTIVE replacements, a mined status-0 recovery failure
with no logs, correct replacement pointers, and a block timestamp advanced by at
least 366 days. The six tests exercise state transitions and rejection paths;
they do not simulate cryptographic evidence or consumer authorization.

The fresh npm audit still reports 39 affected package entries, not 39 independent
exploits: multiple advisories may affect one package, and parent packages may be
flagged through a vulnerable dependency. All are development/test tooling in this
project. `contracts/package.json` has only `devDependencies` and no production
JavaScript dependencies. OpenZeppelin Solidity sources are compiled into bytecode;
none of these vulnerable JavaScript packages is deployed with the contract.

Do not infer production usage from npm's aggregate dependency counts: Ganache's
distributed package carries nested/extraneous dependencies; its lock entries for
cipher-base, pbkdf2, sha.js and webpack are marked extraneous, while elliptic is
marked dev/inBundle. All are below the project's development-only Ganache root.
They remain relevant to developer/CI supply-chain safety even though there is no
production runtime exposure demonstrated here.

### Critical package entries

Installed versions were checked from package manifests and the lockfile.
Reachability below is a source/harness assessment, not an exploit reproduction or
a complete dynamic call-graph audit of Ganache's prebuilt bundle.

| Package under Ganache | Trigger and relevance to this suite | Advisory patch / follow-up |
|---|---|---|
| cipher-base 1.0.4 | Crafted non-string/non-buffer hash input can corrupt or rewind hash state. Tests do not feed untrusted objects into this hash API; no demonstrated external trigger. | Critical issue fixed in 1.0.5. [Advisory](https://github.com/advisories/GHSA-cpq7-6gpm-g9rc). |
| elliptic 6.5.4 | Signing malformed attacker-controlled input can leak a signing key. Only disposable Ganache accounts and test transactions are used; no arbitrary-message signing endpoint or real keys. This must not be promoted to a production signing tool. | Critical issue fixed in 6.6.1; audit also lists lower-severity findings including a risky-primitive advisory through 6.6.1, so that version alone does not clear every finding. [Critical advisory](https://github.com/advisories/GHSA-vjh7-7g9h-fjfh). |
| pbkdf2 3.1.2 | Browser/polyfill unsupported or non-normalized algorithms can yield predictable output. Another critical issue concerns Uint8Array on Node <3, which does not match this Node 24 run. No user passwords/algorithms enter this test harness; bundled call-path reachability remains unproven. | Critical issues fixed in 3.1.3; a newer long-password DoS requires 3.1.7. [Algorithm advisory](https://github.com/advisories/GHSA-h7cp-r72f-jxh6), [old-Node advisory](https://github.com/advisories/GHSA-v62p-rq8g-8h59), [DoS advisory](https://github.com/advisories/GHSA-477h-4r7f-fvrx). |
| sha.js 2.4.11 | Crafted hash input can rewind state or hang. No untrusted hash input or evidence hashing is implemented in this lifecycle suite. | Critical issue fixed in 2.4.12. [Advisory](https://github.com/advisories/GHSA-95m3-7q98-8xr5). |
| webpack 5.65.0 | Cross-realm access through parsing magic comments in attacker-controlled code/objects. This suite uses the prebuilt Ganache Node entry and never invokes Webpack. Browser XSS and buildHttp SSRF advisories are also listed, but those build/browser features are not invoked here. | Critical issue fixed in 5.76.0; other listed findings need newer patches. A fixed critical version alone is insufficient. [Critical advisory](https://github.com/advisories/GHSA-hc6q-2mpp-qw7j). |

### Remaining 34 package entries

This inventory accounts for every noncritical entry in the captured npm report.
All share the development-only project classification above; exact severity is
the maximum reported for each package in this audit.

| Severity / count | Affected packages |
|---|---|
| High / 23 | @microsoft/api-extractor, @microsoft/api-extractor-model, @rushstack/node-core-library, @trufflesuite/uws-js-unofficial, brace-expansion, braces, browserify-sign, browserslist, cross-spawn, ganache, js-yaml, json5, lodash, minimatch, mocha, nanoid, picomatch, secp256k1, semver, serialize-javascript, tmp, validator, ws |
| Moderate / 9 | @microsoft/tsdoc-config, @rushstack/ts-command-line, ajv, argparse, bn.js, ethers, micromatch, sprintf-js, terser-webpack-plugin |
| Low / 2 | diff, solc |

Most paths are nested under Ganache. Root ethers 6.15.0 is flagged through ws;
root solc 0.8.30 is flagged through tmp 0.0.33. The report contains ws 8.13.0
under Ganache and ws 8.17.1 at the root.

- Transport findings (ws/uWS/ethers): header/fragment DoS and memory disclosure
  matter for exposed WebSocket servers/clients. `ganache.provider()` and ethers
  `BrowserProvider` communicate in process; no HTTP/WebSocket listener is opened.
- Crypto findings (secp256k1 ECDH, browserify-sign DSA checks, bn.js arithmetic):
  relevant if untrusted keys/signatures/numbers reach those APIs. This suite does
  not perform ECDH or DSA verification or accept external inputs; Ganache still
  deserves separate runtime review before broader reuse.
- Build/parser findings (the api-extractor/Rushstack families, mocha/terser,
  glob/regex helpers, YAML/JSON5/lodash, browserslist, nanoid, validator and diff):
  attacker-controlled patterns, objects, files or serialized code can cause DoS,
  pollution, code execution or validation bypass. The test runner is Node's built-in
  runner, not Mocha; Ganache build scripts are not invoked. Do not build untrusted
  source with this stack and interpret this local assessment as a general waiver.
- tmp/solc: symlink-directory and prefix/postfix traversal concerns require a
  reachable temporary-file operation and relevant attacker control. Compilation
  uses solc's in-memory standard JSON API on repository sources, not a user-supplied
  temp-path service. No compiler semantic vulnerability was established by this audit.

### Safe remediation options (not applied)

1. Keep this toolchain local/test-only with synthetic keys and no exposed RPC;
   `npm ci --ignore-scripts` remains the documented reproducible install command.
   This containment reduces current exposure but leaves all advisories open.
2. In a separate focused dependency change, consider the audit's same-major ethers
   6.17.0 candidate, regenerate the lockfile deliberately and re-run lifecycle tests.
   This would address its dependency path, not Ganache's separate bundled ws.
3. For solc's tmp path, investigate a scoped tmp >=0.2.6 override and validate API
   compatibility and compilation. It is not assumed safe without testing. Audit's
   solc 0.8.37 suggestion cannot compile the current exact `pragma solidity 0.8.30`;
   preserve the compiler pin during this milestone.
4. Ganache supplies prebuilt/bundled code. Updating nested packages or adding an
   npm override may leave embedded vulnerable code untouched. Prefer a reviewed
   upstream rebuild or a separately evaluated local EVM replacement with the same
   test semantics; verify actual artifact contents and the full suite. npm's offered
   Ganache 6.4.5 is a major downgrade, not an acceptable automatic remediation.
5. Re-audit after any tested dependency remediation. Do not use `npm audit fix
   --force`, blindly replace bundled files or change contract behavior to silence
   tooling warnings. No package/lockfile/compiler/contract changes were made here.

Manual review of the two publication files and a credential-pattern scan found no
secrets, private keys or real identity/financial records. The only test identities
and provider references are explicitly synthetic; ephemeral wallet keys are never
read or logged. The raw local audit report is ignored under `node_modules/` and
is excluded from the commit. Only the two requested milestone paths are published.

## Dependencies and milestone boundary

The isolated on-chain lifecycle is ready for milestone review. Full Gate D remains
dependent on identity/FIP integration, approved evidence interfaces and Amoy
deployment with separate role wallets. Both backend owners must coordinate the
serializer, field mappings, Poseidon ordering/tags/ranges and real cross-language
vectors. Exact policy/worker approval/public-signal interfaces remain under REVIEW.
No decision is required to retain the tested lifecycle behavior itself.

Circom, verifier and consumer implementation have not begun. Old-proof rejection,
tampered snapshots/FIP, intended consumer policy, replay, welfare claim persistence
and outstanding loan persistence are not validated by this lifecycle suite. Stable
identity continuity is tested here; consumer enforcement is a later milestone.

No Backend A, frontend, shared codec or locked documentation files were edited.
Publication scope is this report and the lifecycle test file on
`feature/blockchain-zk`, through a normal branch push to existing Draft PR #2.
The PR remains a review milestone; no main merge or proof-dependent work is included.
