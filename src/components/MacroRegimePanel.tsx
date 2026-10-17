"use client";

import { useEffect, useState } from "react";
import type { Instrument } from "@/lib/types";

interface MacroSignal {
  label: string;
  value: string;
  signal: "bullish" | "bearish" | "neutral";
  weight: number;
  detail: string;
}

interface RegimeState {
  regime: string;
  score: number; // -100 to +100
  signals: MacroSignal[];
  updatedAt: string;
}

function computeLocalRegime(instrument: Instrument, factors: Record<string, any> | null, sentimentIndex: number | null): RegimeState {
  const signals: MacroSignal[] = [];

  if (!factors) {
    return { regime: "Unknown", score: 0, signals: [], updatedAt: "" };
  }

  // Instrument-specific signal generation
  if (instrument === "ES" || instrument === "NQ" || instrument === "YM") {
    // Equity index signals
    const vix = factors["VIX"];
    if (vix) {
      const v = parseFloat(vix.value);
      signals.push({
        label: "VIX Level",
        value: vix.value,
        signal: v < 15 ? "bullish" : v > 25 ? "bearish" : "neutral",
        weight: 3,
        detail: v < 15 ? "Low fear, risk-on" : v > 25 ? "Elevated fear, risk-off" : "Normal volatility",
      });
    }

    const us10y = factors["US10Y"];
    if (us10y) {
      const y = parseFloat(us10y.value);
      signals.push({
        label: "10Y Yield",
        value: us10y.value,
        signal: y > 5 ? "bearish" : y < 3.5 ? "bullish" : "neutral",
        weight: 2,
        detail: y > 5 ? "Tight financial conditions" : y < 3.5 ? "Accommodative conditions" : "Neutral rates",
      });
    }

    const dxy = factors["DXY"];
    if (dxy) {
      const d = parseFloat(dxy.value);
      signals.push({
        label: "Dollar Index",
        value: dxy.value,
        signal: d > 107 ? "bearish" : d < 100 ? "bullish" : "neutral",
        weight: 1,
        detail: d > 107 ? "Strong dollar headwind" : d < 100 ? "Weak dollar tailwind" : "Neutral dollar",
      });
    }
  } else if (instrument === "CL") {
    // Crude oil signals
    const dxy = factors["DXY"];
    if (dxy) {
      const d = parseFloat(dxy.value);
      signals.push({
        label: "Dollar Index",
        value: dxy.value,
        signal: d > 107 ? "bearish" : d < 100 ? "bullish" : "neutral",
        weight: 2,
        detail: d > 107 ? "Strong dollar pressures commodities" : d < 100 ? "Weak dollar supports commodities" : "Neutral impact",
      });
    }

    const vix = factors["VIX"];
    if (vix) {
      const v = parseFloat(vix.value);
      signals.push({
        label: "Risk Appetite",
        value: vix.value,
        signal: v < 18 ? "bullish" : v > 28 ? "bearish" : "neutral",
        weight: 1,
        detail: v < 18 ? "Risk-on supports demand" : v > 28 ? "Risk-off fears weigh on demand" : "Normal risk levels",
      });
    }
  } else if (instrument === "GC") {
    // Gold signals
    const us10y = factors["US10Y"];
    if (us10y) {
      const y = parseFloat(us10y.value);
      signals.push({
        label: "Real Yields",
        value: us10y.value,
        signal: y > 5 ? "bearish" : y < 3.5 ? "bullish" : "neutral",
        weight: 3,
        detail: y > 5 ? "High real yields = gold headwind" : y < 3.5 ? "Low real yields = gold tailwind" : "Neutral yield environment",
      });
    }

    const dxy = factors["DXY"];
    if (dxy) {
      const d = parseFloat(dxy.value);
      signals.push({
        label: "Dollar Index",
        value: dxy.value,
        signal: d > 107 ? "bearish" : d < 100 ? "bullish" : "neutral",
        weight: 3,
        detail: d > 107 ? "Strong dollar weighs on gold" : d < 100 ? "Weak dollar supports gold" : "Neutral dollar",
      });
    }

    const vix = factors["VIX"];
    if (vix) {
      const v = parseFloat(vix.value);
      signals.push({
        label: "Fear Gauge",
        value: vix.value,
        signal: v > 25 ? "bullish" : v < 12 ? "bearish" : "neutral",
        weight: 2,
        detail: v > 25 ? "Safe-haven bid" : v < 12 ? "No fear, risk-on" : "Normal sentiment",
      });
    }
  }

  // News sentiment as a universal signal
  if (sentimentIndex !== null) {
    signals.push({
      label: "News Sentiment",
      value: `${sentimentIndex > 0 ? "+" : ""}${sentimentIndex}`,
      signal: sentimentIndex > 20 ? "bullish" : sentimentIndex < -20 ? "bearish" : "neutral",
      weight: 2,
      detail: sentimentIndex > 20 ? "Bullish news flow" : sentimentIndex < -20 ? "Bearish news flow" : "Mixed news sentiment",
    });
  }

  // Compute weighted score
  let totalWeight = 0;
  let weightedSum = 0;
  for (const s of signals) {
    const val = s.signal === "bullish" ? 1 : s.signal === "bearish" ? -1 : 0;
    weightedSum += val * s.weight;
    totalWeight += s.weight;
  }
  const score = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) : 0;

  let regime: string;
  if (score >= 60) regime = "Risk-On";
  else if (score >= 25) regime = "Cautiously Bullish";
  else if (score <= -60) regime = "Risk-Off";
  else if (score <= -25) regime = "Cautiously Bearish";
  else regime = "Neutral / Mixed";

  return { regime, score, signals, updatedAt: "" };
}

