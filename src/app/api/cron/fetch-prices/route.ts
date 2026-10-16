import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { INSTRUMENTS, INSTRUMENT_META, type Instrument } from "@/lib/types";

/**
 * Cron job: fetch 15-min delayed futures prices from Yahoo Finance
 * and store in Supabase. Runs every 15 minutes via Vercel cron.
 */
async function fetchYahooQuote(symbol: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=15m&range=5d`;
  const res = await fetch(url, {
    headers: { "User-Agent": "futures-dashboard/1.0" },
    next: { revalidate: 0 },
  });

  if (!res.ok) throw new Error(`Yahoo ${symbol}: ${res.status}`);

  const json = await res.json();
  const result = json.chart?.result?.[0];
  if (!result) throw new Error(`Yahoo ${symbol}: no data`);

  const timestamps: number[] = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0] ?? {};
  const opens: number[] = quote.open ?? [];
  const highs: number[] = quote.high ?? [];
  const lows: number[] = quote.low ?? [];
  const closes: number[] = quote.close ?? [];
  const volumes: number[] = quote.volume ?? [];

  return timestamps.map((ts, i) => ({
    timestamp: new Date(ts * 1000).toISOString(),
    open: opens[i] ?? 0,
    high: highs[i] ?? 0,
    low: lows[i] ?? 0,
    close: closes[i] ?? 0,
    volume: volumes[i] ?? 0,
  }));
}

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const results: Record<string, number> = {};

  for (const instrument of INSTRUMENTS) {
    try {
      const meta = INSTRUMENT_META[instrument];
      const bars = await fetchYahooQuote(meta.yahoo);

      if (bars.length === 0) continue;

      // Upsert bars (on conflict: instrument + timestamp)
      const rows = bars.map((b) => ({
        instrument,
        timestamp: b.timestamp,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: b.volume,
      }));

      const { error } = await supabase
        .from("price_bars")
        .upsert(rows, { onConflict: "instrument,timestamp" });

      if (error) throw error;
      results[instrument] = bars.length;
    } catch (err: any) {
      results[instrument] = -1;
      console.error(`[fetch-prices] ${instrument}:`, err.message);
    }
  }

  return NextResponse.json({ ok: true, results, fetched_at: new Date().toISOString() });
}
