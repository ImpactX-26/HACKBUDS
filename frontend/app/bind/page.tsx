"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Checklist from "@/components/Checklist";
import { api } from "@/lib/api";
import { scanSampleAadhaar, type AadhaarResult } from "@/lib/aadhaar";
import { shortHash } from "@/lib/format";
import { useLang } from "@/lib/lang";
import type { Persona } from "@/lib/personas";
import { useSession } from "@/lib/session";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export default function Bind() {
  const { t, lang } = useLang();
  const { ready, record, personaId, bind, update } = useSession();
  const router = useRouter();
  const [persona, setPersona] = useState<Persona | null>(null);
  const [phase, setPhase] = useState<"idle" | "reading" | "checking" | "done">("idle");
  const [fresh, setFresh] = useState<AadhaarResult | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (ready && !record) router.replace("/record");
  }, [ready, record, router]);

  useEffect(() => {
    if (personaId === null) return;
    api.personas().then((all) => setPersona(all.find((p) => p.id === personaId) ?? null)).catch(() => setFailed(true));
  }, [personaId]);

  // A refresh keeps the saved result. A new scan replaces it.
  const result: AadhaarResult | null = fresh ?? (bind ? { last4: bind.last4, nameMatches: true, nullifier: bind.nullifier } : null);
  const scanning = phase === "reading" || phase === "checking";

  async function scan() {
    if (!persona) return;
    setFresh(null);
    setPhase("reading");
    await sleep(800);
    setPhase("checking");
    await sleep(800);
    // The sample card carries the worker's name. The bank record carries the same name in this demo.
    const r = await scanSampleAadhaar(persona, persona.name);
    setFresh(r);
    update({ bind: r.nameMatches ? { last4: r.last4, nullifier: r.nullifier } : null });
    setPhase("done");
  }

  if (!record) return null;

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
            🪪 Identity Binding & Verification
          </span>
        </div>

        <h1 style={{ fontSize: "clamp(26px, 4vw, 36px)", margin: 0 }}>
          {t("bindTitle")}
        </h1>

        {persona && (
          <p className="muted" style={{ fontSize: "16px" }}>
            Scanning Aadhaar for <strong>{lang === "kn" ? persona.nameKn : persona.name}</strong>
          </p>
        )}
        <p className="small muted">{t("bindIntro")}</p>
      </section>

      {failed && <p className="note bad">{t("loadError")}</p>}

      {/* Main Card Section */}
      <section className="card" style={{ padding: "28px", gap: "20px", background: "rgba(255, 255, 255, 0.85)" }}>
        {/* Scan Progress Bar */}
        {scanning && (
          <div className="stack" style={{ gap: 12 }} role="status">
            <div style={{
              height: "10px",
              background: "rgba(186, 230, 253, 0.8)",
              borderRadius: "99px",
              overflow: "hidden"
            }}>
              <div style={{
                height: "100%",
                background: "linear-gradient(90deg, #0284c7, #2563eb)",
                width: phase === "reading" ? "45%" : "85%",
                transition: "width 0.8s ease"
              }} />
            </div>
            <p className="small muted" style={{ textAlign: "center", fontWeight: 600, color: "#0284c7" }}>
              {phase === "reading" ? `📷 ${t("bindReading")}` : `🔍 ${t("bindChecking")}`}
            </p>
          </div>
        )}

        {/* Verification Checklist */}
        {result && !scanning && (
          <div className="stack" style={{ gap: 16 }}>
            <Checklist
              items={[
                { label: t("bindReadOk", { last4: result.last4 }), ok: true },
                { label: t("bindNameOk"), ok: result.nameMatches, why: t("bindNameFail") },
                { label: `${t("bindNullifier")}: ${shortHash(result.nullifier, 12, 6)}`, ok: result.nameMatches },
              ]}
            />

            {/* Privacy Note */}
            <div style={{
              background: "rgba(2, 132, 199, 0.08)",
              border: "1px solid rgba(2, 132, 199, 0.2)",
              borderRadius: "12px",
              padding: "16px 20px",
              display: "flex",
              flexDirection: "column",
              gap: "6px"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#0284c7", fontWeight: 700, fontSize: "14px" }}>
                <span>🔒 Privacy Protection Guarantee</span>
              </div>
              <p className="small" style={{ color: "#334155", margin: 0, lineHeight: 1.5 }}>
                {t("bindPrivacy")}
              </p>
            </div>
          </div>
        )}

        {/* Scan Action Controls */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", alignItems: "flex-start", marginTop: "8px" }}>
          <button
            className="btn"
            onClick={scan}
            disabled={!persona || scanning}
            style={{
              padding: "12px 24px",
              fontSize: "15px",
              background: result ? "rgba(255, 255, 255, 0.9)" : "linear-gradient(135deg, #0284c7, #2563eb)",
              color: result ? "#0f172a" : "#ffffff",
              border: result ? "1px solid rgba(186, 230, 253, 0.8)" : "none"
            }}
          >
            {result ? `🔄 ${t("bindScanAgain")}` : `📷 ${t("bindScan")}`}
          </button>
          <span className="small muted">{t("bindTestMode")}</span>
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
          ← Back to Bank Record
        </Link>

        <button
          className="btn"
          disabled={!result || !result.nameMatches || scanning}
          onClick={() => router.push("/proof")}
          style={{ padding: "14px 28px", fontSize: "15px" }}
        >
          {t("continueProof")} →
        </button>
      </div>
    </main>
  );
}
