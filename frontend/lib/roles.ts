// Schema only. The thresholds themselves come from the backend (GET /roles) through lib/api.ts.
// While mocks are on, the numbers live in lib/mock/data.ts.

export type RoleKey = "food" | "cab" | "home" | "goods";

export const ROLE_KEYS: RoleKey[] = ["food", "cab", "home", "goods"];

export interface Bar {
  minTenure: number; // months
  minPeriods: number; // weeks with at least one credit
  maxMissed: number; // weeks with none
  minIncome: number; // rupees per month
}
