"use client";

import { useEffect, useState } from "react";

/* ─── Intermarket Momentum Scanner ───
 * Shows rate-of-change across all instruments to identify leaders/laggers.
 * Reads from /api/factors for current values and deltas.
 */

interface MomentumItem {
  id: string;
  label: string;
  value: string;
  changePct: number;
  dir: string;
  category: "equity" | "commodity" | "macro" | "currency";
}

const CATEGORY_COLORS = {
  equity: "#58a6ff",
  commodity: "#d29922",
  macro: "#f85149",
  currency: "#3fb950",
};

const CATEGORY_LABELS = {
  equity: "Equity",
  commodity: "Commodity",
  macro: "Macro",
  currency: "Currency",
};

const TRACKER_CONFIG: { id: string; label: string; category: MomentumItem["category"] }[] = [
  { id: "ES", label: "S&P 500", category: "equity" },
  { id: "NQ", label: "Nasdaq", category: "equity" },
  { id: "YM", label: "Dow", category: "equity" },
  { id: "CL", label: "Crude Oil", category: "commodity" },
  { id: "GC", label: "Gold", category: "commodity" },
  { id: "SI", label: "Silver", category: "commodity" },
  { id: "BZ", label: "Brent", category: "commodity" },
  { id: "DXY", label: "Dollar", category: "currency" },
  { id: "EURUSD", label: "EUR/USD", category: "currency" },
  { id: "USDJPY", label: "USD/JPY", category: "currency" },
  { id: "VIX", label: "VIX", category: "macro" },
  { id: "US10Y", label: "10Y Yield", category: "macro" },
  { id: "SOX", label: "Semis", category: "equity" },
];

export default function MomentumScanner() {
  const [items, setItems] = useState<MomentumItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<"change" | "category">("change");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/factors");
        if (!res.ok) return;
        const json = await res.json();
        const factors = json.factors;
        if (!factors || cancelled) return;

        const parsed: MomentumItem[] = [];
        for (const cfg of TRACKER_CONFIG) {
          const f = factors[cfg.id];
          if (!f) continue;
          const deltaStr = f.delta ?? "";
          const pct = parseFloat(deltaStr.replace(/[+%]/g, ""));
          parsed.push({
            id: cfg.id,
            label: cfg.label,
            value: f.value,
            changePct: isNaN(pct) ? 0 : pct,
            dir: f.dir ?? "flat",
            category: cfg.category,
          });
        }
        if (!cancelled) setItems(parsed);
      } catch { /* silent */ }
      if (!cancelled) setLoading(false);
    }
    load();
    const iv = setInterval(load, 5 * 60_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  const sorted = [...items].sort((a, b) => {
    if (sortBy === "change") return b.changePct - a.changePct;
    return a.category.localeCompare(b.category) || b.changePct - a.changePct;
  });

  const maxAbs = Math.max(1, ...items.map(i => Math.abs(i.changePct)));

  // Leader / lagger
  const leader = sorted.length > 0 ? sorted[0] : null;
  const lagger = sorted.length > 0 ? sorted[sorted.length - 1] : null;

  return (
    <div className="panel" style={{ minHeight: 0 }}>
      <div className="panel-title" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span>Momentum Scanner</span>
        <div style={{ display: "flex", gap: 4 }}>
          {(["change", "category"] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setSortBy(mode)}
              style={{
                fontSize: 8, padding: "2px 6px", borderRadius: 3,
                background: sortBy === mode ? "rgba(88,166,255,0.15)" : "transparent",
                color: sortBy === mode ? "#58a6ff" : "var(--text-3, #8b949e)",
                border: "none", cursor: "pointer", fontWeight: 600,
                textTransform: "uppercase",
              }}
            >
              {mode === "change" ? "By Change" : "By Type"}
            </button>
          ))}
        </div>
      </div>

      {loading && items.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--text-3, #8b949e)", padding: "20px 0" }}>Scanning markets…</div>
      ) : items.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--text-3, #8b949e)", padding: "20px 0", textAlign: "center" }}>
          Awaiting factor data from cron job.
        </div>
      ) : (
        <>
          {/* Leader / Lagger summary */}
          {leader && lagger && (
            <div style={{ display: "flex", gap: 8, marginTop: 8, marginBottom: 8 }}>
              <div style={{
                flex: 1, padding: "6px 8px", borderRadius: 6,
                background: "rgba(63,185,80,0.06)", border: "1px solid rgba(63,185,80,0.15)",
              }}>
                <div style={{ fontSize: 8, color: "#3fb950", fontWeight: 700, textTransform: "uppercase" }}>Leading</div>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{leader.label}</div>
                <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "#3fb950" }}>
                  {leader.changePct > 0 ? "+" : ""}{leader.changePct.toFixed(2)}%
                </div>
              </div>
              <div style={{
                flex: 1, padding: "6px 8px", borderRadius: 6,
                background: "rgba(248,81,73,0.06)", border: "1px solid rgba(248,81,73,0.15)",
              }}>
                <div style={{ fontSize: 8, color: "#f85149", fontWeight: 700, textTransform: "uppercase" }}>Lagging</div>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{lagger.label}</div>
                <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "#f85149" }}>
                  {lagger.changePct > 0 ? "+" : ""}{lagger.changePct.toFixed(2)}%
                </div>
              </div>
            </div>
          )}

          {/* Bar chart */}
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {sorted.map(item => {
              const barWidth = Math.abs(item.changePct) / maxAbs * 50;
              const isPositive = item.changePct >= 0;
              const catColor = CATEGORY_COLORS[item.category];

              return (
                <div key={item.id} style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "3px 0",
                }}>
                  {/* Category dot */}
                  <span style={{
                    width: 5, height: 5, borderRadius: "50%", background: catColor,
                    flexShrink: 0,
                  }} />
                  {/* Label */}
                  <span style={{
                    fontSize: 10, fontWeight: 500, width: 60, flexShrink: 0,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {item.label}
                  </span>
                  {/* Bar */}
                  <div style={{
                    flex: 1, display: "flex", alignItems: "center",
                    justifyContent: isPositive ? "flex-start" : "flex-end",
                    position: "relative", height: 14,
                  }}>
                    <div style={{
                      position: "absolute", left: "50%", top: 0, bottom: 0,
                      width: 1, background: "var(--border, #30363d)",
                    }} />
                    <div style={{
                      position: "absolute",
                      ...(isPositive
                        ? { left: "50%", width: `${barWidth}%` }
                        : { right: "50%", width: `${barWidth}%` }),
                      height: 10, borderRadius: 2, top: 2,
                      background: isPositive ? "rgba(63,185,80,0.3)" : "rgba(248,81,73,0.3)",
                      border: `1px solid ${isPositive ? "rgba(63,185,80,0.5)" : "rgba(248,81,73,0.5)"}`,
                      transition: "width 0.3s",
                    }} />
                  </div>
                  {/* Value */}
                  <span style={{
                    fontSize: 10, fontFamily: "var(--font-mono)", fontWeight: 600,
                    width: 50, textAlign: "right", flexShrink: 0,
                    color: isPositive ? "#3fb950" : "#f85149",
                  }}>
                    {isPositive ? "+" : ""}{item.changePct.toFixed(2)}%
                  </span>
                </div>
              );
            })}
          </div>

          {/* Category legend */}
          <div style={{ display: "flex", gap: 10, marginTop: 8, justifyContent: "center" }}>
            {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
              <div key={cat} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: color }} />
                <span style={{ fontSize: 8, color: "var(--text-3, #8b949e)" }}>
                  {CATEGORY_LABELS[cat as keyof typeof CATEGORY_LABELS]}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
