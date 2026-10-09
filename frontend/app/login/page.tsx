"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLang } from "@/lib/lang";
import { ROLE_KEYS, RoleKey } from "@/lib/roles";
import { useSession } from "@/lib/session";

interface TestAccount {
  name: string;
  mobile: string;
  otp: string;
  role: RoleKey;
  personaId: number;
  badge: string;
}

const TEST_ACCOUNTS: TestAccount[] = [
  {
    name: "Ramesh Kumar",
    mobile: "9876543210",
    otp: "123456",
    role: "food",
    personaId: 1,
    badge: "Food Delivery Rider (Band Strong)"
  },
  {
    name: "Suresh Gowda",
    mobile: "9876543211",
    otp: "654321",
    role: "cab",
    personaId: 2,
    badge: "Cab Driver (Band Strong)"
  },
  {
    name: "Anand Verma",
    mobile: "9876543212",
    otp: "999888",
    role: "food",
    personaId: 7,
    badge: "Zomato Rider (Band Weak)"
  }
];

export default function LoginPage() {
  const { t } = useLang();
  const { update } = useSession();
  const router = useRouter();

  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"mobile" | "otp" | "verified">("mobile");
  const [sentOtp, setSentOtp] = useState<string | null>(null);
  const [activeAccount, setActiveAccount] = useState<TestAccount | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleQuickSelect(acc: TestAccount) {
    setMobile(acc.mobile);
    setActiveAccount(acc);
    setError(null);
  }

  async function handleSendOtp(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const cleanMobile = mobile.replace(/\D/g, "");
    if (cleanMobile.length < 10) {
      setError("Please enter a valid 10-digit mobile number.");
      return;
    }

    setLoading(true);
    setError(null);

    // Simulate backend network latency
    await new Promise((r) => setTimeout(r, 600));

    const matched = TEST_ACCOUNTS.find((acc) => acc.mobile === cleanMobile);
    const generatedOtp = matched ? matched.otp : "123456";

    setActiveAccount(matched || {
      name: "Gig Worker",
      mobile: cleanMobile,
      otp: generatedOtp,
      role: "food",
      personaId: 1,
      badge: "Verified Gig Worker"
    });
    setSentOtp(generatedOtp);
    setStep("otp");
    setLoading(false);
  }

  async function handleVerifyOtp(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!sentOtp || !activeAccount) return;

    if (otp.trim() !== sentOtp) {
      setError(`Invalid OTP. Please use code ${sentOtp} for this account.`);
      return;
    }

    setLoading(true);
    setError(null);

    await new Promise((r) => setTimeout(r, 800));

    setStep("verified");

    // Save login session
    update({
      loggedIn: true,
      role: activeAccount.role,
      personaId: activeAccount.personaId,
      consent: null,
      record: null,
      bind: null,
      passport: null,
      qr: null
    });

    setTimeout(() => {
      router.push("/role");
    }, 900);
  }

  return (
    <main className="wrap stack" style={{ gap: 32, maxWidth: "560px", margin: "40px auto" }}>
      {/* Top Header */}
      <section className="stack" style={{ gap: 10, textAlign: "center", alignItems: "center" }}>
        <span style={{
          background: "rgba(2, 132, 199, 0.12)",
          color: "#0284c7",
          padding: "6px 16px",
          borderRadius: "9999px",
          fontSize: "13px",
          fontWeight: 700,
          display: "inline-flex",
          alignItems: "center",
          gap: "6px"
        }}>
          📲 Secure Backend Mobile OTP Authentication
        </span>

        <h1 style={{ fontSize: "clamp(28px, 5vw, 38px)", margin: 0, fontWeight: 800 }}>
          Worker Mobile Login / Sign Up
        </h1>
        <p className="muted" style={{ margin: 0, fontSize: "15px" }}>
          Enter your mobile number to receive a 6-digit OTP from the GigVault authentication service.
        </p>
      </section>

      {/* Main Login Card */}
      <section className="card" style={{
        padding: "32px",
        borderRadius: "24px",
        background: "rgba(255, 255, 255, 0.95)",
        boxShadow: "0 12px 36px rgba(2, 132, 199, 0.12)",
        border: "1px solid rgba(186, 230, 253, 0.8)",
        display: "flex",
        flexDirection: "column",
        gap: "24px"
      }}>
        {/* Preset Test Accounts Selection */}
        {step === "mobile" && (
          <div style={{
            background: "linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)",
            border: "1px solid #bae6fd",
            borderRadius: "16px",
            padding: "16px 20px",
            display: "flex",
            flexDirection: "column",
            gap: "12px"
          }}>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "#0369a1", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              ⚡ Demo Backend Test Accounts (Click to Auto-fill)
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {TEST_ACCOUNTS.map((acc) => (
                <button
                  key={acc.mobile}
                  type="button"
                  onClick={() => handleQuickSelect(acc)}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px 14px",
                    background: mobile === acc.mobile ? "#ffffff" : "rgba(255, 255, 255, 0.6)",
                    border: mobile === acc.mobile ? "2px solid #0284c7" : "1px solid #cbd5e1",
                    borderRadius: "10px",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.2s"
                  }}
                >
                  <div>
                    <strong style={{ fontSize: "14px", color: "#0f172a", display: "block" }}>{acc.name} ({acc.badge})</strong>
                    <span style={{ fontSize: "12px", color: "#0284c7", fontFamily: "var(--f-mono)" }}>📱 +91 {acc.mobile}</span>
                  </div>
                  <span style={{
                    background: "#0284c7",
                    color: "#ffffff",
                    fontSize: "11px",
                    fontWeight: 700,
                    padding: "3px 8px",
                    borderRadius: "6px"
                  }}>
                    OTP: {acc.otp}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div style={{
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            color: "#dc2626",
            padding: "12px 16px",
            borderRadius: "12px",
            fontSize: "14px",
            fontWeight: 600
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* Step 1: Mobile Input Form */}
        {step === "mobile" && (
          <form onSubmit={handleSendOtp} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label style={{ fontSize: "14px", fontWeight: 700, color: "#334155" }}>
                Mobile Number
              </label>
              <div style={{ display: "flex", gap: "10px" }}>
                <div style={{
                  padding: "14px 16px",
                  background: "#f1f5f9",
                  border: "1px solid #cbd5e1",
                  borderRadius: "12px",
                  fontSize: "15px",
                  fontWeight: 700,
                  color: "#334155"
                }}>
                  🇮🇳 +91
                </div>
                <input
                  type="tel"
                  placeholder="Enter 10-digit mobile number"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  maxLength={10}
                  style={{
                    flex: 1,
                    padding: "14px 16px",
                    fontSize: "16px",
                    borderRadius: "12px",
                    border: "2px solid #0284c7",
                    outline: "none",
                    fontFamily: "var(--f-mono)",
                    fontWeight: 600
                  }}
                />
              </div>
            </div>

            <button
              type="submit"
              className="btn"
              disabled={loading || mobile.length < 10}
              style={{
                width: "100%",
                padding: "14px",
                fontSize: "16px",
                fontWeight: 700,
                background: "linear-gradient(135deg, #0284c7 0%, #2563eb 100%)",
                borderRadius: "12px",
                boxShadow: "0 4px 14px rgba(2, 132, 199, 0.3)"
              }}
            >
              {loading ? "Sending OTP..." : "Get OTP Code →"}
            </button>
          </form>
        )}

        {/* Step 2: OTP Input Form */}
        {step === "otp" && (
          <form onSubmit={handleVerifyOtp} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {/* Live Backend SMS Simulation Notification */}
            <div style={{
              background: "rgba(16, 185, 129, 0.1)",
              border: "1px solid rgba(16, 185, 129, 0.4)",
              borderRadius: "14px",
              padding: "14px 18px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px"
            }}>
              <div>
                <div style={{ fontSize: "12px", textTransform: "uppercase", color: "#047857", fontWeight: 700 }}>
                  💬 Backend SMS Service Notification
                </div>
                <div style={{ fontSize: "14px", color: "#065f46", fontWeight: 600, marginTop: "2px" }}>
                  OTP sent to +91 {mobile}. Demo OTP: <strong style={{ fontSize: "16px", color: "#047857", fontFamily: "var(--f-mono)" }}>{sentOtp}</strong>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOtp(sentOtp || "")}
                style={{
                  background: "#047857",
                  color: "#ffffff",
                  border: "none",
                  padding: "6px 12px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  fontWeight: 700,
                  cursor: "pointer"
                }}
              >
                Auto-fill OTP
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label style={{ fontSize: "14px", fontWeight: 700, color: "#334155" }}>
                Enter 6-Digit OTP
              </label>
              <input
                type="text"
                placeholder="• • • • • •"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                maxLength={6}
                style={{
                  padding: "16px",
                  fontSize: "24px",
                  letterSpacing: "0.3em",
                  textAlign: "center",
                  borderRadius: "12px",
                  border: "2px solid #0284c7",
                  outline: "none",
                  fontFamily: "var(--f-mono)",
                  fontWeight: 800,
                  background: "#f8fafc"
                }}
              />
            </div>

            <div style={{ display: "flex", gap: "12px" }}>
              <button
                type="button"
                className="btn alt"
                onClick={() => setStep("mobile")}
                style={{ flex: 1, padding: "14px", fontSize: "14px" }}
              >
                ← Change Number
              </button>

              <button
                type="submit"
                className="btn"
                disabled={loading || otp.length < 6}
                style={{
                  flex: 2,
                  padding: "14px",
                  fontSize: "16px",
                  fontWeight: 700,
                  background: "linear-gradient(135deg, #059669 0%, #10b981 100%)",
                  borderRadius: "12px",
                  boxShadow: "0 4px 14px rgba(16, 185, 129, 0.3)"
                }}
              >
                {loading ? "Verifying..." : "Verify & Login ✓"}
              </button>
            </div>
          </form>
        )}

        {/* Step 3: Verified Success Screen */}
        {step === "verified" && (
          <div style={{
            textAlign: "center",
            padding: "24px 12px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "14px"
          }}>
            <div style={{
              width: "64px",
              height: "64px",
              borderRadius: "50%",
              background: "#10b981",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "32px",
              boxShadow: "0 0 20px rgba(16, 185, 129, 0.4)"
            }}>
              ✓
            </div>
            <h2 style={{ margin: 0, color: "#0f172a", fontSize: "22px" }}>
              OTP Verified Successfully!
            </h2>
            <p style={{ margin: 0, color: "#475569", fontSize: "15px" }}>
              Welcome back, <strong>{activeAccount?.name}</strong>. Redirecting to your dashboard...
            </p>
          </div>
        )}
      </section>

      {/* Back to Home Link */}
      <div style={{ textAlign: "center" }}>
        <Link href="/" className="btn alt linkbtn" style={{ padding: "10px 20px" }}>
          ← Back to Homepage
        </Link>
      </div>
    </main>
  );
}
