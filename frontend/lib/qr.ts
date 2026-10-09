import type { Passport } from "./types";
import { addressOfPublic, verifySignature, type Wallet } from "./wallet";
import type { ScoreBand } from "./score";

// The QR a worker shows and the checks a lender runs on it. Matches section 8 of the API contract.
// `pub` is mock-only: a real wallet signature lets the verifier recover the address without it.

export const QR_LIFETIME_MS = 60_000;

export interface QrPayload {
  pid: number;
  band: ScoreBand;
  ts: number;
  exp: number;
  sig: string;
  pub: string;
}

export const signedMessage = (pid: number, band: string, exp: number): string =>
  `${pid}|${band}|${exp}`;

export async function makePayload(wallet: Wallet, passport: Passport, now: number = Date.now()): Promise<QrPayload> {
  const band = passport.band ?? "Strong";
  const exp = now + QR_LIFETIME_MS;
  return {
    pid: passport.passportId,
    band,
    ts: now,
    exp,
    sig: await wallet.sign(signedMessage(passport.passportId, band, exp)),
    pub: wallet.publicHex,
  };
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function parsePayload(text: string): QrPayload | null {
  try {
    let raw = text.trim();
    if (raw.includes("/verify")) {
      const idx = raw.indexOf("data=");
      if (idx !== -1) {
        raw = decodeURIComponent(raw.slice(idx + 5));
      }
    }
    const o = JSON.parse(raw) as Partial<QrPayload> & { b?: string; ask?: { t?: number } } | null;
    if (!o || typeof o !== "object") return null;
    const band = (o.band ?? o.b ?? "Strong") as ScoreBand;
    if (!isNum(o.pid) || !isNum(o.ts) || !isNum(o.exp) || typeof o.sig !== "string" || typeof o.pub !== "string") return null;
    return { pid: o.pid, band, ts: o.ts, exp: o.exp, sig: o.sig, pub: o.pub };
  } catch {
    return null;
  }
}

export type QrCheckKey = "readable" | "exists" | "signature" | "fresh" | "notRevoked" | "notExpired" | "band";

export interface QrCheck {
  key: QrCheckKey;
  ok: boolean | null; // null = could not run because an earlier check failed
}

export interface QrResult {
  ok: boolean;
  checks: QrCheck[];
  firstFail: QrCheckKey | null;
  passport: Passport | null;
  payload: QrPayload | null;
  ms: number;
}

export function bandRank(b: string): number {
  if (b === "Strong" || b === "A") return 4;
  if (b === "Good" || b === "B") return 3;
  if (b === "Fair" || b === "C") return 2;
  if (b === "Weak" || b === "D") return 1;
  return 0;
}

export function isBandAtLeast(actual: string, required: string): boolean {
  return bandRank(actual) >= bandRank(required);
}

const ORDER: QrCheckKey[] = ["readable", "exists", "signature", "fresh", "notRevoked", "notExpired", "band"];

export async function checkPayload(
  text: string,
  requiredBand: ScoreBand | "qr" | "A" | "B" | "C" | "D",
  getPassport: (id: number) => Promise<Passport>,
  now: number = Date.now(),
): Promise<QrResult> {
  const t0 = performance.now();
  const result: Record<QrCheckKey, boolean | null> = { readable: null, exists: null, signature: null, fresh: null, notRevoked: null, notExpired: null, band: null };
  let passport: Passport | null = null;

  const payload = parsePayload(text);
  result.readable = payload !== null;

  if (payload) {
    try {
      passport = await getPassport(payload.pid);
      result.exists = true;
    } catch {
      result.exists = false;
    }
  }

  if (payload && passport) {
    const sigOk = await verifySignature(payload.pub, payload.sig, signedMessage(payload.pid, payload.band, payload.exp));
    const ownerOk = (await addressOfPublic(payload.pub)) === passport.owner;
    result.signature = sigOk && ownerOk;
    result.fresh = now < payload.exp;
    result.notRevoked = !passport.revoked;
    result.notExpired = now < Date.parse(passport.expiry);

    const wantBand = requiredBand === "qr" ? payload.band : requiredBand;
    const actualBand = passport.band ?? payload.band ?? "Strong";
    result.band = isBandAtLeast(actualBand, wantBand);
  }

  const checks = ORDER.map((key) => ({ key, ok: result[key] }));
  const firstFail = checks.find((c) => c.ok === false)?.key ?? null;
  return {
    ok: checks.every((c) => c.ok === true),
    checks,
    firstFail,
    passport,
    payload,
    ms: Math.max(1, Math.round(performance.now() - t0)),
  };
}

