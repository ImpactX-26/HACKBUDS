// A fake backend that lives in memory. Same inputs and outputs as the real endpoints.
// State resets when the page reloads. Call it only from client components.

import type { Persona } from "../personas";
import {
  ApiError,
  type BankRow,
  type ConsentArtefact,
  type FiResponse,
  type IssueRequest,
  type IssueResponse,
  type Passport,
  type PayRequest,
  type PayResponse,
  type RegistryEntry,
  type RolesDto,
  type UnidentifiedPayer,
} from "../types";
import { PERSONAS, ROLES } from "./data";
import { GEN } from "./profiles";
import { DAY, PAYER_ID, derive, genRows, type RawRow } from "./seed";
import type { ScoreBand } from "../score";
import { sha, stampFor } from "./stamp";


interface RegEntry {
  platform: string;
  payer: string;
  from: number; // ms
}

const CONSENT_MINUTES = 15;
const ISSUER_KEY_ID = "ab12cd34";

let consents = new Map<string, ConsentArtefact>();
let registry: RegEntry[] = [];
let counter = 1;
let passports = new Map<number, Passport>();
let usedNullifiers = new Map<string, number>();
let nextPassport = 1001;

const randomHex = (bytes: number): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(bytes)))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");

function resetRegistry(): void {
  registry = Object.entries(PAYER_ID).map(([platform, payer]) => ({ platform, payer, from: 0 }));
}
resetRegistry();

const day = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const isCounted = (row: RawRow): boolean => registry.some((g) => g.payer === row.payer && row.date >= g.from);

function persona(id: number): Persona {
  const p = PERSONAS.find((x) => x.id === id);
  if (!p) throw new ApiError("persona_not_found", `No worker with id ${id}.`);
  return p;
}

const STORAGE_KEY = "gigvault_mock_server_v1";

interface SerializedState {
  consents: [string, ConsentArtefact][];
  counter: number;
  passports: [number, Passport][];
  usedNullifiers: [string, number][];
  nextPassport: number;
}

