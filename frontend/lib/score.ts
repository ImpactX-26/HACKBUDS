import { SCORE_CAPS, SCORE_WEIGHTS } from "./constants";

export interface ScoreInput {
  tenure: number; // months
  periods: number; // weeks paid
  missed: number; // missed weeks
  income: number; // rupees / month
}

export interface FactorScore {
  score: number; // 0-100 factor score
  weight: number; // weight coefficient (e.g. 0.25)
  points: number; // weighted points (score * weight)
}

export interface ScorePartsResult {
  tenure: FactorScore;
  consistency: FactorScore;
  income: FactorScore;
  total: number; // integer 0-100
}

export type ScoreBand = "Strong" | "Good" | "Fair" | "Weak";

export function scoreParts(input: ScoreInput): ScorePartsResult {
  const tenure = Math.max(0, input.tenure);
  const periods = Math.max(0, input.periods);
  const missed = Math.max(0, input.missed);
  const income = Math.max(0, input.income);

  // tenureScore = min(tenure / 24, 1) * 100
  const tenureScore = Math.min(tenure / SCORE_CAPS.tenureMonths, 1) * 100;

  // consistencyScore = periods / (periods + missed) * 100 (if periods + missed is 0, use 0)
  const totalWeeks = periods + missed;
  const consistencyScore = totalWeeks > 0 ? (periods / totalWeeks) * 100 : 0;

  // incomeScore = min(income / 30000, 1) * 100
  const incomeScore = Math.min(income / SCORE_CAPS.monthlyIncome, 1) * 100;

  // Weighted points
  const tenurePoints = SCORE_WEIGHTS.tenure * tenureScore;
  const consistencyPoints = SCORE_WEIGHTS.consistency * consistencyScore;
  const incomePoints = SCORE_WEIGHTS.income * incomeScore;

  // gigScore = 0.25 * tenureScore + 0.35 * consistencyScore + 0.40 * incomeScore
  const rawScore = tenurePoints + consistencyPoints + incomePoints;
  const total = Math.min(100, Math.max(0, Math.round(rawScore)));

  return {
    tenure: {
      score: tenureScore,
      weight: SCORE_WEIGHTS.tenure,
      points: tenurePoints,
    },
    consistency: {
      score: consistencyScore,
      weight: SCORE_WEIGHTS.consistency,
      points: consistencyPoints,
    },
    income: {
      score: incomeScore,
      weight: SCORE_WEIGHTS.income,
      points: incomePoints,
    },
    total,
  };
}

export function gigScore(input: ScoreInput): number {
  return scoreParts(input).total;
}

export function bandOf(score: number): ScoreBand {
  if (score >= 80) return "Strong";
  if (score >= 60) return "Good";
  if (score >= 40) return "Fair";
  return "Weak";
}

export function partsOf(input: ScoreInput): ScorePartsResult {
  return scoreParts(input);
}

