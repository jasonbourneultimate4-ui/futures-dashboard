import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { INSTRUMENTS, type Instrument } from "@/lib/types";

/**
 * GET /api/news?instrument=ES
 *
 * Cache-only: reads news + sentiment from Supabase.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const instrumentParam = searchParams.get("instrument") ?? "ES";
  const instrument = INSTRUMENTS.includes(instrumentParam as Instrument)
    ? (instrumentParam as Instrument)
    : "ES";

  try {
    const supabase = createServiceClient();

    // Fetch news articles with sentiment data
    const { data } = await supabase
      .from("news")
      .select("*")
      .eq("instrument", instrument)
      .order("published_at", { ascending: false })
      .limit(20);

    // Fetch aggregate sentiment index
    const { data: sentimentData } = await supabase
      .from("news_sentiment_cache")
      .select("*")
      .eq("instrument", instrument)
      .single();

    const news = (data ?? []).map((row: any) => ({
      id: row.id,
      instrument: row.instrument,
      headline: row.headline,
      summary: row.summary,
      source: row.source,
      url: row.url,
      publishedAt: row.published_at,
      sentiment: row.sentiment,
      tag: row.tag,
      sentimentScore: row.sentiment_score ?? 0,
      sentimentLabel: row.sentiment_label ?? "neutral",
      impactLevel: row.impact_level ?? "low",
      impactScore: row.impact_score ?? 1,
    }));

    const sentimentIndex = sentimentData
      ? {
          index: sentimentData.sentiment_index,
          label: sentimentData.sentiment_label,
          articleCount: sentimentData.article_count,
          bullishPct: sentimentData.bullish_pct,
          bearishPct: sentimentData.bearish_pct,
          cachedAt: sentimentData.cached_at,
        }
      : null;

    return NextResponse.json({
      instrument,
      news,
      sentimentIndex,
      sources: [],
      cached: true,
    });
  } catch (err) {
    console.error("[news] Cache read error:", err);
    return NextResponse.json({
      instrument,
      news: [],
      sentimentIndex: null,
      sources: [],
      cached: true,
      message: "Cache read error",
    });
  }
}
