import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/* ─────────────────────────────────────────────
 * /api/factors — Live factor values for the
 * relationship graph.
 *
 * Sources:
 *   1. Yahoo Finance (delayed ~15 min) — prices,
 *      indices, forex, yields, commodities
 *   2. FRED API (free, 120 req/min) — macro
 *      indicators (CPI, PMI, claims, fed funds)
 *   3. Supabase cache — fallback when APIs
 *      are exhausted
 * ───────────────────────────────────────────── */

const FRED_API_KEY = process.env.FRED_API_KEY ?? "";

/* ── Yahoo Finance tickers ── */
interface YahooFactor {
  id: string;
  ticker: string;
  label: string;
  category: string;
  format: "price" | "percent" | "index" | "number";
  prefix?: string;
  suffix?: string;
  invert?: boolean; // for factors where "down" in source = "up" in display
}

const YAHOO_FACTORS: YahooFactor[] = [
  // Instruments
  { id: "GC", ticker: "GC=F", label: "Gold (GC)", category: "instrument", format: "price", prefix: "$" },
  { id: "ES", ticker: "ES=F", label: "S&P 500 (ES)", category: "instrument", format: "number" },
  { id: "NQ", ticker: "NQ=F", label: "Nasdaq (NQ)", category: "instrument", format: "number" },
  { id: "YM", ticker: "YM=F", label: "Dow (YM)", category: "instrument", format: "number" },
  { id: "CL", ticker: "CL=F", label: "Crude Oil (CL)", category: "instrument", format: "price", prefix: "$" },
  // Commodities
  { id: "SI", ticker: "SI=F", label: "Silver (SI)", category: "commodity", format: "price", prefix: "$" },
  { id: "BZ", ticker: "BZ=F", label: "Brent Crude", category: "commodity", format: "price", prefix: "$" },
  // Indices & Sentiment
  { id: "VIX", ticker: "^VIX", label: "VIX", category: "sentiment", format: "number" },
  { id: "SOX", ticker: "^SOX", label: "SOX Semiconductor", category: "instrument", format: "number" },
  { id: "DXY", ticker: "DX-Y.NYB", label: "US Dollar (DXY)", category: "currency", format: "number" },
  // Yields
  { id: "US10Y", ticker: "^TNX", label: "10Y Treasury Yield", category: "macro", format: "percent", suffix: "%" },
  { id: "US02Y", ticker: "^IRX", label: "2Y Treasury Yield", category: "macro", format: "percent", suffix: "%" },
  // Currencies
  { id: "USDJPY", ticker: "JPY=X", label: "USD/JPY", category: "currency", format: "number", invert: true },
  { id: "EURUSD", ticker: "EURUSD=X", label: "EUR/USD", category: "currency", format: "number" },
  // Stocks (NQ constituents)
  { id: "NVDA", ticker: "NVDA", label: "NVDA", category: "fundamental", format: "price", prefix: "$" },
  { id: "AAPL", ticker: "AAPL", label: "AAPL", category: "fundamental", format: "price", prefix: "$" },
];

/* ── FRED series for macro indicators ── */
interface FredFactor {
  id: string;
  seriesId: string;
  label: string;
  category: string;
  format: "percent" | "number" | "thousands";
  suffix?: string;
}

const FRED_FACTORS: FredFactor[] = [
  { id: "FED_RATE", seriesId: "DFEDTARU", label: "Fed Funds Rate", category: "macro", format: "percent", suffix: "%" },
  { id: "CPI", seriesId: "CPIAUCSL", label: "Inflation (CPI YoY)", category: "macro", format: "percent", suffix: "%" },
  { id: "PMI", seriesId: "ISM/MAN_PMI", label: "ISM PMI Mfg", category: "macro", format: "number" },
  { id: "CLAIMS", seriesId: "ICSA", label: "Jobless Claims", category: "macro", format: "thousands" },
  { id: "REAL_YIELD", seriesId: "DFII10", label: "Real Yield (10Y TIPS)", category: "macro", format: "percent", suffix: "%" },
];

