import { PERSONAS } from "../lib/mock/data";
import { GEN } from "../lib/mock/profiles";
import { derive, genRows, PAYER_ID } from "../lib/mock/seed";
import { bandOf, gigScore } from "../lib/score";

async function testPersona7() {
  const p7 = PERSONAS.find((p) => p.id === 7);
  if (!p7) {
    console.error("Persona 7 not found in PERSONAS!");
    return;
  }

  const profile = GEN[7];
  if (!profile) {
    console.error("Profile 7 not found in GEN!");
    return;
  }

  const registry = Object.entries(PAYER_ID).map(([platform, payer]) => ({ platform, payer, from: 0 }));
  const isCounted = (row: any) => registry.some((g) => g.payer === row.payer && row.date >= g.from);

  const rawRows = genRows(profile);
  const d = derive(rawRows, isCounted);
  const score = gigScore({ tenure: d.t, periods: d.p, missed: d.m, income: d.i });
  const band = bandOf(score);

  console.log(`=== PERSONA 7 (ANAND VERMA) TEST RESULTS ===`);
  console.log(`Name: ${p7.name} (${p7.nameKn})`);
  console.log(`Role: ${p7.role} | City: ${p7.city}`);
  console.log(`Derived Figures:`);
  console.log(`  - Tenure: ${d.t} months`);
  console.log(`  - Weeks Paid: ${d.p} weeks`);
  console.log(`  - Missed Weeks: ${d.m} weeks`);
  console.log(`  - Monthly Income: Rs ${d.i.toLocaleString("en-IN")}`);
  console.log(`Calculated Score: ${score}/100`);
  console.log(`Calculated Band: ${band}`);
  console.log(`Expected Tag: ${p7.expected}`);
  console.log(`Match: ${band === p7.expected ? "SUCCESS (Weak Band Verified)" : "MISMATCH"}`);
}

testPersona7().catch(console.error);
