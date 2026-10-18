"use client";

import { useEffect, useState } from "react";
import type { Instrument } from "@/lib/types";

/* ─── Weighted factor definitions per instrument ─── */

interface FactorDef {
  key: string;               // matches factor_cache key (VIX, US10Y, DXY, etc.)
  label: string;
  weight: number;            // 1-5, higher = more important
  bullishWhen: "up" | "down" | "low" | "high";
  thresholds: { bullish: number; bearish: number };
  reasoning: { bullish: string; bearish: string; neutral: string };
}

const ES_FACTORS: FactorDef[] = [
  { key: "VIX", label: "VIX (Fear Index)", weight: 5, bullishWhen: "low",
    thresholds: { bullish: 16, bearish: 25 },
    reasoning: { bullish: "Low fear → risk appetite supports equities", bearish: "Elevated fear → hedging pressure, sell-offs likely", neutral: "Normal volatility range" }},
  { key: "US10Y", label: "10Y Treasury Yield", weight: 4, bullishWhen: "down",
    thresholds: { bullish: 3.8, bearish: 4.8 },
    reasoning: { bullish: "Falling yields → cheaper borrowing, equity-friendly", bearish: "Rising yields → tighter conditions, equity headwind", neutral: "Yields in neutral band" }},
  { key: "DXY", label: "US Dollar Index", weight: 3, bullishWhen: "down",
    thresholds: { bullish: 100, bearish: 106 },
    reasoning: { bullish: "Weak dollar → boosts multinational earnings", bearish: "Strong dollar → headwind for S&P earnings", neutral: "Dollar in neutral range" }},
  { key: "EURUSD", label: "EUR/USD", weight: 2, bullishWhen: "up",
    thresholds: { bullish: 1.10, bearish: 1.04 },
    reasoning: { bullish: "Euro strength signals global risk-on", bearish: "Euro weakness → flight to USD safety", neutral: "Pair in normal range" }},
  { key: "USDJPY", label: "USD/JPY (Carry Trade)", weight: 3, bullishWhen: "up",
    thresholds: { bullish: 148, bearish: 140 },
    reasoning: { bullish: "Yen weakness → carry trade intact, risk-on", bearish: "Yen strength → carry unwind risk, equity negative", neutral: "Carry trade stable" }},
  { key: "FED_RATE", label: "Fed Funds Rate", weight: 4, bullishWhen: "down",
    thresholds: { bullish: 4.0, bearish: 5.25 },
    reasoning: { bullish: "Rate cuts → liquidity boost for equities", bearish: "High rates → restrictive policy weighs on growth", neutral: "Policy rate in transition" }},
  { key: "REAL_YIELD", label: "10Y Real Yield (TIPS)", weight: 3, bullishWhen: "down",
    thresholds: { bullish: 1.5, bearish: 2.5 },
    reasoning: { bullish: "Low real yields → favorable for risk assets", bearish: "High real yields → cash/bonds compete with equities", neutral: "Real yields in neutral zone" }},
];

const NQ_FACTORS: FactorDef[] = [
  ...ES_FACTORS.map(f => ({ ...f })),
  { key: "SOX", label: "Semiconductor Index", weight: 4, bullishWhen: "up",
    thresholds: { bullish: 4500, bearish: 3500 },
    reasoning: { bullish: "Chip sector strength leads tech higher", bearish: "Chip weakness drags Nasdaq", neutral: "Semiconductors range-bound" }},
];

const CL_FACTORS: FactorDef[] = [
  { key: "DXY", label: "US Dollar Index", weight: 5, bullishWhen: "down",
    thresholds: { bullish: 100, bearish: 106 },
    reasoning: { bullish: "Weak dollar makes oil cheaper globally → demand up", bearish: "Strong dollar pressures commodity prices", neutral: "Dollar impact neutral" }},
  { key: "VIX", label: "Risk Appetite (VIX)", weight: 3, bullishWhen: "low",
    thresholds: { bullish: 18, bearish: 28 },
    reasoning: { bullish: "Risk-on environment supports demand outlook", bearish: "Risk-off → recession fears weigh on demand", neutral: "Normal risk levels" }},
  { key: "US10Y", label: "10Y Yield (Growth Proxy)", weight: 2, bullishWhen: "down",
    thresholds: { bullish: 3.8, bearish: 4.8 },
    reasoning: { bullish: "Lower rates support economic activity & oil demand", bearish: "Higher rates slow growth → demand destruction", neutral: "Yield impact neutral" }},
  { key: "BZ", label: "Brent Crude Spread", weight: 4, bullishWhen: "up",
    thresholds: { bullish: 75, bearish: 60 },
    reasoning: { bullish: "Brent strength signals tight global supply", bearish: "Brent weakness signals oversupply globally", neutral: "Brent-WTI spread normal" }},
  { key: "CL_INVENTORIES", label: "US Crude Inventories", weight: 5, bullishWhen: "down",
    thresholds: { bullish: 420000, bearish: 460000 },
    reasoning: { bullish: "Falling inventories → supply tightening", bearish: "Rising inventories → oversupply building", neutral: "Inventories at seasonal norms" }},
  { key: "CL_US_PROD", label: "US Production", weight: 3, bullishWhen: "down",
    thresholds: { bullish: 12500, bearish: 13200 },
    reasoning: { bullish: "Production declines tighten domestic supply", bearish: "Record production adds supply pressure", neutral: "Production stable" }},
];

