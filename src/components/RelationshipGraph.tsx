"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { Instrument } from "@/lib/types";
import {
  RELATIONSHIP_MAPS,
  CATEGORY_COLORS,
  type FactorNode,
  type FactorEdge,
} from "@/lib/relationships";

/* ── Layout: radial around the center instrument ── */

interface Positioned {
  node: FactorNode;
  x: number;
  y: number;
}

function layoutNodes(
  nodes: FactorNode[],
  center: string,
  w: number,
  h: number
): Positioned[] {
  const cx = w / 2;
  const cy = h / 2;
  const centerNode = nodes.find((n) => n.id === center)!;
  const others = nodes.filter((n) => n.id !== center);

  const radiusX = w * 0.36;
  const radiusY = h * 0.36;
  const step = (2 * Math.PI) / others.length;

  return [
    { node: centerNode, x: cx, y: cy },
    ...others.map((n, i) => ({
      node: n,
      x: cx + radiusX * Math.cos(step * i - Math.PI / 2),
      y: cy + radiusY * Math.sin(step * i - Math.PI / 2),
    })),
  ];
}

/* ── Edge path with slight curve ── */

function edgePath(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): string {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const off = len * 0.08;
  const cx1 = mx + (dy / len) * off;
  const cy1 = my - (dx / len) * off;
  return `M ${x1} ${y1} Q ${cx1} ${cy1} ${x2} ${y2}`;
}

/* ── Component ── */

interface RelationshipGraphProps {
  instrument: Instrument;
}

