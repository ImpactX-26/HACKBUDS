# GigVault — Complete Presenter & Judge Q&A Reference

**Audience:** teammates pitching GigVault, demonstrating it and answering technical/business/security questions.  
**Status:** explanation of **approved design and build target**, not a declaration that code is already working. Presenters must verify actual build status before asserting implementation.  
**Revision:** 8 October 2026; synchronized with subsequently approved identity/ownership bridge, contract-issued ID, recovery-safe consumers, canonical completed periods and Poseidon design, two QR paths and stage-accurate security. Retains approved Point H production-availability clarification.

## 0. Ground rules for presenters

- **LOCKED STORY:** decisions below are finalized product/architecture agreements. Never improvise new features, thresholds, personas, approval models or security guarantees.
- **IMPLEMENTATION STATUS:** distinguish “designed/being built” from “working on deployed contracts.” Ask engineering for current proof, transactions and test results before saying “we implemented.”
- **FUTURE:** distinguish aspirational production features from hackathon build.
- **OPEN:** the final timed demo sequence, which personas are shown live versus backups, and exact welfare test-POL amount remain unapproved.
- **Do not overclaim:** This uses simulated signed FIP/testnet/fallback identity where appropriate; ZK proves against the attested commitment, not magical independence from every actor; per-condition PASS/FAIL reveals limited information; test USDC/POL is not real value.
- **Trust model consistency:** worker holds/authorizes; FIP authenticates; GigVault attests/classifies; Polygon anchors; ZK proves; verifier checks; consumer decides/acts.

## 1. Core pitch (LOCKED)

> **GigVault gives gig workers a worker-owned, portable, privacy-preserving, independently verifiable work passport derived from authenticated payment histories, so they can prove work and earning facts across platforms without sharing raw bank statements.**

The original memorable analogy is still useful:

> **Aadhaar made identity portable. UPI made money portable. GigVault makes work history portable.**

This is an *analogy* about portability, not a claim that GigVault has official Aadhaar/UPI backing or the same production infrastructure.

**Most important sentence:**

> **GigVault proves facts. It does not judge the worker.**

That means GigVault is **not** itself a lender, welfare adjudicator, quality rating service or secret worker score. Services choose their own conditions and accept/reject applications independently.

## 2. The problem and why it matters

Gig workers earn across apps and platforms over time. Their bank/payment history can evidence genuine work, yet much of their usable reputation is fragmented or controlled by individual platforms. A worker switching from Swiggy to Zomato or earning concurrently from Uber and Ola should not have to start proving a working history from zero to every new service.

A verifier may reasonably need a simple fact—“Did this worker have at least 12 months of verified work?” or “Did they average at least ₹20k/month across six months?”—without needing a raw bank statement, account number, exact income figure or platform-private employee record.

**GigVault addresses that mismatch:** it converts authenticated gig-payout history into a portable credential and privately provable factual thresholds.

Do **not** say every gig-platform data source is already directly integrated, every income source can always be classified, or any lender is obliged to accept a GigVault passport.

## 3. Exact system in one explanation

```text
Worker gives consent
   ↓
Mock Bank/FIP supplies SIGNED TRANSACTIONS
   ↓
GigVault validates FIP signature and consent
   ↓
GigVault matches authenticated payout originators
against a versioned source directory
   ↓
Deterministic PRIVATE EvidenceSnapshot + commitment
   ↓
ATTESTER mints/refreshes worker-held SBT on Polygon Amoy
   ↓
Verifier signs an exact, immutable request
   ↓
Worker approves it and generates a bound ZK proof
   ↓
Verifier independently checks passport + signature + ZK
   ↓
Requested factual PASS/FAIL only — NOT bank statement
   ↓
Welfare / Microcredit / other consumer enforces its OWN decision
```

**Three-part cryptographic story:**

1. **FIP signature:** authenticates the financial evidence's provenance.
2. **ZK proof:** privately proves factual work/income/activity thresholds against an attested evidence commitment.
3. **Blockchain:** independently anchors current passport status, commitment, evidence version and immutable lifecycle events.

These are different assurances. None replaces the others.

## 4. Actor and authority glossary

| Actor | What it does | What it does **not** do |
|---|---|---|
| Worker / holder | Initiates consent/issuance/refresh, owns passport, approves exact verification requests | Cannot simply sign their own income as trusted evidence |
| Mock Bank/FIP | Owns synthetic transaction histories/consent; signs authenticated provenance | Does **not** assert `isGigIncome` or issue a GigVault passport |
| GigVault attestation layer | Verifies signature/consent, classifies recognized payout sources, derives commitment, attests | Does **not** assign a subjective rating or own the worker's job |
| Polygon Amoy / GigPassport | Stores SBT current commitment/version/status and events | Does **not** store financial statement or loan/welfare decisions |
| Verifier | Signs immutable fact-request policy, verifies proof and public checks | Cannot silently modify approved policy or learn raw transactions through proof |
| WelfareVault | Independently verifies and executes one-time benefit claim | Is not a passport issuer |
| Microcredit consumer | Independently verifies and executes testnet borrow/repay | Is not GigVault's global scoring engine |
| ADMIN | Exceptional revoke and authorize reissue | Does not edit financial evidence or mint replacement directly |
| ATTESTER | Mint/refresh after identity/FIP validation | Does not override terminal revocation or decide loans |

**Avoid ambiguous “issuer.”** If pressed: FIP issues **signed evidence**; GigVault attester mints/attests **passport evidence**; worker owns/holds; verifier verifies.

## 5. The privacy promise—what is and isn't revealed

**Not public/onchain/not sent to verifier:**

- original FIP/bank transaction rows;
- bank account/Aadhaar number and raw identity details;
- exact monthly gig income totals;
- exact weekly/monthly activity arrays;
- private snapshot/witness;
- universal worker score;
- platform-switch or application history written to GigPassport.

**Public/available to verification:**

- passport ID, holder context, status;
- current evidence commitment/version/update time;
- verifier's **signed request policy** and its thresholds;
- per-condition `incomePass`, `historyPass`, `activityPass` **for enabled criteria**;
- proof binding metadata such as request/verifier/policy/domain;
- public evidence freshness and signature/proof validity.

**The worker themselves can view original transactions** in the worker evidence screen. The privacy guarantee is against **verifiers and onchain public data**, not a claim that workers are forbidden from viewing their own statements.

