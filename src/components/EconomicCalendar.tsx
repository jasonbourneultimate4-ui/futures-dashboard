"use client";

import { useState, useEffect, useCallback } from "react";
import type { Instrument } from "@/lib/types";

/* ─── Static calendar of known recurring events ─── */

interface CalendarEvent {
  id: string;
  name: string;
  shortName: string;
  frequency: string;
  impact: "high" | "medium" | "low";
  instruments: Instrument[];
  description: string;
  historicalImpact: string;
}

const ECONOMIC_EVENTS: CalendarEvent[] = [
  {
    id: "fomc", name: "FOMC Interest Rate Decision", shortName: "FOMC",
    frequency: "~6 weeks", impact: "high",
    instruments: ["ES", "NQ", "YM", "GC", "CL"],
    description: "Federal Reserve sets the federal funds rate target",
    historicalImpact: "ES avg move ±1.2% on decision days. GC inversely correlated with hawkish surprises.",
  },
  {
    id: "cpi", name: "Consumer Price Index (CPI)", shortName: "CPI",
    frequency: "Monthly", impact: "high",
    instruments: ["ES", "NQ", "YM", "GC"],
    description: "Key inflation measure — drives Fed policy expectations",
    historicalImpact: "Hot CPI prints have caused ES drops of 2-3%. Cool prints fuel rallies. GC rallies on disinflation.",
  },
  {
    id: "nfp", name: "Non-Farm Payrolls (NFP)", shortName: "NFP",
    frequency: "Monthly (first Friday)", impact: "high",
    instruments: ["ES", "NQ", "YM", "GC", "CL"],
    description: "Employment report — strongest labor market indicator",
    historicalImpact: "ES avg move ±0.8% on NFP day. Weak NFP bullish for rate cuts → GC up.",
  },
  {
    id: "pce", name: "PCE Price Index", shortName: "PCE",
    frequency: "Monthly", impact: "high",
    instruments: ["ES", "NQ", "YM", "GC"],
    description: "Fed's preferred inflation gauge — more important than CPI for policy",
    historicalImpact: "Core PCE surprises move ES ±0.5-1%. The key metric the Fed watches.",
  },
  {
    id: "eia", name: "EIA Crude Oil Inventories", shortName: "EIA Oil",
    frequency: "Weekly (Wednesday)", impact: "high",
    instruments: ["CL"],
    description: "Weekly US crude oil stockpile changes",
    historicalImpact: "CL moves ±1-3% on surprise draws/builds. Largest single-event CL mover.",
  },
  {
    id: "ism-mfg", name: "ISM Manufacturing PMI", shortName: "ISM Mfg",
    frequency: "Monthly (first business day)", impact: "medium",
    instruments: ["ES", "NQ", "YM", "CL"],
    description: "Purchasing managers survey — leading economic indicator",
    historicalImpact: "Sub-50 readings (contraction) pressure ES. CL sensitive to demand outlook.",
  },
  {
    id: "ism-svc", name: "ISM Services PMI", shortName: "ISM Svc",
    frequency: "Monthly (third business day)", impact: "medium",
    instruments: ["ES", "NQ", "YM"],
    description: "Services sector health — 70% of US GDP",
    historicalImpact: "Services PMI often more market-moving than manufacturing in services-driven economy.",
  },
  {
    id: "retail", name: "Retail Sales", shortName: "Retail",
    frequency: "Monthly", impact: "medium",
    instruments: ["ES", "NQ", "YM"],
    description: "Consumer spending — the backbone of US GDP",
    historicalImpact: "Strong retail supports earnings outlook. Weak retail signals consumer pullback.",
  },
  {
    id: "gdp", name: "GDP (Advance Estimate)", shortName: "GDP",
    frequency: "Quarterly", impact: "medium",
    instruments: ["ES", "NQ", "YM", "CL"],
    description: "Gross Domestic Product — the broadest economic measure",
    historicalImpact: "GDP surprises move ES ±0.3-0.5%. Recession signals are bearish across all risk assets.",
  },
  {
    id: "claims", name: "Initial Jobless Claims", shortName: "Claims",
    frequency: "Weekly (Thursday)", impact: "low",
    instruments: ["ES", "NQ", "YM"],
    description: "Weekly first-time unemployment filings",
    historicalImpact: "Trending data matters more than individual prints. Spikes above 300K are warning signs.",
  },
  {
    id: "opec", name: "OPEC+ Meeting / Decision", shortName: "OPEC+",
    frequency: "Bimonthly / as needed", impact: "high",
    instruments: ["CL"],
    description: "Production quota decisions from oil cartel",
    historicalImpact: "CL moves ±3-8% on surprise cut/increase decisions. Biggest supply-side driver.",
  },
  {
    id: "jackson", name: "Jackson Hole Symposium", shortName: "Jackson Hole",
    frequency: "Annual (August)", impact: "high",
    instruments: ["ES", "NQ", "YM", "GC", "CL"],
    description: "Fed Chair speech at annual central banker gathering",
    historicalImpact: "Policy pivots often signaled here (2022 hawkish shock: ES -3.4%).",
  },
];

