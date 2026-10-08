# GigVault — Complete Frontend Requirements (Locked)

**Audience:** frontend teammate(s), UI integrator, demo integration teammate.  
**Status:** approved frontend/product behavior consolidated into one implementation reference; not a claim that screens already exist.  
**Revision:** 8 October 2026, synchronized with all subsequently approved identity, QR, temporal, consumer recovery and security-stage rules; supersedes earlier frontend reference revision.  
**Authority:** GigVault locked planning decisions, **not** the older `GIGVAULT_FRONTEND_IMPLEMENTATION_PLAN.md` where it conflicts with them.

## 0. How to use this document

- **LOCKED:** implement exactly the described business flow/privacy/policy behavior.
- **ILLUSTRATIVE COPY:** an example of wording or visual layout, **not** a new required phrase or value unless explicitly labelled LOCKED.
- **IMPLEMENTATION GUIDANCE:** a suggested organization of views, components or state; no backend contract is invented here.
- **PENDING APPROVAL:** genuinely undecided engineering/product detail; avoid treating it as a locked requirement.
- All real cryptographic, passport and consumer states must come from the appropriate services/chain; **frontend coloring/button gating is not security enforcement**.
- Do not silently import old-draft features such as scorecards, “consistency %”, worker cadence types, max missed-weeks policy, expired passport state, speculative personas or arbitrary proof thresholds.

## 1. Product experience — LOCKED

GigVault lets a gig worker carry verified private work-and-payment facts across platforms and applications, **without exposing the bank statement or exact financial/activity values to a verifier**. Worker owns/holds a nontransferable work passport. FIP supplies authenticated transactions; GigVault classifies recognized payments; ZK proves factual thresholds; Polygon anchors current passport state; separate downstream apps act on verified results.

> **GigVault proves facts. It does not judge workers.**

### Product copy rule

Normal screens must feel like real services, **not** be prefixed repeatedly with “demo,” “mock,” “test” or “prototype.” Product examples **Gig Worker Support Benefit**, **Microcredit**, **Verify with GigVault**. Technical/environment drawers/banner **must honestly disclose** Polygon Amoy, MockUSDC test asset, simulated FIP and mock identity fallback where relevant. These are not contradictory instructions.

**LOCKED core UX principles**

- Distinguish **data from FIP** and **GigVault's analysis**.
- Preserve worker visibility and explicit approval for each immutable policy.
- Display requested per-condition **PASS/FAIL**, not only a mysterious overall eligibility result.
- Never show verifier raw bank rows or actual income/history/activity aggregates.
- Make blockchain and cryptographic checks visible; do not imply a frontend spinner equals proof verification.
- Distinguish **valid proof with unmet conditions** from **security/protocol failure**.
- Keep downstream WelfareVault and Microcredit visually separate from GigVault's own neutral passport product.

## 2. Frontend surfaces — LOCKED

| Surface | User | Why it exists | Primary actions |
|---|---|---|---|
| Worker | Gig worker | consent, classified evidence, persistent passport, approval/proof, refresh | Connect, Verify Identity, Grant Consent, Create Passport, Refresh, Approve/Decline |
| General verifier | Organization/service verifying facts | signed immutable policy and independent checks | Connect signing wallet, create/sign request, wait, verify |
| FIP consent / data boundary | Worker, optional evidence-provider context | authenticated financial provenance and consent; distinct FIP trust boundary | review/grant/deny consent; view signed source evidence status |
| WelfareVault | Worker seeking one-time benefit | independent welfare policy and state-changing claim | Verify with GigVault; then Claim if eligible |
| Microcredit | Worker seeking simple testnet loan | independent lending policy and on-chain loan | Verify with GigVault; then Borrow; Repay |
| Admin/reissue | ADMIN wallet | exceptional revoke and reissue permission | lookup, revoke, authorize reissue |
| Security checks | Presenter / engineer | five genuine integrity failures, one at a time | trigger scenario; inspect stopped verification pipeline |

**Not a mandate:** exact number of deployed frontend applications, route names, repo layout, UI library, screen component names or persona switcher implementation. These are implementation decisions, not previously locked product requirements.