Per-condition PASS/FAIL leaks **more than one overall yes/no bit**. This was deliberately approved for transparency; every threshold set requires worker consent and changing one forces a new signed request and approval. Never claim “nothing about income is disclosed.”

## 6. Payout evidence: financial provenance vs gig classification

**Judge challenge:** “How can you call a deposit genuine gig income?”

Answer:

> The Mock FIP authenticates the transaction fields, but we **don't pretend the bank declares it gig income**. GigVault conservatively matches authenticated payer/remitter/processor identifiers against its known gig payout-source directory. Only recognized origins count. Unknown origins are excluded.

Potential authenticated signals: settlement account/remitter ID, VPA, payment processor reference, UTR, rails. **Narration alone is not trusted.** Recurrent payments alone are not proof of gig work. Personal/self/family transfers, unrelated salary, debits and unknown payers do not count.

**Attack example:** worker sends themselves ₹30,000 and types “Swiggy salary” → that narration does not match a recognized authenticated payout originator → excluded from gig metrics.

**Honest limitation:** A wrong/malicious registry mapping or compromised attester would undermine interpretation; this is not “bank cryptography magically proves work type.” The curated directory is a conservative MVP assumption, and production onboarding/governance is future.

## 7. Source directory and long-term changes

Directory entries are **append-only versioned mappings**, using `introducedInVersion` and optional `deactivatedInVersion`. A snapshot records `sourceDirectoryVersion`; a proof reconstruction uses that historical version, not whichever version happens to be newest.

**Unknown legitimate originator?** Do not guess/count. If later verified and historic authenticated data is available, a **new refresh** can reclassify; earlier evidence/version remains historically auditable. No worker-generated payout-source additions and no large payout-source review queue in hackathon scope.

**Why not copy whole directory every update?** The locked design stores entries' version lifetimes and reconstructs the view for a requested version; no duplicated whole-version snapshots.

### Approved: How the original source-directory version is recovered (Point H)

**Locked MVP implementation:** When GigVault issues a passport or refreshes evidence, the blockchain issuance/`EvidenceRefreshed` event includes the `sourceDirectoryVersion` used for that evidence version. A proof-generation service retrieves the corresponding historical event, reads the original version and fixed evidence cutoff, reconstructs the append-only payout-source directory **as it existed then**, refetches authenticated FIP transactions under valid consent, regenerates the private evidence in memory, and checks that the resulting commitment matches the current on-chain commitment. A real input or rule change instead requires a new evidence refresh/version.

**Why choose this:** It gives a public, tamper-resistant record of *which classification rules applied*, reuses the already-approved refresh-event audit trail, and requires no permanent GigVault EvidenceSnapshot or separate per-version metadata database. The version number is metadata, **not** income or transaction data.

**What our hackathon architecture already solves:**

- The **append-only payout-source directory** retains historical mappings; adding version 4 does not destroy version 3.
- Passport issuance and refresh events record the **exact `sourceDirectoryVersion`** used for each evidence version. The off-chain attestation/proof-generation service reads those events to recover it.
- The separate **Mock FIP retains the original transaction histories**. Under valid consent, GigVault can refetch and authenticate the transactions, apply the original cutoff and directory version, regenerate the snapshot in memory, and match the on-chain commitment.
- This design needs **no permanent raw-financial-data or EvidenceSnapshot storage inside GigVault**.

**Trade-off and honest limits (not newly unsolved MVP problems):**

- Deterministic reconstruction **depends on continuing access** to authenticated source records and historic directory mappings. The hackathon provides both via the Mock FIP and append-only registry. With external production FIPs, long-term availability may require stronger evidence-availability mechanisms; these are future work, not implemented MVP features.
- Off-chain services read Polygon event logs to recover metadata. **Solidity contracts cannot directly read prior event logs**, but they do not need to do so for a new proof to be checked against the passport's current state.
- Including an extra event field costs a little more mint/refresh gas and exposes the **directory-version number** publicly. It does **not** disclose amounts, transaction rows, or plaintext evidence, and it does not add a chain transaction to each ordinary off-chain verification.

**Judge-facing summary:** The event gives us the original rule version, the append-only directory gives us those rules, and the Mock FIP gives us the authenticated transactions. Together they allow deterministic regeneration and commitment checks without storing a private snapshot in GigVault. The remaining production trade-off is reliance on continued availability of those external source records.

## 8. What exactly is the EvidenceSnapshot?

### Judge question: How can Anon Aadhaar confirm the bank account belongs to the same person?

Anon Aadhaar **proves a unique worker identity**, not that the worker owns an arbitrary bank account. For the hackathon, our **separate Mock FIP** owns a pre-established trusted **synthetic account-owner binding** from its seeded bank KYC/customer mapping, and includes the owner-binding value in its **signed** consent-bound evidence. GigVault attestation verifies FIP signature and consent and checks that the authenticated owner binding matches the worker's verified app-scoped identity **at issuance and refresh**. A mismatch is rejected. This is a mock of bank-side owner verification, **not** a claim of official Aadhaar/AA integration or a production-ready private bank-identity bridge.

### Judge question: Isn't a self-built Mock FIP circular evidence?

Our Mock FIP signs synthetic transactions, so it **does not prove those fictional transactions occurred in real life**. This is an explicit source-of-trust limitation, not our innovation. The demonstrable engineering is real signature/tamper checking, recognized-payer classification, deterministic commitment, non-transferable Polygon credential, request-bound ZK and consumer contract enforcement **on simulated authenticated inputs**. Real authorized FIP/bank integration is a later trust-boundary substitution goal, **not a claim of integration already accomplished**.



```text
passportId
holderBinding
evidenceProviderId
evidenceDataHash
verifiedHistoryStartDate
evidenceUpdatedAt
monthlyGigIncomeTotals[36]
weeklyActivity[156]
monthlyActivity[36]
sourceDirectoryVersion
evidenceCommitment
```

- `monthlyGigIncomeTotals` is a private monetary total series, in integer paise.
- `weeklyActivity` and `monthlyActivity` are private **binary** recognized-work activity flags.
- `verifiedHistoryStartDate` supports verified tenure claims beyond the 36-month detailed window.

**Recently LOCKED time semantics:** The 36 monthly-income and 36 monthly-activity entries represent **fully completed UTC calendar months**, while the 156 weekly flags represent **fully completed ISO Monday–Sunday weeks**. Arrays run oldest→newest; incomplete current periods are excluded; empty completed months count as zero income and zero activity. Verifiers still choose their own supported time windows. The publicly updated evidence timestamp is a separate freshness measure.

