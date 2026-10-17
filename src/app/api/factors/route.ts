import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

/**
 * GET /api/factors
 *
 * Cache-only: reads pre-computed factor data from Supabase.
 * All external API fetching is done by the cron job.
 */
export async function GET() {
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("factor_cache")
      .select("data, cached_at")
      .eq("id", "latest")
      .single();

    if (!data) {
      return NextResponse.json({
        factors: {},
        source: "cache",
        updated: null,
        message: "No cached data yet. Waiting for next cron run.",
      });
    }

    return NextResponse.json({
      factors: data.data,
      source: "cache",
      updated: data.cached_at,
    });
  } catch (err) {
    console.error("[factors] Cache read error:", err);
    return NextResponse.json({
      factors: {},
      source: "cache",
      updated: null,
      message: "Cache read error",
    });
  }
}
