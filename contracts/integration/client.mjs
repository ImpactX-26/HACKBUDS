import {Contract,TypedDataEncoder,verifyTypedData,getAddress} from 'ethers';
import {approvalFor,approvalTypes,policyTypes,domainFor,validatePolicy,criteria,assertAuthorized,manifest as signalOrder} from '../proposal/authorization-v02.mjs';
import {protocolVersion,eligibilityProfile} from './protocol.mjs';
import {BackendError,fail,safeError} from './errors.mjs';
export const bundleVersion='gv-local-integration-b5/1';
const copy=x=>structuredClone(x);
const decimal=x=>{if(typeof x==='number'&&!Number.isSafeInteger(x)||!/^(0|[1-9][0-9]*)$/.test(String(x)))fail('INVALID_INPUT','Use exact unsigned decimal integers.');return String(x);};
export const consumerPolicies=Object.freeze({
  welfare:Object.freeze({incomeEnabled:'0',incomeWindowMonths:'0',minAverageIncomePaise:'0',activityEnabled:'1',activityIsWeekly:'0',
    activityWindow:'6',minActivePeriods:'4',historyEnabled:'1',minHistoryMonths:'6',maxEvidenceAgeDays:'90'}),
  loan:Object.freeze({incomeEnabled:'1',incomeWindowMonths:'6',minAverageIncomePaise:'2000000',activityEnabled:'1',activityIsWeekly:'0',
    activityWindow:'12',minActivePeriods:'9',historyEnabled:'1',minHistoryMonths:'12',maxEvidenceAgeDays:'30'})});

/** Public chain adapter + optional private prover capability, supplied only by a trusted owner.
 * Signers are caller capabilities; no default worker key and no automatic worker approval.
 */