**Recently LOCKED cryptographic structure:** EvidenceSnapshot uses a **hierarchical, domain-separated Poseidon commitment**, with separate four-way trees for income `[36]`, weekly activity `[156]`, monthly activity `[36]`. Incomplete four-child nodes pad with **zero**. The three array roots and seven metadata scalars feed the final commitment; the output cannot hash itself. The exact tag integers, numeric field order and golden test vectors are **pending review**, and we must not claim an audited/verified circuit until actual implementation tests pass.
- No “regular/irregular worker” tag, credit rating, verifier-specific policy or actual bank row is included.

**Why both weekly and monthly activity?** A verifier chooses what time granularity matters. GigVault does not pre-label workers based on a universal cadence.

**Important nuance:** verified work history start is derived from authenticated/recognized evidence, not a claim that the FIP gives a bank-certified employment start date.

## 9. Does GigVault persist the transaction history or EvidenceSnapshot?

**Hackathon answer: No, not within GigVault.**

The Mock FIP is the source database. GigVault transiently fetches authenticated transaction data, checks/classifies it, builds a deterministic snapshot in memory, computes a commitment and discards private plaintext after use. It does not keep an encrypted snapshot in browser/server or a separate raw-transaction archive.

When the worker later needs a proof:

1. re-fetch authenticated FIP data under valid/new consent;
2. reconstruct with the **same evidence version's cutoff** and **same historical payout-source registry version**;
3. recheck the commitment onchain;
4. produce proof;
5. discard plaintext snapshot.

**If provider/consent is unavailable?** Proof regeneration may need to wait for source access. Future encrypted worker-controlled persistence can improve availability; **not MVP**. Don't claim the browser cached the worker's canonical secrets across devices.

## 10. Why `evidenceDataHash`, not hash of signed FIP envelope?

A new consent ID, fetch timestamp or envelope signature changes even when the underlying authenticated financial records are identical. Hashing the whole envelope would make reconstruction unstable.

The approved solution:

1. **verify signature first**;
2. normalize **authenticated dataset** deterministically;
3. `evidenceDataHash` hashes stable normalized authenticated financial data **without** consent ID, generated time or envelope signature.

Same authenticated records + cutoff + source-directory version → identical reconstruction; new actual records/rules → **refresh to new evidence version**.

**Critical judge answer:** `evidenceDataHash` does **not** establish provenance on its own. Signature verification still does that.

## 11. Passport blockchain model

A non-transferable work passport/SBT is minted on **Polygon Amoy** and anchored under the worker's holder wallet and **app-scoped identity nullifier hash**.

Onchain current facts include:

- passport ID / holder wallet;
- app-specific identity hash;
- current evidence commitment;
- current evidence version;
- `issuedAt`, `evidenceUpdatedAt`;
- `ACTIVE` or `REVOKED`;
- schema/provider reference as required;
- events for refresh/revocation/reissue.

Do not describe exact income or bank account as publicly stored. Do not call the SBT tradable or marketplace NFT.

## 12. Identity and one-active-passport constraint

### Judge question: Who chooses the passport ID, and can a concurrent mint corrupt the evidence?

`GigPassport.sol` controls **sequential ID allocation**. ATTESTER reads the next expected ID, builds the snapshot including that ID, hashes it, and asks the contract to mint **that exact expected ID**. The contract atomically rejects a mismatch; the attester then reads the next ID, recomputes and retries. It never silently replaces the ID, requires no separate reservation transaction and does not let the worker fabricate the commitment. The trusted attestation layer remains responsible for faithfully constructing the preimage.



One **ACTIVE** passport per identity, **not one forever**. Identity is represented by an app-specific nullifier hash, not wallet address as proof of personhood.

Preferred hackathon integration: **Anon Aadhaar test** if reliable. Explicit fallback: **mock identity provider** with stable GigVault-specific persona nullifiers, disclosed in technical context. No actual Aadhaar number/name onchain.

**Why:** a worker with a second wallet must not trivially mint a second active passport and double-claim a benefit. Limitations of mock identity must be clearly disclosed; don't call its uniqueness production-grade.

## 13. Revocation, lost wallet and replacement

Only two states: **ACTIVE, REVOKED**. Passport **REVOKED is terminal**; it can never be switched back to ACTIVE.

1. `ADMIN_ROLE` revokes old passport with reason, clears active identity pointer.
2. ADMIN separately authorizes reissue for identity (`reissueAllowed`).
3. Worker re-verifies **same person** and brings **fresh signed FIP evidence** for new/current wallet.
4. `ATTESTER_ROLE` replacement-mints if prior revoked, no active passport, authorization present.
5. Authorization is consumed; old credential remains REVOKED.

Fraud/integrity revocation does not automatically allow reissue. **No** support queue/tickets/appeals product or `SUSPENDED` state in MVP.

## 14. Evidence refresh

### Judge question: Can wallet recovery reset a welfare claim or an active debt?

**No under our newly approved consumer design.** The old passport becomes REVOKED and the new passport gets a new ID, but the **same stable app-scoped public `identityNullifierHash`** identifies the worker for downstream contract state. WelfareVault tracks **`claimedByIdentity[identityHash]`**; Microcredit tracks active debt and outstanding principal by identity, blocking a second loan across recovery. A replacement holder can repay the original loan **without redoing income ZK proof**, and must submit a **fresh signed verification request** for any later borrowing after repayment. This is enforced by consumer contracts, not just by disabling buttons.

**Privacy trade-off:** This stable public hash can link a person's passport lifecycle and welfare/loan actions **across contracts**. It does not directly expose an Aadhaar number, but our MVP should **not** claim full unlinkability. Consumer-specific identity nullifiers plus proof-bound recovery are a potential, more complex **future** design—not automatically secured by using distinct hashes and not yet implemented.



Refreshing is **not minting another passport**. Worker initiates; fresh FIP consent/evidence is verified and reclassified; ATTESTER updates same ACTIVE passport. Contract increments `evidenceVersion`, records new commitment/time and emits immutable `EvidenceRefreshed` event. Old versions can be audited from events; only **current version** is accepted for new requests.

A stale passport can remain **ACTIVE**. A verifier's evidence-age requirement decides whether data is fresh enough; stale evidence **does not automatically revoke** a credential. REVOKED cannot refresh.

