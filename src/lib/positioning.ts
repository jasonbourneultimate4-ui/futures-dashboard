import type {
  PositioningQuadrant,
  PositioningScore,
  DailyContext,
  COTData,
  Instrument,
  PriceBar,
} from "./types";

/**
 * Determine the positioning quadrant from OI change + price change.
 *
 *   Price ↑  +  OI ↑  =  New Longs (bullish conviction)
 *   Price ↑  +  OI ↓  =  Short Covering (bullish but fading)
 *   Price ↓  +  OI ↑  =  New Shorts (bearish conviction)
 *   Price ↓  +  OI ↓  =  Long Liquidation (bearish but fading)
 */
export function classifyQuadrant(
  priceChange: number,
  oiChange: number
): PositioningQuadrant {
  if (priceChange === 0 && oiChange === 0) return "unknown";
  if (priceChange >= 0 && oiChange >= 0) return "new_longs";
  if (priceChange >= 0 && oiChange < 0) return "short_covering";
  if (priceChange < 0 && oiChange >= 0) return "new_shorts";
  return "long_liquidation";
}

/**
 * Compute a COT bias score from -50 to +50.
 * Based on where the net managed-money position sits relative to
 * its own historical range (percentile rank).
 */
export function computeCOTBias(
  current: COTData,
  history: COTData[]
): number {
  if (history.length < 4) return 0; // not enough history

  const nets = history.map((h) => h.managed_money_net);
  const min = Math.min(...nets);
  const max = Math.max(...nets);
  const range = max - min;

  if (range === 0) return 0;

  // Percentile rank: 0 = at historic low, 1 = at historic high
  const percentile = (current.managed_money_net - min) / range;

  // Map to -50..+50: high percentile = crowded long = positive score
  return Math.round((percentile - 0.5) * 100);
}

/**
 * Price vs VWAP component: +25 when far above, -25 when far below.
 * Uses the last N bars to estimate session VWAP and distance.
 */
export function computePriceVsVwap(bars: PriceBar[]): number {
  if (bars.length < 5) return 0;

  let cumulativeTPV = 0;
  let cumulativeVolume = 0;

  for (const bar of bars) {
    const tp = (bar.high + bar.low + bar.close) / 3;
    cumulativeTPV += tp * bar.volume;
    cumulativeVolume += bar.volume;
  }

  if (cumulativeVolume === 0) return 0;

  const vwap = cumulativeTPV / cumulativeVolume;
  const lastClose = bars[bars.length - 1].close;
  const pctFromVwap = ((lastClose - vwap) / vwap) * 100;

  // Clamp to -25..+25, scaling: 1% from VWAP ≈ 25 points
  return Math.round(Math.max(-25, Math.min(25, pctFromVwap * 25)));
}

/**
 * Volume trend component: is volume increasing or declining?
 * Compares recent N bars average volume to prior N bars.
 * Returns -25..+25.
 */
export function computeVolumeTrend(bars: PriceBar[]): number {
  if (bars.length < 20) return 0;

  const recent = bars.slice(-10);
  const prior = bars.slice(-20, -10);

  const recentAvg = recent.reduce((s, b) => s + b.volume, 0) / recent.length;
  const priorAvg = prior.reduce((s, b) => s + b.volume, 0) / prior.length;

  if (priorAvg === 0) return 0;

  const ratio = (recentAvg - priorAvg) / priorAvg;
  // Positive = increasing volume (conviction), clamped to -25..+25
  return Math.round(Math.max(-25, Math.min(25, ratio * 50)));
}

/**
 * Composite positioning score: -100 to +100.
 * Aggregates all available components.
 */
export function computePositioningScore(
  instrument: Instrument,
  dailyContext: DailyContext | null,
  cotData: COTData | null,
  cotHistory: COTData[],
  recentBars: PriceBar[]
): PositioningScore {
  const oiQuadrant = dailyContext?.quadrant ?? "unknown";
  const cotBias =
    cotData && cotHistory.length > 0
      ? computeCOTBias(cotData, cotHistory)
      : 0;
  const priceVsVwap = computePriceVsVwap(recentBars);
  const volumeTrend = computeVolumeTrend(recentBars);

  const score = Math.max(
    -100,
    Math.min(100, cotBias + priceVsVwap + volumeTrend)
  );

  return {
    instrument,
    score,
    components: {
      oiQuadrant,
      cotBias,
      priceVsVwap,
      volumeTrend,
    },
    timestamp: new Date().toISOString(),
  };
}
