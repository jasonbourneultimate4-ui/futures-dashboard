"use client";

import { useEffect, useState, useCallback } from "react";
import { INSTRUMENTS, type Instrument, type PriceBar, type RegimeSnapshot, type PositioningScore } from "@/lib/types";
import PriceChart from "@/components/PriceChart";
import RegimeIndicator from "@/components/RegimeIndicator";
import PositioningGauge from "@/components/PositioningGauge";
import AlertsPanel, { type Alert } from "@/components/AlertsPanel";
import NewsPanel from "@/components/NewsPanel";
import FundamentalsPanel from "@/components/FundamentalsPanel";
import RelationshipGraph from "@/components/RelationshipGraph";

interface InstrumentSnapshot {
  priceBars: PriceBar[];
  regime: RegimeSnapshot;
  positioning: PositioningScore;
  dailyContext: any;
  lastUpdate: string;
}

type SnapshotData = Record<Instrument, InstrumentSnapshot>;

export default function Dashboard() {
  const [data, setData] = useState<SnapshotData | null>(null);
  const [selected, setSelected] = useState<Instrument>("ES");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string>("");

  const fetchSnapshot = useCallback(async () => {
    try {
      const res = await fetch("/api/snapshot");
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
      setData(json);
      setLastRefresh(new Date().toLocaleTimeString());
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSnapshot();
    const interval = setInterval(fetchSnapshot, 60_000);
    return () => clearInterval(interval);
  }, [fetchSnapshot]);

  const snap = data?.[selected] ?? null;

  const alerts: Alert[] = [];
  if (data) {
    for (const inst of INSTRUMENTS) {
      const s = data[inst];
      if (!s) continue;
      if (s.regime.adx > 40) {
        alerts.push({
          id: `${inst}-adx`,
          instrument: inst,
          type: "regime_change",
          message: `ADX at ${s.regime.adx.toFixed(1)} — strong trend in force`,
          severity: "warn",
          timestamp: s.regime.timestamp,
        });
      }
      if (Math.abs(s.positioning.score) > 70) {
        alerts.push({
          id: `${inst}-pos`,
          instrument: inst,
          type: "positioning_extreme",
          message: `Positioning score ${s.positioning.score > 0 ? "+" : ""}${s.positioning.score} — extreme ${s.positioning.score > 0 ? "long" : "short"} positioning`,
          severity: "critical",
          timestamp: s.positioning.timestamp,
        });
      }
    }
  }

  return (
    <main className="flex-1 p-4 max-w-[1400px] mx-auto w-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">Futures Dashboard</h1>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Market regime · Positioning · News · Fundamentals · 15-min delayed
          </p>
        </div>
        <div className="text-right text-xs" style={{ color: "var(--text-secondary)" }}>
          {lastRefresh && <div>Last refresh: {lastRefresh}</div>}
          {error && <div style={{ color: "var(--bear)" }}>Error: {error}</div>}
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        {INSTRUMENTS.map((inst) => {
          const isActive = inst === selected;
          const regime = data?.[inst]?.regime;
          return (
            <button
              key={inst}
              onClick={() => setSelected(inst)}
              className="px-4 py-2 rounded-md text-sm font-medium transition-colors"
              style={{
                background: isActive ? "var(--panel-bg)" : "transparent",
                border: isActive ? "1px solid var(--border)" : "1px solid transparent",
                color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
              }}
            >
              {inst}
              {regime && (
                <span className="ml-2 text-xs opacity-60">
                  {regime.regime === "strong_uptrend" || regime.regime === "uptrend"
                    ? "▲"
                    : regime.regime === "strong_downtrend" || regime.regime === "downtrend"
                    ? "▼"
                    : "◆"}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="panel text-center py-12">
          <p style={{ color: "var(--text-secondary)" }}>Loading market data...</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: "16px" }}>
          {/* Left column: chart, regime, positioning, alerts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4" style={{ alignContent: "start" }}>
            <div className="md:col-span-2">
              <PriceChart data={snap?.priceBars ?? []} title={`${selected} Price & Volume`} />
            </div>
            <RegimeIndicator data={snap?.regime ?? null} />
            <PositioningGauge data={snap?.positioning ?? null} />
            <div className="md:col-span-2">
              <AlertsPanel alerts={alerts} />
            </div>
          </div>

          {/* Right column: fundamentals + news */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <FundamentalsPanel instrument={selected} />
            <NewsPanel instrument={selected} />
          </div>
        </div>
      )}

      {!loading && (
        <div style={{ marginTop: "16px" }}>
          <RelationshipGraph instrument={selected} />
        </div>
      )}

      <style jsx>{`
        @media (max-width: 1000px) {
          div[style*="grid-template-columns: 1fr 380px"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </main>
  );
}
