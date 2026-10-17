import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import {
  INSTRUMENTS,
  INSTRUMENT_META,
  NEWS_KEYWORDS,
  type Instrument,
  type NewsItem,
} from "@/lib/types";
import { analyzeHeadline, computeNewsSentimentIndex } from "@/lib/news-sentiment";

/**
 * Comprehensive cron job: fetches ALL external data and caches in Supabase.
 * This is the ONLY place external APIs are called.
 *
 * Fetches:
 * 1. Price bars (Yahoo Finance)
 * 2. Factors (Yahoo Finance + FRED)
 * 3. Correlations (Yahoo Finance historical)
 * 4. Supply chain (FRED + EIA)
 * 5. News (Finnhub, Alpha Vantage, NewsData.io)
 */

const FRED_API_KEY = process.env.FRED_API_KEY ?? "";
const EIA_API_KEY = process.env.EIA_API_KEY ?? "";
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY ?? "";
const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY ?? "";
const NEWSDATA_API_KEY = process.env.NEWSDATA_API_KEY ?? "";

/* ═══════════════════════════════════════════
 * 1. PRICE BARS
 * ═══════════════════════════════════════════ */

async function fetchPriceBars(supabase: any): Promise<Record<string, number>> {
  const results: Record<string, number> = {};

  for (const instrument of INSTRUMENTS) {
    try {
      const meta = INSTRUMENT_META[instrument];
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(meta.yahoo)}?interval=15m&range=5d`;
      const res = await fetch(url, {
        headers: { "User-Agent": "futures-dashboard/1.0" },
      });
      if (!res.ok) { results[instrument] = -1; continue; }

      const json = await res.json();
      const result = json.chart?.result?.[0];
      if (!result) { results[instrument] = -1; continue; }

      const timestamps: number[] = result.timestamp ?? [];
      const quote = result.indicators?.quote?.[0] ?? {};

      const rows = timestamps.map((ts, i) => ({
        instrument,
        timestamp: new Date(ts * 1000).toISOString(),
        open: quote.open?.[i] ?? 0,
        high: quote.high?.[i] ?? 0,
        low: quote.low?.[i] ?? 0,
        close: quote.close?.[i] ?? 0,
        volume: quote.volume?.[i] ?? 0,
      }));

      if (rows.length > 0) {
        await supabase.from("price_bars").upsert(rows, { onConflict: "instrument,timestamp" });
      }
      results[instrument] = rows.length;
    } catch (err: any) {
      results[instrument] = -1;
      console.error(`[cron] price_bars ${instrument}:`, err.message);
    }
  }
  return results;
}

/* ═══════════════════════════════════════════
 * 2. FACTORS (Yahoo quotes + FRED macro)
 * ═══════════════════════════════════════════ */

const YAHOO_TICKERS = [
  { id: "GC", ticker: "GC=F", fmt: "price", prefix: "$" },
  { id: "ES", ticker: "ES=F", fmt: "number" },
  { id: "NQ", ticker: "NQ=F", fmt: "number" },
  { id: "YM", ticker: "YM=F", fmt: "number" },
  { id: "CL", ticker: "CL=F", fmt: "price", prefix: "$" },
  { id: "SI", ticker: "SI=F", fmt: "price", prefix: "$" },
  { id: "BZ", ticker: "BZ=F", fmt: "price", prefix: "$" },
  { id: "VIX", ticker: "^VIX", fmt: "number" },
  { id: "SOX", ticker: "^SOX", fmt: "number" },
  { id: "DXY", ticker: "DX-Y.NYB", fmt: "number" },
  { id: "US10Y", ticker: "^TNX", fmt: "percent", suffix: "%" },
  { id: "US02Y", ticker: "^IRX", fmt: "percent", suffix: "%" },
  { id: "USDJPY", ticker: "JPY=X", fmt: "number" },
  { id: "EURUSD", ticker: "EURUSD=X", fmt: "number" },
  { id: "NVDA", ticker: "NVDA", fmt: "price", prefix: "$" },
  { id: "AAPL", ticker: "AAPL", fmt: "price", prefix: "$" },
];

const FRED_SERIES = [
  { id: "FED_RATE", seriesId: "DFEDTARU", fmt: "percent", suffix: "%" },
  { id: "CPI", seriesId: "CPIAUCSL", fmt: "percent", suffix: "%" },
  { id: "PMI", seriesId: "ISM/MAN_PMI", fmt: "number" },
  { id: "CLAIMS", seriesId: "ICSA", fmt: "thousands" },
  { id: "REAL_YIELD", seriesId: "DFII10", fmt: "percent", suffix: "%" },
];

async function fetchFactors(supabase: any): Promise<string> {
  const factors: Record<string, { value: string; delta: string; dir: string }> = {};

  // Yahoo Finance quotes
  try {
    const tickers = YAHOO_TICKERS.map((t) => t.ticker).join(",");
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(tickers)}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      const json = await res.json();
      const quotes = json?.quoteResponse?.result ?? [];
      for (const t of YAHOO_TICKERS) {
        const q = quotes.find((qq: any) => qq.symbol === t.ticker);
        if (!q) continue;
        const price = q.regularMarketPrice ?? 0;
        const change = q.regularMarketChange ?? 0;
        const changePct = q.regularMarketChangePercent ?? 0;
        const dir = change > 0.001 ? "up" : change < -0.001 ? "down" : "flat";
        let valueStr: string;
        if (t.fmt === "price") valueStr = `${t.prefix ?? ""}${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        else if (t.fmt === "percent") valueStr = `${price.toFixed(2)}${(t as any).suffix ?? ""}`;
        else valueStr = price > 100 ? price.toLocaleString("en-US", { maximumFractionDigits: 0 }) : price.toFixed(2);
        factors[t.id] = { value: valueStr, delta: `${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%`, dir };
      }
    }
  } catch (err) { console.error("[cron] Yahoo factors:", err); }

  // FRED macro
  if (FRED_API_KEY) {
    for (const s of FRED_SERIES) {
      try {
        const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${s.seriesId}&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=2`;
        const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
        if (!res.ok) continue;
        const json = await res.json();
        const obs = json?.observations ?? [];
        if (obs.length === 0) continue;
        const latest = parseFloat(obs[0].value);
        const prev = obs.length > 1 ? parseFloat(obs[1].value) : latest;
        if (isNaN(latest)) continue;
        const change = latest - prev;
        const dir = change > 0.001 ? "up" : change < -0.001 ? "down" : "flat";
        let valueStr: string;
        if (s.fmt === "percent") valueStr = `${latest.toFixed(2)}${s.suffix ?? ""}`;
        else if (s.fmt === "thousands") valueStr = `${Math.round(latest / 1000)}K`;
        else valueStr = latest.toFixed(1);
        let deltaStr: string;
        if (s.fmt === "percent") deltaStr = `${change >= 0 ? "+" : ""}${Math.round(change * 100)} bps`;
        else if (s.fmt === "thousands") deltaStr = `${change >= 0 ? "+" : ""}${Math.round(change / 1000)}K`;
        else deltaStr = `${change >= 0 ? "+" : ""}${change.toFixed(1)}`;
        factors[s.id] = { value: valueStr, delta: deltaStr, dir };
      } catch (err) { console.error(`[cron] FRED ${s.id}:`, err); }
    }
  }

  // Derived factors
  if (factors.BZ && factors.CL) {
    const bz = parseFloat(factors.BZ.value.replace(/[$,]/g, ""));
    const cl = parseFloat(factors.CL.value.replace(/[$,]/g, ""));
    if (!isNaN(bz) && !isNaN(cl)) {
      factors["BRENT"] = { value: `$${(bz - cl).toFixed(2)}`, delta: factors.BZ.delta, dir: bz - cl > 0 ? "up" : "down" };
    }
  }
  if (factors.GC && factors.SI) {
    const gc = parseFloat(factors.GC.value.replace(/[$,]/g, ""));
    const si = parseFloat(factors.SI.value.replace(/[$,]/g, ""));
    if (!isNaN(gc) && !isNaN(si) && si > 0) {
      factors["GS_RATIO"] = { value: (gc / si).toFixed(1), delta: "—", dir: "flat" };
    }
  }

  // Cache
  if (Object.keys(factors).length > 0) {
    await supabase.from("factor_cache").upsert({ id: "latest", data: factors, cached_at: new Date().toISOString() });
  }

  return `${Object.keys(factors).length} factors`;
}

/* ═══════════════════════════════════════════
 * 3. CORRELATIONS
 * ═══════════════════════════════════════════ */

const CORR_UNIVERSE = [
  { id: "ES", ticker: "ES=F", label: "S&P 500" },
  { id: "NQ", ticker: "NQ=F", label: "Nasdaq 100" },
  { id: "YM", ticker: "YM=F", label: "Dow" },
  { id: "CL", ticker: "CL=F", label: "Crude Oil" },
  { id: "GC", ticker: "GC=F", label: "Gold" },
  { id: "DXY", ticker: "DX-Y.NYB", label: "US Dollar" },
  { id: "VIX", ticker: "^VIX", label: "VIX" },
  { id: "US10Y", ticker: "^TNX", label: "10Y Yield" },
  { id: "SI", ticker: "SI=F", label: "Silver" },
  { id: "BZ", ticker: "BZ=F", label: "Brent" },
  { id: "SOX", ticker: "^SOX", label: "Semiconductors" },
  { id: "USDJPY", ticker: "JPY=X", label: "USD/JPY" },
  { id: "EURUSD", ticker: "EURUSD=X", label: "EUR/USD" },
  { id: "NVDA", ticker: "NVDA", label: "NVDA" },
  { id: "AAPL", ticker: "AAPL", label: "AAPL" },
];

function pearson(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 5) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i]; sumY += y[i]; sumXY += x[i] * y[i]; sumX2 += x[i] * x[i]; sumY2 += y[i] * y[i];
  }
  const denom = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  return denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
}

function beta(xR: number[], yR: number[]): number {
  const n = Math.min(xR.length, yR.length);
  if (n < 5) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) { sumX += xR[i]; sumY += yR[i]; sumXY += xR[i] * yR[i]; sumX2 += xR[i] * xR[i]; }
  const denom = n * sumX2 - sumX * sumX;
  return denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
}

function bestLeadLag(x: number[], y: number[], maxLag = 5): { lag: number; r: number } {
  let bestLag = 0, bestR = -2;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    const xS = lag >= 0 ? x.slice(0, x.length - lag) : x.slice(-lag);
    const yS = lag >= 0 ? y.slice(lag) : y.slice(0, y.length + lag);
    const r = Math.abs(pearson(xS, yS));
    if (r > bestR) { bestR = r; bestLag = lag; }
  }
  return { lag: bestLag, r: bestR };
}

async function fetchCorrelations(supabase: any): Promise<string> {
  // Fetch 1-year daily history for all symbols
  const now = Math.floor(Date.now() / 1000);
  const from = now - 365 * 86400;

  const histories = await Promise.all(
    CORR_UNIVERSE.map(async (u) => {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(u.ticker)}?period1=${from}&period2=${now}&interval=1d`;
        const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(10000) });
        if (!res.ok) return { ...u, data: [] as { date: string; close: number }[] };
        const json = await res.json();
        const result = json?.chart?.result?.[0];
        if (!result) return { ...u, data: [] };
        const timestamps: number[] = result.timestamp ?? [];
        const closes: number[] = result.indicators?.quote?.[0]?.close ?? [];
        const data: { date: string; close: number }[] = [];
        for (let i = 0; i < timestamps.length; i++) {
          if (closes[i] != null && !isNaN(closes[i])) {
            data.push({ date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10), close: closes[i] });
          }
        }
        return { ...u, data };
      } catch { return { ...u, data: [] as { date: string; close: number }[] }; }
    })
  );

  // Align on common dates
  const validH = histories.filter((h) => h.data.length > 20);
  if (validH.length < 2) return "insufficient data";

  const datesSets = validH.map((h) => new Set(h.data.map((d) => d.date)));
  let commonDates = [...datesSets[0]];
  for (let i = 1; i < datesSets.length; i++) commonDates = commonDates.filter((d) => datesSets[i].has(d));
  commonDates.sort();

  const validSymbols: { id: string; label: string; closes: number[] }[] = [];
  for (const h of validH) {
    const closeMap = new Map(h.data.map((d) => [d.date, d.close]));
    const aligned = commonDates.map((d) => closeMap.get(d)!).filter(Boolean);
    if (aligned.length === commonDates.length) {
      validSymbols.push({ id: h.id, label: h.label, closes: aligned });
    }
  }

  // Returns
  const returnsMap = new Map<string, number[]>();
  for (const sym of validSymbols) {
    const ret: number[] = [];
    for (let i = 1; i < sym.closes.length; i++) {
      ret.push(sym.closes[i - 1] !== 0 ? (sym.closes[i] - sym.closes[i - 1]) / sym.closes[i - 1] : 0);
    }
    returnsMap.set(sym.id, ret);
  }

  const ids = validSymbols.map((s) => s.id);
  const n = ids.length;
  const ROLLING = 30;

  // Correlation matrix
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1.0;
    const ri = returnsMap.get(ids[i])!.slice(-ROLLING);
    for (let j = i + 1; j < n; j++) {
      const rj = returnsMap.get(ids[j])!.slice(-ROLLING);
      const r = pearson(ri, rj);
      matrix[i][j] = Math.round(r * 1000) / 1000;
      matrix[j][i] = matrix[i][j];
    }
  }

  // Pairs
  const pairs: any[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const ri = returnsMap.get(ids[i])!;
      const rj = returnsMap.get(ids[j])!;
      const r30 = pearson(ri.slice(-30), rj.slice(-30));
      const r90 = pearson(ri.slice(-90), rj.slice(-90));
      const b = beta(ri.slice(-90), rj.slice(-90));
      const ll = bestLeadLag(ri.slice(-90), rj.slice(-90));
      if (Math.abs(r30) > 0.15 || Math.abs(r90) > 0.15) {
        pairs.push({
          from: ids[i], to: ids[j],
          correlation30d: Math.round(r30 * 1000) / 1000,
          correlation90d: Math.round(r90 * 1000) / 1000,
          beta: Math.round(b * 1000) / 1000,
          leadLag: ll.lag, leadLagR: Math.round(ll.r * 1000) / 1000,
        });
      }
    }
  }

  const result = {
    correlationMatrix: { symbols: ids, labels: validSymbols.map((s) => s.label), matrix, period: `${ROLLING}d` },
    pairs,
    dataPoints: commonDates.length,
    dateRange: { from: commonDates[0], to: commonDates[commonDates.length - 1] },
    computedAt: new Date().toISOString(),
  };

  await supabase.from("correlation_cache").upsert({ id: "latest", data: result, cached_at: new Date().toISOString() });

  return `${ids.length} symbols, ${pairs.length} pairs`;
}

