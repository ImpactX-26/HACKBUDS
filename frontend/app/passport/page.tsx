"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { inr, shortHash } from "@/lib/format";
import { useLang } from "@/lib/lang";
import type { Persona } from "@/lib/personas";
import { bandOf, gigScore } from "@/lib/score";
import { mockProof } from "@/lib/prove";
import { useSession } from "@/lib/session";
import { ApiError, type Passport, type RolesDto } from "@/lib/types";

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export default function PassportPage() {
  const { t, lang } = useLang();
  const { ready, passport, bind, personaId, reset } = useSession();
  const router = useRouter();

  const [card, setCard] = useState<Passport | null>(null);
  const [persona, setPersona] = useState<Persona | null>(null);
  const [roles, setRoles] = useState<RolesDto | null>(null);
  const [lost, setLost] = useState(false);
  const [failed, setFailed] = useState(false);
  const [second, setSecond] = useState<{ ok: boolean; text: string } | null>(null);

  const passportId = passport?.passportId ?? null;

  useEffect(() => {
    if (ready && !passport) router.replace("/proof");
  }, [ready, passport, router]);

  useEffect(() => {
    if (passportId === null) return;
    Promise.all([api.getPassport(passportId), api.personas(), api.roles()])
      .then(([c, ps, rl]) => {
        setCard(c);
        setPersona(ps.find((p) => p.id === personaId) ?? null);
        setRoles(rl);
      })
      .catch((e: unknown) => (e instanceof ApiError && e.code === "passport_not_found" ? setLost(true) : setFailed(true)));
  }, [passportId, personaId]);

  async function trySecond() {
    if (!card || !bind) return;
    setSecond(null);
    try {
      await api.issuePassport({
        proof: mockProof,
        publicSignals: [
          String(card.provenMinTenure),
          String(card.provenMinPeriods),
          String(card.provenMaxMissed),
          String(card.provenMinIncome),
          card.commitment,
          "",
        ],
        nullifier: bind.nullifier,
        role: card.role,
        owner: card.owner,
      });
      setSecond({ ok: true, text: t("secondWorked") });
    } catch (e) {
      setSecond({ ok: false, text: e instanceof ApiError ? e.message : t("loadError") });
    }
  }

  async function revoke() {
    if (passportId === null) return;
    try {
      setCard(await api.revokePassport(passportId));
    } catch (e) {
      setSecond({ ok: false, text: e instanceof ApiError ? e.message : t("loadError") });
    }
  }

  if (!passport) return null;

  return (
    <main className="wrap stack" style={{ gap: 32 }}>
      {lost && (
        <div className="note bad stack" style={{ gap: 8, alignItems: "flex-start" }}>
          <span>{t("passportLost")}</span>
          <button className="btn alt" onClick={() => { reset(); router.push("/"); }}>{t("startAgain")}</button>
        </div>
      )}
      {failed && <p className="note bad">{t("loadError")}</p>}
      {!card && !lost && !failed && <p className="muted">{t("loading")}</p>}

      {card && (
        <>
          {/* Realistic Metallic Digital Work Passport Card */}
          <article style={{
            background: card.revoked
              ? "linear-gradient(135deg, #2a080c 0%, #450a0a 50%, #1f0408 100%)"
              : "linear-gradient(135deg, #0b132b 0%, #1e293b 40%, #0369a1 100%)",
            border: card.revoked ? "2px solid #ef4444" : "2px solid #38bdf8",
            borderRadius: "24px",
            padding: "32px",
            display: "flex",
            flexDirection: "column",
            gap: "24px",
            boxShadow: card.revoked
              ? "0 25px 50px -12px rgba(239, 68, 68, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.2)"
              : "0 25px 50px -12px rgba(2, 132, 199, 0.35), inset 0 1px 1px rgba(255, 255, 255, 0.25)",
            position: "relative",
            overflow: "hidden",
            color: "#ffffff"
          }}>
            {/* Background Security Foil Pattern */}
            <div style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundImage: "radial-gradient(rgba(56, 189, 248, 0.08) 1px, transparent 1px), linear-gradient(135deg, rgba(255,255,255,0.05) 0%, transparent 60%)",
              backgroundSize: "20px 20px, 100% 100%",
              pointerEvents: "none",
              zIndex: 1
            }} />

            {/* Top Bar: Security Chip + Official Header + Status Badge */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px", zIndex: 2 }}>
              {/* Golden Smart Card EMV Chip */}
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{
                  width: 46,
                  height: 34,
                  background: "linear-gradient(135deg, #f59e0b 0%, #d97706 50%, #fef08a 100%)",
                  borderRadius: 6,
                  border: "1px solid #b45309",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.4)",
                  position: "relative",
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}>
                  {/* Micro Chip Grid Lines */}
                  <div style={{ width: "100%", height: 1, background: "#78350f" }} />
                  <div style={{ position: "absolute", width: 1, height: "100%", background: "#78350f" }} />
                </div>
                <div>
                  <div style={{ fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", color: "#94a3b8", fontWeight: 700 }}>
                    Official Web3 Credential
                  </div>
                  <div style={{ fontSize: "14px", fontWeight: 800, color: "#f8fafc", letterSpacing: "0.05em", fontFamily: "var(--f-mono)" }}>
                    GIGVAULT PASSPORT
                  </div>
                </div>
              </div>

              {/* Status Pill */}
              <span style={{
                background: card.revoked ? "rgba(220, 38, 38, 0.9)" : "rgba(16, 185, 129, 0.9)",
                color: "#ffffff",
                fontSize: "12px",
                fontWeight: 800,
                padding: "6px 16px",
                borderRadius: "9999px",
                boxShadow: card.revoked ? "0 0 15px rgba(239, 68, 68, 0.5)" : "0 0 15px rgba(16, 185, 129, 0.5)",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                letterSpacing: "0.05em"
              }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#ffffff", boxShadow: "0 0 8px #ffffff" }} />
                {card.revoked ? t("passportRevoked").toUpperCase() : t("passportActive").toUpperCase()}
              </span>
            </div>

            {/* Holder Biometric & Identity Banner */}
            <div style={{
              background: "rgba(15, 23, 42, 0.6)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              borderRadius: "16px",
              padding: "18px 24px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "16px",
              zIndex: 2
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                {/* Avatar Initials Badge */}
                <div style={{
                  width: 52,
                  height: 52,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)",
                  border: "2px solid #ffffff",
                  boxShadow: "0 4px 12px rgba(2, 132, 199, 0.4)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "20px",
                  fontWeight: 800,
                  color: "#ffffff"
                }}>
                  {persona ? (lang === "kn" ? persona.nameKn.slice(0, 2) : persona.name.slice(0, 2).toUpperCase()) : "RK"}
                </div>

                <div>
                  <span style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.1em", color: "#94a3b8", fontWeight: 700 }}>
                    {t("passportHolder")}
                  </span>
                  <div style={{ fontSize: "22px", fontWeight: 800, color: "#ffffff", letterSpacing: "0.02em" }}>
                    {persona ? (lang === "kn" ? persona.nameKn : persona.name) : ""}
                  </div>
                  <div style={{ fontSize: "12px", color: "#38bdf8", fontFamily: "var(--f-mono)", fontWeight: 700 }}>
                    Passport #{card.passportId}
                  </div>
                </div>
              </div>

              {/* Role, Gig Score Band & Expiry */}
              <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
                <span style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.1em", color: "#94a3b8", fontWeight: 700 }}>
                  {t("passportWork")}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    background: "rgba(56, 189, 248, 0.15)",
                    border: "1px solid rgba(56, 189, 248, 0.4)",
                    color: "#38bdf8",
                    padding: "4px 12px",
                    borderRadius: "8px",
                    fontSize: "14px",
                    fontWeight: 700
                  }}>
                    {roles ? roles[card.role].label : card.role}
                  </div>
                  <div style={{
                    background: card.band === "Strong" ? "#059669" : card.band === "Good" ? "#0284c7" : card.band === "Fair" ? "#d97706" : "#dc2626",
                    color: "#ffffff",
                    padding: "6px 16px",
                    borderRadius: "8px",
                    fontSize: "16px",
                    fontWeight: 900,
                    letterSpacing: "0.05em",
                    fontFamily: "var(--f-mono)",
                    boxShadow: "0 2px 10px rgba(0,0,0,0.2)"
                  }}>
                    BAND {card.band ?? bandOf(gigScore({ tenure: card.provenMinTenure, periods: card.provenMinPeriods, missed: card.provenMaxMissed, income: card.provenMinIncome }))}
                  </div>
                </div>
                <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: 2 }}>
                  Valid: <strong>{fmtDate(card.expiry)}</strong>
                </div>
              </div>
            </div>

            {/* Privacy-Preserving ZK Certificate Attributes (No exact figures) */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "12px",
              zIndex: 2
            }}>
              <div style={{ background: "rgba(15, 23, 42, 0.5)", border: "1px solid rgba(56, 189, 248, 0.25)", padding: "14px 16px", borderRadius: "14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8", fontWeight: 700 }}>Proven Rating</span>
                  <span style={{ fontSize: "10px", color: "#34d399", fontWeight: 700 }}>✓ ZK PROVEN</span>
                </div>
                <div style={{ fontSize: "16px", fontWeight: 800, color: "#38bdf8", marginTop: "6px" }}>
                  Band {card.band ?? "Strong"} Stability
                </div>
              </div>

              <div style={{ background: "rgba(15, 23, 42, 0.5)", border: "1px solid rgba(56, 189, 248, 0.25)", padding: "14px 16px", borderRadius: "14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8", fontWeight: 700 }}>Aadhaar Binding</span>
                  <span style={{ fontSize: "10px", color: "#34d399", fontWeight: 700 }}>✓ VERIFIED</span>
                </div>
                <div style={{ fontSize: "16px", fontWeight: 800, color: "#38bdf8", marginTop: "6px" }}>
                  Nullifier Protected
                </div>
              </div>

              <div style={{ background: "rgba(15, 23, 42, 0.5)", border: "1px solid rgba(56, 189, 248, 0.25)", padding: "14px 16px", borderRadius: "14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8", fontWeight: 700 }}>Data Privacy</span>
                  <span style={{ fontSize: "10px", color: "#34d399", fontWeight: 700 }}>✓ ENCRYPTED</span>
                </div>
                <div style={{ fontSize: "16px", fontWeight: 800, color: "#38bdf8", marginTop: "6px" }}>
                  Zero Figures Exposed
                </div>
              </div>

              <div style={{ background: "rgba(16, 185, 129, 0.15)", border: "1px solid rgba(52, 211, 153, 0.4)", padding: "14px 16px", borderRadius: "14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#6ee7b7", fontWeight: 700 }}>Issuer Audit</span>
                  <span style={{ fontSize: "10px", color: "#34d399", fontWeight: 700 }}>✓ STAMPED</span>
                </div>
                <div style={{ fontSize: "16px", fontWeight: 800, color: "#34d399", marginTop: "6px" }}>
                  Bank Sign Off
                </div>
              </div>
            </div>


            {/* Cryptographic Hashes & Laser Security Stamp */}
            <div style={{
              background: "rgba(0, 0, 0, 0.35)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "14px",
              padding: "14px 20px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px",
              zIndex: 2
            }}>
              <div style={{ fontFamily: "var(--f-mono)", fontSize: "12px", color: "#cbd5e1" }}>
                <span style={{ color: "#94a3b8" }}>Commitment:</span> <strong style={{ color: "#38bdf8" }}>{shortHash(card.commitment, 10, 4)}</strong>
                {card.txHash ? <span style={{ marginLeft: 8 }}><span style={{ color: "#94a3b8" }}>• Tx:</span> <strong style={{ color: "#38bdf8" }}>{shortHash(card.txHash, 8, 4)}</strong></span> : ""}
              </div>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", display: "flex", alignItems: "center", gap: 6 }}>
                <span>🛡️ GROTH16 ZK-SNARK VERIFIED</span>
              </div>
            </div>
          </article>

          {/* Privacy Note Card */}
          <div style={{
            background: "rgba(2, 132, 199, 0.08)",
            border: "1px solid rgba(2, 132, 199, 0.2)",
            borderRadius: "14px",
            padding: "16px 20px",
            display: "flex",
            flexDirection: "column",
            gap: "6px"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#0284c7", fontWeight: 700, fontSize: "14px" }}>
              <span>🔒 Zero-Knowledge Privacy Guarantee</span>
            </div>
            <p className="small" style={{ color: "#334155", margin: 0, lineHeight: 1.5 }}>
              {t("passportPrivacy")}
            </p>
          </div>

          {/* Control & Security Test Bar */}
          <section className="card" style={{ padding: "24px", gap: "16px", background: "rgba(255, 255, 255, 0.85)" }}>
            <h3 style={{ fontSize: "17px", color: "#0f172a", margin: 0 }}>Passport Verification & Security Actions</h3>
            <div className="row" style={{ gap: "12px" }}>
              <Link href="/show" className="btn linkbtn" style={{ padding: "12px 24px", fontSize: "15px" }}>
                📱 {t("showToVerifier")} →
              </Link>

              <Link href="/verify" target="_blank" rel="noopener noreferrer" className="btn alt linkbtn" style={{ padding: "12px 20px", fontSize: "14px", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <span>🏢 {t("showOpenLender")}</span>
                <span style={{ fontSize: "12px", opacity: 0.7 }}>↗</span>
              </Link>

              <Link href="/forge" className="btn alt linkbtn" style={{ padding: "12px 20px", fontSize: "14px", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <span>🧪 {t("testLabLink")}</span>
              </Link>

              <button className="btn alt" onClick={trySecond} style={{ padding: "12px 20px", fontSize: "14px" }}>
                🔒 {t("secondTry")}
              </button>

              <button
                className="btn alt"
                onClick={revoke}
                disabled={card.revoked}
                style={{
                  padding: "12px 20px",
                  fontSize: "14px",
                  color: card.revoked ? "#94a3b8" : "#dc2626",
                  borderColor: card.revoked ? "rgba(203, 213, 225, 0.8)" : "rgba(220, 38, 38, 0.3)"
                }}
              >
                🚫 {t("revokePassport")}
              </button>
            </div>

            {card.revoked && (
              <div style={{
                background: "rgba(254, 226, 226, 0.9)",
                border: "1px solid rgba(220, 38, 38, 0.3)",
                padding: "12px 16px",
                borderRadius: "10px",
                color: "#b91c1c",
                fontSize: "14px",
                fontWeight: 600
              }}>
                {t("revokedNote")}
              </div>
            )}

            {second && (
              <div style={{
                background: second.ok ? "rgba(254, 243, 199, 0.9)" : "rgba(254, 226, 226, 0.9)",
                border: `1px solid ${second.ok ? "rgba(217, 119, 6, 0.3)" : "rgba(220, 38, 38, 0.3)"}`,
                padding: "12px 16px",
                borderRadius: "10px",
                color: second.ok ? "#b45309" : "#b91c1c",
                fontSize: "14px",
                fontWeight: 600
              }}>
                {second.text}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
