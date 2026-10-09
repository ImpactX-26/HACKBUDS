"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { inr, shortHash } from "@/lib/format";
import { useLang } from "@/lib/lang";
import type { Persona } from "@/lib/personas";
import { bandOf, gigScore } from "@/lib/score";
import { mockProof } from "@/lib/prove";
import { useSession } from "@/lib/session";
import { ApiError, type Passport, type RolesDto } from "@/lib/types";
import { calculateGigScore } from "../../../contracts/integration/gig-score.mjs";
import { BrowserProvider, JsonRpcProvider, TypedDataEncoder, verifyTypedData, verifyMessage, hexlify, toUtf8Bytes } from "ethers";

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export default function PassportPage() {
  const { t, lang } = useLang();
  const { ready, passport, bind, personaId, reset } = useSession();
  const router = useRouter();

  const [card, setCard] = useState<Passport | null>(null);
  const [persona, setPersona] = useState<Persona | null>(null);
  const [roles, setRoles] = useState<RolesDto | null>(null);
  const [lost, setLost] = useState(false);
  const [failed, setFailed] = useState(false);
  const [second, setSecond] = useState<{ ok: boolean; text: string } | null>(null);

  // Live Backend Session State
  const [sessionData, setSessionData] = useState<{
    rpcUrl: string;
    setupId: string;
    fixtureHolder: string;
    passport: any;
    identityState: any;
    evidenceSource?: any;
  } | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [consumer, setConsumer] = useState<"welfare" | "loan">("loan");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [stepLog, setStepLog] = useState<string[]>([]);
  const [useLocalWallet, setUseLocalWallet] = useState(true);

  // Generated Artifacts & Receipts
  const [policyData, setPolicyData] = useState<any | null>(null);
  const [policyPayload, setPolicyPayload] = useState<any | null>(null);
  const [approvedReq, setApprovedReq] = useState<any | null>(null);
  const [zkProofPackage, setZkProofPackage] = useState<any | null>(null);
  const [verifyOutcome, setVerifyOutcome] = useState<any | null>(null);
  const [claimReceipt, setClaimReceipt] = useState<any | null>(null);
  const [borrowReceipt, setBorrowReceipt] = useState<any | null>(null);
  const [repayReceipt, setRepayReceipt] = useState<any | null>(null);

  const passportId = passport?.passportId ?? 1;

  async function loadBackendSession() {
    try {
      setSessionLoading(true);
      const res = await fetch("/api/backend/session");
      const data = await res.json();
      if (data.ok) {
        setSessionData(data);
      }
    } catch {
      // Backend session fallback
    } finally {
      setSessionLoading(false);
    }
  }

  useEffect(() => {
    void loadBackendSession();
    if (new URLSearchParams(window.location.search).get("consumer") === "welfare") setConsumer("welfare");
  }, []);

  useEffect(() => {
    let active = true;
    setPolicyPayload(null);
    fetch(`/api/backend/policy?consumer=${consumer}`).then(r => r.json()).then(p => {
      if (active && p.ok) { setPolicyPayload(p); setPolicyData(p.policyRequest); }
    }).catch(() => {});
    return () => { active = false; };
  }, [consumer]);

  useEffect(() => {
    Promise.all([api.personas(), api.roles()])
      .then(([ps, rl]) => {
        const p = sessionData ? ps.find((item) => item.name === "Ramesh Kumar") ?? ps[0] : ps.find((item) => item.id === personaId) ?? ps[0];
        setPersona(p);
        setRoles(rl);

        if (sessionData) {
          setLost(false);
          setFailed(false);
          setCard({
            passportId: Number(sessionData.passport.passportId),
            owner: sessionData.passport.holderWallet,
            holderWallet: sessionData.passport.holderWallet,
            role: "food",
            provenMinTenure: 34,
            provenMinPeriods: 150,
            provenMaxMissed: 0,
            provenMinIncome: 1940200,
            commitment: sessionData.passport.evidenceCommitment,
            issuedAt: new Date(Number(sessionData.passport.issuedAt) * 1000).toISOString(),
            revoked: sessionData.passport.status !== "ACTIVE",
            expiry: "2027-12-31T00:00:00Z",
            band: "Strong",
          });
        } else if (passport?.passportId) {
          api.getPassport(passportId)
            .then((c) => setCard(c))
            .catch((e: unknown) => (e instanceof ApiError && e.code === "passport_not_found" ? setLost(true) : setFailed(true)));
        }
      })
      .catch(() => setFailed(true));
  }, [passportId, personaId, sessionData, sessionLoading]);

  function log(msg: string) {
    setStepLog((prev) => [msg, ...prev]);
  }

  async function signWorkerTypedData(domain: any, types: any, value: any) {
    if (!sessionData) throw new Error("Backend session loading...");
    const holder = sessionData.passport.holderWallet;
    let signature: string;
    if (useLocalWallet) {
      const provider = new JsonRpcProvider(sessionData.rpcUrl);
      try {
        signature = await provider.send("eth_signTypedData_v4", [holder, TypedDataEncoder.getPayload(domain, types, value)]);
      } finally {
        provider.destroy();
      }
    } else {
      const ethereum = (window as any).ethereum;
      if (!ethereum) throw new Error("Connect EVM wallet or use local synthetic dev wallet");
      const provider = new BrowserProvider(ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      if ((await signer.getAddress()).toLowerCase() !== holder.toLowerCase()) {
        throw new Error("Connected wallet is not this passport's holder");
      }
      signature = await signer.signTypedData(domain, types, value);
    }
    if (verifyTypedData(domain, types, value, signature).toLowerCase() !== holder.toLowerCase()) {
      throw new Error("Worker signature verification failed");
    }
    return signature;
  }

  async function handleGetPolicyAndApprove() {
    if (busyAction) return;
    try {
      setBusyAction("policy");
      setApprovedReq(null);
      setZkProofPackage(null);
      setVerifyOutcome(null);
      log("Fetching verifier signed policy (without calling fixtureApproval)...");
      const p = policyPayload;
      if (!p || p.policyRequest.consumer !== consumer) throw new Error("Wait for the exact signed policy to load.");
      if (!p.ok) throw new Error(p.error);
      setPolicyData(p.policyRequest);

      log("Requesting login challenge for session authentication...");
      const c = await fetch("/api/backend/auth/challenge", { method: "POST" }).then((r) => r.json());
      if (!c.ok) throw new Error(c.error);

      const loginSignature = await signWorkerTypedData(c.challenge.domain, c.challenge.types, c.challenge.value);
      const login = await fetch("/api/backend/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nonce: c.challenge.value.nonce, signature: loginSignature }),
      }).then((r) => r.json());
      if (!login.ok) throw new Error(login.error);

      const workerSignature = await signWorkerTypedData(p.approval.domain, p.approval.types, p.approval.value);
      let evidenceHandle=p.policyRequest.evidenceHandle;
      if(sessionData?.evidenceSource?.mode==="backend-a-http"){
        const a=await fetch("/api/backend/reconstruction",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"}).then(r=>r.json());if(!a.ok)throw Error(a.error);
        const {value,message}=a.authorization;let reconstructionSignature:string;
        if(useLocalWallet){const provider=new JsonRpcProvider(sessionData.rpcUrl);try{reconstructionSignature=await provider.send("eth_sign",[sessionData.passport.holderWallet,hexlify(toUtf8Bytes(message))]);}finally{provider.destroy();}}
        else{const provider=new BrowserProvider((window as any).ethereum);reconstructionSignature=await (await provider.getSigner()).signMessage(message);}
        if(verifyMessage(message,reconstructionSignature).toLowerCase()!==sessionData.passport.holderWallet.toLowerCase())throw Error("A reconstruction signature invalid");
        const registered=await fetch("/api/backend/reconstruction",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({walletAuthorization:{...value,signature:reconstructionSignature}})}).then(r=>r.json());if(!registered.ok)throw Error(registered.error);
        evidenceHandle=registered.evidenceHandle;
        log("✓ Worker authorized authenticated Backend A reconstruction.");
      }
      setApprovedReq({ ...p.policyRequest, workerSignature, evidenceHandle });
      log("✓ Authenticated session active. Exact EIP-712 worker approval signed!");
    } catch (err: any) {
      log(`✕ Policy/Approval error: ${err.message}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleGenerateProof(invalidAuth = false) {
    if (!approvedReq || busyAction) return;
    try {
      setBusyAction("proving");
      const start = performance.now();
      log("Requesting 29-signal ZK Groth16 proof via authenticated bridge...");
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
      log(`✓ 29-signal ZK Groth16 proof generated in ${elapsed}s! (${data.proof.publicSignals.length} signals)`);
    } catch (err: any) {
      log(`✕ Proving output: ${err.message}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleVerifySolidity() {
    if (!approvedReq || !zkProofPackage || busyAction) return;
    try {
      setBusyAction("verify");
      log("Verifying proof on-chain against EligibilityGateV02 & Groth16Verifier...");
      const res = await fetch("/api/backend/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request: approvedReq, proof: zkProofPackage }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setVerifyOutcome(data.verification);
      log(`✓ Solidity verification: ${JSON.stringify(data.verification)}`);
    } catch (err: any) {
      log(`✕ Verification error: ${err.message}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleClaim(invalidAuth = false) {
    if (!approvedReq || !zkProofPackage || busyAction) return;
    try {
      setBusyAction("claim");
      log("Executing Welfare Claim transaction...");
      const res = await fetch("/api/backend/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: invalidAuth ? "omit" : "same-origin",
        body: JSON.stringify({ request: approvedReq, proof: zkProofPackage }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setClaimReceipt(data.tx);
      log(`✓ Welfare Claim Mined! Tx Hash: ${data.tx.hash}`);
      await loadBackendSession();
    } catch (err: any) {
      log(`✕ Claim error: ${err.message}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleBorrow(invalidAuth = false) {
    if (!approvedReq || !zkProofPackage || busyAction) return;
    try {
      setBusyAction("borrow");
      log("Executing 100 MockUSDC Borrow transaction...");
      const res = await fetch("/api/backend/borrow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: invalidAuth ? "omit" : "same-origin",
        body: JSON.stringify({ request: approvedReq, proof: zkProofPackage }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setBorrowReceipt(data.tx);
      log(`✓ 100 MockUSDC Borrow Mined! Tx Hash: ${data.tx.hash}`);
      await loadBackendSession();
    } catch (err: any) {
      log(`✕ Borrow error: ${err.message}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRepay(invalidAuth = false) {
    if (busyAction) return;
    try {
      setBusyAction("repay");
      log("Executing Repayment flow (Approve + Repay)...");
      const res = await fetch("/api/backend/repay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passportId: sessionData?.passport.passportId }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setRepayReceipt(data);
      log(`✓ Approve Tx Hash: ${data.approveTx.hash}`);
      log(`✓ Repay Loan Mined! Tx Hash: ${data.repayTx.hash}`);
      await loadBackendSession();
    } catch (err: any) {
      log(`✕ Repayment error: ${err.message}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function trySecond() {
    if (!card || !bind) return;
    setSecond(null);
    try {
      await api.issuePassport({
        proof: mockProof,
        publicSignals: [
          String(card.provenMinTenure),
          String(card.provenMinPeriods),
          String(card.provenMaxMissed),
          String(card.provenMinIncome),
          card.commitment,
          "",
        ],
        nullifier: bind.nullifier,
        role: card.role,
        owner: card.owner,
      });
      setSecond({ ok: true, text: t("secondWorked") });
    } catch (e) {
      setSecond({ ok: false, text: e instanceof ApiError ? e.message : t("loadError") });
    }
  }

  async function revoke() {
    if (passportId === null) return;
    try {
      setCard(await api.revokePassport(passportId));
    } catch (e) {
      setSecond({ ok: false, text: e instanceof ApiError ? e.message : t("loadError") });
    }
  }

  // Frontend-only illustrative Gig Score calculation (separated from backend eligibility)
  const scoreResult = calculateGigScore({
    tenureMonths: 34,
    weeksPaid: 150,
    missedWeeks: 0,
    averageMonthlyIncomePaise: "1940200",
  });
  const scoreBand = scoreResult.score >= 80 ? "Strong" : scoreResult.score >= 60 ? "Good" : scoreResult.score >= 40 ? "Fair" : "Weak";

  return (
    <main className="wrap stack" style={{ gap: 32 }}>
      {sessionData?.evidenceSource?.mode==="backend-a-http" && <div className="pill" style={{alignSelf:"flex-start"}}>✓ Authenticated Mock FIP connected · On-chain passport #{sessionData.passport.passportId}</div>}
      {lost && (
        <div className="note bad stack" style={{ gap: 8, alignItems: "flex-start" }}>
          <span>{t("passportLost")}</span>
          <button className="btn alt" onClick={() => { reset(); router.push("/"); }}>{t("startAgain")}</button>
        </div>
      )}
      {failed && <p className="note bad">{t("loadError")}</p>}
      {!card && !lost && !failed && <p className="muted">{t("loading")}</p>}

      {card && (
        <>
          {/* Realistic Metallic Digital Work Passport Card */}
          <article style={{
            background: card.revoked
              ? "linear-gradient(135deg, #2a080c 0%, #450a0a 50%, #1f0408 100%)"
              : "linear-gradient(135deg, #0b132b 0%, #1e293b 40%, #0369a1 100%)",
            border: card.revoked ? "2px solid #ef4444" : "2px solid #38bdf8",
            borderRadius: "24px",
            padding: "32px",
            display: "flex",
            flexDirection: "column",
            gap: "24px",
            boxShadow: card.revoked
              ? "0 25px 50px -12px rgba(239, 68, 68, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.2)"
              : "0 25px 50px -12px rgba(2, 132, 199, 0.35), inset 0 1px 1px rgba(255, 255, 255, 0.25)",
            position: "relative",
            overflow: "hidden",
            color: "#ffffff"
          }}>
            {/* Background Security Foil Pattern */}
            <div style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundImage: "radial-gradient(rgba(56, 189, 248, 0.08) 1px, transparent 1px), linear-gradient(135deg, rgba(255,255,255,0.05) 0%, transparent 60%)",
              backgroundSize: "20px 20px, 100% 100%",
              pointerEvents: "none",
              zIndex: 1
            }} />

            {/* Top Bar: Security Chip + Official Header + Status Badge */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px", zIndex: 2 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{
                  width: 46,
                  height: 34,
                  background: "linear-gradient(135deg, #f59e0b 0%, #d97706 50%, #fef08a 100%)",
                  borderRadius: 6,
                  border: "1px solid #b45309",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.4)",
                  position: "relative",
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}>
                  <div style={{ width: "100%", height: 1, background: "#78350f" }} />
                  <div style={{ position: "absolute", width: 1, height: "100%", background: "#78350f" }} />
                </div>
                <div>
                  <div style={{ fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", color: "#94a3b8", fontWeight: 700 }}>
                    Official Web3 Credential
                  </div>
                  <div style={{ fontSize: "14px", fontWeight: 800, color: "#f8fafc", letterSpacing: "0.05em", fontFamily: "var(--f-mono)" }}>
                    GIGVAULT PASSPORT #{card.passportId}
                  </div>
                </div>
              </div>

              <span style={{
                background: card.revoked ? "rgba(220, 38, 38, 0.9)" : "rgba(16, 185, 129, 0.9)",
                color: "#ffffff",
                fontSize: "12px",
                fontWeight: 800,
                padding: "6px 16px",
                borderRadius: "9999px",
                boxShadow: card.revoked ? "0 0 15px rgba(239, 68, 68, 0.5)" : "0 0 15px rgba(16, 185, 129, 0.5)",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                letterSpacing: "0.05em"
              }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#ffffff", boxShadow: "0 0 8px #ffffff" }} />
                {card.revoked ? t("passportRevoked").toUpperCase() : t("passportActive").toUpperCase()}
              </span>
            </div>

            {/* Holder Biometric & Identity Banner */}
            <div style={{
              background: "rgba(15, 23, 42, 0.6)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              borderRadius: "16px",
              padding: "18px 24px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "16px",
              zIndex: 2
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{
                  width: 52,
                  height: 52,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)",
                  border: "2px solid #ffffff",
                  boxShadow: "0 4px 12px rgba(2, 132, 199, 0.4)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "20px",
                  fontWeight: 800,
                  color: "#ffffff"
                }}>
                  {persona ? (lang === "kn" ? persona.nameKn.slice(0, 2) : persona.name.slice(0, 2).toUpperCase()) : "RK"}
                </div>

                <div>
                  <span style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.1em", color: "#94a3b8", fontWeight: 700 }}>
                    {t("passportHolder")}
                  </span>
                  <div style={{ fontSize: "22px", fontWeight: 800, color: "#ffffff", letterSpacing: "0.02em" }}>
                    {persona ? (lang === "kn" ? persona.nameKn : persona.name) : "Ramesh Kumar"}
                  </div>
                  <div style={{ fontSize: "12px", color: "#38bdf8", fontFamily: "var(--f-mono)", fontWeight: 700 }}>
                    Holder: {shortHash(card.holderWallet || card.owner, 10, 4)}
                  </div>
                </div>
              </div>

              <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
                <span style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.1em", color: "#94a3b8", fontWeight: 700 }}>
                  {t("passportWork")}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    background: "rgba(56, 189, 248, 0.15)",
                    border: "1px solid rgba(56, 189, 248, 0.4)",
                    color: "#38bdf8",
                    padding: "4px 12px",
                    borderRadius: "8px",
                    fontSize: "14px",
                    fontWeight: 700
                  }}>
                    {roles ? roles[card.role]?.label || card.role : "Food Delivery Rider 🛵"}
                  </div>
                  <div style={{
                    background: scoreBand === "Strong" ? "#059669" : scoreBand === "Good" ? "#0284c7" : "#d97706",
                    color: "#ffffff",
                    padding: "6px 16px",
                    borderRadius: "8px",
                    fontSize: "16px",
                    fontWeight: 900,
                    letterSpacing: "0.05em",
                    fontFamily: "var(--f-mono)",
                    boxShadow: "0 2px 10px rgba(0,0,0,0.2)"
                  }}>
                    Gig Score {scoreResult.score} · {scoreBand} (illustrative)
                  </div>
                </div>
                <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: 2 }}>
                  Debt: <strong style={{ color: sessionData?.identityState?.principal !== "0" ? "#ef4444" : "#34d399" }}>
                    {!sessionData ? "Awaiting connection" : sessionData.identityState.principal !== "0" ? `${Number(sessionData.identityState.principal) / 1e6} MockUSDC` : "0 MockUSDC"}
                  </strong>
                </div>
              </div>
            </div>

            {/* Cryptographic Hashes & Laser Security Stamp */}
            <div style={{
              background: "rgba(0, 0, 0, 0.35)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "14px",
              padding: "14px 20px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px",
              zIndex: 2
            }}>
              <div style={{ fontFamily: "var(--f-mono)", fontSize: "12px", color: "#cbd5e1" }}>
                <span style={{ color: "#94a3b8" }}>Evidence Commitment (v{sessionData?.passport.evidenceVersion ?? 1}):</span> <strong style={{ color: "#38bdf8" }}>{shortHash(card.commitment, 10, 4)}</strong>
              </div>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", display: "flex", alignItems: "center", gap: 6 }}>
                <span>🛡️ {!sessionData ? "UI fixture · Chain connection pending" : verifyOutcome ? "ZK proof verified" : "Evidence anchored · Proof pending"}</span>
              </div>
            </div>
          </article>

          {/* Interactive Worker Actions Card */}
          <section className="card" style={{ padding: 24, background: "rgba(255, 255, 255, 0.95)", border: "1px solid rgba(255, 255, 255, 0.8)", borderRadius: 20, boxShadow: "0 10px 30px rgba(2, 132, 199, 0.06)", display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
              <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: "#0f172a", margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                <span>⚡</span> Authenticated Worker Actions (Passport #{card.passportId})
              </h2>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className={`btn ${consumer === "loan" ? "" : "alt"}`}
                  onClick={() => { setConsumer("loan"); setApprovedReq(null); setZkProofPackage(null); setVerifyOutcome(null); }}
                  style={{ padding: "6px 14px", fontSize: 13 }}
                >
                  💳 Loan (100 MockUSDC)
                </button>
                <button
                  className={`btn ${consumer === "welfare" ? "" : "alt"}`}
                  onClick={() => { setConsumer("welfare"); setApprovedReq(null); setZkProofPackage(null); setVerifyOutcome(null); }}
                  style={{ padding: "6px 14px", fontSize: 13 }}
                >
                  🛡️ Welfare Claim
                </button>
              </div>
            </div>

            <label style={{ fontSize: 13 }}>
              <input type="checkbox" checked={useLocalWallet} onChange={(e) => setUseLocalWallet(e.target.checked)} />
              {" "}Use local synthetic EVM development wallet (unlocked loopback account).
            </label>

            {policyData && (
              <div style={{ background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: 12, padding: 12, fontSize: 13 }}>
                <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>📜 Requirements for this benefit</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 6 }}>
                  <div><strong>Verifier ID:</strong> {shortHash(policyData.policy.verifierId, 8, 4)}</div>
                  {policyData.policy.incomeEnabled === "1" && <div><strong>Income:</strong> ≥ ₹{Number(policyData.policy.minAverageIncomePaise) / 100}/month over {policyData.policy.incomeWindowMonths} completed months</div>}
                  {policyData.policy.activityEnabled === "1" && <div><strong>Activity:</strong> ≥ {policyData.policy.minActivePeriods} of {policyData.policy.activityWindow} completed {policyData.policy.activityIsWeekly === "1" ? "weeks" : "months"}</div>}
                  {policyData.policy.historyEnabled === "1" && <div><strong>History:</strong> ≥ {policyData.policy.minHistoryMonths} months</div>}
                  <div><strong>Evidence age:</strong> ≤ {policyData.policy.maxEvidenceAgeDays} days</div>
                  <div><strong>Expires:</strong> {new Date(Number(policyData.policy.expiresAt) * 1000).toLocaleString()}</div>
                </div>
              </div>
            )}

            {/* Workflow Action Buttons */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
              <button
                className="btn"
                onClick={handleGetPolicyAndApprove}
                disabled={busyAction !== null || !policyPayload || policyPayload.policyRequest.consumer !== consumer}
                style={{ padding: "10px 16px", fontSize: 13 }}
              >
                {busyAction === "policy" ? "⏳ Signing Approval..." : "1️⃣ Login & Sign Policy Approval"}
              </button>

              <button
                className="btn"
                onClick={() => handleGenerateProof(false)}
                disabled={!approvedReq || busyAction !== null}
                style={{ padding: "10px 16px", fontSize: 13, background: approvedReq ? "linear-gradient(135deg, #0284c7, #2563eb)" : undefined }}
              >
                {busyAction === "proving" ? "⚡ Proving..." : "2️⃣ Generate ZK Proof"}
              </button>

              <button
                className="btn"
                onClick={handleVerifySolidity}
                disabled={!zkProofPackage || busyAction !== null}
                style={{ padding: "10px 16px", fontSize: 13, background: zkProofPackage ? "linear-gradient(135deg, #059669, #10b981)" : undefined }}
              >
                {busyAction === "verify" ? "🔍 Verifying..." : "3️⃣ Verify on Solidity"}
              </button>

              {consumer === "welfare" ? (
                <button
                  className="btn"
                  onClick={() => handleClaim(false)}
                  disabled={!zkProofPackage || !verifyOutcome || Object.entries(verifyOutcome.enabled ?? {}).some(([key, enabled]) => enabled && verifyOutcome[key] !== "PASS") || busyAction !== null || (consumer === "welfare" ? Boolean(sessionData?.identityState?.claimed) : sessionData?.identityState?.principal !== "0")}
                  style={{ padding: "10px 16px", fontSize: 13, background: "linear-gradient(135deg, #d97706, #f59e0b)" }}
                >
                  {busyAction === "claim" ? "⏳ Claiming..." : "4️⃣ Claim Welfare Voucher"}
                </button>
              ) : (
                <button
                  className="btn"
                  onClick={() => handleBorrow(false)}
                  disabled={!zkProofPackage || !verifyOutcome || Object.entries(verifyOutcome.enabled ?? {}).some(([key, enabled]) => enabled && verifyOutcome[key] !== "PASS") || busyAction !== null || sessionData?.identityState?.principal !== "0"}
                  style={{ padding: "10px 16px", fontSize: 13, background: "linear-gradient(135deg, #d97706, #f59e0b)" }}
                >
                  {busyAction === "borrow" ? "⏳ Borrowing..." : "4️⃣ Borrow 100 MockUSDC"}
                </button>
              )}

              <button
                className="btn alt"
                onClick={() => handleRepay(false)}
                disabled={!sessionData || sessionData.identityState.principal === "0" || busyAction !== null}
                style={{ padding: "10px 16px", fontSize: 13, borderColor: "#dc2626", color: "#dc2626" }}
              >
                {busyAction === "repay" ? "⏳ Repaying..." : "5️⃣ Repay Loan"}
              </button>
            </div>

            {/* Security Test Controls */}
            <div style={{ padding: 12, background: "rgba(239, 68, 68, 0.06)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontWeight: 700, color: "#b91c1c", fontSize: 12 }}>🛡️ Rejection Tests:</span>
              <button
                className="btn alt"
                onClick={() => handleGenerateProof(true)}
                disabled={!approvedReq || busyAction !== null}
                style={{ fontSize: 12, padding: "4px 10px", color: "#b91c1c", borderColor: "#ef4444" }}
              >
                🧪 Unauthenticated Proving
              </button>
              <button
                className="btn alt"
                onClick={() => handleBorrow(true)}
                disabled={!zkProofPackage || busyAction !== null}
                style={{ fontSize: 12, padding: "4px 10px", color: "#b91c1c", borderColor: "#ef4444" }}
              >
                🧪 Unauthenticated Borrow
              </button>
            </div>

            {/* Receipts & Execution Logs */}
            {verifyOutcome && (
              <div style={{ background: "rgba(209, 250, 229, 0.9)", border: "1px solid rgba(5, 150, 105, 0.4)", borderRadius: 10, padding: 12, color: "#047857", fontSize: 12 }}>
                <strong>✓ Solidity Verification:</strong> {JSON.stringify(verifyOutcome)}
              </div>
            )}
            {claimReceipt && (
              <div style={{ background: "rgba(254, 243, 199, 0.9)", border: "1px solid rgba(217, 119, 6, 0.4)", borderRadius: 10, padding: 12, color: "#b45309", fontSize: 12 }}>
                <strong>✓ Welfare Claim Tx:</strong> <code className="mono">{claimReceipt.hash}</code>
              </div>
            )}
            {borrowReceipt && (
              <div style={{ background: "rgba(254, 243, 199, 0.9)", border: "1px solid rgba(217, 119, 6, 0.4)", borderRadius: 10, padding: 12, color: "#b45309", fontSize: 12 }}>
                <strong>✓ Borrow 100 MockUSDC Tx:</strong> <code className="mono">{borrowReceipt.hash}</code>
              </div>
            )}
            {repayReceipt && (
              <div style={{ background: "rgba(209, 250, 229, 0.9)", border: "1px solid rgba(5, 150, 105, 0.4)", borderRadius: 10, padding: 12, color: "#047857", fontSize: 12 }}>
                <strong>✓ Loan Repaid!</strong> Approve: <code className="mono">{repayReceipt.approveTx.hash}</code> | Repay: <code className="mono">{repayReceipt.repayTx.hash}</code>
              </div>
            )}

            {stepLog.length > 0 && (
              <div style={{ background: "#0f172a", borderRadius: 10, padding: 12, color: "#38bdf8", fontSize: 11, fontFamily: "monospace", maxHeight: 140, overflowY: "auto" }}>
                {stepLog.map((line, idx) => (
                  <div key={idx}>{line}</div>
                ))}
              </div>
            )}
          </section>

          {/* Privacy Note Card */}
          <div style={{
            background: "rgba(2, 132, 199, 0.08)",
            border: "1px solid rgba(2, 132, 199, 0.2)",
            borderRadius: "14px",
            padding: "16px 20px",
            display: "flex",
            flexDirection: "column",
            gap: "6px"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#0284c7", fontWeight: 700, fontSize: "14px" }}>
              <span>🔒 Zero-Knowledge Privacy Guarantee</span>
            </div>
            <p className="small" style={{ color: "#334155", margin: 0, lineHeight: 1.5 }}>
              Your private evidence stays with the trusted prover. A verifier receives the approved policy's PASS/FAIL results and public binding signals, without your bank transactions.
            </p>
          </div>

          <details className="muted"><summary>Technical details</summary><p>Local EVM and MockUSDC test funds. {sessionData?.evidenceSource?.mode==="backend-a-http" ? "Actual Backend A authenticated Mock FIP reconstruction through its pinned private local HTTP router." : "Independent Backend B synthetic fixture."} Real Groth16 verification and transactions. Synthetic identity; genuine Aadhaar and an external bank are not connected. The illustrative score does not decide eligibility.</p></details>
          {/* Control & Security Test Bar */}
          <section className="card" style={{ padding: "24px", gap: "16px", background: "rgba(255, 255, 255, 0.85)" }}>
            <h3 style={{ fontSize: "17px", color: "#0f172a", margin: 0 }}>Passport Verification & Security Actions</h3>
            <div className="row" style={{ gap: "12px" }}>
              <Link href="/show" className="btn linkbtn" style={{ padding: "12px 24px", fontSize: "15px" }}>
                📱 {t("showToVerifier")} →
              </Link>

              <Link href="/verify" target="_blank" rel="noopener noreferrer" className="btn alt linkbtn" style={{ padding: "12px 20px", fontSize: "14px", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <span>🏢 {t("showOpenLender")}</span>
                <span style={{ fontSize: "12px", opacity: 0.7 }}>↗</span>
              </Link>

              <Link href="/live" className="btn alt linkbtn" style={{ padding: "12px 20px", fontSize: "14px", display: "inline-flex", alignItems: "center", gap: "6px", color: "#0284c7" }}>
                <span>⚡ Live ZK Journey (/live)</span>
              </Link>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
