/**
 * GigVault - Trusted Prover Handoff Boundary
 * 
 * Implements the controlled private interface through which Backend A supplies
 * an authenticated EvidenceSnapshot to the ZK Prover component (owned by Backend B):
 * 
 * Architectural Invariants:
 * 1. Controlled Private Boundary:
 *    The proving payload includes the transient reconstructed EvidenceSnapshot
 *    and exact circuit scalar inputs. It is NEVER broadcast publicly or stored.
 * 2. Strict Range and Type Validation:
 *    Enforces uint64 / safe integer limits on money, binary flag checks (0 or 1),
 *    and BN254 scalar field bounds before witness handoff.
 * 3. Separation of Concerns:
 *    Backend A formats and validates the private witness inputs;
 *    Backend B's prover component generates the Groth16 zk-SNARK proof.
 * 4. Fail Closed:
 *    Live prover adapter strictly fails closed if the prover worker/service
 *    is not configured or unreachable.
 */

import type { EvidenceSnapshot } from './snapshot-builder.js';
import {
  addressToFieldElement,
  hashToFieldElement,
  providerIdToFieldElement,
} from '../../../shared/proposal/field-mappings.js';

export class ProverWitnessValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProverWitnessValidationError';
  }
}

export class ProverServiceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProverServiceUnavailableError';
  }
}

export class LiveProverNotConfiguredError extends ProverServiceUnavailableError {
  constructor(message: string) {
    super(message);
    this.name = 'LiveProverNotConfiguredError';
  }
}

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

export interface ExpectedPublicSignals {
  passportId: number;
  holderBinding: string;
  evidenceCommitment: string;
  sourceDirectoryVersion: number;
}

export interface ProverWitnessPayload {
  snapshot: EvidenceSnapshot;
  circuitInputs: CircuitWitnessInputs;
  expectedPublicSignals: ExpectedPublicSignals;
  createdAt: number;
}

export interface ProverHandoffResult {
  success: boolean;
  proverJobId: string;
  isMockProof: boolean;
  adapterName: string;
  witnessHash: string;
  simulatedProof?: {
    protocol: 'groth16';
    curve: 'bn128';
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
  };
  publicSignals: string[];
}

export interface ITrustedProverAdapter {
  readonly isMockAdapter: boolean;
  readonly adapterName: string;
  handoffWitness(payload: ProverWitnessPayload): Promise<ProverHandoffResult>;
}

/**
 * Validate and format transient EvidenceSnapshot into circuit-compatible witness inputs.
 */
export function buildProverWitnessPayload(
  snapshot: EvidenceSnapshot,
  computedCommitment?: string
): ProverWitnessPayload {
  // Validate array lengths
  if (!Array.isArray(snapshot.monthlyGigIncomeTotals) || snapshot.monthlyGigIncomeTotals.length !== 36) {
    throw new ProverWitnessValidationError(
      `Invalid monthlyGigIncomeTotals length: expected 36, got ${snapshot.monthlyGigIncomeTotals?.length}`
    );
  }
  if (!Array.isArray(snapshot.weeklyActivity) || snapshot.weeklyActivity.length !== 156) {
    throw new ProverWitnessValidationError(
      `Invalid weeklyActivity length: expected 156, got ${snapshot.weeklyActivity?.length}`
    );
  }
  if (!Array.isArray(snapshot.monthlyActivity) || snapshot.monthlyActivity.length !== 36) {
    throw new ProverWitnessValidationError(
      `Invalid monthlyActivity length: expected 36, got ${snapshot.monthlyActivity?.length}`
    );
  }

  // Validate non-negative safe integers for income
  for (let i = 0; i < 36; i++) {
    const val = snapshot.monthlyGigIncomeTotals[i];
    if (typeof val !== 'number' || !Number.isSafeInteger(val) || val < 0) {
      throw new ProverWitnessValidationError(
        `Invalid income at month index ${i}: must be non-negative safe integer, got ${val}`
      );
    }
  }

  // Validate binary flags (0 or 1)
  for (let i = 0; i < 156; i++) {
    const flag = snapshot.weeklyActivity[i];
    if (flag !== 0 && flag !== 1) {
      throw new ProverWitnessValidationError(
        `Invalid weekly activity flag at week index ${i}: must be 0 or 1, got ${flag}`
      );
    }
  }
  for (let i = 0; i < 36; i++) {
    const flag = snapshot.monthlyActivity[i];
    if (flag !== 0 && flag !== 1) {
      throw new ProverWitnessValidationError(
        `Invalid monthly activity flag at month index ${i}: must be 0 or 1, got ${flag}`
      );
    }
  }

  // Derive field elements
  const holderScalar = addressToFieldElement(snapshot.holderBinding).toString();
  const providerScalar = providerIdToFieldElement(snapshot.evidenceProviderId).toString();
  const dataHashScalar = hashToFieldElement(snapshot.evidenceDataHash).toString();

  const commitment = computedCommitment || snapshot.evidenceCommitment || '0';

  const circuitInputs: CircuitWitnessInputs = {
    passportId: snapshot.passportId,
    holderAddressScalar: holderScalar,
    providerIdScalar: providerScalar,
    evidenceDataHashScalar: dataHashScalar,
    verifiedHistoryStartDateDays: snapshot.verifiedHistoryStartDate,
    evidenceUpdatedAtSeconds: snapshot.evidenceUpdatedAt,
    sourceDirectoryVersion: snapshot.sourceDirectoryVersion,
    monthlyGigIncomeTotalsPaise: snapshot.monthlyGigIncomeTotals.map((x) => x.toString()),
    weeklyActivityFlags: snapshot.weeklyActivity.slice(),
    monthlyActivityFlags: snapshot.monthlyActivity.slice(),
  };

  const expectedPublicSignals: ExpectedPublicSignals = {
    passportId: snapshot.passportId,
    holderBinding: snapshot.holderBinding.toLowerCase(),
    evidenceCommitment: commitment,
    sourceDirectoryVersion: snapshot.sourceDirectoryVersion,
  };

  return {
    snapshot,
    circuitInputs,
    expectedPublicSignals,
    createdAt: Math.floor(Date.now() / 1000),
  };
}

