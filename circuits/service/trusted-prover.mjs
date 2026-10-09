import {TypedDataEncoder,assertAuthorized,domainFor,manifest,context,criteria} from '../../contracts/proposal/authorization-v02.mjs';
import {prepareAuthorizedWitness} from '../scripts/authorized-witness-v02.mjs';
import {PROFILE,validate,field} from '../dist/circuits/src/provisional-poseidon.js';
export const protocolVersion='gv-local-prover-b4/1';
export const eligibilityProfile='gv-eligibility-0.2-provisional';
export const evidenceSchemaVersion='2';

const bound=(value,bits)=>{const n=field(value);if(n>=1n<<BigInt(bits))throw Error('Evidence scalar overflow');return n;};
export function validateEvidence(envelope,state,passportId) {
  if(state.schemaVersion!==BigInt(evidenceSchemaVersion)||envelope?.protocolVersion!==protocolVersion||envelope.commitmentProfile!==PROFILE||
    envelope.eligibilityProfile!==eligibilityProfile||envelope.schemaVersion!==String(state.schemaVersion)||
    envelope.evidenceVersion!==String(state.evidenceVersion)) throw Error('Unsupported evidence metadata');
  const s=envelope.snapshot;validate(s);
  if(bound(s.passportId,64)!==BigInt(passportId)||bound(s.passportId,64)===0n||
    bound(s.holderBinding,160)!==BigInt(state.holderWallet)||
    bound(s.evidenceUpdatedAt,40)!==state.evidenceUpdatedAt||
    bound(s.sourceDirectoryVersion,64)===0n||
    (state.sourceDirectoryVersion!==undefined&&BigInt(s.sourceDirectoryVersion)!==state.sourceDirectoryVersion)) throw Error('Evidence metadata mismatch');
  if(bound(s.verifiedHistoryStartDate,22)>BigInt(s.evidenceUpdatedAt)/86400n)throw Error('Future history date');
  const cutoffYear=new Date(Number(s.evidenceUpdatedAt)*1000).getUTCFullYear();
  if(cutoffYear<1970||cutoffYear>9999)throw Error('Unsupported calendar domain');
  for(const v of s.monthlyGigIncomeTotals)bound(v,64);
  return s;
}
const frozen=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(frozen);Object.freeze(value);}return value;};
const capture=r=>structuredClone(r); // Prevent mutation across awaited chain/evidence calls.

/** Capability boundary: only its trusted owner has the resolver. There is no public endpoint.
 * readState derives passport/domain/signer/time from deployed contracts, never the request.
 * reconstruct must authenticate consent, FIP signature and owner binding upstream.
 */
export function createTrustedProver({readState,reconstruct,hashes,prove,setupId}) {
  return Object.freeze({async prove(request) {
    let input;
    const r=capture(request);
    const policyKeys=[...criteria,'requestId','verifierId','expiresAt','maxEvidenceAgeDays'];
    if(!r.policy||Object.keys(r.policy).length!==policyKeys.length||policyKeys.some(k=>!Object.hasOwn(r.policy,k)))
      throw Error('Unsupported policy fields');
    if(r.protocolVersion!==protocolVersion||r.eligibilityProfile!==eligibilityProfile||
      typeof r.evidenceHandle!=='string'||!r.evidenceHandle||
      typeof r.passportId!=='string'||!/^[1-9][0-9]*$/.test(r.passportId)||BigInt(r.passportId)>=1n<<64n)
      throw Error('Unsupported proof request');
    const state=await readState(r.consumer,r.passportId,r.policy);
    if(state.passport.schemaVersion!==BigInt(evidenceSchemaVersion)||state.passport.evidenceVersion<1n||state.passport.evidenceVersion>=1n<<64n)
      throw Error('Unsupported passport metadata');
    const auth={policy:r.policy,policySignature:r.verifierSignature,workerSignature:r.workerSignature,
      passportId:r.passportId,passport:state.passport,domain:state.domain,now:state.now,expectedVerifier:state.expectedVerifier};
    assertAuthorized(auth); // Crucially BEFORE calling the private resolver.
    try {
      input=await prepareAuthorizedWitness(auth,async()=>validateEvidence(
        structuredClone(await reconstruct(r.evidenceHandle)),state.passport,r.passportId),hashes);
      const result=await prove(input);
      if(!Array.isArray(result.publicSignals)||result.publicSignals.length!==manifest.length)
        throw Error('Incorrect public-signal layout');
      const signals=result.publicSignals.map(v=>field(v).toString());
      for(const k of [...context,...criteria])
        if(signals[manifest.indexOf(k)]!==input[k])throw Error('Incorrect public context');
      for(const bit of signals.slice(0,3))if(bit!=='0'&&bit!=='1')throw Error('Invalid predicate result');
      // Recheck current authorization after proof computation; refresh/revoke/expiry races fail closed.
      const current=await readState(r.consumer,r.passportId,r.policy);
      const after=assertAuthorized({...auth,passport:current.passport,domain:current.domain,
        now:current.now,expectedVerifier:current.expectedVerifier});
      for(const k of [...context,...criteria])if(after[k]!==input[k])throw Error('Passport changed during proving');
      const p=result.proof;
      const solidity={a:p.pi_a.slice(0,2),b:p.pi_b.slice(0,2).map(row=>[row[1],row[0]]),c:p.pi_c.slice(0,2),signals};
      return frozen({protocolVersion,eligibilityProfile,commitmentProfile:PROFILE,schemaVersion:evidenceSchemaVersion,setupId,proof:p,publicSignals:signals,solidity});
    } catch {throw Error('Private evidence or proof rejected');}
    finally {input=null;}
  }});
}

