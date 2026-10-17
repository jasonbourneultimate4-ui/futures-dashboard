import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { INSTRUMENTS, type Instrument } from "@/lib/types";

/**
 * GET /api/news?instrument=ES
 *
 * Cache-only: reads news from the Supabase `news` table.
 * All external API fetching is done by the cron job.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const instrumentParam = searchParams.get("instrument") ?? "ES";
  const instrument = INSTRUMENTS.includes(instrumentParam as Instrument)
    ? (instrumentParam as Instrument)
    : "ES";

  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("news")
      .select("*")
      .eq("instrument", instrument)
      .order("published_at", { ascending: false })
      .limit(20);

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
    }));

    return NextResponse.json({
      instrument,
      news,
      sources: [],
      cached: true,
    });
  } catch (err) {
    console.error("[news] Cache read error:", err);
    return NextResponse.json({
      instrument,
      news: [],
      sources: [],
      cached: true,
      message: "Cache read error",
    });
  }
}
