// Builds a worker's bank rows and works out the four figures. Mock only.
// The same seed always gives the same rows, so the demo behaves the same every time.

import type { GenProfile } from "./profiles";

export const DAY = 864e5;
export const END = Date.UTC(2026, 8, 28);

export const PAYER_ID: Record<string, string> = {
  SWIGGY: "swiggy.payouts@icici",
  ZOMATO: "zomato.pay@hdfc",
  UBER: "uber.india@axis",
  OLA: "ola.payouts@icici",
  URBANCO: "urbanco.partner@yes",
  PORTER: "porter.pay@hdfc",
};

export const NEW_PAYER = "swiggy.rider2@axis";

export interface RawRow {
  date: number; // ms
  type: "CR" | "DR";
  amt: number;
  payer: string;
  narr: string;
}

export interface Derived {
  t: number;
  p: number;
  m: number;
  i: number;
  n: number;
  first: number;
  last: number;
}

function rng(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SPEND = ["UPI-BIGBASKET", "UPI-FUEL PUMP", "ATM-WDL", "UPI-RENT", "UPI-MOBILE RECHARGE"];
const FRIENDS = ["asha.k", "raju.m", "dinesh.p", "salma.b"];

export function genRows(p: GenProfile): RawRow[] {
  const r = rng(p.seed);
  const rows: RawRow[] = [];
  for (let w = 0; w < p.weeks; w++) {
    if (p.gap && w >= p.gap[0] && w < p.gap[1]) continue;
    const ws = END - (p.weeks - 1 - w) * 7 * DAY;
    for (let c = 0; c < p.cpw; c++) {
      const d = ws + c * 3 * DAY;
      const dt = new Date(d);
      const month = dt.getUTCMonth();
      let a = p.range[0] + (p.range[1] - p.range[0]) * r();
      if (month === 9 || month === 10) a *= 1.2; // Diwali weeks
      if (r() < 0.06) a *= 0.6; // holiday dip
      const plat = p.cpw > 1 ? p.platforms[c % p.platforms.length] : p.platforms[w % p.platforms.length];
      const wk = Math.floor((d - Date.UTC(dt.getUTCFullYear(), 0, 1)) / (7 * DAY)) + 1;
      const fresh = p.newPayerLastWeeks !== undefined && w >= p.weeks - p.newPayerLastWeeks;
      const payer = fresh ? NEW_PAYER : PAYER_ID[plat];
      rows.push({ date: d, type: "CR", amt: Math.round(a), payer, narr: `UPI/${payer}/${plat} PAYOUT WK${wk}` });
    }
    rows.push({
      date: ws + 2 * DAY,
      type: "DR",
      amt: 300 + Math.round(r() * 2200),
      payer: "",
      narr: SPEND[Math.floor(r() * SPEND.length)],
    });
  }
  // A few small transfers from friends. They never count as income.
  const r2 = rng(p.seed + 999);
  const first = END - (p.weeks - 1) * 7 * DAY;
  for (let k = 0; k < FRIENDS.length; k++) {
    const payer = `${FRIENDS[k]}@okaxis`;
    rows.push({
      date: first + Math.floor(r2() * p.weeks) * 7 * DAY + DAY,
      type: "CR",
      amt: 500 + Math.round(r2() * 2500),
      payer,
      narr: `UPI/${payer}/FROM FRIEND`,
    });
  }
  return rows.sort((a, b) => b.date - a.date);
}

export function derive(rows: RawRow[], isCounted: (row: RawRow) => boolean): Derived {
  const cr = rows.filter((x) => x.type === "CR" && isCounted(x));
  if (cr.length === 0) return { t: 0, p: 0, m: 0, i: 0, n: 0, first: 0, last: 0 };
  const ds = cr.map((x) => x.date);
  const first = Math.min(...ds);
  const last = Math.max(...ds);
  const t = Math.floor((last - first) / (30.44 * DAY));
  const weeks = new Set(cr.map((x) => Math.floor((x.date - first) / (7 * DAY))));
  const span = Math.floor((last - first) / (7 * DAY)) + 1;
  const total = cr.reduce((s, x) => s + x.amt, 0);
  return { t, p: weeks.size, m: span - weeks.size, i: Math.round(total / Math.max(t, 1)), n: cr.length, first, last };
}
