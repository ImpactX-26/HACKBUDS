"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import QrImage from "@/components/QrImage";
import { api } from "@/lib/api";
import { useLang } from "@/lib/lang";
import { makePayload, QR_LIFETIME_MS } from "@/lib/qr";
import { useSession } from "@/lib/session";
import { getWallet } from "@/lib/wallet";
import { ApiError, type Passport } from "@/lib/types";

export default function Show() {
  const { t } = useLang();
  const { ready, passport, personaId, update } = useSession();
  const router = useRouter();

  const [card, setCard] = useState<Passport | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [exp, setExp] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passportId = passport?.passportId ?? null;

  useEffect(() => {
    if (ready && !passport) router.replace("/proof");
  }, [ready, passport, router]);

  useEffect(() => {
    if (passportId === null) return;
    api.getPassport(passportId).then(setCard).catch((e: unknown) => setError(e instanceof ApiError ? e.message : t("loadError")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passportId]);

  const make = useCallback(async () => {
    if (!card || personaId === null) return;
    const payload = await makePayload(await getWallet(personaId), card);
    const compact = JSON.stringify(payload);
    setText(compact);
    setExp(payload.exp);
    setNow(Date.now());
    setCopied(false);
    update({ qr: compact });
  }, [card, personaId, update]);

  // Make the first QR as soon as the passport has loaded.
  useEffect(() => {
    if (card && !text) void make();
  }, [card, text, make]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  async function copy() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      /* clipboard can be blocked. The text is shown below to copy by hand. */
    }
  }

  if (!passport) return null;

  const left = Math.max(0, Math.ceil((exp - now) / 1000));
  const expired = text !== null && left === 0;
  const pct = Math.max(0, Math.min(100, ((exp - now) / QR_LIFETIME_MS) * 100));

  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  const qrUrl = text ? `${origin}/verify?data=${encodeURIComponent(text)}` : "";

  return (
    <main className="wrap stack" style={{ gap: 24 }}>
      {/* Header section */}
      <section className="stack" style={{ gap: 8 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(2, 132, 199, 0.12)", border: "1px solid rgba(2, 132, 199, 0.25)", padding: "4px 12px", borderRadius: 999, width: "fit-content", color: "#0284c7", fontSize: 13, fontWeight: 700 }}>
          <span>📱 Step 8 of 9</span>
          <span>•</span>
          <span>Share Proof</span>
        </div>
        <h1 style={{ fontSize: "2.2rem", fontWeight: 800, color: "#0f172a", margin: 0 }}>
          {t("showTitle")}
        </h1>
        <p style={{ color: "#475569", fontSize: "1.05rem", margin: 0, maxWidth: 640 }}>
          {t("showIntro")}
        </p>
      </section>

      {error && (
        <div style={{ background: "rgba(225, 29, 72, 0.1)", border: "1px solid rgba(225, 29, 72, 0.3)", borderRadius: 12, padding: "12px 16px", color: "#be123c", fontWeight: 600 }}>
          ⚠️ {error}
        </div>
      )}

      {/* Main QR Card */}
      <section className="card" style={{ alignItems: "center", gap: 20, padding: 28, background: "rgba(255, 255, 255, 0.95)", boxShadow: "0 10px 30px rgba(2, 132, 199, 0.08)", border: "1px solid rgba(255, 255, 255, 0.8)", borderRadius: 20 }}>
        <div style={{ 
          background: "#ffffff", 
          padding: 20, 
          borderRadius: 20, 
          border: expired ? "2px solid #f43f5e" : "2px solid #0284c7", 
          boxShadow: expired ? "0 0 20px rgba(244, 63, 94, 0.2)" : "0 0 25px rgba(2, 132, 199, 0.15)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center"
        }}>
          {qrUrl ? (
            <QrImage text={qrUrl} size={240} dim={expired} label={t("showTitle")} />
          ) : (
            <div style={{ width: 240, height: 240, display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
              ⏳ {t("loading")}
            </div>
          )}
        </div>

        {text && (
          <div className="stack" style={{ gap: 8, width: "100%", maxWidth: 360, alignItems: "center" }}>
            <div className="bar" style={{ height: 10, borderRadius: 999, background: "#e2e8f0", overflow: "hidden", width: "100%" }}>
              <i style={{ 
                height: "100%", 
                display: "block", 
                width: `${pct}%`, 
                background: expired ? "#f43f5e" : left <= 10 ? "#f59e0b" : "linear-gradient(90deg, #10b981, #0284c7)",
                transition: "width 0.5s ease-out" 
              }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.95rem", fontWeight: 700, color: expired ? "#be123c" : "#0284c7" }} role="status">
              <span>⏱️</span>
              <span>{expired ? t("showExpired") : t("showExpires", { s: left })}</span>
            </div>
          </div>
        )}

        <div className="row" style={{ width: "100%", justifyContent: "center", gap: 12, marginTop: 8 }}>
          <button className="btn" onClick={() => void make()} disabled={!card} style={{ minWidth: 160 }}>
            🔄 {t("showMake")}
          </button>
          <Link href={text ? `/verify?data=${encodeURIComponent(text)}` : "/verify"} target="_blank" rel="noopener noreferrer" className="btn alt linkbtn" style={{ minWidth: 180, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <span>🏢</span>
            <span>{t("showOpenLender")} ↗</span>
          </Link>
        </div>
      </section>

      {/* Payload Details Collapsible */}
      {text && (
        <details className="card" style={{ background: "rgba(255, 255, 255, 0.9)", border: "1px solid rgba(226, 232, 240, 0.8)", borderRadius: 16, padding: 16 }}>
          <summary style={{ fontWeight: 700, color: "#0f172a", cursor: "pointer", fontSize: "1rem" }}>
            🔍 {t("showPayload")} (Inspect Raw Signed Proof)
          </summary>
          <div className="stack" style={{ gap: 12, marginTop: 12 }}>
            <pre style={{ 
              background: "#0f172a", 
              color: "#38bdf8", 
              padding: 16, 
              borderRadius: 12, 
              fontSize: "0.85rem", 
              overflowX: "auto",
              maxHeight: 280
            }}>
              {JSON.stringify(JSON.parse(text), null, 2)}
            </pre>
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button className="btn alt" onClick={copy} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span>{copied ? "✓" : "📋"}</span>
                <span>{copied ? t("showCopied") : t("showCopy")}</span>
              </button>
            </div>
          </div>
        </details>
      )}

      {/* Navigation Footer */}
      <div className="row" style={{ justifyContent: "flex-start", marginTop: 8 }}>
        <Link href="/passport" className="btn alt linkbtn" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span>←</span>
          <span>{t("back")}</span>
        </Link>
      </div>
    </main>
  );
}