/* ═══════════════════════════════════════════
 * 4. SUPPLY CHAIN (FRED + EIA)
 * ═══════════════════════════════════════════ */

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
    return isNaN(val) ? null : { value: val, prev };
  } catch { return null; }
}

function dir(val: number, prev: number): "up" | "down" | "flat" {
  const d = val - prev;
  return d > 0.001 ? "up" : d < -0.001 ? "down" : "flat";
}

interface SCNode {
  id: string; label: string; category: string; value: string; delta: string;
  direction: "up" | "down" | "flat"; detail: string; source: string;
  chainRole: "upstream" | "downstream" | "both";
}

async function buildCLChain(): Promise<SCNode[]> {
  const series = [
    { id: "CL_US_PROD", s: "WCRFPUS2", label: "US Crude Production", chain: "upstream" as const, fmt: (v: number) => `${(v / 1000).toFixed(1)}M b/d`, dfmt: (v: number, p: number) => `${((v - p) / 1000) >= 0 ? "+" : ""}${((v - p) / 1000).toFixed(1)}M`, detail: "Weekly U.S. field production of crude oil" },
    { id: "CL_INVENTORIES", s: "WCESTUS1", label: "US Crude Inventories", chain: "both" as const, fmt: (v: number) => `${(v / 1000).toFixed(0)}M bbl`, dfmt: (v: number, p: number) => `${((v - p) / 1000) >= 0 ? "+" : ""}${((v - p) / 1000).toFixed(1)}M`, detail: "Weekly U.S. ending stocks excluding SPR" },
    { id: "CL_IMPORTS", s: "WCRIMUS2", label: "US Crude Imports", chain: "upstream" as const, fmt: (v: number) => `${(v / 1000).toFixed(1)}M b/d`, dfmt: (v: number, p: number) => `${((v - p) / 1000) >= 0 ? "+" : ""}${((v - p) / 1000).toFixed(1)}M`, detail: "Weekly U.S. imports of crude oil" },
    { id: "CL_GASOLINE", s: "WGFUPUS2", label: "Gasoline Production", chain: "downstream" as const, fmt: (v: number) => `${(v / 1000).toFixed(1)}M b/d`, dfmt: (v: number, p: number) => `${((v - p) / 1000) >= 0 ? "+" : ""}${((v - p) / 1000).toFixed(1)}M`, detail: "Weekly U.S. gasoline production" },
    { id: "CL_REFINERY", s: "WPULEUS3", label: "Refinery Utilization", chain: "downstream" as const, fmt: (v: number) => `${v.toFixed(1)}%`, dfmt: (v: number, p: number) => `${(v - p) >= 0 ? "+" : ""}${(v - p).toFixed(1)}%`, detail: "Weekly U.S. refinery utilization" },
    { id: "CL_NATGAS", s: "DHHNGSP", label: "Natural Gas Price", chain: "upstream" as const, fmt: (v: number) => `$${v.toFixed(2)}/MMBtu`, dfmt: (v: number, p: number) => `${(v - p) >= 0 ? "+" : ""}$${(v - p).toFixed(2)}`, detail: "Henry Hub spot price" },
  ];
  const results = await Promise.all(series.map((x) => fetchFRED(x.s)));
  const nodes: SCNode[] = [];
  for (let i = 0; i < series.length; i++) {
    const s = series[i], r = results[i];
    if (!r) continue;
    nodes.push({ id: s.id, label: s.label, category: s.chain === "upstream" ? "supply" : s.chain === "downstream" ? "demand" : "supply", value: s.fmt(r.value), delta: s.dfmt(r.value, r.prev), direction: dir(r.value, r.prev), detail: s.detail, source: "FRED/EIA", chainRole: s.chain });
  }
  return nodes;
}