## 3. Worker: connect and passport discovery — LOCKED

### Entry states

**No holder wallet connected:** show connect wallet.  
**Wallet connected, identity not yet verified:** lead to identity verification.  
**Identity with no ACTIVE passport:** enable create-passport journey.  
**Existing ACTIVE passport:** lead to the worker passport dashboard.  
**Relevant passport REVOKED:** show its status and, when admin reissue authorization exists, guide worker through *new* identity/FIP/issuance flow rather than reactivating the revoked token.

**Identity:** preferred Anon Aadhaar test/demo when reliable; otherwise clearly identified mock identity provider. One identity → max one **ACTIVE** passport. Wallet ≠ person identity; no Aadhaar details on-chain.

**Account-owner binding is a separate required integrity check:** The trusted Mock FIP supplies a **signed, pre-established synthetic account-owner identity binding**, and the attester must match it to the verified worker identity during issuance **and refresh**. Anon Aadhaar does not independently confirm bank-account ownership. If mismatch, show **account ownership verification failed / evidence rejected** (wording illustrative), not a fabricated identity PASS.

**Prohibited visual assumption:** do not add a third on-chain status `EXPIRED`, `SUSPENDED` or “bad worker.” Evidence can be stale relative to verifier policy while passport remains **ACTIVE**.

## 4. Worker: FIP consent — LOCKED

- Separate financial provider identity/consent flow from GigVault classification.
- Show what transaction time range/data access is being requested, consent approval/denial and relevant status.
- Attestation fetches signed data server-to-server by consent ID. The frontend does **not** submit a user-editable unsigned transaction JSON as trusted evidence.
- An expired consent when generating a later proof must be **renewable**, followed by deterministic evidence reconstruction.
- **No additional mandatory approval step per transaction classification**: FIP consent is the actual evidence-sharing consent. The worker may inspect evidence for transparency.

### Error states

- Consent denied.
- Consent expired/renewal needed.
- Signed FIP data unavailable.
- FIP signature invalid.

- Authenticated FIP account-owner binding does not match the worker identity: issuance/refresh rejected; do not suggest an unsigned, worker-entered mapping can fix it.
- FIP data fetched and signature verified.

Do not claim actual production RBI Account Aggregator connectivity when using the simulated provider.

## 5. Worker: transaction evidence table — HIGH PRIORITY / LOCKED

This screen must be **prominent** during issuance/refresh and accessible later from **View evidence transactions**. It is one of the main visible proof points for the project.

### Separation and columns

| `Bank/FIP data` | `GigVault analysis` |
|---|---|
| Date and time | Matched recognized source / exclusion reason |
| Description/remitter | Counted vs excluded/not relevant |
| Payment rail and reference/UTR | The GigVault-assigned platform label, where recognized |
| Debit | — |
| Credit | — |

This layout is a *column-grouping requirement*, not an exact CSS grid or TypeScript type.

### Classification examples — illustrative display strings, locked meanings

- `✓ Counted · Swiggy`
- `✓ Counted · Uber`
- `✓ Counted · Ola`
- `✓ Counted · Zomato`
- `✓ Counted · Porter`
- `✓ Counted · Urban Company`
- `Excluded · Personal transfer`
- `Excluded · Self transfer`
- `Excluded · Unrecognized payer`
- `Not relevant · Debit`

GigVault supplies the **classification**; FIP supplies transaction provenance. Do not put “gig income” in the bank-source section as though authenticated by the FIP.

### Realism/fixture rules

- Show individual transaction records, not a fabricated neat “₹30,000 every month” series.
- Varied plausible timestamps, irregular nonround amounts, rails/references and narratives.
- Include recognized platform payouts plus personal transfers, self-transfers, refunds/unrelated credits and debits.
- Source identifiers must be synthetic; avoid copying real account data or claiming to know a platform's actual payout cadence.
- Metrics shown elsewhere must derive from these recognized rows, not independent hardcoded labels.

### Worker-only summary/status

Allowed to show FIP signature verified, evidence period, transaction count, counted recognized payouts and recognized platforms. These are worker transparency details. No GigVault credit/reliability scores.