export function createBackendClient({bundle,provider,prover,isClosed=()=>false}) {
  const b=copy(bundle);
  if(b.bundleVersion!==bundleVersion||b.protocolVersion!==protocolVersion||b.eligibilityProfile!==eligibilityProfile||
    b.commitmentProfile!=='gv-poseidon-hash-only-0.1.0'||b.localOnly!==true||b.chainId!==1337||
    JSON.stringify(b.publicSignalOrder)!==JSON.stringify(signalOrder))fail('BUNDLE_UNSUPPORTED','Use this local session’s versioned bundle.');
  const contracts=Object.fromEntries(Object.entries(b.contracts).map(([name,entry])=>[name,new Contract(entry.address,entry.abi,provider)]));
  const passport=contracts.passport,token=contracts.token,loan=contracts.loan;
  const available=()=>{if(isClosed())fail('SESSION_CLOSED','The local session is closed. Start a new session.');};
  const guarded=fn=>async(...args)=>{available();try{const value=await fn(...args);available();return value;}catch(e){throw safeError(e,Object.values(contracts));}};
  async function state(passportId) {
    const id=decimal(passportId);if(id==='0'||BigInt(id)>=1n<<64n)fail('INVALID_INPUT','Passport ID is outside the supported range.');
    const block=await provider.getBlock('latest'),record=await passport.getPassport(id,{blockTag:block.number});
    const result={passportId:id,status:record.status===0n?'ACTIVE':'REVOKED'};
    for(const k of ['holderWallet','identityNullifierHash','evidenceCommitment','evidenceVersion','evidenceUpdatedAt','issuedAt','schemaVersion','evidenceProvider','supersedes'])
      result[k]=typeof record[k]==='bigint'?record[k].toString():record[k];
    const events=[...await passport.queryFilter(passport.filters.PassportIssued(id),0,block.number),
      ...await passport.queryFilter(passport.filters.EvidenceRefreshed(id),0,block.number)];
    const current=events.find(e=>e.args.evidenceVersion===record.evidenceVersion);
    if(!current||current.args.evidenceCommitment!==record.evidenceCommitment)fail('DEPLOYMENT_MISMATCH','Current passport evidence event is unavailable.');
    result.sourceDirectoryVersion=current.args.sourceDirectoryVersion.toString();
    return {record,block,public:result};
  }
  async function preflight(raw,{approval=true}={}) {
    const r=copy(raw);
    if(r.protocolVersion!==protocolVersion||r.eligibilityProfile!==eligibilityProfile||!['gate','welfare','loan'].includes(r.consumer))
      fail('REQUEST_UNSUPPORTED','Unknown request profile or consumer.');
    const fields=[...criteria,'requestId','verifierId','maxEvidenceAgeDays','expiresAt'];
    if(!r.policy||Object.keys(r.policy).length!==fields.length||fields.some(k=>!Object.hasOwn(r.policy,k)))fail('INVALID_POLICY','Policy contains missing or unsupported fields.');
    try {validatePolicy(r.policy);}catch{fail('INVALID_POLICY','Policy bounds or optional conditions are invalid.');}
    const expected=consumerPolicies[r.consumer];
    if(expected&&Object.entries(expected).some(([k,v])=>String(r.policy[k])!==v))fail('INVALID_POLICY','Use the selected consumer’s exact signed policy.');
    const {record,block}=await state(r.passportId),consumer=contracts[r.consumer],domain=domainFor(b.chainId,await consumer.getAddress());
    if((await provider.getNetwork()).chainId!==BigInt(b.chainId)||await consumer.domainHash()!==TypedDataEncoder.hashDomain(domain)||
      (await consumer.passport()).toLowerCase()!==b.contracts.passport.address.toLowerCase()||
      (await consumer.mathVerifier()).toLowerCase()!==b.contracts.math.address.toLowerCase())fail('DEPLOYMENT_MISMATCH','Consumer deployment/domain does not match this session.');
    if(record.status!==0n)fail('PASSPORT_REVOKED','The passport is revoked.');
    if(BigInt(r.policy.expiresAt)<BigInt(block.timestamp))fail('REQUEST_EXPIRED','This approved request has expired. Obtain a new request and approval.');
    if(record.evidenceUpdatedAt>BigInt(block.timestamp)||BigInt(r.policy.maxEvidenceAgeDays)>0n&&
      BigInt(block.timestamp)-record.evidenceUpdatedAt>BigInt(r.policy.maxEvidenceAgeDays)*86400n)fail('EVIDENCE_STALE','Current passport evidence is outside this policy’s freshness window.');
    const intended=await consumer.intendedVerifier();
    try {if(r.policy.verifierId.toLowerCase()!==intended.toLowerCase()||
      verifyTypedData(domain,policyTypes,r.policy,r.verifierSignature).toLowerCase()!==intended.toLowerCase())throw Error();}
    catch{fail('VERIFIER_SIGNATURE_INVALID','The policy’s verifier signature is invalid.');}
    if(approval)try {assertAuthorized({policy:r.policy,policySignature:r.verifierSignature,workerSignature:r.workerSignature,
      passportId:r.passportId,passport:record,domain,now:block.timestamp,expectedVerifier:intended});}
    catch{fail('WORKER_APPROVAL_INVALID','Worker approval is missing or does not match this request/current evidence.');}
    return {request:r,record,consumer,domain};
  }
  function packageFor(r,result) {
    if(result?.protocolVersion!==protocolVersion||result.eligibilityProfile!==eligibilityProfile||result.setupId!==b.setupId||
      !Array.isArray(result.publicSignals)||result.publicSignals.length!==29||!result.solidity||
      JSON.stringify(result.solidity.signals)!==JSON.stringify(result.publicSignals))fail('PROOF_PACKAGE_INVALID','Proof package/profile/setup does not match the session.');
    return {passportId:r.passportId,policy:r.policy,verifierSignature:r.verifierSignature,workerSignature:r.workerSignature,
      a:result.solidity.a,b:result.solidity.b,c:result.solidity.c,signals:result.publicSignals};
  }
  async function checkedPackage(request,result) {
    const p=await preflight(request),x=packageFor(p.request,result);
    if(String(x.signals[4])!==p.record.evidenceCommitment.toString()||String(x.signals[8])!==p.record.evidenceVersion.toString())
      fail('EVIDENCE_CHANGED','Passport evidence changed. Obtain a new request, approval and proof.');
    return {...p,x};
  }
  const receipt=async promise=>{const tx=await promise,r=await tx.wait();return {hash:r.hash,blockNumber:r.blockNumber,status:r.status,gasUsed:r.gasUsed.toString()};};
  async function holder(record,signer){if(!signer||getAddress(await signer.getAddress())!==getAddress(record.holderWallet))fail('UNAUTHORIZED_WORKER','Use the current passport holder’s wallet.');}
  async function execute(kind,request,result,signer) {
    if(request.consumer!==(kind==='claim'?'welfare':'loan'))fail('CONSUMER_MISMATCH','Use a proof approved for this consumer.');
    const p=await checkedPackage(request,result);await holder(p.record,signer);
    // Do not let nice error preflights bypass the authoritative on-chain verification.
    const bits=await p.consumer.verify(p.x);
    if(bits.some(v=>v!==1n))fail('CONDITION_FAILED','One or more approved conditions are not met.');
    if(await p.consumer.consumedRequests(p.request.policy.requestId))fail('REQUEST_REPLAY','This consumer request has already been executed.');
    if(kind==='claim'&&await p.consumer.claimedByIdentity(p.record.identityNullifierHash))fail('ALREADY_CLAIMED','This identity has already received the one-time claim.');
    if(kind==='borrow'&&await loan.principalByIdentity(p.record.identityNullifierHash)!==0n)fail('ACTIVE_LOAN','This identity has an outstanding loan.');
    const contract=p.consumer.connect(signer);await contract[kind].staticCall(p.x);
    return receipt(contract[kind](p.x)); // Actual consumer transaction repeats all checks.
  }
  return Object.freeze({
    bundle:copy(b),
    getPassport:guarded(async id=>(await state(id)).public),
    getNextPassportId:guarded(async()=>(await passport.nextPassportId()).toString()),
    getActivePassportByIdentity:guarded(async identity=>(await passport.activePassportByIdentity(identity)).toString()),
    isReissueAllowed:guarded(async identity=>passport.reissueAllowed(identity)),
    getIdentityState:guarded(async id=>{const p=await state(id),identity=p.record.identityNullifierHash;
      return {identity,claimed:await contracts.welfare.claimedByIdentity(identity),principal:await loan.principalByIdentity(identity).then(String)};}),
    getApproval:guarded(async request=>{const p=await preflight(request,{approval:false});return {domain:p.domain,types:copy(approvalTypes),
      value:Object.fromEntries(Object.entries(approvalFor(p.request.policy,p.request.passportId,p.record,p.domain)).map(([k,v])=>[k,typeof v==='bigint'?v.toString():v]))};}),
    approveRequest:guarded(async(request,signer)=>{const p=await preflight(request,{approval:false});await holder(p.record,signer);
      const signature=await signer.signTypedData(p.domain,approvalTypes,approvalFor(p.request.policy,p.request.passportId,p.record,p.domain));
      return {...p.request,workerSignature:signature};}),
    generateProof:guarded(async request=>{const p=await preflight(request);if(!prover)fail('PROVER_UNAVAILABLE','The private trusted prover is not attached to this public client.');
      try{return await prover.prove(p.request);}catch{fail('PROVER_REJECTED','Private evidence or proof preparation was rejected.');}}),
    verify:guarded(async(request,result)=>{const p=await checkedPackage(request,result),bits=await p.consumer.verify(p.x);
      return {income:bits[0]===1n?'PASS':'FAIL',history:bits[1]===1n?'PASS':'FAIL',activity:bits[2]===1n?'PASS':'FAIL',
        enabled:{income:String(p.request.policy.incomeEnabled)==='1',history:String(p.request.policy.historyEnabled)==='1',activity:String(p.request.policy.activityEnabled)==='1'}};}),
    claim:guarded((r,p,s)=>execute('claim',r,p,s)),borrow:guarded((r,p,s)=>execute('borrow',r,p,s)),
    approveRepayment:guarded(async signer=>receipt(token.connect(signer).approve(await loan.getAddress(),100n*10n**6n))),
    repay:guarded(async(id,signer)=>{const p=await state(id);if(p.record.status!==0n)fail('PASSPORT_REVOKED','Use an ACTIVE replacement passport for repayment.');
      await holder(p.record,signer);
      if(await loan.principalByIdentity(p.record.identityNullifierHash)!==100n*10n**6n)fail('NO_ACTIVE_LOAN','This identity has no repayable loan.');
      if(await token.allowance(p.record.holderWallet,await loan.getAddress())<100n*10n**6n)fail('INSUFFICIENT_ALLOWANCE','Approve exactly 100 MockUSDC before repayment.');
      await loan.connect(signer).repay.staticCall(id);return receipt(loan.connect(signer).repay(id));})
  });
}