/* ── Fetch Yahoo Finance quotes ── */
async function fetchYahooQuotes(
  factors: YahooFactor[]
): Promise<Record<string, { value: string; delta: string; dir: string }>> {
  const results: Record<string, { value: string; delta: string; dir: string }> = {};
  const tickers = factors.map((f) => f.ticker).join(",");

  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(tickers)}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) throw new Error(`Yahoo ${res.status}`);
    const json = await res.json();
    const quotes = json?.quoteResponse?.result ?? [];

    for (const factor of factors) {
      const q = quotes.find(
        (qq: any) => qq.symbol === factor.ticker
      );
      if (!q) continue;

      let price = q.regularMarketPrice ?? 0;
      let change = q.regularMarketChange ?? 0;
      let changePct = q.regularMarketChangePercent ?? 0;

      // For inverted JPY=X (Yahoo gives USDJPY as JPY per USD reciprocal)
      if (factor.invert) {
        // Yahoo's JPY=X is actually USD/JPY already, so no inversion needed
      }

      const dir = change > 0.001 ? "up" : change < -0.001 ? "down" : "flat";

      let valueStr: string;
      if (factor.format === "price") {
        valueStr = `${factor.prefix ?? ""}${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      } else if (factor.format === "percent") {
        valueStr = `${price.toFixed(2)}${factor.suffix ?? ""}`;
      } else if (factor.format === "index") {
        valueStr = price.toLocaleString("en-US", { maximumFractionDigits: 0 });
      } else {
        // number — use commas for large, decimals for small
        valueStr = price > 100
          ? price.toLocaleString("en-US", { maximumFractionDigits: 0 })
          : price.toFixed(2);
      }

      const sign = changePct >= 0 ? "+" : "";
      const deltaStr = `${sign}${changePct.toFixed(2)}%`;

      results[factor.id] = { value: valueStr, delta: deltaStr, dir };
    }
  } catch (err) {
    console.error("Yahoo Finance fetch error:", err);
  }

  return results;
}

/* ── Fetch FRED data ── */
async function fetchFredFactors(
  factors: FredFactor[]
): Promise<Record<string, { value: string; delta: string; dir: string }>> {
  const results: Record<string, { value: string; delta: string; dir: string }> = {};

  if (!FRED_API_KEY) return results;

  for (const factor of factors) {
    try {
      const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${factor.seriesId}&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=2`;
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
      if (factor.format === "percent") {
        valueStr = `${latest.toFixed(2)}${factor.suffix ?? ""}`;
      } else if (factor.format === "thousands") {
        valueStr = `${Math.round(latest / 1000)}K`;
      } else {
        valueStr = latest.toFixed(1);
      }

      let deltaStr: string;
      if (factor.format === "percent") {
        const sign = change >= 0 ? "+" : "";
        const bps = Math.round(change * 100);
        deltaStr = `${sign}${bps} bps`;
      } else if (factor.format === "thousands") {
        const sign = change >= 0 ? "+" : "";
        deltaStr = `${sign}${Math.round(change / 1000)}K`;
      } else {
        const sign = change >= 0 ? "+" : "";
        deltaStr = `${sign}${change.toFixed(1)}`;
      }

      results[factor.id] = { value: valueStr, delta: deltaStr, dir };
    } catch (err) {
      console.error(`FRED fetch error for ${factor.id}:`, err);
    }
  }

  return results;
}

/* ── Supabase cache ── */
function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function getCachedFactors(): Promise<Record<string, any> | null> {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data } = await sb
      .from("factor_cache")
      .select("data, cached_at")
      .eq("id", "latest")
      .single();
    if (!data) return null;
    // Use cache if less than 20 min old
    const age = Date.now() - new Date(data.cached_at).getTime();
    if (age > 20 * 60 * 1000) return null;
    return data.data;
  } catch {
    return null;
  }
}

async function cacheFactors(factors: Record<string, any>) {
  const sb = getSupabase();
  if (!sb) return;
  try {
    await sb.from("factor_cache").upsert({
      id: "latest",
      data: factors,
      cached_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Cache write error:", err);
  }
}

/* ── Computed factors (derived from fetched data) ── */
function computeDerivedFactors(
  raw: Record<string, { value: string; delta: string; dir: string }>
): Record<string, { value: string; delta: string; dir: string }> {
  const derived: Record<string, { value: string; delta: string; dir: string }> = {};

  // Brent Spread = BZ - CL
  if (raw.BZ && raw.CL) {
    const bz = parseFloat(raw.BZ.value.replace(/[$,]/g, ""));
    const cl = parseFloat(raw.CL.value.replace(/[$,]/g, ""));
    if (!isNaN(bz) && !isNaN(cl)) {
      const spread = bz - cl;
      derived["BRENT"] = {
        value: `$${spread.toFixed(2)}`,
        delta: raw.BZ.delta,
        dir: spread > 0 ? "up" : "down",
      };
    }
  }

  // Gold/Silver ratio
  if (raw.GC && raw.SI) {
    const gc = parseFloat(raw.GC.value.replace(/[$,]/g, ""));
    const si = parseFloat(raw.SI.value.replace(/[$,]/g, ""));
    if (!isNaN(gc) && !isNaN(si) && si > 0) {
      const ratio = gc / si;
      derived["GS_RATIO"] = {
        value: ratio.toFixed(1),
        delta: "—",
        dir: "flat",
      };
    }
  }

  return derived;
}

/* ── GET handler ── */
export async function GET() {
  // Try cache first
  const cached = await getCachedFactors();
  if (cached) {
    return NextResponse.json({ factors: cached, source: "cache" });
  }

  // Fetch from APIs in parallel
  const [yahooResults, fredResults] = await Promise.all([
    fetchYahooQuotes(YAHOO_FACTORS),
    fetchFredFactors(FRED_FACTORS),
  ]);

  // Merge all sources
  const all: Record<string, { value: string; delta: string; dir: string }> = {
    ...yahooResults,
    ...fredResults,
  };

  // Add derived/computed factors
  const derived = computeDerivedFactors(all);
  Object.assign(all, derived);

  // Cache results
  if (Object.keys(all).length > 0) {
    await cacheFactors(all);
  }

  const sources: string[] = [];
  if (Object.keys(yahooResults).length > 0) sources.push("Yahoo Finance");
  if (Object.keys(fredResults).length > 0) sources.push("FRED");

  return NextResponse.json({
    factors: all,
    sources,
    updated: new Date().toISOString(),
  });
}
