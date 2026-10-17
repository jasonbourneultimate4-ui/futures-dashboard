import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

/**
 * GET /api/supply-chain?instrument=ES
 *
 * Cache-only: reads pre-computed supply chain data from Supabase.
 * All external API fetching is done by the cron job.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const instrument = (searchParams.get("instrument") ?? "ES").toUpperCase();

  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("supply_chain_cache")
      .select("data, cached_at")
      .eq("id", instrument)
      .single();

    if (!data) {
      return NextResponse.json({
        instrument,
        nodes: [],
        updatedAt: null,
        source: "cache",
        message: "No cached data yet. Waiting for next cron run.",
      });
    }

    return NextResponse.json({
      ...data.data,
      source: "cache",
      cachedAt: data.cached_at,
    });
  } catch (err) {
    console.error("[supply-chain] Cache read error:", err);
    return NextResponse.json({
      instrument,
      nodes: [],
      updatedAt: null,
      source: "cache",
      message: "Cache read error",
    });
  }
}
