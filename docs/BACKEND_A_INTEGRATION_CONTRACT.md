# GigVault — Backend A Integration Contract & Interface Specification

**Target Audience:** Backend B (ZK Circuit, Smart Contract & Verifier Owner)  
**Status:** Authoritative Backend A Adapter Contract (Frozen for Independent Parallel Delivery)  
**Owner:** Backend A (Evidence, Identity & FIP Implementation Owner)

---

## 1. Overview & Separation of Concerns

GigVault separates evidence attestation and zero-knowledge verification into two autonomous layers:

```
┌────────────────────────────────────────────────────────┐
│                      BACKEND A                         │
│  - Mock Bank / FIP Authority (secp256k1 signed data)   │
│  - Mock Identity Provider (Anon Aadhaar simulation)    │
│  - Worker Wallet Authorization & Replay Protection     │
│  - Conservative Gig-Payer Directory (Versioned)        │
│  - Deterministic Normalization (36M / 156W Calendars)  │
│  - Transient EvidenceSnapshot Derivation (Zero Storage)│
└──────────────────────────┬─────────────────────────────┘
                           │
             ADAPTER BOUNDARIES (INTERFACES)
      ┌────────────────────┴────────────────────┐
      ▼                                         ▼
┌───────────────────────────┐       ┌───────────────────────────┐
│ IEvidenceCommitmentAdapter│       │    IGigPassportClient     │
│ (Poseidon / Gate 1 Tree)  │       │ (GigPassport.sol boundary)│
└───────────────────────────┘       └───────────────────────────┘
      │                                         │
┌─────▼─────────────────────────────────────────▼───────────────┐
│                      BACKEND B                         │
│  - Circom Circuits (Income, Tenure, Policy Verification)│
│  - Groth16 Prover & SnarkJS Witness Calculation        │
│  - Polygon Amoy Smart Contracts (GigPassport.sol)      │
│  - WelfareVault & Microcredit Consumer Gateways        │
└───────────────────────────────────────────────────────────────┘
```

Backend A is **fully complete and runnable independently**. It requires no changes to its normalization or financial classification pipeline when Backend B connects its circuits and smart contracts.

---

## 2. EvidenceSnapshot Schema & Canonical Encoding

Backend A derives a transient, in-memory `EvidenceSnapshot` from authenticated bank records.

### A. Field Specification

| Field Name | Type | Representation | Description |
| :--- | :--- | :--- | :--- |
| `passportId` | `number` | Safe integer ($\ge 1$) | Sequential passport ID assigned or expected |
| `holderBinding` | `string` | `0x` + 40 hex chars | EVM wallet address of the worker (lowercase) |
| `evidenceProviderId`| `string` | ASCII string | Authenticated FIP identifier (e.g. `MOCK_APNA_BANK_FIP_01`) |
| `evidenceDataHash` | `string` | 64 hex chars (32 bytes) | Canonical SHA-256 digest of normalized transactions |
| `verifiedHistoryStartDate`| `number`| UTC Unix seconds | Start of the 36-month lookback window |
| `evidenceUpdatedAt`| `number` | UTC Unix seconds | Cutoff timestamp of attested evidence |
| `sourceDirectoryVersion`| `number`| Safe integer ($\ge 1$) | Version of the gig-payer directory used |
| `monthlyGigIncomeTotals`| `number[36]`| Integer paise ($\ge 0$) | Completed 36 UTC months, index 0 = oldest, 35 = latest |
| `weeklyActivity` | `(0 \| 1)[156]` | Binary flags | Completed 156 ISO weeks, index 0 = oldest, 155 = latest |
| `monthlyActivity` | `(0 \| 1)[36]` | Binary flags | Completed 36 UTC months, index 0 = oldest, 35 = latest |
| `evidenceCommitment`| `string` | Decimal scalar string | BN254 field element output from commitment adapter |

### B. Invariants & Units
1. **Monetary Units:** Exactly integer paise ($\text{₹}1.00 = 100\text{ paise}$). Float amounts and negative amounts are strictly rejected at the verifier boundary.
2. **Activity Flags:** Exactly `0` or `1`. No floating thresholds or partial credits.
3. **Calendar Slices:**
   - 36 completed UTC calendar months (excluding uncompleted current month).
   - 156 completed ISO 8601 calendar weeks (Monday 00:00:00 UTC to Sunday 23:59:59 UTC).
4. **Deterministic Ordering:** Oldest to newest across all arrays.
5. **No-History Sentinel:** Uncovered months or weeks before worker account inception are padded with `0` income and `0` activity.

---

## 3. Privacy Boundaries & Data Minimization

1. **Zero Raw Persistence:** Backend A never writes raw bank transactions or plaintext `EvidenceSnapshot` records to disk or databases.
2. **Transient Witness Handoff:** Witness inputs are built on demand and transferred to the trusted proving component via `ITrustedProverAdapter.handoffWitness(...)`.
3. **Consumer Verifier Boundary:** Smart contracts and external verifiers (WelfareVault, Microcredit) receive **only**:
   - Passport ID and Holder address
   - Immutable Evidence Commitment scalar
   - Boolean per-condition PASS/FAIL signals
   - **Never** transaction amounts, counterparty names, statement narrations, or raw monthly breakdowns.