async function buildGCChain(): Promise<SCNode[]> {
  const series = [
    { id: "GC_REAL_YIELD", s: "DFII10", label: "10Y Real Yield (TIPS)", chain: "upstream" as const, fmt: (v: number) => `${v.toFixed(2)}%`, dfmt: (v: number, p: number) => `${Math.round((v - p) * 100) >= 0 ? "+" : ""}${Math.round((v - p) * 100)} bps`, detail: "10-Year TIPS breakeven rate" },
    { id: "GC_BREAKEVEN", s: "T10YIE", label: "10Y Breakeven Inflation", chain: "upstream" as const, fmt: (v: number) => `${v.toFixed(2)}%`, dfmt: (v: number, p: number) => `${Math.round((v - p) * 100) >= 0 ? "+" : ""}${Math.round((v - p) * 100)} bps`, detail: "Market inflation expectations" },
    { id: "GC_M2", s: "M2SL", label: "M2 Money Supply", chain: "upstream" as const, fmt: (v: number) => `$${(v / 1000).toFixed(1)}T`, dfmt: (v: number, p: number) => `${((v - p) / p * 100) >= 0 ? "+" : ""}${((v - p) / p * 100).toFixed(1)}%`, detail: "Broad money supply" },
    { id: "GC_STRESS", s: "STLFSI2", label: "Financial Stress Index", chain: "upstream" as const, fmt: (v: number) => v.toFixed(2), dfmt: (v: number, p: number) => `${(v - p) >= 0 ? "+" : ""}${(v - p).toFixed(2)}`, detail: "St. Louis Fed Financial Stress Index" },
  ];
  const results = await Promise.all(series.map((x) => fetchFRED(x.s)));
  const nodes: SCNode[] = [];
  for (let i = 0; i < series.length; i++) {
    const s = series[i], r = results[i];
    if (!r) continue;
    nodes.push({ id: s.id, label: s.label, category: "supply", value: s.fmt(r.value), delta: s.dfmt(r.value, r.prev), direction: dir(r.value, r.prev), detail: s.detail, source: "FRED", chainRole: s.chain });
  }
  return nodes;
}