**Privacy boundary:** verifier/WelfareVault/Microcredit must **never** be sent this table or these raw records.

## 6. Worker: evidence summary and issuance — LOCKED

After classification, show:

- authenticated source/evidence status;
- recognized sources/platforms;
- evidence period and factual summary as appropriate for worker;
- explicit reassurance that **raw transactions are not written on-chain**;
- issuance action (illustrative text: `Create GigVault Passport`).

Minting requires attester-validated FIP + identity and writes a real **nontransferable passport on Polygon Amoy**. Worker can initiate, but cannot self-certify or arbitrarily mint financial claims. UI may show transaction pending/confirmed/failure, actual passport ID and Polygon explorer link.

**Contract-controlled passport ID:** The attester uses the contract's expected next sequential passport ID in the commitment before mint; the contract enforces it atomically. On an issuance race, the app may show a transient retry while the attester re-reads the new ID and recomputes evidence. Do **not** display an ID as final until the chain confirms the mint; no extra reservation transaction or worker-entered token ID.

## 7. Worker: passport dashboard — LOCKED

Required visible core:

- Passport ID and holder context.
- Status: `ACTIVE` / `REVOKED` (no third contract state).
- Current evidence version.
- Evidence last-updated time.
- Recognized platform/source summary.
- Blockchain/network and inspectable transaction/explorer link.
- Passport/QR representation (secondary QR request/presentation path is approved).

Required user actions:

- **Verify for a service**
- **Refresh evidence**
- **View evidence transactions**
- **View activity history**

### Technical details drawer

Include chain/network (`Polygon Amoy`), contract address as available, passport ID, evidence version, evidence commitment, issuance/update details, identity hash/reference without real Aadhaar data, and explorer links. A reference may show **Supersedes #oldPassportId** for admin-authorized replacement, but the old credential stays REVOKED.

### Never show

A numeric worker rating, “156 credits” score, platform performance rating, “regular/irregular worker” classification, personal loan/benefit activity embedded in the passport itself, or raw bank rows on-chain.

## 8. Worker: refresh evidence — LOCKED

1. Worker chooses `Refresh evidence`.
2. Obtain fresh FIP consent/data as needed.
3. Verify signed source and recalculate classified transactions.
4. Show updated transaction evidence/summary to worker.
5. ATTESTER updates **same ACTIVE passport**, new commitment, contract-incremented version and fresh timestamp.
6. Show refreshed passport state, evidence version, Polygon transaction/explorer; historical refresh can be inspected via events.

**Freshness is per verifier policy**, not a passport expiry timer. REVOKED passport cannot refresh; recovery is reissue, not refresh/reactivate.

## 9. Verifier: signing identity and policy builder — LOCKED

### Identity

- Verifier signs with an **EVM wallet/address**; this is cryptographic `verifierId`.
- Display name is optional human-readable metadata.
- Optional consumer contract address is metadata, not the signing identity.

### Supported selectable criteria — exact vocabulary

| Field | UX requirement |
|---|---|
| `minAverageIncome` | Optional minimum average **recognized gig income** threshold |
| `incomeWindowMonths` | Selectable/required when income criterion is enabled |
| `continuityUnit` | `WEEK` or `MONTH` |
| `continuityWindow` | Time window in selected unit |
| `minActivePeriods` | Optional min active periods in requested window |
| `minHistoryMonths` | Optional verified history threshold |
| `maxEvidenceAgeDays` | Optional public freshness threshold |
| `expiresAt` | Expiration of signed request |

Also generate `requestId`, `verifierId`, `policyHash`, `verifierSignature` as defined by protocol. Optional criteria are non-blocking when disabled.

**Must not create:** `purpose`, `workerRole`, `verifierType`, a GigVault eligibility score, `maxAverageIncome`, `maxInactivePeriods`, worker cadence label. Lender/platform/landlord may appear as **UI presets** but are not separate trusted protocol classes. Do not invent additional preset thresholds.

### Signing and immutability

