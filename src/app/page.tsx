"use client";

import { useState } from "react";
import { INSTRUMENTS, type Instrument } from "@/lib/types";
import NewsPanel from "@/components/NewsPanel";
import FundamentalsPanel from "@/components/FundamentalsPanel";
import RelationshipGraph from "@/components/RelationshipGraph";
import NetworkGraph from "@/components/NetworkGraph";
import MacroRegimePanel from "@/components/MacroRegimePanel";

const INSTRUMENT_LABELS: Record<Instrument, string> = {
  ES: "S&P 500",
  NQ: "Nasdaq 100",
  YM: "Dow Jones",
  CL: "Crude Oil",
  GC: "Gold",
};

export default function Dashboard() {
  const [selected, setSelected] = useState<Instrument>("ES");

  return (
    <main className="flex-1 p-4 max-w-[1400px] mx-auto w-full">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-xl font-bold">Futures Intelligence</h1>
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
          Macro regime · Correlations · News sentiment · Fundamentals
        </p>
      </div>

      {/* Instrument tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {INSTRUMENTS.map((inst) => {
          const isActive = inst === selected;
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
              <span className="ml-1.5 text-[10px] opacity-50 hidden sm:inline">
                {INSTRUMENT_LABELS[inst]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Row 1: Macro Regime + Fundamentals + News */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>
        <MacroRegimePanel instrument={selected} />
        <FundamentalsPanel instrument={selected} />
        <NewsPanel instrument={selected} />
      </div>

      {/* Row 2: Relationship Map */}
      <div style={{ marginTop: "16px" }}>
        <RelationshipGraph instrument={selected} />
      </div>

      {/* Row 3: Network Analysis (correlations + heatmap + shock sim) */}
      <div style={{ marginTop: "16px" }}>
        <NetworkGraph instrument={selected} />
      </div>

      <style jsx>{`
        @media (max-width: 900px) {
          div[style*="grid-template-columns: 1fr 1fr 1fr"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </main>
  );
}
