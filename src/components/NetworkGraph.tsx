"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import type { Instrument } from "@/lib/types";
import {
  type NetworkNode,
  type NetworkEdge,
  type ShockResult,
  correlationToLabel,
  correlationToColor,
  correlationToWidth,
} from "@/lib/network-types";

/* ── Category colors ── */

const CAT_COLORS: Record<string, string> = {
  instrument: "#3b82f6",
  macro: "#f59e0b",
  commodity: "#10b981",
  currency: "#8b5cf6",
  sentiment: "#ef4444",
  fundamental: "#06b6d4",
  supply: "#f97316",
  demand: "#ec4899",
  positioning: "#84cc16",
};

/* ── Types ── */

interface CorrelationPair {
  from: string;
  to: string;
  correlation30d: number;
  correlation90d: number;
  beta: number;
  leadLag: number;
  leadLagR: number;
}

interface CorrelationData {
  correlationMatrix: {
    symbols: string[];
    labels: string[];
    matrix: number[][];
    period: string;
  };
  pairs: CorrelationPair[];
  computedAt: string;
}

interface SupplyChainData {
  instrument: string;
  nodes: {
    id: string;
    label: string;
    category: string;
    value: string;
    delta: string;
    direction: "up" | "down" | "flat";
    detail: string;
    source: string;
    chainRole: "upstream" | "downstream" | "both";
  }[];
}

type ViewMode = "network" | "heatmap" | "shock";

/* ── Layout ── */

interface Positioned {
  node: NetworkNode;
  x: number;
  y: number;
}

function layoutTiered(
  nodes: NetworkNode[],
  centerId: string,
  w: number,
  h: number
): Positioned[] {
  const cx = w / 2;
  const cy = h / 2;
  const center = nodes.find((n) => n.id === centerId);
  const tier1 = nodes.filter((n) => n.id !== centerId && n.tier <= 1);
  const tier2 = nodes.filter((n) => n.id !== centerId && n.tier >= 2);

  const out: Positioned[] = [];
  if (center) out.push({ node: center, x: cx, y: cy });

  const r1x = w * 0.3;
  const r1y = h * 0.3;
  tier1.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / tier1.length - Math.PI / 2;
    out.push({ node: n, x: cx + r1x * Math.cos(angle), y: cy + r1y * Math.sin(angle) });
  });

  const r2x = w * 0.44;
  const r2y = h * 0.42;
  tier2.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / tier2.length - Math.PI / 4;
    out.push({ node: n, x: cx + r2x * Math.cos(angle), y: cy + r2y * Math.sin(angle) });
  });

  return out;
}

function edgePath(x1: number, y1: number, x2: number, y2: number): string {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const off = len * 0.06;
  return `M ${x1} ${y1} Q ${mx + (dy / len) * off} ${my - (dx / len) * off} ${x2} ${y2}`;
}

/* ── Shock propagation engine ── */

function propagateShock(
  sourceId: string,
  magnitude: number,
  edges: NetworkEdge[],
  nodes: NetworkNode[]
): ShockResult {
  const impacts: ShockResult["impacts"] = [];
  const visited = new Set<string>([sourceId]);

  // Direct (1-hop)
  for (const e of edges) {
    let target: string | null = null;
    let coeff = 0;
    if (e.from === sourceId) { target = e.to; coeff = e.beta ?? e.correlation; }
    else if (e.to === sourceId) { target = e.from; coeff = e.beta ?? e.correlation; }
    if (!target || visited.has(target)) continue;
    visited.add(target);

    const node = nodes.find((n) => n.id === target);
    const move = magnitude * coeff;
    impacts.push({
      nodeId: target,
      expectedMove: Math.round(move * 100) / 100,
      unit: "%",
      confidence: Math.abs(e.correlation) > 0.6 ? "high" : Math.abs(e.correlation) > 0.3 ? "medium" : "low",
      transmissionPath: [sourceId, target],
      timeHorizon: e.leadLag && e.leadLag > 0 ? `${e.leadLag}d lag` : "intraday",
    });
  }

  // Second-order (2-hop) — weaker
  for (const impact of [...impacts]) {
    for (const e of edges) {
      let target: string | null = null;
      let coeff = 0;
      if (e.from === impact.nodeId) { target = e.to; coeff = e.beta ?? e.correlation; }
      else if (e.to === impact.nodeId) { target = e.from; coeff = e.beta ?? e.correlation; }
      if (!target || visited.has(target)) continue;
      visited.add(target);

      const move = impact.expectedMove * coeff * 0.5; // dampened
      impacts.push({
        nodeId: target,
        expectedMove: Math.round(move * 100) / 100,
        unit: "%",
        confidence: "low",
        transmissionPath: [...impact.transmissionPath, target],
        timeHorizon: "1-5 days",
      });
    }
  }

  return { sourceNode: sourceId, shockMagnitude: magnitude, impacts: impacts.sort((a, b) => Math.abs(b.expectedMove) - Math.abs(a.expectedMove)) };
}