- Show selected policy, calculate its canonical hash and sign off-chain with verifier EVM wallet.
- Once signed, criteria must **not** mutate in place.
- Any changed criteria require **new request ID, signature, worker approval, proof**.
- Wallet signing does not require a blockchain gas transaction by itself.

### Request delivery

- Primary: service-embedded **Verify with GigVault** request.
- Secondary: QR/deep link into the **same policy-review/approval engine**.

**Two distinct QR experiences — LOCKED:**

1. **Passport QR (worker shows to verifier):** resolves to public passport identity/status and may launch a new verifier-signed policy request. It **does not** contain private income/activity, silently run custom threshold tests or replace worker approval.
2. **Verifier Request QR (verifier shows/sends to worker):** carries or resolves the exact immutable, signed policy and its expiry; worker must review/verifiably approve before a proof is generated.

Both converge on the same signed-policy and worker-consent flow. A passport QR is **not** a preapproved, universal proof of private earnings.

An exact QR encoding, route naming and UI color/theme are **not locked**.

## 10. Worker: verification request review — LOCKED

Before generating proof, worker sees:

- Who is requesting: verifier name and address/reference.
- Exact requested conditions, thresholds, time windows and activity unit.
- Freshness requirement when enabled.
- Request expiry.
- Privacy statement: verifier receives requested PASS/FAIL, **not** bank transactions or actual private income/history/activity values.
- Approve-and-generate or Decline actions.

### Illustrative review (not extra locked policy)

> **Microcredit requests verification**  
> Average recognized gig income ≥ ₹20,000/month over last 6 months  
> Verified history ≥ 12 months  
> Active months ≥ 9/12  
> Evidence age ≤ 30 days  
> Exact income and bank transactions won't be shared.

**LOCKED**: approval binds *exact signed policy*. Any criteria change is a new approval, not silent probing.

## 11. Worker: proof generation and consent renewal — LOCKED

Steps should convey real work without dumping private values:

- Retrieve FIP-authenticated dataset (renew expired consent if needed).
- Reconstruct evidence deterministically to **current recorded cutoff/version and historical source-directory version**.
- The source registry records identifiers with `introducedInVersion` / optional `deactivatedInVersion`; the backend uses the snapshot's original `sourceDirectoryVersion` to reconstruct. This is **technical evidence provenance**, not an additional worker/verifier policy field.
- Verify its commitment matches on-chain current evidence.
- Generate Circom/Groth16 proof for signed policy.
- Deliver proof/public signals to verifier/consumer.

UI may show understandable progress states; exact spinner copy/animation is illustrative and not separately approved.

**Do not** claim that the browser has a saved canonical EvidenceSnapshot; there is **no persisted snapshot or raw FIP archive inside GigVault** for this hackathon.

## 12. Shared proof result language — LOCKED

### Two separate kinds of checks

**Cryptographic/protocol/public** (outside ZK):

- signed request/verifier integrity;
- request expiry;
- passport exists and `ACTIVE`;
- current evidence version/commitment;
- public freshness;
- ZK mathematical verification;
- correct passport/verifier/request/policy/domain binding.

**Private ZK facts**, presented as per-condition results:

- income threshold: PASS/FAIL;
- verified history threshold: PASS/FAIL;
- activity threshold: PASS/FAIL.

Disabled conditions are **omitted**. A valid Groth16 proof **can return FAIL for activity**, without being an invalid proof.

**Integration mapping (locked semantics, not a proposed TypeScript type):** the approved public condition-result names are `incomePass`, `historyPass` and `activityPass`. The UI displays only enabled conditions; these booleans are outputs of verified proof, never frontend-calculated substitutes.

### Example: Imran — valid-but-does-not-meet lending policy

| Check | Result |
|---|---|
| Passport ACTIVE | PASS |
| Evidence fresh | PASS |
| ZK mathematical proof valid | PASS |
| Average **monthly** recognized gig income (last **6 completed months**) ≥ ₹20,000 | PASS |
| History ≥ 12 months | PASS |
| Active months ≥ 9/12 | **FAIL** |

Final consumer result: **Loan requirements not satisfied**; **Borrow not available**. Do **not** display Imran's actual income or exact active-month count.

