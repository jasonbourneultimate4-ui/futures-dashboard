"use client";

import { useEffect, useState } from "react";
import type { Instrument } from "@/lib/types";

/* ─── Divergence rule definitions ─── */

interface DivergenceRule {
  id: string;
  name: string;
  description: string;
  severity: "high" | "medium" | "low";
  // Returns a divergence alert or null if no divergence detected
  detect: (factors: Record<string, any>, correlations: any, instrument: Instrument) => DivergenceAlert | null;
}

interface DivergenceAlert {
  id: string;
  name: string;
  description: string;
  severity: "high" | "medium" | "low";
  implication: string;
  factorsInvolved: string[];
}

function parseVal(factors: Record<string, any>, key: string): number | null {
  const f = factors[key];
  if (!f) return null;
  const v = parseFloat(String(f.value).replace(/[$,%KMBTb/d\s,]/g, ""));
  return isNaN(v) ? null : v;
}

function getDir(factors: Record<string, any>, key: string): string | null {
  return factors[key]?.dir ?? null;
}

const RULES: DivergenceRule[] = [
  {
    id: "vix-equity-divergence",
    name: "VIX / Equity Divergence",
    description: "VIX rising while equities also rise — unusual and often precedes a correction",
    severity: "high",
    detect: (f, _c, inst) => {
      if (inst !== "ES" && inst !== "NQ" && inst !== "YM") return null;
      const vixDir = getDir(f, "VIX");
      const eqDir = getDir(f, inst);
      if (vixDir === "up" && eqDir === "up") {
        const vix = parseVal(f, "VIX");
        return {
          id: "vix-equity-divergence", name: "VIX Rising With Equities",
          description: `VIX is climbing${vix ? ` (${vix.toFixed(1)})` : ""} even as ${inst} pushes higher. Smart money may be buying protection.`,
          severity: "high",
          implication: "This divergence has historically preceded sharp corrections. Hedging activity suggests institutional caution despite the rally.",
          factorsInvolved: ["VIX", inst],
        };
      }
      return null;
    },
  },
  {
    id: "gold-dollar-positive",
    name: "Gold / Dollar Positive Correlation",
    description: "Gold and dollar moving together — breaks the normal inverse relationship",
    severity: "high",
    detect: (f) => {
      const gcDir = getDir(f, "GC");
      const dxyDir = getDir(f, "DXY");
      if (gcDir === "up" && dxyDir === "up") {
        return {
          id: "gold-dollar-positive", name: "Gold & Dollar Both Rising",
          description: "Gold and the dollar are moving in the same direction, breaking their normal inverse relationship.",
          severity: "high",
          implication: "This rare pattern signals extreme safe-haven demand — both flight-to-quality assets are bid. Watch for geopolitical or systemic stress.",
          factorsInvolved: ["GC", "DXY"],
        };
      }
      return null;
    },
  },
  {
    id: "yield-equity-disconnect",
    name: "Yield / Equity Disconnect",
    description: "Yields surging while equities ignore — one must be wrong",
    severity: "medium",
    detect: (f, _c, inst) => {
      if (inst !== "ES" && inst !== "NQ" && inst !== "YM") return null;
      const yieldVal = parseVal(f, "US10Y");
      const yieldDir = getDir(f, "US10Y");
      const eqDir = getDir(f, inst);
      if (yieldDir === "up" && eqDir === "up" && yieldVal !== null && yieldVal > 4.5) {
        return {
          id: "yield-equity-disconnect", name: "Yields Up, Equities Ignoring",
          description: `10Y yield climbing to ${yieldVal.toFixed(2)}% while ${inst} rallies. Equities are shrugging off tightening — this disconnect typically resolves with a sharp equity move.`,
          severity: "medium",
          implication: "Bond market pricing in tighter conditions while equities remain complacent. One market will reprice.",
          factorsInvolved: ["US10Y", inst],
        };
      }
      return null;
    },
  },
  {
    id: "oil-dollar-same-direction",
    name: "Oil / Dollar Moving Together",
    description: "Oil and dollar both rising — breaks normal inverse commodity-dollar relationship",
    severity: "medium",
    detect: (f, _c, inst) => {
      if (inst !== "CL") return null;
      const clDir = getDir(f, "CL");
      const dxyDir = getDir(f, "DXY");
      if (clDir === "up" && dxyDir === "up") {
        return {
          id: "oil-dollar-same-direction", name: "Oil & Dollar Both Rising",
          description: "Crude rising despite dollar strength — suggests supply-side tightness overriding the macro headwind.",
          severity: "medium",
          implication: "Supply constraint (OPEC cuts, geopolitics) is dominant over the typical dollar-commodity inverse. If dollar reverses, oil could spike further.",
          factorsInvolved: ["CL", "DXY"],
        };
      }
      return null;
    },
  },
  {
    id: "yen-carry-unwind",
    name: "Yen Carry Trade Warning",
    description: "Rapid yen strengthening signals potential carry trade unwind",
    severity: "high",
    detect: (f) => {
      const jpyDir = getDir(f, "USDJPY");
      const jpyVal = parseVal(f, "USDJPY");
      const vix = parseVal(f, "VIX");
      // USDJPY dropping = yen strengthening
      if (jpyDir === "down" && jpyVal !== null && jpyVal < 143 && vix !== null && vix > 20) {
        return {
          id: "yen-carry-unwind", name: "Yen Carry Unwind Risk",
          description: `USD/JPY falling to ${jpyVal.toFixed(1)} while VIX elevated at ${vix.toFixed(1)}. Yen strengthening during stress signals carry trade unwinding.`,
          severity: "high",
          implication: "Carry trade unwinds have caused flash crashes (Aug 2024, Aug 2019). Leveraged positions get margin-called, creating cascading sell pressure across risk assets.",
          factorsInvolved: ["USDJPY", "VIX"],
        };
      }
      return null;
    },
  },
  {
    id: "real-yield-gold-divergence",
    name: "Real Yield / Gold Divergence",
    description: "Gold rallying despite rising real yields — breaks the fundamental relationship",
    severity: "medium",
    detect: (f, _c, inst) => {
      if (inst !== "GC") return null;
      const ryDir = getDir(f, "REAL_YIELD");
      const gcDir = getDir(f, "GC");
      if (ryDir === "up" && gcDir === "up") {
        return {
          id: "real-yield-gold-divergence", name: "Gold Defying Real Yields",
          description: "Gold is rallying even as real yields rise. The most reliable gold relationship is breaking.",
          severity: "medium",
          implication: "Central bank buying or de-dollarization flows may be overriding the yield signal. This was the key dynamic in gold's 2023-2024 breakout.",
          factorsInvolved: ["REAL_YIELD", "GC"],
        };
      }
      return null;
    },
  },
  {
    id: "broad-risk-off",
    name: "Broad Risk-Off Signal",
    description: "Multiple risk-off indicators firing simultaneously",
    severity: "high",
    detect: (f) => {
      const vix = parseVal(f, "VIX");
      const dxyDir = getDir(f, "DXY");
      const gcDir = getDir(f, "GC");
      const yDir = getDir(f, "US10Y");
      let riskOffCount = 0;
      if (vix !== null && vix > 25) riskOffCount++;
      if (dxyDir === "up") riskOffCount++;
      if (gcDir === "up") riskOffCount++;
      if (yDir === "down") riskOffCount++; // flight to safety
      if (riskOffCount >= 3) {
        return {
          id: "broad-risk-off", name: "Broad Risk-Off Regime",
          description: `${riskOffCount} of 4 risk-off signals firing: ${vix !== null && vix > 25 ? "high VIX, " : ""}${dxyDir === "up" ? "dollar bid, " : ""}${gcDir === "up" ? "gold bid, " : ""}${yDir === "down" ? "flight-to-bonds" : ""}`.replace(/, $/, ""),
          severity: "high",
          implication: "Multiple safe-haven assets moving in unison signals genuine risk aversion. Reduce equity exposure, watch for capitulation signals.",
          factorsInvolved: ["VIX", "DXY", "GC", "US10Y"],
        };
      }
      return null;
    },
  },
  {
    id: "risk-on-alignment",
    name: "Broad Risk-On Alignment",
    description: "Multiple risk-on indicators aligned",
    severity: "low",
    detect: (f) => {
      const vix = parseVal(f, "VIX");
      const dxyDir = getDir(f, "DXY");
      const esDir = getDir(f, "ES");
      const yDir = getDir(f, "US10Y");
      let riskOnCount = 0;
      if (vix !== null && vix < 16) riskOnCount++;
      if (dxyDir === "down") riskOnCount++;
      if (esDir === "up") riskOnCount++;
      if (yDir === "flat" || yDir === "down") riskOnCount++;
      if (riskOnCount >= 3) {
        return {
          id: "risk-on-alignment", name: "Risk-On Alignment",
          description: "Low VIX, weakening dollar, and rising equities form a classic risk-on setup.",
          severity: "low",
          implication: "Markets aligned for upside — trend-following strategies favored. Watch for complacency (VIX too low often precedes spikes).",
          factorsInvolved: ["VIX", "DXY", "ES"],
        };
      }
      return null;
    },
  },
];