async function buildEquityChain(): Promise<SCNode[]> {
  const series = [
    { id: "EQ_YIELD_CURVE", s: "T10Y2Y", label: "Yield Curve (10Y-2Y)", chain: "upstream" as const, fmt: (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`, dfmt: (v: number, p: number) => `${Math.round((v - p) * 100) >= 0 ? "+" : ""}${Math.round((v - p) * 100)} bps`, detail: "10Y minus 2Y spread" },
    { id: "EQ_CONSUMER", s: "UMCSENT", label: "Consumer Sentiment", chain: "upstream" as const, fmt: (v: number) => v.toFixed(1), dfmt: (v: number, p: number) => `${(v - p) >= 0 ? "+" : ""}${(v - p).toFixed(1)}`, detail: "U. of Michigan consumer sentiment" },
    { id: "EQ_INDUSTRIAL", s: "INDPRO", label: "Industrial Production", chain: "upstream" as const, fmt: (v: number) => v.toFixed(1), dfmt: (v: number, p: number) => `${(v - p) >= 0 ? "+" : ""}${(v - p).toFixed(1)}`, detail: "Industrial production index" },
    { id: "EQ_RETAIL", s: "RSXFS", label: "Retail Sales ex Food", chain: "upstream" as const, fmt: (v: number) => `$${(v / 1000).toFixed(0)}B`, dfmt: (v: number, p: number) => `${((v - p) / p * 100) >= 0 ? "+" : ""}${((v - p) / p * 100).toFixed(1)}%`, detail: "Advance retail sales excluding food" },
    { id: "EQ_HOUSING", s: "HOUST", label: "Housing Starts", chain: "upstream" as const, fmt: (v: number) => `${(v / 1000).toFixed(2)}M`, dfmt: (v: number, p: number) => `${((v - p) / 1000) >= 0 ? "+" : ""}${((v - p) / 1000).toFixed(0)}K`, detail: "New privately-owned housing units started" },
    { id: "EQ_STRESS", s: "STLFSI2", label: "Financial Stress Index", chain: "upstream" as const, fmt: (v: number) => v.toFixed(2), dfmt: (v: number, p: number) => `${(v - p) >= 0 ? "+" : ""}${(v - p).toFixed(2)}`, detail: "St. Louis Fed Financial Stress Index" },
  ];
  const results = await Promise.all(series.map((x) => fetchFRED(x.s)));
  const nodes: SCNode[] = [];
  for (let i = 0; i < series.length; i++) {
    const s = series[i], r = results[i];
    if (!r) continue;
    nodes.push({ id: s.id, label: s.label, category: "macro", value: s.fmt(r.value), delta: s.dfmt(r.value, r.prev), direction: dir(r.value, r.prev), detail: s.detail, source: "FRED", chainRole: s.chain });
  }
  return nodes;
}

async function fetchSupplyChain(supabase: any): Promise<string> {
  const chains: Record<string, SCNode[]> = {};

  const [clNodes, gcNodes, eqNodes] = await Promise.all([
    buildCLChain(),
    buildGCChain(),
    buildEquityChain(),
  ]);

  chains.CL = clNodes;
  chains.GC = gcNodes;
  chains.ES = eqNodes;
  chains.NQ = eqNodes;
  chains.YM = eqNodes;

  for (const [instrument, nodes] of Object.entries(chains)) {
    const payload = { instrument, nodes, updatedAt: new Date().toISOString() };
    await supabase.from("supply_chain_cache").upsert({ id: instrument, data: payload, cached_at: new Date().toISOString() });
  }

  return `CL:${clNodes.length} GC:${gcNodes.length} EQ:${eqNodes.length}`;
}

/* ═══════════════════════════════════════════
 * 5. NEWS (Finnhub, Alpha Vantage, NewsData.io)
 * ═══════════════════════════════════════════ */

function guessTag(headline: string): string {
  const h = headline.toLowerCase();
  if (h.includes("earning") || h.includes("eps") || h.includes("revenue")) return "EARNINGS";
  if (h.includes("fed ") || h.includes("fomc") || h.includes("rate cut") || h.includes("rate hike")) return "FED";
  if (h.includes("opec")) return "OPEC";
  if (h.includes("ai ") || h.includes("artificial intelligence") || h.includes("nvidia")) return "AI";
  if (h.includes("geopoliti") || h.includes("war") || h.includes("sanction")) return "GEOPOLITICS";
  if (h.includes("inflation") || h.includes("cpi") || h.includes("ppi") || h.includes("pce")) return "INFLATION";
  if (h.includes("gdp") || h.includes("pmi") || h.includes("jobs") || h.includes("payroll")) return "MACRO";
  if (h.includes("inventory") || h.includes("stockpile") || h.includes("eia")) return "INVENTORY";
  if (h.includes("supply") || h.includes("production")) return "SUPPLY";
  return "MARKET";
}

function formatAVDate(d: string): string {
  if (!d || d.length < 15) return new Date().toISOString();
  return new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${d.slice(9, 11)}:${d.slice(11, 13)}:${d.slice(13, 15)}Z`).toISOString();
}

async function fetchNews(supabase: any): Promise<string> {
  let totalInserted = 0;

  for (const instrument of INSTRUMENTS) {
    const allNews: { id: string; instrument: string; headline: string; summary: string | null; source: string; url: string | null; publishedAt: string; sentiment: string; tag: string }[] = [];
    const seenHeadlines = new Set<string>();

    // Finnhub
    if (FINNHUB_API_KEY) {
      try {
        const category = instrument === "CL" || instrument === "GC" ? "forex" : "general";
        const res = await fetch(`https://finnhub.io/api/v1/news?category=${category}&token=${FINNHUB_API_KEY}`, { signal: AbortSignal.timeout(8000) });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            const keywords = NEWS_KEYWORDS[instrument].map((k) => k.toLowerCase());
            for (const item of data) {
              const text = `${item.headline} ${item.summary}`.toLowerCase();
              if (!keywords.some((kw) => text.includes(kw))) continue;
              const key = item.headline.toLowerCase().slice(0, 60);
              if (seenHeadlines.has(key)) continue;
              seenHeadlines.add(key);
              allNews.push({
                id: `fh-${instrument}-${allNews.length}`,
                instrument,
                headline: item.headline,
                summary: item.summary ?? null,
                source: item.source,
                url: item.url ?? null,
                publishedAt: new Date(item.datetime * 1000).toISOString(),
                sentiment: "neutral",
                tag: guessTag(item.headline),
              });
              if (allNews.length >= 15) break;
            }
          }
        }
      } catch {}
    }

    // Alpha Vantage
    if (ALPHA_VANTAGE_API_KEY) {
      try {
        const tickerMap: Record<string, string> = { ES: "SPY", NQ: "QQQ", YM: "DIA", CL: "USO", GC: "GLD" };
        const res = await fetch(`https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${tickerMap[instrument] ?? "SPY"}&limit=15&apikey=${ALPHA_VANTAGE_API_KEY}`, { signal: AbortSignal.timeout(8000) });
        if (res.ok) {
          const data = await res.json();
          const feed = data.feed;
          if (Array.isArray(feed)) {
            for (const item of feed.slice(0, 10)) {
              const key = item.title.toLowerCase().slice(0, 60);
              if (seenHeadlines.has(key)) continue;
              seenHeadlines.add(key);
              const sentScore = parseFloat(item.overall_sentiment_score ?? "0");
              allNews.push({
                id: `av-${instrument}-${allNews.length}`,
                instrument,
                headline: item.title,
                summary: item.summary ?? null,
                source: item.source,
                url: item.url ?? null,
                publishedAt: formatAVDate(item.time_published),
                sentiment: sentScore > 0.15 ? "positive" : sentScore < -0.15 ? "negative" : "neutral",
                tag: guessTag(item.title),
              });
            }
          }
        }
      } catch {}
    }

    // NewsData.io
    if (NEWSDATA_API_KEY) {
      try {
        const query = NEWS_KEYWORDS[instrument].slice(0, 2).join(" OR ");
        const res = await fetch(`https://newsdata.io/api/1/latest?apikey=${NEWSDATA_API_KEY}&q=${encodeURIComponent(query)}&category=business&language=en&size=10`, { signal: AbortSignal.timeout(8000) });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.results)) {
            for (const item of data.results) {
              const key = item.title.toLowerCase().slice(0, 60);
              if (seenHeadlines.has(key)) continue;
              seenHeadlines.add(key);
              allNews.push({
                id: `nd-${instrument}-${allNews.length}`,
                instrument,
                headline: item.title,
                summary: item.description ?? null,
                source: item.source_name ?? item.source_id ?? "NewsData",
                url: item.link ?? null,
                publishedAt: item.pubDate ?? new Date().toISOString(),
                sentiment: (item.sentiment as string) ?? "neutral",
                tag: guessTag(item.title),
              });
            }
          }
        }
      } catch {}
    }

    // Sort by date, take top 20
    allNews.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
    const top = allNews.slice(0, 20);

    if (top.length > 0) {
      // Run sentiment analysis on each article
      const analyzedRows = top.map((n) => {
        const analysis = analyzeHeadline(n.headline, n.summary, instrument);
        return {
          id: n.id,
          instrument: n.instrument,
          headline: n.headline,
          summary: n.summary,
          source: n.source,
          url: n.url,
          published_at: n.publishedAt,
          sentiment: analysis.sentimentLabel === "very_bullish" || analysis.sentimentLabel === "bullish"
            ? "positive"
            : analysis.sentimentLabel === "very_bearish" || analysis.sentimentLabel === "bearish"
            ? "negative"
            : "neutral",
          tag: analysis.tag,
          sentiment_score: analysis.sentimentScore,
          sentiment_label: analysis.sentimentLabel,
          impact_level: analysis.impactLevel,
          impact_score: analysis.impactScore,
        };
      });

      await supabase.from("news").upsert(analyzedRows, { onConflict: "id" });
      totalInserted += top.length;

      // Compute and cache aggregate sentiment index
      const sentimentIndex = computeNewsSentimentIndex(
        analyzedRows.map((r) => ({
          sentimentScore: r.sentiment_score,
          impactScore: r.impact_score,
          publishedAt: r.published_at,
        }))
      );

      await supabase.from("news_sentiment_cache").upsert({
        instrument,
        sentiment_index: sentimentIndex.index,
        sentiment_label: sentimentIndex.label,
        article_count: sentimentIndex.articleCount,
        bullish_pct: sentimentIndex.bullishPct,
        bearish_pct: sentimentIndex.bearishPct,
        cached_at: new Date().toISOString(),
      }, { onConflict: "instrument" });
    }
  }

  return `${totalInserted} articles`;
}

