import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { type HashInput, SCALARS, field, validate } from './poseidon5.js';

// Tests run from circuits/. Only explicit synthetic fixtures are used by these helpers.
export const root = process.cwd();
const require = createRequire(import.meta.url);
export interface WitnessCalculator {
  calculateWitness(input: object, sanityCheck: boolean): Promise<bigint[]>;
  calculateWTNSBin(input: object, sanityCheck: boolean): Promise<Uint8Array>;
}
export async function calculator(name = 'snapshot-hash'): Promise<WitnessCalculator> {
  const build = resolve(root, 'build', `${name}_js`);
  return require(resolve(build, 'witness_calculator.js'))(readFileSync(resolve(build, `${name}.wasm`)));
}
export function encoded(input: HashInput, expected: bigint): Record<string, string | string[]> {
  validate(input); field(expected);
  return {
    ...Object.fromEntries(SCALARS.map(name => [name, field(input[name]).toString()])),
    monthlyGigIncomeTotals: input.monthlyGigIncomeTotals.map(value => field(value).toString()),
    weeklyActivity: input.weeklyActivity.map(value => field(value).toString()),
    monthlyActivity: input.monthlyActivity.map(value => field(value).toString()),
    expectedCommitment: expected.toString()
  };
}
export const outputs = (witness: bigint[]) => ({incomeRoot: witness[1]!, weeklyRoot: witness[2]!,
  monthlyRoot: witness[3]!, evidenceCommitment: witness[4]!});
export const decimal = (value: unknown): string => JSON.stringify(value,
  (_key, item: unknown) => typeof item === 'bigint' ? item.toString() : item);