const SEVERITY_STYLE = {
  high: { color: "#f85149", bg: "rgba(248,81,73,0.08)", icon: "⚠", border: "#f8514930" },
  medium: { color: "#d29922", bg: "rgba(210,153,34,0.08)", icon: "◆", border: "#d2992230" },
  low: { color: "#3fb950", bg: "rgba(63,185,80,0.08)", icon: "●", border: "#3fb95030" },
};

/* ─── Component ─── */

export default function DivergenceDetector({ instrument }: { instrument: Instrument }) {
  const [factors, setFactors] = useState<Record<string, any> | null>(null);
  const [correlations, setCorrelations] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [fRes, cRes] = await Promise.allSettled([
          fetch("/api/factors").then(r => r.ok ? r.json() : null),
          fetch("/api/correlations").then(r => r.ok ? r.json() : null),
        ]);
        if (cancelled) return;
        if (fRes.status === "fulfilled" && fRes.value) setFactors(fRes.value.factors);
        if (cRes.status === "fulfilled" && cRes.value) setCorrelations(cRes.value);
      } catch { /* silent */ }
      if (!cancelled) setLoading(false);
    }
    load();
    const iv = setInterval(load, 5 * 60_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  const alerts: DivergenceAlert[] = [];
  if (factors) {
    for (const rule of RULES) {
      const result = rule.detect(factors, correlations, instrument);
      if (result) alerts.push(result);
    }
  }

  // Sort by severity
  const order = { high: 0, medium: 1, low: 2 };
  alerts.sort((a, b) => order[a.severity] - order[b.severity]);

  return (
    <div className="panel" style={{ minHeight: 0 }}>
      <div className="panel-title">
        Divergence Alerts
        {alerts.length > 0 && (
          <span style={{
            fontSize: "9px",
            background: SEVERITY_STYLE[alerts[0].severity].bg,
            color: SEVERITY_STYLE[alerts[0].severity].color,
            padding: "2px 6px", borderRadius: "4px", textTransform: "none",
            letterSpacing: 0, fontWeight: 600, marginLeft: 8,
          }}>
            {alerts.length} active
          </span>
        )}
      </div>

      {loading && !factors ? (
        <div style={{ fontSize: 12, color: "var(--text-3)", padding: "20px 0" }}>Scanning for divergences…</div>
      ) : alerts.length === 0 ? (
        <div style={{
          fontSize: 12, color: "var(--text-3)", padding: "16px 0", textAlign: "center",
        }}>
          <div style={{ fontSize: 18, marginBottom: 6, opacity: 0.4 }}>✓</div>
          No divergences detected. Markets are trading in normal correlation patterns.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {alerts.map((alert) => {
            const style = SEVERITY_STYLE[alert.severity];
            return (
              <div key={alert.id} style={{
                padding: "10px 12px", borderRadius: 8,
                background: style.bg, border: `1px solid ${style.border}`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 12 }}>{style.icon}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: style.color }}>
                    {alert.name}
                  </span>
                  <span style={{
                    fontSize: 8, padding: "1px 4px", borderRadius: 3,
                    background: `${style.color}20`, color: style.color,
                    fontWeight: 700, textTransform: "uppercase", marginLeft: "auto",
                  }}>
                    {alert.severity}
                  </span>
                </div>
                <div style={{ fontSize: 11, lineHeight: 1.5, color: "var(--text-2)", marginBottom: 6 }}>
                  {alert.description}
                </div>
                <div style={{
                  fontSize: 10, lineHeight: 1.5, color: "var(--text-primary)",
                  fontStyle: "italic", paddingLeft: 8,
                  borderLeft: `2px solid ${style.color}40`,
                }}>
                  {alert.implication}
                </div>
                <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                  {alert.factorsInvolved.map(f => (
                    <span key={f} style={{
                      fontSize: 8, padding: "1px 5px", borderRadius: 3,
                      background: "var(--surface-raised)", color: "var(--text-3)",
                      fontFamily: "var(--font-mono)", fontWeight: 500,
                    }}>{f}</span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
