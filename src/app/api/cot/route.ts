import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

/**
 * GET /api/cot?instrument=ES
 *
 * Cache-only: reads pre-computed COT data from Supabase.
 * All external API fetching is done by the cron job.
 */
export async function GET(request: NextRequest) {
  const instrument = request.nextUrl.searchParams.get("instrument") ?? "ES";

  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("cot_cache")
      .select("data, cached_at")
      .eq("id", instrument)
      .single();

    if (!data) {
      return NextResponse.json({
        positions: null,
        source: "cache",
        updated: null,
        message: "No COT data cached yet. Waiting for cron job.",
      });
    }

    return NextResponse.json({
      positions: data.data,
      source: "cache",
      updated: data.cached_at,
    });
  } catch {
    return NextResponse.json({
      positions: null,
      source: "cache",
      updated: null,
      message: "No COT data available.",
    });
  }
}