### Example: security failure

If passport status is REVOKED, live verification should stop at that stage; later checks are **not continued**, rather than showing success.

## 13. Verifier: waiting and live verification pipeline — LOCKED

### Waiting

After sending a signed request, show waiting for worker approval/proof. No raw evidence or exact values become visible.

### Live pipeline

Present roughly **5–7 meaningful steps**, for example:

1. Request integrity / verifier signature.
2. Passport lookup and status on Polygon.
3. Current evidence version/commitment and freshness.
4. Groth16/ZK proof verification.
5. Requested condition evaluation.
6. Consumer-state check (if present).
7. Final application result (if present).

States: waiting → checking → pass/fail; minimal fast animation. Actual frontend may group steps for clarity without removing real checks. On integrity failure, mark the correct failure and stop/skips downstream checks. **Do not make cosmetic animations imply that a skipped ZK verification passed.**

### Verified result

Show independent source-of-truth elements (on-chain passport state, signed request integrity, proof validity) plus **requested per-condition PASS/FAIL**. Verifier sees **no raw transactions, monthly income totals or exact history/activity counts**.

### Technical drawer

- network, passport ID, contract;
- evidence version and commitment;
- request ID, verifier address, policy hash;
- Groth16 validity, status, relevant transaction/explorer;
- no routine proof JSON export and no private witness display.

## 14. WelfareVault: independent external-service frontend — LOCKED

Product-facing service name:

> **Gig Worker Support Benefit**  
> One-time support for verified active gig workers.

### Eligibility conditions shown

- ACTIVE GigVault passport.
- Verified history **≥ 6 months**.
- Active months **≥ 4 of last 6**.
- Evidence age **≤ 90 days**.
- Not previously claimed **by this identity**, including under a revoked/replaced passport.
- **No income threshold.**

### Must have **two separate actions**

1. **Verify with GigVault** → worker reviews/approves exact signed request → shared live checks and per-condition result.
2. Only when **all** conditions pass: show/enable **Claim benefit**.

**If even one fails:** hide/disable Claim and show the failed condition. The action must also be rejected by `WelfareVault.sol` when called directly. This requirement was explicitly added and approved; **a successful-looking frontend button is not enough**.

### Success and post-claim

- Actual benefit claim contract transaction and event/state.
- Confirmation + transaction/explorer link.
- **Already claimed** state on repeat; contract must reject second claim.

- `WelfareVault.sol` uses the stable on-chain `identityNullifierHash` for `claimedByIdentity`, so replacement passports **do not** reset the one-time claim. On recovery, show **Already claimed** when prior passport for this identity already claimed, without exposing private history.
- Worker sees per-condition pass/fail, no actual private metrics.
- Technical details identify Amoy and test POL if used; **exact benefit test-POL amount remains pending**.

### IMPORTANT boundary

WelfareVault should feel like a **separate consumer application**, not a GigVault internal tab and not a welfare decision secretly made by the passport contract. **Claim status belongs in WelfareVault.**

## 15. Microcredit: independent external-service frontend — LOCKED

Product-facing service name: **Microcredit**. User-facing amount **100 USDC** with an honest **MockUSDC test asset / Polygon Amoy** disclosure in technical/environment context.

### Eligibility conditions shown

- ACTIVE passport.
- Average recognized gig income in last **6 months ≥ ₹20,000/month**.
- Verified history **≥ 12 months**.
- Active months **≥ 9/12**.
- Evidence age **≤ 30 days**.
- No outstanding active loan for the **same identity**, including a loan taken under a prior revoked/replaced passport.

### Must have **separate Verify → Borrow actions**

1. **Verify with GigVault** → worker approves signed policy → shared live verification/result.
2. Only after all checks pass and no loan active → **Borrow 100 USDC** becomes available.
3. Any condition failed → Borrow disabled/absent; failed check and **Loan requirements not satisfied** visible.
4. Even when frontend bypassed, lending contract must reject any unsatisfied condition, used request, stale proof, revoked passport or active second loan.

### Active loan

