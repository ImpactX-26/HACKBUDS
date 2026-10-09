> Historical planning/review document retained for traceability. For the current integrated implementation, setup and verified results, start with [the repository README](../README.md). Locked references remain authoritative; later explicit approvals are recorded in docs/ROADMAP.md.

# GigVault: Implementation and Architecture for the Pitch

Prepared: 9 October 2026. Based on this repository's locked specifications, source code and engineering reports.

Use the short spoken explanations during the pitch and the deeper explanations for judge questions. This is an explanatory document; it does not approve new protocol decisions or change the locked references.

## 1. Start with the problem and the product

Gig workers may earn from several platforms or switch platforms over time. Their payment history contains useful evidence of work, but presenting a complete bank statement exposes much more information than a service needs.

GigVault is designed to turn authenticated gig-payment history into a **worker-held, portable work passport**. The worker can approve a request to prove specific facts, such as sufficient work history or income above a stated threshold, without handing the verifier their financial records.

The central principle is: **GigVault proves facts. Each service decides what those facts mean for its application.** It does not assign a worker score or make one universal lending or welfare decision.

**Say this:**

> “GigVault lets a worker carry verifiable work history across platforms. A service asks for specific facts, the worker approves the request, and the service receives condition results instead of a bank statement.”

## 2. Be clear about what is implemented today

The architecture below describes the approved build target. The current checkout contains working parts and isolated prototypes, rather than a complete deployed product.

| Component | Evidence in the repository | Accurate pitch wording |
|---|---|---|
| Passport lifecycle | `contracts/src/GigPassport.sol`, local EVM tests | “We implemented the passport lifecycle and tested it locally.” |
| Poseidon commitment | Shared TypeScript adapter and compiled Circom hash prototypes | “We have matching real hash results across TypeScript and Circom using a provisional interface.” |
| Groth16 proving machinery | A local five-input Poseidon proof smoke test, documented in the circuit README | “A small real Groth16 proof has been tested; it is not yet a financial eligibility proof.” |
| Mock FIP and evidence backend | Separate Backend A revision inspected and executed by the reconciliation harness | “The evidence backend has been reviewed and tested in isolation; integration issues remain.” |
| Income/history/activity proof | Current circuits implement hashing, not the full requested comparisons | “The financial predicate circuit remains to be implemented.” |
| Signed policy, worker approval and consumer execution | Locked requirements and proposed interfaces | “These authorization and application layers are part of the design, with implementation and integration still pending.” |
| Frontend, deployed Amoy flow, welfare and lending | No complete implementation demonstrated in this checkout | “These are the intended product journeys; we do not yet claim a complete live deployment.” |

The 8 October reconciliation report records **23 passport lifecycle tests, 50 existing circuit/interoperability tests, 29 reconciliation checks and 72 isolated Backend A tests passing**, plus Backend A typecheck and build. These are previously recorded results, not tests rerun while preparing this document. Some reconciliation checks deliberately reproduce known unsafe behavior; a passing gap-reproduction test is evidence of an unresolved issue.

**Say this if asked about readiness:**

> “Our implemented foundation is the passport lifecycle and real cross-language commitment validation. The complete financial proof, worker authorization and consumer contract integration are the next build gates.”

## 3. The architecture at a glance

```text
Worker: wallet + identity + consent
                  |
                  v
Mock FIP: signed synthetic transactions + account-owner binding
                  |
                  v
GigVault evidence service
  Authenticate -> recognize payout sources -> normalize -> aggregate
                  |
                  v
Private EvidenceSnapshot -> Poseidon commitment
                  |
        Authorized attester mints or refreshes
                  v
GigPassport: current status, commitment and evidence version

Verifier signs exact policy -> worker reviews and approves
                  |
                  v
Re-fetch evidence -> reconstruct -> match commitment -> generate ZK proof
                  |
                  v
Verifier checks signatures + current passport + proof + conditions
                  |
                  v
Separate consumer checks its own rules -> Claim or Borrow
```

The planned chain is **Polygon Amoy**, a test network. Current passport validation uses a local Ethereum-compatible test environment.

There are three different cryptographic jobs:

