"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import FourFigures from "@/components/FourFigures";
import PayerCheck from "@/components/PayerCheck";
import RowsTable from "@/components/RowsTable";
import { api } from "@/lib/api";
import { shortHash } from "@/lib/format";
import { useLang } from "@/lib/lang";
import type { Candidate } from "@/lib/payers";
import type { Persona } from "@/lib/personas";
import { useSession } from "@/lib/session";
import { ApiError, type FiResponse, type RolesDto } from "@/lib/types";

const PAGE = 10;

export default function Record() {
  const { t, lang } = useLang();
  const { ready, consent, personaId, update } = useSession();
  const router = useRouter();

  const [fi, setFi] = useState<FiResponse | null>(null);
  const [roles, setRoles] = useState<RolesDto | null>(null);
  const [persona, setPersona] = useState<Persona | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(PAGE);

  const consentId = consent?.consentId ?? null;

  useEffect(() => {
    if (ready && !consent) router.replace("/consent");
  }, [ready, consent, router]);

  // Keep only the four figures and the stamp. The rows stay in this page and are never saved.
  const remember = useCallback(
    (r: FiResponse) =>
      update({
        record: {
          consentId: r.consentId,
          summary: r.summary,
          holderHash: r.holderHash,
          issuerSignature: r.issuerSignature,
          issuerKeyId: r.issuerKeyId,
        },
      }),
    [update],
  );

  const load = useCallback(async () => {
    if (!consentId) return;
    setError(null);
    try {
      const [r, rl, ps] = await Promise.all([api.fiFetch(consentId), api.roles(), api.personas()]);
      setFi(r);
      setRoles(rl);
      setPersona(ps.find((p) => p.id === personaId) ?? null);
      remember(r);
    } catch (e) {
      setError(e instanceof ApiError ? { code: e.code, message: e.message } : { code: "unknown", message: t("loadError") });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consentId, personaId, remember]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addPayer(c: Candidate) {
    if (!consentId) return;
    setBusy(true);
    try {
      await api.addPayer(c.platform, c.payer, c.from);
      const next = await api.fiFetch(consentId);
      setFi(next);
      remember(next);
    } catch (e) {
      setError(e instanceof ApiError ? { code: e.code, message: e.message } : { code: "unknown", message: t("loadError") });
    } finally {
      setBusy(false);
    }
  }

  if (!consent) return null;

  const lost = error && (error.code === "consent_not_found" || error.code === "consent_expired");
  const bar = persona && roles ? roles[persona.role] : null;

  return (
    <main className="wrap stack" style={{ gap: 32 }}>
      {/* Header Section */}
      <section className="stack" style={{ gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
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
              🏦 Verified Financial Record
            </span>
          </div>

          {fi?.simulated && (
            <span className="tag sim" style={{
              background: "rgba(37, 99, 235, 0.1)",
              color: "#2563eb",
              border: "1px solid rgba(37, 99, 235, 0.3)",
              fontSize: "12px",
              padding: "4px 12px",
              borderRadius: "99px",
              fontWeight: 600
            }}>
              {t("simTag")}
            </span>
          )}
        </div>

        <h1 style={{ fontSize: "clamp(26px, 4vw, 36px)", margin: 0 }}>
          {t("recordTitle")}
        </h1>

        {persona && (
          <p className="muted" style={{ fontSize: "16px" }}>
            Account Statement for <strong>{lang === "kn" ? persona.nameKn : persona.name}</strong> • Acc: <strong style={{ color: "#0f172a" }}>{fi?.maskedAccount}</strong>
          </p>
        )}
        <p className="small muted">{t("recordSubtitle")}</p>
      </section>

      {!fi && !error && <p className="muted">{t("fetching")}</p>}

      {error && (
        <div className="note bad stack" style={{ gap: 8, alignItems: "flex-start" }}>
          <span>{lost ? t("permissionLost") : error.message}</span>
          <button className="btn alt" onClick={() => (lost ? router.push("/consent") : void load())}>
            {lost ? t("approveAgain") : t("retry")}
          </button>
        </div>
      )}

      {fi && bar && (
        <>
          {/* Section 1: The Four Qualification Figures */}
          <section className="card" aria-labelledby="figs-h" style={{ padding: "24px", gap: "16px", background: "rgba(255, 255, 255, 0.85)" }}>
            <div>
              <h2 id="figs-h" style={{ fontSize: "20px", color: "#0f172a" }}>{t("figuresTitle")}</h2>
              <p className="small muted" style={{ marginTop: "4px" }}>{t("figuresSub")}</p>
            </div>

            <FourFigures summary={fi.summary} bar={bar} />

            {/* Digital Bank Stamp Signature Box */}
            <div style={{
              background: "rgba(37, 99, 235, 0.06)",
              border: "1px solid rgba(37, 99, 235, 0.2)",
              borderRadius: "12px",
              padding: "16px 20px",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              marginTop: "8px"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#2563eb", fontWeight: 700, fontSize: "14px" }}>
                <span>📜 {t("stampTitle")}</span>
              </div>
              <p className="small" style={{ color: "#334155", margin: 0 }}>
                {t("stampBody")}
              </p>
              <div style={{
                fontFamily: "var(--f-mono)",
                fontSize: "12px",
                color: "#1e293b",
                background: "rgba(255, 255, 255, 0.8)",
                padding: "8px 12px",
                borderRadius: "6px",
                border: "1px solid rgba(203, 213, 225, 0.8)",
                marginTop: "4px"
              }}>
                Key ID: {fi.issuerKeyId} • Sig: {shortHash(fi.issuerSignature.S, 16, 6)}
              </div>
            </div>
          </section>

          {/* Section 2: Recognized Payers */}
          <section className="card" aria-labelledby="payers-h" style={{ padding: "24px", background: "rgba(255, 255, 255, 0.85)" }}>
            <h2 id="payers-h" style={{ fontSize: "20px", color: "#0f172a", marginBottom: "8px" }}>{t("payersTitle")}</h2>
            <PayerCheck fi={fi} busy={busy} onAdd={addPayer} />
          </section>

          {/* Section 3: Transaction Ledger Table */}
          <section className="card" style={{ padding: "24px", background: "rgba(255, 255, 255, 0.85)" }}>
            <RowsTable rows={fi.rows} shown={shown} onMore={() => setShown((n) => n + PAGE)} />
          </section>

          {/* Action Footer */}
          <div style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            paddingTop: "16px",
            borderTop: "1px solid var(--line)"
          }}>
            <button
              className="btn"
              onClick={() => router.push("/bind")}
              style={{ padding: "14px 32px", fontSize: "16px" }}
            >
              {t("continueAadhaar")} →
            </button>
          </div>
        </>
      )}
    </main>
  );
}
