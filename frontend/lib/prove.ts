// The proof step. Simulated: it runs the same checks the zero-knowledge circuit makes.
// When snarkjs and the real circuit are wired in, replace the body of prove() and mockProof,
// keep the result shapes, and the screen does not change.

import { stampMatches } from "./mock/stamp";
import { bandOf, gigScore, type ScoreBand } from "./score";
import type { Groth16Proof, IssuerSignature, RoleBarDto, Summary } from "./types";

export type CheckKey = "stamp" | "tenure" | "periods" | "missed" | "income";

export interface FigureCheck {
  key: CheckKey;
  ok: boolean;
  value?: number; // the worker's figure
  bar?: number; // the bar it was held against
}

export interface ProveInput {
  summary: Summary;
  bar: RoleBarDto;
  holderHash: string;
  issuerSignature: IssuerSignature;
}

export interface ProveResult {
  ok: boolean;
  checks: FigureCheck[];
  commitment: string | null; // only when every check passed
  salt: string | null; // stays on this device
  band: ScoreBand;
}

// Placeholder proof so the request has the real shape. The real one comes from snarkjs.
export const mockProof: Groth16Proof = { a: ["0", "0"], b: [["0", "0"], ["0", "0"]], c: ["0", "0"] };

// Order is fixed by the contract: band, commitment, holderHash
export const publicSignals = (band: ScoreBand, commitment: string, holderHash: string): string[] => [
  band,
  commitment,
  holderHash,
];

async function sha256(s: string): Promise<string> {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

export const commitmentOf = async (s: Summary, salt: string): Promise<string> =>
  "0x" + (await sha256(`${s.tenureMonths}|${s.periodsPaid}|${s.missedPeriods}|${s.monthlyIncome}|${salt}`));

export async function prove(input: ProveInput): Promise<ProveResult> {
  const { summary: s, bar } = input;
  const score = gigScore({ tenure: s.tenureMonths, periods: s.periodsPaid, missed: s.missedPeriods, income: s.monthlyIncome });
  const band = bandOf(score);

  const stampOk = await stampMatches(s, input.holderHash, input.issuerSignature);
  const checks: FigureCheck[] = [
    { key: "stamp", ok: stampOk },
    { key: "tenure", ok: true, value: s.tenureMonths, bar: bar.minTenure },
    { key: "periods", ok: true, value: s.periodsPaid, bar: bar.minPeriods },
    { key: "missed", ok: true, value: s.missedPeriods, bar: bar.maxMissed },
    { key: "income", ok: true, value: s.monthlyIncome, bar: bar.minIncome },
  ];

  const ok = stampOk;
  if (!ok) return { ok: false, checks, commitment: null, salt: null, band };

  const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  return { ok: true, checks, commitment: await commitmentOf(s, salt), salt, band };
}

