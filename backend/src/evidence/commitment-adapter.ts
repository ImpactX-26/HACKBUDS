/**
 * GigVault - Evidence Commitment Adapter Boundary
 * 
 * Defines the clean cryptographic adapter interface between Backend A's transient
 * EvidenceSnapshot derivation and the underlying evidence commitment scheme:
 * 
 * 1. PoseidonEvidenceCommitmentAdapter:
 *    Provisional Gate 1 Poseidon(5) 4-child hierarchical tree adapter reproducing
 *    circuits/fixtures/backend-a-e991-vectors.json and shared Poseidon spec.
 * 
 * 2. MockEvidenceCommitmentAdapter:
 *    Explicitly labeled mock simulator computing deterministic scalar digest
 *    for fast, zero-dependency unit tests. Prohibited from live on-chain minting.
 * 
 * INVARIANT:
 * Backend A does not lock or freeze shared BN254 constants independently.
 * The adapter boundary allows Backend B's final circuit commitment implementation
 * to be hot-swapped without altering Backend A's financial normalization pipeline.
 */

import { createBackendAPoseidon } from './poseidon-adapter.js';
import {
  addressToFieldElement,
  hashToFieldElement,
  providerIdToFieldElement,
} from '../../../shared/proposal/field-mappings.js';
import type { EvidenceSnapshot } from './snapshot-builder.js';

export interface CommitmentResult {
  evidenceCommitment: string; // Decimal string representation of BN254 scalar
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

/**
 * Provisional Gate 1 Poseidon Evidence Commitment Adapter
 * Computes 4-ary Poseidon tree roots over monthly income, weekly activity,
 * and metadata slots matching circomlibjs and Backend B Gate 1 fixtures.
 */
export class PoseidonEvidenceCommitmentAdapter implements IEvidenceCommitmentAdapter {
  public readonly isMockAdapter = false;
  public readonly adapterName = 'PoseidonEvidenceCommitmentAdapter_Gate1_Provisional';
  private poseidonPromise: ReturnType<typeof createBackendAPoseidon> | null = null;

  private async getPoseidon() {
    if (!this.poseidonPromise) {
      this.poseidonPromise = createBackendAPoseidon();
    }
    return this.poseidonPromise;
  }

  public async computeCommitment(snapshot: EvidenceSnapshot): Promise<CommitmentResult> {
    const poseidon = await this.getPoseidon();

    const holderBindingScalar = addressToFieldElement(snapshot.holderBinding);
    const providerIdScalar = providerIdToFieldElement(snapshot.evidenceProviderId);
    const dataHashScalar = hashToFieldElement(snapshot.evidenceDataHash);

    const input = {
      passportId: BigInt(snapshot.passportId),
      holderBinding: holderBindingScalar,
      evidenceProviderId: providerIdScalar,
      evidenceDataHash: dataHashScalar,
      verifiedHistoryStartDate: BigInt(snapshot.verifiedHistoryStartDate),
      evidenceUpdatedAt: BigInt(snapshot.evidenceUpdatedAt),
      sourceDirectoryVersion: BigInt(snapshot.sourceDirectoryVersion),
      monthlyGigIncomeTotals: snapshot.monthlyGigIncomeTotals.map((x) => BigInt(x)),
      weeklyActivity: snapshot.weeklyActivity.map((x) => BigInt(x)),
      monthlyActivity: snapshot.monthlyActivity.map((x) => BigInt(x)),
    };

    const result = poseidon.commit(input);

    return {
      evidenceCommitment: result.evidenceCommitment.toString(),
      incomeRoot: result.incomeRoot.toString(),
      weeklyRoot: result.weeklyRoot.toString(),
      monthlyRoot: result.monthlyRoot.toString(),
      isMockCommitment: false,
      adapterName: this.adapterName,
    };
  }
}

/**
 * Explicitly Labeled Mock Commitment Adapter
 * Simulates commitment derivation via SHA-256 scalar integer reduction for offline testing.
 * Strictly blocked from broadcasting to live smart contracts.
 */
export class MockEvidenceCommitmentAdapter implements IEvidenceCommitmentAdapter {
  public readonly isMockAdapter = true;
  public readonly adapterName = 'MockEvidenceCommitmentAdapter_SIMULATED_TEST_ONLY';

  public async computeCommitment(snapshot: EvidenceSnapshot): Promise<CommitmentResult> {
    // Deterministic mock scalar digest derived from evidenceDataHash
    const rawBigInt = BigInt(`0x${snapshot.evidenceDataHash}`);
    // BN254 scalar field modulus r
    const r = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
    const commitment = (rawBigInt % r).toString();

    return {
      evidenceCommitment: commitment,
      isMockCommitment: true,
      adapterName: this.adapterName,
    };
  }
}

export const defaultCommitmentAdapter: IEvidenceCommitmentAdapter = new MockEvidenceCommitmentAdapter();