- Show **loan active**, principal **100 USDC**, actual borrow transaction/explorer link.
- Show **Repay 100 USDC** action.

- After authorized passport recovery, display the **same identity-linked outstanding loan** on the replacement passport. Allow repayment from the replacement wallet **without another income ZK proof**; do not show a second Borrow while that loan remains active.
- No APR/interest, due-date, collateral, liquidation, underwriting score or other terms.

### After repayment

- Show repaid confirmation/transaction; `loanActive=false`.
- **Borrowing again requires a fresh GigVault verification request and proof.**

- Recovery does **not** reset debt. After fully repaying an identity-linked outstanding loan, the worker may apply again only through a **new signed, worker-approved policy request**.
- Do not reactivate old proof/request or automatically approve new loan.

### Technical disclosure

Use MockUSDC/Amoy accurately in technical context. It is a **valueless test asset**, not real USD/USDC credit.

**Accepted privacy limitation:** The same public app-scoped `identityNullifierHash` links a worker's recovery history, welfare claim and loan state across contracts. Avoid saying the MVP provides complete on-chain unlinkability. Consumer-specific nullifiers are a potential future production enhancement, not implemented.

## 16. Admin/recovery interface — LOCKED

A small ADMIN-wallet-gated screen for exceptional credential invalidation/reissue permission.

Required:

- search/select passport;
- show status, holder, evidence version;
- revoke action;
- reason chosen/logged;
- optional **Allow reissue** control;
- confirm with **ADMIN wallet**.

Agreed illustrative reason categories: wallet compromised, duplicate identity, issuance integrity, other. **ADMIN** revokes and separately authorizes reissue; **ATTESTER** later replacement-mints after new wallet/same identity/fresh FIP. Old passport visibly stays REVOKED.

Must not include: user service-desk queues, appeals, support accounts, evidence editing, admin manual mint, automatic restore of revoked passport.

## 17. Security checks presentation surface — LOCKED

Keep **compact**, with Arjun Mehta as legitimate base delivery-worker persona. Presenter triggers one controlled case at a time. Display the same live verification-line component used elsewhere and stop at the actual failing integrity/state check.

| Trigger | Required failure reason | Later stages |
|---|---|---|
| Tamper signed FIP transaction | `FIP signature invalid` | Not continued |
| Modify derived evidence/snapshot | `commitment mismatch` | Not continued |
| Present old proof after refresh for new request | `evidence version outdated` | Not continued |
| Revoke passport | `passport REVOKED` | Not continued |
| Attempt duplicate ACTIVE passport same identity | `active passport already exists for this identity` | Issuance rejected |

**Example stopping line (illustrative layout):**

```text
Request integrity       PASS
Passport lookup         PASS
Passport status         FAIL — REVOKED
ZK verification         Not continued
```

These are **integrity failures**, not ordinary policy failures. Arjun's default/baseline data is legitimate. A friend transfer with unauthorized payer is simply **excluded**, not automatically called tampering.

**Stage-accurate check animation (LOCKED):** Show FIP signature failure during authenticated evidence intake; snapshot mismatch at commitment validation/proof preparation; old proof and REVOKED passport during verification; duplicate identity during passport **issuance**, not an imaginary ZK result. Later checks read **Not continued** only if that process actually reached their prerequisites.

## 18. Seven locked personas: frontend content and scenarios

| Persona | Main visible story | Specific result constraints |
|---|---|---|
| **Ramesh Kumar / Swiggy** | Primary issuance, realistic Swiggy receipts, passport and refresh, benefit success, loan success | ~Jan 2024–Oct 2026, monthly recognized roughly ₹24–35k, 12/12 active months; **pass Welfare and Microcredit**; not the tamper victim |
| **Suresh Gowda / Uber + Ola** | Two platforms paying same worker | Both sources counted; ~10–11 active months of 12; adequate combined recognized income |
| **Imran Pasha / cab** | Normal policy failure even with valid proof | ACTIVE/fresh, 6-month income threshold PASS, history PASS, **8/12 active → activity FAIL** for Microcredit |
| **Manjunath S / Urban Company** | Legitimate but short work history | ~4 months verified, fresh/active; fail minimum history ≥6 |
| **Venkatesh R / Porter** | Uneven payout timing without punishing the worker | Adequate total history/activity PASS; **never assign an “irregular worker” label** |
| **Farhan Ali / Swiggy → Zomato** | Portability during platform switch | Historic Swiggy → overlap → recent Zomato under **one** ACTIVE passport; sufficient history/activity PASS |
| **Arjun Mehta / delivery partner** | Security/integrity checks | Legitimate base, controlled five failures, one at a time |

