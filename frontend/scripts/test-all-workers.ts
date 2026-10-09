import { PERSONAS, ROLES } from "../lib/mock/data";
import { GEN } from "../lib/mock/profiles";
import { derive, genRows, PAYER_ID } from "../lib/mock/seed";
import { bandOf, gigScore, scoreParts } from "../lib/score";
import { LOAN_OFFERS, calculateEmi } from "../lib/constants";
import { inr } from "../lib/format";

async function testAllWorkers() {
  console.log("=== END-TO-END WORKER VERIFICATION REPORT ===\n");

  const registry = Object.entries(PAYER_ID).map(([platform, payer]) => ({ platform, payer, from: 0 }));
  const isCounted = (row: any) => registry.some((g) => g.payer === row.payer && row.date >= g.from);

  for (const p of PERSONAS) {
    console.log(`--------------------------------------------------`);
    console.log(`Worker #${p.id}: ${p.name} (${p.nameKn})`);
    console.log(`Role: ${p.role} (${ROLES[p.role].label}) | City: ${p.city}`);
    console.log(`Platforms: ${p.platforms.join(", ")} | Account: ${p.maskedAccount}`);
    console.log(`Story: ${p.why}`);

    const rawRows = genRows(GEN[p.id]);
    const d = derive(rawRows, isCounted);

    const input = {
      tenure: d.t,
      periods: d.p,
      missed: d.m,
      income: d.i,
    };

    const score = gigScore(input);
    const band = bandOf(score);
    const parts = scoreParts(input);
    const offer = LOAN_OFFERS[band];
    const emi = calculateEmi(offer.maxAmount, offer.annualRatePct, offer.maxMonths);

    console.log(`Derived Figures:`);
    console.log(`  - Tenure: ${d.t} months`);
    console.log(`  - Weeks Paid: ${d.p} weeks`);
    console.log(`  - Missed Weeks: ${d.m} weeks`);
    console.log(`  - Avg Monthly Income: ${inr(d.i)}`);
    console.log(`Calculated Gig Score: ${score}/100`);
    console.log(`Calculated Band: ${band} (Expected Tag: ${p.expected})`);
    console.log(`Score Points Breakdown:`);
    console.log(`  - Tenure: ${parts.tenure.points}/25 (raw score: ${parts.tenure.score})`);
    console.log(`  - Consistency: ${parts.consistency.points}/35 (raw score: ${parts.consistency.score})`);
    console.log(`  - Income: ${parts.income.points}/40 (raw score: ${parts.income.score})`);
    console.log(`Loan Offer for Verifier:`);
    if (offer.offered) {
      console.log(`  - Max Amount: ${inr(offer.maxAmount)}`);
      console.log(`  - Interest Rate: ${offer.annualRatePct}% p.a.`);
      console.log(`  - Term: ${offer.maxMonths} months`);
      console.log(`  - Monthly Instalment (EMI): ${inr(emi)}/mo`);
    } else {
      console.log(`  - No loan offered yet.`);
    }

    if (band !== p.expected) {
      console.log(`⚠️ MISMATCH WARNING: Calculated band (${band}) != Expected tag (${p.expected})`);
    } else {
      console.log(`✓ Band matches expected persona tag.`);
    }
    console.log("\n");
  }
}

testAllWorkers().catch(console.error);
