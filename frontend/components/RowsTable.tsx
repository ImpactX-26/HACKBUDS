"use client";

import { useLang } from "@/lib/lang";
import type { BankRow } from "@/lib/types";

export default function RowsTable({ rows, shown, onMore }: { rows: BankRow[]; shown: number; onMore: () => void }) {
  const { t } = useLang();
  const visible = rows.slice(0, shown);

  // Helper for platform badge colors
  const getPayerBadge = (payer: string) => {
    const name = payer.toLowerCase();
    if (name.includes("swiggy")) return { bg: "rgba(249, 115, 22, 0.12)", color: "#ea580c", border: "rgba(249, 115, 22, 0.3)", icon: "🛵" };
    if (name.includes("zomato")) return { bg: "rgba(239, 68, 68, 0.12)", color: "#dc2626", border: "rgba(239, 68, 68, 0.3)", icon: "🍕" };
    if (name.includes("uber") || name.includes("ola") || name.includes("rapido")) return { bg: "rgba(2, 132, 199, 0.12)", color: "#0284c7", border: "rgba(2, 132, 199, 0.3)", icon: "🚗" };
    if (name.includes("urban") || name.includes("porter")) return { bg: "rgba(147, 51, 234, 0.12)", color: "#7e22ce", border: "rgba(147, 51, 234, 0.3)", icon: "🛠️" };
    return { bg: "rgba(100, 116, 139, 0.1)", color: "#475569", border: "rgba(148, 163, 184, 0.3)", icon: "💳" };
  };

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "18px" }}>📊</span>
          <h3 style={{ fontSize: "18px", color: "#0f172a", margin: 0, fontWeight: 700 }}>Transaction Ledger</h3>
        </div>
        <span className="small muted">Only incoming payouts from verified platforms are counted</span>
      </div>

      <div className="tablewrap" style={{
        borderRadius: "14px",
        border: "1px solid rgba(186, 230, 253, 0.9)",
        background: "rgba(255, 255, 255, 0.95)",
        overflow: "hidden",
        boxShadow: "0 4px 20px rgba(0,0,0,0.04)"
      }}>
        <table className="data" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "linear-gradient(135deg, #0284c7 0%, #2563eb 100%)", color: "#ffffff" }}>
              <th style={{ padding: "14px 18px", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em", color: "#ffffff", fontWeight: 700 }}>{t("colDate")}</th>
              <th className="r" style={{ padding: "14px 18px", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em", color: "#ffffff", fontWeight: 700 }}>{t("colAmount")}</th>
              <th style={{ padding: "14px 18px", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em", color: "#ffffff", fontWeight: 700 }}>{t("colPayer")}</th>
              <th style={{ padding: "14px 18px", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em", color: "#ffffff", fontWeight: 700 }}>{t("colStatus")}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => {
              const isCounted = r.counted && r.type === "CR";
              const isDiscarded = r.type === "DR";
              const isUnrecognized = !r.counted && r.type === "CR";
              const badge = getPayerBadge(r.type === "CR" ? r.payer : r.narration);

              return (
                <tr key={`${r.date}-${i}`} style={{
                  borderBottom: "1px solid rgba(226, 232, 240, 0.8)",
                  background: isCounted
                    ? "rgba(209, 250, 229, 0.45)"
                    : isDiscarded
                    ? "rgba(254, 226, 226, 0.25)"
                    : "rgba(254, 243, 199, 0.35)",
                  transition: "background 0.2s ease"
                }}>
                  {/* Date Column */}
                  <td style={{ padding: "14px 18px", color: "#1e293b", fontWeight: 600, fontSize: "13.5px" }}>
                    {r.date}
                  </td>

                  {/* Amount Column */}
                  <td className="r" style={{
                    padding: "14px 18px",
                    fontWeight: 800,
                    fontFamily: "var(--f-mono)",
                    fontSize: "15px",
                    color: isCounted ? "#047857" : isDiscarded ? "#e11d48" : "#d97706"
                  }}>
                    {r.type === "CR" ? "+" : "-"}₹{r.amount.toLocaleString("en-IN")}
                  </td>

                  {/* Payer Column */}
                  <td style={{ padding: "14px 18px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{
                        background: badge.bg,
                        color: badge.color,
                        border: `1px solid ${badge.border}`,
                        fontSize: "12px",
                        fontWeight: 600,
                        padding: "3px 10px",
                        borderRadius: "8px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px"
                      }}>
                        <span>{badge.icon}</span>
                        <span>{r.type === "CR" ? r.payer : r.narration}</span>
                      </span>
                    </div>
                  </td>

                  {/* Status Column */}
                  <td style={{ padding: "14px 18px" }}>
                    {isCounted && (
                      <span style={{
                        fontSize: "11.5px",
                        fontWeight: 700,
                        padding: "4px 12px",
                        borderRadius: "99px",
                        background: "rgba(5, 150, 105, 0.15)",
                        color: "#047857",
                        border: "1px solid rgba(5, 150, 105, 0.3)",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px"
                      }}>
                        <span>✓</span> Counted Income
                      </span>
                    )}

                    {isDiscarded && (
                      <span style={{
                        fontSize: "11.5px",
                        fontWeight: 600,
                        padding: "4px 12px",
                        borderRadius: "99px",
                        background: "rgba(225, 29, 72, 0.1)",
                        color: "#e11d48",
                        border: "1px solid rgba(225, 29, 72, 0.25)",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px"
                      }}>
                        <span>✕</span> Discarded (Debit)
                      </span>
                    )}

                    {isUnrecognized && (
                      <span style={{
                        fontSize: "11.5px",
                        fontWeight: 600,
                        padding: "4px 12px",
                        borderRadius: "99px",
                        background: "rgba(217, 119, 6, 0.12)",
                        color: "#b45309",
                        border: "1px solid rgba(217, 119, 6, 0.3)",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px"
                      }}>
                        <span>⚠️</span> Unrecognized Payer
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination Bar */}
      <div className="row" style={{ justifyContent: "space-between", marginTop: "4px" }}>
        <span className="small muted">{t("showing", { shown: Math.min(shown, rows.length), total: rows.length })}</span>
        {shown < rows.length && (
          <button className="btn alt" onClick={onMore} style={{ padding: "8px 18px", fontSize: "13px", fontWeight: 600 }}>
            {t("showMore")}
          </button>
        )}
      </div>
    </div>
  );
}
