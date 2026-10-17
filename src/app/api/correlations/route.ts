import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

/**
 * GET /api/correlations
 *
 * Cache-only: reads pre-computed correlation matrix from Supabase.
 * All external API fetching is done by the cron job.
 */
export async function GET() {
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("correlation_cache")
      .select("data, cached_at")
      .eq("id", "latest")
      .single();

    if (!data) {
      return NextResponse.json({
        error: "No cached data yet. Waiting for next cron run.",
        source: "cache",
      });
    }

    return NextResponse.json({
      ...data.data,
      source: "cache",
      cachedAt: data.cached_at,
    });
  } catch (err) {
    console.error("[correlations] Cache read error:", err);
    return NextResponse.json({
      error: "Cache read error",
      source: "cache",
    });
  }
}
