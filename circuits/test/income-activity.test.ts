import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {spawnSync} from 'node:child_process';
import {calculator,encoded,root} from './runtime.js';
import {baseline} from './synthetic-fixtures.js';
import {createProvisionalPoseidon,FIELD} from '../src/provisional-poseidon.js';

const raw=await calculator('income-activity');
const combined=await calculator('snapshot-income-activity');
const hashes=await createProvisionalPoseidon();
const LIMIT=1n<<64n;
type Policy={incomeEnabled:string;incomeWindowMonths:string;minAverageIncomePaise:string;
  activityEnabled:string;activityIsWeekly:string;activityWindow:string;minActivePeriods:string};
const loan:Policy={incomeEnabled:'1',incomeWindowMonths:'6',minAverageIncomePaise:'2000000',
  activityEnabled:'1',activityIsWeekly:'0',activityWindow:'12',minActivePeriods:'9'};
function data() {
  const snapshot=baseline();
  snapshot.monthlyGigIncomeTotals.fill(2000000n);
  snapshot.monthlyActivity.fill(1n);snapshot.weeklyActivity.fill(1n);
  return snapshot;
}
function standalone(snapshot=data(),policy=loan) {
  return {...policy,monthlyGigIncomeTotals:snapshot.monthlyGigIncomeTotals.map(String),
    weeklyActivity:snapshot.weeklyActivity.map(String),monthlyActivity:snapshot.monthlyActivity.map(String)};
}
function bound(snapshot=data(),policy=loan) {
  return {...encoded(snapshot,hashes.commit(snapshot).evidenceCommitment),...standalone(snapshot,policy)};
}
// Independent integer oracle. Dividing floor averages would conceal a 1-paise
// deficit; compare the full exact sum against threshold * N instead.
function expected(snapshot=data(),policy=loan) {
  const n=Number(policy.incomeWindowMonths), a=Number(policy.activityWindow);
  const sum=snapshot.monthlyGigIncomeTotals.slice(36-n).reduce<bigint>((x,y)=>x+BigInt(y),0n);
  const flags=policy.activityIsWeekly==='1'?snapshot.weeklyActivity:snapshot.monthlyActivity;
  const count=flags.slice(flags.length-a).reduce<bigint>((x,y)=>x+BigInt(y),0n);
  return [policy.incomeEnabled==='0'||sum>=BigInt(policy.minAverageIncomePaise)*BigInt(n)?1n:0n,
    policy.activityEnabled==='0'||count>=BigInt(policy.minActivePeriods)?1n:0n];
}
async function check(snapshot=data(),policy=loan) {
  const bits=expected(snapshot,policy);
  assert.deepEqual((await raw.calculateWitness(standalone(snapshot,policy),true)).slice(1,3),bits);
  assert.deepEqual((await combined.calculateWitness(bound(snapshot,policy),true)).slice(1,3),bits);
  return bits;
}
test('equality at income/activity thresholds passes with no sums/counts in public signals',async()=>{
  assert.deepEqual(await check(),[1n,1n]);
  const syms=readFileSync(resolve(root,'build/snapshot-income-activity.sym'),'utf8').split('\n');
  // Public prefix: 2 outputs + 8 public parameters; private evidence follows.
  const publicNames=syms.filter(line=>{const index=Number(line.split(',')[1]);return index>=1&&index<=10;})
    .map(line=>line.split(',')[3]);
  assert.equal(publicNames.length,10);
  assert.ok(publicNames.every(name=>!name?.includes('Root')&&!name?.includes('Totals')&&!name?.includes('Count')));
});
test('one paise below exact six-month threshold gives valid income FAIL',async()=>{
  const s=data();s.monthlyGigIncomeTotals[35]=1999999n;
  assert.deepEqual(await check(s),[0n,1n]);
});
test('zero-income months remain in denominator',async()=>{
  const s=data();s.monthlyGigIncomeTotals[35]=0n;
  assert.deepEqual(await check(s),[0n,1n]);
});
test('large older income and activity cannot enter a shorter newest window',async()=>{
  const s=data();s.monthlyGigIncomeTotals.fill(LIMIT-1n);s.monthlyGigIncomeTotals.fill(0n,30);
  s.monthlyActivity.fill(0n,24);
  assert.deepEqual(await check(s),[0n,0n]);
});
test('Imran-style eight active months out of twelve is a valid activity FAIL',async()=>{
  const s=data();s.monthlyActivity.fill(0n);s.monthlyActivity.fill(1n,28);
  assert.deepEqual(await check(s),[1n,0n]);
  s.monthlyActivity[27]=1n;assert.deepEqual(await check(s),[1n,1n]);
});
test('welfare-style income disabled, four of six active months remains independently constrained',async()=>{
  const s=data();s.monthlyGigIncomeTotals.fill(0n);s.monthlyActivity.fill(0n);s.monthlyActivity.fill(1n,32);
  const p={...loan,incomeEnabled:'0',incomeWindowMonths:'0',minAverageIncomePaise:'0',activityWindow:'6',minActivePeriods:'4'};
  assert.deepEqual(await check(s,p),[1n,1n]);s.monthlyActivity[35]=0n;
  assert.deepEqual(await check(s,p),[1n,0n]);
});
test('week/month selection and both maximum windows are exact',async()=>{
  const s=data();s.weeklyActivity.fill(0n);s.weeklyActivity.fill(1n,104);
  const week={...loan,activityIsWeekly:'1',activityWindow:'52',minActivePeriods:'52'};
  assert.deepEqual(await check(s,week),[1n,1n]);s.weeklyActivity[155]=0n;
  assert.deepEqual(await check(s,week),[1n,0n]);
  await check(data(),{...loan,incomeWindowMonths:'36',activityWindow:'36',minActivePeriods:'36'});
  await check(data(),{...loan,activityIsWeekly:'1',activityWindow:'156',minActivePeriods:'156'});
});
test('disabled criteria are nonblocking with canonical zero parameters',async()=>{
  const s=data();s.monthlyGigIncomeTotals.fill(0n);s.monthlyActivity.fill(0n);s.weeklyActivity.fill(0n);
  assert.deepEqual(await check(s,{incomeEnabled:'0',incomeWindowMonths:'0',minAverageIncomePaise:'0',
    activityEnabled:'0',activityIsWeekly:'0',activityWindow:'0',minActivePeriods:'0'}),[1n,1n]);
});
test('36 uint64 maxima compare safely; exact threshold and one-paise-short cases',async()=>{
  const s=data();s.monthlyGigIncomeTotals.fill(LIMIT-1n);
  const p={...loan,incomeWindowMonths:'36',minAverageIncomePaise:(LIMIT-1n).toString()};
  assert.deepEqual(await check(s,p),[1n,1n]);s.monthlyGigIncomeTotals[0]=LIMIT-2n;
  assert.deepEqual(await check(s,p),[0n,1n]);
});
test('altered private amounts or flags cannot satisfy original snapshot commitment',async()=>{
  const input=bound();input.monthlyGigIncomeTotals[35]='4000000';
  await assert.rejects(()=>combined.calculateWitness(input,true),/Assert Failed|constraint/i);
  const flags=bound();flags.monthlyActivity[35]='0';
  await assert.rejects(()=>combined.calculateWitness(flags,true),/Assert Failed|constraint/i);
});
test('income windows 0/37/64, negative aliases and field wraparound are rejected by circuit',async()=>{
  for(const n of ['0','37','64',(FIELD-1n).toString()]) {
    await assert.rejects(()=>raw.calculateWitness({...standalone(),incomeWindowMonths:n},true),/Assert Failed|constraint/i);
  }
  for(const v of [LIMIT,FIELD-1n]) {
    const input=standalone();input.monthlyGigIncomeTotals[0]=v.toString();
    await assert.rejects(()=>raw.calculateWitness(input,true),/Assert Failed|constraint/i);
    await assert.rejects(()=>raw.calculateWitness({...standalone(),minAverageIncomePaise:v.toString()},true),/Assert Failed|constraint/i);
  }
});
test('malformed activity windows/unit/minimum and nonbinary enable/flags are rejected',async()=>{
  for(const change of [
    {activityWindow:'0'},{activityWindow:'37'},{activityWindow:'157',activityIsWeekly:'1'},
    {minActivePeriods:'13'},{minActivePeriods:'256'},{activityIsWeekly:'2'},
    {incomeEnabled:'2'},{activityEnabled:'2'},
    {incomeEnabled:'0'},{activityEnabled:'0'}
  ]) await assert.rejects(()=>raw.calculateWitness({...standalone(),...change},true),/Assert Failed|constraint/i);
  for(const key of ['weeklyActivity','monthlyActivity'] as const) {
    const input=standalone();input[key][0]='2';
    await assert.rejects(()=>raw.calculateWitness(input,true),/Assert Failed|constraint/i);
  }
});
test('real R1CS checks accept valid FAIL and reject forged PASS or FAIL output bits',async()=>{
  const scratchRoot=resolve(root,'.scratch');mkdirSync(scratchRoot,{recursive:true});
  const scratch=mkdtempSync(resolve(scratchRoot,'predicate-witness-'));
  try {
    const s=data();s.monthlyGigIncomeTotals[35]=1999999n;
    for(const [snapshot,index] of [[s,1],[data(),2]] as const) {
      const bytes=Buffer.from(await combined.calculateWTNSBin(bound(snapshot),true));
      const file=resolve(scratch,'synthetic.wtns');writeFileSync(file,bytes);
      const run=()=>spawnSync(process.execPath,[resolve(root,'node_modules/snarkjs/build/cli.cjs'),
        'wtns','check',resolve(root,'build/snapshot-income-activity.r1cs'),file],{encoding:'utf8',timeout:120000});
      assert.equal(run().status,0);
      let offset=12,found=false;
      while(offset<bytes.length) {
        const section=bytes.readUInt32LE(offset),length=Number(bytes.readBigUInt64LE(offset+4));offset+=12;
        if(section===2) {bytes[offset+index*32]=bytes[offset+index*32]!^1;found=true;break;}
        offset+=length;
      }
      assert.ok(found);writeFileSync(file,bytes);
      const forged=run();assert.equal(forged.status,1);assert.match(forged.stdout,/WITNESS IS NOT CORRECT/);
    }
  } finally {
    assert.ok(scratch.startsWith(scratchRoot+sep));rmSync(scratch,{recursive:true,force:true});
  }
});