| Mechanism | Plain-language job |
|---|---|
| Digital signature | Establish who signed the financial evidence or verification request, and detect changes. |
| Evidence commitment | Bind the passport to one precise version of the private evidence. |
| Zero-knowledge proof | Demonstrate requested conditions against that evidence without exposing the private values. |

Blockchain anchors the current credential and its lifecycle. It does not independently establish the truth of a bank transaction.

## 4. Who is responsible for what?

**The worker** connects a wallet, verifies identity, grants financial-data consent and approves a particular verification request. The worker holds the passport but cannot certify their own income by uploading editable data.

**The Mock FIP** is the simulated Financial Information Provider. It retains synthetic transaction records, consent records and trusted synthetic account-owner bindings. It signs transaction provenance. It does not decide which credits are gig income.

**The GigVault evidence service** checks the FIP signature, consent and account ownership. It recognizes approved payout sources and derives the private evidence. Its authorized attester submits the passport commitment.

**The passport contract** controls passport identifiers, uniqueness, ownership binding, evidence versions and ACTIVE/REVOKED status.

**The prover** processes private evidence and produces the proof. Whether the final prover runs in the browser or a controlled backend remains an implementation choice requiring coordination. The proof service must not be described as unable to see data it actually processes.

**The verifier** signs a request and independently checks its response. **The consumer**, such as WelfareVault or Microcredit, separately enforces its application policy and action state.

These responsibilities remain separate even when modules share a repository or computer.

## 5. How a passport is created

### Step 1: Verify identity and account ownership

A wallet is the passport's holder address; it is not the person's identity. GigVault uses a stable, app-specific identity binding so changing wallets does not create a new person in the system.

The preferred identity path is Anon Aadhaar in a test setting, with a clearly disclosed mock identity provider as fallback. Neither should be presented as already integrated here.

Identity verification alone does not prove ownership of a bank account. In the hackathon design, the Mock FIP maintains a trusted synthetic account-owner binding and includes it in signed evidence. GigVault must match that binding to the verified worker before both mint and refresh.

### Step 2: Fetch authenticated evidence under consent

The worker grants consent. GigVault fetches the signed evidence directly from the Mock FIP using the consent reference. It verifies signature, valid consent and ownership before financial processing.

Changing a signed amount, date or payer must cause signature validation to fail. An editable worker-uploaded statement is not an authoritative source.

### Step 3: Recognize genuine gig payout originators

GigVault compares authenticated payer or remitter identifiers against a curated, versioned payout-source directory. Matching credits contribute to recognized gig income. Personal transfers, self-transfers, unrelated credits, unknown sources and debits do not.

For example, a friend transfer with “Swiggy payout” in the narration must not count merely because of that text. The authenticated originator must match the directory.

**Say this:**

> “The FIP authenticates the transaction. GigVault then checks whether its authenticated sender is a recognized gig payout source. A convincing description alone is not enough.”

### Step 4: Build a deterministic private snapshot

An **EvidenceSnapshot** is a fixed representation of the authenticated evidence. Deterministic means the same authenticated records, cutoff, directory version and agreed rules produce the same result.

The snapshot contains:

- 36 completed UTC calendar months of recognized income totals;
- 36 completed months of activity flags;
- 156 completed ISO Monday–Sunday weeks of activity flags;
- metadata including passport ID, holder binding, provider, authenticated-data hash, verified-history start date, evidence timestamp and source-directory version.

Arrays run oldest to newest. A period with no recognized payout has zero income and zero activity. Activity is exactly `1` if at least one recognized payout occurred, otherwise `0`. It does not mean hours worked, job quality or customer satisfaction.

Money uses **integer paise**, avoiding floating-point financial arithmetic. Income averages include zero-income months. Partial current months and weeks are excluded so windows have consistent meaning.

For evidence dated 8 October 2026, the latest completed month is September. A six-month income window covers April–September. Evidence freshness uses the evidence timestamp, independently of those completed buckets.

### Step 5: Commit and mint

The service computes a **Poseidon commitment** from the snapshot. Poseidon is a hash designed to be efficient inside zero-knowledge circuits.

The authorized `ATTESTER_ROLE` submits that commitment and public lifecycle metadata. The worker receives a non-transferable passport: a **soulbound token**, or SBT. It is a credential rather than a tradable asset.

