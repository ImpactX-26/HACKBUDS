"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { inr, shortHash } from "@/lib/format";
import { useLang } from "@/lib/lang";
import { calculateGigScore } from "../../../contracts/integration/gig-score.mjs";

export default function LiveWorkerJourney() {
  const { t } = useLang();

  // Session & On-chain State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionData, setSessionData] = useState<{
    rpcUrl: string;
    setupId: string;
    fixtureHolder: string;
    passport: any;
    identityState: any;
  } | null>(null);

  // Workflow Selection & Execution States
  const [consumer, setConsumer] = useState<"welfare" | "loan">("loan");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [stepLog, setStepLog] = useState<string[]>([]);

  // Generated Artifacts
  const [approvedReq, setApprovedReq] = useState<any | null>(null);
  const [zkProofPackage, setZkProofPackage] = useState<any | null>(null);
  const [verifyOutcome, setVerifyOutcome] = useState<any | null>(null);
  const [claimReceipt, setClaimReceipt] = useState<any | null>(null);
  const [borrowReceipt, setBorrowReceipt] = useState<any | null>(null);
  const [repayReceipt, setRepayReceipt] = useState<any | null>(null);

  // Load live session & passport state
  async function loadSession() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/backend/session");
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed to load session");
      setSessionData(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSession();
  }, []);

  function log(msg: string) {
    setStepLog((prev) => [msg, ...prev]);
  }

  // 1. Fetch Policy & Generate Worker EIP-712 Approval
  async function handleGetApproval() {
    try {
      setBusyAction("approval");
      log(`Fetching ${consumer} verifier policy & generating EVM worker approval signature...`);
      const res = await fetch(`/api/backend/policy?consumer=${consumer}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);

      setApprovedReq(data.request);
      setZkProofPackage(null);
      setVerifyOutcome(null);
      log(`✓ Worker EVM EIP-712 approval generated for ${consumer} policy.`);
    } catch (err: any) {
      log(`✕ Approval error: ${err.message}`);
    } finally {
      setBusyAction(null);
    }
  }

  // 2. Call Private Prover Bridge
  async function handleGenerateProof() {
    if (!approvedReq) return;
    try {
      setBusyAction("proving");
      const start = performance.now();
      log(`Requesting 29-signal ZK Groth16 proof via authenticated private prover bridge...`);

      const res = await fetch("/api/backend/prove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request: approvedReq }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);

      const elapsed = ((performance.now() - start) / 1000).toFixed(2);
      setZkProofPackage(data.proof);
      log(`✓ 29-signal ZK Groth16 proof generated in ${elapsed}s! (${data.proof.publicSignals.length} public signals)`);
    } catch (err: any) {
      log(`✕ Proving error: ${err.message}`);
    } finally {
      setBusyAction(null);
    }
  }

  // 3. Verify on Solidity Contract
  async function handleVerifySolidity() {
    if (!approvedReq || !zkProofPackage) return;
    try {
      setBusyAction("verify");
      log(`Verifying proof on-chain against EligibilityGateV02 & Groth16Verifier...`);

      const res = await fetch("/api/backend/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request: approvedReq, proof: zkProofPackage }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);

      setVerifyOutcome(data.verification);
      log(`✓ Solidity verification output: ${JSON.stringify(data.verification)}`);
    } catch (err: any) {
      log(`✕ Verification error: ${err.message}`);
    } finally {
      setBusyAction(null);
    }
  }

  // 4. Claim Welfare
  async function handleClaim() {
    if (!approvedReq || !zkProofPackage) return;
    try {
      setBusyAction("claim");
      log(`Executing Welfare Claim transaction...`);

      const res = await fetch("/api/backend/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request: approvedReq, proof: zkProofPackage }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);

      setClaimReceipt(data.tx);
      log(`✓ Welfare Claim Mined! Tx Hash: ${data.tx.hash} (Status: ${data.tx.status})`);
      await loadSession();
    } catch (err: any) {
      log(`✕ Claim error: ${err.message}`);
    } finally {
      setBusyAction(null);
    }
  }

  // 5. Borrow 100 MockUSDC
  async function handleBorrow() {
    if (!approvedReq || !zkProofPackage) return;
    try {
      setBusyAction("borrow");
      log(`Executing 100 MockUSDC Borrow transaction...`);

      const res = await fetch("/api/backend/borrow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request: approvedReq, proof: zkProofPackage }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);

      setBorrowReceipt(data.tx);
      log(`✓ 100 MockUSDC Borrow Mined! Tx Hash: ${data.tx.hash} (Status: ${data.tx.status})`);
      await loadSession();
    } catch (err: any) {
      log(`✕ Borrow error: ${err.message}`);
    } finally {
      setBusyAction(null);
    }
  }

  // 6. Repay Loan
  async function handleRepay() {
    try {
      setBusyAction("repay");
      log(`Executing Repayment flow (Approve Allowance + Repay Loan)...`);

      const res = await fetch("/api/backend/repay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passportId: "1" }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);

      setRepayReceipt(data);
      log(`✓ Approve Tx Hash: ${data.approveTx.hash}`);
      log(`✓ Repay Loan Mined! Tx Hash: ${data.repayTx.hash} (Status: ${data.repayTx.status})`);
      await loadSession();
    } catch (err: any) {
      log(`✕ Repayment error: ${err.message}`);
    } finally {
      setBusyAction(null);
    }
  }

  // Frontend-only Gig Score Calculation (Ramesh Kumar fixture: 34 mos tenure, 150 wks paid, 0 missed, ₹19,402 income)
  const scoreResult = calculateGigScore({
    tenureMonths: 34,
    weeksPaid: 150,
    missedWeeks: 0,
    averageMonthlyIncomePaise: "1940200",
  });
  const scoreBand = scoreResult.score >= 80 ? "Strong" : scoreResult.score >= 60 ? "Good" : scoreResult.score >= 40 ? "Fair" : "Weak";

  return (
    <main className="wrap stack" style={{ gap: 28 }}>
      {/* Header Banner */}
      <section className="stack" style={{ gap: 8 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(2, 132, 199, 0.12)", border: "1px solid rgba(2, 132, 199, 0.25)", padding: "4px 12px", borderRadius: 999, width: "fit-content", color: "#0284c7", fontSize: 13, fontWeight: 700 }}>
          <span>⚡ Live Worker Journey</span>
          <span>•</span>
          <span>Backend B Checkpoint 4e1afaa</span>
        </div>
        <h1 style={{ fontSize: "2.2rem", fontWeight: 800, color: "#0f172a", margin: 0 }}>
          Local ZK Circuit & Smart Contract Journey
        </h1>
        <p style={{ color: "#475569", fontSize: "1.05rem", margin: 0, maxWidth: 720 }}>
          Interactive worker flow executing actual passport reads, explicit EVM approvals, 29-signal ZK proving, Solidity verification, claim, 100 MockUSDC borrow, and loan repayment.
        </p>
      </section>

      {error && (
        <div className="note bad" style={{ padding: "16px 20px", borderRadius: 12 }}>
          <strong>Error loading live session:</strong> {error}
        </div>
      )}

      {loading && <p className="muted">Connecting to local session...</p>}

      {sessionData && (
        <>
          {/* Card 1: Live On-Chain Passport & Identity State */}
          <section className="card" style={{ padding: 24, background: "rgba(255, 255, 255, 0.95)", border: "1px solid rgba(255, 255, 255, 0.8)", borderRadius: 20, boxShadow: "0 10px 30px rgba(2, 132, 199, 0.06)", display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: "#0f172a", margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                <span>📜</span> On-Chain Passport #{sessionData.passport.passportId} State
              </h2>
              <span style={{ background: "#059669", color: "#ffffff", padding: "4px 14px", borderRadius: 999, fontSize: 13, fontWeight: 700 }}>
                {sessionData.passport.status}
              </span>
            </div>

            <div className="facts" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
              <div style={{ background: "#f8fafc", padding: 12, borderRadius: 10, border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Holder Wallet</div>
                <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: "#0284c7", marginTop: 2 }}>{shortHash(sessionData.passport.holderWallet, 10, 4)}</div>
              </div>

              <div style={{ background: "#f8fafc", padding: 12, borderRadius: 10, border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Identity Nullifier</div>
                <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginTop: 2 }}>{shortHash(sessionData.passport.identityNullifierHash, 8, 4)}</div>
              </div>

              <div style={{ background: "#f8fafc", padding: 12, borderRadius: 10, border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Evidence Commitment</div>
                <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginTop: 2 }}>{shortHash(sessionData.passport.evidenceCommitment, 8, 4)}</div>
              </div>

              <div style={{ background: "rgba(2, 132, 199, 0.08)", padding: 12, borderRadius: 10, border: "1px solid rgba(2, 132, 199, 0.3)" }}>
                <div style={{ fontSize: 11, color: "#0284c7", fontWeight: 700, textTransform: "uppercase" }}>Current Principal Debt</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: sessionData.identityState.principal !== "0" ? "#dc2626" : "#059669", marginTop: 2 }}>
                  {sessionData.identityState.principal !== "0" ? `${Number(sessionData.identityState.principal) / 1e6} MockUSDC` : "0 MockUSDC"}
                </div>
              </div>
            </div>
          </section>

          {/* Card 2: Interactive Worker Execution Steps */}
          <section className="card" style={{ padding: 24, background: "rgba(255, 255, 255, 0.95)", border: "1px solid rgba(255, 255, 255, 0.8)", borderRadius: 20, boxShadow: "0 10px 30px rgba(2, 132, 199, 0.06)", display: "flex", flexDirection: "column", gap: 20 }}>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: "#0f172a", margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <span>🚀</span> Interactive Worker Action Controls
            </h2>

            {/* Selector */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <label style={{ fontWeight: 700, color: "#0f172a", fontSize: 14 }}>Select Flow Type:</label>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className={`btn ${consumer === "loan" ? "" : "alt"}`}
                  onClick={() => { setConsumer("loan"); setApprovedReq(null); setZkProofPackage(null); setVerifyOutcome(null); }}
                  style={{ padding: "8px 18px", fontSize: 14 }}
                >
                  💳 Micro-Loan (100 MockUSDC)
                </button>
                <button
                  className={`btn ${consumer === "welfare" ? "" : "alt"}`}
                  onClick={() => { setConsumer("welfare"); setApprovedReq(null); setZkProofPackage(null); setVerifyOutcome(null); }}
                  style={{ padding: "8px 18px", fontSize: 14 }}
                >
                  🛡️ Welfare Voucher Claim
                </button>
              </div>
            </div>

            {/* Workflow Buttons */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
              <button
                className="btn"
                onClick={handleGetApproval}
                disabled={busyAction !== null}
                style={{ padding: "12px 18px", fontSize: 14 }}
              >
                {busyAction === "approval" ? "⏳ Fetching Policy..." : "1️⃣ Obtain EVM Worker Approval"}
              </button>

              <button
                className="btn"
                onClick={handleGenerateProof}
                disabled={!approvedReq || busyAction !== null}
                style={{ padding: "12px 18px", fontSize: 14, background: approvedReq ? "linear-gradient(135deg, #0284c7, #2563eb)" : undefined }}
              >
                {busyAction === "proving" ? "⚡ Generating 29-Signal Proof..." : "2️⃣ Generate ZK Proof via Bridge"}
              </button>

              <button
                className="btn"
                onClick={handleVerifySolidity}
                disabled={!zkProofPackage || busyAction !== null}
                style={{ padding: "12px 18px", fontSize: 14, background: zkProofPackage ? "linear-gradient(135deg, #059669, #10b981)" : undefined }}
              >
                {busyAction === "verify" ? "🔍 Verifying..." : "3️⃣ Verify Proof on Solidity"}
              </button>

              {consumer === "welfare" ? (
                <button
                  className="btn"
                  onClick={handleClaim}
                  disabled={!zkProofPackage || busyAction !== null}
                  style={{ padding: "12px 18px", fontSize: 14, background: "linear-gradient(135deg, #d97706, #f59e0b)" }}
                >
                  {busyAction === "claim" ? "⏳ Claiming..." : "4️⃣ Claim Welfare Voucher"}
                </button>
              ) : (
                <button
                  className="btn"
                  onClick={handleBorrow}
                  disabled={!zkProofPackage || busyAction !== null}
                  style={{ padding: "12px 18px", fontSize: 14, background: "linear-gradient(135deg, #d97706, #f59e0b)" }}
                >
                  {busyAction === "borrow" ? "⏳ Borrowing..." : "4️⃣ Borrow 100 MockUSDC"}
                </button>
              )}

              <button
                className="btn alt"
                onClick={handleRepay}
                disabled={sessionData.identityState.principal === "0" || busyAction !== null}
                style={{ padding: "12px 18px", fontSize: 14, borderColor: "#dc2626", color: "#dc2626" }}
              >
                {busyAction === "repay" ? "⏳ Repaying..." : "5️⃣ Repay Loan (Approve + Repay)"}
              </button>
            </div>

            {/* Display Generated Artifacts & Receipts */}
            {verifyOutcome && (
              <div style={{ background: "rgba(209, 250, 229, 0.9)", border: "1px solid rgba(5, 150, 105, 0.4)", borderRadius: 12, padding: "14px 18px", color: "#047857" }}>
                <strong style={{ display: "block", marginBottom: 4 }}>✓ Solidity Verification Result:</strong>
                <pre style={{ margin: 0, fontSize: 12, fontFamily: "monospace" }}>{JSON.stringify(verifyOutcome, null, 2)}</pre>
              </div>
            )}

            {claimReceipt && (
              <div style={{ background: "rgba(254, 243, 199, 0.9)", border: "1px solid rgba(217, 119, 6, 0.4)", borderRadius: 12, padding: "14px 18px", color: "#b45309" }}>
                <strong>✓ Welfare Claim Mined!</strong> Tx Hash: <code className="mono">{claimReceipt.hash}</code> (Status: {claimReceipt.status})
              </div>
            )}

            {borrowReceipt && (
              <div style={{ background: "rgba(254, 243, 199, 0.9)", border: "1px solid rgba(217, 119, 6, 0.4)", borderRadius: 12, padding: "14px 18px", color: "#b45309" }}>
                <strong>✓ 100 MockUSDC Borrow Mined!</strong> Tx Hash: <code className="mono">{borrowReceipt.hash}</code> (Status: {borrowReceipt.status})
              </div>
            )}

            {repayReceipt && (
              <div style={{ background: "rgba(209, 250, 229, 0.9)", border: "1px solid rgba(5, 150, 105, 0.4)", borderRadius: 12, padding: "14px 18px", color: "#047857" }}>
                <div><strong>✓ Repayment Flow Mined!</strong></div>
                <div>• Approve Tx: <code className="mono">{repayReceipt.approveTx.hash}</code></div>
                <div>• Repay Tx: <code className="mono">{repayReceipt.repayTx.hash}</code></div>
              </div>
            )}

            {/* Live Step Execution Log */}
            {stepLog.length > 0 && (
              <div style={{ background: "#0f172a", borderRadius: 12, padding: 14, color: "#38bdf8", fontSize: 12, fontFamily: "monospace", display: "flex", flexDirection: "column", gap: 4, maxHeight: 180, overflowY: "auto" }}>
                <span style={{ color: "#94a3b8", fontSize: 10, textTransform: "uppercase", fontWeight: 700 }}>Execution Terminal Log</span>
                {stepLog.map((line, idx) => (
                  <div key={idx}>{line}</div>
                ))}
              </div>
            )}
          </section>

          {/* Card 3: Frontend Gig Score Separation */}
          <section className="card" style={{ padding: 24, background: "rgba(255, 255, 255, 0.95)", border: "1px solid rgba(255, 255, 255, 0.8)", borderRadius: 20, boxShadow: "0 10px 30px rgba(2, 132, 199, 0.06)", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
              <div>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0f172a", margin: 0 }}>
                  Frontend Gig Score (Worker UI Display Only)
                </h3>
                <span className="small muted">Calculated via official calculateGigScore from contracts/integration/gig-score.mjs</span>
              </div>
              <div style={{ background: "#059669", color: "#ffffff", padding: "4px 16px", borderRadius: 999, fontWeight: 900, fontFamily: "var(--f-mono)" }}>
                Score: {scoreResult.score} / 100 ({scoreBand})
              </div>
            </div>

            <p style={{ fontSize: "0.85rem", color: "#64748b", margin: 0, lineHeight: 1.5, background: "rgba(2, 132, 199, 0.06)", padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(2, 132, 199, 0.2)" }}>
              ℹ️ <strong>Strict Isolation Guarantee:</strong> Gig score and categories are computed in browser memory solely to personalize worker cards and band badges. They are <strong>never</strong> transmitted to the ZK prover or verifier, and do not alter smart contract eligibility.
            </p>
          </section>
        </>
      )}

      {/* Navigation Footer */}
      <div className="row" style={{ justifyContent: "flex-start", marginTop: 8 }}>
        <Link href="/proof" className="btn alt linkbtn">
          ← Back to Proof Overview
        </Link>
      </div>
    </main>
  );
}
