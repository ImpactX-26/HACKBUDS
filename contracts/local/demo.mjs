import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,existsSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {id} from 'ethers';
import {deployLocal} from './deploy.mjs';
import {root} from './compile.mjs';
import {createProofEngine} from '../../circuits/service/engine.mjs';
import {createTrustedProver,localChainReader,protocolVersion,eligibilityProfile} from '../../circuits/service/trusted-prover.mjs';
import {createProvisionalPoseidon} from '../../circuits/dist/circuits/src/provisional-poseidon.js';
import {snapshot} from '../../circuits/scripts/eligibility-fixtures.mjs';
import {policyTypes,approvalTypes,approvalFor,domainFor} from '../proposal/authorization-v02.mjs';

const started=performance.now();const local=await deployLocal();
const {provider,signers,addresses,signing,passport,math,token,consumers,setup}=local;
const [admin,attester,worker,replacement,,other]=signers;
const {welfare,loan}=consumers;
const checks=[];const metrics=[];
const check=(condition,label)=>{assert.ok(condition,label);checks.push(label);console.log('PASS '+label);};
let evidenceReads=0;
const evidenceStore=new Map(); // Fixed synthetic fixture only; never actual FIP evidence.
try {
  const hashes=await createProvisionalPoseidon();
  const engine=createProofEngine(setup);
  const prover=createTrustedProver({setupId:setup.id,hashes,readState:localChainReader({provider,passport,consumers,chainId:1337,mathVerifier:await math.getAddress()}),
    reconstruct:async handle=>{evidenceReads++;if(!evidenceStore.has(handle))throw Error('Unknown evidence handle');return evidenceStore.get(handle);},
    prove:async input=>{const time=performance.now();const result=await engine(input);metrics.push({seconds:(performance.now()-time)/1000,
      parentRssBytes:process.memoryUsage().rss,...result.metrics});return result;}});
  const sent=async(p,action)=>{const tx=await p;const receipt=await tx.wait();check(receipt.status===1,action);
    local.transactions.push({action,hash:receipt.hash,gasUsed:receipt.gasUsed.toString(),status:receipt.status});};
  const rejectedTx=async(fn,label)=>{
    await assert.rejects(async()=>{const tx=await fn();try {await tx.wait();}catch(error){
      assert.equal(error.receipt?.status,0);local.transactions.push({action:label,hash:error.receipt.hash,status:0});throw error;
    }});check(true,label);
  };
  const now=BigInt((await provider.getBlock('latest')).timestamp),identity=id('B4_LOCAL_SYNTHETIC_WORKER');
  let s=snapshot({passportId:1n,holderBinding:BigInt(addresses[2]),evidenceUpdatedAt:now-100n});
  const evidence=s=>({commitment:hashes.commit(s).evidenceCommitment,updatedAt:s.evidenceUpdatedAt,schemaVersion:1,
    providerRef:id('LOCAL_SYNTHETIC_PROVIDER'),sourceDirectoryVersion:s.sourceDirectoryVersion});
  await sent(passport.connect(attester).mint(1,addresses[2],identity,evidence(s)),'mint synthetic passport');
  check(await passport.hasRole(await passport.ADMIN_ROLE(),addresses[0]),'admin role configured');
  check(await passport.hasRole(await passport.ATTESTER_ROLE(),addresses[1]),'independent attester role configured');
  check(await loan.asset()===await token.getAddress(),'loan asset is deployed MockUSDC');
  check(await token.balanceOf(await loan.getAddress())===1000n*10n**6n,'loan liquidity funded');
  let nonce=0;
  async function requestFor(consumerName,current=s,who=worker,changes={}) {
    const n=++nonce,contract=consumers[consumerName];
    const domain=domainFor(1337,await contract.getAddress());const state=await passport.getPassport(current.passportId);
    const base={incomeEnabled:1,incomeWindowMonths:6,minAverageIncomePaise:2000000,activityEnabled:1,activityIsWeekly:0,
      activityWindow:12,minActivePeriods:9,historyEnabled:1,minHistoryMonths:12,maxEvidenceAgeDays:30,expiresAt:now+86400n};
    const policy={...base,...(consumerName==='welfare'?{incomeEnabled:0,incomeWindowMonths:0,minAverageIncomePaise:0,
      activityWindow:6,minActivePeriods:4,minHistoryMonths:6,maxEvidenceAgeDays:90}:{}),...changes,
      requestId:id('B4_LOCAL_REQUEST_'+n),verifierId:addresses[4]};
    const verifierSignature=await signing(addresses[4]).signTypedData(domain,policyTypes,policy);
    const workerSignature=await signing(await who.getAddress()).signTypedData(domain,approvalTypes,approvalFor(policy,current.passportId,state,domain));
    const handle='synthetic-'+n;
    evidenceStore.set(handle,{protocolVersion,eligibilityProfile,commitmentProfile:'gv-poseidon-hash-only-0.1.0',schemaVersion:'1',
      evidenceVersion:state.evidenceVersion.toString(),snapshot:current});
    return {protocolVersion,eligibilityProfile,consumer:consumerName,passportId:current.passportId.toString(),evidenceHandle:handle,
      policy,verifierSignature,workerSignature};
  }
  async function packageFor(request) {
    const result=await prover.prove(request);
    check(await math.verifyProof(result.solidity.a,result.solidity.b,result.solidity.c,result.publicSignals),'actual local Solidity Groth16 verifier accepts proof '+request.evidenceHandle);
    check(!('snapshot'in result)&&!('input'in result)&&!('witness'in result),'prover returns public package only '+request.evidenceHandle);
    return {passportId:request.passportId,policy:request.policy,verifierSignature:request.verifierSignature,
      workerSignature:request.workerSignature,...result.solidity};
  }
  const loanRequest=await requestFor('loan'),welfareRequest=await requestFor('welfare');
  const before=evidenceReads;
  for(const [changes,label]of [[{workerSignature:'0x'},'missing worker approval'],
    [{verifierSignature:'0x'},'forged verifier authorization'],[{protocolVersion:'unknown'},'unsupported protocol'],
    [{policy:{...loanRequest.policy,minAverageIncomePaise:1}},'incorrect consumer policy'],
    [{policy:{...loanRequest.policy,expiresAt:now-1n}},'expired request']]) {
    await assert.rejects(()=>prover.prove({...loanRequest,...changes}));check(evidenceReads===before,label+' rejected before private access');
  }
  const W=await packageFor(welfareRequest),L=await packageFor(loanRequest);
  check((await welfare.verify(W)).every(x=>x===1n),'welfare Verify returns PASS');
  check((await loan.verify(L)).every(x=>x===1n),'loan Verify returns PASS');
  await rejectedTx(()=>loan.connect(other).borrow(L,{gasLimit:1500000}),'unauthorized caller transaction rejected');
  const modified=[...L.signals];modified[0]='0';
  check(!await math.verifyProof(L.a,L.b,L.c,modified),'modified public signal rejected by actual math verifier');
  await rejectedTx(()=>loan.connect(worker).borrow({...L,signals:modified},{gasLimit:1500000}),'modified signal consumer transaction rejected');
  await sent(welfare.connect(worker).claim(W),'eligible welfare claim (event fallback; no POL transfer)');
  await sent(loan.connect(worker).borrow(L),'eligible 100 MockUSDC loan');
  check(await token.balanceOf(addresses[2])===100n*10n**6n,'worker receives exactly 100 MockUSDC');
  await rejectedTx(()=>loan.connect(worker).borrow(L,{gasLimit:1500000}),'duplicate active loan transaction rejected');
  await sent(token.connect(worker).approve(await loan.getAddress(),100n*10n**6n),'approve exact repayment');
  await sent(loan.connect(worker).repay(1),'repay exactly 100 MockUSDC');
  check(await loan.principalByIdentity(identity)===0n,'repayment clears identity debt');
  await rejectedTx(()=>loan.connect(worker).borrow(L,{gasLimit:1500000}),'spent loan request replay transaction rejected after repayment');
  await rejectedTx(()=>welfare.connect(worker).claim(W,{gasLimit:1500000}),'repeat welfare claim transaction rejected');
  const fail={...s,monthlyActivity:Array(36).fill(0n)};
  await sent(passport.connect(attester).refresh(1,evidence(fail)),'refresh to insufficient activity fixture');
  await assert.rejects(()=>prover.prove(loanRequest));check(true,'stale approval rejected by prover');
  await rejectedTx(()=>loan.connect(worker).borrow(L,{gasLimit:1500000}),'stale passport evidence transaction rejected');
  const F=await packageFor(await requestFor('loan',fail));
  check(F.signals[2]==='0','real proof honestly reports activity FAIL');
  await rejectedTx(()=>loan.connect(worker).borrow(F,{gasLimit:1500000}),'insufficient eligibility transaction rejected');
  s={...s,evidenceDataHash:123456790n};
  await sent(passport.connect(attester).refresh(1,evidence(s)),'restore eligible evidence with changed commitment');
  const fresh=await packageFor(await requestFor('loan'));
  await sent(loan.connect(worker).borrow(fresh),'fresh approved request reborrows after repayment');
  await sent(passport.revoke(1,'B4_LOCAL_RECOVERY'),'revoke old passport');
  await sent(passport.authorizeReissue(identity),'authorize identity recovery');
  const recovered={...s,passportId:2n,holderBinding:BigInt(addresses[3]),evidenceDataHash:123456791n};
  await sent(passport.connect(attester).mint(2,addresses[3],identity,evidence(recovered)),'mint replacement passport for same identity');
  check(await loan.principalByIdentity(identity)===100n*10n**6n,'debt survives passport replacement');
  const RL=await packageFor(await requestFor('loan',recovered,replacement));
  const RW=await packageFor(await requestFor('welfare',recovered,replacement));
  await rejectedTx(()=>loan.connect(replacement).borrow(RL,{gasLimit:1500000}),'replacement cannot duplicate active identity loan');
  await rejectedTx(()=>welfare.connect(replacement).claim(RW,{gasLimit:1500000}),'replacement cannot duplicate lifetime identity welfare claim');
  await rejectedTx(()=>passport.connect(attester).mint(3,addresses[2],identity,evidence({...recovered,passportId:3n}),{gasLimit:1500000}),
    'second ACTIVE passport for identity rejected');
  await sent(token.transfer(addresses[3],100n*10n**6n),'fund synthetic replacement for recovery repayment');
  await sent(token.connect(replacement).approve(await loan.getAddress(),100n*10n**6n),'replacement approves exact debt');
  await sent(loan.connect(replacement).repay(2),'replacement repays inherited loan');
  check(await loan.principalByIdentity(identity)===0n,'final identity debt is zero');
  const report={localOnly:true,syntheticOnly:true,productionReady:false,backendAConnected:false,checks:checks.length,passed:checks,
    realProofs:metrics.length,proofMetrics:metrics,elapsedSeconds:(performance.now()-started)/1000,
    deployment:local.manifest,transactions:local.transactions,cleanup:'pending'};
  // Retain public ABIs and transaction receipts only. Report references stay usable after shutdown.
  const abiDirectory=resolve(root,'reports/b4-abis');mkdirSync(abiDirectory,{recursive:true});
  for(const [name,entry]of Object.entries(report.deployment.contracts)) {
    writeFileSync(resolve(abiDirectory,name+'.abi.json'),readFileSync(entry.abi));
    entry.abi='b4-abis/'+name+'.abi.json';
  }
  await local.close();check(!existsSync(setup.directory),'session setup and manifest removed on shutdown');
  report.checks=checks.length;report.passed=checks;report.cleanup='verified: no session directory remains; no private witness files created';
  mkdirSync(resolve(root,'reports'),{recursive:true});
  writeFileSync(resolve(root,'reports/b4-local-demo.json'),JSON.stringify(report,null,2)+'\n');
  console.log(`B4 local deployment + trusted prover + real EVM demonstration: ${checks.length} checks, ${metrics.length} actual proofs.`);
} finally {evidenceStore.clear();await local.close();}
