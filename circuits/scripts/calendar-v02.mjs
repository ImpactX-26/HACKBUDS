// PROVISIONAL anniversary/clamp witness generator. Circom independently checks every value.
export const epochDay=date=>BigInt(Math.floor(Date.parse(date+'T00:00:00Z')/86400000));
export function calendarWitness(timestamp,months) {
  const d=new Date(Number(timestamp)*1000),y=d.getUTCFullYear(),m=d.getUTCMonth()+1,day=d.getUTCDate();
  const index=y*12+m-1-Number(months),ty=Math.floor(index/12),tm=index%12+1;
  const td=Math.min(day,new Date(Date.UTC(ty,tm,0)).getUTCDate());
  return Object.fromEntries(Object.entries({cutoffYear:y,cutoffMonth:m,cutoffDay:day,
    targetYear:ty,targetMonth:tm,targetDay:td}).map(([k,v])=>[k,String(v)]));
}
