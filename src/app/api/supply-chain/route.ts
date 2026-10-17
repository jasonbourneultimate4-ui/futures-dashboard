import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/* ─────────────────────────────────────────────
 * /api/supply-chain
 *
 * Pulls upstream/downstream supply chain data
 * for each instrument from free government APIs:
 *   - EIA API v2 (crude oil supply chain)
 *   - FRED (macro transmission chain)
 *
 * Returns structured nodes for the Bloomberg SPLC
 * style network.
 * ───────────────────────────────────────────── */

const EIA_API_KEY = process.env.EIA_API_KEY ?? "";
const FRED_API_KEY = process.env.FRED_API_KEY ?? "";

/* ── Types ── */

interface SupplyChainNode {
  id: string;
  label: string;
  category: string;
  value: string;
  delta: string;
  direction: "up" | "down" | "flat";
  detail: string;
  source: string;
  chainRole: "upstream" | "downstream" | "both";
}

interface SupplyChainData {
  instrument: string;
  nodes: SupplyChainNode[];
  updatedAt: string;
}

/* ── EIA Fetch (v2 API) ── */

async function fetchEIA(
  route: string,
  params: Record<string, string> = {}
): Promise<any> {
  if (!EIA_API_KEY) return null;
  const qs = new URLSearchParams({ api_key: EIA_API_KEY, ...params });
  try {
    const url = `https://api.eia.gov/v2/${route}?${qs}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/* ── FRED Fetch ── */

async function fetchFRED(seriesId: string): Promise<{ value: number; prev: number } | null> {
  if (!FRED_API_KEY) return null;
  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=2`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const json = await res.json();
    const obs = json?.observations ?? [];
    if (obs.length === 0) return null;
    const val = parseFloat(obs[0].value);
    const prev = obs.length > 1 ? parseFloat(obs[1].value) : val;
    if (isNaN(val)) return null;
    return { value: val, prev };
  } catch {
    return null;
  }
}

function dir(val: number, prev: number): "up" | "down" | "flat" {
  const d = val - prev;
  return d > 0.001 ? "up" : d < -0.001 ? "down" : "flat";
}

/* ── Build CL (Crude Oil) supply chain ── */

async function buildCLChain(): Promise<SupplyChainNode[]> {
  const nodes: SupplyChainNode[] = [];

  // FRED-based macro chain nodes
  const series: {
    id: string; seriesId: string; label: string; detail: string;
    chain: "upstream" | "downstream"; fmt: (v: number) => string;
    deltaFmt: (v: number, p: number) => string;
  }[] = [
    {
      id: "CL_US_PROD", seriesId: "WCRFPUS2", label: "US Crude Production",
      detail: "Weekly U.S. field production of crude oil (EIA via FRED)",
      chain: "upstream",
      fmt: (v) => `${(v / 1000).toFixed(1)}M b/d`,
      deltaFmt: (v, p) => `${((v - p) / 1000) >= 0 ? "+" : ""}${((v - p) / 1000).toFixed(1)}M`,
    },
    {
      id: "CL_INVENTORIES", seriesId: "WCESTUS1", label: "US Crude Inventories",
      detail: "Weekly U.S. ending stocks of crude oil excluding SPR (EIA via FRED)",
      chain: "both",
      fmt: (v) => `${(v / 1000).toFixed(0)}M bbl`,
      deltaFmt: (v, p) => `${((v - p) / 1000) >= 0 ? "+" : ""}${((v - p) / 1000).toFixed(1)}M`,
    },
    {
      id: "CL_IMPORTS", seriesId: "WCRIMUS2", label: "US Crude Imports",
      detail: "Weekly U.S. imports of crude oil (EIA via FRED)",
      chain: "upstream",
      fmt: (v) => `${(v / 1000).toFixed(1)}M b/d`,
      deltaFmt: (v, p) => `${((v - p) / 1000) >= 0 ? "+" : ""}${((v - p) / 1000).toFixed(1)}M`,
    },
    {
      id: "CL_GASOLINE", seriesId: "WGFUPUS2", label: "Gasoline Production",
      detail: "Weekly U.S. refiner & blender net production of motor gasoline (EIA via FRED)",
      chain: "downstream",
      fmt: (v) => `${(v / 1000).toFixed(1)}M b/d`,
      deltaFmt: (v, p) => `${((v - p) / 1000) >= 0 ? "+" : ""}${((v - p) / 1000).toFixed(1)}M`,
    },
    {
      id: "CL_REFINERY", seriesId: "WPULEUS3", label: "Refinery Utilization",
      detail: "Weekly U.S. percent utilization of refinery operable capacity (EIA via FRED)",
      chain: "downstream",
      fmt: (v) => `${v.toFixed(1)}%`,
      deltaFmt: (v, p) => `${(v - p) >= 0 ? "+" : ""}${(v - p).toFixed(1)}%`,
    },
    {
      id: "CL_NATGAS", seriesId: "DHHNGSP", label: "Natural Gas Price",
      detail: "Henry Hub natural gas spot price (EIA via FRED) — co-produced with oil",
      chain: "upstream",
      fmt: (v) => `$${v.toFixed(2)}/MMBtu`,
      deltaFmt: (v, p) => `${(v - p) >= 0 ? "+" : ""}$${(v - p).toFixed(2)}`,
    },
  ];

  const results = await Promise.all(series.map((s) => fetchFRED(s.seriesId)));

  for (let i = 0; i < series.length; i++) {
    const s = series[i];
    const r = results[i];
    if (!r) continue;
    nodes.push({
      id: s.id,
      label: s.label,
      category: s.chain === "upstream" ? "supply" : s.chain === "downstream" ? "demand" : "supply",
      value: s.fmt(r.value),
      delta: s.deltaFmt(r.value, r.prev),
      direction: dir(r.value, r.prev),
      detail: s.detail,
      source: "FRED/EIA",
      chainRole: s.chain,
    });
  }

  return nodes;
}

