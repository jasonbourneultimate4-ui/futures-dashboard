"use client";

import type { RegimeSnapshot } from "@/lib/types";

interface Props {
  data: RegimeSnapshot | null;
}

const REGIME_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  strong_uptrend:  { label: "Strong Uptrend",  color: "var(--bull)",       icon: "⬆⬆" },
  uptrend:         { label: "Uptrend",          color: "var(--bull-faded)", icon: "⬆" },
  range:           { label: "Range",            color: "var(--range)",      icon: "↔" },
  downtrend:       { label: "Downtrend",        color: "var(--bear-faded)", icon: "⬇" },
  strong_downtrend:{ label: "Strong Downtrend", color: "var(--bear)",       icon: "⬇⬇" },
  transitional:    { label: "Transitional",     color: "var(--warn)",       icon: "⟳" },
};

export default function RegimeIndicator({ data }: Props) {
  if (!data) {
    return (
      <div className="panel">
        <h3 className="panel-title">Market Regime</h3>
        <p className="text-secondary text-sm">No data</p>
      </div>
    );
  }

  const cfg = REGIME_CONFIG[data.regime] ?? REGIME_CONFIG.range;

  return (
    <div className="panel">
      <h3 className="panel-title">{data.instrument} Regime</h3>

      <div className="flex items-center gap-3 mt-3">
        <span className="text-3xl">{cfg.icon}</span>
        <div>
          <div className="text-lg font-bold" style={{ color: cfg.color }}>{cfg.label}</div>
          <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
            ADX {data.adx.toFixed(1)} · VWAP Slope {data.vwapSlope > 0 ? "+" : ""}{data.vwapSlope.toFixed(2)} bps
          </div>
        </div>
      </div>

      {/* ADX bar */}
      <div className="mt-3">
        <div className="flex justify-between text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
          <span>ADX</span>
          <span>{data.adx.toFixed(1)}</span>
        </div>
        <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "var(--gauge-bg)" }}>
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.min(data.adx, 60) / 60 * 100}%`,
              background: data.adx > 25 ? cfg.color : "var(--range)",
            }}
          />
        </div>
        <div className="flex justify-between text-[10px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
          <span>0</span>
          <span>|20</span>
          <span>|25</span>
          <span>60</span>
        </div>
      </div>
    </div>
  );
}
