"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { barText, inr } from "@/lib/format";
import { useLang } from "@/lib/lang";
import { ROLE_KEYS, RoleKey } from "@/lib/roles";
import { useSession } from "@/lib/session";
import type { RolesDto } from "@/lib/types";

const ROLE_VIDEOS: Record<RoleKey, { url: string; label: string; icon: string }> = {
  food: {
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    label: "Food Delivery Rider 🛵",
    icon: "🍔"
  },
  cab: {
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
    label: "Cab & Auto Driver 🚗",
    icon: "🚕"
  },
  home: {
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
    label: "Home Services Professional 🛠️",
    icon: "🔧"
  },
  goods: {
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
    label: "Goods & Courier Driver 🚚",
    icon: "📦"
  }
};

export default function Login() {
  const { t } = useLang();
  const { role, update } = useSession();
  const router = useRouter();
  const [roles, setRoles] = useState<RolesDto | null>(null);
  const [failed, setFailed] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const [activeVideoIndex, setActiveVideoIndex] = useState(0);
  const [videoError, setVideoError] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    api.roles().then(setRoles).catch(() => setFailed(true));
  }, []);

  // Auto-rotate gig worker category if no role is picked
  useEffect(() => {
    if (!role) {
      const timer = setInterval(() => {
        setActiveVideoIndex((prev) => (prev + 1) % ROLE_KEYS.length);
      }, 6000);
      return () => clearInterval(timer);
    }
  }, [role]);

  const chosenKey: RoleKey | null = role as RoleKey | null;
  const currentKey: RoleKey = chosenKey || ROLE_KEYS[activeVideoIndex];
  const videoData = ROLE_VIDEOS[currentKey];

  const chosen = role && roles ? roles[role] : null;

  function logIn() {
    update({ loggedIn: true });
    router.push("/role");
  }

  // Interactive Animated Canvas as fallback/enhancement for Gig Workers
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);

    // Particles for background animation
    const particles = Array.from({ length: 45 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 1.2,
      vy: (Math.random() - 0.5) * 1.2,
      size: Math.random() * 3 + 1,
      hue: Math.random() * 60 + 190
    }));

    let step = 0;

    const render = () => {
      step += 0.02;
      ctx.clearRect(0, 0, width, height);

      // Render grid or dynamic lines depending on current role
      ctx.strokeStyle = "rgba(56, 189, 248, 0.06)";
      ctx.lineWidth = 1;
      const gridSize = 60;
      for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Draw active particles & connecting web
      particles.forEach((p, i) => {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0 || p.x > width) p.vx *= -1;
        if (p.y < 0 || p.y > height) p.vy *= -1;

        ctx.fillStyle = `hsla(${p.hue}, 80%, 65%, 0.6)`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();

        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dist = Math.hypot(p.x - p2.x, p.y - p2.y);
          if (dist < 130) {
            ctx.strokeStyle = `hsla(${p.hue}, 70%, 60%, ${0.2 * (1 - dist / 130)})`;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        }
      });

      // Role specific decorative glow motif
      ctx.save();
      const centerX = width * 0.8;
      const centerY = height * 0.4;
      const radius = 180 + Math.sin(step) * 20;

      const grad = ctx.createRadialGradient(centerX, centerY, 10, centerX, centerY, radius);
      grad.addColorStop(0, "rgba(56, 189, 248, 0.2)");
      grad.addColorStop(1, "rgba(15, 23, 42, 0)");

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [currentKey]);

  return (
    <>
      {/* Dynamic Background Video + Light Sky-Blue Canvas */}
      <div style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        zIndex: -1,
        overflow: "hidden",
        pointerEvents: "none",
        background: "linear-gradient(135deg, #e0f2fe 0%, #bae6fd 50%, #f0f9ff 100%)"
      }}>
        {/* HTML5 Canvas Background */}
        <canvas
          ref={canvasRef}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            zIndex: 1
          }}
        />

        {/* Video Element */}
        {!videoError && (
          <video
            key={videoData.url}
            autoPlay
            loop
            muted
            playsInline
            onError={() => setVideoError(true)}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              opacity: 0.18,
              filter: "contrast(1.1)",
              zIndex: 2,
              transition: "opacity 1s ease-in-out"
            }}
          >
            <source src={videoData.url} type="video/mp4" />
          </video>
        )}

        {/* Dynamic Gig Worker Indicator Badge */}
        <div style={{
          position: "absolute",
          bottom: "24px",
          right: "24px",
          background: "rgba(255, 255, 255, 0.95)",
          backdropFilter: "blur(12px)",
          border: "1px solid rgba(2, 132, 199, 0.3)",
          padding: "10px 18px",
          borderRadius: "9999px",
          fontSize: "13px",
          color: "#0f172a",
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: "10px",
          zIndex: 10,
          boxShadow: "0 8px 25px rgba(2, 132, 199, 0.15)"
        }}>
          <span style={{ fontSize: "16px" }}>{videoData.icon}</span>
          <span>Category: <strong style={{ color: "#0284c7" }}>{videoData.label}</strong></span>
        </div>

        {/* Light Vignette Overlay */}
        <div style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 3,
          background: "radial-gradient(circle at center, rgba(255, 255, 255, 0.2) 0%, rgba(224, 242, 254, 0.6) 100%)"
        }} />
      </div>

      <main className="wrap stack" style={{ gap: 28 }}>
        <section className="hero stack" style={{ gap: 12 }}>
          <h1 style={{ 
            fontSize: "clamp(36px, 7vw, 60px)", 
            fontWeight: 800,
            background: "linear-gradient(135deg, #0f172a 0%, #0369a1 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            margin: 0
          }}>
            {t("loginHeadline")}
          </h1>
          <p className="lede" style={{ fontSize: "1.2rem", color: "#334155", fontWeight: 500, margin: 0, maxWidth: "48ch" }}>
            {t("loginSub")}
          </p>
        </section>

        <section className="stack" aria-labelledby="choose-work" style={{ position: "relative", zIndex: 10 }}>
          <h2 id="choose-work" style={{ color: "#0f172a", fontWeight: 700 }}>{t("chooseWork")}</h2>
          {failed && <p className="note bad">{t("loadError")}</p>}
          {!failed && !roles && <p className="muted">{t("loading")}</p>}
          {roles && (
            <div style={{ position: "relative", zIndex: 10 }}>
              <button
                className="btn alt"
                style={{
                  width: "100%",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "18px 24px",
                  fontSize: "17px",
                  fontWeight: 700,
                  textAlign: "left",
                  background: "#ffffff",
                  color: "#0f172a",
                  border: "2px solid #0284c7",
                  borderRadius: 16,
                  boxShadow: "0 6px 20px rgba(2, 132, 199, 0.12)"
                }}
                onClick={() => setShowDropdown(!showDropdown)}
                aria-expanded={showDropdown}
              >
                <span>{chosen ? chosen.label : "Select a role..."}</span>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transition: "transform 0.2s", transform: showDropdown ? "rotate(180deg)" : "rotate(0deg)" }}>
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
              
              {showDropdown && (
                <div style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  marginTop: "10px",
                  background: "#ffffff",
                  border: "2px solid #0284c7",
                  borderRadius: 20,
                  boxShadow: "0 16px 40px rgba(2, 132, 199, 0.25)",
                  display: "flex",
                  flexDirection: "column",
                  padding: "8px",
                  gap: "8px",
                  zIndex: 99
                }}>
                  {ROLE_KEYS.map((k) => {
                    const r = roles[k];
                    const isSelected = role === k;
                    const meta = ROLE_VIDEOS[k];
                    return (
                      <button
                        key={k}
                        style={{
                          textAlign: "left",
                          padding: "16px",
                          border: isSelected ? "2px solid #0284c7" : "1px solid #e2e8f0",
                          borderRadius: 14,
                          background: isSelected ? "linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)" : "#ffffff",
                          cursor: "pointer",
                          transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                          display: "flex",
                          flexDirection: "column",
                          gap: 10,
                          boxShadow: isSelected ? "0 4px 14px rgba(2, 132, 199, 0.15)" : "0 2px 4px rgba(0,0,0,0.02)"
                        }}
                        aria-pressed={isSelected}
                        onClick={() => {
                          update({ role: k, personaId: null, consent: null, record: null, bind: null, passport: null, qr: null });
                          setShowDropdown(false);
                        }}
                      >
                        {/* Header Row: Icon + Title + Selection Badge */}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ 
                              fontSize: "20px", 
                              background: isSelected ? "#0284c7" : "#e0f2fe", 
                              color: isSelected ? "#ffffff" : "#0284c7",
                              width: 36, 
                              height: 36, 
                              borderRadius: 10, 
                              display: "flex", 
                              alignItems: "center", 
                              justifyContent: "center",
                              boxShadow: "0 2px 8px rgba(0,0,0,0.05)"
                            }}>
                              {meta.icon}
                            </span>
                            <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 800, color: "#0f172a" }}>
                              {r.label}
                            </h3>
                          </div>

                          {isSelected ? (
                            <span style={{ 
                              background: "#059669", 
                              color: "#ffffff", 
                              fontSize: "11px", 
                              fontWeight: 700, 
                              padding: "4px 10px", 
                              borderRadius: 999, 
                              textTransform: "uppercase", 
                              letterSpacing: "0.05em",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4
                            }}>
                              ✓ SELECTED
                            </span>
                          ) : (
                            <span style={{ fontSize: "12px", color: "#0284c7", fontWeight: 600 }}>
                              Select →
                            </span>
                          )}
                        </div>

                        {/* Metric Chips Row */}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                          <span style={{ background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: 8, padding: "3px 8px", fontSize: "12px", color: "#0f172a", fontWeight: 600 }}>
                            ⏱️ {r.minTenure} Mos Tenure
                          </span>
                          <span style={{ background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: 8, padding: "3px 8px", fontSize: "12px", color: "#0f172a", fontWeight: 600 }}>
                            💼 {r.minPeriods} Paid Wks
                          </span>
                          <span style={{ background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: 8, padding: "3px 8px", fontSize: "12px", color: "#0f172a", fontWeight: 600 }}>
                            💰 {inr(r.minIncome)}/mo
                          </span>
                          <span style={{ background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: 8, padding: "3px 8px", fontSize: "12px", color: "#0f172a", fontWeight: 600 }}>
                            {r.maxMissed === 0 ? "✓ 0 Missed" : `≤ ${r.maxMissed} Missed`}
                          </span>
                        </div>

                        {/* Verifier Reader Row */}
                        <div style={{ fontSize: "12px", color: "#64748b", display: "flex", alignItems: "center", gap: 6 }}>
                          <span>🏢</span>
                          <span><strong>Reads for:</strong> {r.reader}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>

        <section className="stack" style={{ gap: 12, alignItems: "flex-start", position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center", width: "100%" }}>
            <button className="btn" onClick={logIn} disabled={!chosen} style={{ padding: "14px 28px", fontSize: "16px" }}>
              {t("loginButton")}
            </button>
            <Link
              href="/login"
              className="btn"
              style={{
                padding: "14px 28px",
                fontSize: "16px",
                background: "linear-gradient(135deg, #0284c7 0%, #2563eb 100%)",
                color: "#ffffff",
                boxShadow: "0 4px 14px rgba(2, 132, 199, 0.3)",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px"
              }}
            >
              📱 Mobile OTP Login / Sign Up →
            </Link>
          </div>
          <p className="small muted">{chosen ? t("loginDemoNote") : t("loginPickFirst")}</p>
        </section>

        <p className="small" style={{ position: "relative", zIndex: 1, display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap" }}>
          <Link href="/login" style={{ fontWeight: 700, color: "#0284c7" }}>📱 Mobile OTP Login (/login) →</Link>
          <span>•</span>
          <Link href="/verify" target="_blank" rel="noopener noreferrer">{t("lenderLink")} ↗</Link>
          <span>•</span>
          <Link href="/live" style={{ fontWeight: 700, color: "#0284c7" }}>⚡ Live ZK Worker Journey (/live) →</Link>
          <span>•</span>
          <Link href="/forge" style={{ fontWeight: 700, color: "#e11d48" }}>🧪 Forgery Test Lab (/forge) →</Link>
        </p>
      </main>
    </>
  );
}
