"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { shortHash } from "@/lib/format";
import { useLang } from "@/lib/lang";
import { calculateGigScore } from "../../../contracts/integration/gig-score.mjs";
import {BrowserProvider, JsonRpcProvider, TypedDataEncoder, verifyTypedData} from "ethers";

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
  const [useLocalWallet, setUseLocalWallet] = useState(true);
  const [policyData, setPolicyData] = useState<any | null>(null);
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
    } catch {
      setSessionData({
        rpcUrl: "http://127.0.0.1:8545",
        setupId: "1",
        fixtureHolder: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        passport: {
          passportId: "1",
          status: "ACTIVE",
          holderWallet: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
          identityNullifierHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
          evidenceCommitment: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        },
        identityState: {
          principal: "0",
        },
      });
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

  async function signWorkerTypedData(domain:any,types:any,value:any) {
    if(!sessionData)throw new Error("Load the local session first");
    const holder=sessionData.passport.holderWallet;
    let signature:string;
    if(useLocalWallet){
      // Explicit local synthetic mode: unlocked loopback Ganache account, no key export.
      const provider=new JsonRpcProvider(sessionData.rpcUrl);
      try {signature=await provider.send("eth_signTypedData_v4",[holder,TypedDataEncoder.getPayload(domain,types,value)]);}
      finally {provider.destroy();}
    }else{
      const ethereum=(window as any).ethereum;if(!ethereum)throw new Error("Connect an EVM wallet, or select the local synthetic development wallet");
      const provider=new BrowserProvider(ethereum);await provider.send("eth_requestAccounts",[]);
      const signer=await provider.getSigner();
      if((await signer.getAddress()).toLowerCase()!==holder.toLowerCase())throw new Error("Connected wallet is not this passport's holder");
      signature=await signer.signTypedData(domain,types,value);
    }
    if(verifyTypedData(domain,types,value,signature).toLowerCase()!==holder.toLowerCase())throw new Error("Worker signature verification failed");
    return signature;
  }
  async function handleGetPolicyAndApprove() {
    try {
      setBusyAction("policy");setApprovedReq(null);setZkProofPackage(null);setVerifyOutcome(null);
      const p=await fetch(`/api/backend/policy?consumer=${consumer}`).then(r=>r.json());
      if(!p.ok)throw new Error(p.error);setPolicyData(p.policyRequest);
      const c=await fetch("/api/backend/auth/challenge",{method:"POST"}).then(r=>r.json());
      if(!c.ok)throw new Error(c.error);
      const loginSignature=await signWorkerTypedData(c.challenge.domain,c.challenge.types,c.challenge.value);
      const login=await fetch("/api/backend/auth/verify",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({nonce:c.challenge.value.nonce,signature:loginSignature})}).then(r=>r.json());
      if(!login.ok)throw new Error(login.error);
      // Separate real signature over B's exact live policy/domain/current evidence.
      const workerSignature=await signWorkerTypedData(p.approval.domain,p.approval.types,p.approval.value);
      setApprovedReq({...p.policyRequest,workerSignature});
      log("✓ Wallet ownership authenticated; exact worker EIP-712 approval signed and verified.");
    }catch(err:any){log(`✕ Approval error: ${err.message}`);}
    finally{setBusyAction(null);}
  }

  // 2. Call Private Prover Bridge (with verified caller session context)
  async function handleGenerateProof(invalidAuth = false) {
    if (!approvedReq) return;
    try {
      setBusyAction("proving");
      const start = performance.now();
      const callerWallet = invalidAuth ? "0x0000000000000000000000000000000000000099" : sessionData?.fixtureHolder;

      log(`Requesting 29-signal ZK Groth16 proof (caller wallet: ${shortHash(callerWallet || "", 6, 4)})...`);

      const res = await fetch("/api/backend/prove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: invalidAuth ? "omit" : "same-origin",
        body: JSON.stringify({ request: approvedReq }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);

      const elapsed = ((performance.now() - start) / 1000).toFixed(2);
      setZkProofPackage(data.proof);
      log(`✓ 29-signal ZK Groth16 proof generated in ${elapsed}s! (${data.proof.publicSignals.length} public signals)`);
    } catch (err: any) {
      log(`✕ Proving rejected as expected: ${err.message}`);
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
  async function handleClaim(invalidAuth = false) {
    if (!approvedReq || !zkProofPackage) return;
    try {
      setBusyAction("claim");
      const callerWallet = invalidAuth ? "0x0000000000000000000000000000000000000099" : sessionData?.fixtureHolder;
      log(`Executing Welfare Claim transaction...`);

      const res = await fetch("/api/backend/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: invalidAuth ? "omit" : "same-origin",
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
  async function handleBorrow(invalidAuth = false) {
    if (!approvedReq || !zkProofPackage) return;
    try {
      setBusyAction("borrow");
      const callerWallet = invalidAuth ? "0x0000000000000000000000000000000000000099" : sessionData?.fixtureHolder;
      log(`Executing 100 MockUSDC Borrow transaction...`);

      const res = await fetch("/api/backend/borrow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: invalidAuth ? "omit" : "same-origin",
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
  async function handleRepay(invalidAuth = false) {
    try {
      setBusyAction("repay");
      const callerWallet = invalidAuth ? "0x0000000000000000000000000000000000000099" : sessionData?.fixtureHolder;
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
      {/* Synthetic Evidence Notice Banner */}
      <section style={{
        background: "rgba(254, 243, 199, 0.95)",
        border: "2px solid #f59e0b",
        borderRadius: "16px",
        padding: "16px 20px",
        color: "#b45309",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 12
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22 }}>⚠️</span>
          <div>
            <strong style={{ fontSize: 15, display: "block" }}>Backend B Synthetic Evidence Fixture Active</strong>
            <span style={{ fontSize: 13, opacity: 0.9 }}>Operating on Backend B synthetic fixture data. Not connected to live Backend A HTTP service yet.</span>
          </div>
        </div>
        <span style={{ background: "#d97706", color: "#ffffff", padding: "4px 12px", borderRadius: 999, fontSize: 12, fontWeight: 800 }}>
          SYNTHETIC B FIXTURE
        </span>
      </section>

      {/* Header Banner */}
      <section className="stack" style={{ gap: 8 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(2, 132, 199, 0.12)", border: "1px solid rgba(2, 132, 199, 0.25)", padding: "4px 12px", borderRadius: 999, width: "fit-content", color: "#0284c7", fontSize: 13, fontWeight: 700 }}>
          <span>⚡ Live Worker Journey</span>
          <span>•</span>
          <span>Strict Authorization Boundary</span>
        </div>
        <h1 style={{ fontSize: "2.2rem", fontWeight: 800, color: "#0f172a", margin: 0 }}>
          Local ZK Circuit & Smart Contract Journey
        </h1>
        <p style={{ color: "#475569", fontSize: "1.05rem", margin: 0, maxWidth: 720 }}>
          Interactive worker flow enforcing explicit EVM EIP-712 approvals, per-caller verified session bridge context, 29-signal ZK proving, Solidity verification, claim, 100 MockUSDC borrow, and repayment.
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

          {/* Card 2: Interactive Worker Action Controls */}
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
                  onClick={() => { setConsumer("loan"); setPolicyData(null); setApprovedReq(null); setZkProofPackage(null); setVerifyOutcome(null); }}
                  style={{ padding: "8px 18px", fontSize: 14 }}
                >
                  💳 Micro-Loan (100 MockUSDC)
                </button>
                <button
                  className={`btn ${consumer === "welfare" ? "" : "alt"}`}
                  onClick={() => { setConsumer("welfare"); setPolicyData(null); setApprovedReq(null); setZkProofPackage(null); setVerifyOutcome(null); }}
                  style={{ padding: "8px 18px", fontSize: 14 }}
                >
                  🛡️ Welfare Voucher Claim
                </button>
              </div>
            </div>

            <label style={{display:"block",marginBottom:12}}>
              <input type="checkbox" checked={useLocalWallet} onChange={e=>setUseLocalWallet(e.target.checked)} />
              {" "}Use local synthetic EVM development wallet (unlocked loopback account; test funds only).
            </label>
            {/* Policy & Approval Display */}
            {policyData && (
              <div style={{ background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: 12, padding: 14, fontSize: 13 }}>
                <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: 6 }}>📜 Verifier Signed Policy Criteria (without calling fixtureApproval):</div>
                <div className="facts" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
                  <div><strong>Verifier ID:</strong> {shortHash(policyData.policy.verifierId, 8, 4)}</div>
                  <div><strong>Min Income:</strong> ₹{Number(policyData.policy.minAverageIncomePaise) / 100}/mo</div>
                  <div><strong>Min Periods:</strong> {policyData.policy.minActivePeriods} {policyData.policy.activityIsWeekly === "1" ? "completed weeks" : "completed months"}</div>
                  <div><strong>Max Evidence Age:</strong> {policyData.policy.maxEvidenceAgeDays} days</div>
                </div>
              </div>
            )}

            {/* Workflow Buttons */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
              <button
                className="btn"
                onClick={handleGetPolicyAndApprove}
                disabled={busyAction !== null}
                style={{ padding: "12px 18px", fontSize: 14 }}
              >
                {busyAction === "policy" ? "⏳ Signing Approval..." : "1️⃣ Fetch Policy & Sign EVM Worker Approval"}
              </button>

              <button
                className="btn"
                onClick={() => handleGenerateProof(false)}
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
                  onClick={() => handleClaim(false)}
                  disabled={!zkProofPackage || busyAction !== null}
                  style={{ padding: "12px 18px", fontSize: 14, background: "linear-gradient(135deg, #d97706, #f59e0b)" }}
                >
                  {busyAction === "claim" ? "⏳ Claiming..." : "4️⃣ Claim Welfare Voucher"}
                </button>
              ) : (
                <button
                  className="btn"
                  onClick={() => handleBorrow(false)}
                  disabled={!zkProofPackage || busyAction !== null}
                  style={{ padding: "12px 18px", fontSize: 14, background: "linear-gradient(135deg, #d97706, #f59e0b)" }}
                >
                  {busyAction === "borrow" ? "⏳ Borrowing..." : "4️⃣ Borrow 100 MockUSDC"}
                </button>
              )}

              <button
                className="btn alt"
                onClick={() => handleRepay(false)}
                disabled={sessionData.identityState.principal === "0" || busyAction !== null}
                style={{ padding: "12px 18px", fontSize: 14, borderColor: "#dc2626", color: "#dc2626" }}
              >
                {busyAction === "repay" ? "⏳ Repaying..." : "5️⃣ Repay Loan (Approve + Repay)"}
              </button>
            </div>

            {/* Authorization Security Rejection Tests */}
            <div style={{ marginTop: 8, padding: 14, background: "rgba(239, 68, 68, 0.06)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontWeight: 700, color: "#b91c1c", fontSize: 13 }}>🛡️ Security Test Controls (Verify Rejections):</span>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  className="btn alt"
                  onClick={() => handleGenerateProof(true)}
                  disabled={!approvedReq || busyAction !== null}
                  style={{ fontSize: 12, padding: "6px 12px", color: "#b91c1c", borderColor: "#ef4444" }}
                >
                  🧪 Test Unauthorized Proving Rejection
                </button>
                <button
                  className="btn alt"
                  onClick={() => handleBorrow(true)}
                  disabled={!zkProofPackage || busyAction !== null}
                  style={{ fontSize: 12, padding: "6px 12px", color: "#b91c1c", borderColor: "#ef4444" }}
                >
                  🧪 Test Unauthorized Borrow Rejection
                </button>
              </div>
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
                <span className="small muted">Illustrative score example, not derived from this passport. Calculated via official calculateGigScore.</span>
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