/* ── Component ── */

export default function NetworkGraph({ instrument }: { instrument: Instrument }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dims, setDims] = useState({ w: 900, h: 560 });
  const [hovered, setHovered] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("network");
  const [shockSource, setShockSource] = useState<string | null>(null);
  const [shockMag, setShockMag] = useState(5);
  const [shockResult, setShockResult] = useState<ShockResult | null>(null);

  // Data
  const [liveFactors, setLiveFactors] = useState<Record<string, { value: string; delta: string; dir: string }> | null>(null);
  const [corrData, setCorrData] = useState<CorrelationData | null>(null);
  const [supplyData, setSupplyData] = useState<SupplyChainData | null>(null);
  const [dataSource, setDataSource] = useState("");
  const [loading, setLoading] = useState(true);

  // Fetch all data sources
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [factorsRes, corrRes, supplyRes] = await Promise.allSettled([
        fetch("/api/factors").then((r) => r.ok ? r.json() : null),
        fetch("/api/correlations").then((r) => r.ok ? r.json() : null),
        fetch(`/api/supply-chain?instrument=${instrument}`).then((r) => r.ok ? r.json() : null),
      ]);
      if (cancelled) return;
      if (factorsRes.status === "fulfilled" && factorsRes.value) {
        setLiveFactors(factorsRes.value.factors);
        setDataSource(Array.isArray(factorsRes.value.sources) ? factorsRes.value.sources.join(", ") : "");
      }
      if (corrRes.status === "fulfilled" && corrRes.value) setCorrData(corrRes.value);
      if (supplyRes.status === "fulfilled" && supplyRes.value) setSupplyData(supplyRes.value);
      setLoading(false);
    }
    load();
    const iv = setInterval(load, 5 * 60_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [instrument]);

  // Responsive
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect;
      setDims({ w: width, h: Math.max(440, Math.min(width * 0.62, 580)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Build network nodes + edges from all data sources
  const { nodes, edges } = useMemo(() => {
    const nodeMap = new Map<string, NetworkNode>();
    const edgeList: NetworkEdge[] = [];

    // Center instrument
    const live = liveFactors?.[instrument];
    nodeMap.set(instrument, {
      id: instrument,
      label: instrument,
      category: "instrument",
      tier: 0,
      value: live?.value,
      delta: live?.delta,
      direction: live?.dir as any,
      source: "Yahoo Finance",
    });

    // Add correlated instruments/macros as tier-1 nodes
    if (corrData?.pairs) {
      for (const p of corrData.pairs) {
        const other = p.from === instrument ? p.to : p.to === instrument ? p.from : null;
        if (!other) continue;
        if (!nodeMap.has(other)) {
          const lbl = corrData.correlationMatrix.labels[corrData.correlationMatrix.symbols.indexOf(other)] || other;
          const lv = liveFactors?.[other];
          const cat = ["ES", "NQ", "YM", "CL", "GC"].includes(other) ? "instrument"
            : ["DXY", "USDJPY", "EURUSD"].includes(other) ? "currency"
            : ["VIX"].includes(other) ? "sentiment"
            : ["SI", "BZ"].includes(other) ? "commodity"
            : ["US10Y"].includes(other) ? "macro"
            : "fundamental";
          nodeMap.set(other, {
            id: other,
            label: lbl,
            category: cat as any,
            tier: 1,
            value: lv?.value,
            delta: lv?.delta,
            direction: lv?.dir as any,
            source: "Yahoo Finance",
          });
        }

        edgeList.push({
          from: p.from,
          to: p.to,
          correlation: p.correlation30d,
          correlationLabel: correlationToLabel(p.correlation30d),
          beta: p.beta,
          leadLag: p.leadLag,
          mechanism: p.leadLag !== 0
            ? `${p.from} leads ${p.to} by ${Math.abs(p.leadLag)}d`
            : `${p.from} ↔ ${p.to} contemporaneous`,
          type: "correlation",
        });
      }
    }

    // Add supply chain nodes as tier-2
    if (supplyData?.nodes) {
      for (const sn of supplyData.nodes) {
        if (!nodeMap.has(sn.id)) {
          nodeMap.set(sn.id, {
            id: sn.id,
            label: sn.label,
            category: sn.category as any,
            tier: 2,
            value: sn.value,
            delta: sn.delta,
            direction: sn.direction,
            detail: sn.detail,
            source: sn.source,
            chainRole: sn.chainRole,
          });
          edgeList.push({
            from: sn.chainRole === "downstream" ? instrument : sn.id,
            to: sn.chainRole === "downstream" ? sn.id : instrument,
            correlation: sn.chainRole === "upstream" ? 0.4 : -0.3,
            correlationLabel: sn.chainRole === "upstream" ? "moderate+" : "weak-",
            mechanism: sn.detail,
            type: "supply_chain",
          });
        }
      }
    }

    return { nodes: Array.from(nodeMap.values()), edges: edgeList };
  }, [instrument, liveFactors, corrData, supplyData]);

  // Reset shock when instrument changes
  useEffect(() => { setShockSource(null); setShockResult(null); }, [instrument]);

  // Compute shock
  useEffect(() => {
    if (viewMode === "shock" && shockSource) {
      setShockResult(propagateShock(shockSource, shockMag, edges, nodes));
    }
  }, [viewMode, shockSource, shockMag, edges, nodes]);

  const positioned = layoutTiered(nodes, instrument, dims.w, dims.h);
  const posMap = new Map(positioned.map((p) => [p.node.id, p]));

  const isEdgeHighlighted = useCallback(
    (e: NetworkEdge) => hovered === null || e.from === hovered || e.to === hovered,
    [hovered]
  );

  const isNodeHighlighted = useCallback(
    (id: string) => {
      if (hovered === null) return true;
      if (id === hovered) return true;
      return edges.some((e) => (e.from === hovered && e.to === id) || (e.to === hovered && e.from === id));
    },
    [hovered, edges]
  );

  /* ── Heatmap view ── */
  const renderHeatmap = () => {
    if (!corrData?.correlationMatrix) return <div style={{ padding: 20, color: "var(--text-3)" }}>Loading correlation data…</div>;
    const { symbols, labels, matrix } = corrData.correlationMatrix;
    const n = symbols.length;
    const cellSize = Math.min(40, (dims.w - 120) / n);

    return (
      <div style={{ padding: "16px", overflowX: "auto" }}>
        <svg width={120 + n * cellSize} height={100 + n * cellSize} style={{ display: "block", margin: "0 auto" }}>
          {/* Column labels */}
          {symbols.map((s, j) => (
            <text key={`cl-${j}`} x={120 + j * cellSize + cellSize / 2} y={90} textAnchor="end"
              fontSize={9} fill="var(--text-primary)" transform={`rotate(-45 ${120 + j * cellSize + cellSize / 2} 90)`}>
              {labels[j] || s}
            </text>
          ))}
          {/* Row labels + cells */}
          {symbols.map((si, i) => (
            <g key={`row-${i}`}>
              <text x={115} y={100 + i * cellSize + cellSize / 2 + 3} textAnchor="end"
                fontSize={9} fill="var(--text-primary)">{labels[i] || si}</text>
              {symbols.map((sj, j) => {
                const r = matrix[i][j];
                const abs = Math.abs(r);
                const hue = r >= 0 ? "120" : "0"; // green for positive, red for negative
                const sat = `${Math.round(abs * 80)}%`;
                const light = `${Math.round(50 - abs * 20)}%`;
                return (
                  <g key={`c-${i}-${j}`}>
                    <rect x={120 + j * cellSize} y={100 + i * cellSize} width={cellSize - 1} height={cellSize - 1}
                      fill={i === j ? "var(--panel-bg)" : `hsl(${hue}, ${sat}, ${light})`}
                      stroke="var(--border)" strokeWidth={0.5} rx={2} />
                    {cellSize > 24 && (
                      <text x={120 + j * cellSize + cellSize / 2} y={100 + i * cellSize + cellSize / 2 + 3}
                        textAnchor="middle" fontSize={8} fill={abs > 0.5 ? "#fff" : "var(--text-3)"}>
                        {i === j ? "1.0" : r.toFixed(2)}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          ))}
        </svg>
        <div style={{ textAlign: "center", marginTop: 8, fontSize: 10, color: "var(--text-3)" }}>
          {corrData.correlationMatrix.period} rolling correlations • {corrData.pairs.length} significant pairs
          {corrData.computedAt && ` • computed ${new Date(corrData.computedAt).toLocaleDateString()}`}
        </div>
      </div>
    );
  };

  /* ── Shock simulator view ── */
  const renderShockPanel = () => (
    <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ fontSize: 11, color: "var(--text-3)" }}>Shock source:</label>
        <select value={shockSource ?? ""} onChange={(e) => setShockSource(e.target.value || null)}
          style={{ background: "var(--bg)", color: "var(--text-primary)", border: "1px solid var(--border)", borderRadius: 4, padding: "4px 8px", fontSize: 11 }}>
          <option value="">Select node…</option>
          {nodes.filter((n) => n.tier <= 1).map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
        </select>
        <label style={{ fontSize: 11, color: "var(--text-3)" }}>Magnitude (%):</label>
        <input type="range" min={-10} max={10} step={0.5} value={shockMag}
          onChange={(e) => setShockMag(parseFloat(e.target.value))}
          style={{ width: 100 }} />
        <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: shockMag >= 0 ? "var(--bull)" : "var(--bear)" }}>
          {shockMag >= 0 ? "+" : ""}{shockMag}%
        </span>
      </div>
      {shockResult && shockResult.impacts.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
          {shockResult.impacts.map((imp) => {
            const node = nodes.find((n) => n.id === imp.nodeId);
            return (
              <div key={imp.nodeId} style={{
                background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px",
                borderLeft: `3px solid ${imp.expectedMove >= 0 ? "var(--bull)" : "var(--bear)"}`,
              }}>
                <div style={{ fontSize: 11, fontWeight: 600 }}>{node?.label || imp.nodeId}</div>
                <div style={{ fontSize: 13, fontFamily: "var(--font-mono)", fontWeight: 700,
                  color: imp.expectedMove >= 0 ? "var(--bull)" : "var(--bear)" }}>
                  {imp.expectedMove >= 0 ? "+" : ""}{imp.expectedMove}{imp.unit}
                </div>
                <div style={{ fontSize: 9, color: "var(--text-3)", marginTop: 2 }}>
                  {imp.confidence} confidence • {imp.timeHorizon}
                </div>
                <div style={{ fontSize: 8, color: "var(--text-3)", marginTop: 2 }}>
                  {imp.transmissionPath.join(" → ")}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  /* ── Node detail card ── */
  const renderNodeCard = () => {
    if (!selectedNode) return null;
    const node = nodes.find((n) => n.id === selectedNode);
    if (!node) return null;
    const nodeEdges = edges.filter((e) => e.from === selectedNode || e.to === selectedNode);

    return (
      <div style={{
        position: "absolute", right: 12, top: 12, width: 220, background: "var(--panel-bg)",
        border: "1px solid var(--border)", borderRadius: 8, padding: "12px", zIndex: 20,
        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>{node.label}</span>
          <button onClick={() => setSelectedNode(null)}
            style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", fontSize: 14 }}>✕</button>
        </div>
        <div style={{ fontSize: 9, color: CAT_COLORS[node.category] || "var(--text-3)", marginBottom: 6, textTransform: "uppercase" }}>
          {node.category}{node.chainRole ? ` • ${node.chainRole}` : ""}
        </div>
        {node.value && (
          <div style={{ fontSize: 16, fontFamily: "var(--font-mono)", fontWeight: 700 }}>
            {node.value}
            <span style={{ fontSize: 11, marginLeft: 6, color: node.direction === "up" ? "var(--bull)" : node.direction === "down" ? "var(--bear)" : "var(--text-3)" }}>
              {node.delta}
            </span>
          </div>
        )}
        {node.detail && <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 6, lineHeight: 1.4 }}>{node.detail}</div>}
        {nodeEdges.length > 0 && (
          <div style={{ marginTop: 8, borderTop: "1px solid var(--border)", paddingTop: 6 }}>
            <div style={{ fontSize: 9, color: "var(--text-3)", marginBottom: 4, textTransform: "uppercase" }}>Connections</div>
            {nodeEdges.slice(0, 5).map((e, i) => {
              const other = e.from === selectedNode ? e.to : e.from;
              const otherNode = nodes.find((n) => n.id === other);
              return (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 10, padding: "2px 0" }}>
                  <span>{otherNode?.label || other}</span>
                  <span style={{ fontFamily: "var(--font-mono)", color: correlationToColor(e.correlation) }}>
                    ρ={e.correlation.toFixed(2)}{e.beta != null ? ` β=${e.beta.toFixed(2)}` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {node.source && <div style={{ fontSize: 8, color: "var(--text-3)", marginTop: 6 }}>Source: {node.source}</div>}
      </div>
    );
  };

  return (
    <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px 4px" }}>
        <div>
          <span className="panel-title" style={{ marginRight: 8 }}>{instrument} Network Analysis</span>
          <span style={{ fontSize: 9, background: "var(--accent-dim)", color: "var(--accent)", padding: "2px 6px", borderRadius: 4, fontWeight: 500 }}>
            Bloomberg SPLC-style
          </span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {(["network", "heatmap", "shock"] as ViewMode[]).map((m) => (
            <button key={m} onClick={() => setViewMode(m)}
              style={{
                fontSize: 10, padding: "4px 10px", borderRadius: 4, cursor: "pointer",
                background: viewMode === m ? "var(--accent-dim)" : "transparent",
                color: viewMode === m ? "var(--accent)" : "var(--text-3)",
                border: viewMode === m ? "1px solid var(--accent)" : "1px solid var(--border)",
              }}>
              {m === "network" ? "Network" : m === "heatmap" ? "Correlation Matrix" : "Shock Simulator"}
            </button>
          ))}
        </div>
      </div>

      {/* Legend for network view */}
      {viewMode === "network" && (
        <div style={{ display: "flex", gap: 10, padding: "4px 16px 8px", flexWrap: "wrap", fontSize: 10, color: "var(--text-3)" }}>
          {Object.entries(CAT_COLORS).map(([cat, color]) => (
            <span key={cat} style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, display: "inline-block" }} />{cat}
            </span>
          ))}
          <span style={{ marginLeft: "auto", opacity: 0.6 }}>
            Edge thickness = |ρ| • {dataSource && `via ${dataSource}`}
            {corrData && ` • ${nodes.length} nodes, ${edges.length} edges`}
          </span>
        </div>
      )}

      {loading && (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text-3)" }}>Loading network data…</div>
      )}

      {!loading && viewMode === "heatmap" && renderHeatmap()}
      {!loading && viewMode === "shock" && renderShockPanel()}

      {!loading && (viewMode === "network" || viewMode === "shock") && (
        <div ref={containerRef} style={{ position: "relative" }}>
          <svg ref={svgRef} width={dims.w} height={dims.h} viewBox={`0 0 ${dims.w} ${dims.h}`} style={{ display: "block" }}>
            <defs>
              <marker id="arr-p" viewBox="0 0 10 6" refX="10" refY="3" markerWidth="7" markerHeight="5" orient="auto">
                <path d="M0,0 L10,3 L0,6" fill="var(--bull)" />
              </marker>
              <marker id="arr-n" viewBox="0 0 10 6" refX="10" refY="3" markerWidth="7" markerHeight="5" orient="auto">
                <path d="M0,0 L10,3 L0,6" fill="var(--bear)" />
              </marker>
              <marker id="arr-d" viewBox="0 0 10 6" refX="10" refY="3" markerWidth="7" markerHeight="5" orient="auto">
                <path d="M0,0 L10,3 L0,6" fill="var(--border)" />
              </marker>
            </defs>

            {/* Tier rings */}
            <circle cx={dims.w / 2} cy={dims.h / 2} r={dims.w * 0.3} fill="none" stroke="var(--border)" strokeWidth={0.5} strokeDasharray="4 6" opacity={0.3} />
            <circle cx={dims.w / 2} cy={dims.h / 2} r={dims.w * 0.44} fill="none" stroke="var(--border)" strokeWidth={0.5} strokeDasharray="4 6" opacity={0.15} />

            {/* Edges */}
            {edges.map((edge, i) => {
              const fromP = posMap.get(edge.from);
              const toP = posMap.get(edge.to);
              if (!fromP || !toP) return null;

              const highlighted = isEdgeHighlighted(edge);
              const isPos = edge.correlation >= 0;
              const color = highlighted ? (isPos ? "var(--bull)" : "var(--bear)") : "var(--border)";
              const width = highlighted ? correlationToWidth(edge.correlation) : 0.5;
              const opacity = highlighted ? Math.max(0.3, Math.abs(edge.correlation)) : 0.1;

              // Shorten path
              const dx = toP.x - fromP.x;
              const dy = toP.y - fromP.y;
              const len = Math.sqrt(dx * dx + dy * dy) || 1;
              const shrink = 34;
              const tx = toP.x - (dx / len) * shrink;
              const ty = toP.y - (dy / len) * shrink;
              const fx = fromP.x + (dx / len) * shrink;
              const fy = fromP.y + (dy / len) * shrink;

              // Shock highlight
              let shockHighlight = false;
              if (viewMode === "shock" && shockResult) {
                shockHighlight = shockResult.impacts.some((imp) =>
                  imp.transmissionPath.includes(edge.from) && imp.transmissionPath.includes(edge.to)
                );
              }

              return (
                <g key={`e-${i}`}>
                  <path d={edgePath(fx, fy, tx, ty)} fill="none"
                    stroke={shockHighlight ? "#ffcc00" : color}
                    strokeWidth={shockHighlight ? width + 1 : width}
                    strokeDasharray={edge.type === "supply_chain" ? "3 3" : isPos ? "none" : "6 4"}
                    opacity={shockHighlight ? 1 : opacity}
                    markerEnd={highlighted ? `url(#arr-${isPos ? "p" : "n"})` : "url(#arr-d)"}
                    style={{ transition: "opacity 0.2s" }} />
                  {/* Correlation label on edge */}
                  {highlighted && hovered && Math.abs(edge.correlation) > 0.2 && (
                    <text x={(fx + tx) / 2 + 4} y={(fy + ty) / 2 - 4}
                      fontSize={8} fontFamily="var(--font-mono)" fill={color} opacity={0.8}>
                      ρ={edge.correlation.toFixed(2)}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Nodes */}
            {positioned.map(({ node, x, y }) => {
              const isCenter = node.id === instrument;
              const r = isCenter ? 32 : node.tier <= 1 ? 26 : 20;
              const highlighted = isNodeHighlighted(node.id);
              const catColor = CAT_COLORS[node.category] || "#666";

              // Shock color
              let shockColor: string | null = null;
              if (viewMode === "shock" && shockResult) {
                if (node.id === shockResult.sourceNode) shockColor = "#ffcc00";
                else {
                  const imp = shockResult.impacts.find((i) => i.nodeId === node.id);
                  if (imp) shockColor = imp.expectedMove >= 0 ? "var(--bull)" : "var(--bear)";
                }
              }

              return (
                <g key={node.id} style={{ cursor: "pointer", transition: "opacity 0.2s", opacity: highlighted ? 1 : 0.15 }}
                  onMouseEnter={() => setHovered(node.id)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => setSelectedNode(node.id === selectedNode ? null : node.id)}>

                  {isCenter && <circle cx={x} cy={y} r={r + 6} fill="none" stroke={catColor} strokeWidth={2} opacity={0.3} />}
                  {shockColor && <circle cx={x} cy={y} r={r + 4} fill="none" stroke={shockColor} strokeWidth={2} opacity={0.7} />}

                  <circle cx={x} cy={y} r={r} fill={`${catColor}18`} stroke={shockColor || catColor}
                    strokeWidth={isCenter ? 2.5 : 1.5} />

                  {/* Supply chain role indicator */}
                  {node.chainRole && (
                    <text x={x + r - 2} y={y - r + 8} fontSize={8} fill={catColor} textAnchor="middle">
                      {node.chainRole === "upstream" ? "▲" : node.chainRole === "downstream" ? "▼" : "◆"}
                    </text>
                  )}

                  {/* Direction + value */}
                  {node.direction && node.direction !== "flat" && (
                    <text x={x} y={y - (isCenter ? 8 : 4)} textAnchor="middle" fontSize={isCenter ? 13 : 10}
                      fill={node.direction === "up" ? "var(--bull)" : "var(--bear)"}>
                      {node.direction === "up" ? "▲" : "▼"}
                    </text>
                  )}
                  {node.value && (
                    <text x={x} y={y + (node.direction && node.direction !== "flat" ? 6 : 2)} textAnchor="middle"
                      fontSize={isCenter ? 10 : 8} fontWeight={600} fontFamily="var(--font-mono)" fill="var(--text-primary)">
                      {node.value}
                    </text>
                  )}

                  {/* Label */}
                  <text x={x} y={y + r + 13} textAnchor="middle" fontSize={isCenter ? 10.5 : 8.5}
                    fontWeight={isCenter ? 700 : 500} fill="var(--text-primary)">
                    {node.label}
                  </text>
                  {node.delta && highlighted && (
                    <text x={x} y={y + r + 23} textAnchor="middle" fontSize={7.5} fontFamily="var(--font-mono)"
                      fill={node.direction === "up" ? "var(--bull)" : node.direction === "down" ? "var(--bear)" : "var(--text-3)"}>
                      {node.delta}
                    </text>
                  )}

                  {/* Shock impact label */}
                  {viewMode === "shock" && shockResult && (() => {
                    const imp = shockResult.impacts.find((i) => i.nodeId === node.id);
                    if (!imp) return null;
                    return (
                      <text x={x} y={y + r + 33} textAnchor="middle" fontSize={9} fontWeight={700} fontFamily="var(--font-mono)"
                        fill={imp.expectedMove >= 0 ? "var(--bull)" : "var(--bear)"}>
                        {imp.expectedMove >= 0 ? "+" : ""}{imp.expectedMove}%
                      </text>
                    );
                  })()}
                </g>
              );
            })}
          </svg>

          {renderNodeCard()}
        </div>
      )}
    </div>
  );
}
