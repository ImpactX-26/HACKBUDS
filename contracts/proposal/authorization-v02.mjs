import {TypedDataEncoder,verifyTypedData} from 'ethers';
export {TypedDataEncoder};

// Backend B LOCAL proposal, NOT a frozen shared schema. Full bytes32 hashes
// are represented by high/low uint128 limbs; no field reduction of signed IDs.
export const profile='gv-eligibility-0.2-provisional';
export const criteria=['incomeEnabled','incomeWindowMonths','minAverageIncomePaise',
  'activityEnabled','activityIsWeekly','activityWindow','minActivePeriods','historyEnabled','minHistoryMonths'];
export const context=['expectedCommitment','passportId','holderBinding','evidenceUpdatedAt',
  'evidenceVersion','verifierId','chainId','consumer','requestHi','requestLo','policyHi','policyLo',
  'domainHi','domainLo','expiresAt','maxEvidenceAgeDays'];
export const manifest=['incomePass','historyPass','activityPass','authorizationBinding',...context,...criteria];
export const policyTypes={VerificationPolicy:[{name:'requestId',type:'bytes32'},
  {name:'verifierId',type:'address'},...criteria.map(name=>({name,type:'uint256'})),
  {name:'maxEvidenceAgeDays',type:'uint256'},{name:'expiresAt',type:'uint256'}]};
export const approvalTypes={WorkerApproval:[{name:'requestId',type:'bytes32'},
  {name:'passportId',type:'uint256'},{name:'evidenceVersion',type:'uint256'},
  {name:'evidenceCommitment',type:'uint256'},{name:'policyHash',type:'bytes32'},
  {name:'verifierId',type:'address'},{name:'expiresAt',type:'uint256'},{name:'domainHash',type:'bytes32'}]};
export const domainFor=(chainId,consumer)=>({name:'GigVaultEligibility',version:'0.2-provisional',chainId,verifyingContract:consumer});
export const limbs=hex=>[BigInt(hex)>>128n,BigInt(hex)&((1n<<128n)-1n)];
export function approvalFor(policy,passportId,passport,domain) {
  return {requestId:policy.requestId,passportId,evidenceVersion:passport.evidenceVersion,
    evidenceCommitment:passport.evidenceCommitment,policyHash:TypedDataEncoder.hash(domain,policyTypes,policy),
    verifierId:policy.verifierId,expiresAt:policy.expiresAt,domainHash:TypedDataEncoder.hashDomain(domain)};
}
export function publicContext(policy,passportId,passport,domain) {
  const approval=approvalFor(policy,passportId,passport,domain);
  const [requestHi,requestLo]=limbs(policy.requestId),[policyHi,policyLo]=limbs(approval.policyHash),
    [domainHi,domainLo]=limbs(approval.domainHash);
  return Object.fromEntries(Object.entries({expectedCommitment:passport.evidenceCommitment,passportId,
    holderBinding:BigInt(passport.holderWallet),evidenceUpdatedAt:passport.evidenceUpdatedAt,
    evidenceVersion:passport.evidenceVersion,verifierId:BigInt(policy.verifierId),chainId:domain.chainId,
    consumer:BigInt(domain.verifyingContract),requestHi,requestLo,policyHi,policyLo,domainHi,domainLo,
    expiresAt:policy.expiresAt,maxEvidenceAgeDays:policy.maxEvidenceAgeDays,
    ...Object.fromEntries(criteria.map(k=>[k,policy[k]]))}).map(([k,v])=>[k,String(v)]));
}
export function validatePolicy(p) {
  const v=k=>BigInt(p[k]);
  for(const k of criteria.concat(['maxEvidenceAgeDays','expiresAt'])) {
    if(typeof p[k]==='number'&&!Number.isSafeInteger(p[k])) throw Error('Unsafe numeric policy input');
    if(!/^(0|[1-9][0-9]*)$/.test(String(p[k]))) throw Error('Noncanonical policy');
  }
  for(const k of ['incomeEnabled','activityEnabled','activityIsWeekly','historyEnabled']) if(v(k)>1n) throw Error('Invalid selector');
  if(v('minAverageIncomePaise')>=1n<<64n||v('expiresAt')>=1n<<40n||v('maxEvidenceAgeDays')>=1n<<32n) throw Error('Policy overflow');
  if(v('incomeEnabled')===1n?(v('incomeWindowMonths')<1n||v('incomeWindowMonths')>36n):
    (v('incomeWindowMonths')!==0n||v('minAverageIncomePaise')!==0n)) throw Error('Invalid income');
  if(v('activityEnabled')===1n?(v('activityWindow')<1n||v('activityWindow')>(v('activityIsWeekly')===1n?156n:36n)||v('minActivePeriods')>v('activityWindow')):
    (v('activityWindow')!==0n||v('minActivePeriods')!==0n||v('activityIsWeekly')!==0n)) throw Error('Invalid activity');
  if(v('historyEnabled')===1n?(v('minHistoryMonths')<1n||v('minHistoryMonths')>360n):v('minHistoryMonths')!==0n) throw Error('Invalid history');
  if(BigInt(p.requestId)===0n||BigInt(p.verifierId)===0n) throw Error('Missing request identity');
}
// This is the controlled prover's preflight, before private reconstruction or
// witness generation. A backend holding data can still compute math off-path.
export function assertAuthorized({policy,policySignature,workerSignature,passportId,passport,domain,now,expectedVerifier}) {
  validatePolicy(policy);
  if(passport.status!==0n||passport.evidenceVersion<1n||BigInt(passport.holderWallet)===0n) throw Error('Inactive passport');
  if(BigInt(policy.expiresAt)<BigInt(now)||passport.evidenceUpdatedAt>BigInt(now)||
    (BigInt(policy.maxEvidenceAgeDays)>0n&&BigInt(now)-passport.evidenceUpdatedAt>BigInt(policy.maxEvidenceAgeDays)*86400n)) throw Error('Expired or stale');
  if(policy.verifierId.toLowerCase()!==expectedVerifier.toLowerCase()||
    verifyTypedData(domain,policyTypes,policy,policySignature).toLowerCase()!==expectedVerifier.toLowerCase()) throw Error('Invalid verifier signature');
  const approval=approvalFor(policy,passportId,passport,domain);
  if(verifyTypedData(domain,approvalTypes,approval,workerSignature).toLowerCase()!==passport.holderWallet.toLowerCase()) throw Error('Missing holder approval');
  return publicContext(policy,passportId,passport,domain);
}