The contract controls sequential passport IDs. Because the ID is included in the committed evidence, the attester first reads the next ID and computes the snapshot for it. Mint checks that expected ID atomically. If another issuance takes it first, the attester must recompute with the new ID and retry.

## 6. What the commitment means

Think of the commitment as a compact fingerprint of one version of the evidence. It is not an encrypted bank statement and cannot be used to retrieve the original statement by itself.

GigVault hashes the three arrays separately, then combines their roots with the snapshot metadata. Each tree node has four children. Missing child positions are padded with zero. **Domain separation** adds distinct tags so different evidence branches and tree roles cannot be confused.

The monthly trees reduce `36 -> 9 -> 3 -> 1`; the weekly tree reduces `156 -> 39 -> 10 -> 3 -> 1`. The output commitment is excluded from its own hash input.

The current TypeScript and Circom prototypes reproduce identical outputs for tested inputs. Their exact tags, encodings and metadata order are still provisional. Matching implementations establish interoperability for that proposal; they do not approve the protocol or prove the full financial application secure.

**Say this:**

> “The passport stores a compact commitment to the evidence. The proof circuit must reconstruct that same commitment from its private inputs, so it cannot silently use different figures.”

## 7. Where the data lives

| Information | Intended location and visibility |
|---|---|
| Original synthetic transactions and consent records | Retained by the separate Mock FIP; worker can inspect their own rows. |
| Plaintext financial snapshot and proof witness | Transient GigVault processing; no persistent GigVault or browser archive. |
| Passport status, holder, identity hash, current commitment/version/timestamp | Public passport contract state; lifecycle events record historical evidence metadata. |
| Signed requested criteria | Reviewed by worker; checked by verifier and relevant consumer. |
| Requested condition PASS/FAIL | Visible to worker and verifier; public proof results where required. |
| Benefit claim or outstanding loan | State in the corresponding consumer contract. |

For a later proof, GigVault re-fetches the authenticated records under valid consent. It rebuilds the snapshot using the original evidence cutoff and historical directory version, then matches the current on-chain commitment before proving.

The stable authenticated-data hash excludes changing consent IDs, envelope signatures and fetch timestamps. The original signature must still be checked on every fetch.

**Privacy limits:** PASS/FAIL reveals whether approved thresholds were met. A backend prover sees evidence it processes. The stable public identity hash can link passport replacement, benefit and loan activity across contracts. The MVP does not provide complete anonymity or unlinkability. Production use would also depend on continued access to external historical financial records.

## 8. How verification works

### The service asks an exact question

A verifier builds a **VerificationPolicy** containing optional income, history, activity and freshness requirements, plus request identity, verifier address and expiry. The verifier signs the immutable policy.

The worker sees the exact criteria and chooses Approve or Decline. Changing a threshold or window requires a new request, a new verifier signature and new worker approval. Scanning a passport QR does not authorize private fact disclosure. A request QR leads to policy review.

### The circuit proves the requested facts

The planned **Circom** circuit describes mathematical constraints. **Groth16** is the proof system used to produce and verify a compact proof that those constraints hold.

Its private inputs include the committed income and activity arrays. Its public results are `incomePass`, `historyPass` and `activityPass` for enabled conditions. Those results must come from constrained comparisons, not backend or frontend guesses.

For average income, the circuit can compare the selected income sum with `threshold * number of months`, including zero months. Monetary values, sums and products need bounds to prevent field wraparound. Binary activity flags must be constrained to `0` or `1`. Exact monetary bounds and calendar-history arithmetic still need agreement.

The proof must bind to passport ID, current evidence version and commitment, request ID, verifier, policy hash and deployment domain. This prevents substituting another passport, easier request or deployment context.

### Verification checks more than the proof

Signatures, current ACTIVE passport status, current version/commitment, request expiry and evidence freshness are checked outside the private circuit. A consumer also checks worker authorization and its own action state.

**A valid proof can report FAIL.** For example, authentic evidence may fail a service's activity requirement. That is an ordinary policy outcome, not fraud and not a reason to revoke the passport.

Exact EIP-712 policy/worker-signature layouts and public-signal encoding are proposals awaiting joint agreement. They must not be presented as finalized or implemented enforcement.

## 9. Why verification and action are separate

