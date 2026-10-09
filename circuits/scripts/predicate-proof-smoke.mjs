import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {spawnSync} from 'node:child_process';
import {root} from './toolchain.mjs';
import {calculator} from '../dist/circuits/test/runtime.js';

// Real local Groth16 over the standalone income/activity constraints only.
// Disposable single-party setup, synthetic witnesses, no usable deployment keys.
// This deliberately makes no snapshot/request/consumer authorization claim.
const scratchRoot=resolve(root,'.scratch');mkdirSync(scratchRoot,{recursive:true});
const scratch=mkdtempSync(resolve(scratchRoot,'predicate-proof-'));
const path=name=>resolve(scratch,name);
const cli=resolve(root,'node_modules/snarkjs/build/cli.cjs');
function run(label,args,status=0) {
  console.log(label);
  const r=spawnSync(process.execPath,[cli,...args],{cwd:root,encoding:'utf8',timeout:180000,maxBuffer:2*1024*1024});
  if(r.error) throw r.error;
  assert.equal(r.status,status,`${label}: ${r.stdout}\n${r.stderr}`);return r.stdout;
}
try {
  run('Create disposable local phase 1 (power 13)',['powersoftau','new','bn128','13',path('initial.ptau')]);
  run('Local random phase-1 contribution',['powersoftau','contribute',path('initial.ptau'),path('contributed.ptau'),
    '--name=LOCAL_TEST_ONLY',`-e=${randomBytes(64).toString('hex')}`]);
  run('Prepare phase 2',['powersoftau','prepare','phase2',path('contributed.ptau'),path('prepared.ptau')]);
  run('Setup standalone income/activity circuit',['groth16','setup',resolve(root,'build/income-activity.r1cs'),path('prepared.ptau'),path('initial.zkey')]);
  run('Local random phase-2 contribution',['zkey','contribute',path('initial.zkey'),path('final.zkey'),
    '--name=LOCAL_TEST_ONLY',`-e=${randomBytes(64).toString('hex')}`]);
  run('Export disposable verification key',['zkey','export','verificationkey',path('final.zkey'),path('vk.json')]);
  const wasm=await calculator('income-activity');
  for(const fails of [false,true]) {
    const input={monthlyGigIncomeTotals:Array(36).fill('2000000'),monthlyActivity:Array(36).fill('1'),weeklyActivity:Array(156).fill('1'),
      incomeEnabled:'1',incomeWindowMonths:'6',minAverageIncomePaise:'2000000',activityEnabled:'1',activityIsWeekly:'0',activityWindow:'12',minActivePeriods:'9'};
    if(fails) input.monthlyGigIncomeTotals[35]='1999999';
    writeFileSync(path('synthetic.wtns'),await wasm.calculateWTNSBin(input,true));
    run(`Prove real ${fails?'FAIL':'PASS'} witness`,['groth16','prove',path('final.zkey'),path('synthetic.wtns'),path('proof.json'),path('public.json')]);
    const signals=JSON.parse(readFileSync(path('public.json'),'utf8'));
    assert.deepEqual(signals,[fails?'0':'1','1','1','6','2000000','1','0','12','9']);
    assert.match(run('Verify constrained predicate proof',['groth16','verify',path('vk.json'),path('public.json'),path('proof.json')]),/OK!/);
    const flipped=[...signals];flipped[0]=fails?'1':'0';writeFileSync(path('public.json'),JSON.stringify(flipped));
    assert.match(run('Reject forged result bit',['groth16','verify',path('vk.json'),path('public.json'),path('proof.json')],1),/Invalid proof/);
    const changed=[...signals];changed[4]='1';writeFileSync(path('public.json'),JSON.stringify(changed));
    assert.match(run('Reject same proof with changed public income threshold',['groth16','verify',path('vk.json'),path('public.json'),path('proof.json')],1),/Invalid proof/);
  }
  console.log('Real standalone income/activity Groth16 PASS and FAIL proofs verified; forged bits and changed thresholds rejected.');
} finally {
  assert.ok(scratch.startsWith(scratchRoot+sep));rmSync(scratch,{recursive:true,force:true});
}
