// Backend B shared PROPOSAL adapter. These test parameters are NOT a shared wire freeze.
export const PROFILE = 'gv-poseidon-hash-only-0.1.0';
export const FIELD = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
export const TAGS = Object.freeze({
  income: Object.freeze([1100n, 1101n, 1102n]),
  weekly: Object.freeze([1200n, 1201n, 1202n, 1203n]),
  monthly: Object.freeze([1300n, 1301n, 1302n]),
  metadata: Object.freeze([1400n, 1499n])
});
export type Scalar = bigint | string;
export interface HashInput {
  passportId: Scalar;
  holderBinding: Scalar;
  evidenceProviderId: Scalar;
  evidenceDataHash: Scalar;
  verifiedHistoryStartDate: Scalar;
  evidenceUpdatedAt: Scalar;
  sourceDirectoryVersion: Scalar;
  monthlyGigIncomeTotals: Scalar[];
  weeklyActivity: Scalar[];
  monthlyActivity: Scalar[];
}
export const SCALARS = ['passportId', 'holderBinding', 'evidenceProviderId', 'evidenceDataHash',
  'verifiedHistoryStartDate', 'evidenceUpdatedAt', 'sourceDirectoryVersion'] as const;

// Never silently reduce scalars, accept floats/unsafe JSON numbers, or coerce hex.
export function field(value: unknown): bigint {
  if (typeof value !== 'bigint' && (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value))) {
    throw new Error('Expected bigint or canonical unsigned decimal string');
  }
  const parsed = BigInt(value);
  if (parsed < 0n || parsed >= FIELD) throw new Error('Scalar outside BN254 field');
  return parsed;
}

export function validate(input: HashInput): void {
  const keys = [...SCALARS, 'monthlyGigIncomeTotals', 'weeklyActivity', 'monthlyActivity'];
  if (Object.keys(input).length !== keys.length || keys.some(key => !Object.hasOwn(input, key))) {
    throw new Error('Hash-only input fields do not match profile (commitment is output-only)');
  }
  for (const name of SCALARS) field(input[name]);
  for (const [name, length, binary] of [
    ['monthlyGigIncomeTotals', 36, false], ['weeklyActivity', 156, true], ['monthlyActivity', 36, true]
  ] as const) {
    const values = input[name];
    if (!Array.isArray(values) || values.length !== length) throw new Error(`Invalid ${name} length`);
    // Index access deliberately rejects holes instead of skipping them with forEach/map.
    for (let i = 0; i < length; i++) {
      const value = field(values[i]);
      if (binary && value !== 0n && value !== 1n) throw new Error(`Nonbinary ${name}`);
    }
  }
}

export async function createProvisionalPoseidon(customBuildPoseidon?: any) {
  let poseidon: any;
  if (customBuildPoseidon) {
    poseidon = await customBuildPoseidon();
  } else {
    let bp: any;
    try {
      // @ts-ignore
      const mod = await import('circomlibjs');
      bp = mod.buildPoseidon;
    } catch {
      // @ts-ignore
      const mod = await import('../../backend/node_modules/circomlibjs/main.js');
      bp = mod.buildPoseidon;
    }
    poseidon = await bp();
  }
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
    return {incomeRoot, weeklyRoot, monthlyRoot,
      evidenceCommitment: tree4(metadataSlots, TAGS.metadata), metadataSlots};
  };
  return {h5, tree4, commit};
}