// This reader supports only the explicitly deployed LOCAL contracts supplied by the owner.
export function localChainReader({provider,passport,consumers,chainId,mathVerifier}) {
  return async (name,passportId,policy)=>{
    const consumer=consumers[name];if(!consumer)throw Error('Unknown consumer');
    const block=await provider.getBlock('latest');
    const tag={blockTag:block.number};
    if((await provider.getNetwork()).chainId!==BigInt(chainId))throw Error('Wrong chain');
    const domain=domainFor(chainId,await consumer.getAddress());
    if((await consumer.domainHash(tag))!==TypedDataEncoder.hashDomain(domain)||
      (await consumer.passport(tag)).toLowerCase()!==(await passport.getAddress()).toLowerCase()||
      (await consumer.mathVerifier(tag)).toLowerCase()!==mathVerifier.toLowerCase())throw Error('Deployment mismatch');
    // Mirror existing consumer policy; this is a preflight, contracts independently enforce it.
    const expected=name==='welfare'?{incomeEnabled:0,incomeWindowMonths:0,minAverageIncomePaise:0,
      activityEnabled:1,activityIsWeekly:0,activityWindow:6,minActivePeriods:4,historyEnabled:1,minHistoryMonths:6,maxEvidenceAgeDays:90}:
      name==='loan'?{incomeEnabled:1,incomeWindowMonths:6,minAverageIncomePaise:2000000,
        activityEnabled:1,activityIsWeekly:0,activityWindow:12,minActivePeriods:9,historyEnabled:1,minHistoryMonths:12,maxEvidenceAgeDays:30}:{};
    for(const [key,value]of Object.entries(expected))if(String(policy[key])!==String(value))throw Error('Incorrect consumer policy');
    const record=await passport.getPassport(passportId,tag);
    const events=[...await passport.queryFilter(passport.filters.PassportIssued(passportId),0,block.number),
      ...await passport.queryFilter(passport.filters.EvidenceRefreshed(passportId),0,block.number)];
    const event=events.find(e=>e.args.evidenceVersion===record.evidenceVersion);
    if(!event||event.args.evidenceCommitment!==record.evidenceCommitment||event.args.evidenceUpdatedAt!==record.evidenceUpdatedAt)
      throw Error('Missing current evidence event');
    const state={holderWallet:record.holderWallet,evidenceVersion:record.evidenceVersion,evidenceCommitment:record.evidenceCommitment,
      evidenceUpdatedAt:record.evidenceUpdatedAt,schemaVersion:record.schemaVersion,status:record.status,
      sourceDirectoryVersion:event.args.sourceDirectoryVersion};
    return {passport:state,domain,now:block.timestamp,
      expectedVerifier:await consumer.intendedVerifier(tag)};
  };
}