## 15. Signed verification policy: exact supported facts

### Two QR entry points and custom verifier policy

A **Passport QR** lets a verifier locate the public passport/status and start a request; it never authorizes private threshold disclosure. A **Verifier Request QR** carries/resolves that verifier's signed, immutable policy for the worker to review and approve or decline. Both go through the **same signed request and worker authorization engine**; scanning either code does not bypass consent or permit invisible repeated threshold probing.

GigVault itself has **no universal ₹20,000 or six-month rule**. Any verifier can set supported criteria/window. The ₹20,000 **average monthly recognized gig income across the six most recent completed months** is specifically **our Microcredit consumer policy**. WelfareVault has **no income criterion**.



Canonical `verifierId` is an **EVM signing wallet address**; display name and optional consumer contract address are metadata.

MVP policy fields:

```text
requestId
verifierId
minAverageIncome?         // optional
incomeWindowMonths?       // if income condition active
continuityUnit?           // WEEK | MONTH
continuityWindow?
minActivePeriods?
minHistoryMonths?
maxEvidenceAgeDays?
expiresAt
verifierSignature
```

Policy is canonically hashed and **verifier-signed**; signature checked via recovering signer address. Off-chain signature costs no gas. Worker reviews **exact conditions** before approval.

Disabled conditions are non-blocking and not displayed. No max-income, max-inactive-period, worker role, purpose, verifier type, worker score.

**Anti-probing rule:**

> **One application, one immutable signed policy. Any condition change means a new request ID and new worker approval and proof.**

This does not claim cryptography stops a verifier *asking again*; it prevents **silent mutation of the approved request**.

## 16. ZK versus ordinary public checks

**Private ZK-circuit facts:**

- whether average recognized gig income meets the approved minimum;
- verified work history ≥ approved minimum;
- active WEEK/MONTH periods ≥ approved threshold;
- private evidence binds to attested commitment.

**Public / separate checks:**

- passport exists/ACTIVE;
- current evidence version/commitment;
- verifier signature and signed immutable policy;
- request expiry;
- evidence timestamp/freshness;
- holder/passport and network/contract/schema/domain;
- consumer claim/loan action state.

These public facts are not being hidden by ZK. Conversely, exact aggregate income/tenure/activity and raw bank data are not publicly disclosed.

## 17. Circom/Groth16 proof details (approved design level)

Prefer one **parameterized** Circom/Groth16 proof circuit, not a separate lending oracle and welfare oracle.

Proof is bound to:

```text
passportId
current evidenceVersion
current evidenceCommitment
requestId
verifierId
policyHash
domainHash (chainId + GigPassport contract + schemaVersion)
```

Public conditions/enable bits and policy expiration/freshness are bound through the signed hash even where evaluated outside ZK. `verifierSignature` itself is checked outside circuit.

Public **result bits**:

- `incomePass`
- `historyPass`
- `activityPass`

Only enabled conditions are meaningful to viewer; private witness includes income/activity vectors/history and commitment preimage.

**Key nuance:** A mathematically valid ZK proof can legitimately report `activityPass = false`. This is **valid evidence but failure to meet a condition**, not a fraudulent proof. Imran illustrates this.

## 18. Replay: can a ZK proof be verified twice?

Yes. Mathematical proofs can be verified again. Do not claim “ZK only works once.”

Security comes from binding proof to exact **request, verifier, policy, passport, evidence version and deployment domain**, plus consumer-specific execution rules when money or benefit changes hands.

- New criterion → new signed request + approval.
- A proof for one verifier/request cannot be repurposed for another.
- After evidence refresh an old proof is not accepted for a new request requiring current evidence.
- A general off-chain verifier may re-display or re-check the same proof; that is not necessarily harmful.
- For financial/state-changing use, **WelfareVault and Microcredit enforce one-time/loan state** themselves.
- GigVault does **not** create a global onchain registry of every verification application.

## 19. What is `GigVaultVerifier.sol`?

A **minimal Solidity Groth16 proof verifier**. It verifies mathematical proof/public signals; it is **not** a lender, welfare registrar, income database, passport lifecycle controller or a magic eligibility oracle.

Ordinary off-chain verifier: read Polygon state + verify proof (e.g. snarkjs). On-chain consumer: call minimal mathematical verifier **plus** GigPassport status/version/commitment checks **plus** business rules.

**Frontend-bypass correction:** A worker can call a contract directly without the branded frontend. They **cannot bypass the contract's independent checks**. Never say use of a specific website is cryptographically mandatory.

## 20. WelfareVault — approved policy and claim lifecycle

Product-facing service: **Gig Worker Support Benefit**.

Requirements:

| Fact/condition | Rule |
|---|---|
| Passport status | ACTIVE |
| Verified history | **≥ 6 months** |
| Monthly activity | **≥ 4 active months in last 6** |
| Freshness | evidence age **≤ 90 days** |
| Welfare state | **not previously claimed by this identity**, including an earlier/revoked passport |

**No income threshold; no maximum average income rule.**

Flow:

1. Welfare service lists conditions → **Verify with GigVault**.
2. Worker sees/approves its immutable request.
3. Proof/public checks shown step-by-step; history/activity PASS/FAIL.
4. If all required checks pass → **Claim benefit** becomes available as **separate action**.
5. If any fails → Claim disabled/hidden and failed check shown.
6. On `claim()` the **WelfareVault contract independently checks** passport/proof/results/currentness and not-already-claimed state; invalid call reverts even when frontend bypassed.
7. Successful one-time claim emits `BenefitClaimed` and records **`claimedByIdentity[identityNullifierHash]`**; any second claim after passport replacement also reverts. Show tx/explorer.

Implementation target: small amount of **test POL** if faucet funding allows; fallback remains a real state-changing claim record/event. **No finalized amount**, no real government or INR disbursement claim.

**Why separate Verify and Claim?** One establishes verified factual conditions; the **consumer contract** separately decides/executes the benefit action. Passing proof never silently claims money.

## 21. Microcredit — approved policy and loan lifecycle

Product-facing name: **Microcredit**; internal contract name `DemoLendingPool.sol`. Test asset is valueless **MockUSDC**, on Polygon Amoy. Plain UI may present “Borrow 100 USDC,” but technical context must identify it as **test USDC, not real funds**.

Requirements:

