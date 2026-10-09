"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Checklist, { type CheckItem } from "@/components/Checklist";
import { api } from "@/lib/api";
import { useLang } from "@/lib/lang";
import {
  checkPayload,
  makePayload,
  signedMessage,
  type QrCheckKey,
  type QrPayload,
  type QrResult,
} from "@/lib/qr";
import type { ScoreBand } from "@/lib/score";
import { useSession } from "@/lib/session";
import { getWallet } from "@/lib/wallet";
import { ApiError, type Passport } from "@/lib/types";

export default function Forge() {
  const { t } = useLang();
  const { ready, passport, personaId } = useSession();
  const router = useRouter();

  const [card, setCard] = useState<Passport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeTest, setActiveTest] = useState<string | null>(null);
  const [activeResult, setActiveResult] = useState<QrResult | null>(null);
  const [activePayloadText, setActivePayloadText] = useState<string | null>(null);

  const passportId = passport?.passportId ?? null;

  useEffect(() => {
    if (ready && !passport) router.replace("/proof");
  }, [ready, passport, router]);

  useEffect(() => {
    if (passportId === null) return;
    api
      .getPassport(passportId)
      .then(setCard)
      .catch((e: unknown) =>
        setError(e instanceof ApiError ? e.message : t("loadError"))
      );
  }, [passportId, t]);

  const label = (k: QrCheckKey): string =>
    ({
      readable: t("qrReadable"),
      exists: t("qrExists"),
      signature: t("qrSignature"),
      fresh: t("whyFresh"),
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

  // Helper to run a test payload through checkPayload
  async function runCheck(
    testName: string,
    payloadObj: QrPayload,
    customGetPassport?: (id: number) => Promise<Passport>,
    nowOverride?: number
  ) {
    if (!card) return;
    setBusy(true);
    setActiveTest(testName);
    const text = JSON.stringify(payloadObj);
    setActivePayloadText(text);

    const getPassportFn = customGetPassport ?? api.getPassport;
    const now = nowOverride ?? Date.now();

    const res = await checkPayload(text, "qr", getPassportFn, now);
    setActiveResult(res);
    setBusy(false);
  }

  // 0. Original Valid QR
  async function testOriginal() {
    if (!card || personaId === null) return;
    const now = Date.now();
    const wallet = await getWallet(personaId);
    const payload = await makePayload(wallet, card, now);
    await runCheck(t("forgeRealQr"), payload, undefined, now);
  }

  // 1. Edit the band in the QR (should fail signature check)
  async function testEditBand() {
    if (!card || personaId === null) return;
    const now = Date.now();
    const wallet = await getWallet(personaId);
    const payload = await makePayload(wallet, card, now);
    const currentBand: ScoreBand = payload.band;
    const tamperedBand: ScoreBand = currentBand === "Strong" ? "Weak" : "Strong";

    const tamperedPayload: QrPayload = {
      ...payload,
      band: tamperedBand,
    };
    await runCheck(t("forgeTamper1"), tamperedPayload, undefined, now);
  }

  // 2. Replace signature with another wallet's (should fail signature check)
  async function testReplaceSignature() {
    if (!card || personaId === null) return;
    const now = Date.now();
    const otherWallet = await getWallet(99999); // different wallet
    const payload = await makePayload(await getWallet(personaId), card, now);

    const otherSig = await otherWallet.sign(
      signedMessage(card.passportId, payload.band, payload.exp)
    );

    const tamperedPayload: QrPayload = {
      ...payload,
      sig: otherSig,
      pub: otherWallet.publicHex,
    };
    await runCheck(t("forgeTamper2"), tamperedPayload, undefined, now);
  }

  // 3. Replay old QR after 60 seconds (should fail fresh check)
  async function testReplayOld() {
    if (!card || personaId === null) return;
    const now = Date.now();
    const pastNow = now - 65_000; // generated 65s in the past
    const wallet = await getWallet(personaId);
    const oldPayload = await makePayload(wallet, card, pastNow);

    await runCheck(t("forgeTamper3"), oldPayload, undefined, now);
  }

  // 4. Check a revoked passport (should fail not revoked check)
  async function testCheckRevoked() {
    if (!card || personaId === null) return;
    const now = Date.now();
    const wallet = await getWallet(personaId);
    const payload = await makePayload(wallet, card, now);

    // Provide a getPassport fn that returns revoked: true
    const customGetPassport = async (id: number): Promise<Passport> => {
      const real = await api.getPassport(id);
      return { ...real, revoked: true };
    };

    await runCheck(t("forgeTamper4"), payload, customGetPassport, now);
  }

  if (!passport) return null;

  const items: CheckItem[] = activeResult
    ? activeResult.checks.map((c) => ({
        label: label(c.key),
        ok: c.ok,
        why: why(c.key),
      }))
    : [];

  const chainChecksList = [
    { key: "readable", title: t("qrReadable"), desc: t("chkReadableDesc") },
    { key: "exists", title: t("qrExists"), desc: t("chkExistsDesc") },
    { key: "signature", title: t("qrSignature"), desc: t("chkSignatureDesc") },
    { key: "fresh", title: t("whyFresh"), desc: t("chkFreshDesc") },
    { key: "notRevoked", title: t("qrNotRevoked"), desc: t("chkNotRevokedDesc") },
    { key: "notExpired", title: t("qrNotExpired"), desc: t("chkNotExpiredDesc") },
    { key: "band", title: t("qrBar"), desc: t("chkBandDesc") },
  ];

  return (
    <main className="wrap stack" style={{ gap: 24 }}>
      {/* Header section */}
      <section className="stack" style={{ gap: 8 }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: "rgba(225, 29, 72, 0.12)",
            border: "1px solid rgba(225, 29, 72, 0.25)",
            padding: "4px 12px",
            borderRadius: 999,
            width: "fit-content",
            color: "#e11d48",
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          <span>🧪 Security Testing Lab</span>
          <span>•</span>
          <span>Attack Simulations</span>
        </div>
        <h1 style={{ fontSize: "2.2rem", fontWeight: 800, color: "#0f172a", margin: 0 }}>
          {t("forgeTitle")}
        </h1>
        <p style={{ color: "#475569", fontSize: "1.05rem", margin: 0, maxWidth: 680 }}>
          {t("forgeIntro")}
        </p>
      </section>

      {error && <p className="note bad">{error}</p>}

      {/* Control Buttons Panel */}
      <section
        className="card"
        style={{
          padding: 24,
          background: "rgba(255, 255, 255, 0.95)",
          border: "1px solid rgba(255, 255, 255, 0.8)",
          borderRadius: 20,
          boxShadow: "0 10px 30px rgba(2, 132, 199, 0.06)",
          gap: 16,
        }}
      >
        <h2 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#0f172a", margin: 0 }}>
          ⚡ Select a Forgery or Security Test
        </h2>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
          {/* Button 0: Original Valid QR */}
          <button
            className="btn"
            onClick={testOriginal}
            disabled={busy || !card}
            style={{
              padding: "16px",
              textAlign: "left",
              background: activeTest === t("forgeRealQr") ? "linear-gradient(135deg, #059669, #10b981)" : "linear-gradient(135deg, #0284c7, #2563eb)",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <div style={{ fontWeight: 800, fontSize: "1rem" }}>✓ {t("forgeRealQr")}</div>
            <div style={{ fontSize: "0.8rem", opacity: 0.9, fontWeight: 500 }}>
              Test unaltered QR payload signed by owner wallet.
            </div>
          </button>

          {/* Button 1: Edit Band */}
          <button
            className="btn alt"
            onClick={testEditBand}
            disabled={busy || !card}
            style={{
              padding: "16px",
              textAlign: "left",
              border: "1px solid #cbd5e1",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <div style={{ fontWeight: 800, fontSize: "0.95rem", color: "#b91c1c" }}>
              🛠️ {t("forgeTamper1")}
            </div>
            <div style={{ fontSize: "0.8rem", color: "#475569" }}>
              {t("forgeTamper1Desc")}
            </div>
          </button>

          {/* Button 2: Replace Signature */}
          <button
            className="btn alt"
            onClick={testReplaceSignature}
            disabled={busy || !card}
            style={{
              padding: "16px",
              textAlign: "left",
              border: "1px solid #cbd5e1",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <div style={{ fontWeight: 800, fontSize: "0.95rem", color: "#b91c1c" }}>
              🔑 {t("forgeTamper2")}
            </div>
            <div style={{ fontSize: "0.8rem", color: "#475569" }}>
              {t("forgeTamper2Desc")}
            </div>
          </button>

          {/* Button 3: Replay Old QR */}
          <button
            className="btn alt"
            onClick={testReplayOld}
            disabled={busy || !card}
            style={{
              padding: "16px",
              textAlign: "left",
              border: "1px solid #cbd5e1",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <div style={{ fontWeight: 800, fontSize: "0.95rem", color: "#b91c1c" }}>
              ⏱️ {t("forgeTamper3")}
            </div>
            <div style={{ fontSize: "0.8rem", color: "#475569" }}>
              {t("forgeTamper3Desc")}
            </div>
          </button>

          {/* Button 4: Check Revoked Passport */}
          <button
            className="btn alt"
            onClick={testCheckRevoked}
            disabled={busy || !card}
            style={{
              padding: "16px",
              textAlign: "left",
              border: "1px solid #cbd5e1",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <div style={{ fontWeight: 800, fontSize: "0.95rem", color: "#b91c1c" }}>
              🚫 {t("forgeTamper4")}
            </div>
            <div style={{ fontSize: "0.8rem", color: "#475569" }}>
              {t("forgeTamper4Desc")}
            </div>
          </button>
        </div>
      </section>

      {/* Active Test Verdict & Checklist Section */}
      {activeResult && activeTest && (
        <div className="stack" style={{ gap: 20 }}>
          {/* Verdict Banner */}
          <section
            className={`verdict ${activeResult.ok ? "ok" : "bad"}`}
            role="status"
            aria-live="polite"
            style={{
              padding: "20px 24px",
              borderRadius: 16,
              background: activeResult.ok
                ? "linear-gradient(135deg, #059669 0%, #10b981 100%)"
                : "linear-gradient(135deg, #e11d48 0%, #f43f5e 100%)",
              color: "#ffffff",
              boxShadow: activeResult.ok
                ? "0 8px 25px rgba(16, 185, 129, 0.3)"
                : "0 8px 25px rgba(244, 63, 94, 0.3)",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <div style={{ fontSize: "0.9rem", fontWeight: 700, textTransform: "uppercase", opacity: 0.9 }}>
              Test: {activeTest}
            </div>
            <div className="w" style={{ fontSize: "1.8rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {activeResult.ok ? `✓ ${t("admitted")}` : `✕ ${t("rejected")}`}
            </div>
            <div style={{ fontSize: "1rem", opacity: 0.95, fontWeight: 600 }}>
              {activeResult.ok
                ? t("allChecksPassed")
                : activeResult.firstFail
                ? `Failed Check: ${label(activeResult.firstFail)} — ${why(activeResult.firstFail)}`
                : ""}{" "}
              • ⚡ {activeResult.ms} ms
            </div>
          </section>

          {/* Verification Checklist */}
          <section
            className="card"
            style={{
              padding: 24,
              background: "rgba(255, 255, 255, 0.95)",
              border: "1px solid rgba(255, 255, 255, 0.8)",
              borderRadius: 20,
              boxShadow: "0 10px 30px rgba(2, 132, 199, 0.06)",
            }}
          >
            <h2
              style={{
                fontSize: "1.2rem",
                fontWeight: 700,
                color: "#0f172a",
                margin: "0 0 16px 0",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span>🛡️</span>
              <span>{t("examined")}</span>
            </h2>
            <Checklist items={items} />
          </section>

          {/* Raw Payload Inspector */}
          {activePayloadText && (
            <details className="card" style={{ background: "rgba(255, 255, 255, 0.9)", padding: 16 }}>
              <summary style={{ fontWeight: 700, color: "#0f172a", cursor: "pointer" }}>
                📜 Inspect Tampered QR Payload
              </summary>
              <pre
                style={{
                  marginTop: 12,
                  background: "#0f172a",
                  color: "#38bdf8",
                  padding: 16,
                  borderRadius: 12,
                  fontSize: "0.85rem",
                  fontFamily: "monospace",
                }}
              >
                {JSON.stringify(JSON.parse(activePayloadText), null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}

      {/* Panel: What the chain examines */}
      <section
        className="card"
        style={{
          padding: 24,
          background: "rgba(255, 255, 255, 0.95)",
          border: "1px solid rgba(255, 255, 255, 0.8)",
          borderRadius: 20,
          boxShadow: "0 10px 30px rgba(2, 132, 199, 0.06)",
          gap: 16,
        }}
      >
        <div>
          <h2 style={{ fontSize: "1.3rem", fontWeight: 800, color: "#0f172a", margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <span>🔗</span>
            <span>{t("whatChainExaminesTitle")}</span>
          </h2>
          <p className="small muted" style={{ marginTop: 4 }}>
            {t("whatChainExaminesSub")}
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
          {chainChecksList.map((c, i) => (
            <div
              key={c.key}
              style={{
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 12,
                padding: 14,
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    background: "#0284c7",
                    color: "#ffffff",
                    fontSize: 11,
                    fontWeight: 800,
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {i + 1}
                </span>
                <span style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.95rem" }}>
                  {c.title}
                </span>
              </div>
              <p style={{ fontSize: "0.85rem", color: "#475569", margin: 0, lineHeight: 1.4 }}>
                {c.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Navigation Footer */}
      <div className="row" style={{ justifyContent: "flex-start", marginTop: 8 }}>
        <Link href="/passport" className="btn alt linkbtn" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span>←</span>
          <span>{t("back")}</span>
        </Link>
      </div>
    </main>
  );
}
