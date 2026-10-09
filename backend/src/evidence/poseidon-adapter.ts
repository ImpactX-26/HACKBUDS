/**
 * GigVault - Backend A Provisional Poseidon Adapter (Test-Only Interop)
 * 
 * Implements the shared Gate 1 Poseidon(5) adapter in a controlled test-only path,
 * reproducing Backend B's 4-way tree and root/commitment calculations.
 */

import { buildPoseidon } from 'circomlibjs';
import {
  PROFILE,
  FIELD,
  TAGS,
  SCALARS,
  type Scalar,
  type HashInput,
  field,
  validate,
} from '../../../shared/proposal/poseidon5.js';

export { PROFILE, FIELD, TAGS, SCALARS, type Scalar, type HashInput, field, validate };

export async function createBackendAPoseidon() {
  const poseidon = await buildPoseidon();
  const h5 = (values: readonly Scalar[]): bigint => {
    if (values.length !== 5) throw new Error('H5 requires tag and four children');
    return BigInt(poseidon.F.toObject(poseidon(Array.from(values, field))));
  };
  const tree4 = (values: readonly Scalar[], tags: readonly Scalar[]): bigint => {
    if (values.length === 0) throw new Error('Empty tree');
    let layer = Array.from(values, field);
    for (const [level, tag] of tags.entries()) {
      const next: bigint[] = [];
      for (let i = 0; i < layer.length; i += 4) {
        next.push(h5([tag, layer[i]!, layer[i+1] ?? 0n, layer[i+2] ?? 0n, layer[i+3] ?? 0n]));
      }
      layer = next;
      if (layer.length === 1 && level !== tags.length - 1) throw new Error('Excess tree levels');
    }
    if (layer.length !== 1 || tags.length === 0) throw new Error('Wrong tree depth');
    return layer[0]!;
  };
  const commit = (input: HashInput) => {
    validate(input);
    const incomeRoot = tree4(input.monthlyGigIncomeTotals, TAGS.income);
    const weeklyRoot = tree4(input.weeklyActivity, TAGS.weekly);
    const monthlyRoot = tree4(input.monthlyActivity, TAGS.monthly);
    const metadataSlots = [...SCALARS.map(name => field(input[name])), incomeRoot, weeklyRoot, monthlyRoot];
    return {
      incomeRoot,
      weeklyRoot,
      monthlyRoot,
      evidenceCommitment: tree4(metadataSlots, TAGS.metadata),
      metadataSlots,
    };
  };
  return { h5, tree4, commit };
}
