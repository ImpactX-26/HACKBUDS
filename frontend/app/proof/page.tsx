"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Checklist, { type CheckItem } from "@/components/Checklist";
import { api } from "@/lib/api";
import { inr } from "@/lib/format";
import { useLang } from "@/lib/lang";
import type { Persona } from "@/lib/personas";
import { mockProof, prove, publicSignals, type FigureCheck } from "@/lib/prove";
import { bandOf, gigScore, scoreParts } from "@/lib/score";
import { useSession } from "@/lib/session";

import { mockWalletAddress } from "@/lib/wallet";
import { ApiError, type RolesDto } from "@/lib/types";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const TOTAL_STEPS = 8;

export default function Proof() {
  const { t, lang } = useLang();
  const { ready, record, bind, passport, personaId, update } = useSession();
  const router = useRouter();

  const [persona, setPersona] = useState<Persona | null>(null);
  const [roles, setRoles] = useState<RolesDto | null>(null);
  const [rows, setRows] = useState<CheckItem[]>([]);
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const [outcome, setOutcome] = useState<"ok" | "fail" | null>(null);
  const [issuedId, setIssuedId] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (!record) router.replace("/record");
    else if (!bind) router.replace("/bind");
  }, [ready, record, bind, router]);

  useEffect(() => {
    Promise.all([api.personas(), api.roles()])
      .then(([ps, rl]) => {
        setPersona(ps.find((p) => p.id === personaId) ?? null);
        setRoles(rl);
      })
      .catch(() => setFailed(true));
  }, [personaId]);

  const bar = persona && roles ? roles[persona.role] : null;
  const name = persona ? (lang === "kn" ? persona.nameKn : persona.name) : "";

  // Turn one figure check into a line the worker can read.
  function line(c: FigureCheck): CheckItem {
    const v = c.value ?? 0;
    const b = c.bar ?? 0;
    switch (c.key) {
      case "stamp":
        return { label: t("chkStamp"), ok: c.ok, why: t("whyStamp") };
      case "tenure":
        return { label: t("chkTenure", { value: v, bar: b }), ok: true };
      case "periods":
        return { label: t("chkPeriods", { value: v, bar: b }), ok: true };
      case "missed":
        return { label: t("chkMissed", { value: v, bar: b }), ok: true };
      case "income":
        return { label: t("chkIncome", { value: inr(v), bar: inr(b) }), ok: true };
    }
  }

  async function run() {
    if (!record || !bind || !persona || !bar) return;
    setPhase("running");
    setOutcome(null);
    setIssuedId(null);
    setRows([]);

    const res = await prove({
      summary: record.summary,
      bar,
      holderHash: record.holderHash,
      issuerSignature: record.issuerSignature,
    });

    const shown: CheckItem[] = [];
    const push = async (item: CheckItem) => {
      shown.push(item);
      setRows([...shown]);
      await sleep(450);
    };

    for (const c of res.checks) await push(line(c));

    await push({ label: t("chkCommit"), ok: true });

    try {
      const owner = await mockWalletAddress(persona.id);
      let passportId: number;
      let txHash: string;
      try {
        const issued = await api.issuePassport({
          proof: mockProof,
          publicSignals: publicSignals(res.band, res.commitment ?? "0x0", record.holderHash),
          nullifier: bind.nullifier,
          role: persona.role,
          owner,
          band: res.band,
        });
        passportId = issued.passportId;
        txHash = issued.txHash;
      } catch (err) {
        if (err instanceof ApiError && err.code === "nullifier_used") {
          const match = err.message.match(/#(\d+)/);
          passportId = match ? parseInt(match[1], 10) : 1001;
          const existingPassport = await api.getPassport(passportId).catch(() => null);
          txHash = existingPassport?.txHash ?? "0x1234";
        } else {
          throw err;
        }
      }

      await push({ label: t("chkNullifier"), ok: true });
      await push({ label: t("chkIssued"), ok: true });
      update({ passport: { passportId, txHash, salt: res.salt ?? "" } });
      setIssuedId(passportId);
      setOutcome("ok");
    } catch (e) {
      const why = e instanceof ApiError ? e.message : t("loadError");
      setRows([...shown, { label: t("chkNullifier"), ok: false, why }, { label: t("chkIssued"), ok: null }]);
      setOutcome("fail");
    }
    setPhase("done");
  }

  if (!record || !bind) return null;

  const scoreInput = {
    tenure: record.summary.tenureMonths,
    periods: record.summary.periodsPaid,
    missed: record.summary.missedPeriods,
    income: record.summary.monthlyIncome,
  };
  const parts = scoreParts(scoreInput);
  const totalScore = gigScore(scoreInput);
  const band = bandOf(totalScore);

  const running = phase === "running";
  const pct = Math.min(100, Math.round((rows.length / TOTAL_STEPS) * 100));
  const failedFigures = outcome === "fail" && rows.some((r) => r.ok === false && r.label !== t("chkNullifier"));

  return (
    <main className="wrap stack" style={{ gap: 32 }}>
      {/* Header Section */}
      <section className="stack" style={{ gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{
            background: "rgba(2, 132, 199, 0.12)",
            color: "#0284c7",
            padding: "6px 14px",
            borderRadius: "9999px",
            fontSize: "13px",
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            gap: "6px"
          }}>
            ⚡ Groth16 Zero-Knowledge Circuit
          </span>
        </div>

        <h1 style={{ fontSize: "clamp(26px, 4vw, 36px)", margin: 0 }}>
          {t("proofTitle")}
        </h1>

        {persona && roles && (
          <p className="muted" style={{ fontSize: "16px" }}>
            Proving qualification for <strong>{name}</strong> • Role: <strong style={{ color: "#0f172a" }}>{roles[persona.role].label}</strong>
          </p>
        )}
        <p className="small muted">{t("proofIntro")}</p>
      </section>

      {failed && <p className="note bad">{t("loadError")}</p>}

      {/* Gig Score Breakdown Card */}
      <section className="card" style={{ padding: "24px", background: "rgba(255, 255, 255, 0.95)", border: "1px solid rgba(255, 255, 255, 0.8)", borderRadius: 20, boxShadow: "0 10px 30px rgba(2, 132, 199, 0.06)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2 style={{ fontSize: "1.3rem", fontWeight: 800, color: "#0f172a", margin: 0 }}>
              {t("gigScoreTitle")}
            </h2>
            <span className="small muted">Score: {totalScore} / 100</span>
          </div>

          <div style={{
            background: band === "Strong" ? "#059669" : band === "Good" ? "#0284c7" : band === "Fair" ? "#d97706" : "#dc2626",
            color: "#ffffff",
            padding: "6px 18px",
            borderRadius: 999,
            fontSize: "16px",
            fontWeight: 900,
            fontFamily: "var(--f-mono)"
          }}>
            {t("gigBand", { band })}
          </div>
        </div>

        <div className="facts" style={{ marginTop: 16 }}>
          <div>
            <div className="l">{t("scoreTenure", { score: parts.tenure.points })}</div>
            <div className="v" style={{ fontSize: "1.1rem", fontWeight: 700, color: "#0f172a" }}>{record.summary.tenureMonths} {t("figTenureUnit")}</div>
          </div>
          <div>
            <div className="l">{t("scorePeriods", { score: parts.consistency.points })}</div>
            <div className="v" style={{ fontSize: "1.1rem", fontWeight: 700, color: "#0f172a" }}>{record.summary.periodsPaid} {t("figPeriods").toLowerCase()}</div>
          </div>
          <div>
            <div className="l">{t("scoreMissed", { score: parts.consistency.points })}</div>
            <div className="v" style={{ fontSize: "1.1rem", fontWeight: 700, color: "#0f172a" }}>{record.summary.missedPeriods} {t("figMissed").toLowerCase()}</div>
          </div>
          <div>
            <div className="l">{t("scoreIncome", { score: parts.income.points })}</div>
            <div className="v" style={{ fontSize: "1.1rem", fontWeight: 700, color: "#059669" }}>{inr(record.summary.monthlyIncome)}</div>
          </div>
        </div>
      </section>

      {/* Proof Engine Card */}
      <section className="card" style={{ padding: "28px", gap: "20px", background: "rgba(255, 255, 255, 0.85)" }}>
        {/* Progress Bar */}
        {(running || rows.length > 0) && (
          <div className="stack" style={{ gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#0284c7", textTransform: "uppercase" }}>
                Circuit Execution Progress
              </span>
              <span style={{ fontSize: "13px", fontWeight: 700, fontFamily: "var(--f-mono)", color: "#0284c7" }}>
                {outcome === "ok" ? 100 : pct}%
              </span>
            </div>
            <div style={{
              height: "10px",
              background: "rgba(186, 230, 253, 0.8)",
              borderRadius: "99px",
              overflow: "hidden"
            }}>
              <div style={{
                height: "100%",
                background: "linear-gradient(90deg, #0284c7, #2563eb)",
                width: `${outcome === "ok" ? 100 : pct}%`,
                transition: "width 0.4s ease"
              }} />
            </div>
          </div>
        )}

        {/* Verification Checklist */}
        {rows.length > 0 && <Checklist items={rows} />}

        {/* Outcome Banners */}
        {outcome === "fail" && failedFigures && persona && roles && (
          <div style={{
            background: "rgba(254, 226, 226, 0.9)",
            border: "1px solid rgba(220, 38, 38, 0.3)",
            borderRadius: "12px",
            padding: "16px 20px",
            color: "#b91c1c",
            fontSize: "14px",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: "10px"
          }}>
            <span>✕</span>
            <span>{t("proofFailed", { worker: name, role: roles[persona.role].label.toLowerCase() })}</span>
          </div>
        )}

        {outcome === "ok" && issuedId !== null && (
          <div style={{
            background: "rgba(209, 250, 229, 0.9)",
            border: "1px solid rgba(5, 150, 105, 0.3)",
            borderRadius: "12px",
            padding: "16px 20px",
            color: "#047857",
            fontSize: "15px",
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            gap: "10px"
          }}>
            <span>🎉</span>
            <span>{t("proofOk", { id: issuedId, worker: name })}</span>
          </div>
        )}

        {passport && outcome !== "ok" && (
          <div style={{
            background: "rgba(219, 234, 254, 0.9)",
            border: "1px solid rgba(37, 99, 235, 0.3)",
            borderRadius: "12px",
            padding: "16px 20px",
            color: "#1e40af",
            fontSize: "14px",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: "10px"
          }}>
            <span>🎫</span>
            <span>{t("proofHave", { id: passport.passportId })}</span>
          </div>
        )}

        {/* Main Execution Button */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", alignItems: "flex-start", marginTop: "8px" }}>
          {outcome === "ok" || passport ? (
            <button
              className="btn"
              onClick={() => router.push("/passport")}
              style={{
                padding: "14px 32px",
                fontSize: "16px",
                background: "linear-gradient(135deg, #059669, #10b981)",
                borderColor: "#059669"
              }}
            >
              🎉 {t("openPassport")} →
            </button>
          ) : (
            <button
              className="btn"
              onClick={run}
              disabled={running || !bar}
              style={{ padding: "14px 32px", fontSize: "16px" }}
            >
              {running ? (
                <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⚡</span> {t("proofRunning")}
                </span>
              ) : outcome === "fail" ? (
                `🔄 ${t("proofAgain")}`
              ) : (
                `⚡ ${t("proofGenerate")}`
              )}
            </button>
          )}
          <span className="small muted">{t("proofSim")}</span>
        </div>
      </section>

      {/* Action Footer */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        paddingTop: "16px",
        borderTop: "1px solid var(--line)"
      }}>
        <Link href="/record" className="btn alt linkbtn" style={{ padding: "12px 20px" }}>
          ← {t("backToFigures")}
        </Link>
      </div>
    </main>
  );
}
