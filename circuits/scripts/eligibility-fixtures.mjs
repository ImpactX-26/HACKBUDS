import {baseline} from '../dist/circuits/test/synthetic-fixtures.js';
import {encoded} from '../dist/circuits/test/runtime.js';
import {epochDay,calendarWitness} from './calendar-v02.mjs';
export {epochDay,calendarWitness} from './calendar-v02.mjs';
export function snapshot(overrides={}) {
  const s=baseline();s.passportId=1n;s.holderBinding=101n;
  s.monthlyGigIncomeTotals.fill(2000000n);s.monthlyActivity.fill(1n);s.weeklyActivity.fill(1n);
  s.verifiedHistoryStartDate=epochDay('2024-01-01');
  return {...s,...overrides};
}
export function witness(s,hashes,context) {
  return {...encoded(s,hashes.commit(s).evidenceCommitment),...context,
    ...calendarWitness(s.evidenceUpdatedAt,context.minHistoryMonths)};
}
