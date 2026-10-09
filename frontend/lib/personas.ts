import type { RoleKey } from "./roles";
import type { ScoreBand } from "./score";

// Schema only. The workers come from the backend (GET /personas) through lib/api.ts.
// While mocks are on, the six demo workers live in lib/mock/data.ts.

export interface Persona {
  id: number;
  name: string;
  nameKn: string;
  role: RoleKey;
  platforms: string[];
  city: string;
  maskedAccount: string;
  aadhaarLast4: string;
  expected: ScoreBand;
  why?: string; // demo note for the stage, mock only
}

