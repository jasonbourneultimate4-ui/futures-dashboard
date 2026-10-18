"use client";

import { useEffect, useState } from "react";
import type { Instrument } from "@/lib/types";

const INSTRUMENT_NAMES: Record<Instrument, string> = {
  ES: "S&P 500", NQ: "Nasdaq 100", YM: "Dow Jones", CL: "Crude Oil", GC: "Gold",
};

/* ─── Narrative generation logic ─── */

interface NarrativeData {
  factors: Record<string, any> | null;
  sentimentIndex: number | null;
  sentimentLabel: string | null;
  articleCount: number;
  correlations: any | null;
}

function generateNarrative(instrument: Instrument, data: NarrativeData): string[] {
  const lines: string[] = [];
  const f = data.factors;
  if (!f || Object.keys(f).length === 0) return ["Awaiting macro data from cron job. Narrative will generate once factor data is available."];

  const name = INSTRUMENT_NAMES[instrument];

  // ── 1. Environment classification
  const vix = f.VIX ? parseFloat(f.VIX.value) : null;
  const us10y = f.US10Y ? parseFloat(f.US10Y.value?.replace("%", "")) : null;
  const dxy = f.DXY ? parseFloat(f.DXY.value?.replace(",", "")) : null;
  const fedRate = f.FED_RATE ? parseFloat(f.FED_RATE.value?.replace("%", "")) : null;
  const realYield = f.REAL_YIELD ? parseFloat(f.REAL_YIELD.value?.replace("%", "")) : null;

  // Macro environment sentence
  const envParts: string[] = [];
  if (vix !== null) {
    if (vix < 15) envParts.push("volatility is suppressed (VIX " + vix.toFixed(1) + ")");
    else if (vix > 25) envParts.push("volatility is elevated (VIX " + vix.toFixed(1) + ") signaling market stress");
    else envParts.push("volatility is within normal range (VIX " + vix.toFixed(1) + ")");
  }
  if (us10y !== null) {
    if (us10y > 4.8) envParts.push("Treasury yields remain restrictive at " + us10y.toFixed(2) + "%");
    else if (us10y < 3.8) envParts.push("Treasury yields have eased to " + us10y.toFixed(2) + "%, supportive of risk");
    else envParts.push("the 10Y yield sits at " + us10y.toFixed(2) + "%");
  }
  if (dxy !== null) {
    if (dxy > 106) envParts.push("the dollar is strong at " + dxy.toFixed(1));
    else if (dxy < 100) envParts.push("the dollar is weakening at " + dxy.toFixed(1));
  }

  if (envParts.length > 0) {
    lines.push("Current environment: " + envParts.join(", ") + ".");
  }

  // ── 2. Instrument-specific analysis
  if (instrument === "ES" || instrument === "NQ" || instrument === "YM") {
    const parts: string[] = [];
    if (vix !== null && us10y !== null) {
      if (vix > 25 && us10y > 4.5) {
        parts.push(`The combination of elevated fear (VIX ${vix.toFixed(1)}) and restrictive yields (${us10y.toFixed(2)}%) creates a challenging backdrop for ${name}. Historically, this pairing has preceded equity weakness.`);
      } else if (vix < 16 && us10y < 4.0) {
        parts.push(`Low volatility paired with accommodative yields creates a supportive environment for ${name}. This "Goldilocks" regime has historically favored equity upside.`);
      } else if (vix > 22 && us10y < 4.0) {
        parts.push(`Elevated VIX (${vix.toFixed(1)}) despite moderate yields suggests event-driven uncertainty rather than structural tightening. Watch for mean-reversion opportunities in ${name}.`);
      }
    }
    if (dxy !== null && dxy > 106) {
      parts.push(`Dollar strength at ${dxy.toFixed(1)} is a headwind for S&P 500 earnings — roughly 40% of S&P revenue comes from abroad.`);
    }
    if (fedRate !== null && fedRate > 5) {
      parts.push(`The Fed Funds rate at ${fedRate.toFixed(2)}% remains in restrictive territory. Rate cuts would be a major catalyst.`);
    }
    if (realYield !== null && realYield > 2.3) {
      parts.push(`Real yields at ${realYield.toFixed(2)}% mean cash and bonds offer genuine competition to equities for the first time in years.`);
    }
    if (parts.length > 0) lines.push(...parts);
    else lines.push(`${name} is navigating a mixed macro backdrop. No strong directional conviction from current factor readings.`);

  } else if (instrument === "CL") {
    if (dxy !== null) {
      if (dxy > 106) lines.push(`Strong dollar (${dxy.toFixed(1)}) is pressuring crude — oil priced in USD becomes more expensive for foreign buyers, dampening demand.`);
      else if (dxy < 100) lines.push(`Dollar weakness (${dxy.toFixed(1)}) provides a tailwind for crude prices as oil becomes cheaper for non-USD buyers.`);
    }
    const inv = f.CL_INVENTORIES;
    const prod = f.CL_US_PROD;
    if (inv) {
      lines.push(`US crude inventories at ${inv.value} (${inv.delta}). ${inv.dir === "down" ? "Draws suggest tightening supply." : inv.dir === "up" ? "Builds suggest weakening demand or rising production." : "Inventories stable."}`);
    }
    if (prod) {
      lines.push(`US production at ${prod.value} (${prod.delta}). ${prod.dir === "up" ? "Rising output adds supply-side pressure." : prod.dir === "down" ? "Declining output supports prices." : "Output steady."}`);
    }
    if (vix !== null && vix > 28) {
      lines.push("Risk-off sentiment (VIX > 28) typically weighs on crude through recession-fear demand destruction.");
    }

  } else if (instrument === "GC") {
    if (realYield !== null) {
      if (realYield > 2.3) lines.push(`Real yields at ${realYield.toFixed(2)}% are gold's primary headwind. Gold pays no yield, so high real rates increase opportunity cost.`);
      else if (realYield < 1.5) lines.push(`Low real yields at ${realYield.toFixed(2)}% reduce the opportunity cost of holding gold — historically the strongest fundamental driver.`);
      else lines.push(`Real yields at ${realYield.toFixed(2)}% — in the neutral zone for gold. Direction of the next move matters more than the level.`);
    }
    if (dxy !== null) {
      if (dxy > 106) lines.push(`Dollar strength at ${dxy.toFixed(1)} is a headwind — gold is priced in USD and moves inversely to the dollar.`);
      else if (dxy < 100) lines.push(`Dollar weakness at ${dxy.toFixed(1)} supports gold — the inverse dollar-gold relationship is one of the strongest in macro.`);
    }
    if (vix !== null && vix > 25) {
      lines.push("Elevated VIX drives safe-haven demand for gold. Flight-to-quality flows historically boost bullion during stress events.");
    }
    if (fedRate !== null) {
      if (fedRate > 5) lines.push(`Fed policy at ${fedRate.toFixed(2)}% is restrictive. Any pivot toward cuts would be a powerful catalyst for gold.`);
      else if (fedRate < 4) lines.push(`Accommodative Fed policy (${fedRate.toFixed(2)}%) supports gold through lower real rates and potential dollar weakness.`);
    }
  }

  // ── 3. News sentiment overlay
  if (data.sentimentIndex !== null) {
    const si = data.sentimentIndex;
    if (si > 30) {
      lines.push(`News flow is strongly bullish (sentiment index: +${si}). ${data.articleCount} articles analyzed — positive catalysts dominating headlines.`);
    } else if (si > 10) {
      lines.push(`News sentiment tilts positive (index: +${si}), suggesting favorable headline momentum.`);
    } else if (si < -30) {
      lines.push(`News flow is strongly bearish (sentiment index: ${si}). Negative headlines could amplify selling pressure.`);
    } else if (si < -10) {
      lines.push(`News sentiment tilts negative (index: ${si}). Watch for headline-driven sell-offs.`);
    } else {
      lines.push(`News sentiment is neutral (index: ${si}). No clear directional bias from ${data.articleCount} recent articles.`);
    }
  }

  // ── 4. Key risk / opportunity
  const risks: string[] = [];
  if (vix !== null && vix > 20 && vix < 25) risks.push("VIX near the 25 threshold — a breakout above could accelerate selling");
  if (us10y !== null && us10y > 4.5 && us10y < 5.0) risks.push("yields approaching 5% — a level that historically triggers equity repricing");
  if (dxy !== null && dxy > 104 && dxy < 107) risks.push("dollar near resistance — a breakout would pressure commodities and multinationals");
  if (risks.length > 0) {
    lines.push("Key risk to watch: " + risks[0] + ".");
  }

  return lines;
}

