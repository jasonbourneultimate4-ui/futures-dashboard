"use client";

import { useState } from "react";
import { INSTRUMENTS, type Instrument } from "@/lib/types";
import NewsPanel from "@/components/NewsPanel";
import RelationshipGraph from "@/components/RelationshipGraph";
import NetworkGraph from "@/components/NetworkGraph";
import MacroRegimePanel from "@/components/MacroRegimePanel";
import EconomicScorecard from "@/components/EconomicScorecard";
import NarrativeEngine from "@/components/NarrativeEngine";
import DivergenceDetector from "@/components/DivergenceDetector";
import EconomicCalendar from "@/components/EconomicCalendar";
import COTPositioning from "@/components/COTPositioning";
import VolTermStructure from "@/components/VolTermStructure";
import MomentumScanner from "@/components/MomentumScanner";
import ThemeToggle from "@/components/ThemeToggle";
import RefreshIndicator from "@/components/RefreshIndicator";

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
    <main style={{ flex: 1, padding: 16, maxWidth: 1400, margin: "0 auto", width: "100%" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Futures Intelligence</h1>
          <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: "2px 0 0" }}>
            Macro regime · Correlations · News sentiment · Fundamentals
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <RefreshIndicator />
          <ThemeToggle />
        </div>
      </div>

      {/* Instrument tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {INSTRUMENTS.map((inst) => {
          const isActive = inst === selected;
          return (
            <button
              key={inst}
              onClick={() => setSelected(inst)}
              style={{
                padding: "8px 14px",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                transition: "background 0.15s",
                background: isActive ? "var(--panel-bg)" : "transparent",
                border: isActive ? "1px solid var(--border)" : "1px solid transparent",
                color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                minWidth: 44,
              }}
            >
              {inst}
              <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.5 }} className="fi-inst-label">
                {INSTRUMENT_LABELS[inst]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Row 1: Macro Regime + Economic Scorecard + News */}
      <div className="fi-grid fi-grid-3">
        <MacroRegimePanel instrument={selected} />
        <EconomicScorecard instrument={selected} />
        <NewsPanel instrument={selected} />
      </div>

      {/* Row 2: Narrative Briefing + Divergence Alerts */}
      <div className="fi-grid fi-grid-2-1" style={{ marginTop: 16 }}>
        <NarrativeEngine instrument={selected} />
        <DivergenceDetector instrument={selected} />
      </div>

      {/* Row 3: COT + Vol Structure + Momentum */}
      <div className="fi-grid fi-grid-3" style={{ marginTop: 16 }}>
        <COTPositioning instrument={selected} />
        <VolTermStructure />
        <MomentumScanner />
      </div>

      {/* Row 4: Economic Calendar */}
      <div style={{ marginTop: 16 }}>
        <EconomicCalendar instrument={selected} />
      </div>

      {/* Row 5: Relationship Map */}
      <div style={{ marginTop: 16 }}>
        <RelationshipGraph instrument={selected} />
      </div>

      {/* Row 6: Network Analysis */}
      <div style={{ marginTop: 16 }}>
        <NetworkGraph instrument={selected} />
      </div>

      <style jsx>{`
        .fi-grid {
          display: grid;
          gap: 16px;
        }
        .fi-grid-3 {
          grid-template-columns: 1fr 1fr 1fr;
        }
        .fi-grid-2-1 {
          grid-template-columns: 2fr 1fr;
        }
        @media (max-width: 900px) {
          .fi-grid-3 {
            grid-template-columns: 1fr !important;
          }
          .fi-grid-2-1 {
            grid-template-columns: 1fr !important;
          }
          .fi-inst-label {
            display: none !important;
          }
        }
        @media (max-width: 600px) {
          main {
            padding: 10px !important;
          }
        }
      `}</style>
    </main>
  );
}
