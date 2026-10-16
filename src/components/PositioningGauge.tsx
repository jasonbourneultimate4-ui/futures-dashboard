"use client";

import type { PositioningScore } from "@/lib/types";

interface Props {
  data: PositioningScore | null;
}

const QUADRANT_LABELS: Record<string, { label: string; color: string }> = {
  new_longs: { label: "New Longs", color: "var(--bull)" },
  short_covering: { label: "Short Covering", color: "var(--bull-faded)" },
  new_shorts: { label: "New Shorts", color: "var(--bear)" },
  long_liquidation: { label: "Long Liquidation", color: "var(--bear-faded)" },
  unknown: { label: "Unknown", color: "var(--text-secondary)" },
};

export default function PositioningGauge({ data }: Props) {
  if (!data) {
    return (
      <div className="panel">
        <h3 className="panel-title">Positioning Score</h3>
        <p className="text-secondary text-sm">No data</p>
      </div>
    );
  }

  const score = data.score;
  const pct = ((score + 100) / 200) * 100; // 0-100%
  const quad = QUADRANT_LABELS[data.components.oiQuadrant] ?? QUADRANT_LABELS.unknown;

  return (
    <div className="panel">
      <h3 className="panel-title">{data.instrument} Positioning</h3>

      {/* Score bar */}
      <div className="mt-3 mb-2">
        <div className="flex justify-between text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
          <span>-100 (Short)</span>
          <span
            className="font-bold text-base"
            style={{ color: score > 20 ? "var(--bull)" : score < -20 ? "var(--bear)" : "var(--text-primary)" }}
          >
            {score > 0 ? "+" : ""}{score}
          </span>
          <span>+100 (Long)</span>
        </div>
        <div className="w-full h-3 rounded-full overflow-hidden" style={{ background: "var(--gauge-bg)" }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${pct}%`,
              background: score > 0
                ? `linear-gradient(90deg, var(--gauge-mid), var(--bull))`
                : `linear-gradient(90deg, var(--bear), var(--gauge-mid))`,
            }}
          />
        </div>
      </div>

      {/* OI Quadrant */}
      <div className="flex items-center gap-2 mt-3 text-sm">
        <span className="w-2 h-2 rounded-full" style={{ background: quad.color }} />
        <span style={{ color: quad.color }}>{quad.label}</span>
      </div>

      {/* Component breakdown */}
      <div className="grid grid-cols-3 gap-2 mt-3 text-xs" style={{ color: "var(--text-secondary)" }}>
        <div>
          <div className="font-medium">COT Bias</div>
          <div className="font-mono">{data.components.cotBias > 0 ? "+" : ""}{data.components.cotBias}</div>
        </div>
        <div>
          <div className="font-medium">Price/VWAP</div>
          <div className="font-mono">{data.components.priceVsVwap > 0 ? "+" : ""}{data.components.priceVsVwap}</div>
        </div>
        <div>
          <div className="font-medium">Vol Trend</div>
          <div className="font-mono">{data.components.volumeTrend > 0 ? "+" : ""}{data.components.volumeTrend}</div>
        </div>
      </div>
    </div>
  );
}
