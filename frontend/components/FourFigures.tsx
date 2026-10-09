"use client";

import { SCORE_DISCLAIMER } from "@/lib/constants";
import { inr } from "@/lib/format";
import { useLang } from "@/lib/lang";
import { bandOf, gigScore, scoreParts } from "@/lib/score";
import type { RoleBarDto, Summary } from "@/lib/types";

// The four numbers evaluated against the bar for the chosen role.
export default function FourFigures({ summary, bar }: { summary: Summary; bar: RoleBarDto }) {
  const { t } = useLang();

  const metrics = {
    tenure: summary.tenureMonths,
    periods: summary.periodsPaid,
    missed: summary.missedPeriods,
    income: summary.monthlyIncome,
  };

  const score = gigScore(metrics);
  const band = bandOf(score);
  const parts = scoreParts(metrics);

  const tiles = [
    {
      key: "tenure",
      icon: "⏱️",
      label: t("figTenure"),
      value: `${summary.tenureMonths} ${t("figTenureUnit")}`,
      ok: summary.tenureMonths >= bar.minTenure,
      need: t("needAtLeast", { value: `${bar.minTenure} ${t("figTenureUnit")}` }),
    },
    {
      key: "periods",
      icon: "📅",
      label: t("figPeriods"),
      value: `${summary.periodsPaid} wks`,
      ok: summary.periodsPaid >= bar.minPeriods,
      need: t("needAtLeast", { value: `${bar.minPeriods} wks` }),
    },
    {
      key: "missed",
      icon: "⚠️",
      label: t("figMissed"),
      value: `${summary.missedPeriods} wks`,
      ok: summary.missedPeriods <= bar.maxMissed,
      need: bar.maxMissed === 0 ? "0 max" : t("allowUpTo", { value: bar.maxMissed }),
    },
    {
      key: "income",
      icon: "💰",
      label: t("figIncome"),
      value: inr(summary.monthlyIncome),
      ok: summary.monthlyIncome >= bar.minIncome,
      need: t("needAtLeast", { value: inr(bar.minIncome) }),
    },
  ];

  const bandColor = band === "Strong" ? "#059669" : band === "Good" ? "#0284c7" : band === "Fair" ? "#d97706" : "#dc2626";

  return (
    <div className="stack" style={{ gap: "16px" }}>
      {/* 4 Stat Tiles */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: "16px",
        marginTop: "8px"
      }}>
        {tiles.map((x) => (
          <div
            key={x.key}
            style={{
              background: x.ok ? "rgba(209, 250, 229, 0.7)" : "rgba(254, 226, 226, 0.7)",
              border: `1px solid ${x.ok ? "rgba(5, 150, 105, 0.3)" : "rgba(220, 38, 38, 0.3)"}`,
              borderRadius: "14px",
              padding: "18px 20px",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              boxShadow: "0 4px 14px rgba(0,0,0,0.02)"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em", color: "#475569", fontWeight: 600 }}>
                {x.label}
              </span>
              <span style={{ fontSize: "16px" }}>{x.icon}</span>
            </div>

            <div style={{
              fontSize: "24px",
              fontWeight: 700,
              fontFamily: "var(--f-mono)",
              color: x.ok ? "#047857" : "#b91c1c",
              fontVariantNumeric: "tabular-nums"
            }}>
              {x.value}
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto", paddingTop: "4px" }}>
              <span style={{ fontSize: "12px", color: "#64748b" }}>Req: {x.need}</span>
              <span style={{
                fontSize: "11px",
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: "99px",
                background: x.ok ? "#059669" : "#dc2626",
                color: "#fff"
              }}>
                {x.ok ? "PASS" : "FAIL"}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Gig Stability Score Card */}
      <div className="card" style={{ padding: "20px", gap: "14px", background: "rgba(255, 255, 255, 0.95)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "20px" }}>🎯</span>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", color: "#0f172a" }}>{t("gigScoreTitle")}</h3>
              <span className="small muted">{SCORE_DISCLAIMER}</span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ fontSize: "26px", fontWeight: 800, color: "#0284c7", fontFamily: "var(--f-mono)" }}>
              {score}<span style={{ fontSize: "16px", color: "#64748b" }}>/100</span>
            </div>
            <span style={{
              background: bandColor,
              color: "#ffffff",
              fontWeight: 800,
              fontSize: "14px",
              padding: "6px 14px",
              borderRadius: "999px"
            }}>
              {band}
            </span>
          </div>
        </div>

        <div className="bar">
          <i style={{ width: `${score}%`, background: `linear-gradient(90deg, #38bdf8, ${bandColor})` }} />
        </div>

        {/* Score Breakdown Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "10px", marginTop: "4px" }}>
          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", padding: "10px 12px", borderRadius: "10px" }}>
            <span className="small muted">Tenure ({parts.tenure.points.toFixed(0)}/25 pts)</span>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a", marginTop: "2px" }}>{summary.tenureMonths} / 24 mos</div>
          </div>
          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", padding: "10px 12px", borderRadius: "10px" }}>
            <span className="small muted">Consistency ({parts.consistency.points.toFixed(0)}/35 pts)</span>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a", marginTop: "2px" }}>{parts.consistency.score.toFixed(0)}% paid</div>
          </div>
          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", padding: "10px 12px", borderRadius: "10px" }}>
            <span className="small muted">Gaps ({summary.missedPeriods} missed wks)</span>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a", marginTop: "2px" }}>{summary.periodsPaid} paid wks</div>
          </div>
          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", padding: "10px 12px", borderRadius: "10px" }}>
            <span className="small muted">Income ({parts.income.points.toFixed(0)}/40 pts)</span>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a", marginTop: "2px" }}>{inr(summary.monthlyIncome)}</div>
          </div>
        </div>
      </div>

    </div>
  );
}
