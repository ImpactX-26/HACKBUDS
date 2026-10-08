import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { addressToFieldElement, hashToFieldElement, providerIdToFieldElement } from '../../shared/proposal/field-mappings.js';
import { FIELD, SCALARS, field, validate, type HashInput } from '../src/provisional-poseidon.js';
import { root } from './runtime.js';

export const SOURCE_COMMIT = '8c5042bd37d6a74bb3c765f58eb6ac855caa1b6f';
export const AMOUNT_LIMIT = 1n << 64n; // PROVISIONAL test bound, not protocol approval.
export const upstreamFixture = JSON.parse(readFileSync(resolve(root,
  'review-inputs/backend-a/typed-snapshot-fixture.json'),'utf8'));

export function checkedFixture(raw = upstreamFixture): HashInput {
  assert.equal(raw.modulus, FIELD.toString());
  assert.equal(addressToFieldElement(raw.holderWalletAddress).toString(), raw.holderBindingDecimal);
  assert.equal(providerIdToFieldElement(raw.evidenceProviderCanonicalId).toString(), raw.evidenceProviderFieldDecimal);
  assert.equal(hashToFieldElement(raw.evidenceDataHashHex).toString(), raw.evidenceDataHashFieldDecimal);
  const input: HashInput = {
    passportId: raw.passportId, holderBinding: raw.holderBindingDecimal,
    evidenceProviderId: raw.evidenceProviderFieldDecimal, evidenceDataHash: raw.evidenceDataHashFieldDecimal,
    verifiedHistoryStartDate: raw.verifiedHistoryStartDateDays, evidenceUpdatedAt: raw.evidenceUpdatedAtSeconds,
    sourceDirectoryVersion: raw.sourceDirectoryVersion,
    monthlyGigIncomeTotals: [...raw.monthlyGigIncomeTotalsPaise], weeklyActivity: [...raw.weeklyActivityFlags],
    monthlyActivity: [...raw.monthlyActivityFlags]
  };
  validate(input);
  for (const [i,key] of SCALARS.entries()) assert.equal(raw.proposedMetadataSlots[`M${i}_${key}`], input[key]);
  for (const amount of input.monthlyGigIncomeTotals) {
    if (field(amount) >= AMOUNT_LIMIT) throw new Error('Amount exceeds provisional uint64 paise bound');
  }
  return input;
}

export function fixtureVariants(): Record<string,HashInput> {
  const all: Record<string,HashInput> = {backendA: checkedFixture()};
  for (const key of SCALARS) {
    const input = checkedFixture(); input[key] = field(input[key])+1n; all[`changed-${key}`] = input;
  }
  for (const key of ['monthlyGigIncomeTotals','weeklyActivity','monthlyActivity'] as const) {
    const input = checkedFixture();
    input[key][input[key].length-1] = key === 'monthlyGigIncomeTotals' ? field(input[key].at(-1))+1n : 0n;
    all[`changed-${key}`] = input;
    const reversed = checkedFixture(); reversed[key].reverse(); all[`reversed-${key}`] = reversed;
  }
  return all;
}
