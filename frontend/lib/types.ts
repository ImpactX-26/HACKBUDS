// Shapes returned by the backend. They match gigvault-api-contract.md.
// If the backend changes a field, change it here first and the compiler shows every screen it breaks.

import type { RoleKey } from "./roles";
import type { ScoreBand } from "./score";

export interface ConsentArtefact {

  consentId: string;
  personaId: number;
  purpose: string;
  from: string; // ISO
  to: string; // ISO
  expiresAt: string; // ISO
  status: "pending" | "approved";
  approvedAt?: string; // ISO
  simulated: boolean;
}

export type RowReason = "payer_not_in_registry" | "spending" | null;

export interface BankRow {
  date: string; // YYYY-MM-DD
  type: "CR" | "DR";
  amount: number;
  payer: string;
  narration: string;
  counted: boolean;
  reason: RowReason;
}

export interface UnidentifiedPayer {
  payer: string;
  credits: number;
  total: number;
}

export interface Summary {
  tenureMonths: number;
  periodsPaid: number;
  missedPeriods: number;
  monthlyIncome: number;
}

export interface IssuerSignature {
  R8x: string;
  R8y: string;
  S: string;
}

export interface FiResponse {
  simulated: boolean;
  consentId: string;
  maskedAccount: string;
  rows: BankRow[];
  payers: { known: string[]; unidentified: UnidentifiedPayer[] };
  summary: Summary;
  holderHash: string;
  issuerSignature: IssuerSignature;
  issuerKeyId: string;
}

export interface RegistryEntry {
  platform: string;
  payer: string;
  from: string; // YYYY-MM-DD
}

export interface RoleBarDto {
  label: string;
  minTenure: number;
  minPeriods: number;
  maxMissed: number;
  minIncome: number;
  reader: string; // who usually reads this passport
}

export type RolesDto = Record<RoleKey, RoleBarDto>;

export class ApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

// ---- Issuing and reading passports ----

export interface Groth16Proof {
  a: [string, string];
  b: [[string, string], [string, string]];
  c: [string, string];
}

// publicSignals order: band, commitment, holderHash
export interface IssueRequest {
  proof: Groth16Proof;
  publicSignals: string[];
  nullifier: string;
  role: RoleKey;
  owner: string;
  band?: ScoreBand;
}

export interface IssueResponse {
  ok: true;
  passportId: number;
  txHash: string;
  commitment: string;
}

export interface Passport {
  passportId: number;
  owner: string;
  holderWallet?: string;
  commitment: string;
  role: RoleKey;
  band: ScoreBand;
  provenMinTenure: number;
  provenMinPeriods: number;
  provenMaxMissed: number;
  provenMinIncome: number;
  issuedAt: string; // ISO
  expiry: string; // ISO
  revoked: boolean;
  txHash?: string;
}

export interface PayRequest {
  passportId: number;
  verifier: string;
  band: ScoreBand | "A" | "B" | "C" | "D" | "qr";
  amount?: number;
}

export interface PayResponse {
  ok: true;
  receiptId: string;
  txHash: string;
  timestamp: string;
}

