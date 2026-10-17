import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/* ─────────────────────────────────────────────
 * /api/correlations
 *
 * Computes rolling correlations & beta coefficients
 * between all instrument/macro pairs from Yahoo Finance
 * historical daily data (1 year lookback).
 *
 * Returns a full correlation matrix + pairwise betas
 * for the Bloomberg SPLC-style network.
 *
 * Cached in Supabase for 6 hours (correlations don't
 * change fast enough to recompute more often).
 * ───────────────────────────────────────────── */

/** Symbols to track — instruments + macro proxies */
const UNIVERSE: { id: string; ticker: string; label: string }[] = [
  // Core instruments
  { id: "ES", ticker: "ES=F", label: "S&P 500" },
  { id: "NQ", ticker: "NQ=F", label: "Nasdaq 100" },
  { id: "YM", ticker: "YM=F", label: "Dow" },
  { id: "CL", ticker: "CL=F", label: "Crude Oil" },
  { id: "GC", ticker: "GC=F", label: "Gold" },
  // Macro proxies
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

const LOOKBACK_DAYS = 365;
const ROLLING_WINDOW = 30; // 30-day rolling correlation

/* ── Fetch historical closes from Yahoo Finance ── */

interface DailyClose {
  date: string;
  close: number;
}

async function fetchHistory(ticker: string): Promise<DailyClose[]> {
  const now = Math.floor(Date.now() / 1000);
  const from = now - LOOKBACK_DAYS * 86400;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${from}&period2=${now}&interval=1d`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return [];

    const timestamps: number[] = result.timestamp ?? [];
    const closes: number[] =
      result.indicators?.quote?.[0]?.close ?? [];

    const data: DailyClose[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] != null && !isNaN(closes[i])) {
        data.push({
          date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10),
          close: closes[i],
        });
      }
    }
    return data;
  } catch {
    return [];
  }
}

/* ── Compute daily returns ── */

function dailyReturns(closes: number[]): number[] {
  const ret: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] !== 0) {
      ret.push((closes[i] - closes[i - 1]) / closes[i - 1]);
    } else {
      ret.push(0);
    }
  }
  return ret;
}

/* ── Pearson correlation ── */

function pearson(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 5) return 0;

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
    sumY2 += y[i] * y[i];
  }

  const denom = Math.sqrt(
    (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY)
  );
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

/* ── Beta (OLS slope of Y on X returns) ── */

function beta(xReturns: number[], yReturns: number[]): number {
  const n = Math.min(xReturns.length, yReturns.length);
  if (n < 5) return 0;

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += xReturns[i];
    sumY += yReturns[i];
    sumXY += xReturns[i] * yReturns[i];
    sumX2 += xReturns[i] * xReturns[i];
  }

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

/* ── Lead/lag detection (cross-correlation at offsets -5..+5 days) ── */

function bestLeadLag(
  x: number[],
  y: number[],
  maxLag: number = 5
): { lag: number; r: number } {
  let bestLag = 0;
  let bestR = -2;

  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let xSlice: number[], ySlice: number[];
    if (lag >= 0) {
      xSlice = x.slice(0, x.length - lag);
      ySlice = y.slice(lag);
    } else {
      xSlice = x.slice(-lag);
      ySlice = y.slice(0, y.length + lag);
    }
    const r = Math.abs(pearson(xSlice, ySlice));
    if (r > bestR) {
      bestR = r;
      bestLag = lag;
    }
  }

  return { lag: bestLag, r: bestR };
}

/* ── Supabase cache ── */

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function getCached(): Promise<any | null> {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data } = await sb
      .from("correlation_cache")
      .select("data, cached_at")
      .eq("id", "latest")
      .single();
    if (!data) return null;
    const age = Date.now() - new Date(data.cached_at).getTime();
    if (age > 6 * 60 * 60 * 1000) return null; // 6 hour TTL
    return data.data;
  } catch {
    return null;
  }
}

async function setCache(payload: any) {
  const sb = getSupabase();
  if (!sb) return;
  try {
    await sb.from("correlation_cache").upsert({
      id: "latest",
      data: payload,
      cached_at: new Date().toISOString(),
    });
  } catch {}
}

/* ── GET handler ── */

export async function GET() {
  // Check cache
  const cached = await getCached();
  if (cached) {
    return NextResponse.json({ ...cached, source: "cache" });
  }

  // Fetch all histories in parallel
  const histories = await Promise.all(
    UNIVERSE.map(async (u) => {
      const data = await fetchHistory(u.ticker);
      return { ...u, data };
    })
  );

  // Align dates: find common trading dates
  const datesSets = histories
    .filter((h) => h.data.length > 20)
    .map((h) => new Set(h.data.map((d) => d.date)));

  if (datesSets.length < 2) {
    return NextResponse.json({ error: "Insufficient data" }, { status: 500 });
  }

  // Intersect all date sets
  let commonDates = [...datesSets[0]];
  for (let i = 1; i < datesSets.length; i++) {
    commonDates = commonDates.filter((d) => datesSets[i].has(d));
  }
  commonDates.sort();

  // Build aligned close arrays
  const validSymbols: { id: string; label: string; closes: number[] }[] = [];
  for (const h of histories) {
    if (h.data.length < 20) continue;
    const closeMap = new Map(h.data.map((d) => [d.date, d.close]));
    const aligned = commonDates.map((d) => closeMap.get(d)!).filter(Boolean);
    if (aligned.length === commonDates.length) {
      validSymbols.push({ id: h.id, label: h.label, closes: aligned });
    }
  }

  // Compute returns
  const returnsMap = new Map<string, number[]>();
  for (const sym of validSymbols) {
    returnsMap.set(sym.id, dailyReturns(sym.closes));
  }

  // Build correlation matrix (using last ROLLING_WINDOW days of returns)
  const ids = validSymbols.map((s) => s.id);
  const n = ids.length;
  const matrix: number[][] = Array.from({ length: n }, () =>
    Array(n).fill(0)
  );
  const fullReturns = new Map(returnsMap);

  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1.0;
    const ri = fullReturns.get(ids[i])!;
    const riWindow = ri.slice(-ROLLING_WINDOW);

    for (let j = i + 1; j < n; j++) {
      const rj = fullReturns.get(ids[j])!;
      const rjWindow = rj.slice(-ROLLING_WINDOW);
      const r = pearson(riWindow, rjWindow);
      matrix[i][j] = Math.round(r * 1000) / 1000;
      matrix[j][i] = matrix[i][j];
    }
  }

  // Build pairwise details (beta, lead/lag) for significant pairs
  const pairs: {
    from: string;
    to: string;
    correlation30d: number;
    correlation90d: number;
    beta: number;
    leadLag: number;
    leadLagR: number;
  }[] = [];

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const ri = fullReturns.get(ids[i])!;
      const rj = fullReturns.get(ids[j])!;

      const r30 = pearson(ri.slice(-30), rj.slice(-30));
      const r90 = pearson(ri.slice(-90), rj.slice(-90));
      const b = beta(ri.slice(-90), rj.slice(-90));
      const ll = bestLeadLag(ri.slice(-90), rj.slice(-90));

      // Only include pairs with |correlation| > 0.15
      if (Math.abs(r30) > 0.15 || Math.abs(r90) > 0.15) {
        pairs.push({
          from: ids[i],
          to: ids[j],
          correlation30d: Math.round(r30 * 1000) / 1000,
          correlation90d: Math.round(r90 * 1000) / 1000,
          beta: Math.round(b * 1000) / 1000,
          leadLag: ll.lag,
          leadLagR: Math.round(ll.r * 1000) / 1000,
        });
      }
    }
  }

  const result = {
    correlationMatrix: {
      symbols: ids,
      labels: validSymbols.map((s) => s.label),
      matrix,
      period: `${ROLLING_WINDOW}d`,
    },
    pairs,
    dataPoints: commonDates.length,
    dateRange: {
      from: commonDates[0],
      to: commonDates[commonDates.length - 1],
    },
    computedAt: new Date().toISOString(),
  };

  await setCache(result);

  return NextResponse.json(result);
}
