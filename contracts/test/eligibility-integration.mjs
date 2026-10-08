import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import solc from 'solc';
import ganache from 'ganache';
import {BrowserProvider,ContractFactory,Wallet,id,TypedDataEncoder} from 'ethers';
import {policyTypes,approvalTypes,domainFor,approvalFor,publicContext,assertAuthorized} from '../proposal/authorization-v02.mjs';
import {prepareAuthorizedWitness} from '../../circuits/scripts/authorized-witness-v02.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export function compile(verifierSource) {
  const paths=['src/GigPassport.sol',...['EligibilityGateV02','WelfareVaultV02','DemoLendingPoolV02','MockUSDCV02'].map(x=>'src/proposal/'+x+'.sol')];
  const sources=Object.fromEntries(paths.map(x=>[x,{content:readFileSync(resolve(root,x),'utf8')}]));
  sources['Groth16Verifier.sol']={content:verifierSource};
  const output=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources,settings:{
    optimizer:{enabled:true,runs:200},viaIR:true,evmVersion:'shanghai',
    outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}}),{import:path=>{
      const file=[resolve(root,path),resolve(root,'node_modules',path)].find(existsSync);
      return file?{contents:readFileSync(file,'utf8')}:{error:'Missing '+path};
    }}));
  assert.deepEqual((output.errors??[]).filter(x=>x.severity==='error'),[]);
  return output.contracts;
}
export async function integration({verifierSource,prove,hashes,makeWitness,makeSnapshot}) {
  const artifacts=compile(verifierSource);
  const chain=ganache.provider({logging:{quiet:true},wallet:{totalAccounts:6},chain:{hardfork:'shanghai',chainId:1337}});
  const provider=new BrowserProvider(chain,undefined,{cacheTimeout:-1});provider.pollingInterval=10;
  let checks=0;
  const check=(condition,label)=>{assert.ok(condition,label);checks++;console.log('Contract check: '+label);};
  let errorContracts=[];
  const reject=async(fn,label,expected='InvalidAuthorization')=>{
    await assert.rejects(fn,error=>{
      const data=error.data??error.info?.error?.data?.result;
      let name;
      for(const c of errorContracts) try {name=c.interface.parseError(data)?.name;if(name)break;}catch{}
      assert.equal(name,expected,`${label}: actual rejection ${name??error.shortMessage}`);return true;
    });checks++;console.log('Contract rejection: '+label+' ['+expected+']');
  };
  try {
    const signers=await Promise.all([0,1,2,3,4,5].map(i=>provider.getSigner(i)));
    const [admin,attester,worker,replacement,verifier,other]=signers;
    const addresses=await Promise.all(signers.map(x=>x.getAddress()));
    const localAccounts=chain.getInitialAccounts();
    // Ephemeral Ganache keys, generated in memory; never printed or retained.
    const signing=address=>new Wallet(localAccounts[address.toLowerCase()].secretKey);
    const deploy=async(file,name,args=[])=>{const a=artifacts[file][name];const c=await new ContractFactory(a.abi,a.evm.bytecode.object,admin).deploy(...args);await c.waitForDeployment();return c;};
    const sent=async p=>(await p).wait();
    const passport=await deploy('src/GigPassport.sol','GigPassport',[addresses[0],addresses[1]]);
    const math=await deploy('Groth16Verifier.sol','Groth16Verifier');
    const token=await deploy('src/proposal/MockUSDCV02.sol','MockUSDCV02');
    const args=[await passport.getAddress(),await math.getAddress(),addresses[4]];
    const welfare=await deploy('src/proposal/WelfareVaultV02.sol','WelfareVaultV02',args);
    const loan=await deploy('src/proposal/DemoLendingPoolV02.sol','DemoLendingPoolV02',[...args,await token.getAddress()]);
    errorContracts=[loan,welfare,passport,token];
    await sent(token.transfer(await loan.getAddress(),1000n*10n**6n));
    const now=BigInt((await provider.getBlock('latest')).timestamp),identity=id('LOCAL_SYNTHETIC_STABLE_IDENTITY_V02');
    const evidence=s=>({commitment:hashes.commit(s).evidenceCommitment,updatedAt:s.evidenceUpdatedAt,schemaVersion:1,
      providerRef:id('LOCAL_TEST_PROVIDER'),sourceDirectoryVersion:s.sourceDirectoryVersion});
    let s=makeSnapshot({passportId:1n,holderBinding:BigInt(addresses[2]),evidenceUpdatedAt:now-100n});
    await sent(passport.connect(attester).mint(1,addresses[2],identity,evidence(s)));
    let nonce=0;
    const base={incomeEnabled:1,incomeWindowMonths:6,minAverageIncomePaise:2000000,activityEnabled:1,
      activityIsWeekly:0,activityWindow:12,minActivePeriods:9,historyEnabled:1,minHistoryMonths:12,maxEvidenceAgeDays:30,expiresAt:now+86400n};
    async function packageFor(consumer,snapshot,changes={},who=worker) {
      const passportId=snapshot.passportId,state=await passport.getPassport(passportId),domain=domainFor(1337,await consumer.getAddress());
      const policy={...base,...(consumer===welfare?{incomeEnabled:0,incomeWindowMonths:0,minAverageIncomePaise:0,
        activityWindow:6,minActivePeriods:4,minHistoryMonths:6,maxEvidenceAgeDays:90}:{}),...changes,
        requestId:id('LOCAL_REQUEST_'+(++nonce)),verifierId:addresses[4]};
      const verifierSignature=await signing(addresses[4]).signTypedData(domain,policyTypes,policy);
      const approval=approvalFor(policy,passportId,state,domain);
      const workerSignature=await signing(await who.getAddress()).signTypedData(domain,approvalTypes,approval);
      const input=await prepareAuthorizedWitness({policy,policySignature:verifierSignature,workerSignature,passportId,passport:state,
        domain,now,expectedVerifier:addresses[4]},async()=>snapshot,hashes);
      const {proof,publicSignals}=await prove(input,'consumer '+nonce);
      const x={passportId,policy,verifierSignature,workerSignature,a:proof.pi_a.slice(0,2),
        b:proof.pi_b.slice(0,2).map(row=>[row[1],row[0]]),c:proof.pi_c.slice(0,2),signals:publicSignals};
      check(await math.verifyProof(x.a,x.b,x.c,x.signals),'generated Solidity math verifier accepts real proof '+nonce);
      return {x,domain,state,approval};
    }
    const L=await packageFor(loan,s),W=await packageFor(welfare,s);
    check((await loan.verify(L.x)).every(x=>x===1n),'separate Verify succeeds before Borrow');
    check((await welfare.verify(W.x)).every(x=>x===1n),'separate Verify succeeds before Claim');
    check((await token.balanceOf(addresses[2]))===0n,'Verify does not transfer assets');
    for(const [changes,label] of [[{workerSignature:'0x'},'missing worker approval'],
      [{workerSignature:await signing(addresses[5]).signTypedData(L.domain,approvalTypes,L.approval)},'forged holder approval'],
      [{verifierSignature:await signing(addresses[5]).signTypedData(L.domain,policyTypes,L.x.policy)},'wrong verifier signer'],
      [{policy:{...L.x.policy,minAverageIncomePaise:1}},'modified easier policy'],
      [{policy:{...L.x.policy,requestId:id('OTHER_REQUEST')}},'wrong request'],
      [{policy:{...L.x.policy,verifierId:addresses[5]}},'wrong intended verifier'],
      [{passportId:999n},'absent passport'],
      [{policy:{...L.x.policy,expiresAt:now-1n}},'expired request']]) {
      await reject(()=>loan.connect(worker).borrow.staticCall({...L.x,...changes}),label,
        label==='missing worker approval'?'ECDSAInvalidSignatureLength':label==='modified easier policy'?'InvalidPolicy':
          label==='absent passport'?'ERC721NonexistentToken':'InvalidAuthorization');
    }
    const wrongDomain=domainFor(1338,await loan.getAddress());
    await reject(async()=>loan.verify({...L.x,verifierSignature:await signing(addresses[4]).signTypedData(wrongDomain,policyTypes,L.x.policy)}),'wrong chain EIP712 domain');
    await reject(()=>welfare.verify(L.x),'cross-consumer proof/policy','InvalidPolicy');
    await reject(()=>welfare.connect(other).claim.staticCall(W.x),'caller cannot execute another holder claim');
    await reject(()=>welfare.connect(worker).claim.staticCall({...W.x,policy:{...W.x.policy,minHistoryMonths:5}}),'weaker welfare history policy','InvalidPolicy');
    await reject(()=>loan.connect(other).borrow.staticCall(L.x),'caller cannot redirect approved loan');
    const modified=[...L.x.signals];modified[9]=String(BigInt(modified[9])+1n);
    await reject(()=>loan.verify({...L.x,signals:modified}),'modified public verifier input');
    for(const index of [0,1,2]) {
      const bits=[...L.x.signals];bits[index]='0';
      check(!(await math.verifyProof(L.x.a,L.x.b,L.x.c,bits)),'real math verifier rejects flipped PASS bit '+index);
    }
    const easy=await packageFor(loan,s,{minAverageIncomePaise:1});
    await reject(()=>loan.connect(worker).borrow.staticCall(easy.x),'real PASS proof for easier signed policy','InvalidPolicy');
    await sent(welfare.connect(worker).claim(W.x));
    check(await welfare.claimedByIdentity(identity),'lifetime welfare claim recorded by stable identity');
    await reject(()=>welfare.connect(worker).claim.staticCall(W.x),'duplicate claim/request');
    await sent(loan.connect(worker).borrow(L.x));
    check(await token.balanceOf(addresses[2])===100n*10n**6n,'Borrow transfers exactly 100 MockUSDC');
    await reject(()=>loan.connect(worker).borrow.staticCall(L.x),'replayed borrow/active debt');
    const fail=makeSnapshot({...s,monthlyActivity:[...Array(28).fill(0n),...Array(8).fill(1n)]});
    await sent(passport.connect(attester).refresh(1,evidence(fail)));
    const F=await packageFor(loan,fail);
    check((await loan.verify(F.x))[2]===0n,'valid FAIL proof remains mathematically verifiable');
    const forgedPass=[...F.x.signals];forgedPass[2]='1';
    check(!(await math.verifyProof(F.x.a,F.x.b,F.x.c,forgedPass)),'real math verifier rejects forged PASS on FAIL proof');
    await reject(()=>loan.connect(worker).borrow.staticCall(F.x),'activity FAIL blocks consumer','FailedCondition');
    await reject(()=>loan.verify(L.x),'old proof/approval after evidence refresh');
    const shortIncome={...s,monthlyGigIncomeTotals:[...s.monthlyGigIncomeTotals]};shortIncome.monthlyGigIncomeTotals[35]-=1n;
    await sent(passport.connect(attester).refresh(1,evidence(shortIncome)));
    const I=await packageFor(loan,shortIncome);check(I.x.signals[0]==='0','one-paise combined Groth16 deficit is an honest FAIL');
    await reject(()=>loan.connect(worker).borrow.staticCall(I.x),'one-paise income deficit blocks consumer','FailedCondition');
    const shortHistory={...s,verifiedHistoryStartDate:BigInt(Math.floor(Number(now)/86400))-100n};
    await sent(passport.connect(attester).refresh(1,evidence(shortHistory)));
    const H=await packageFor(loan,shortHistory);check(H.x.signals[1]==='0','insufficient history real proof returns FAIL');
    await reject(()=>loan.connect(worker).borrow.staticCall(H.x),'insufficient history blocks consumer','FailedCondition');
    s={...s,evidenceDataHash:123456790n};await sent(passport.connect(attester).refresh(1,evidence(s)));
    const stale=await packageFor(loan,s,{maxEvidenceAgeDays:30,expiresAt:now+40n*86400n});
    const timeCheckpoint=await chain.request({method:'evm_snapshot',params:[]});
    await chain.request({method:'evm_increaseTime',params:[31*86400]});await chain.request({method:'evm_mine',params:[]});
    await reject(()=>loan.verify(stale.x),'expired/stale evidence outside circuit');
    // Restore exact chain state/time, rather than subtracting a clock offset.
    check(await chain.request({method:'evm_revert',params:[timeCheckpoint]}),'freshness test restores its exact chain checkpoint');
    await sent(passport.revoke(1,'LOCAL_TEST_RECOVERY'));
    await reject(()=>loan.verify(stale.x),'revoked passport outside circuit');
    await sent(passport.authorizeReissue(identity));
    const replacementSnapshot={...s,passportId:2n,holderBinding:BigInt(addresses[3]),evidenceDataHash:123456791n};
    await sent(passport.connect(attester).mint(2,addresses[3],identity,evidence(replacementSnapshot)));
    check(await loan.principalByIdentity(identity)===100n*10n**6n,'debt persists through passport replacement');
    const RL=await packageFor(loan,replacementSnapshot,{},replacement),RW=await packageFor(welfare,replacementSnapshot,{},replacement);
    await reject(()=>loan.connect(replacement).borrow.staticCall(RL.x),'replacement cannot reset active debt');
    await reject(()=>welfare.connect(replacement).claim.staticCall(RW.x),'replacement cannot reset lifetime claim');
    await reject(async()=>loan.verify({...RL.x,workerSignature:await signing(addresses[2]).signTypedData(RL.domain,approvalTypes,RL.approval)}),'revoked wallet cannot approve replacement');
    await sent(token.transfer(addresses[3],100n*10n**6n));
    await reject(()=>loan.connect(worker).repay.staticCall(2),'revoked holder cannot repay as replacement');
    await sent(token.connect(replacement).approve(await loan.getAddress(),99n*10n**6n));
    await reject(()=>loan.connect(replacement).repay.staticCall(2),'partial repayment allowance cannot clear debt','ERC20InsufficientAllowance');
    check(await loan.principalByIdentity(identity)===100n*10n**6n,'failed repayment preserves principal');
    await sent(token.connect(replacement).approve(await loan.getAddress(),100n*10n**6n));
    await sent(loan.connect(replacement).repay(2));
    check(await loan.principalByIdentity(identity)===0n,'replacement repays exact debt without income proof');
    await loan.connect(replacement).borrow.staticCall(RL.x);
    await sent(loan.connect(replacement).borrow(RL.x,{gasLimit:1500000}));
    await sent(token.connect(replacement).approve(await loan.getAddress(),100n*10n**6n));await sent(loan.connect(replacement).repay(2));
    await reject(()=>loan.connect(replacement).borrow.staticCall(RL.x),'repaid debt does not permit spent request reuse');
    const fresh=await packageFor(loan,replacementSnapshot,{},replacement);await sent(loan.connect(replacement).borrow(fresh.x));
    check(await loan.principalByIdentity(identity)===100n*10n**6n,'fresh approved request allows reborrow after repayment');
    console.log(`Real Groth16 + local Solidity consumer integration: ${checks} checks passed.`);
    return {checks};
  } finally {provider.destroy();await chain.disconnect();}
}
