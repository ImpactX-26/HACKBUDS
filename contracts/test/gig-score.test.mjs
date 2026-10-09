import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calculateGigScore as score} from '../integration/gig-score.mjs';
const base={tenureMonths:18,weeksPaid:45,missedWeeks:7,averageMonthlyIncomePaise:'2400000'};
test('user example uses the three-factor fallback and rounds to 81',()=>{
  const s=score(base);assert.equal(s.score,81);assert.equal(s.mode,'three-factor');
  assert.ok(Math.abs(s.unroundedScore-81.03846153846153)<1e-10);assert.equal(s.components.activity,undefined);
});
test('actual recent activity selects the four-factor formula',()=>{
  const s=score({...base,paidWeeksLast12Weeks:6});assert.equal(s.score,75);
  assert.equal(s.mode,'four-factor');assert.equal(s.components.activity,50);
});
test('known zero recent activity is different from unavailable activity',()=>{
  assert.equal(score({...base,paidWeeksLast12Weeks:0}).score,65);assert.equal(score(base).score,81);
});
test('zero history and zero paid weeks give finite zero components',()=>{
  const s=score({tenureMonths:0,weeksPaid:0,missedWeeks:0,averageMonthlyIncomePaise:'0'});
  assert.equal(s.score,0);assert.equal(s.components.consistency,0);
});
test('tenure and income saturate at 24 months and 3000000 paise',()=>{
  assert.equal(score({...base,tenureMonths:100,weeksPaid:52,missedWeeks:0,averageMonthlyIncomePaise:'9000000',paidWeeksLast12Weeks:12}).score,100);
});
test('income uses paise rather than rupees',()=>{
  assert.equal(score({...base,averageMonthlyIncomePaise:'1500000'}).components.income,50);
});
test('malformed and unsafe metrics are rejected',()=>{
  for(const value of [-1,NaN,Infinity,1.5,'12'])assert.throws(()=>score({...base,tenureMonths:value}),/Invalid/);
  assert.throws(()=>score({...base,weeksPaid:Number.MAX_SAFE_INTEGER}),/Invalid totalWeeks/);
});
test('recent activity cannot exceed twelve or accept unknown as zero',()=>{
  for(const value of [13,-1,null,1.5])assert.throws(()=>score({...base,paidWeeksLast12Weeks:value}),/Invalid/);
});
test('paise encoding rejects coercion and excessive monetary values',()=>{
  for(const value of [2400000,'-1','1.5','01','1e6','9007199254740992'])assert.throws(()=>score({...base,averageMonthlyIncomePaise:value}),/Income/);
});
test('helper returns no categories or eligibility decision',()=>{
  const s=score(base);assert.equal(s.category,undefined);assert.equal(s.eligible,undefined);
});
