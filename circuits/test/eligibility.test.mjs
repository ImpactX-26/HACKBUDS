import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {calculator} from '../dist/circuits/test/runtime.js';
import {createProvisionalPoseidon} from '../dist/circuits/src/provisional-poseidon.js';
import {snapshot,witness,calendarWitness,epochDay} from '../scripts/eligibility-fixtures.mjs';
import {manifest,context} from '../../contracts/proposal/authorization-v02.mjs';
import {buildPoseidon} from 'circomlibjs';
const poseidon=await buildPoseidon();
const history=await calculator('history'),combined=await calculator('eligibility-v02'),hashes=await createProvisionalPoseidon();
const ctx={evidenceVersion:'1',verifierId:'202',chainId:'1337',consumer:'303',requestHi:'1',requestLo:'2',policyHi:'3',policyLo:'4',
  domainHi:'5',domainLo:'6',expiresAt:'1791504000',maxEvidenceAgeDays:'30',incomeEnabled:'1',incomeWindowMonths:'6',
  minAverageIncomePaise:'2000000',activityEnabled:'1',activityIsWeekly:'0',activityWindow:'12',minActivePeriods:'9',historyEnabled:'1',minHistoryMonths:'12'};
const historyInput=(cutoff,start,n=12,enabled=1)=>({evidenceUpdatedAt:String(epochDay(cutoff)*86400n+86399n),
  verifiedHistoryStartDate:String(epochDay(start)),historyEnabled:String(enabled),minHistoryMonths:String(n),
  ...calendarWitness(epochDay(cutoff)*86400n,n)});
test('calendar anniversary exact edge and next-day FAIL',async()=>{
  for(const [cutoff,start,b] of [['2026-10-09','2025-10-09',1n],['2026-10-09','2025-10-10',0n],
    ['2024-02-29','2023-02-28',1n],['2024-02-29','2023-03-01',0n],['2025-03-31','2025-02-28',1n]]) {
    const n=cutoff==='2025-03-31'?1:12;
    assert.equal((await history.calculateWitness(historyInput(cutoff,start,n),true))[1],b);
  }
});
test('Gregorian century exceptions, bounded domain and in-day cutoff semantics',async()=>{
  for(const date of ['2000-02-29','2100-03-01','2400-02-29','9999-12-31']) {
    const input=historyInput(date,date,0,0);assert.equal((await history.calculateWitness(input,true))[1],1n);
  }
  const invalid=historyInput('2100-03-01','2000-01-01');invalid.cutoffMonth='2';invalid.cutoffDay='29';
  await assert.rejects(()=>history.calculateWitness(invalid,true));
});
test('no-history zero fails enabled and passes disabled; future history rejected',async()=>{
  let i=historyInput('2026-10-09','2024-01-01');i.verifiedHistoryStartDate='0';
  assert.equal((await history.calculateWitness(i,true))[1],0n);
  i={...i,historyEnabled:'0',minHistoryMonths:'0',...calendarWitness(i.evidenceUpdatedAt,0)};
  assert.equal((await history.calculateWitness(i,true))[1],1n);
  await assert.rejects(()=>history.calculateWitness(historyInput('2026-10-09','2026-10-10'),true));
});
test('history bounds, selectors, date witnesses and target month cannot be forged',async()=>{
  const i=historyInput('2026-10-09','2024-01-01');
  for(const changes of [{historyEnabled:'2'},{minHistoryMonths:'0'},{minHistoryMonths:'361'},
    {verifiedHistoryStartDate:String(1n<<22n)},{evidenceUpdatedAt:String(1n<<40n)},
    {cutoffYear:'2025'},{cutoffMonth:'13'},{targetMonth:'9'},{targetDay:'10'}]) {
    await assert.rejects(()=>history.calculateWitness({...i,...changes},true));
  }
});
test('combined private income/history/activity supply constrained honest bits',async()=>{
  for(const [changes,bits] of [[{},[1n,1n,1n]],[{verifiedHistoryStartDate:0n},[1n,0n,1n]],
    [{monthlyGigIncomeTotals:Array(36).fill(0n)},[0n,1n,1n]],
    [{monthlyActivity:Array(36).fill(0n)},[1n,1n,0n]]]) {
    const s=snapshot(changes),i=witness(s,hashes,ctx),w=await combined.calculateWitness(i,true);
    assert.deepEqual(w.slice(1,4),bits);
    // Independently compute context digest with the pinned Poseidon library.
    assert.equal(w[4],BigInt(poseidon.F.toObject(poseidon(context.map(k=>BigInt(i[k]))))));
  }
});
test('combined commitment rejects altered private history, amount and flag',async()=>{
  const i=witness(snapshot(),hashes,ctx);
  for(const changes of [{verifiedHistoryStartDate:String(epochDay('2025-01-01'))},
    {monthlyGigIncomeTotals:Array(36).fill('1')},{monthlyActivity:Array(36).fill('0')}]) {
    await assert.rejects(()=>combined.calculateWitness({...i,...changes},true));
  }
});
test('manifest includes no raw amounts, dates, flags, branch roots or exact counts',()=>{
  const syms=readFileSync('build/eligibility-v02.sym','utf8').split('\n');
  const actual=syms.filter(l=>{const n=Number(l.split(',')[1]);return n>=1&&n<=29;})
    .sort((a,b)=>Number(a.split(',')[1])-Number(b.split(',')[1])).map(l=>l.split(',')[3].trim().replace('main.',''));
  assert.deepEqual(actual,manifest);
});
test('context addresses/IDs and full hash limbs are range constrained',async()=>{
  const i=witness(snapshot(),hashes,ctx);
  for(const changes of [{holderBinding:String(1n<<160n)},{requestHi:String(1n<<128n)},
    {policyLo:String(1n<<128n)},{chainId:String(1n<<64n)},{expiresAt:String(1n<<40n)}]) {
    await assert.rejects(()=>combined.calculateWitness({...i,...changes},true));
  }
});
test('combined witness enforces fixed array dimensions and financial/binary bounds',async()=>{
  const i=witness(snapshot(),hashes,ctx);
  for(const changes of [{monthlyGigIncomeTotals:Array(35).fill('0')},
    {weeklyActivity:Array(155).fill('0')},{monthlyActivity:Array(37).fill('0')},
    {monthlyGigIncomeTotals:Array(36).fill(String(1n<<64n))},
    {monthlyActivity:Array(36).fill('2')},{weeklyActivity:Array(156).fill('2')}]) {
    await assert.rejects(()=>combined.calculateWitness({...i,...changes},true));
  }
});