| Fact/condition | Rule |
|---|---|
| Passport | ACTIVE |
| Recognized gig income | 6-month average **≥ ₹20,000/month** |
| Verified history | **≥ 12 months** |
| Activity | **≥ 9 active months of last 12** |
| Freshness | evidence age **≤ 30 days** |
| Lending state | no active loan |
| Loan amount | **100 MockUSDC** |

**Why not a credit score?** These are the lending consumer's transparent example thresholds; GigVault does not decide universal creditworthiness.

Flow:

1. **Verify with GigVault**, signed request, worker approval, visible checks.
2. Conditions PASS → separate **Borrow 100 USDC** action available.
3. Condition FAIL (even one) → Borrow absent/disabled; show factual failure and “Loan requirements not satisfied.”
4. `borrow()` checks **on-chain** passport ACTIVE, current evidence/version, valid bound ZK proof, required result bits PASS, unused request and no active loan. Failure **reverts** even without UI.
5. Success transfers **100 MockUSDC**, sets `loanActive = true`.
6. While active, no second loan.
7. **Repay 100 MockUSDC** → `loanActive = false`.
8. After repayment, future borrowing requires a **fresh signed GigVault request and new proof**; old request/proof cannot be reused.

**Recovery condition:** Microcredit loan state is keyed by stable worker identity, not merely the token ID. A replacement wallet/passport does not clear outstanding debt or unlock a second loan. Repayment with the replacement passport requires **no new income ZK proof**; any subsequent borrowing requires a new signed worker-approved verification request.

No interest, collateral, due date, penalty, liquidation, real underwriting or complex DeFi pool.

**Important:** The example financial threshold is *not* a banking industry standard or regulatory loan recommendation.

## 22. The seven personas—what each proves

| Persona | Evidence story | What to tell judges |
|---|---|---|
| **Ramesh Kumar / Swiggy** | Hero; realistic recognized payouts from ~Jan 2024–Oct 2026, monthly ~₹24k–₹35k, 12/12 active months, ~44–48 active weeks of last 52 | “Here is the full issuance→classified evidence→passport→refresh→welfare claim→loan path.” Ramesh **passes both**; do not revoke/tamper him. |
| **Suresh Gowda / Uber + Ola** | 18–24 months concurrent aggregation; two sources together comfortably satisfy threshold | “No individual platform owns the full portable history.” |
| **Imran Pasha / cab** | ~18 months, ACTIVE/fresh, 6-month income >₹20k but only **8 active months/12** | “Valid passport and valid proof; lender activity threshold **9/12 fails**. This is not fraud.” |
| **Manjunath S / Urban Company** | ~4 months legitimate/fresh recognized payments | “Good recent activity doesn't invent six months of history; history criterion fails.” |
| **Venkatesh R / Porter** | uneven clustered payouts yet sufficient history/activity | “The verifier chooses periods; we don't label him an irregular worker.” |
| **Farhan Ali / Swiggy→Zomato** | earlier Swiggy, overlap, recent Zomato; SAME passport | “The credential follows the worker, even when the app changes.” |
| **Arjun Mehta / delivery** | legitimate baseline, controlled attacks | “Cryptographic and state validation rejects tampering at the correct step.” |

**Important:** All are **synthetic personas and transaction fixtures**. Data is realistic-looking, not real bank/platform customer records. We do not claim actual platform settlement identifiers or payout schedules are known.

## 23. Policy FAIL versus security FAIL

### Ordinary policy mismatch: Imran

```text
Signed request / passport / FIP evidence / ZK proof   VALID
Income ≥ ₹20k over six months                       PASS
History ≥ 12 months                                 PASS
Active months ≥ 9/12                                FAIL
Evidence age ≤ 30 days                              PASS

Microcredit: Loan requirements not satisfied
```

The **proof can be valid** and the worker's **passport stays ACTIVE**.

### Integrity failure: Arjun

The system rejects because signed financial provenance, a commitment, current evidence version, status or uniqueness constraint is violated. **Stop the live pipeline visibly at that stage**, do not pretend later checks passed. These are not merely UI-color changes.

## 24. Arjun security scenarios—exact approved failure messages

**Stage-accurate demonstration:** Tampered FIP payload fails during **source evidence authentication**; altered derived snapshot fails during **commitment checking/proof preparation**; old proof or REVOKED passport fails during **verification**; duplicate ACTIVE identity is rejected during **issuance**, not by ZK. Reuse a check-progress visualization where meaningful, but do not show subsequent stages as PASS after an earlier blocking failure or imply a nonexistent passport/request was verified.



| Scenario | What changes / fails | Expected message |
|---|---|---|
| Tamper signed FIP transaction | edit signed amount, date or remitter | `FIP signature invalid` |
| Modify derived evidence | witness/snapshot changes after attestation | `commitment mismatch` |
| Reuse old proof for new request after refresh | previous evidence version no longer current | `evidence version outdated` |
| Revoke passport | chain reports REVOKED | `passport REVOKED` |
| Second ACTIVE passport for same identity | contract identity uniqueness fails mint | `active passport already exists for this identity` |

Also show authenticated friend/self transfer **excluded** from recognized gig income without calling an authentic unrelated credit fake. A tampered policy/QR must fail the policy signature/hash or proof binding; don't present “editing a UI card” as security proof.

**Visual example:** request signature PASS → passport found PASS → passport status **FAIL REVOKED** → ZK “not continued.”

## 25. Why separate WelfareVault and lending apps?

GigVault does not need to track where every worker applied, whether they took a loan or claimed welfare. The credential's job is **to represent factual work evidence**.

- `GigPassport.sol`: status/version/commitment/lifecycle.
- `GigVaultVerifier.sol`: mathematical ZK verifier.
- `WelfareVault.sol`: its own **identity-keyed `claimedByIdentity`** and benefit action, surviving passport replacement.
- `DemoLendingPool.sol`: its own borrow/repay/loanActive/request-use state.

This minimizes onchain worker activity linkage through the passport contract and makes GigVault reusable for different sectors. The consumer still has visibility into **its own** interactions; don't claim perfect anonymity on a public chain.

## 26. What is actually onchain and what is merely visual?

**Target build**: Polygon Amoy SBT mint/refresh/revoke, evidence version/commitment, Groth16 verification, consumer claim and lending interactions as actual state-changing transactions, with explorer visibility.

**Not acceptable:** “Blockchain verified” while only toggling a frontend bool without contract reading. Fraud/security demo must originate from actual failed checks/controlled test state, not a red animation disconnected from state.

