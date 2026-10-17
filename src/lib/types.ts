// ── Instruments ──
export type Instrument = "ES" | "NQ" | "YM" | "CL" | "GC";

export const INSTRUMENTS: Instrument[] = ["ES", "NQ", "YM", "CL", "GC"];

export const INSTRUMENT_META: Record<
  Instrument,
  { name: string; yahoo: string; tickSize: number; tickValue: number }
> = {
  ES: { name: "E-mini S&P 500", yahoo: "ES=F", tickSize: 0.25, tickValue: 12.5 },
  NQ: { name: "E-mini Nasdaq 100", yahoo: "NQ=F", tickSize: 0.25, tickValue: 5.0 },
  YM: { name: "E-mini Dow", yahoo: "YM=F", tickSize: 1.0, tickValue: 5.0 },
  CL: { name: "Crude Oil", yahoo: "CL=F", tickSize: 0.01, tickValue: 10.0 },
  GC: { name: "Gold", yahoo: "GC=F", tickSize: 0.1, tickValue: 10.0 },
};

// ── Price data (15-min candles) ──
export interface PriceBar {
  id?: number;
  instrument: Instrument;
  timestamp: string; // ISO
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ── Daily context (OI + price change → positioning quadrant) ──
export type PositioningQuadrant =
  | "new_longs"
  | "short_covering"
  | "new_shorts"
  | "long_liquidation"
  | "unknown";

export interface DailyContext {
  id?: number;
  instrument: Instrument;
  date: string; // YYYY-MM-DD
  open_interest: number;
  oi_change: number;
  price_change: number;
  quadrant: PositioningQuadrant;
}

// ── Weekly COT data ──
export interface COTData {
  id?: number;
  instrument: Instrument;
  report_date: string; // YYYY-MM-DD (Tuesday)
  managed_money_long: number;
  managed_money_short: number;
  managed_money_net: number;
  commercial_long: number;
  commercial_short: number;
  commercial_net: number;
  small_spec_long: number;
  small_spec_short: number;
  small_spec_net: number;
}

// ── Market regime ──
export type MarketRegime =
  | "strong_uptrend"
  | "uptrend"
  | "range"
  | "downtrend"
  | "strong_downtrend"
  | "transitional";

export interface RegimeSnapshot {
  instrument: Instrument;
  regime: MarketRegime;
  adx: number;
  vwapSlope: number;
  positioningScore: number; // -100 to +100
  timestamp: string;
}

// ── Composite positioning score ──
export interface PositioningScore {
  instrument: Instrument;
  score: number; // -100 (crowded short) to +100 (crowded long)
  components: {
    oiQuadrant: PositioningQuadrant;
    cotBias: number; // -50 to +50
    priceVsVwap: number; // -25 to +25
    volumeTrend: number; // -25 to +25
  };
  timestamp: string;
}

// ── News ──
export interface NewsItem {
  id: string;
  instrument: Instrument | "ALL";
  headline: string;
  summary?: string;
  source: string;
  url?: string;
  publishedAt: string; // ISO
  sentiment?: "positive" | "negative" | "neutral";
  tag?: string; // e.g. "EARNINGS", "MACRO", "OPEC"
}

// ── Fundamentals ──
export interface FundamentalItem {
  label: string;
  value: string;
  delta?: string;
  direction?: "bull" | "bear" | "neutral";
}

// ── News search keywords per instrument ──
export const NEWS_KEYWORDS: Record<Instrument, string[]> = {
  ES: ["S&P 500", "SPX", "stock market", "Wall Street", "Fed", "interest rate"],
  NQ: ["Nasdaq", "tech stocks", "semiconductor", "AI stocks", "FAANG"],
  YM: ["Dow Jones", "DJIA", "Dow futures", "blue chip", "industrials"],
  CL: ["crude oil", "WTI", "OPEC", "oil price", "petroleum", "energy"],
  GC: ["gold", "bullion", "precious metals", "gold price", "safe haven"],
};

// ── Dashboard layout ──
export interface PanelConfig {
  id: string;
  title: string;
  type: "price_chart" | "positioning" | "regime" | "cot" | "oi_quadrant" | "score_gauge" | "alerts";
  instrument?: Instrument;
  span?: number; // grid columns (1-4)
}