const GC_FACTORS: FactorDef[] = [
  { key: "REAL_YIELD", label: "10Y Real Yield (TIPS)", weight: 5, bullishWhen: "down",
    thresholds: { bullish: 1.5, bearish: 2.5 },
    reasoning: { bullish: "Falling real yields → gold's zero-yield becomes attractive", bearish: "Rising real yields → opportunity cost kills gold bid", neutral: "Real yields in transition" }},
  { key: "DXY", label: "US Dollar Index", weight: 5, bullishWhen: "down",
    thresholds: { bullish: 100, bearish: 106 },
    reasoning: { bullish: "Weak dollar lifts gold (priced in USD)", bearish: "Strong dollar is gold's biggest headwind", neutral: "Dollar impact neutral" }},
  { key: "VIX", label: "Fear Gauge (VIX)", weight: 4, bullishWhen: "high",
    thresholds: { bullish: 25, bearish: 13 },
    reasoning: { bullish: "Elevated fear → safe-haven bid for gold", bearish: "Low fear → no urgency to hold gold", neutral: "Normal sentiment" }},
  { key: "US10Y", label: "10Y Nominal Yield", weight: 3, bullishWhen: "down",
    thresholds: { bullish: 3.8, bearish: 4.8 },
    reasoning: { bullish: "Falling yields reduce gold's carry cost", bearish: "Rising yields make bonds more attractive vs gold", neutral: "Yields in neutral range" }},
  { key: "FED_RATE", label: "Fed Funds Rate", weight: 4, bullishWhen: "down",
    thresholds: { bullish: 4.0, bearish: 5.25 },
    reasoning: { bullish: "Rate cuts → weaker dollar + lower real yields = gold rally", bearish: "High rates → strong dollar + high real yields = gold pain", neutral: "Policy in transition" }},
  { key: "GS_RATIO", label: "Gold/Silver Ratio", weight: 2, bullishWhen: "up",
    thresholds: { bullish: 80, bearish: 65 },
    reasoning: { bullish: "High ratio → silver underperforming, risk-off favors gold", bearish: "Low ratio → risk-on, industrial metals outperform", neutral: "Ratio at historical mean" }},
];

const INSTRUMENT_FACTOR_DEFS: Record<Instrument, FactorDef[]> = {
  ES: ES_FACTORS,
  NQ: NQ_FACTORS,
  YM: ES_FACTORS.map(f => ({ ...f })), // Dow uses same macro factors as S&P
  CL: CL_FACTORS,
  GC: GC_FACTORS,
};

/* ─── Score computation ─── */

interface ScoredFactor {
  def: FactorDef;
  rawValue: number;
  displayValue: string;
  delta: string;
  signal: "bullish" | "bearish" | "neutral";
  contribution: number; // weighted score contribution
  reasoning: string;
}

function parseNumeric(val: string): number {
  return parseFloat(val.replace(/[$,%KMBTb/d\s]/g, "").replace(/,/g, ""));
}

function scoreFactor(def: FactorDef, factorData: any): ScoredFactor | null {
  if (!factorData) return null;
  const raw = parseNumeric(factorData.value);
  if (isNaN(raw)) return null;

  let signal: "bullish" | "bearish" | "neutral";
  if (def.bullishWhen === "low" || def.bullishWhen === "down") {
    signal = raw <= def.thresholds.bullish ? "bullish" : raw >= def.thresholds.bearish ? "bearish" : "neutral";
  } else {
    signal = raw >= def.thresholds.bullish ? "bullish" : raw <= def.thresholds.bearish ? "bearish" : "neutral";
  }

  const contribution = signal === "bullish" ? def.weight : signal === "bearish" ? -def.weight : 0;

  return {
    def,
    rawValue: raw,
    displayValue: factorData.value,
    delta: factorData.delta ?? "",
    signal,
    contribution,
    reasoning: def.reasoning[signal],
  };
}

/* ─── Component ─── */