---

## 4. Commitment Adapter Interface (`IEvidenceCommitmentAdapter`)

Backend A computes the evidence commitment via an injected adapter implementing:

```typescript
export interface CommitmentResult {
  evidenceCommitment: string; // Decimal string (< BN254 scalar field modulus r)
  incomeRoot?: string;
  weeklyRoot?: string;
  monthlyRoot?: string;
  isMockCommitment: boolean;
  adapterName: string;
}

export interface IEvidenceCommitmentAdapter {
  readonly isMockAdapter: boolean;
  readonly adapterName: string;
  computeCommitment(snapshot: EvidenceSnapshot): Promise<CommitmentResult>;
}
```

### Available Adapters:
1. `PoseidonEvidenceCommitmentAdapter`:
   - Computes the provisional Gate 1 hierarchical 4-child Poseidon tree over:
     - 36 monthly incomes $\to$ 9 level-1 $\to$ 3 level-2 $\to$ 1 `incomeRoot`
     - 156 weekly activities $\to$ 39 level-1 $\to$ 10 level-2 $\to$ 3 level-3 $\to$ 1 `weeklyRoot`
     - 36 monthly activities $\to$ 9 level-1 $\to$ 3 level-2 $\to$ 1 `monthlyRoot`
     - Top-level commitment: `Poseidon(passportId, holderScalar, providerScalar, dataHashScalar, historyStart, updatedAt, dirVersion, incomeRoot, weeklyRoot, monthlyRoot)`
   - Matches published Backend B Gate 1 golden vectors exactly.
2. `MockEvidenceCommitmentAdapter`:
   - Fast, zero-dependency offline test adapter deriving deterministic scalar digests.
   - `isMockCommitment: true`.
   - **Fail-Closed Gate:** Submitting this commitment to any non-mock contract client throws `LiveSubmissionProhibitedError`.

---

## 5. Smart Contract Client Interface (`IGigPassportClient`)

Backend A interacts with `GigPassport.sol` through `IGigPassportClient`:

```typescript
export interface EvidenceCommitmentData {
  commitment: string; // BigInt decimal string or uint256 hex
  updatedAt: number; // Unix seconds
  schemaVersion: number;
  providerRef: string; // bytes32 hex
  sourceDirectoryVersion: number;
}

export interface PassportRecord {
  passportId: number;
  holderWallet: string;
  identityNullifierHash: string;
  evidenceCommitment: string;
  evidenceVersion: number;
  evidenceUpdatedAt: number;
  issuedAt: number;
  status: 'ACTIVE' | 'REVOKED';
  schemaVersion: number;
  evidenceProvider: string;
  supersedes: number;
}

export interface IGigPassportClient {
  readonly isMockClient: boolean;
  getNextPassportId(): Promise<number>;
  getActivePassportByIdentity(identityNullifier: string): Promise<number>;
  getPassport(passportId: number): Promise<PassportRecord | null>;
  isReissueAllowed(identityNullifier: string): Promise<boolean>;
  mint(
    expectedId: number,
    holder: string,
    identityNullifierHash: string,
    evidence: EvidenceCommitmentData
  ): Promise<number>;
  refresh(passportId: number, evidence: EvidenceCommitmentData, caller?: string): Promise<void>;
  revoke(passportId: number, reason: string, caller?: string): Promise<void>;
  authorizeReissue(identityNullifier: string, caller?: string): Promise<void>;
}
```

### State Machine Requirements:
1. **Role Separation:**
   - `ATTESTER_ROLE`: authorized for `mint`, `refresh`, and `reissue`.
   - `ADMIN_ROLE`: authorized for `revoke` and `authorizeReissue`.
2. **Contention Prevention:**
   - Contract must enforce `expectedPassportId == nextPassportId`.
   - If a concurrent mint increments the ID, Backend A catches `ExpectedIdMismatch` and re-executes with freshly signed worker authorization.
3. **One Active Passport Per Identity:**
   - Attempting to mint when an `ACTIVE` passport already exists for the nullifier reverts with `ActivePassportExists`.
4. **Evidence Refresh Constraints:**
   - Target passport must be `ACTIVE`.
   - `updatedAt` must strictly advance (`> passport.evidenceUpdatedAt`).
   - `evidenceCommitment` must differ from the current commitment (`CommitmentUnchanged` rejection).
5. **Recovery / Reissue Flow:**
   - Passport must be terminally revoked by `ADMIN_ROLE`.
   - Admin must call `authorizeReissue(identityNullifier)`.
   - Worker signs a fresh `REISSUE_PASSPORT` authorization.
   - Attester calls `mint(...)`, which sets status to `ACTIVE`, links `supersedes = oldId`, and clears reissue authorization.