/* ─── Component ─── */

export default function NarrativeEngine({ instrument }: { instrument: Instrument }) {
  const [data, setData] = useState<NarrativeData>({
    factors: null, sentimentIndex: null, sentimentLabel: null, articleCount: 0, correlations: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [fRes, nRes] = await Promise.allSettled([
          fetch("/api/factors").then(r => r.ok ? r.json() : null),
          fetch(`/api/news?instrument=${instrument}`).then(r => r.ok ? r.json() : null),
        ]);
        if (cancelled) return;
        const factors = fRes.status === "fulfilled" ? fRes.value?.factors ?? null : null;
        const news = nRes.status === "fulfilled" ? nRes.value : null;
        setData({
          factors,
          sentimentIndex: news?.sentimentIndex?.index ?? null,
          sentimentLabel: news?.sentimentIndex?.label ?? null,
          articleCount: news?.sentimentIndex?.articleCount ?? 0,
          correlations: null,
        });
      } catch { /* silent */ }
      if (!cancelled) setLoading(false);
    }
    load();
    const iv = setInterval(load, 5 * 60_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [instrument]);

  const narrative = generateNarrative(instrument, data);

  return (
    <div className="panel" style={{ minHeight: 0 }}>
      <div className="panel-title">
        Macro Briefing
        <span style={{
          fontSize: "9px", background: "rgba(210, 153, 34, 0.1)", color: "#d29922",
          padding: "2px 6px", borderRadius: "4px", textTransform: "none",
          letterSpacing: 0, fontWeight: 600, marginLeft: 8,
        }}>
          {INSTRUMENT_NAMES[instrument]}
        </span>
      </div>

      {loading && !data.factors ? (
        <div style={{ fontSize: 12, color: "var(--text-3)", padding: "20px 0" }}>Generating briefing…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {narrative.map((line, i) => (
            <p key={i} style={{
              fontSize: 12, lineHeight: 1.55, margin: 0,
              color: i === 0 ? "var(--text-primary)" : "var(--text-2)",
              fontWeight: i === 0 ? 500 : 400,
              paddingLeft: i > 0 ? 0 : 0,
              borderLeft: i === narrative.length - 1 && line.startsWith("Key risk")
                ? "3px solid #d29922"
                : "none",
              ...(i === narrative.length - 1 && line.startsWith("Key risk") ? { paddingLeft: 10, background: "rgba(210,153,34,0.06)", padding: "6px 10px", borderRadius: "0 6px 6px 0" } : {}),
            }}>
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
