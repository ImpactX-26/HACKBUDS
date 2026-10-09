import { calculateEmi, LOAN_OFFERS } from "../lib/constants";
import type { ScoreBand } from "../lib/score";

console.log("=== LOAN OFFERS AND EMI CALCULATION REPORT ===");
const bands: ScoreBand[] = ["Strong", "Good", "Fair", "Weak"];

bands.forEach((b) => {
  const offer = LOAN_OFFERS[b];
  if (!offer.offered) {
    console.log(`Band ${b}: No loan offered yet.`);
  } else {
    const emi = calculateEmi(offer.maxAmount, offer.annualRatePct, offer.maxMonths);
    console.log(
      `Band ${b}: Max Amount = Rs ${offer.maxAmount.toLocaleString("en-IN")} | Rate = ${offer.annualRatePct}% p.a. | Term = ${offer.maxMonths} mos | Monthly Instalment (EMI) = Rs ${emi.toLocaleString("en-IN")}/mo`
    );
  }
});
