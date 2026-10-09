import { calculateGigScore } from "../../contracts/integration/gig-score.mjs";

export interface ScoreInput {
  tenure: number; // months
  periods: number; // weeks paid
  missed: number; // missed weeks
  income: number; // rupees / month
  recentWeeks?: number; // optional paid weeks in recent 12 weeks (0-12)
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
  activity?: FactorScore;
  total: number; // integer 0-100
  mode: "three-factor" | "four-factor";
}

export type ScoreBand = "Strong" | "Good" | "Fair" | "Weak";

export function scoreParts(input: ScoreInput): ScorePartsResult {
  const tenureMonths = Math.max(0, Math.round(input.tenure));
  const weeksPaid = Math.max(0, Math.round(input.periods));
  const missedWeeks = Math.max(0, Math.round(input.missed));
  const rawIncomePaise = Math.max(0, Math.round((input.income || 0) * 100));
  const incomePaise = BigInt(rawIncomePaise).toString();
  const recentWeeks = input.recentWeeks !== undefined ? Math.min(12, Math.max(0, Math.round(input.recentWeeks))) : undefined;

  const res = calculateGigScore({
    tenureMonths,
    weeksPaid,
    missedWeeks,
    averageMonthlyIncomePaise: incomePaise,
    paidWeeksLast12Weeks: recentWeeks,
  });

  return {
    tenure: {
      score: res.components.tenure,
      weight: res.weights.tenure,
      points: res.components.tenure * res.weights.tenure,
    },
    consistency: {
      score: res.components.consistency,
      weight: res.weights.consistency,
      points: res.components.consistency * res.weights.consistency,
    },
    income: {
      score: res.components.income,
      weight: res.weights.income,
      points: res.components.income * res.weights.income,
    },
    activity: res.components.activity !== undefined && res.weights.activity !== undefined
      ? {
          score: res.components.activity,
          weight: res.weights.activity,
          points: res.components.activity * res.weights.activity,
        }
      : undefined,
    total: res.score,
    mode: res.mode as "three-factor" | "four-factor",
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
