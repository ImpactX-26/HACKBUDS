import {validate,PROFILE} from '../dist/circuits/src/provisional-poseidon.js';
import {addressToFieldElement,hashToFieldElement,providerIdToFieldElement} from '../dist/shared/proposal/field-mappings.js';
import {protocolVersion,eligibilityProfile} from './trusted-prover.mjs';
const safe=v=>{if(!Number.isSafeInteger(v)||v<0)throw Error('Unsafe Backend A integer');return String(v);};
// Translation only, after authenticated reconstruction. Never accepts legacy mock proof results.
// A's published runtime already uses epoch DAYS. Seconds are rejected, never divided silently.
export function translateBackendAWitness(payload,{schemaVersion,evidenceVersion},hashes) {
  if(schemaVersion!=='2')throw Error('v0.2 requires authenticated on-chain evidence schemaVersion 2');
  const s=payload.snapshot,c=payload.circuitInputs,p=payload.expectedPublicSignals;
  const snapshot={passportId:safe(s.passportId),holderBinding:addressToFieldElement(s.holderBinding).toString(),
    evidenceProviderId:providerIdToFieldElement(s.evidenceProviderId).toString(),
    evidenceDataHash:hashToFieldElement(s.evidenceDataHash).toString(),
    verifiedHistoryStartDate:safe(s.verifiedHistoryStartDate),evidenceUpdatedAt:safe(s.evidenceUpdatedAt),
    sourceDirectoryVersion:safe(s.sourceDirectoryVersion),monthlyGigIncomeTotals:s.monthlyGigIncomeTotals.map(safe),
    weeklyActivity:s.weeklyActivity.map(safe),monthlyActivity:s.monthlyActivity.map(safe)};
  validate(snapshot);
  if(BigInt(snapshot.verifiedHistoryStartDate)>=1n<<22n)throw Error('History must be epoch days');
  const expected={passportId:Number(snapshot.passportId),holderAddressScalar:snapshot.holderBinding,
    providerIdScalar:snapshot.evidenceProviderId,evidenceDataHashScalar:snapshot.evidenceDataHash,
    verifiedHistoryStartDateDays:Number(snapshot.verifiedHistoryStartDate),evidenceUpdatedAtSeconds:Number(snapshot.evidenceUpdatedAt),
    sourceDirectoryVersion:Number(snapshot.sourceDirectoryVersion),monthlyGigIncomeTotalsPaise:snapshot.monthlyGigIncomeTotals,
    weeklyActivityFlags:s.weeklyActivity,monthlyActivityFlags:s.monthlyActivity};
  for(const [key,value]of Object.entries(expected))
    if(Array.isArray(value)?!Array.isArray(c[key])||c[key].length!==value.length||value.some((v,i)=>String(c[key][i])!==String(v)):
      String(c[key])!==String(value))throw Error('Conflicting Backend A witness representations');
  const commitment=hashes.commit(snapshot).evidenceCommitment.toString();
  if(p.passportId!==s.passportId||p.holderBinding.toLowerCase()!==s.holderBinding.toLowerCase()||
    p.sourceDirectoryVersion!==s.sourceDirectoryVersion||p.evidenceCommitment!==commitment||
    (s.evidenceCommitment!==undefined&&s.evidenceCommitment!==commitment))throw Error('Backend A commitment mismatch');
  return {protocolVersion,commitmentProfile:PROFILE,eligibilityProfile,schemaVersion,evidenceVersion,snapshot};
}
