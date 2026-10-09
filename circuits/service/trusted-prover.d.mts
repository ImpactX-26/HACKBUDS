export type Decimal = string;
export interface Policy {
  requestId: string; verifierId: string; incomeEnabled: Decimal; incomeWindowMonths: Decimal;
  minAverageIncomePaise: Decimal; activityEnabled: Decimal; activityIsWeekly: Decimal;
  activityWindow: Decimal; minActivePeriods: Decimal; historyEnabled: Decimal;
  minHistoryMonths: Decimal; maxEvidenceAgeDays: Decimal; expiresAt: Decimal;
}
export interface ProofRequest {
  protocolVersion: 'gv-local-prover-b4/1'; eligibilityProfile: 'gv-eligibility-0.2-provisional';
  consumer: 'gate' | 'welfare' | 'loan'; passportId: Decimal; evidenceHandle: string;
  policy: Policy; verifierSignature: string; workerSignature: string;
}
export interface EvidenceEnvelope {
  protocolVersion: 'gv-local-prover-b4/1'; eligibilityProfile: 'gv-eligibility-0.2-provisional';
  commitmentProfile: 'gv-poseidon-hash-only-0.2.0'; schemaVersion: '2'; evidenceVersion: Decimal;
  snapshot: {
    passportId: Decimal; holderBinding: Decimal; evidenceProviderId: Decimal; evidenceDataHash: Decimal;
    verifiedHistoryStartDate: Decimal; evidenceUpdatedAt: Decimal; sourceDirectoryVersion: Decimal;
    monthlyGigIncomeTotals: Decimal[]; weeklyActivity: Decimal[]; monthlyActivity: Decimal[];
  };
}
export interface ProofResult {
  protocolVersion: string; eligibilityProfile: string; commitmentProfile: 'gv-poseidon-hash-only-0.2.0'; schemaVersion: '2'; setupId: string;
  proof: {pi_a: string[]; pi_b: string[][]; pi_c: string[]; protocol: string; curve: string};
  publicSignals: string[];
  solidity: {a: string[]; b: string[][]; c: string[]; signals: string[]};
}
export interface TrustedState {
  passport: {holderWallet: string; evidenceVersion: bigint; evidenceCommitment: bigint;
    evidenceUpdatedAt: bigint; schemaVersion: bigint; status: bigint};
  domain: {name: string; version: string; chainId: number | bigint; verifyingContract: string};
  now: number | bigint; expectedVerifier: string;
}
export declare const protocolVersion: 'gv-local-prover-b4/1';
export declare const eligibilityProfile: 'gv-eligibility-0.2-provisional';
export declare const evidenceSchemaVersion: '2';
export declare function createTrustedProver(dependencies: {
  readState: (consumer: ProofRequest['consumer'], passportId: Decimal, policy: Policy) => Promise<TrustedState>;
  reconstruct: (handle: string) => Promise<EvidenceEnvelope>;
  hashes: {commit(snapshot: EvidenceEnvelope['snapshot']): {evidenceCommitment: bigint}};
  prove: (input: Record<string, unknown>) => Promise<Pick<ProofResult,'proof'|'publicSignals'>>;
  setupId: string;
}): Readonly<{prove(request: ProofRequest): Promise<ProofResult>}>;
