// How the mock bank generates each worker's three years of payouts.
// The real backend keeps its own history in backend/data/profiles.json. Delete this folder when it is ready.

export interface GenProfile {
  platforms: string[]; // payout platforms, uppercase codes
  cpw: number; // payout credits per week
  range: [number, number]; // rupees per credit
  weeks: number; // weeks of history
  seed: number;
  gap?: [number, number]; // week range with no payouts
  newPayerLastWeeks?: number; // last N weeks arrive from a payer id not in the registry
}

export const GEN: Record<number, GenProfile> = {
  1: { platforms: ["SWIGGY"], cpw: 1, range: [3500, 5500], weeks: 156, seed: 11, newPayerLastWeeks: 6 },
  2: { platforms: ["UBER", "OLA"], cpw: 1, range: [5000, 9000], weeks: 156, seed: 22 },
  3: { platforms: ["UBER"], cpw: 1, range: [6000, 9000], weeks: 156, seed: 33, gap: [60, 73] },
  4: { platforms: ["URBANCO"], cpw: 1, range: [3500, 7500], weeks: 36, seed: 44 },
  5: { platforms: ["PORTER"], cpw: 2, range: [2200, 5000], weeks: 130, seed: 55 },
  6: { platforms: ["SWIGGY", "ZOMATO"], cpw: 2, range: [2000, 3000], weeks: 156, seed: 66 },
  7: { platforms: ["ZOMATO"], cpw: 1, range: [1200, 2000], weeks: 10, seed: 77, gap: [4, 7] },
};