export default function RelationshipGraph({ instrument }: RelationshipGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 800, h: 520 });
  const [hovered, setHovered] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);
  const [liveFactors, setLiveFactors] = useState<Record<string, { value: string; delta: string; dir: string }> | null>(null);
  const [dataSource, setDataSource] = useState<string>("");

  /* fetch live factor values */
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/factors");
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) {
          setLiveFactors(json.factors);
          setDataSource(
            Array.isArray(json.sources) ? json.sources.join(", ") : json.source ?? ""
          );
        }
      } catch { /* silent */ }
    }
    load();
    const iv = setInterval(load, 5 * 60_000); // refresh every 5 min
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  /* responsive resize */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect;
      setDims({ w: width, h: Math.max(420, Math.min(width * 0.65, 560)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const map = RELATIONSHIP_MAPS[instrument];

  /* merge live data into nodes */
  const liveNodes = map.nodes.map((node) => {
    const live = liveFactors?.[node.id];
    if (!live) return node;
    return {
      ...node,
      value: live.value,
      delta: live.delta,
      direction: live.dir as FactorNode["direction"],
    };
  });

  const positioned = layoutNodes(liveNodes, instrument, dims.w, dims.h);
  const posMap = new Map(positioned.map((p) => [p.node.id, p]));

  /* which edges touch the hovered node */
  const isEdgeHighlighted = useCallback(
    (e: FactorEdge) =>
      hovered === null || e.from === hovered || e.to === hovered,
    [hovered]
  );

  const isNodeHighlighted = useCallback(
    (id: string) => {
      if (hovered === null) return true;
      if (id === hovered) return true;
      return map.edges.some(
        (e) =>
          (e.from === hovered && e.to === id) ||
          (e.to === hovered && e.from === id)
      );
    },
    [hovered, map.edges]
  );

  return (
    <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
      <div
        className="panel-title"
        style={{ padding: "12px 16px 8px" }}
      >
        {instrument} Relationship Map
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
          Interactive
        </span>
      </div>

      {/* Legend */}
      <div
        style={{
          display: "flex",
          gap: "12px",
          padding: "0 16px 8px",
          flexWrap: "wrap",
        }}
      >
        {(
          Object.entries(CATEGORY_COLORS) as [
            FactorNode["category"],
            string,
          ][]
        ).map(([cat, color]) => (
          <div
            key={cat}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "10px",
              color: "var(--text-3)",
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: color,
                display: "inline-block",
              }}
            />
            {cat}
          </div>
        ))}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "10px",
            color: "var(--text-3)",
            marginLeft: "auto",
          }}
        >
          <span>
            <span style={{ color: "var(--bull)" }}>——</span> positive
          </span>
          <span>
            <span style={{ color: "var(--bear)" }}>- - -</span> negative
          </span>
          {dataSource && (
            <span style={{ marginLeft: "8px", opacity: 0.5 }}>
              via {dataSource}
            </span>
          )}
        </div>
      </div>

      <div ref={containerRef} style={{ position: "relative" }}>
        <svg
          ref={svgRef}
          width={dims.w}
          height={dims.h}
          viewBox={`0 0 ${dims.w} ${dims.h}`}
          style={{ display: "block" }}
        >
          <defs>
            <marker
              id="arrow-pos"
              viewBox="0 0 10 6"
              refX="10"
              refY="3"
              markerWidth="8"
              markerHeight="6"
              orient="auto"
            >
              <path d="M0,0 L10,3 L0,6" fill="var(--bull)" />
            </marker>
            <marker
              id="arrow-neg"
              viewBox="0 0 10 6"
              refX="10"
              refY="3"
              markerWidth="8"
              markerHeight="6"
              orient="auto"
            >
              <path d="M0,0 L10,3 L0,6" fill="var(--bear)" />
            </marker>
            <marker
              id="arrow-dim"
              viewBox="0 0 10 6"
              refX="10"
              refY="3"
              markerWidth="8"
              markerHeight="6"
              orient="auto"
            >
              <path d="M0,0 L10,3 L0,6" fill="var(--border)" />
            </marker>
          </defs>

          {/* Edges */}
          {map.edges.map((edge, i) => {
            const fromP = posMap.get(edge.from);
            const toP = posMap.get(edge.to);
            if (!fromP || !toP) return null;

            const highlighted = isEdgeHighlighted(edge);
            const isPos = edge.correlation === "positive";
            const color = highlighted
              ? isPos
                ? "var(--bull)"
                : "var(--bear)"
              : "var(--border)";
            const opacity = highlighted ? (edge.strength === "strong" ? 0.9 : edge.strength === "moderate" ? 0.6 : 0.35) : 0.15;

            /* shorten path so arrow doesn't overlap node */
            const dx = toP.x - fromP.x;
            const dy = toP.y - fromP.y;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            const shrink = 36;
            const tx = toP.x - (dx / len) * shrink;
            const ty = toP.y - (dy / len) * shrink;
            const fx = fromP.x + (dx / len) * shrink;
            const fy = fromP.y + (dy / len) * shrink;

            return (
              <g key={`edge-${i}`}>
                <path
                  d={edgePath(fx, fy, tx, ty)}
                  fill="none"
                  stroke={color}
                  strokeWidth={edge.strength === "strong" ? 2.5 : edge.strength === "moderate" ? 1.8 : 1}
                  strokeDasharray={isPos ? "none" : "6 4"}
                  opacity={opacity}
                  markerEnd={
                    highlighted
                      ? `url(#arrow-${isPos ? "pos" : "neg"})`
                      : "url(#arrow-dim)"
                  }
                  style={{ transition: "opacity 0.2s" }}
                  onMouseEnter={(ev) => {
                    if (edge.label) {
                      const svg = svgRef.current!;
                      const rect = svg.getBoundingClientRect();
                      setTooltip({
                        text: edge.label,
                        x: ev.clientX - rect.left,
                        y: ev.clientY - rect.top - 12,
                      });
                    }
                  }}
                  onMouseLeave={() => setTooltip(null)}
                />
              </g>
            );
          })}

          {/* Nodes */}
          {positioned.map(({ node, x, y }) => {
            const isCenter = node.id === instrument;
            const r = isCenter ? 34 : 28;
            const highlighted = isNodeHighlighted(node.id);
            const catColor = CATEGORY_COLORS[node.category];

            return (
              <g
                key={node.id}
                style={{
                  cursor: "pointer",
                  transition: "opacity 0.2s",
                  opacity: highlighted ? 1 : 0.2,
                }}
                onMouseEnter={() => setHovered(node.id)}
                onMouseLeave={() => setHovered(null)}
              >
                {/* glow ring for center */}
                {isCenter && (
                  <circle
                    cx={x}
                    cy={y}
                    r={r + 6}
                    fill="none"
                    stroke={catColor}
                    strokeWidth={2}
                    opacity={0.3}
                  />
                )}

                <circle
                  cx={x}
                  cy={y}
                  r={r}
                  fill={`${catColor}18`}
                  stroke={catColor}
                  strokeWidth={isCenter ? 2.5 : 1.5}
                />

                {/* direction arrow */}
                {node.direction && node.direction !== "flat" && (
                  <text
                    x={x}
                    y={y - (isCenter ? 10 : 6)}
                    textAnchor="middle"
                    fontSize={isCenter ? 14 : 11}
                    fill={
                      node.direction === "up"
                        ? "var(--bull)"
                        : "var(--bear)"
                    }
                  >
                    {node.direction === "up" ? "▲" : "▼"}
                  </text>
                )}

                {/* value */}
                {node.value && (
                  <text
                    x={x}
                    y={y + (node.direction && node.direction !== "flat" ? 6 : 2)}
                    textAnchor="middle"
                    fontSize={isCenter ? 11 : 9}
                    fontWeight={600}
                    fontFamily="var(--font-mono)"
                    fill="var(--text-primary)"
                  >
                    {node.value}
                  </text>
                )}

                {/* label below circle */}
                <text
                  x={x}
                  y={y + r + 14}
                  textAnchor="middle"
                  fontSize={isCenter ? 11 : 9.5}
                  fontWeight={isCenter ? 700 : 500}
                  fill="var(--text-primary)"
                >
                  {node.label}
                </text>

                {/* delta below label */}
                {node.delta && highlighted && (
                  <text
                    x={x}
                    y={y + r + 26}
                    textAnchor="middle"
                    fontSize={8}
                    fontFamily="var(--font-mono)"
                    fill={
                      node.direction === "up"
                        ? "var(--bull)"
                        : node.direction === "down"
                          ? "var(--bear)"
                          : "var(--text-3)"
                    }
                  >
                    {node.delta}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Tooltip */}
        {tooltip && (
          <div
            style={{
              position: "absolute",
              left: tooltip.x,
              top: tooltip.y,
              transform: "translate(-50%, -100%)",
              background: "var(--panel-bg)",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              padding: "6px 10px",
              fontSize: "11px",
              color: "var(--text-primary)",
              pointerEvents: "none",
              whiteSpace: "nowrap",
              boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
              zIndex: 10,
            }}
          >
            {tooltip.text}
          </div>
        )}
      </div>
    </div>
  );
}