**Technical honesty:** Polygon Amoy is a **testnet**; MockUSDC/test POL have no real monetary value. If live faucet funding fails, only the approved welfare state/event fallback can replace its transfer—not an invented production payout claim.

## 27. No-cost implementation and practical feasibility

User requirement: **₹0 additional spend**. Use free/open-source local development, free tooling/testnet and any already-included tools. Signed FIP and identity fallbacks make a demo possible without actual bank-provider contracts or paid verification services.

**Potential judge question: “Is this production bank-connected?”**

> No. The hackathon uses an explicitly simulated consent-bound signed Mock FIP. The trust boundary and tamper tests are designed to demonstrate the protocol flow. Real regulated AA/bank integration and provider onboarding are separate production steps.

**Potential judge question: “How do you claim uniqueness with mock identity?”**

> Our design uses an app-scoped nullifier with one ACTIVE passport per identity. When Anon Aadhaar test integration isn't reliable, a clearly marked stable mock-identity provider simulates that binding; that is not production-grade civil identity proof.

## 28. Why this is Blockchain & Fintech, not just a PDF certificate

- **Fintech:** consented authenticated transaction provenance; recognition of gig-originated deposits; activity/income proofs; reusable eligibility facts without account exposure.
- **Blockchain:** non-transferable portable work passport; public current evidence commitment/version/status; lifecycle/revocation events; smart-contract consumers independently enforce one-time benefits/loans.
- **Cryptographic privacy:** Circom/Groth16 selective factual proofs bound to a signed, immutable request.
- **Consumer examples:** WelfareVault and Microcredit operate from one generic work-proof primitive, not a GigVault score.

Avoid claiming “we need a coin because every blockchain hackathon does.” **No native `$GIG` token/DAO/tokenomics** is part of MVP.

## 29. Judge Q&A — product and economics

**Q1. Why would a worker use GigVault?**  
A portable credential can demonstrate authenticated facts across platforms/services without sending a raw financial statement to each verifier. Worker owns the passport and approves the requested disclosure.

**Q2. Why not simply use each gig platform's internal rating?**  
Ratings are platform-specific and subjective. GigVault aggregates recognized payment-origin evidence across apps and proves factual thresholds, without inheriting any one app's rating rules.

**Q3. Why would a verifier trust it?**  
Verifier checks signed policy integrity, onchain ACTIVE/current commitment/version, public freshness and a mathematically valid ZK proof. The financial attester is anchored to independently authenticated FIP evidence—subject to stated trust assumptions.

**Q4. Is this a credit score?**  
No. Income/history/activity thresholds are consumer-defined factual questions; no GigVault universal score exists.

**Q5. Can GigVault make a lender approve everyone?**  
No. A lender defines and enforces its own policy, and GigVault proves facts. A worker may have a valid passport but fail a loan criterion.

**Q6. Who pays?**  
Original future business concept: **worker ₹0**, verifier could pay per check. There is **no verifier-fee transfer/payment UI in the MVP**. Do not present a finalized commercial contract or current revenue.

**Q7. Is there a native token?**  
No. Soulbound credential is the relevant blockchain component; a speculative native coin/tokenomics is outside scope.

**Q8. Why no DAO?**  
Payout source provenance and worker facts should not be decided by token voting. Complex governance was intentionally excluded.

**Q9. Does this make gig workers a formally employed class?**  
No. A verified payment/work-activity record is not a legal determination of employment status or statutory benefit eligibility.

**Q10. Do the persona income numbers represent real platform payout rates?**  
No; they're synthetic realistic-looking fixture ranges and transaction rows. We don't claim actual proprietary payout cadence or identity data.

## 30. Judge Q&A — evidence, fraud and privacy

**Q11. Doesn't the bank sign only transactions, not whether income is genuine gig work?**  
Correct. GigVault separately matches authenticated remitter/processor identifiers to a versioned recognized-source directory. This is a trust assumption and classification problem, not magically encoded by FIP.

**Q12. Can I type “Uber” in transaction narration and count it?**  
No. Authenticated payer-origin identifiers must match directory entries. Narration alone is insufficient.

**Q13. What if a new valid platform isn't in your directory?**  
Conservative false negative: exclude pending recognition, then possible future reclassification at a new refresh once source is known and historical authenticated data available.

**Q14. Could GigVault misclassify a real source?**  
Yes, registry correctness matters. Directory versioning and conservative matching make the rule auditable, but we don't claim a production fraud-proof directory.

**Q15. What stops a worker from uploading altered JSON?**  
Worker is not the signed financial source; attestation fetches FIP data server-to-server by consent ID and checks signature. Altered signed fields fail verification.

**Q16. Why is the financial data not all stored onchain?**  
Privacy, cost and permanence. The chain stores an evidence commitment/version and passport lifecycle, not monthly income, account or statement rows.

**Q17. Does the verifier see exact income?**  
No. It sees approved threshold result PASS/FAIL, not actual average rupees or statement rows.

**Q18. Does the verifier learn absolutely nothing?**  
No. It learns the factual outcomes of the exact approved conditions, plus public passport/status metadata. This is selective, not zero information.

**Q19. Can a verifier query dozens of thresholds without worker knowing?**  
They cannot silently mutate a signed request: each criteria change creates a new request/signature/worker approval/proof. We do not claim to technically prevent a verifier from sending multiple clearly visible requests.

**Q20. Can bank statement data be reconstructed from the onchain hash?**  
The commitment is designed to hide its private preimage; raw values are not published. Security depends on the actual cryptographic construction and private witness handling, which must be tested before claiming production-grade guarantees.

**Q21. How can you reprove history without storing the private snapshot?**  
Refetch authenticated FIP transactions, reconstruct deterministically for the recorded cutoff/source-registry version, match onchain commitment, generate proof and discard plaintext.

**Q21a. Where is the historical `sourceDirectoryVersion` recorded, and what is the trade-off?**  
GigVault records it in passport issuance and `EvidenceRefreshed` events on Polygon. This is **not an unsolved problem in the hackathon**: our append-only directory retains every historical version, our Mock FIP retains original transactions, and the off-chain proof service reads the event, reconstructs the original rules and evidence, then checks the resulting commitment. We avoid storing the private EvidenceSnapshot in GigVault. The real trade-off is dependence on continuing access to authenticated financial records and historical mappings; our hackathon architecture provides both, while external production FIPs may need stronger long-term availability arrangements. Off-chain services read old blockchain events; contracts cannot directly read historical logs and do not need to for the current-passport checks. The extra event metadata has a small gas/public-metadata cost but exposes no raw financial data.