---

## 6. Prover Boundary (`ITrustedProverAdapter`)

Backend A constructs sanitized witness inputs for Backend B's Circom circuits:

```typescript
export interface CircuitWitnessInputs {
  passportId: number;
  holderAddressScalar: string;
  providerIdScalar: string;
  evidenceDataHashScalar: string;
  verifiedHistoryStartDateDays: number;
  evidenceUpdatedAtSeconds: number;
  sourceDirectoryVersion: number;
  monthlyGigIncomeTotalsPaise: string[]; // 36 decimal strings
  weeklyActivityFlags: number[]; // 156 integers (0 or 1)
  monthlyActivityFlags: number[]; // 36 integers (0 or 1)
}

export interface ProverWitnessPayload {
  snapshot: EvidenceSnapshot;
  circuitInputs: CircuitWitnessInputs;
  expectedPublicSignals: ExpectedPublicSignals;
  createdAt: number;
}
```

- `MockProverAdapter`: Returns simulated Groth16 proof format for local testing.
- `LiveProverServiceAdapter`: Forwards payload to Backend B's proving service over mutual TLS or secure IPC. Fails closed with `LiveProverNotConfiguredError` when unconfigured.

---

## 7. HTTP API Reference (Backend A REST Endpoints)

| Method | Endpoint | Auth Required | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/attestation/health` | None | Service status & directory version |
| `POST` | `/attestation/attest` | Worker EIP-191 + Mock IDP | Server-to-server FIP attestation & transient snapshot |
| `POST` | `/attestation/reconstruct` | Worker EIP-191 + Mock IDP | Deterministic reconstruction for prover |
| `POST` | `/attestation/mint-on-chain` | Worker EIP-191 + Mock IDP | Full attestation + passport contract minting |
| `POST` | `/attestation/refresh-on-chain` | Worker EIP-191 (`REFRESH`) | Update evidence commitment on active passport |
| `POST` | `/attestation/reissue-on-chain` | Worker EIP-191 (`REISSUE`) | Mint replacement passport for authorized identity |
| `GET` | `/attestation/passport/:id` | None | Read passport record from contract adapter |
| `POST` | `/attestation/prover/handoff` | Worker EIP-191 (`RECONSTRUCT`) | Construct circuit witness & hand off to prover |
| `POST` | `/attestation/admin/revoke` | `x-admin-key` Header | Terminal passport revocation |
| `POST` | `/attestation/admin/authorize-reissue` | `x-admin-key` Header | Authorize identity for recovery reissue |

---

## 8. Error Catalog

| HTTP Status | Error Code | Exception Class | Description |
| :--- | :--- | :--- | :--- |
| `400` | `WORKER_SUPPLIED_DATA_REJECTED` | `Error` | Client attempted to send self-certified raw bank data |
| `400` | `LIVE_SUBMISSION_PROHIBITED` | `LiveSubmissionProhibitedError` | Mock test commitment submitted to live contract |
| `400` | `PASSPORT_NOT_ACTIVE` | `PassportNotActiveError` | Attempted refresh on revoked passport |
| `400` | `COMMITMENT_UNCHANGED` | `CommitmentUnchangedError` | Evidence refresh had identical commitment |
| `400` | `EVIDENCE_TIMESTAMP_REGRESSED` | `EvidenceTimestampRegressedError` | Evidence timestamp is older than current version |
| `401` | `AUTHENTICATION_REQUIRED` | `Error` | Missing identity assertion or wallet signature |
| `401` | `WALLET_AUTHORIZATION_INVALID` | `Error` | Invalid EIP-191 signature or wrong signer |
| `403` | `IDENTITY_MISMATCH` | `Error` | Assertion wallet or nullifier does not match request |
| `403` | `ACCOUNT_OWNER_MISMATCH` | `Error` | Bank account owner does not match worker identity |
| `403` | `REISSUE_NOT_AUTHORIZED` | `ReissueNotAuthorizedError` | Attempted reissue without admin authorization |
| `403` | `ADMIN_UNAUTHORIZED` | `Error` | Missing or invalid admin API key |
| `404` | `PASSPORT_NOT_FOUND` | `Error` | Requested passport ID does not exist |
| `409` | `EXPECTED_ID_MISMATCH` | `ExpectedIdMismatchError` | Sequential expected ID contested by concurrent mint |
| `409` | `ACTIVE_PASSPORT_EXISTS` | `ActivePassportExistsError` | Identity already owns an ACTIVE passport |
| `409` | `REPLAY_ATTACK_DETECTED` | `Error` | Reused wallet authorization signature or nonce |
| `503` | `LIVE_ADAPTER_NOT_CONFIGURED` | `LiveAdapterNotConfiguredError` | Live contract client not configured (fails closed) |
| `503` | `PROVER_SERVICE_UNAVAILABLE` | `LiveProverNotConfiguredError` | Live prover service not configured (fails closed) |
