// Stand-in for the issuer's EdDSA signature, and for the circuit's check of it. Mock only.
// The real backend signs with a BabyJubJub key and the circuit verifies it.

import type { IssuerSignature, Summary } from "../types";

export async function sha(s: string): Promise<string> {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

export const canonical = (s: Summary, holderHash: string): string =>
  `${s.tenureMonths}|${s.periodsPaid}|${s.missedPeriods}|${s.monthlyIncome}|${holderHash}`;

export async function stampFor(s: Summary, holderHash: string): Promise<IssuerSignature> {
  const c = canonical(s, holderHash);
  return { R8x: await sha(c + "|R8x"), R8y: await sha(c + "|R8y"), S: await sha(c + "|S") };
}

export async function stampMatches(s: Summary, holderHash: string, sig: IssuerSignature): Promise<boolean> {
  const e = await stampFor(s, holderHash);
  return e.R8x === sig.R8x && e.R8y === sig.R8y && e.S === sig.S;
}
