"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useLang } from "@/lib/lang";
import type { Persona } from "@/lib/personas";
import { useSession } from "@/lib/session";
import { ApiError } from "@/lib/types";

const DAY = 864e5;
const fmt = (ms: number) => new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export default function Consent() {
  const { t, lang } = useLang();
  const { ready, personaId, update } = useSession();
  const router = useRouter();
  const [persona, setPersona] = useState<Persona | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready && personaId === null) router.replace("/role");
  }, [ready, personaId, router]);

  useEffect(() => {
    if (personaId === null) return;
    api.personas().then((all) => setPersona(all.find((p) => p.id === personaId) ?? null)).catch(() => setError(t("loadError")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personaId]);

  async function approve() {
    if (!persona) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.createConsent(persona.id);
      const approved = await api.approveConsent(created.consentId);
      update({ consent: approved });
      router.push("/record");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("loadError"));
      setBusy(false);
    }
  }

  if (personaId === null) return null;
  const now = Date.now();

  return (
    <main className="wrap stack" style={{ gap: 32 }}>
      {/* Header Section */}
      <section className="stack" style={{ gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{
            background: "rgba(2, 132, 199, 0.15)",
            color: "#0284c7",
            padding: "6px 14px",
            borderRadius: "9999px",
            fontSize: "13px",
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            gap: "6px"
          }}>
            🛡️ Account Aggregator Authorization
          </span>
        </div>

        <h1 style={{ fontSize: "clamp(26px, 4vw, 36px)", margin: 0 }}>
          {t("consentTitle")}
        </h1>

        {persona && (
          <p className="muted" style={{ fontSize: "16px" }}>
            Authorizing account data for <strong>{lang === "kn" ? persona.nameKn : persona.name}</strong> ({persona.city})
          </p>
        )}
      </section>

      {!persona && !error && <p className="muted">{t("loading")}</p>}

      {persona && (
        <section className="stack" style={{ gap: 20 }}>
          {/* Structured 4-Card Permission Details */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "16px"
          }}>
            {/* Card 1: Requested Account */}
            <div style={{
              background: "rgba(255, 255, 255, 0.9)",
              border: "1px solid rgba(186, 230, 253, 0.8)",
              borderRadius: "14px",
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              boxShadow: "0 4px 16px rgba(0,0,0,0.03)"
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span className="muted" style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>{t("consentAsked")}</span>
                <span style={{ fontSize: "16px" }}>🏦</span>
              </div>
              <strong style={{ fontSize: "17px", color: "#0f172a" }}>
                {t("consentAskedValue", { account: persona.maskedAccount })}
              </strong>
              <span className="small muted">Read-only account statement</span>
            </div>

            {/* Card 2: Purpose */}
            <div style={{
              background: "rgba(255, 255, 255, 0.9)",
              border: "1px solid rgba(186, 230, 253, 0.8)",
              borderRadius: "14px",
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              boxShadow: "0 4px 16px rgba(0,0,0,0.03)"
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span className="muted" style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>{t("consentPurpose")}</span>
                <span style={{ fontSize: "16px" }}>🎯</span>
              </div>
              <strong style={{ fontSize: "17px", color: "#0f172a" }}>
                {t("consentPurposeValue")}
              </strong>
              <span className="small muted">Gig work income & tenure verification</span>
            </div>

            {/* Card 3: Date Range */}
            <div style={{
              background: "rgba(255, 255, 255, 0.9)",
              border: "1px solid rgba(186, 230, 253, 0.8)",
              borderRadius: "14px",
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              boxShadow: "0 4px 16px rgba(0,0,0,0.03)"
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span className="muted" style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>{t("consentRange")}</span>
                <span style={{ fontSize: "16px" }}>📅</span>
              </div>
              <strong style={{ fontSize: "16px", color: "#0f172a" }}>
                {fmt(now - 3 * 365 * DAY)} – {fmt(now)}
              </strong>
              <span className="small muted">Past 36 months of bank history</span>
            </div>

            {/* Card 4: Permission Expiry */}
            <div style={{
              background: "rgba(255, 255, 255, 0.9)",
              border: "1px solid rgba(186, 230, 253, 0.8)",
              borderRadius: "14px",
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              boxShadow: "0 4px 16px rgba(0,0,0,0.03)"
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span className="muted" style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>{t("consentExpires")}</span>
                <span style={{ fontSize: "16px" }}>⏱️</span>
              </div>
              <strong style={{ fontSize: "17px", color: "#0284c7" }}>
                {t("consentExpiresValue")}
              </strong>
              <span className="small muted">One-time consent token</span>
            </div>
          </div>

          {/* Security & Privacy Callout Card */}
          <div style={{
            background: "rgba(2, 132, 199, 0.08)",
            border: "1px solid rgba(2, 132, 199, 0.25)",
            borderRadius: "14px",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "10px"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#0284c7", fontWeight: 600, fontSize: "15px" }}>
              <span>🔒 Privacy & Data Protection Guarantee</span>
            </div>
            <p style={{ fontSize: "14px", color: "#334155", lineHeight: "1.5" }}>
              {t("consentSim")}
            </p>
            <p className="small muted">
              Only credits from recognized gig platforms (Swiggy, Zomato, Uber, Urban Company, etc.) will be calculated. Personal spending transactions remain strictly private and stay on your device.
            </p>
          </div>
        </section>
      )}

      {error && <p className="note bad">{error}</p>}

      {/* Footer Navigation Bar */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        paddingTop: "20px",
        borderTop: "1px solid var(--line)"
      }}>
        <Link href="/role" className="btn alt linkbtn" style={{ padding: "12px 20px" }}>
          ← Back to Worker Selection
        </Link>

        <button
          className="btn"
          onClick={approve}
          disabled={busy || !persona}
          style={{ padding: "14px 28px", fontSize: "15px", background: "linear-gradient(135deg, #059669, #10b981)", borderColor: "#059669" }}
        >
          {busy ? (
            <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⏳</span> {t("approving")}
            </span>
          ) : (
            `Approve & Fetch Bank Record →`
          )}
        </button>
      </div>
    </main>
  );
}
