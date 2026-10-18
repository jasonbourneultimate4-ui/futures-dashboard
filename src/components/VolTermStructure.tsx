"use client";

import { useEffect, useState } from "react";

/* ─── VIX Term Structure Component ───
 * Shows VIX futures curve: contango vs backwardation.
 * Reads from /api/factors for spot VIX value.
 * For full term structure, would need VIX futures data from cron.
 * Falls back to spot VIX + educational content.
 */

interface VixTermData {
  spot: number | null;
  spotDir: string;
  spotDelta: string;
  // Future: vx1, vx2, vx3, etc.
  futures: { month: string; value: number }[];
}

function TermStructureChart({ data }: { data: VixTermData }) {
  const allValues = [data.spot ?? 0, ...data.futures.map(f => f.value)].filter(v => v > 0);
  if (allValues.length === 0) return null;

  const min = Math.min(...allValues) * 0.9;
  const max = Math.max(...allValues) * 1.1;
  const range = max - min || 1;

  const points = [
    { label: "Spot", value: data.spot ?? 0 },
    ...data.futures.map(f => ({ label: f.month, value: f.value })),
  ].filter(p => p.value > 0);

  const w = 280;
  const h = 100;
  const padL = 0;
  const padR = 0;
  const padT = 8;
  const padB = 18;

  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const getX = (i: number) => padL + (i / (points.length - 1)) * plotW;
  const getY = (v: number) => padT + plotH - ((v - min) / range) * plotH;

  const isContango = points.length >= 2 && points[points.length - 1].value > points[0].value;
  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${getX(i).toFixed(1)} ${getY(p.value).toFixed(1)}`).join(" ");

  // Gradient fill
  const fillD = pathD + ` L ${getX(points.length - 1).toFixed(1)} ${h - padB} L ${padL} ${h - padB} Z`;

  return (
    <div style={{ marginTop: 8 }}>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "auto" }}>
        <defs>
          <linearGradient id="vts-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={isContango ? "#3fb950" : "#f85149"} stopOpacity="0.15" />
            <stop offset="100%" stopColor={isContango ? "#3fb950" : "#f85149"} stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map(pct => (
          <line key={pct}
            x1={padL} y1={padT + plotH * (1 - pct)}
            x2={w - padR} y2={padT + plotH * (1 - pct)}
            stroke="var(--border, #30363d)" strokeWidth="0.5" strokeDasharray="3,3"
          />
        ))}
        {/* Fill */}
        <path d={fillD} fill="url(#vts-fill)" />
        {/* Line */}
        <path d={pathD} fill="none" stroke={isContango ? "#3fb950" : "#f85149"} strokeWidth="2" strokeLinejoin="round" />
        {/* Dots and labels */}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={getX(i)} cy={getY(p.value)} r="3"
              fill={i === 0 ? "#58a6ff" : isContango ? "#3fb950" : "#f85149"}
              stroke="var(--panel-bg, #161b22)" strokeWidth="1.5"
            />
            <text x={getX(i)} y={getY(p.value) - 7} textAnchor="middle"
              fill="var(--text-primary, #e6edf3)" fontSize="8" fontWeight="600" fontFamily="var(--font-mono)">
              {p.value.toFixed(1)}
            </text>
            <text x={getX(i)} y={h - 4} textAnchor="middle"
              fill="var(--text-3, #8b949e)" fontSize="7" fontFamily="var(--font-mono)">
              {p.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

const STRUCTURE_INFO = {
  contango: {
    label: "CONTANGO",
    color: "#3fb950",
    meaning: "VIX futures above spot — the market expects future volatility to be higher than current. This is the normal state (~80% of the time).",
    implication: "Mean reversion is your friend: vol sellers and short VIX strategies tend to profit. Low urgency for hedges.",
  },
  backwardation: {
    label: "BACKWARDATION",
    color: "#f85149",
    meaning: "VIX futures below spot — extreme fear NOW, with expectation it will fade. This happens during market crashes and panics.",
    implication: "High alert: backwardation signals acute stress. Equities often accelerate losses. But also where bottoms form — capitulation signal.",
  },
  flat: {
    label: "FLAT",
    color: "#d29922",
    meaning: "VIX term structure is flat — transition zone between regimes, or low conviction about future volatility direction.",
    implication: "Watch for directional breakout. Flat structure often precedes a sharp move in one direction.",
  },
};

export default function VolTermStructure() {
  const [data, setData] = useState<VixTermData>({
    spot: null, spotDir: "flat", spotDelta: "", futures: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/factors");
        if (!res.ok) return;
        const json = await res.json();
        const vix = json.factors?.VIX;
        if (!cancelled && vix) {
          const spot = parseFloat(String(vix.value));
          setData({
            spot: isNaN(spot) ? null : spot,
            spotDir: vix.dir ?? "flat",
            spotDelta: vix.delta ?? "",
            futures: [], // Will be populated when VIX futures data is in cron
          });
        }
      } catch { /* silent */ }
      if (!cancelled) setLoading(false);
    }
    load();
    const iv = setInterval(load, 5 * 60_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  // Determine structure type
  const structureType = data.futures.length > 0 && data.spot != null
    ? data.futures[data.futures.length - 1].value > data.spot * 1.03 ? "contango"
      : data.futures[data.futures.length - 1].value < data.spot * 0.97 ? "backwardation"
      : "flat"
    : data.spot != null
      ? data.spot < 18 ? "contango" : data.spot > 30 ? "backwardation" : "flat"
      : "flat";

  const info = STRUCTURE_INFO[structureType];

  return (
    <div className="panel" style={{ minHeight: 0 }}>
      <div className="panel-title">
        Volatility Structure
        {data.spot != null && (
          <span style={{
            fontSize: "9px", background: `${info.color}15`, color: info.color,
            padding: "2px 6px", borderRadius: "4px", textTransform: "none",
            letterSpacing: 0, fontWeight: 600, marginLeft: 8,
          }}>
            VIX {data.spot.toFixed(1)}
          </span>
        )}
      </div>

      {loading && data.spot == null ? (
        <div style={{ fontSize: 12, color: "var(--text-3, #8b949e)", padding: "20px 0" }}>Loading VIX data…</div>
      ) : data.spot != null ? (
        <>
          {/* Spot VIX display */}
          <div style={{
            display: "flex", alignItems: "center", gap: 12, marginTop: 8,
            padding: "8px 10px", borderRadius: 6,
            background: `${info.color}08`,
          }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "var(--font-mono)", color: info.color }}>
                {data.spot.toFixed(2)}
              </div>
              <div style={{ fontSize: 9, color: "var(--text-3, #8b949e)" }}>VIX Spot</div>
            </div>
            <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: data.spotDir === "up" ? "#f85149" : data.spotDir === "down" ? "#3fb950" : "#8b949e" }}>
              {data.spotDelta}
            </div>
            <div style={{ marginLeft: "auto" }}>
              <div style={{
                fontSize: 9, fontWeight: 700, textTransform: "uppercase",
                color: info.color, letterSpacing: "0.05em",
              }}>
                {info.label}
              </div>
            </div>
          </div>

          {/* Chart if we have futures data */}
          {data.futures.length > 0 && <TermStructureChart data={data} />}

          {/* VIX zones */}
          <div style={{ marginTop: 8, display: "flex", gap: 4 }}>
            {[
              { range: "< 15", label: "Complacent", color: "#3fb950", active: data.spot < 15 },
              { range: "15-20", label: "Normal", color: "#8b949e", active: data.spot >= 15 && data.spot < 20 },
              { range: "20-30", label: "Elevated", color: "#d29922", active: data.spot >= 20 && data.spot < 30 },
              { range: "30+", label: "Panic", color: "#f85149", active: data.spot >= 30 },
            ].map(zone => (
              <div key={zone.range} style={{
                flex: 1, padding: "4px", borderRadius: 4, textAlign: "center",
                background: zone.active ? `${zone.color}18` : "transparent",
                border: zone.active ? `1px solid ${zone.color}40` : "1px solid transparent",
              }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: zone.active ? zone.color : "var(--text-3, #8b949e)" }}>
                  {zone.range}
                </div>
                <div style={{ fontSize: 7, color: zone.active ? zone.color : "var(--text-3, #8b949e)", opacity: zone.active ? 1 : 0.5 }}>
                  {zone.label}
                </div>
              </div>
            ))}
          </div>

          {/* Structure meaning */}
          <div style={{
            marginTop: 8, padding: "6px 8px", borderRadius: 6,
            borderLeft: `3px solid ${info.color}`,
            background: `${info.color}06`,
          }}>
            <div style={{ fontSize: 10, lineHeight: 1.5, color: "var(--text-2, #c9d1d9)", marginBottom: 4 }}>
              {info.meaning}
            </div>
            <div style={{ fontSize: 10, lineHeight: 1.5, color: "var(--text-primary, #e6edf3)", fontStyle: "italic" }}>
              {info.implication}
            </div>
          </div>
        </>
      ) : (
        <div style={{ fontSize: 12, color: "var(--text-3, #8b949e)", padding: "20px 0", textAlign: "center" }}>
          Awaiting VIX data from cron job.
        </div>
      )}
    </div>
  );
}