The planned `GigVaultVerifier.sol` checks Groth16 mathematics. It does not grant benefits or loans. Each consumer must independently enforce its exact intended policy, authorized signer, worker approval, current passport/evidence, proof results and replay/business-state rules.

A proof that passes an easier income policy must not unlock a stricter loan. A disabled UI button is only a user-interface aid; direct contract calls must also reject invalid actions.

| Requirement | WelfareVault | Microcredit |
|---|---|---|
| Passport | ACTIVE | ACTIVE |
| Verified history | At least 6 months | At least 12 months |
| Activity | At least 4 of last 6 completed months | At least 9 of last 12 completed months |
| Income | No income condition | Average at least ₹20,000/month over last 6 completed months |
| Evidence age | At most 90 days | At most 30 days |
| Business state | One claim per stable identity | No active loan for that identity |
| Separate action | Verify, then Claim | Verify, then Borrow; later Repay |

The ₹20,000 threshold belongs to **Microcredit's policy**, not GigVault generally. Lending uses **100 MockUSDC**, a valueless test asset, without interest, collateral or liquidation. Welfare's exact test-POL amount is pending; a genuine claim-state/event transaction is the approved no-cost fallback.

Consumers track valuable actions locally. There is no global GigVault consumed-proof ledger. Rechecking a mathematical proof for display is different from executing a benefit claim twice.

## 10. Refresh, revocation and recovery

**Refresh:** new authenticated evidence updates the same ACTIVE passport. The contract increments the evidence version, requires a changed commitment and rejects an older timestamp. New applications must use the current evidence.

**Revocation:** `ADMIN_ROLE` can exceptionally revoke a passport. REVOKED is terminal. Stale evidence or an ordinary failed policy does not revoke it.

**Recovery:** the admin separately authorizes reissue. The worker re-verifies the same identity and supplies fresh FIP evidence; the attester mints a replacement and consumes that permission. The old passport remains revoked.

Consumer state is keyed by stable identity rather than only passport ID. A replacement must not reset an already-claimed benefit or erase an outstanding loan. The replacement holder can repay existing debt without proving income again. New borrowing after repayment requires a fresh approved request.

These consumer guarantees are locked design requirements; their contracts and negative integration tests are still required.

## 11. Explain implementation with a small technology map

| Technology | Role | Present status |
|---|---|---|
| Solidity and OpenZeppelin | Passport ownership and access-controlled lifecycle | Implemented local passport contract; Solidity 0.8.30. |
| Ganache and JavaScript tests | Exercise contract behavior on a local EVM | Existing lifecycle suite. |
| TypeScript and circomlibjs | Encode field values and compute Poseidon commitments | Shared provisional adapter. |
| Circom and circomlib | Constrain commitment reconstruction | Compiled hash prototypes; full financial predicates pending. |
| snarkjs | Witness checks, Groth16 proving and verification | Local hash-proof smoke test. |
| Polygon Amoy | Intended testnet credential and consumer execution | Deployment not demonstrated in this checkout. |
| Backend API and frontend | Consent, evidence processing, request review and user journeys | Separate backend reviewed; complete integration pending. |

The documented cryptographic lab pins Circom 2.2.3, circomlib 2.0.5, circomlibjs 0.1.7 and snarkjs 0.7.5. These are the repository's tested versions, not a claim that they are the latest releases.

The build uses local/open-source tooling and free testnet resources, with no additional monetary spend. The smoke test's disposable single-party setup is for local validation; its keys are unsuitable for deployment.

## 12. A short architecture explanation to speak

> “GigVault has three main layers. First, the evidence layer authenticates consented payment records and recognizes gig payout sources. Second, the passport layer anchors a compact commitment and its current version on blockchain, without putting the statement on-chain. Third, the proof layer is designed to answer a service's exact, worker-approved question through zero-knowledge proofs.
>
> “A welfare service and a lender can ask different questions about the same passport. They receive condition results rather than private financial records, and their own contracts enforce any claim or borrowing action.
>
> “Our implemented foundation is the local passport lifecycle and real TypeScript/Circom commitment parity. The full financial circuit and authorization-to-consumer integration remain to be completed. The hackathon environment uses synthetic signed FIP records and test assets.”

