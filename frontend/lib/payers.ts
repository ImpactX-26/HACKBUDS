import type { BankRow } from "./types";

// An unknown payer whose credits are narrated "<PLATFORM> PAYOUT" is probably a platform
// that started paying from a new UPI id. We never guess. We only offer it as a candidate
// for whoever maintains the registry to add.

export interface Candidate {
  payer: string;
  platform: string; // e.g. "SWIGGY"
  from: string; // earliest credit date, YYYY-MM-DD
  credits: number;
}

export function findCandidates(rows: BankRow[]): Candidate[] {
  const found = new Map<string, Candidate>();
  for (const r of rows) {
    if (r.type !== "CR" || r.counted) continue;
    const m = /\/([A-Z]+) PAYOUT/.exec(r.narration);
    if (!m) continue;
    const c = found.get(r.payer);
    if (!c) {
      found.set(r.payer, { payer: r.payer, platform: m[1], from: r.date, credits: 1 });
    } else {
      c.credits += 1;
      if (r.date < c.from) c.from = r.date;
    }
  }
  return Array.from(found.values());
}

export const titleCase = (s: string): string => s.charAt(0) + s.slice(1).toLowerCase();
