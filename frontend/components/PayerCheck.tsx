"use client";

import { inr } from "@/lib/format";
import { useLang } from "@/lib/lang";
import { findCandidates, titleCase } from "@/lib/payers";
import type { Candidate } from "@/lib/payers";
import type { FiResponse } from "@/lib/types";

// Shows who paid, what was left out, and the demo button that stands in for the registry update.
export default function PayerCheck({ fi, busy, onAdd }: { fi: FiResponse; busy: boolean; onAdd: (c: Candidate) => void }) {
  const { t } = useLang();
  const candidates = findCandidates(fi.rows);
  const left = fi.payers.unidentified;

  // Helper for brand badge styling
  const getBrandChip = (payer: string) => {
    const name = payer.toLowerCase();
    if (name.includes("swiggy") || name.includes("bundl")) {
      return { bg: "#ffebd6", color: "#c2410c", border: "#f97316", icon: "🛵" };
    }
    if (name.includes("zomato")) {
      return { bg: "#ffe4e6", color: "#be123c", border: "#f43f5e", icon: "🍕" };
    }
    if (name.includes("uber") || name.includes("ola") || name.includes("rapido")) {
      return { bg: "#e0f2fe", color: "#0369a1", border: "#38bdf8", icon: "🚗" };
    }
    if (name.includes("urban") || name.includes("porter")) {
      return { bg: "#f3e8ff", color: "#6b21a8", border: "#c084fc", icon: "🛠️" };
    }
    return { bg: "#d1fae5", color: "#047857", border: "#34d399", icon: "🏢" };
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <p className="small muted" style={{ margin: 0 }}>
        {t("payersHint")}
      </p>

      {/* Known Payers Section */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <span style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em", color: "#475569", fontWeight: 700 }}>
          {t("payersKnown")} ({fi.payers.known.length})
        </span>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
          {fi.payers.known.map((p) => {
            const chip = getBrandChip(p);
            return (
              <span
                key={p}
                style={{
                  background: chip.bg,
                  color: chip.color,
                  border: `1px solid ${chip.border}`,
                  padding: "6px 14px",
                  borderRadius: "10px",
                  fontSize: "13px",
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.02)"
                }}
              >
                <span>{chip.icon}</span>
                <span>{p}</span>
                <span style={{ fontSize: "11px", opacity: 0.8 }}>✓ Verified</span>
              </span>
            );
          })}
        </div>
      </div>

      {/* Unidentified Payers Warning Section */}
      {left.length === 0 ? (
        <div style={{
          background: "rgba(209, 250, 229, 0.8)",
          border: "1px solid rgba(5, 150, 105, 0.3)",
          borderRadius: "12px",
          padding: "14px 18px",
          color: "#047857",
          fontSize: "14px",
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: "10px"
        }}>
          <span>✓</span>
          <span>{t("payersAllKnown")}</span>
        </div>
      ) : (
        left.map((u) => {
          const cand = candidates.find((c) => c.payer === u.payer);
          return (
            <div
              key={u.payer}
              style={{
                background: "rgba(254, 243, 199, 0.7)",
                border: "1px solid rgba(217, 119, 6, 0.3)",
                borderRadius: "14px",
                padding: "18px 20px",
                display: "flex",
                flexDirection: "column",
                gap: "12px"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#b45309", fontWeight: 700, fontSize: "15px" }}>
                    <span>⚠️ Unregistered Payer Source</span>
                  </div>
                  <div style={{ fontFamily: "var(--f-mono)", fontSize: "14px", color: "#0f172a", marginTop: "4px", fontWeight: 600 }}>
                    {u.payer}
                  </div>
                </div>

                <span style={{
                  background: "rgba(217, 119, 6, 0.15)",
                  color: "#b45309",
                  padding: "4px 10px",
                  borderRadius: "99px",
                  fontSize: "12px",
                  fontWeight: 600
                }}>
                  {t("payersUnknownLine", { credits: u.credits, total: inr(u.total) })}
                </span>
              </div>

              {cand && (
                <div style={{
                  background: "rgba(255, 255, 255, 0.8)",
                  border: "1px solid rgba(217, 119, 6, 0.25)",
                  borderRadius: "10px",
                  padding: "12px 16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px"
                }}>
                  <p className="small" style={{ margin: 0, color: "#475569" }}>
                    {t("payersDemoNote")}
                  </p>
                  <button
                    className="btn"
                    disabled={busy}
                    onClick={() => onAdd(cand)}
                    style={{
                      alignSelf: "flex-start",
                      background: "linear-gradient(135deg, #d97706, #b45309)",
                      borderColor: "#d97706",
                      fontSize: "13px",
                      padding: "8px 16px"
                    }}
                  >
                    {busy ? "Registering..." : `➕ Register ${cand.payer} as ${titleCase(cand.platform)} Payer`}
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
