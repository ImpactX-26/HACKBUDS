// The only file screens call for data. It talks to the mock now and the real backend later.
// Switch with NEXT_PUBLIC_USE_MOCKS in app/.env.local (true or false). No screen changes.

import type { Persona } from "./personas";
import { mockServer } from "./mock/server";
import {
  ApiError,
  type ConsentArtefact,
  type FiResponse,
  type IssueRequest,
  type IssueResponse,
  type Passport,
  type PayRequest,
  type PayResponse,
  type RegistryEntry,
  type RolesDto,
} from "./types";

const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS !== "false";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export const usingMocks = USE_MOCKS;

// Plain sentences for errors where the backend sends only a code.
const FRIENDLY: Record<string, string> = {
  nullifier_used: "This Aadhaar already has a passport. One human, one passport.",
  proof_invalid: "The proof was not accepted.",
  issuer_key_mismatch: "The bank stamp was made with a key we do not recognise.",
  passport_not_found: "No passport with that number.",
};

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError("network", "Could not reach the server. Check the backend is running.");
  }
  const body: unknown = await res.json().catch(() => null);
  const b = body as { ok?: boolean; error?: string; message?: string } | null;
  if (!res.ok || (b && b.ok === false)) {
    const code = b?.error ?? `http_${res.status}`;
    throw new ApiError(code, b?.message ?? FRIENDLY[code] ?? "The request failed.");
  }
  return body as T;
}

const post = <T>(path: string, data: unknown): Promise<T> =>
  http<T>(path, { method: "POST", body: JSON.stringify(data) });

export const api = {
  async personas(): Promise<Persona[]> {
    if (USE_MOCKS) return mockServer.personas();
    const r = await http<{ personas: Persona[] }>("/personas");
    return r.personas;
  },

  async roles(): Promise<RolesDto> {
    return USE_MOCKS ? mockServer.roles() : http<RolesDto>("/roles");
  },

  async createConsent(personaId: number): Promise<ConsentArtefact> {
    if (USE_MOCKS) return mockServer.createConsent(personaId);
    return post<ConsentArtefact>("/consent/create", { personaId, purpose: "income check", rangeMonths: 36 });
  },

  async approveConsent(consentId: string): Promise<ConsentArtefact> {
    if (USE_MOCKS) return mockServer.approveConsent(consentId);
    return post<ConsentArtefact>("/consent/approve", { consentId });
  },

  async fiFetch(consentId: string): Promise<FiResponse> {
    if (USE_MOCKS) return mockServer.fiFetch(consentId);
    return http<FiResponse>(`/fi/fetch?consentId=${encodeURIComponent(consentId)}`);
  },

  async registry(): Promise<RegistryEntry[]> {
    if (USE_MOCKS) return mockServer.registry();
    const r = await http<{ entries: RegistryEntry[] }>("/registry");
    return r.entries;
  },

  async addPayer(platform: string, payer: string, from: string): Promise<RegistryEntry> {
    if (USE_MOCKS) return mockServer.addPayer(platform, payer, from);
    return post<RegistryEntry>("/registry/add", { platform, payer, from });
  },

  async issuePassport(req: IssueRequest): Promise<IssueResponse> {
    if (USE_MOCKS) return mockServer.issue(req);
    return post<IssueResponse>("/relay/issue", req);
  },

  async getPassport(id: number): Promise<Passport> {
    if (USE_MOCKS) return mockServer.getPassport(id);
    return http<Passport>(`/passport/${id}`);
  },

  // On the real chain the owner calls revoke(tokenId) from the wallet. Over HTTP this is a convenience.
  async revokePassport(id: number): Promise<Passport> {
    if (USE_MOCKS) return mockServer.revoke(id);
    return post<Passport>(`/passport/${id}/revoke`, {});
  },

  async pay(req: PayRequest): Promise<PayResponse> {
    if (USE_MOCKS) return mockServer.pay(req);
    return post<PayResponse>("/pay", req);
  },

  async reset(): Promise<void> {
    if (USE_MOCKS) return mockServer.reset();
    await post<unknown>("/demo/reset", {});
  },

};