**Q22. What if evidence changes between FIP fetches?**  
The existing evidence version uses a fixed cutoff and historical rules. Genuine changes require a new refresh/version rather than silent mutation of the committed evidence.

**Q23. What if FIP is offline at verification?**  
For this hackathon, on-demand proof regeneration can be unavailable until source access resumes. Future encrypted worker-controlled persistence may address that; it is not built in the MVP.

## 31. Judge Q&A — identity, blockchain and ZK

**Q24. Can I create two passports using two wallets?**  
The intended contract uniqueness is one ACTIVE passport per **app-scoped identity nullifier**, not per wallet. Demo mock identity simulates that; full production identity security needs real integration.

**Q25. Can I transfer my token?**  
No. It is a nontransferable/SBT passport; transfer attempts fail.

**Q26. What if a wallet is lost or compromised?**  
ADMIN can revoke old passport and authorize reissue; same identity reverified and fresh FIP evidence supplied; ATTESTER replacement-mints; old passport stays REVOKED.

**Q27. Can you reactivate the old revoked passport?**  
No. REVOKED is terminal; replacement is a new passport with controlled authorization.

**Q28. Does failing a loan condition revoke the passport?**  
No. Passport remains ACTIVE; only that lender's policy is unmet.

**Q29. What if evidence is 40 days old for the lender?**  
Lending rule requires ≤30 days, so freshness fails; passport does not automatically become REVOKED. Other verifiers may have different freshness rules.

**Q30. What if a proof was generated before a refresh?**  
It remains historically bound to the earlier version but is not valid for a new application requiring the **current** version.

**Q31. Can the same proof be verified twice?**  
Yes. One-time valuable action is enforced by the **consumer contract**, not by pretending ZK mathematics is one-time.

**Q32. Can someone change the verification threshold after the worker approves?**  
Changing the policy changes its signed hash/binding; a new request and worker approval are required.

**Q33. Does the circuit verify the bank's signature directly?**  
Not in this MVP. The attestation layer verifies it and commits to derived authenticated evidence; Circom proves private facts against that attested commitment. More trust-minimized source verification is future work.

**Q34. What does `GigVaultVerifier.sol` do?**  
Checks Groth16 mathematics/public signals, not passport issuance, loan underwriting or welfare state. Consumer separately checks passport/current evidence and own rules.

**Q35. Does blockchain alone ensure a remitter truly is Swiggy?**  
No. The provenance+registry+attester trust model establishes that offchain interpretation; blockchain anchors the attested result and subsequent lifecycle.

**Q36. Is there a globally traceable record of every verifier application?**  
No global GigVault used-proof/verification history contract. Consumers that execute actions have their **own** publicly visible transaction/business state. Do not claim perfect unlinkability.

## 32. Judge Q&A — WelfareVault

**Q37. What are the actual criteria?**  
ACTIVE, verified history ≥6 months, active months ≥4 of **last 6 completed months**, evidence ≤90 days, **one claim per stable identity even after passport replacement**. **No income criterion**.

**Q38. Why is there no maximum income welfare rule?**  
This product illustrates proof of verified active gig work for one-time support, not production poverty/means testing. Max average income was deliberately excluded.

**Q39. If Verify passes, does the money automatically transfer?**  
No. The worker sees a separate **Claim benefit** action. The welfare contract independently checks conditions at claim time.

**Q40. Can I bypass the Claim button or tamper with disabled UI?**  
Calling the contract directly doesn't bypass its checks. Failed proof/currentness/previous-claim state makes claim revert.

**Q41. Can I claim twice?**  
No; `claimedByIdentity[identityNullifierHash]` prevents a second claim even if the original passport is revoked and a replacement passport is minted.

**Q42. Is the benefit actual government money?**  
No. The target is a tiny test-POL transfer on Amoy if available, otherwise a real state-changing claim event/state as fallback. No actual government disbursement is claimed.

## 33. Judge Q&A — Microcredit

**Q43. What are the exact loan proof requirements?**  
ACTIVE; average income ≥₹20k/month over last 6 months; history ≥12 months; active months ≥9/12; evidence ≤30 days; no active loan.

**Q44. What can the worker borrow?**  
100 MockUSDC **test tokens**. The normal UI may say “Borrow 100 USDC”; the technical disclosure states that they are valueless test assets.

**Q45. Can a valid GigVault worker fail?**  
Yes. Imran has a valid ACTIVE passport and passes income/history but has only 8 active months in 12, below lender's 9/12 condition.

**Q46. Can't someone call `borrow()` directly?**  
They can invoke the contract directly, but the contract rechecks ACTIVE/current version/bound valid proof/PASS bits/unused request/no active loan. Invalid calls revert; the frontend is not the security boundary.

**Q47. Can I take two loans?**  
No concurrent second loan while `loanActive = true`.

**Q48. What happens after repayment?**  
Repayment sets `loanActive = false`. Future borrowing is allowed only with a **fresh GigVault signed verification request and new proof**; used request cannot be recycled.

**Q49. What is the interest/collateral/default logic?**  
None in this MVP. No interest, collateral, liquidation, deadline or credit score. This is a bounded proof-gated loan action, **not a production lender**.

## 34. Judge Q&A — engineering and delivery

**Q50. Why Polygon Amoy?**  
Real inspectable EVM contract state/transfers on a no-real-money testnet; satisfies zero-spend constraint. Do not imply Amoy assets carry mainnet value.

**Q51. Why sign policies off-chain?**  
Verifier identity and immutable request can be authenticated without paying gas for each request. Onchain consumers still verify their own security constraints.

**Q52. How can you show multiple use cases without a hardcoded lending circuit?**  
One parameterized fact-proof policy: private income/history/activity tests are reusable; WelfareVault chooses history+4/6+90d, Microcredit chooses income+history+9/12+30d.

**Q53. What makes the tamper demo meaningful?**  
Attacks fail at *different trust boundaries*: FIP signature, evidence commitment, current chain version, passport status, identity uniqueness—not just at a presentation-layer error page.

**Q54. Does frontend verify everything?**  
General verifier may perform offchain checks in browser/backend; **consumer contract** must independently enforce onchain value actions. A green UI cannot authorize a claim/loan by itself.

