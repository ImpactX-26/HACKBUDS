import { PERSONAS } from "../lib/mock/data";
import { GEN } from "../lib/mock/profiles";
import { genRows, derive, PAYER_ID } from "../lib/mock/seed";
import { gigScore, bandOf, scoreParts } from "../lib/score";

console.log("=== TESTING SPECIFIED EXAMPLE ===");
const exampleInput = { tenure: 18, periods: 45, missed: 7, income: 24000 };
const exampleScore = gigScore(exampleInput);
const exampleBand = bandOf(exampleScore);
console.log(`Input: tenure=18, periods=45, missed=7, income=24000`);
console.log(`Result Score: ${exampleScore} (Expected: 81) | Band: ${exampleBand}`);
if (exampleScore !== 81) {
  console.error("❌ FAILURE: Example score did not match 81!");
  process.exit(1);
} else {
  console.log("✅ SUCCESS: Example score matches 81 perfectly!\n");
}

console.log("=== DEMO WORKERS GIG SCORE REPORT ===");
const isRegistered = (payer: string) => Object.values(PAYER_ID).includes(payer);

PERSONAS.forEach((p) => {
  const profile = GEN[p.id];
  const rawRows = genRows(profile);
  const derived = derive(rawRows, (row) => isRegistered(row.payer));

  const input = {
    tenure: derived.t,
    periods: derived.p,
    missed: derived.m,
    income: derived.i,
  };

  const score = gigScore(input);
  const band = bandOf(score);
  const parts = scoreParts(input);

  console.log(`Worker #${p.id}: ${p.name} (${p.role})`);
  console.log(`  Derived Figures: Tenure=${derived.t} mos | Paid=${derived.p} wks | Missed=${derived.m} wks | Income=Rs ${derived.i}/mo`);
  console.log(`  Factor Scores: Tenure=${parts.tenure.score.toFixed(1)}% | Consistency=${parts.consistency.score.toFixed(1)}% | Income=${parts.income.score.toFixed(1)}%`);
  console.log(`  Weighted Points: Tenure=${parts.tenure.points.toFixed(2)} | Consistency=${parts.consistency.points.toFixed(2)} | Income=${parts.income.points.toFixed(2)}`);
  console.log(`  Final Score: ${score}/100 | Band: ${band}\n`);
});