/* ═══════════════════════════════════════════
 * GET handler — runs all fetchers
 * ═══════════════════════════════════════════ */

export async function GET(request: Request) {
  // Verify cron secret (Vercel sends this header for cron jobs)
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const startTime = Date.now();
  const results: Record<string, string> = {};

  // Run all fetchers — prices first, then the rest in parallel
  try {
    const priceResult = await fetchPriceBars(supabase);
    results.prices = JSON.stringify(priceResult);
  } catch (err: any) {
    results.prices = `error: ${err.message}`;
  }

  // Run factors, correlations, supply chain, news in parallel
  const [factorsR, corrR, scR, newsR] = await Promise.allSettled([
    fetchFactors(supabase),
    fetchCorrelations(supabase),
    fetchSupplyChain(supabase),
    fetchNews(supabase),
  ]);

  results.factors = factorsR.status === "fulfilled" ? factorsR.value : `error: ${(factorsR as any).reason?.message}`;
  results.correlations = corrR.status === "fulfilled" ? corrR.value : `error: ${(corrR as any).reason?.message}`;
  results.supplyChain = scR.status === "fulfilled" ? scR.value : `error: ${(scR as any).reason?.message}`;
  results.news = newsR.status === "fulfilled" ? newsR.value : `error: ${(newsR as any).reason?.message}`;

  const elapsed = Date.now() - startTime;

  return NextResponse.json({
    ok: true,
    results,
    elapsed_ms: elapsed,
    fetched_at: new Date().toISOString(),
  });
}