/* ── Build GC (Gold) supply chain ── */

async function buildGCChain(): Promise<SupplyChainNode[]> {
  const nodes: SupplyChainNode[] = [];

  const series: {
    id: string; seriesId: string; label: string; detail: string;
    chain: "upstream" | "downstream"; fmt: (v: number) => string;
    deltaFmt: (v: number, p: number) => string;
  }[] = [
    {
      id: "GC_REAL_YIELD", seriesId: "DFII10", label: "10Y Real Yield (TIPS)",
      detail: "10-Year TIPS breakeven rate — key gold driver (negative real yield → gold bullish)",
      chain: "upstream",
      fmt: (v) => `${v.toFixed(2)}%`,
      deltaFmt: (v, p) => `${Math.round((v - p) * 100) >= 0 ? "+" : ""}${Math.round((v - p) * 100)} bps`,
    },
    {
      id: "GC_BREAKEVEN", seriesId: "T10YIE", label: "10Y Breakeven Inflation",
      detail: "Market inflation expectations — rising breakevens → gold bullish",
      chain: "upstream",
      fmt: (v) => `${v.toFixed(2)}%`,
      deltaFmt: (v, p) => `${Math.round((v - p) * 100) >= 0 ? "+" : ""}${Math.round((v - p) * 100)} bps`,
    },
    {
      id: "GC_M2", seriesId: "M2SL", label: "M2 Money Supply",
      detail: "Broad money supply — monetary expansion historically gold-positive",
      chain: "upstream",
      fmt: (v) => `$${(v / 1000).toFixed(1)}T`,
      deltaFmt: (v, p) => `${((v - p) / p * 100) >= 0 ? "+" : ""}${((v - p) / p * 100).toFixed(1)}%`,
    },
    {
      id: "GC_STRESS", seriesId: "STLFSI2", label: "Financial Stress Index",
      detail: "St. Louis Fed Financial Stress Index — stress → safe-haven gold demand",
      chain: "upstream",
      fmt: (v) => v.toFixed(2),
      deltaFmt: (v, p) => `${(v - p) >= 0 ? "+" : ""}${(v - p).toFixed(2)}`,
    },
  ];

  const results = await Promise.all(series.map((s) => fetchFRED(s.seriesId)));

  for (let i = 0; i < series.length; i++) {
    const s = series[i];
    const r = results[i];
    if (!r) continue;
    nodes.push({
      id: s.id,
      label: s.label,
      category: s.chain === "upstream" ? "supply" : "demand",
      value: s.fmt(r.value),
      delta: s.deltaFmt(r.value, r.prev),
      direction: dir(r.value, r.prev),
      detail: s.detail,
      source: "FRED",
      chainRole: s.chain,
    });
  }

  return nodes;
}

/* ── Build ES/NQ/YM (Equity) supply chain ── */

