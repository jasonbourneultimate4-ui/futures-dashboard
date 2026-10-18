"use client";

import { useEffect, useState } from "react";
import type { Instrument } from "@/lib/types";

/* ─── COT Positioning Component ───
 * Reads from /api/cot which returns cached CFTC data.
 * The cron job fetches from the CFTC API and writes to Supabase.
 * Until cron is wired, shows explanatory static content about COT.
 */

interface COTData {
  instrument: string;
  reportDate: string;
  commercialLong: number;
  commercialShort: number;
  commercialNet: number;
  largeSpecLong: number;
  largeSpecShort: number;
  largeSpecNet: number;
  smallSpecLong: number;
  smallSpecShort: number;
  smallSpecNet: number;
  openInterest: number;
  prevCommercialNet?: number;
  prevLargeSpecNet?: number;
}

const INSTRUMENT_COT_NAMES: Record<Instrument, string> = {
  ES: "S&P 500 E-mini", NQ: "Nasdaq 100 E-mini", YM: "Dow Jones E-mini",
  CL: "Crude Oil WTI", GC: "Gold",
};

// Static educational info when no live data
const COT_INSIGHTS: Record<Instrument, { commercials: string; specs: string; signal: string }> = {
  ES: {
    commercials: "Hedgers (pension funds, insurers) who sell futures to hedge equity portfolios",
    specs: "Hedge funds and CTAs who drive momentum — extreme long = potential top",
    signal: "When large specs hit record longs, ES has topped within 2-4 weeks 70% of the time",
  },
  NQ: {
    commercials: "Tech sector hedgers and index fund operators",
    specs: "Leveraged funds that amplify moves — Nasdaq COT is more volatile than ES",
    signal: "NQ spec positioning extremes tend to be sharper but shorter-lived than ES",
  },
  YM: {
    commercials: "Institutional hedgers with broad market exposure",
    specs: "Dow positioning often lags ES/NQ — useful as a confirmation signal",
    signal: "When all three equity COTs align at extremes, the signal is strongest",
  },
  CL: {
    commercials: "Oil producers (natural shorts) and refiners (natural longs) — the smart money",
    specs: "Managed money whose positioning is the best contrarian signal in commodities",
    signal: "When managed money net longs exceed 400K contracts, CL has corrected 80% of the time",
  },
  GC: {
    commercials: "Gold miners hedging production — almost always net short",
    specs: "Trend-followers and macro funds — their positioning drives gold's medium-term direction",
    signal: "When spec net longs drop below 50K, gold has historically found a floor within weeks",
  },
};

function PositionBar({ label, long, short, net, color }: {
  label: string; long: number; short: number; net: number; color: string;
}) {
  const total = long + short;
  const longPct = total > 0 ? (long / total) * 100 : 50;

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color }}>{label}</span>
        <span style={{
          fontSize: 10, fontFamily: "var(--font-mono)", fontWeight: 700,
          color: net > 0 ? "#3fb950" : net < 0 ? "#f85149" : "#8b949e",
        }}>
          {net > 0 ? "+" : ""}{(net / 1000).toFixed(1)}K net
        </span>
      </div>
      <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", background: "var(--border, #30363d)" }}>
        <div style={{
          width: `${longPct}%`, background: "#3fb950", borderRadius: "3px 0 0 3px",
          transition: "width 0.3s",
        }} />
        <div style={{
          width: `${100 - longPct}%`, background: "#f85149", borderRadius: "0 3px 3px 0",
          transition: "width 0.3s",
        }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
        <span style={{ fontSize: 8, color: "#3fb950" }}>{(long / 1000).toFixed(0)}K long</span>
        <span style={{ fontSize: 8, color: "#f85149" }}>{(short / 1000).toFixed(0)}K short</span>
      </div>
    </div>
  );
}

export default function COTPositioning({ instrument }: { instrument: Instrument }) {
  const [data, setData] = useState<COTData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/cot?instrument=${instrument}`);
        if (res.ok) {
          const json = await res.json();
          if (!cancelled && json.data) setData(json.data);
        }
      } catch { /* silent */ }
      if (!cancelled) setLoading(false);
    }
    load();
    const iv = setInterval(load, 10 * 60_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [instrument]);

  const insight = COT_INSIGHTS[instrument];

  return (
    <div className="panel" style={{ minHeight: 0 }}>
      <div className="panel-title">
        COT Positioning
        <span style={{
          fontSize: "9px", background: "rgba(88,166,255,0.1)", color: "#58a6ff",
          padding: "2px 6px", borderRadius: "4px", textTransform: "none",
          letterSpacing: 0, fontWeight: 600, marginLeft: 8,
        }}>
          {INSTRUMENT_COT_NAMES[instrument]}
        </span>
      </div>

      {data ? (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 9, color: "var(--text-3, #8b949e)", marginBottom: 8 }}>
            Report: {data.reportDate} · Open Interest: {(data.openInterest / 1000).toFixed(0)}K
          </div>

          <PositionBar label="Commercials (Hedgers)" long={data.commercialLong} short={data.commercialShort} net={data.commercialNet} color="#58a6ff" />
          <PositionBar label="Large Speculators" long={data.largeSpecLong} short={data.largeSpecShort} net={data.largeSpecNet} color="#d29922" />
          <PositionBar label="Small Speculators" long={data.smallSpecLong} short={data.smallSpecShort} net={data.smallSpecNet} color="#8b949e" />

          {/* Week-over-week change */}
          {data.prevLargeSpecNet != null && (
            <div style={{
              marginTop: 8, padding: "6px 8px", borderRadius: 6,
              background: "rgba(210,153,34,0.06)", border: "1px solid rgba(210,153,34,0.15)",
              fontSize: 10, lineHeight: 1.5, color: "var(--text-2, #c9d1d9)",
            }}>
              <strong>Weekly change:</strong> Large specs shifted {
                (data.largeSpecNet - data.prevLargeSpecNet) > 0 ? "+" : ""
              }{((data.largeSpecNet - data.prevLargeSpecNet) / 1000).toFixed(1)}K contracts.
              {" "}{Math.abs(data.largeSpecNet - data.prevLargeSpecNet) > 20000
                ? "Significant repositioning — watch for follow-through."
                : "Modest change — positioning trend intact."}
            </div>
          )}
        </div>
      ) : (
        /* Educative fallback when no live data */
        <div style={{ marginTop: 8 }}>
          <div style={{
            fontSize: 10, color: "var(--text-3, #8b949e)", marginBottom: 8,
            padding: "6px 8px", borderRadius: 6, background: "rgba(88,166,255,0.05)",
          }}>
            CFTC data updates weekly (Friday release for Tuesday positions). Awaiting cron data.
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[
              { label: "Commercials", text: insight.commercials, color: "#58a6ff" },
              { label: "Speculators", text: insight.specs, color: "#d29922" },
              { label: "Key Signal", text: insight.signal, color: "#3fb950" },
            ].map(item => (
              <div key={item.label} style={{
                padding: "6px 8px", borderRadius: 6,
                borderLeft: `3px solid ${item.color}`,
                background: `${item.color}08`,
              }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: item.color, marginBottom: 2 }}>
                  {item.label}
                </div>
                <div style={{ fontSize: 10, lineHeight: 1.5, color: "var(--text-2, #c9d1d9)" }}>
                  {item.text}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
