import {assertAuthorized} from '../../contracts/proposal/authorization-v02.mjs';
import {calendarWitness} from './calendar-v02.mjs';
import {SCALARS,field,validate} from '../dist/circuits/src/provisional-poseidon.js';
// In-memory boundary only. Reconstruct must obtain authenticated evidence through
// A's existing consent/FIP boundary; this module never substitutes source trust.
export async function prepareAuthorizedWitness(auth,reconstruct,hashes) {
  const fields=assertAuthorized(auth); // Reject BEFORE accessing private evidence.
  const snapshot=await reconstruct();
  validate(snapshot);
  if(BigInt(snapshot.passportId)!==BigInt(auth.passportId)||
    BigInt(snapshot.holderBinding)!==BigInt(auth.passport.holderWallet)||
    BigInt(snapshot.evidenceUpdatedAt)!==auth.passport.evidenceUpdatedAt||
    hashes.commit(snapshot).evidenceCommitment!==auth.passport.evidenceCommitment) throw Error('Reconstructed evidence mismatch');
  return {...Object.fromEntries(SCALARS.map(k=>[k,field(snapshot[k]).toString()])),
    monthlyGigIncomeTotals:snapshot.monthlyGigIncomeTotals.map(v=>field(v).toString()),
    weeklyActivity:snapshot.weeklyActivity.map(v=>field(v).toString()),
    monthlyActivity:snapshot.monthlyActivity.map(v=>field(v).toString()),...fields,
    ...calendarWitness(snapshot.evidenceUpdatedAt,auth.policy.minHistoryMonths)};
}
