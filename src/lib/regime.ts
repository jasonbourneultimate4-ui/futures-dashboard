import type { MarketRegime, PriceBar, RegimeSnapshot, Instrument } from "./types";

/**
 * Compute ADX from price bars using Wilder's smoothing.
 * Returns the current ADX value (0-100).
 */
export function computeADX(bars: PriceBar[], period: number = 14): number {
  if (bars.length < period * 2 + 1) return 0;

  const trueRanges: number[] = [];
  const plusDMs: number[] = [];
  const minusDMs: number[] = [];

  for (let i = 1; i < bars.length; i++) {
    const high = bars[i].high;
    const low = bars[i].low;
    const prevClose = bars[i - 1].close;
    const prevHigh = bars[i - 1].high;
    const prevLow = bars[i - 1].low;

    trueRanges.push(
      Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose))
    );

    const upMove = high - prevHigh;
    const downMove = prevLow - low;

    plusDMs.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDMs.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  // Wilder's smoothing for first period
  let smoothedTR = trueRanges.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothedPlusDM = plusDMs.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothedMinusDM = minusDMs.slice(0, period).reduce((a, b) => a + b, 0);

  const dxValues: number[] = [];

  for (let i = period; i < trueRanges.length; i++) {
    smoothedTR = smoothedTR - smoothedTR / period + trueRanges[i];
    smoothedPlusDM = smoothedPlusDM - smoothedPlusDM / period + plusDMs[i];
    smoothedMinusDM = smoothedMinusDM - smoothedMinusDM / period + minusDMs[i];

    const plusDI = smoothedTR > 0 ? (smoothedPlusDM / smoothedTR) * 100 : 0;
    const minusDI = smoothedTR > 0 ? (smoothedMinusDM / smoothedTR) * 100 : 0;
    const diSum = plusDI + minusDI;
    const dx = diSum > 0 ? (Math.abs(plusDI - minusDI) / diSum) * 100 : 0;

    dxValues.push(dx);
  }

  if (dxValues.length < period) return 0;

  // ADX = Wilder's smoothed average of DX
  let adx = dxValues.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < dxValues.length; i++) {
    adx = (adx * (period - 1) + dxValues[i]) / period;
  }

  return Math.round(adx * 10) / 10;
}

/**
 * Compute VWAP slope over the last N bars.
 * Positive = VWAP rising, Negative = VWAP falling.
 */
export function computeVWAPSlope(bars: PriceBar[], lookback: number = 20): number {
  if (bars.length < lookback + 5) return 0;

  const calcVWAP = (subset: PriceBar[]): number => {
    let tpv = 0;
    let vol = 0;
    for (const b of subset) {
      const tp = (b.high + b.low + b.close) / 3;
      tpv += tp * b.volume;
      vol += b.volume;
    }
    return vol > 0 ? tpv / vol : 0;
  };

  const recentVWAP = calcVWAP(bars.slice(-lookback));
  const priorVWAP = calcVWAP(bars.slice(-(lookback * 2), -lookback));

  if (priorVWAP === 0) return 0;

  return ((recentVWAP - priorVWAP) / priorVWAP) * 10000; // basis points
}

/**
 * Classify the market regime from ADX and VWAP slope.
 */
export function classifyRegime(adx: number, vwapSlope: number): MarketRegime {
  // Transitional: ADX between 15 and 25 with no clear slope
  if (adx >= 15 && adx <= 25 && Math.abs(vwapSlope) < 5) return "transitional";

  // Ranging: ADX below 20
  if (adx < 20) return "range";

  // Trending: ADX above 25
  if (adx >= 25) {
    if (vwapSlope > 10) return "strong_uptrend";
    if (vwapSlope > 0) return "uptrend";
    if (vwapSlope < -10) return "strong_downtrend";
    if (vwapSlope < 0) return "downtrend";
  }

  // Moderate trend: ADX 20-25
  if (vwapSlope > 0) return "uptrend";
  if (vwapSlope < 0) return "downtrend";

  return "range";
}

/**
 * Build a full regime snapshot for an instrument.
 */
export function buildRegimeSnapshot(
  instrument: Instrument,
  bars: PriceBar[],
  positioningScore: number
): RegimeSnapshot {
  const adx = computeADX(bars);
  const vwapSlope = computeVWAPSlope(bars);
  const regime = classifyRegime(adx, vwapSlope);

  return {
    instrument,
    regime,
    adx,
    vwapSlope: Math.round(vwapSlope * 100) / 100,
    positioningScore,
    timestamp: new Date().toISOString(),
  };
}