export default function EconomicScorecard({ instrument }: { instrument: Instrument }) {
  const [factors, setFactors] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/factors");
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setFactors(json.factors);
      } catch { /* silent */ }
      if (!cancelled) setLoading(false);
    }
    load();
    const iv = setInterval(load, 5 * 60_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  const defs = INSTRUMENT_FACTOR_DEFS[instrument] ?? [];
  const scored: ScoredFactor[] = defs
    .map(d => scoreFactor(d, factors?.[d.key]))
    .filter(Boolean) as ScoredFactor[];

  // Overall score: weighted sum normalized to -100..+100
  const maxScore = defs.reduce((s, d) => s + d.weight, 0);
  const rawScore = scored.reduce((s, f) => s + f.contribution, 0);
  const normalizedScore = maxScore > 0 ? Math.round((rawScore / maxScore) * 100) : 0;

  const bullishCount = scored.filter(f => f.signal === "bullish").length;
  const bearishCount = scored.filter(f => f.signal === "bearish").length;

  const verdictColor = normalizedScore > 25 ? "#3fb950" : normalizedScore < -25 ? "#f85149" : "#d29922";
  const verdict = normalizedScore > 50 ? "Strong Bullish" : normalizedScore > 25 ? "Lean Bullish"
    : normalizedScore < -50 ? "Strong Bearish" : normalizedScore < -25 ? "Lean Bearish" : "Mixed / Neutral";

  return (
    <div className="panel" style={{ minHeight: 0 }}>
      <div className="panel-title">
        Economic Scorecard
        <span style={{
          fontSize: "9px", background: `${verdictColor}18`, color: verdictColor,
          padding: "2px 6px", borderRadius: "4px", textTransform: "none",
          letterSpacing: 0, fontWeight: 600, marginLeft: 8,
        }}>
          {instrument}
        </span>
      </div>

      {loading && !factors ? (
        <div style={{ fontSize: 12, color: "var(--text-3)", padding: "20px 0" }}>Loading economic data…</div>
      ) : scored.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--text-3)", padding: "20px 0" }}>
          No factor data yet. Waiting for cron to populate.
        </div>
      ) : (
        <>
          {/* Overall verdict */}
          <div style={{
            margin: "8px 0 10px", padding: "10px 12px", borderRadius: "8px",
            background: `${verdictColor}10`, border: `1px solid ${verdictColor}25`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: verdictColor }}>{verdict}</div>
              <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2 }}>
                {bullishCount} bullish · {bearishCount} bearish · {scored.length - bullishCount - bearishCount} neutral
              </div>
            </div>
            <div style={{
              fontSize: 22, fontWeight: 800, fontFamily: "var(--font-mono)",
              color: verdictColor,
            }}>
              {normalizedScore > 0 ? "+" : ""}{normalizedScore}
            </div>
          </div>

          {/* Score bar */}
          <div style={{ position: "relative", height: 6, borderRadius: 3, background: "var(--border)", overflow: "hidden", margin: "0 0 12px" }}>
            <div style={{
              position: "absolute", left: 0, top: 0, height: "100%",
              width: `${((normalizedScore + 100) / 200) * 100}%`,
              borderRadius: 3,
              background: `linear-gradient(90deg, #f85149, var(--border) 45%, var(--border) 55%, #3fb950)`,
            }} />
            <div style={{
              position: "absolute",
              left: `${((normalizedScore + 100) / 200) * 100}%`,
              top: -2, width: 10, height: 10, borderRadius: "50%",
              background: verdictColor, border: "2px solid var(--bg)",
              transform: "translateX(-50%)",
            }} />
          </div>

          {/* Factor list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {scored
              .sort((a, b) => b.def.weight - a.def.weight)
              .map((f) => {
                const col = f.signal === "bullish" ? "#3fb950" : f.signal === "bearish" ? "#f85149" : "#8b949e";
                return (
                  <div key={f.def.key} style={{
                    padding: "7px 9px", borderRadius: 6,
                    background: "var(--surface-raised)",
                    borderLeft: `3px solid ${col}`,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 11, fontWeight: 600 }}>{f.def.label}</span>
                          <span style={{
                            fontSize: 8, padding: "1px 4px", borderRadius: 3,
                            background: `${col}18`, color: col, fontWeight: 700,
                            textTransform: "uppercase",
                          }}>
                            w{f.def.weight}
                          </span>
                        </div>
                        <div style={{ fontSize: 9, color: "var(--text-3)", marginTop: 2, lineHeight: 1.3 }}>
                          {f.reasoning}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", marginLeft: 8, flexShrink: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "var(--font-mono)" }}>
                          {f.displayValue}
                        </div>
                        <div style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: col }}>
                          {f.delta}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </>
      )}
    </div>
  );
}