function saveState(): void {
  if (typeof window === "undefined") return;
  try {
    const data: SerializedState = {
      consents: Array.from(consents.entries()),
      counter,
      passports: Array.from(passports.entries()),
      usedNullifiers: Array.from(usedNullifiers.entries()),
      nextPassport,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

function loadState(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw) as SerializedState;
    if (data.consents && data.consents.length > 0) consents = new Map(data.consents);
    if (typeof data.counter === "number") counter = data.counter;
    if (data.passports && data.passports.length > 0) passports = new Map(data.passports);
    if (data.usedNullifiers && data.usedNullifiers.length > 0) usedNullifiers = new Map(data.usedNullifiers);
    if (typeof data.nextPassport === "number") nextPassport = data.nextPassport;
  } catch {}
}

export const mockServer = {
  personas(): Persona[] {
    return PERSONAS;
  },

  roles(): RolesDto {
    return structuredClone(ROLES);
  },

  createConsent(personaId: number): ConsentArtefact {
    loadState();
    persona(personaId);
    const now = Date.now();
    const c: ConsentArtefact = {
      consentId: `CNS-${(counter++).toString(16).toUpperCase().padStart(6, "0")}`,
      personaId,
      purpose: "income check",
      from: new Date(now - 3 * 365 * DAY).toISOString(),
      to: new Date(now).toISOString(),
      expiresAt: new Date(now + CONSENT_MINUTES * 60000).toISOString(),
      status: "pending",
      simulated: true,
    };
    consents.set(c.consentId, c);
    saveState();
    return { ...c };
  },

  approveConsent(consentId: string): ConsentArtefact {
    loadState();
    const c = consents.get(consentId);
    if (!c) throw new ApiError("consent_not_found", "That consent does not exist.");
    c.status = "approved";
    c.approvedAt = new Date().toISOString();
    saveState();
    return { ...c };
  },

  async fiFetch(consentId: string): Promise<FiResponse> {
    loadState();
    const c = consents.get(consentId);
    if (!c) throw new ApiError("consent_not_found", "That consent does not exist.");
    if (c.status !== "approved") throw new ApiError("consent_not_approved", "The worker has not approved sharing yet.");
    if (Date.now() > Date.parse(c.expiresAt)) throw new ApiError("consent_expired", "The permission has expired. Ask the worker to approve again.");

    const p = persona(c.personaId);
    const raw = genRows(GEN[p.id]);

    const rows: BankRow[] = raw.map((x) => {
      const counted = x.type === "CR" && isCounted(x);
      return {
        date: day(x.date),
        type: x.type,
        amount: x.amt,
        payer: x.payer,
        narration: x.narr,
        counted,
        reason: x.type === "DR" ? "spending" : counted ? null : "payer_not_in_registry",
      };
    });

    const groups = new Map<string, UnidentifiedPayer>();
    for (const x of raw) {
      if (x.type !== "CR" || isCounted(x)) continue;
      const g = groups.get(x.payer) ?? { payer: x.payer, credits: 0, total: 0 };
      g.credits += 1;
      g.total += x.amt;
      groups.set(x.payer, g);
    }

    const platformCodes = GEN[p.id].platforms;
    const known = registry.filter((g) => platformCodes.includes(g.platform)).map((g) => g.payer);

    const d = derive(raw, isCounted);
    const summary = {
      tenureMonths: d.t,
      periodsPaid: d.p,
      missedPeriods: d.m,
      monthlyIncome: d.i,
    };

    const holderHash = "0x" + (await sha(`holder:${p.id}${p.aadhaarLast4}`));
    const issuerSignature = await stampFor(summary, holderHash);

    return {
      simulated: true,
      consentId,
      maskedAccount: p.maskedAccount,
      rows,
      payers: { known, unidentified: Array.from(groups.values()) },
      summary,
      holderHash,
      issuerSignature,
      issuerKeyId: ISSUER_KEY_ID,
    };
  },

  registry(): RegistryEntry[] {
    return registry.map((g) => ({ platform: g.platform, payer: g.payer, from: day(g.from) }));
  },

  addPayer(platform: string, payer: string, from: string): RegistryEntry {
    const ms = Date.parse(from);
    if (Number.isNaN(ms)) throw new ApiError("bad_date", "The start date is not a valid date.");
    registry.push({ platform, payer, from: ms });
    return { platform, payer, from: day(ms) };
  },

  issue(req: IssueRequest): IssueResponse {
    loadState();
    const prev = usedNullifiers.get(req.nullifier);
    if (prev !== undefined) {
      throw new ApiError("nullifier_used", `This Aadhaar already has passport #${prev}. One human, one passport.`);
    }
    const band: ScoreBand = (req.band as ScoreBand) ?? (req.publicSignals[0] as ScoreBand) ?? "Strong";
    const commitment = req.publicSignals[1] ?? req.publicSignals[4] ?? "0x0";
    const id = nextPassport++;
    const now = Date.now();
    const txHash = "0x" + randomHex(32);
    passports.set(id, {
      passportId: id,
      owner: req.owner,
      commitment,
      role: req.role,
      band,
      provenMinTenure: 24,
      provenMinPeriods: 100,
      provenMaxMissed: 0,
      provenMinIncome: 30000,
      issuedAt: new Date(now).toISOString(),
      expiry: new Date(now + 365 * DAY).toISOString(),
      revoked: false,
      txHash,
    });
    usedNullifiers.set(req.nullifier, id);
    saveState();
    return { ok: true, passportId: id, txHash, commitment };
  },


  getPassport(id: number): Passport {
    loadState();
    const p = passports.get(id);
    if (!p) {
      return {
        passportId: id || 1001,
        owner: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        holderWallet: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        commitment: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        role: "food",
        band: "Strong",
        provenMinTenure: 34,
        provenMinPeriods: 150,
        provenMaxMissed: 0,
        provenMinIncome: 1940200,
        issuedAt: new Date().toISOString(),
        expiry: new Date(Date.now() + 365 * 86400000).toISOString(),
        revoked: false,
        txHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
      };
    }
    return { ...p };
  },

  revoke(id: number): Passport {
    loadState();
    const p = passports.get(id);
    if (!p) throw new ApiError("passport_not_found", "No passport with that number.");
    p.revoked = true;
    saveState();
    return { ...p };
  },

  pay(req: PayRequest): PayResponse {
    loadState();
    const p = passports.get(req.passportId);
    if (!p) throw new ApiError("passport_not_found", "No passport with that number.");
    return {
      ok: true,
      receiptId: "RCP-" + randomHex(8).toUpperCase(),
      txHash: "0x" + randomHex(32),
      timestamp: new Date().toISOString(),
    };
  },


  reset(): void {
    consents = new Map();
    counter = 1;
    passports = new Map();
    usedNullifiers = new Map();
    nextPassport = 1001;
    resetRegistry();
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem(STORAGE_KEY);
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k?.startsWith("gigvault_wallet_key_")) {
            localStorage.removeItem(k);
          }
        }
      } catch {}
    }
  },
};

