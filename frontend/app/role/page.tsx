"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useLang } from "@/lib/lang";
import type { Persona } from "@/lib/personas";
import { useSession } from "@/lib/session";
import type { RolesDto } from "@/lib/types";

export default function WorkerPicker() {
  const { t, lang } = useLang();
  const { ready, role, personaId, update } = useSession();
  const router = useRouter();
  const [personas, setPersonas] = useState<Persona[] | null>(null);
  const [roles, setRoles] = useState<RolesDto | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (ready && !role) router.replace("/");
  }, [ready, role, router]);

  useEffect(() => {
    Promise.all([api.personas(), api.roles()])
      .then(([p, r]) => {
        setPersonas(p);
        setRoles(r);
      })
      .catch(() => setFailed(true));
  }, []);

  if (!role) return null;
  const mine = personas?.filter((p) => p.role === role) ?? [];
  const selectedPersona = mine.find((p) => p.id === personaId);

  // Helper to extract initials for avatar
  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  };

  return (
    <main className="wrap stack" style={{ gap: 32 }}>
      {/* Header Section */}
      <section className="stack" style={{ gap: 16 }}>
        <div>
          <h1 style={{ fontSize: "clamp(28px, 4vw, 40px)", marginBottom: "8px" }}>{t("roleTitle")}</h1>
          <p className="muted">{t("roleHint")}</p>
        </div>

        {/* Structured Grid of Target Qualification Cards */}
        {roles && roles[role] && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "12px"
          }}>
            {/* Tile 1: Role Name */}
            <div style={{
              background: "rgba(2, 132, 199, 0.1)",
              border: "1px solid rgba(2, 132, 199, 0.3)",
              borderRadius: "14px",
              padding: "14px 18px",
              display: "flex",
              flexDirection: "column",
              gap: "4px"
            }}>
              <span className="muted" style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>Target Role</span>
              <strong style={{ fontSize: "18px", color: "#0284c7" }}>{roles[role].label}</strong>
            </div>

            {/* Tile 2: Tenure */}
            <div style={{
              background: "rgba(255, 255, 255, 0.9)",
              border: "1px solid rgba(186, 230, 253, 0.8)",
              borderRadius: "14px",
              padding: "14px 18px",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.03)"
            }}>
              <span className="muted" style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>Required Tenure</span>
              <strong style={{ fontSize: "18px", color: "#0f172a" }}>
                {roles[role].minTenure} <span style={{ fontSize: "13px", color: "#64748b", fontWeight: 400 }}>months</span>
              </strong>
            </div>

            {/* Tile 3: Paid Weeks */}
            <div style={{
              background: "rgba(255, 255, 255, 0.9)",
              border: "1px solid rgba(186, 230, 253, 0.8)",
              borderRadius: "14px",
              padding: "14px 18px",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.03)"
            }}>
              <span className="muted" style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>Min Paid Weeks</span>
              <strong style={{ fontSize: "18px", color: "#0f172a" }}>
                {roles[role].minPeriods} <span style={{ fontSize: "13px", color: "#64748b", fontWeight: 400 }}>weeks</span>
              </strong>
            </div>

            {/* Tile 4: Max Missed */}
            <div style={{
              background: "rgba(255, 255, 255, 0.9)",
              border: "1px solid rgba(186, 230, 253, 0.8)",
              borderRadius: "14px",
              padding: "14px 18px",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.03)"
            }}>
              <span className="muted" style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>Max Missed Weeks</span>
              <strong style={{ fontSize: "18px", color: "#0f172a" }}>
                {roles[role].maxMissed} <span style={{ fontSize: "13px", color: "#64748b", fontWeight: 400 }}>weeks</span>
              </strong>
            </div>

            {/* Tile 5: Min Income */}
            <div style={{
              background: "rgba(16, 185, 129, 0.1)",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              borderRadius: "14px",
              padding: "14px 18px",
              display: "flex",
              flexDirection: "column",
              gap: "4px"
            }}>
              <span className="muted" style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>Min Monthly Income</span>
              <strong style={{ fontSize: "18px", color: "#059669" }}>
                ₹{roles[role].minIncome.toLocaleString()} <span style={{ fontSize: "13px", color: "#64748b", fontWeight: 400 }}>/ mo</span>
              </strong>
            </div>
          </div>
        )}
      </section>

      {failed && <p className="note bad">{t("loadError")}</p>}
      {!failed && !personas && <p className="muted">{t("loading")}</p>}

      {/* Structured Worker Cards Grid */}
      {personas && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "20px"
        }}>
          {mine.map((p) => {
            const isSelected = personaId === p.id;

            return (

              <button
                key={p.id}
                className="pick"
                aria-pressed={isSelected}
                style={{
                  position: "relative",
                  padding: "24px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "16px",
                  textAlign: "left",
                  background: isSelected ? "rgba(224, 242, 254, 0.95)" : "rgba(255, 255, 255, 0.9)",
                  borderColor: isSelected ? "#0284c7" : "rgba(186, 230, 253, 0.8)",
                  boxShadow: isSelected ? "0 0 0 2px #0284c7, 0 12px 28px rgba(2, 132, 199, 0.15)" : "0 4px 16px rgba(0,0,0,0.04)",
                  borderRadius: "16px",
                  transition: "all 0.25s ease"
                }}
                onClick={() => update({ personaId: p.id, consent: null, record: null, bind: null, passport: null, qr: null })}
              >
                {/* Header: Avatar, Name & Selection indicator */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", width: "100%" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                    <div style={{
                      width: "48px",
                      height: "48px",
                      borderRadius: "12px",
                      background: isSelected ? "linear-gradient(135deg, #0284c7, #2563eb)" : "rgba(2, 132, 199, 0.1)",
                      color: isSelected ? "#fff" : "#0284c7",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                      fontSize: "16px",
                      boxShadow: isSelected ? "0 4px 12px rgba(2, 132, 199, 0.3)" : "none"
                    }}>
                      {getInitials(p.name)}
                    </div>
                    <div>
                      <h3 style={{ fontSize: "18px", margin: 0, color: "#0f172a" }}>{lang === "kn" ? p.nameKn : p.name}</h3>
                      <p className="small muted" style={{ marginTop: "2px" }}>
                        {lang === "kn" ? p.name : p.nameKn} • {p.city}
                      </p>
                    </div>
                  </div>

                  {/* Radio Indicator Ring */}
                  <div style={{
                    width: "22px",
                    height: "22px",
                    borderRadius: "50%",
                    border: isSelected ? "6px solid #0284c7" : "2px solid #cbd5e1",
                    background: isSelected ? "#fff" : "transparent",
                    flex: "none",
                    transition: "all 0.2s"
                  }} />
                </div>

                {/* Platforms Chips */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {p.platforms.map((plat) => (
                    <span key={plat} style={{
                      background: "rgba(2, 132, 199, 0.08)",
                      border: "1px solid rgba(2, 132, 199, 0.2)",
                      fontSize: "12px",
                      padding: "3px 10px",
                      borderRadius: "6px",
                      color: "#0369a1",
                      fontWeight: 500
                    }}>
                      {plat}
                    </span>
                  ))}
                </div>

                {/* Why / Story Callout */}
                {p.why && (
                  <div style={{
                    background: "rgba(241, 245, 249, 0.9)",
                    border: "1px solid rgba(203, 213, 225, 0.6)",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    fontSize: "13px",
                    color: "#334155",
                    lineHeight: "1.4"
                  }}>
                    {p.why}
                  </div>
                )}

                {/* Expected Band Tag */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto", paddingTop: "8px" }}>
                  <span className="small muted">Expected Band:</span>
                  <span style={{
                    fontSize: "12px",
                    padding: "4px 12px",
                    borderRadius: "99px",
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    background: p.expected === "Strong" ? "rgba(209, 250, 229, 0.9)" : "rgba(224, 242, 254, 0.9)",
                    color: p.expected === "Strong" ? "#047857" : "#0284c7",
                    border: `1px solid ${p.expected === "Strong" ? "rgba(5, 150, 105, 0.3)" : "rgba(2, 132, 199, 0.3)"}`
                  }}>
                    Band: {p.expected}
                  </span>
                </div>

              </button>
            );
          })}
        </div>
      )}

      {/* Structured Footer Action Bar */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        paddingTop: "16px",
        borderTop: "1px solid var(--line)"
      }}>
        <Link href="/" className="btn alt linkbtn" style={{ padding: "12px 20px" }}>
          ← Back to Roles
        </Link>

        <button
          className="btn"
          disabled={personaId === null || !mine.some((p) => p.id === personaId)}
          onClick={() => router.push("/consent")}
          style={{ padding: "12px 28px", fontSize: "15px" }}
        >
          {selectedPersona ? `Continue with ${selectedPersona.name.split(" ")[0]} →` : t("continue")}
        </button>
      </div>
    </main>
  );
}
