"use client";

export interface CheckItem {
  label: string;
  ok: boolean | null; // null = not run yet
  why?: string; // shown beside a failed check
}

export default function Checklist({ items }: { items: CheckItem[] }) {
  return (
    <ul className="chk" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "12px" }}>
      {items.map((x, i) => {
        const isOk = x.ok === true;
        const isFail = x.ok === false;

        return (
          <li
            key={i}
            style={{
              display: "flex",
              gap: "14px",
              alignItems: "flex-start",
              background: isOk ? "rgba(209, 250, 229, 0.7)" : isFail ? "rgba(254, 226, 226, 0.7)" : "rgba(241, 245, 249, 0.9)",
              border: `1px solid ${isOk ? "rgba(5, 150, 105, 0.3)" : isFail ? "rgba(220, 38, 38, 0.3)" : "rgba(203, 213, 225, 0.8)"}`,
              padding: "14px 18px",
              borderRadius: "12px",
              boxShadow: "0 2px 6px rgba(0,0,0,0.02)"
            }}
          >
            <span
              style={{
                width: "26px",
                height: "26px",
                borderRadius: "50%",
                background: isOk ? "#059669" : isFail ? "#dc2626" : "#64748b",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "14px",
                fontWeight: 700,
                flex: "none",
                marginTop: "1px"
              }}
            >
              {isOk ? "✓" : isFail ? "✕" : "–"}
            </span>

            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ fontSize: "14.5px", fontWeight: 600, color: isOk ? "#047857" : isFail ? "#b91c1c" : "#334155" }}>
                {x.label}
              </span>
              {isFail && x.why && (
                <span className="why" style={{ color: "#b91c1c", fontSize: "13px" }}>
                  {x.why}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
