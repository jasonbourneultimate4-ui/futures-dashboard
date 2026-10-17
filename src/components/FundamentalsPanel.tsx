"use client";

import { useEffect, useState } from "react";
import type { Instrument } from "@/lib/types";

interface FactorDisplay {
  label: string;
  value: string;
  delta: string;
  direction: "bull" | "bear" | "neutral";
}

// Which factors matter for each instrument
const INSTRUMENT_FACTORS: Record<Instrument, string[]> = {
  ES: ["US10Y", "VIX", "DXY", "EURUSD", "USDJPY"],
  NQ: ["US10Y", "VIX", "DXY", "USDJPY", "EURUSD"],
  YM: ["US10Y", "VIX", "DXY", "EURUSD", "USDJPY"],
  CL: ["DXY", "VIX", "US10Y", "BZ", "EURUSD"],
  GC: ["US10Y", "DXY", "SI", "VIX", "EURUSD"],
};

const FACTOR_LABELS: Record<string, string> = {
  US10Y: "10Y Yield",
  VIX: "VIX",
  DXY: "Dollar Index",
  EURUSD: "EUR/USD",
  USDJPY: "USD/JPY",
  SI: "Silver",
  BZ: "Brent Crude",
};

export default function FundamentalsPanel({ instrument }: { instrument: Instrument }) {
  const [factors, setFactors] = useState<Record<string, any> | null>(null);
  const [sources, setSources] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/factors");
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) {
          setFactors(json.factors);
          setSources(json.sources ?? []);
        }
      } catch { /* silent */ }
      if (!cancelled) setLoading(false);
    }
    load();
    const iv = setInterval(load, 5 * 60_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  const keys = INSTRUMENT_FACTORS[instrument] ?? [];
  const items: FactorDisplay[] = keys
    .map((k) => {
      const f = factors?.[k];
      if (!f) return null;
      return {
        label: FACTOR_LABELS[k] || k,
        value: f.value,
        delta: f.delta,
        direction: f.dir === "up" ? "bull" as const : f.dir === "down" ? "bear" as const : "neutral" as const,
      };
    })
    .filter(Boolean) as FactorDisplay[];

  return (
    <div className="panel">
      <div className="panel-title">
        {instrument} Fundamentals
        <span style={{
          fontSize: "9px", background: "var(--accent-dim)", color: "var(--accent)",
          padding: "2px 6px", borderRadius: "4px", textTransform: "none",
          letterSpacing: 0, fontWeight: 500,
        }}>
          Key Drivers
        </span>
      </div>

      {loading && items.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--text-3)", padding: "20px 0" }}>Loading fundamentals…</div>
      ) : items.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--text-3)", padding: "20px 0" }}>
          No factor data yet. Waiting for cron to populate.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
          {items.map((item) => {
            const dColor = item.direction === "bull" ? "var(--bull)"
              : item.direction === "bear" ? "var(--bear)" : "var(--text-2)";
            return (
              <div key={item.label} style={{
                padding: "8px 10px", background: "var(--surface-raised)", borderRadius: "6px",
              }}>
                <div style={{ fontSize: "10px", color: "var(--text-3)", fontWeight: 500 }}>
                  {item.label}
                </div>
                <div style={{
                  fontSize: "14px", fontWeight: 600, fontFamily: "var(--font-mono)", marginTop: "2px",
                }}>
                  {item.value}
                </div>
                {item.delta && (
                  <div style={{ fontSize: "10px", fontWeight: 500, fontFamily: "var(--font-mono)", color: dColor }}>
                    {item.delta}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {sources.length > 0 && (
        <div style={{ fontSize: 9, color: "var(--text-3)", marginTop: 8, opacity: 0.5 }}>
          via {sources.join(", ")}
        </div>
      )}
    </div>
  );
}