const IMPACT_STYLE = {
  high: { color: "#f85149", bg: "rgba(248,81,73,0.08)", label: "HIGH" },
  medium: { color: "#d29922", bg: "rgba(210,153,34,0.08)", label: "MED" },
  low: { color: "#8b949e", bg: "rgba(139,148,158,0.08)", label: "LOW" },
};

export default function EconomicCalendar({ instrument }: { instrument: Instrument }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  // Filter events relevant to this instrument, sorted by impact
  const relevant = ECONOMIC_EVENTS
    .filter(e => e.instruments.includes(instrument))
    .sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return order[a.impact] - order[b.impact];
    });

  return (
    <div className="panel" style={{ minHeight: 0 }}>
      <div className="panel-title">
        Economic Calendar
        <span style={{
          fontSize: "9px", background: "rgba(88,166,255,0.1)", color: "#58a6ff",
          padding: "2px 6px", borderRadius: "4px", textTransform: "none",
          letterSpacing: 0, fontWeight: 600, marginLeft: 8,
        }}>
          {relevant.length} events
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
        {relevant.map(event => {
          const s = IMPACT_STYLE[event.impact];
          const isOpen = expanded === event.id;
          return (
            <div
              key={event.id}
              onClick={() => setExpanded(isOpen ? null : event.id)}
              style={{
                padding: "8px 10px", borderRadius: 6,
                background: isOpen ? s.bg : "var(--surface-raised, #21262d)",
                border: isOpen ? `1px solid ${s.color}30` : "1px solid transparent",
                cursor: "pointer", transition: "all 0.15s",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{
                  fontSize: 7, padding: "1px 4px", borderRadius: 3,
                  background: s.bg, color: s.color,
                  fontWeight: 700, textTransform: "uppercase",
                  flexShrink: 0,
                }}>
                  {s.label}
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, flex: 1, minWidth: 0 }}>
                  {event.shortName}
                </span>
                <span style={{ fontSize: 9, color: "var(--text-3, #8b949e)", flexShrink: 0 }}>
                  {event.frequency}
                </span>
                <span style={{ fontSize: 10, opacity: 0.4, marginLeft: 4, transition: "transform 0.15s", transform: isOpen ? "rotate(180deg)" : "rotate(0)" }}>
                  ▼
                </span>
              </div>

              {isOpen && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${s.color}15` }}>
                  <div style={{ fontSize: 11, lineHeight: 1.5, color: "var(--text-2, #c9d1d9)", marginBottom: 6 }}>
                    {event.description}
                  </div>
                  <div style={{
                    fontSize: 10, lineHeight: 1.5, color: "var(--text-primary, #e6edf3)",
                    fontStyle: "italic", paddingLeft: 8,
                    borderLeft: `2px solid ${s.color}40`,
                    background: `${s.color}08`, padding: "4px 8px", borderRadius: "0 4px 4px 0",
                  }}>
                    📊 {event.historicalImpact}
                  </div>
                  <div style={{ display: "flex", gap: 3, marginTop: 6, flexWrap: "wrap" }}>
                    {event.instruments.map(inst => (
                      <span key={inst} style={{
                        fontSize: 8, padding: "1px 5px", borderRadius: 3,
                        background: inst === instrument ? `${s.color}20` : "var(--surface-raised, #21262d)",
                        color: inst === instrument ? s.color : "var(--text-3, #8b949e)",
                        fontFamily: "var(--font-mono)", fontWeight: inst === instrument ? 700 : 500,
                      }}>{inst}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