All records must look like **individual realistic bank rows**, not fabricated metric-only fixture tables. Excluded personal/self/family/refund credits and debits are important visible evidence.

**Do not use old-draft personas or policies** such as Namrata Rao, Imran Shaikh, Kavya S, lender “consistency >=80%”, expired on-chain status or max missed-weeks criterion unless separately proposed and approved.

## 19. Worker-only local activity history — LOCKED

Maximum **20 records OR 90 days**, whichever retains fewer/shorter history. For each: verifier, request ID, timestamp, signed requested criteria, per-condition and overall result. Local convenience only (not central financial evidence, not a universal consumed-proof ledger).

**Never persist in this log:** raw FIP rows, exact income, EvidenceSnapshot/witness or proof object. **Do not** show worker-only log as a public on-chain application history.

## 20. Privacy/visibility acceptance matrix — LOCKED

| Information | Worker evidence UI | Verifier UI | Welfare/Microcredit UI | Chain |
|---|---|---|---|---|
| Signed source/raw FIP rows | Visible for inspection | **Never** | **Never** | **Never** |
| Counted/excluded transaction classification | Visible | No | No | No |
| Exact income totals and private activity vectors | Private evidence processing; not proof results | **Never** | **Never** | **Never** |
| Passport ID/status, version/commitment | Visible | Visible/checkable | Visible/checkable | Yes |
| Signed policy thresholds | Worker approves | Verifier created | Consumer policy | Not persisted as global verification log |
| Per-condition PASS/FAIL | Yes | Yes | Yes | Used as proof/public inputs where needed; no global results ledger |
| Claim/loan transaction state | On respective service | Not generic GigVault history | Their own state and tx | Consumer contract only |

**Important nuance:** The worker can inspect **their own original transaction amounts** in the worker evidence table; the promise is that those rows and actual **aggregate** values are not revealed to a verifier as proof output.

## 21. User-facing state coverage — LOCKED business causes

| Situation | Correct state/action (copy illustrative unless quoted as required) |
|---|---|
| No wallet | Prompt connect |
| Identity not verified | Prompt identity verification |
| Duplicate ACTIVE identity | Block mint; clear duplicate explanation |
| FIP consent denied/expired | Stop fetch or ask renewal |
| Invalid FIP signature | Integrity failure, no mint/refresh/proof |
| Unrecognized authentic payer | Show row excluded, not a signature failure |
| New worker valid evidence | Can create passport after attestation |
| Passport ACTIVE, evidence stale relative to policy | Passport still ACTIVE; show freshness failure |
| Passport REVOKED | Block refresh/verification/action; may follow authorized reissue |
| Evidence commitment mismatch | Block proof; integrity failure |
| New request uses old proof/version | Reject outdated evidence version |
| Request expired/signer mismatch | Reject protocol check |
| Valid proof with criterion FAIL | Show factual FAIL; do not show “fraud” |
| Welfare proof good, not claimed | Enable separate Claim |
| Welfare criterion fails | Disable/hide Claim; show failed check |
| Welfare already claimed | Show claimed; cannot claim again |

| Welfare claim made on a prior passport for the **same identity** | Show already claimed; replacement does not reset benefit eligibility |
| Microcredit proof good, no loan active | Enable separate Borrow |
| Microcredit condition fails | Disable/hide Borrow; show failed check |
| Loan active | Disallow second loan, enable repay |

| Old passport revoked/replaced with outstanding loan | Replacement holder can repay existing identity-linked loan; second borrow blocked; no fresh income proof required to repay |
| Loan repaid | Fresh signed request required before reborrow |

