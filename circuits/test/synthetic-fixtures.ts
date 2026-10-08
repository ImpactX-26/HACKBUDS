import { FIELD, type HashInput } from '../src/provisional-poseidon.js';

// Public, synthetic HASH-ONLY test data. Not worker evidence or a FIP-normalization vector.
// Provider/data-hash are fixed field literals; no unapproved digest mapping is used.
export function baseline(): HashInput {
  const monthlyGigIncomeTotals = Array<bigint>(36).fill(0n);
  monthlyGigIncomeTotals[29] = 2800000n; monthlyGigIncomeTotals[35] = 2300000n;
  const weeklyActivity = Array<bigint>(156).fill(0n);
  weeklyActivity[0] = 1n; weeklyActivity[77] = 1n; weeklyActivity[155] = 1n;
  const monthlyActivity = Array<bigint>(36).fill(0n);
  monthlyActivity[29] = 1n; monthlyActivity[35] = 1n;
  return {passportId: 101n, holderBinding: 101n, evidenceProviderId: 202n,
    evidenceDataHash: 123456789n, verifiedHistoryStartDate: 19723n,
    evidenceUpdatedAt: 1791417600n, sourceDirectoryVersion: 3n,
    monthlyGigIncomeTotals, weeklyActivity, monthlyActivity};
}
export function fixtures(): Record<string, HashInput> {
  const all: Record<string, HashInput> = {baseline: baseline()};
  for (const name of ['passportId','holderBinding','evidenceProviderId','evidenceDataHash',
    'verifiedHistoryStartDate','evidenceUpdatedAt','sourceDirectoryVersion'] as const) {
    const fixture = baseline(); fixture[name] = BigInt(fixture[name]) + 1n;
    all[`changed-${name}`] = fixture;
  }
  const income = baseline(); income.monthlyGigIncomeTotals[35] = 2300001n;
  all['changed-income'] = income;
  const weekly = baseline(); weekly.weeklyActivity[155] = 0n;
  all['changed-weekly'] = weekly;
  const monthly = baseline(); monthly.monthlyActivity[35] = 0n;
  all['changed-monthly'] = monthly;
  const reversed = baseline(); reversed.monthlyGigIncomeTotals.reverse();
  all['reversed-income'] = reversed;
  const zeros = baseline(); zeros.monthlyGigIncomeTotals.fill(0n);
  zeros.weeklyActivity.fill(0n); zeros.monthlyActivity.fill(0n);
  all['zero-arrays'] = zeros;
  const dense = baseline();
  dense.monthlyGigIncomeTotals = Array.from({length: 36}, (_, i) => BigInt(i+1)*100003n);
  dense.weeklyActivity = Array.from({length: 156}, (_, i) => BigInt(i%2));
  dense.monthlyActivity = Array.from({length: 36}, (_, i) => BigInt(i%3 === 0));
  all.dense = dense;
  const boundary = baseline(); boundary.evidenceDataHash = FIELD-1n;
  boundary.monthlyGigIncomeTotals[0] = (1n<<64n)-1n;
  all['field-and-u64-boundary'] = boundary;
  return all;
}
