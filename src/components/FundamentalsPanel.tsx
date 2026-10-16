"use client";

import type { Instrument, FundamentalItem } from "@/lib/types";

/**
 * Key fundamental drivers per instrument.
 * In production these would come from an API; for now they are
 * seeded with representative data to show the layout.
 */
const FUNDAMENTALS: Record<Instrument, FundamentalItem[]> = {
  ES: [
    { label: "10Y Yield", value: "4.87%", delta: "+3.2 bps", direction: "bear" },
    { label: "VIX", value: "14.82", delta: "-0.31", direction: "bull" },
    { label: "DXY", value: "106.42", delta: "+0.18", direction: "neutral" },
    { label: "Fed Funds", value: "4.50%", delta: "—", direction: "neutral" },
    { label: "PMI Mfg", value: "55.0", delta: "+0.8", direction: "bull" },
    { label: "Jobless Claims", value: "200K", delta: "-5K", direction: "bull" },
  ],
  NQ: [
    { label: "10Y Yield", value: "4.87%", delta: "+3.2 bps", direction: "bear" },
    { label: "SOX Index", value: "5,842", delta: "+1.2%", direction: "bull" },
    { label: "AAPL", value: "$287.40", delta: "+0.6%", direction: "bull" },
    { label: "NVDA", value: "$892.10", delta: "+1.8%", direction: "bull" },
    { label: "VIX", value: "14.82", delta: "-0.31", direction: "bull" },
    { label: "USD/JPY", value: "154.20", delta: "+0.3%", direction: "neutral" },
  ],
  CL: [
    { label: "EIA Inv.", value: "-1.4M bbl", delta: "Draw", direction: "bull" },
    { label: "OPEC+ Prod", value: "27.8M b/d", delta: "+0.2M", direction: "bear" },
    { label: "DXY", value: "106.42", delta: "+0.18", direction: "bear" },
    { label: "Brent Sprd", value: "$3.12", delta: "-$0.08", direction: "neutral" },
    { label: "Rig Count", value: "482", delta: "-3", direction: "bull" },
    { label: "Demand Est.", value: "103.1M b/d", delta: "+0.4", direction: "bull" },
  ],
  GC: [
    { label: "Real Yield", value: "1.92%", delta: "+4 bps", direction: "bear" },
    { label: "DXY", value: "106.42", delta: "+0.18", direction: "bear" },
    { label: "Silver", value: "$32.14", delta: "+1.2%", direction: "bull" },
    { label: "Gold/Silver", value: "130.8", delta: "+0.4", direction: "neutral" },
    { label: "CB Demand", value: "1,037t YTD", delta: "+12%", direction: "bull" },
    { label: "ETF Flows", value: "+18.2t", delta: "Oct MTD", direction: "bull" },
  ],
};

interface FundamentalsPanelProps {
  instrument: Instrument;
}

export default function FundamentalsPanel({ instrument }: FundamentalsPanelProps) {
  const items = FUNDAMENTALS[instrument] ?? [];

  return (
    <div className="panel">
      <div className="panel-title">
        {instrument} Fundamentals
        <span
          style={{
            fontSize: "9px",
            background: "var(--accent-dim)",
            color: "var(--accent)",
            padding: "2px 6px",
            borderRadius: "4px",
            textTransform: "none",
            letterSpacing: 0,
            fontWeight: 500,
          }}
        >
          Key Drivers
        </span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "8px",
        }}
      >
        {items.map((item) => {
          const dColor =
            item.direction === "bull"
              ? "var(--bull)"
              : item.direction === "bear"
                ? "var(--bear)"
                : "var(--text-2)";
          return (
            <div
              key={item.label}
              style={{
                padding: "8px 10px",
                background: "var(--surface-raised)",
                borderRadius: "6px",
              }}
            >
              <div
                style={{
                  fontSize: "10px",
                  color: "var(--text-3)",
                  fontWeight: 500,
                }}
              >
                {item.label}
              </div>
              <div
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  fontFamily: "var(--font-mono)",
                  marginTop: "2px",
                }}
              >
                {item.value}
              </div>
              {item.delta && (
                <div
                  style={{
                    fontSize: "10px",
                    fontWeight: 500,
                    fontFamily: "var(--font-mono)",
                    color: dColor,
                  }}
                >
                  {item.delta}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
