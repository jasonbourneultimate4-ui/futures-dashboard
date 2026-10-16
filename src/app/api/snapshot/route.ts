import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { INSTRUMENTS, type Instrument, type PriceBar, type DailyContext, type COTData } from "@/lib/types";
import { computePositioningScore } from "@/lib/positioning";
import { buildRegimeSnapshot } from "@/lib/regime";

/**
 * Returns the latest snapshot for all instruments:
 * recent price bars, regime, positioning score.
 * Called by the dashboard on load and on a polling interval.
 */
export async function GET() {
  const supabase = createServiceClient();
  const snapshots: Record<string, any> = {};

  for (const instrument of INSTRUMENTS) {
    // Fetch last 100 price bars
    const { data: bars } = await supabase
      .from("price_bars")
      .select("*")
      .eq("instrument", instrument)
      .order("timestamp", { ascending: true })
      .limit(100);

    const priceBars: PriceBar[] = (bars ?? []) as PriceBar[];

    // Fetch latest daily context
    const { data: dailyRows } = await supabase
      .from("daily_context")
      .select("*")
      .eq("instrument", instrument)
      .order("date", { ascending: false })
      .limit(1);
    const daily: DailyContext | null = (dailyRows?.[0] as DailyContext) ?? null;

    // Fetch COT data (latest + 52-week history)
    const { data: cotRows } = await supabase
      .from("cot_data")
      .select("*")
      .eq("instrument", instrument)
      .order("report_date", { ascending: false })
      .limit(52);
    const cotHistory: COTData[] = (cotRows ?? []) as COTData[];
    const cotCurrent: COTData | null = cotHistory[0] ?? null;

    // Compute positioning score
    const posScore = computePositioningScore(
      instrument,
      daily,
      cotCurrent,
      cotHistory,
      priceBars
    );

    // Build regime snapshot
    const regime = buildRegimeSnapshot(instrument, priceBars, posScore.score);

    snapshots[instrument] = {
      priceBars: priceBars.slice(-50), // last 50 for charts
      regime,
      positioning: posScore,
      dailyContext: daily,
      lastUpdate: new Date().toISOString(),
    };
  }

  return NextResponse.json(snapshots);
}