**Q55. Can old legitimate evidence be audited?**  
Refresh events preserve historical evidence commitments/versions. Old proof is historically tied to old version but cannot satisfy a new current-version request.

**Q56. Why not store every proof use onchain?**  
That would add cost and link worker application activity across unrelated services. Consumers enforce only the action state they need.

**Q57. Is it done and production-ready?**  
Never improvise. Presenters must confirm current build/test/deployment status before claiming completion. Mock FIP, testnet assets and identity fallback are explicitly **hackathon** boundaries.

## 35. Distinctions a presenter must keep straight

| Wrong/confusing | Correct |
|---|---|
| “Worker issues their own verified income” | Worker initiates/owns; FIP authenticates; GigVault attests |
| “Bank says this is gig income” | Bank/FIP authenticates transfers; GigVault matches recognized payout sources |
| “Everything goes onchain” | Only passport/current commitment/version/status/events and consumer action state |
| “ZK is verified once and self-destructs” | ZK can be reverified; consumer prevents repeated valuable execution |
| “ZK returns eligible or not” | ZK returns factual per-condition bits; consumer determines outcome |
| “GigVault denied Imran because he's unreliable” | Imran failed a transparent lender-specific 9/12 activity requirement |
| “Evidence got stale, so passport expired” | Passport remains ACTIVE; freshness condition can fail |
| “Frontend prevents bad borrow attempts” | Contract prevents bad borrow executions, independent of UI |
| “Welfare verification automatically claims” | Verify and Claim are separate; contract independently checks Claim |
| “100 real USDC is lent” | 100 valueless MockUSDC test tokens on Amoy |
| “Anon Aadhaar is definitely live” | Preferred test integration with explicitly labelled mock fallback |
| “AA officially signs our invented mock envelope” | Simulated FIP signing scheme, not official AA envelope claims |
| “Five security attacks prove universal fraud prevention” | They test five **specific** agreed attack/integrity paths |
| “All the demo screens/order were locked” | Final overall demo sequence/live-vs-backup still pending |

## 36. PENDING APPROVAL — Final stage sequence; approved demonstration modules (NOT stage order)

These are **content modules already agreed**, not a proposal that they must be shown in this order or fit a promised duration:

- **Evidence provenance module:** Ramesh's FIP consent, real-looking bank rows, recognized Swiggy vs unrelated excluded transfer; FIP signed.
- **Passport module:** minted SBT, current commitment/version/status, explorer; refresh same passport and new version/event.
- **ZK/verification module:** immutable signed criteria, worker approval, live checks, per-condition results; exact income hidden.
- **Portability module:** Suresh's Uber+Ola aggregation or Farhan's Swiggy→Zomato transition.
- **Legitimate failure module:** Imran valid proof/activity fail or Manjunath short-history fail.
- **Welfare module:** policy verified → separate Claim → one-time state change and second rejection.
- **Microcredit module:** policy verified → separate Borrow 100 test USDC → repay → fresh-request reborrow rule.
- **Security module:** Arjun controlled one-at-a-time integrity failures; pipeline stops early.
- **Recovery module:** exceptional ADMIN revoke/authorize + new attested passport; not old token resurrection.

**Pending user approval:** actual main-stage sequence, live/backup selection, timing and screen transitions. Do not label this modular list an approved pitch order.

## 37. Future roadmap—clearly not implemented MVP

### Additional judge pushback: What are the costs/trust trade-offs?

- Signed synthetic Mock FIP data is **not an independent real bank integration**. Actual authorized bank/AA integration and real-world account ownership proof remain future work.
- The trusted GigVault attester checks signatures and classification correctly before commitment. Blockchain/ZK anchor/prove claims **about the attested data**; they cannot make dishonest original data truthful or eliminate that attester trust assumption automatically.
- The approved event-recorded `sourceDirectoryVersion`, append-only historical mappings and Mock FIP source history **solve version recovery for the hackathon**. Long-term access to authenticated **real** FIP records is a legitimate production dependency. Event retrieval, modest event gas and public version metadata are known minor consequences, not suddenly unresolved MVP issues.
- A stable on-chain identity hash deliberately preserves claim/debt state across recovery, but **links usage across consumer contracts**. A production-grade unlinkable design would require consumer-specific nullifiers plus trusted identity/recovery proofs, and we are **not claiming it is implemented**.



- Real financial-information-provider/AA integrations and regulatory production integrations.
- Formal verified payout-source onboarding operations.
- Worker-controlled encrypted snapshot availability/archive/recovery.
- More scalable/Merkle/recursive proof windows for detailed histories longer than 36 months.
- Production-grade operational key management, stronger governance, monitoring.
- Mature dispute/appeals/reissue support, fraud remediation.
- Future verifier-paid-per-check business monetization, **not a payment feature now**.
- More complex DeFi economics or financial underwriting, **not in the demo**.

No GigVault native token, DAO or speculative worker credit/reliability scoring in MVP.

## 38. Last-minute presentation verification checklist

Before the team goes onstage, get a live status confirmation (do not guess):

- [ ] Ramesh transactions genuinely derive the displayed metrics from recognized originators.
- [ ] Mock FIP signature verifies and tampered signed payload fails.
- [ ] Passport is actually minted/refreshable on Polygon Amoy; explorer transaction links work.
- [ ] Snapshot regeneration matches current commitment; no raw data leaks to verifier.
- [ ] Groth16 verification and worker-approved signed-policy binding are functional.
- [ ] Worker/verifier see per-condition PASS/FAIL, not exact private totals.
- [ ] Imran's **valid** proof fails only the approved activity condition.
- [ ] WelfareVault rejects any direct Claim call without passing conditions, and blocks second claim.
- [ ] Lending contract rejects invalid/used proof and active second loans; repay/fresh verification works.
- [ ] Arjun's five failures are authentic checks, one at a time.
- [ ] Mock FIP/identity/testnet/token claims are honestly labelled in technical context.
- [ ] Final demo sequence/live-versus-backup is approved separately.

### The answer to remember

> **The FIP authenticates where the payment evidence came from. GigVault conservatively recognizes gig payout sources and attests a deterministic private commitment. Polygon anchors the worker-held passport's current evidence and status. The worker approves an immutable signed request, and ZK proves only requested factual PASS/FAIL results. The verifier independently checks those facts; WelfareVault or Microcredit makes and enforces its own decision.**
