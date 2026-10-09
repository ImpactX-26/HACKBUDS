"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { RoleKey } from "./roles";
import type { ConsentArtefact, IssuerSignature, Summary } from "./types";

// What the worker has chosen so far. Survives a refresh within the same tab.
// Note: with mocks on, the fake bank forgets consents on refresh. The record screen handles that.

const STORE = "gigvault.session";

// The four figures and the bank's stamp. The bank rows themselves are never saved.
export interface RecordSummary {
  consentId: string;
  summary: Summary;
  holderHash: string;
  issuerSignature: IssuerSignature;
  issuerKeyId: string;
}

// Last four digits for display and the nullifier. Nothing else from the Aadhaar scan is kept.
export interface BindResult {
  last4: string;
  nullifier: string;
}

// What the passport screen needs. The salt never leaves this device.
export interface PassportRef {
  passportId: number;
  txHash: string;
  salt: string;
}

export interface SessionData {
  loggedIn: boolean;
  role: RoleKey | null;
  personaId: number | null;
  consent: ConsentArtefact | null;
  record: RecordSummary | null;
  bind: BindResult | null;
  passport: PassportRef | null;
  qr: string | null; // the QR contents last shown on this device
}

const EMPTY: SessionData = { loggedIn: false, role: null, personaId: null, consent: null, record: null, bind: null, passport: null, qr: null };

interface SessionValue extends SessionData {
  ready: boolean; // false until the saved session has been read
  update: (patch: Partial<SessionData>) => void;
  reset: () => void;
}

const Ctx = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<SessionData>(EMPTY);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORE);
      if (raw) setData({ ...EMPTY, ...(JSON.parse(raw) as Partial<SessionData>) });
    } catch {
      /* start empty */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      sessionStorage.setItem(STORE, JSON.stringify(data));
    } catch {
      /* ignore */
    }
  }, [data, ready]);

  const update = useCallback((patch: Partial<SessionData>) => setData((s) => ({ ...s, ...patch })), []);
  const reset = useCallback(() => setData(EMPTY), []);
  const value = useMemo(() => ({ ...data, ready, update, reset }), [data, ready, update, reset]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession must be used inside SessionProvider");
  return v;
}
