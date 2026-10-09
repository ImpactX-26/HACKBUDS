import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync,statSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {root} from './toolchain.mjs';
import {createProvisionalPoseidon} from '../dist/circuits/src/provisional-poseidon.js';
import {snapshot,witness} from './eligibility-fixtures.mjs';
import {context} from '../../contracts/proposal/authorization-v02.mjs';

// Disposable local setup, synthetic witnesses only. Never deploy these keys.
const scratchRoot=resolve(root,'.scratch');mkdirSync(scratchRoot,{recursive:true});
const scratch=mkdtempSync(resolve(scratchRoot,'eligibility-'));
const path=name=>resolve(scratch,name),cli=resolve(root,'node_modules/snarkjs/build/cli.cjs');
const metrics=[];
async function run(label,args,status=0) {
  console.log(label);const start=performance.now();let peak=0;
  const child=spawn(process.execPath,[cli,...args],{cwd:root,windowsHide:true});
  let out='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>out+=b);
  const timer=setInterval(()=>{
    if(process.platform==='win32') try {
      const rss=execFileSync('powershell',['-NoProfile','-Command',`(Get-Process -Id ${child.pid} -ErrorAction Stop).WorkingSet64`],
        {encoding:'utf8',windowsHide:true,timeout:4000,stdio:['ignore','pipe','ignore']});
      peak=Math.max(peak,Number(rss.trim()));
    }catch{}
  },3000);
  try {await new Promise((ok,no)=>{child.on('error',no);child.on('exit',code=>code===status?ok():no(Error(`${label}: ${code}\n${out}`)));});}
  finally {clearInterval(timer);}
  const seconds=(performance.now()-start)/1000;metrics.push({label,seconds,sampledChildWorkingSetBytes:peak||null});
  console.log(`${label}: ${seconds.toFixed(2)}s, child RSS ${peak?(peak/1048576).toFixed(1)+' MiB sampled':'not sampled'}`);return out;
}
try {
  const cachedPtau=process.env.GIGVAULT_TEST_PTAU;
  if(cachedPtau) {
    const expected='6247a3433948b35fbfae414fa5a9355bfb45f56efa7ab4929e669264a0258976741dfbe3288bfb49828e5df02c2e633df38d2245e30162ae7e3bcca5b8b49345';
    assert.equal(createHash('blake2b512').update(readFileSync(cachedPtau)).digest('hex'),expected,'Pinned public power17 transcript hash');
    console.log('Using hash-verified public prepared power17 transcript; local phase2 keys remain disposable.');
  } else {
  await run('Local phase 1 power17',['powersoftau','new','bn128','17',path('initial.ptau')]);
  await run('Local phase1 contribution',['powersoftau','contribute',path('initial.ptau'),path('contributed.ptau'),
    '--name=LOCAL_TEST_ONLY',`-e=${randomBytes(64).toString('hex')}`]);
  await run('Prepare phase2',['powersoftau','prepare','phase2',path('contributed.ptau'),path('prepared.ptau')]);
  }
  await run('Combined eligibility setup',['groth16','setup',resolve(root,'build/eligibility-v02.r1cs'),cachedPtau??path('prepared.ptau'),path('initial.zkey')]);
  await run('Local phase2 contribution',['zkey','contribute',path('initial.zkey'),path('final.zkey'),
    '--name=LOCAL_TEST_ONLY',`-e=${randomBytes(64).toString('hex')}`]);
  await run('Export verification key',['zkey','export','verificationkey',path('final.zkey'),path('vk.json')]);
  await run('Export local math verifier',['zkey','export','solidityverifier',path('final.zkey'),path('Groth16Verifier.sol')]);
  const require=createRequire(import.meta.url);
  const hashes=await createProvisionalPoseidon(),wasm=await require(resolve(root,'build/eligibility-v02_js/witness_calculator.js'))(
    readFileSync(resolve(root,'build/eligibility-v02_js/eligibility-v02.wasm')));
  const ctx={evidenceVersion:'1',verifierId:'202',chainId:'1337',consumer:'303',requestHi:'1',requestLo:'2',
    policyHi:'3',policyLo:'4',domainHi:'5',domainLo:'6',expiresAt:'1791504000',maxEvidenceAgeDays:'30',
    incomeEnabled:'1',incomeWindowMonths:'6',minAverageIncomePaise:'2000000',activityEnabled:'1',activityIsWeekly:'0',
    activityWindow:'12',minActivePeriods:'9',historyEnabled:'1',minHistoryMonths:'12'};
  async function prove(input,label) {
    const t=performance.now();writeFileSync(path('synthetic.wtns'),await wasm.calculateWTNSBin(input,true));
    metrics.push({label:label+' witness',seconds:(performance.now()-t)/1000});
    await run(label+' prove',['groth16','prove',path('final.zkey'),path('synthetic.wtns'),path('proof.json'),path('public.json')]);
    const proof=JSON.parse(readFileSync(path('proof.json'),'utf8')),publicSignals=JSON.parse(readFileSync(path('public.json'),'utf8'));
    assert.match(await run(label+' verify',['groth16','verify',path('vk.json'),path('public.json'),path('proof.json')]),/OK!/);
    return {proof,publicSignals};
  }
  const cases=[['PASS',{},[1n,1n,1n]],['income FAIL',{monthlyGigIncomeTotals:Array(36).fill(0n)},[0n,1n,1n]],
    ['history FAIL',{verifiedHistoryStartDate:0n},[1n,0n,1n]],['activity FAIL',{monthlyActivity:Array(36).fill(0n)},[1n,1n,0n]]];
  for(const [label,changes,bits] of cases) {
    const result=await prove(witness(snapshot(changes),hashes,ctx),label);
    assert.deepEqual(result.publicSignals.slice(0,3).map(BigInt),bits);
    if(label==='PASS') for(const i of [0,1,2,4,5,6,8,9,10,11,12,13,14,15,16,17,18,19,22]) {
      const altered=[...result.publicSignals];altered[i]=String(BigInt(altered[i])+1n);
      writeFileSync(path('public.json'),JSON.stringify(altered));
      assert.match(await run(`Reject altered public signal ${i}`,['groth16','verify',path('vk.json'),path('public.json'),path('proof.json')],1),/Invalid proof/);
    }
  }
  // Run real generated-verifier consumer tests in the SAME disposable ceremony.
  const {integration}=await import('../../contracts/test/eligibility-integration.mjs');
  const consumerResults=await integration({verifierSource:readFileSync(path('Groth16Verifier.sol'),'utf8'),prove,
    hashes,makeWitness:(s,c)=>witness(s,hashes,c),makeSnapshot:snapshot,context});
  mkdirSync(resolve(root,'reports'),{recursive:true});
  writeFileSync(resolve(root,'reports/eligibility-v02-local.json'),JSON.stringify({profile:'PROVISIONAL_LOCAL_ONLY',
    constraints:80274,r1csBytes:statSync(resolve(root,'build/eligibility-v02.r1cs')).size,
    wasmBytes:statSync(resolve(root,'build/eligibility-v02_js/eligibility-v02.wasm')).size,consumerResults,metrics},null,2)+'\n');
  console.log('Combined proofs and consumer integration passed. Disposable artifacts removed.');
} finally {assert.ok(scratch.startsWith(scratchRoot+sep));rmSync(scratch,{recursive:true,force:true});}
