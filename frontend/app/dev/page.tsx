"use client";

import { useEffect, useState } from "react";
import { api, usingMocks } from "@/lib/api";
import { inr, shortHash } from "@/lib/format";
import type { Persona } from "@/lib/personas";
import { ApiError, type ConsentArtefact, type FiResponse, type RolesDto } from "@/lib/types";

// Developer page. Runs consent -> approve -> bank record against the api layer.
// Not part of the product. Delete it when the real screens are done.
export default function Dev() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [roles, setRoles] = useState<RolesDto | null>(null);
  const [personaId, setPersonaId] = useState(1);
  const [consent, setConsent] = useState<ConsentArtefact | null>(null);
  const [fi, setFi] = useState<FiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const persona = personas.find((p) => p.id === personaId);
  const bar = persona && roles ? roles[persona.role] : null;

  useEffect(() => {
    Promise.all([api.personas(), api.roles()])
      .then(([p, r]) => {
        setPersonas(p);
        setRoles(r);
      })
      .catch((e: unknown) => setError(e instanceof ApiError ? `${e.code}: ${e.message}` : String(e)));
  }, []);

  useEffect(() => {
    setConsent(null);
    setFi(null);
    setError(null);
  }, [personaId]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? `${e.code}: ${e.message}` : String(e));
    } finally {
      setBusy(false);
    }
  }

  const create = () => run(async () => { setFi(null); setConsent(await api.createConsent(personaId)); });
  const approve = () => run(async () => { if (consent) setConsent(await api.approveConsent(consent.consentId)); });
  const fetchFi = () => run(async () => { if (consent) setFi(await api.fiFetch(consent.consentId)); });
  const addPayer = () =>
    run(async () => {
      const first = fi?.payers.unidentified.find((u) => u.payer.startsWith("swiggy"));
      if (!first || !consent) return;
      const oldest = fi!.rows.filter((r) => r.payer === first.payer).map((r) => r.date).sort()[0];
      await api.addPayer("SWIGGY", first.payer, oldest);
      setFi(await api.fiFetch(consent.consentId));
    });
  const reset = () => run(async () => { await api.reset(); setConsent(null); setFi(null); });

  const s = fi?.summary;
  const pass = (v: boolean) => ({ color: v ? "var(--ok)" : "var(--bad)" });

  return (
    <main className="wrap stack">
      <header className="stack" style={{ gap: 6 }}>
        <h1>Dev: API layer</h1>
        <p className="muted small">
          Source: <b>{usingMocks ? "mock backend (in memory)" : "real backend"}</b>. Set
          NEXT_PUBLIC_USE_MOCKS in .env.local to switch.
        </p>
      </header>

      <section className="card">
        <div className="row">
          <select id="persona" aria-label="Worker" value={personaId} onChange={(e) => setPersonaId(+e.target.value)}>
            {personas.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({roles ? roles[p.role].label : p.role})</option>
            ))}
          </select>
          <button className="btn" onClick={create} disabled={busy}>1. Create consent</button>
          <button className="btn" onClick={approve} disabled={busy || !consent || consent.status === "approved"}>2. Approve</button>
          <button className="btn" onClick={fetchFi} disabled={busy || !consent}>3. Fetch bank record</button>
          <button className="btn alt" onClick={reset} disabled={busy}>Reset</button>
        </div>
        {error && <p className="note bad">{error}</p>}
        {consent && (
          <p className="mono">
            {consent.consentId} · {consent.status} · expires {new Date(consent.expiresAt).toLocaleTimeString()}
          </p>
        )}
      </section>

      {fi && s && persona && bar && (
        <>
          <section className="card">
            <h3>Four figures (bar: {persona.name}&apos;s role)</h3>
            <div className="row" style={{ gap: 16 }}>
              <span style={pass(s.tenureMonths >= bar.minTenure)}>Tenure {s.tenureMonths} mo (need {bar.minTenure})</span>
              <span style={pass(s.periodsPaid >= bar.minPeriods)}>Weeks paid {s.periodsPaid} (need {bar.minPeriods})</span>
              <span style={pass(s.missedPeriods <= bar.maxMissed)}>Missed {s.missedPeriods} (max {bar.maxMissed})</span>
              <span style={pass(s.monthlyIncome >= bar.minIncome)}>Income {inr(s.monthlyIncome)} (need {inr(bar.minIncome)})</span>
            </div>
            <p className="mono muted">
              account {fi.maskedAccount} · holder {shortHash(fi.holderHash, 12)} · issuer {fi.issuerKeyId} · stamp {shortHash(fi.issuerSignature.S, 12)}
            </p>
          </section>

          <section className="card">
            <h3>Payers</h3>
            <p className="small">Known: <span className="mono">{fi.payers.known.join(", ")}</span></p>
            {fi.payers.unidentified.length === 0 ? (
              <p className="note ok">Every credit came from a known payer.</p>
            ) : (
              fi.payers.unidentified.map((u) => (
                <p className="note warn" key={u.payer}>
                  <span className="mono">{u.payer}</span>: {u.credits} credits, {inr(u.total)}, not counted
                </p>
              ))
            )}
            {fi.payers.unidentified.some((u) => u.payer.startsWith("swiggy")) && (
              <button className="btn alt" onClick={addPayer} disabled={busy} style={{ alignSelf: "flex-start" }}>
                Add the new Swiggy payer and refetch
              </button>
            )}
          </section>

          <section className="card">
            <h3>Latest 8 of {fi.rows.length} rows</h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
                <tbody>
                  {fi.rows.slice(0, 8).map((r, i) => (
                    <tr key={i} style={{ color: r.counted ? "var(--ink)" : "var(--muted)" }}>
                      <td style={{ padding: "4px 8px", whiteSpace: "nowrap" }}>{r.date}</td>
                      <td style={{ padding: "4px 8px", textAlign: "right" }}>{r.type === "CR" ? "+" : "-"}{r.amount.toLocaleString("en-IN")}</td>
                      <td className="mono" style={{ padding: "4px 8px", whiteSpace: "nowrap" }}>{r.narration}</td>
                      <td style={{ padding: "4px 8px" }}>{r.counted ? "counted" : r.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