const REGIME_STYLE: Record<string, { color: string; bg: string }> = {
  "Risk-On": { color: "#3fb950", bg: "rgba(63,185,80,0.12)" },
  "Cautiously Bullish": { color: "#56d364", bg: "rgba(86,211,100,0.08)" },
  "Neutral / Mixed": { color: "#8b949e", bg: "rgba(139,148,158,0.08)" },
  "Cautiously Bearish": { color: "#da3633", bg: "rgba(218,54,51,0.08)" },
  "Risk-Off": { color: "#f85149", bg: "rgba(248,81,73,0.12)" },
  "Unknown": { color: "#8b949e", bg: "rgba(139,148,158,0.08)" },
};

export default function MacroRegimePanel({ instrument }: { instrument: Instrument }) {
  const [factors, setFactors] = useState<Record<string, any> | null>(null);
  const [sentimentIndex, setSentimentIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [fRes, nRes] = await Promise.allSettled([
          fetch("/api/factors").then((r) => r.ok ? r.json() : null),
          fetch(`/api/news?instrument=${instrument}`).then((r) => r.ok ? r.json() : null),
        ]);
        if (cancelled) return;
        if (fRes.status === "fulfilled" && fRes.value) setFactors(fRes.value.factors);
        if (nRes.status === "fulfilled" && nRes.value?.sentimentIndex) {
          setSentimentIndex(nRes.value.sentimentIndex.index);
        }
      } catch { /* silent */ }
      if (!cancelled) setLoading(false);
    }
    load();
    const iv = setInterval(load, 5 * 60_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [instrument]);

  const state = computeLocalRegime(instrument, factors, sentimentIndex);
  const style = REGIME_STYLE[state.regime] ?? REGIME_STYLE["Unknown"];

  return (
    <div className="panel" style={{ minHeight: 0 }}>
      <div className="panel-title">
        Macro Regime
        <span style={{
          fontSize: "9px", background: style.bg, color: style.color,
          padding: "2px 6px", borderRadius: "4px", textTransform: "none",
          letterSpacing: 0, fontWeight: 600, marginLeft: 8,
        }}>
          {instrument}
        </span>
      </div>

      {loading && !factors ? (
        <div style={{ fontSize: 12, color: "var(--text-3)", padding: "20px 0" }}>Loading macro data…</div>
      ) : (
        <>
          {/* Regime badge */}
          <div style={{
            margin: "8px 0 12px",
            padding: "12px",
            borderRadius: "8px",
            background: style.bg,
            border: `1px solid ${style.color}30`,
            textAlign: "center",
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: style.color }}>
              {state.regime}
            </div>
            <div style={{
              fontSize: 12, fontFamily: "var(--font-mono)",
              color: style.color, marginTop: 4,
            }}>
              Score: {state.score > 0 ? "+" : ""}{state.score}
            </div>
          </div>

          {/* Score bar */}
          <div style={{ position: "relative", height: 8, borderRadius: 4, background: "var(--border)", overflow: "hidden", margin: "0 0 12px" }}>
            <div style={{
              position: "absolute", left: 0, top: 0, height: "100%",
              width: `${((state.score + 100) / 200) * 100}%`,
              borderRadius: 4,
              background: state.score >= 0
                ? `linear-gradient(90deg, var(--border) 0%, ${style.color} 100%)`
                : `linear-gradient(90deg, ${style.color} 0%, var(--border) 100%)`,
            }} />
            <div style={{ position: "absolute", left: "50%", top: 0, width: 2, height: "100%", background: "var(--text-secondary)", opacity: 0.3 }} />
          </div>

          {/* Signals */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {state.signals.map((s) => {
              const sColor = s.signal === "bullish" ? "#3fb950" : s.signal === "bearish" ? "#f85149" : "#8b949e";
              return (
                <div key={s.label} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "6px 8px", borderRadius: 6, background: "var(--surface-raised)",
                }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 500 }}>{s.label}</div>
                    <div style={{ fontSize: 9, color: "var(--text-3)" }}>{s.detail}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 12, fontFamily: "var(--font-mono)", fontWeight: 600 }}>{s.value}</div>
                    <div style={{
                      fontSize: 9, fontWeight: 700, color: sColor,
                      textTransform: "uppercase",
                    }}>
                      {s.signal === "bullish" ? "▲ BULL" : s.signal === "bearish" ? "▼ BEAR" : "— NEUTRAL"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {state.signals.length === 0 && (
            <div style={{ fontSize: 11, color: "var(--text-3)", textAlign: "center", padding: "12px 0" }}>
              Waiting for macro data from cron…
            </div>
          )}
        </>
      )}
    </div>
  );
}
