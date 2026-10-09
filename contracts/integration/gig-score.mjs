/** Worker-only presentation calculation approved by the user on 9 October 2026.
 * Not a proof, on-chain field, lending policy, authenticated data source or category.
 * Caller supplies metrics from authenticated recognized payouts, never all credits.
 */
export const gigScoreVersion='gv-worker-gig-score/1';
const integer=(value,name,max=Number.MAX_SAFE_INTEGER)=>{
  if(!Number.isSafeInteger(value)||value<0||value>max)throw new RangeError(`Invalid ${name}`);
  return value;
};
export function calculateGigScore({tenureMonths,weeksPaid,missedWeeks,averageMonthlyIncomePaise,paidWeeksLast12Weeks}) {
  integer(tenureMonths,'tenureMonths');integer(weeksPaid,'weeksPaid');integer(missedWeeks,'missedWeeks');
  const totalWeeks=integer(weeksPaid+missedWeeks,'totalWeeks');
  if(typeof averageMonthlyIncomePaise!=='string'||!/^(0|[1-9][0-9]*)$/.test(averageMonthlyIncomePaise))
    throw new RangeError('Income must be an exact unsigned paise decimal string');
  const income=BigInt(averageMonthlyIncomePaise);
  if(income>BigInt(Number.MAX_SAFE_INTEGER))throw new RangeError('Income exceeds the supported A monetary domain');
  const recent=paidWeeksLast12Weeks!==undefined;
  if(recent)integer(paidWeeksLast12Weeks,'paidWeeksLast12Weeks',12);
  const components={tenure:Math.min(tenureMonths/24,1)*100,
    consistency:totalWeeks===0?0:weeksPaid/totalWeeks*100,
    income:Number(income>3000000n?3000000n:income)/3000000*100};
  if(recent)components.activity=paidWeeksLast12Weeks/12*100;
  const weights=recent?{tenure:0.2,consistency:0.3,income:0.3,activity:0.2}:{tenure:0.25,consistency:0.35,income:0.4};
  const exact=Object.entries(weights).reduce((sum,[k,w])=>sum+components[k]*w,0);
  return {version:gigScoreVersion,score:Math.round(exact),unroundedScore:exact,
    mode:recent?'four-factor':'three-factor',components,weights};
}
