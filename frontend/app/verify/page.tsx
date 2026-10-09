"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Checklist, { type CheckItem } from "@/components/Checklist";
import { api } from "@/lib/api";
import { inr, shortHash } from "@/lib/format";
import { useLang } from "@/lib/lang";
import { checkPayload, type QrCheckKey, type QrResult } from "@/lib/qr";
import type { ScoreBand } from "@/lib/score";
import { calculateEmi, LOAN_OFFERS } from "@/lib/constants";
import { useSession } from "@/lib/session";
import type { PayResponse } from "@/lib/types";

// The lender's screen. It needs no login and no saved choices, only the QR contents.
export default function Verify() {
  const { t } = useLang();
  const { qr } = useSession();

  const [text, setText] = useState("");
  const [name, setName] = useState("SmallLoan Co.");
  const [selectedBand, setSelectedBand] = useState<"qr" | "A" | "B" | "C" | "D" | ScoreBand>("qr");
  const [result, setResult] = useState<QrResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [payResult, setPayResult] = useState<PayResponse | null>(null);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    let input = "";
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      input = params.get("data") || params.get("qr") || "";
    }
    if (!input && qr) {
      input = qr;
    }
    if (input) {
      setText(input);
    }
  }, [qr]);

  const label = (k: QrCheckKey): string =>
    ({
      readable: t("qrReadable"),
      exists: t("qrExists"),
      signature: t("qrSignature"),
      fresh: t("qrFresh"),
      notRevoked: t("qrNotRevoked"),
      notExpired: t("qrNotExpired"),
      band: t("qrBar"),
    })[k];

  const why = (k: QrCheckKey): string =>
    ({
      readable: t("whyReadable"),
      exists: t("whyExists"),
      signature: t("whySignature"),
      fresh: t("whyFresh"),
      notRevoked: t("whyNotRevoked"),
      notExpired: t("whyNotExpired"),
      band: t("whyBar"),
    })[k];

  async function check() {
    if (!text.trim()) return;
    setBusy(true);
    setResult(await checkPayload(text, selectedBand, api.getPassport));
    setBusy(false);
  }

  useEffect(() => {
    if (text.trim()) {
      void check();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, selectedBand]);

  async function payAndLog() {
    if (!p) return;
    setPaying(true);
    try {
      const res = await api.pay({
        passportId: p.passportId,
        verifier: name,
        band: selectedBand,
      });
      setPayResult(res);
    } catch {}
    setPaying(false);
  }

  const items: CheckItem[] = result ? result.checks.map((c) => ({ label: label(c.key), ok: c.ok, why: why(c.key) })) : [];
  const p = result?.passport ?? null;

  const meaningMap: Record<ScoreBand, string> = {
    Strong: t("meaningStrong"),
    Good: t("meaningGood"),
    Fair: t("meaningFair"),
    Weak: t("meaningWeak"),
  };

  return (
    <main className="wrap stack" style={{ gap: 24 }}>
      {/* Header section */}
      <section className="stack" style={{ gap: 8 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(2, 132, 199, 0.12)", border: "1px solid rgba(2, 132, 199, 0.25)", padding: "4px 12px", borderRadius: 999, width: "fit-content", color: "#0284c7", fontSize: 13, fontWeight: 700 }}>
          <span>🏢 Step 9 of 9</span>
          <span>•</span>
          <span>Verifier Portal</span>
        </div>
        <h1 style={{ fontSize: "2.2rem", fontWeight: 800, color: "#0f172a", margin: 0 }}>
          {t("verifyTitle")}
        </h1>
        <p style={{ color: "#475569", fontSize: "1.05rem", margin: 0, maxWidth: 640 }}>
          {t("verifyIntro")}
        </p>
      </section>

      {/* Input Card */}
      <section className="card" style={{ gap: 18, padding: 24, background: "rgba(255, 255, 255, 0.95)", border: "1px solid rgba(255, 255, 255, 0.8)", borderRadius: 20, boxShadow: "0 10px 30px rgba(2, 132, 199, 0.06)" }}>
        <div className="two" style={{ gap: 16 }}>
          <label className="field" style={{ gap: 6 }}>
            <span style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.95rem" }}>🏢 {t("verifierName")}</span>
            <input id="verifier-name" value={name} onChange={(e) => setName(e.target.value)} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #cbd5e1", fontSize: "0.95rem" }} />
          </label>
          <label className="field" style={{ gap: 6 }}>
            <span style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.95rem" }}>🎯 Minimum Band Required</span>
            <select
              id="band-to-check"
              value={selectedBand}
              onChange={(e) => setSelectedBand(e.target.value as any)}
              style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #cbd5e1", fontSize: "0.95rem", background: "#ffffff", fontWeight: 600 }}
            >
              <option value="qr">{t("barSameAsQr")}</option>
              <option value="A">Band A (Strong • 80+)</option>
              <option value="B">Band B (Good • 60+)</option>
              <option value="C">Band C (Fair • 40+)</option>
              <option value="D">Band D (Weak • &lt;40)</option>
            </select>
          </label>
        </div>

        <label className="field" style={{ gap: 6 }}>
          <span style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.95rem" }}>📜 {t("qrContents")}</span>
          <textarea 
            id="qr-contents" 
            className="mono" 
            value={text} 
            placeholder={t("qrPlaceholder")} 
            onChange={(e) => setText(e.target.value)}
            rows={5}
            style={{ 
              padding: 14, 
              borderRadius: 12, 
              border: "1px solid #cbd5e1", 
              fontSize: "0.85rem", 
              background: "#0f172a", 
              color: "#38bdf8",
              fontFamily: "monospace" 
            }} 
          />
        </label>

        <div className="row" style={{ gap: 12, alignItems: "center" }}>
          <button className="btn" onClick={check} disabled={busy || text.trim() === ""} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span>🔍</span>
            <span>{busy ? t("loading") : t("checkPassport")}</span>
          </button>
          <button className="btn alt" onClick={() => { if (qr) { setText(qr); setResult(null); } }} disabled={!qr} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span>📲</span>
            <span>{t("useDeviceQr")}</span>
          </button>
        </div>
        {!qr && <p className="small muted" style={{ margin: 0, fontSize: "0.85rem", color: "#64748b" }}>💡 {t("noDeviceQr")}</p>}
      </section>

      {/* Result Section */}
      {result && (
        <>
          <section className={`verdict ${result.ok ? "ok" : "bad"}`} role="status" aria-live="polite" style={{
            padding: "20px 24px",
            borderRadius: 16,
            background: result.ok ? "linear-gradient(135deg, #059669 0%, #10b981 100%)" : "linear-gradient(135deg, #e11d48 0%, #f43f5e 100%)",
            color: "#ffffff",
            boxShadow: result.ok ? "0 8px 25px rgba(16, 185, 129, 0.3)" : "0 8px 25px rgba(244, 63, 94, 0.3)",
            display: "flex",
            flexDirection: "column",
            gap: 6
          }}>
            <div className="w" style={{ fontSize: "1.8rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {result.ok ? `✓ ${t("admitted")}` : `✕ ${t("rejected")}`}
            </div>
            <div style={{ fontSize: "1rem", opacity: 0.95, fontWeight: 600 }}>
              {result.ok ? t("allChecksPassed") : result.firstFail ? why(result.firstFail) : ""} • ⚡ {result.ms} ms
            </div>
          </section>

          {/* Verification Checklist */}
          <section className="card" style={{ padding: 24, background: "rgba(255, 255, 255, 0.95)", border: "1px solid rgba(255, 255, 255, 0.8)", borderRadius: 20, boxShadow: "0 10px 30px rgba(2, 132, 199, 0.06)" }}>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#0f172a", margin: "0 0 16px 0", display: "flex", alignItems: "center", gap: 8 }}>
              <span>🛡️</span>
              <span>{t("examined")}</span>
            </h2>
            <Checklist items={items} />
          </section>

          {/* Proven Band Card */}
          {result.ok && p && (
            <section className="card" style={{ padding: 24, background: "rgba(255, 255, 255, 0.95)", border: "1px solid rgba(255, 255, 255, 0.8)", borderRadius: 20, boxShadow: "0 10px 30px rgba(2, 132, 199, 0.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
                <div>
                  <h2 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#0f172a", margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                    <span>🎯</span>
                    <span>Proven Stability Band</span>
                  </h2>
                  <span className="small muted">Certified Zero-Knowledge Credit Rating</span>
                </div>

                <div style={{
                  background: p.band === "Strong" ? "#059669" : p.band === "Good" ? "#0284c7" : p.band === "Fair" ? "#d97706" : "#dc2626",
                  color: "#ffffff",
                  padding: "6px 18px",
                  borderRadius: 999,
                  fontSize: "16px",
                  fontWeight: 900,
                  fontFamily: "var(--f-mono)"
                }}>
                  BAND {p.band ?? "Strong"}
                </div>
              </div>

              {/* Pay & Log Action Button */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12, alignItems: "flex-start" }}>
                {payResult ? (
                  <div style={{
                    background: "rgba(209, 250, 229, 0.9)",
                    border: "1px solid rgba(5, 150, 105, 0.3)",
                    padding: "12px 18px",
                    borderRadius: 12,
                    color: "#047857",
                    fontWeight: 700,
                    fontSize: "14px"
                  }}>
                    ✓ {t("payLogged", { hash: shortHash(payResult.txHash, 10, 4) })} • Receipt #{payResult.receiptId}
                  </div>
                ) : (
                  <button
                    className="btn"
                    onClick={payAndLog}
                    disabled={paying}
                    style={{
                      padding: "12px 28px",
                      fontSize: "15px",
                      background: "linear-gradient(135deg, #059669, #10b981)",
                      borderColor: "#059669"
                    }}
                  >
                    💳 {t("payAndLog")} (Band: {selectedBand === "qr" ? (p.band ?? "Strong") : selectedBand})
                  </button>
                )}
              </div>
            </section>
          )}

          {/* Loan Offer Card (Shown only after verdict is ADMITTED) */}
          {result.ok && p && (() => {
            const band: ScoreBand = p.band ?? "Strong";
            const offer = LOAN_OFFERS[band];
            const emi = calculateEmi(offer.maxAmount, offer.annualRatePct, offer.maxMonths);

            return (
              <section className="card" style={{ padding: 24, background: "rgba(255, 255, 255, 0.95)", border: "1px solid rgba(255, 255, 255, 0.8)", borderRadius: 20, boxShadow: "0 10px 30px rgba(2, 132, 199, 0.06)" }}>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <h2 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#0f172a", margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                    <span>💳</span>
                    <span>{t("loanOfferTitle")}</span>
                  </h2>
                  <span className="tag sim">{t("demoOfferTag")}</span>
                </div>

                <p style={{ fontSize: "0.95rem", color: "#334155", fontWeight: 600, marginBottom: 16 }}>
                  Band {band}: {meaningMap[band]}
                </p>

                {offer.offered ? (
                  <div className="facts" style={{ marginBottom: 16 }}>
                    <div>
                      <div className="l">{t("loanMaxAmount")}</div>
                      <div className="v" style={{ fontSize: "1.1rem", fontWeight: 700, color: "#0f172a" }}>{inr(offer.maxAmount)}</div>
                    </div>
                    <div>
                      <div className="l">{t("loanInterestRate")}</div>
                      <div className="v" style={{ fontSize: "1.1rem", fontWeight: 700, color: "#0f172a" }}>{offer.annualRatePct}% {t("loanPerYear")}</div>
                    </div>
                    <div>
                      <div className="l">{t("loanTerm")}</div>
                      <div className="v" style={{ fontSize: "1.1rem", fontWeight: 700, color: "#0f172a" }}>{offer.maxMonths} {t("loanMonths")}</div>
                    </div>
                    <div>
                      <div className="l">{t("loanMonthlyEmi")}</div>
                      <div className="v" style={{ fontSize: "1.1rem", fontWeight: 700, color: "#0284c7" }}>{inr(emi)} {t("loanPerMonth")}</div>
                    </div>
                  </div>
                ) : (
                  <div className="note warn" style={{ marginBottom: 16 }}>
                    {t("noLoanOfferedNote")}
                  </div>
                )}

                <p className="small muted" style={{ margin: 0, fontSize: "0.85rem", color: "#64748b" }}>
                  ℹ️ {t("loanOfferDisclaimer")}
                </p>
              </section>
            );
          })()}
        </>
      )}

      {/* Public On-Chain Record */}
      {p && (
        <section className="card" style={{ padding: 24, background: "rgba(255, 255, 255, 0.95)", border: "1px solid rgba(255, 255, 255, 0.8)", borderRadius: 20, boxShadow: "0 10px 30px rgba(2, 132, 199, 0.06)" }}>
          <h2 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#0f172a", margin: "0 0 16px 0", display: "flex", alignItems: "center", gap: 8 }}>
            <span>🔗</span>
            <span>{t("storedPublic")}</span>
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 14 }}>
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600 }}>{t("publicNumber")}</div>
              <div className="mono" style={{ fontSize: "1.05rem", fontWeight: 700, color: "#0f172a", marginTop: 2 }}>{p.passportId}</div>
            </div>
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600 }}>{t("publicCommit")}</div>
              <div className="mono" style={{ fontSize: "0.95rem", fontWeight: 700, color: "#0284c7", marginTop: 2 }}>{shortHash(p.commitment, 12, 6)}</div>
            </div>
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600 }}>{t("publicIssued")}</div>
              <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#0f172a", marginTop: 2 }}>{p.issuedAt.slice(0, 10)}</div>
            </div>
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600 }}>{t("publicRevoked")}</div>
              <div style={{ fontSize: "0.95rem", fontWeight: 700, color: p.revoked ? "#e11d48" : "#059669", marginTop: 2 }}>
                {p.revoked ? `⚠️ ${t("publicYes")}` : `✓ ${t("publicNo")}`}
              </div>
            </div>
          </div>
          <p className="small muted" style={{ margin: 0, fontSize: "0.85rem", color: "#64748b" }}>🔒 {t("publicNone")}</p>
        </section>
      )}

      {/* Navigation Footer */}
      <div className="row" style={{ justifyContent: "flex-start", marginTop: 8 }}>
        <Link href="/show" className="btn alt linkbtn" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span>←</span>
          <span>{t("back")}</span>
        </Link>
      </div>
    </main>
  );
}