| Income-period calculation | Render specific verifier policy: last N **completed** UTC calendar months; incomplete current month omitted, including 0-income completed months |

## 22. Frontend implementation/QA handoff — IMPLEMENTATION GUIDANCE

**Temporal consistency for displays:** Worker and verifier policy summaries should say **completed months/weeks** when describing the approved core bucket calculations. Thirty-six income/month-activity buckets and 156 weekly flags run oldest→newest and exclude partial current UTC month/ISO week. This defines evidence semantics, **not a universal verifier policy window**.

**Interface boundary:** No final REST routes or TypeScript DTOs were separately approved. Frontend must consume attester/contract outputs rather than computing gig classifications, proof PASS bits, loan state or identity-binding assertions from browser-supplied input.


Build dependencies (not new product requirements):

1. Shared visual vocabulary and distinct shells for GigVault / provider consent / Welfare / Microcredit / Admin.
2. Data-driven worker evidence table (actual row classification status from service, not frontend guesses from narration).
3. Passport state/dashboard with chain read+tx/explorer integration.
4. Immutable verifier policy builder + signer integration.
5. Worker request review/approval + proof-progress UI.
6. One reusable verification pipeline/result view for verifier and both consumer services.
7. Welfare conditional separate Claim and real claim-state integration.
8. Microcredit conditional Borrow, active/repay/reborrow states and real loan-state integration.
9. Admin reissue / compact Arjun security-case presentation.
10. Verify privacy/no overclaim and run scenarios below.

**No approved TypeScript data types or HTTP endpoints are imposed by this document.** Define them jointly with backend/contract team to implement the semantic fields exactly; sample interfaces should be presented as proposals for integration review, not falsely labelled approved requirements. Do not commit backend/verifier private signing keys to frontend source.

### Critical acceptance passes

- Ramesh: raw transactions visible only to worker → recognized payouts → real passport/refresh and explorer → worker-approved signed proof → welfare claim → lending borrow/repay.
- Suresh: recognized Uber and Ola source classification under one passport.
- Farhan: historic Swiggy and current Zomato; same passport.
- Imran: valid proof and ACTIVE passport + **activity FAIL**; no borrow.
- Manjunath: history FAIL despite legitimate activity; no false fraud alert.
- Venkatesh: no “irregular worker” label; valid activity proof.
- Arjun: five independent failures trigger real rejection and stop at correct pipeline step.
- Welfare: verify PASS does **not** auto-claim; Claim separately succeeds once; direct invalid claim reverts.

- Recovery: replacement passport preserves WelfareVault already-claimed state and outstanding Microcredit loan; replacement wallet can repay existing debt without income proof. Source FIP identity mismatch blocks issuance/refresh.
- Lending: verify PASS does **not** auto-borrow; active loan blocks second borrow; fresh approved proof after repayment.
- Everywhere: **no raw FIP data/exact aggregate income leaks** into verifier/consumer screens, shareable URLs or ordinary technical drawers.

## 23. PENDING APPROVAL / engineering freedoms

**Genuinely unfinalized:** app framework, router URLs, design system/branding colors, precise component hierarchy, QR encoding, backend wire types/API paths, practical proof-generation placement, final timed judge walkthrough order and which persona pages are shown live vs backup. A design decision that changes approved privacy, factual policy, signing/binding, identity, passport state, front-end action gating or consumer behavior is **not** an implementation freedom; ask first.

## 24. FUTURE / OUT OF MVP

No extra financial product, card-like GigVault score, global application activity feed, mandatory verifier-history database, worker cadence categorization, purpose/verifier-type in protocol, DAO/token/fees, provider-onboarding queue, bank-edited gig labels, onchain proof/result history, loan interest/collateral/due-date/liquidation or production AA claim. No new frontend screens/features solely because they appeared in an older unapproved draft.

### Final frontend invariant

> A worker sees and controls the provenance and exact signed verification request. A verifier sees independently checkable **facts, not financial records**. The independent Welfare/Microcredit services can execute on-chain actions only after valid proofs **and their own contract checks**, never because the frontend merely enabled a button.