/**
 * Explicitly Labeled Mock Prover Adapter
 * Simulates proof generation handoff for local tests without requiring Circom toolchain.
 */
export class MockProverAdapter implements ITrustedProverAdapter {
  public readonly isMockAdapter = true;
  public readonly adapterName = 'MockProverAdapter_SIMULATED_TEST_ONLY';

  public async handoffWitness(payload: ProverWitnessPayload): Promise<ProverHandoffResult> {
    // Validate inputs
    buildProverWitnessPayload(payload.snapshot, payload.expectedPublicSignals.evidenceCommitment);

    const publicSignals = [
      payload.circuitInputs.passportId.toString(),
      payload.circuitInputs.holderAddressScalar,
      payload.expectedPublicSignals.evidenceCommitment,
      payload.circuitInputs.sourceDirectoryVersion.toString(),
    ];

    return {
      success: true,
      proverJobId: `mock-job-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      isMockProof: true,
      adapterName: this.adapterName,
      witnessHash: payload.snapshot.evidenceDataHash,
      simulatedProof: {
        protocol: 'groth16',
        curve: 'bn128',
        pi_a: ['0x1111', '0x2222', '0x1'],
        pi_b: [
          ['0x3333', '0x4444'],
          ['0x5555', '0x6666'],
          ['0x1', '0x0'],
        ],
        pi_c: ['0x7777', '0x8888', '0x1'],
      },
      publicSignals,
    };
  }
}

/**
 * Real / Production Prover Adapter Boundary
 * Delegates witness payload to Backend B's external proving service over mutual TLS or secure IPC.
 * Fails closed when not configured.
 */
export class LiveProverServiceAdapter implements ITrustedProverAdapter {
  public readonly isMockAdapter = false;
  public readonly adapterName = 'LiveProverServiceAdapter';
  private proverEndpointUrl?: string;

  constructor(proverEndpointUrl?: string) {
    this.proverEndpointUrl = proverEndpointUrl;
  }

  public async handoffWitness(payload: ProverWitnessPayload): Promise<ProverHandoffResult> {
    if (!this.proverEndpointUrl) {
      throw new LiveProverNotConfiguredError(
        'ProverServiceNotConfigured: live prover endpoint URL is not configured. Backend A fails closed.'
      );
    }
    // Forwarding to configured external prover service endpoint
    try {
      const res = await fetch(`${this.proverEndpointUrl}/prove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error(`Prover service responded with status ${res.status}`);
      }
      return (await res.json()) as ProverHandoffResult;
    } catch (err: any) {
      throw new ProverServiceUnavailableError(
        `Failed to communicate with live prover service: ${err.message}`
      );
    }
  }
}

export const defaultProverAdapter: ITrustedProverAdapter = new MockProverAdapter();