## 13. Presenter examples and likely questions

**Portability:** Farhan's earlier Swiggy and later Zomato payouts illustrate one history across a platform switch. Suresh illustrates aggregation across Uber and Ola. Only recognized authenticated sources count.

**Normal policy failure:** Imran is intended to have valid evidence and sufficient income/history but fail Microcredit's activity condition. The verifier sees activity FAIL, not his exact private activity count. Manjunath illustrates legitimate work with insufficient verified history.

**Security failure:** Arjun's legitimate baseline supports separately triggered tampering, commitment mismatch, outdated-version, revoked-passport and duplicate-identity scenarios. Show these as live enforcement only when the relevant implementation and test evidence exist.

**“Why blockchain?”** It provides independently readable credential state and lifecycle events. The attester remains responsible for trustworthy evidence intake; blockchain does not remove that trust boundary.

**“Does ZK prove the bank records are real?”** It proves conditions against the attested commitment. Provenance comes from the FIP signature, consent and ownership checks. Here the source is a disclosed simulation.

**“Can the backend act without worker approval?”** A backend with private evidence could compute a mathematical proof. Accepted applications must additionally enforce authorization for the exact request. That enforcement layer is pending integration.

**“Do verifiers learn nothing?”** They learn the approved PASS/FAIL outcomes and public credential metadata. They do not receive raw transactions or exact private financial values through the proof flow.

**“Can a new wallet get another benefit or escape debt?”** The design keys consumer state by stable identity, so replacement preserves obligations. Actual consumer enforcement still needs implementation and tests.

**“Is this production-ready?”** No. Local lifecycle and provisional cryptographic interoperability are implemented. Regulated financial-data access, complete proof/authorization integration, deployment and production security are not established by those results.

## 14. What must happen before claiming the full flow works

The latest reconciliation identifies normalization/classification disagreement, inconsistent replay handling across HTTP paths and service instances, incomplete action/domain checks, optional authentication at direct FIP entry points and acceptance of unpublished directory versions. It also identifies an upstream mint path using a mock SHA-derived commitment rather than the hierarchical Poseidon commitment. Live attestation must remain gated until corrected and integrated.

The team must jointly agree the serializer/string grammar, field mappings, tags/order, monetary bounds, calendar-history comparison and policy/worker-approval/public-signal encoding. Then implement the financial predicates, verifier, consumers and frontend against that versioned interface.

Before an end-to-end security claim, run negatives for tampered FIP data, changed commitment, revoked/stale passport, duplicate ACTIVE identity, changed or weaker policy, unauthorized worker, wrong consumer/domain and replay. Test benefit continuity and loan persistence through replacement, including repayment by the replacement holder. A valid proof with a genuine condition FAIL must remain valid mathematically while the consumer rejects the action.

Final timed demo order remains a presentation decision. Prefer a small set of genuinely working paths, backed by actual test output and transaction evidence where deployed.

## 15. Sources for engineering follow-up

- [Decision Register](reference/GIGVAULT_DECISION_REGISTER.md): approved behavior and pending decisions.
- [Locked Implementation Plan](reference/GIGVAULT_LOCKED_IMPLEMENTATION_PLAN.md): complete architecture and build target.
- [Frontend Requirements](reference/GIGVAULT_FRONTEND_REQUIREMENTS_LOCKED.md): user journeys and visibility rules.
- [Presenter Q&A Reference](reference/GIGVAULT_PRESENTER_QA_REFERENCE.md): approved pitch story.
- [Poseidon Interface Review](review/SHARED_EVIDENCE_POSEIDON_SPEC_REVIEW.md): proposed exact encoding.
- [Authorization and Consumer Review](review/VERIFICATION_AUTH_AND_CONSUMERS_REVIEW.md): proposed authorization enforcement.
- [Passport implementation](../contracts/src/GigPassport.sol) and [lifecycle documentation](../contracts/README.md).
- [Cryptographic lab documentation](../circuits/README.md).
- [Latest Gate 1 reconciliation](review/BACKEND_B_FINAL_GATE1_RECONCILIATION_V0_1_2.md): recorded execution and unresolved findings.

Document preparation changed only this new guide. No application code or locked reference file was edited, no implementation tests were rerun, and no new shared protocol decision was made.
