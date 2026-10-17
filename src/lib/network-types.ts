/**
 * Bloomberg SPLC-style network data types.
 *
 * This replaces the simple relationship graph with a quantified,
 * multi-layer network showing actual correlations, transmission
 * coefficients, and supply chain flows.
 */

import type { Instrument } from "./types";

/* ── Network Node ── */

export type NodeCategory =
  | "instrument"   // tradeable futures: ES, NQ, YM, CL, GC
  | "macro"        // Fed funds, CPI, yields, PMI, claims
  | "commodity"    // silver, Brent, natgas, copper
  | "currency"     // DXY, USD/JPY, EUR/USD
  | "sentiment"    // VIX, credit spreads, financial stress
  | "fundamental"  // NVDA, AAPL, SOX, earnings
  | "supply"       // OPEC production, EIA inventories, mine output
  | "demand"       // global demand, refinery runs, ETF flows
  | "positioning"; // COT data, managed money, commercials

export interface NetworkNode {
  id: string;
  label: string;
  category: NodeCategory;
  /** Live value string e.g. "$94.80" or "4.50%" */
  value?: string;
  /** Change string e.g. "+0.6%" or "+3.2 bps" */
  delta?: string;
  /** Direction arrow */
  direction?: "up" | "down" | "flat";
  /** Tier: 0 = center instrument, 1 = direct influence, 2 = second-order */
  tier: number;
  /** Extra detail shown in expanded card */
  detail?: string;
  /** Data source attribution */
  source?: string;
  /** Whether this is an upstream supplier or downstream consumer (supply chain) */
  chainRole?: "upstream" | "downstream" | "both";
}

/* ── Network Edge ── */

export interface NetworkEdge {
  from: string;
  to: string;
  /** Actual rolling correlation coefficient (-1 to +1) */
  correlation: number;
  /** Qualitative label for display */
  correlationLabel: "strong+" | "moderate+" | "weak+" | "weak-" | "moderate-" | "strong-";
  /** Beta coefficient: 1-unit move in `from` → X-unit move in `to` */
  beta?: number;
  /** Lead/lag in days (positive = `from` leads `to`) */
  leadLag?: number;
  /** Human-readable transmission mechanism */
  mechanism: string;
  /** Quantified transmission e.g. "$10/bbl CL → +0.2% CPI over 3mo" */
  transmission?: string;
  /** Edge type for rendering */
  type: "correlation" | "causal" | "supply_chain" | "component";
}

/* ── Full Network Map ── */

export interface NetworkMap {
  centerInstrument: Instrument;
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  /** Correlation matrix for the "heatmap" view */
  correlationMatrix?: {
    symbols: string[];
    /** Row-major matrix[i][j] = correlation between symbols[i] and symbols[j] */
    matrix: number[][];
    period: string; // "30d" | "60d" | "90d"
  };
  /** Last computation timestamp */
  computedAt: string;
  /** Data sources used */
  sources: string[];
}

/* ── Shock Propagation ── */

export interface ShockResult {
  /** Which node was shocked */
  sourceNode: string;
  /** Magnitude of shock (e.g. +5.0 for "$5 up") */
  shockMagnitude: number;
  /** Propagated impacts on other nodes */
  impacts: {
    nodeId: string;
    expectedMove: number;
    unit: string; // "pts", "%", "bps", "$"
    confidence: "high" | "medium" | "low";
    /** Chain: CL → CPI → FED_RATE → ES */
    transmissionPath: string[];
    timeHorizon: string; // "intraday", "1-5 days", "1-3 months"
  }[];
}

/* ── Helpers ── */

export function correlationToLabel(r: number): NetworkEdge["correlationLabel"] {
  if (r >= 0.7) return "strong+";
  if (r >= 0.4) return "moderate+";
  if (r >= 0.1) return "weak+";
  if (r > -0.1) return "weak+"; // near zero, show as weak positive
  if (r > -0.4) return "weak-";
  if (r > -0.7) return "moderate-";
  return "strong-";
}

export function correlationToColor(r: number): string {
  if (r >= 0.4) return "var(--bull)";
  if (r <= -0.4) return "var(--bear)";
  return "var(--text-3)";
}

export function correlationToWidth(r: number): number {
  const abs = Math.abs(r);
  if (abs >= 0.7) return 3.5;
  if (abs >= 0.4) return 2.5;
  if (abs >= 0.2) return 1.5;
  return 0.8;
}
