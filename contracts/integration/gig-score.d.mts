export declare const gigScoreVersion:'gv-worker-gig-score/1';
export interface GigScoreInput {
  tenureMonths:number; weeksPaid:number; missedWeeks:number;
  averageMonthlyIncomePaise:string; paidWeeksLast12Weeks?:number;
}
export interface GigScoreResult {
  version:typeof gigScoreVersion;score:number;unroundedScore:number;
  mode:'three-factor'|'four-factor';
  components:{tenure:number;consistency:number;income:number;activity?:number};
  weights:{tenure:number;consistency:number;income:number;activity?:number};
}
export declare function calculateGigScore(input:GigScoreInput):GigScoreResult;