async function buildEquityChain(): Promise<SupplyChainNode[]> {
  const nodes: SupplyChainNode[] = [];

  const series: {
    id: string; seriesId: string; label: string; detail: string;
    chain: "upstream" | "downstream"; fmt: (v: number) => string;
    deltaFmt: (v: number, p: number) => string;
  }[] = [
    {
      id: "EQ_YIELD_CURVE", seriesId: "T10Y2Y", label: "Yield Curve (10Y-2Y)",
      detail: "10Y minus 2Y spread — inversion historically predicts recession (bear equities)",
      chain: "upstream",
      fmt: (v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`,
      deltaFmt: (v, p) => `${Math.round((v - p) * 100) >= 0 ? "+" : ""}${Math.round((v - p) * 100)} bps`,
    },
    {
      id: "EQ_CONSUMER", seriesId: "UMCSENT", label: "Consumer Sentiment",
      detail: "University of Michigan consumer sentiment — consumer confidence drives spending → earnings",
      chain: "upstream",
      fmt: (v) => v.toFixed(1),
      deltaFmt: (v, p) => `${(v - p) >= 0 ? "+" : ""}${(v - p).toFixed(1)}`,
    },
    {
      id: "EQ_INDUSTRIAL", seriesId: "INDPRO", label: "Industrial Production",
      detail: "Industrial production index — proxy for economic output, especially Dow/industrials",
      chain: "upstream",
      fmt: (v) => v.toFixed(1),
      deltaFmt: (v, p) => `${(v - p) >= 0 ? "+" : ""}${(v - p).toFixed(1)}`,
    },
    {
      id: "EQ_RETAIL", seriesId: "RSXFS", label: "Retail Sales ex Food",
      detail: "Advance retail sales excluding food services — consumer spending proxy",
      chain: "upstream",
      fmt: (v) => `$${(v / 1000).toFixed(0)}B`,
      deltaFmt: (v, p) => `${((v - p) / p * 100) >= 0 ? "+" : ""}${((v - p) / p * 100).toFixed(1)}%`,
    },
    {
      id: "EQ_HOUSING", seriesId: "HOUST", label: "Housing Starts",
      detail: "New privately-owned housing units started — leading indicator of construction/consumer confidence",
      chain: "upstream",
      fmt: (v) => `${(v / 1000).toFixed(2)}M`,
      deltaFmt: (v, p) => `${((v - p) / 1000) >= 0 ? "+" : ""}${((v - p) / 1000).toFixed(0)}K`,
    },
    {
      id: "EQ_STRESS", seriesId: "STLFSI2", label: "Financial Stress Index",
      detail: "St. Louis Fed Financial Stress Index — below 0 = low stress (bull equities)",
      chain: "upstream",
      fmt: (v) => v.toFixed(2),
      deltaFmt: (v, p) => `${(v - p) >= 0 ? "+" : ""}${(v - p).toFixed(2)}`,
    },
  ];

  const results = await Promise.all(series.map((s) => fetchFRED(s.seriesId)));

  for (let i = 0; i < series.length; i++) {
    const s = series[i];
    const r = results[i];
    if (!r) continue;
    nodes.push({
      id: s.id,
      label: s.label,
      category: "macro",
      value: s.fmt(r.value),
      delta: s.deltaFmt(r.value, r.prev),
      direction: dir(r.value, r.prev),
      detail: s.detail,
      source: "FRED",
      chainRole: s.chain,
    });
  }

  return nodes;
}

/* ── Supabase cache ── */

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function getCached(instrument: string): Promise<any | null> {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data } = await sb
      .from("supply_chain_cache")
      .select("data, cached_at")
      .eq("id", instrument)
      .single();
    if (!data) return null;
    const age = Date.now() - new Date(data.cached_at).getTime();
    if (age > 12 * 60 * 60 * 1000) return null; // 12h TTL (this data is slow-moving)
    return data.data;
  } catch {
    return null;
  }
}

async function setCache(instrument: string, payload: any) {
  const sb = getSupabase();
  if (!sb) return;
  try {
    await sb.from("supply_chain_cache").upsert({
      id: instrument,
      data: payload,
      cached_at: new Date().toISOString(),
    });
  } catch {}
}

/* ── GET handler ── */

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const instrument = (searchParams.get("instrument") ?? "ES").toUpperCase();

  // Check cache
  const cached = await getCached(instrument);
  if (cached) {
    return NextResponse.json({ ...cached, source: "cache" });
  }

  let nodes: SupplyChainNode[] = [];

  switch (instrument) {
    case "CL":
      nodes = await buildCLChain();
      break;
    case "GC":
      nodes = await buildGCChain();
      break;
    case "ES":
    case "NQ":
    case "YM":
      nodes = await buildEquityChain();
      break;
    default:
      nodes = await buildEquityChain();
  }

  const result: SupplyChainData = {
    instrument,
    nodes,
    updatedAt: new Date().toISOString(),
  };

  await setCache(instrument, result);

  return NextResponse.json(result);
}
