import type { ScoreBand } from "./score";

export const SCORE_CAPS = {
  tenureMonths: 24,
  monthlyIncome: 30000,
} as const;

export const SCORE_WEIGHTS = {
  tenure: 0.25,
  consistency: 0.35,
  income: 0.40,
} as const;

export const SCORE_DISCLAIMER =
  "Credit-assessment signal for gig workers, not a replacement for a regulated credit score.";

export interface LoanOfferDetails {
  maxAmount: number;
  annualRatePct: number;
  maxMonths: number;
  offered: boolean;
}

export const LOAN_OFFERS: Record<ScoreBand, LoanOfferDetails> = {
  Strong: { maxAmount: 50000, annualRatePct: 12, maxMonths: 24, offered: true },
  Good: { maxAmount: 30000, annualRatePct: 16, maxMonths: 18, offered: true },
  Fair: { maxAmount: 10000, annualRatePct: 22, maxMonths: 12, offered: true },
  Weak: { maxAmount: 0, annualRatePct: 0, maxMonths: 0, offered: false },
};

export function calculateEmi(principal: number, annualRatePct: number, months: number): number {
  if (months <= 0 || principal <= 0) return 0;
  if (annualRatePct <= 0) return Math.round(principal / months);
  const r = annualRatePct / 12 / 100;
  const factor = Math.pow(1 + r, months);
  const emi = principal * r * (factor / (factor - 1));
  return Math.round(emi);
}

