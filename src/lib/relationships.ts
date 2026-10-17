import type { Instrument } from "./types";

export interface FactorNode {
  id: string;
  label: string;
  category: "instrument" | "macro" | "commodity" | "currency" | "sentiment" | "fundamental";
  value?: string;
  delta?: string;
  direction?: "up" | "down" | "flat";
}

export interface FactorEdge {
  from: string;
  to: string;
  /** positive = they move together, negative = inverse */
  correlation: "positive" | "negative";
  strength: "strong" | "moderate" | "weak";
  label?: string;
}

export interface RelationshipMap {
  nodes: FactorNode[];
  edges: FactorEdge[];
}

/**
 * Full relationship maps per instrument.
 * "from → to" means "from influences to".
 * Values are seeded with representative data; in production
 * these would come from a live API.
 */
export const RELATIONSHIP_MAPS: Record<Instrument, RelationshipMap> = {
  GC: {
    nodes: [
      { id: "GC", label: "Gold (GC)", category: "instrument", value: "$4,168", delta: "+0.4%", direction: "up" },
      { id: "DXY", label: "US Dollar (DXY)", category: "currency", value: "106.42", delta: "+0.18%", direction: "up" },
      { id: "REAL_YIELD", label: "Real Yield (10Y TIPS)", category: "macro", value: "1.92%", delta: "+4 bps", direction: "up" },
      { id: "FED_RATE", label: "Fed Funds Rate", category: "macro", value: "4.50%", delta: "—", direction: "flat" },
      { id: "CPI", label: "Inflation (CPI YoY)", category: "macro", value: "2.6%", delta: "-0.1%", direction: "down" },
      { id: "SI", label: "Silver (SI)", category: "commodity", value: "$32.14", delta: "+1.2%", direction: "up" },
      { id: "GEOPOLITICS", label: "Geopolitical Risk", category: "sentiment", value: "Elevated", delta: "—", direction: "up" },
      { id: "CB_DEMAND", label: "Central Bank Buying", category: "fundamental", value: "1,037t YTD", delta: "+12%", direction: "up" },
      { id: "ETF_FLOWS", label: "Gold ETF Flows", category: "fundamental", value: "+18.2t", delta: "Oct MTD", direction: "up" },
      { id: "USDJPY", label: "USD/JPY", category: "currency", value: "154.20", delta: "+0.3%", direction: "up" },
      { id: "VIX", label: "VIX", category: "sentiment", value: "14.82", delta: "-0.31", direction: "down" },
      { id: "CL", label: "Crude Oil (CL)", category: "commodity", value: "$94.80", delta: "+0.6%", direction: "up" },
    ],
    edges: [
      // What influences GC
      { from: "DXY", to: "GC", correlation: "negative", strength: "strong", label: "Stronger $ → weaker gold" },
      { from: "REAL_YIELD", to: "GC", correlation: "negative", strength: "strong", label: "Higher real yield → gold less attractive" },
      { from: "FED_RATE", to: "GC", correlation: "negative", strength: "moderate", label: "Higher rates → opportunity cost" },
      { from: "CPI", to: "GC", correlation: "positive", strength: "moderate", label: "Higher inflation → gold hedge demand" },
      { from: "GEOPOLITICS", to: "GC", correlation: "positive", strength: "strong", label: "Risk events → safe haven flows" },
      { from: "CB_DEMAND", to: "GC", correlation: "positive", strength: "strong", label: "Central bank buying supports price" },
      { from: "ETF_FLOWS", to: "GC", correlation: "positive", strength: "moderate", label: "ETF inflows = investment demand" },
      { from: "VIX", to: "GC", correlation: "positive", strength: "moderate", label: "Fear → flight to safety" },
      // What GC influences
      { from: "GC", to: "SI", correlation: "positive", strength: "strong", label: "Gold leads silver" },
      { from: "GC", to: "USDJPY", correlation: "negative", strength: "weak", label: "Gold up → yen strengthens vs $" },
      // Cross-factor connections
      { from: "FED_RATE", to: "REAL_YIELD", correlation: "positive", strength: "strong" },
      { from: "FED_RATE", to: "DXY", correlation: "positive", strength: "moderate" },
      { from: "CPI", to: "REAL_YIELD", correlation: "negative", strength: "moderate" },
      { from: "CL", to: "CPI", correlation: "positive", strength: "moderate", label: "Energy costs feed inflation" },
    ],
  },

  ES: {
    nodes: [
      { id: "ES", label: "S&P 500 (ES)", category: "instrument", value: "7,744", delta: "+0.3%", direction: "up" },
      { id: "US10Y", label: "10Y Treasury Yield", category: "macro", value: "4.87%", delta: "+3.2 bps", direction: "up" },
      { id: "FED_RATE", label: "Fed Funds Rate", category: "macro", value: "4.50%", delta: "—", direction: "flat" },
      { id: "VIX", label: "VIX", category: "sentiment", value: "14.82", delta: "-0.31", direction: "down" },
      { id: "DXY", label: "US Dollar (DXY)", category: "currency", value: "106.42", delta: "+0.18%", direction: "up" },
      { id: "EARNINGS", label: "S&P 500 EPS (fwd)", category: "fundamental", value: "$268", delta: "+2.1%", direction: "up" },
      { id: "PMI", label: "ISM PMI Mfg", category: "macro", value: "55.0", delta: "+0.8", direction: "up" },
      { id: "CLAIMS", label: "Jobless Claims", category: "macro", value: "200K", delta: "-5K", direction: "down" },
      { id: "NQ", label: "Nasdaq (NQ)", category: "instrument", value: "26,713", delta: "+0.5%", direction: "up" },
      { id: "CPI", label: "Inflation (CPI YoY)", category: "macro", value: "2.6%", delta: "-0.1%", direction: "down" },
      { id: "CREDIT", label: "IG Credit Spread", category: "sentiment", value: "82 bps", delta: "-2 bps", direction: "down" },
      { id: "USDJPY", label: "USD/JPY", category: "currency", value: "154.20", delta: "+0.3%", direction: "up" },
    ],
    edges: [
      { from: "US10Y", to: "ES", correlation: "negative", strength: "moderate", label: "Higher yields → equity discount" },
      { from: "FED_RATE", to: "ES", correlation: "negative", strength: "moderate", label: "Rate hikes → tighter liquidity" },
      { from: "VIX", to: "ES", correlation: "negative", strength: "strong", label: "Fear gauge inverse to stocks" },
      { from: "EARNINGS", to: "ES", correlation: "positive", strength: "strong", label: "Earnings growth drives index" },
      { from: "PMI", to: "ES", correlation: "positive", strength: "moderate", label: "Manufacturing expansion → bullish" },
      { from: "CLAIMS", to: "ES", correlation: "negative", strength: "weak", label: "Rising claims → recession fear" },
      { from: "CPI", to: "ES", correlation: "negative", strength: "moderate", label: "Hot inflation → hawkish Fed fear" },
      { from: "CREDIT", to: "ES", correlation: "negative", strength: "moderate", label: "Widening spreads → risk-off" },
      { from: "DXY", to: "ES", correlation: "negative", strength: "weak", label: "Strong $ → multinational headwind" },
      // What ES influences
      { from: "ES", to: "NQ", correlation: "positive", strength: "strong", label: "Broad market leads tech" },
      { from: "ES", to: "VIX", correlation: "negative", strength: "strong", label: "Stocks up → vol crushed" },
      { from: "ES", to: "USDJPY", correlation: "positive", strength: "moderate", label: "Risk-on → carry trade" },
      // Cross-factor
      { from: "FED_RATE", to: "US10Y", correlation: "positive", strength: "strong" },
      { from: "CPI", to: "FED_RATE", correlation: "positive", strength: "moderate" },
    ],
  },

  NQ: {
    nodes: [
      { id: "NQ", label: "Nasdaq (NQ)", category: "instrument", value: "26,713", delta: "+0.5%", direction: "up" },
      { id: "US10Y", label: "10Y Treasury Yield", category: "macro", value: "4.87%", delta: "+3.2 bps", direction: "up" },
      { id: "SOX", label: "SOX Semiconductor", category: "instrument", value: "5,842", delta: "+1.2%", direction: "up" },
      { id: "NVDA", label: "NVDA", category: "fundamental", value: "$892.10", delta: "+1.8%", direction: "up" },
      { id: "AAPL", label: "AAPL", category: "fundamental", value: "$287.40", delta: "+0.6%", direction: "up" },
      { id: "VIX", label: "VIX", category: "sentiment", value: "14.82", delta: "-0.31", direction: "down" },
      { id: "DXY", label: "US Dollar (DXY)", category: "currency", value: "106.42", delta: "+0.18%", direction: "up" },
      { id: "AI_CAPEX", label: "AI CapEx Trend", category: "fundamental", value: "$220B est.", delta: "+35% YoY", direction: "up" },
      { id: "USDJPY", label: "USD/JPY", category: "currency", value: "154.20", delta: "+0.3%", direction: "up" },
      { id: "ES", label: "S&P 500 (ES)", category: "instrument", value: "7,744", delta: "+0.3%", direction: "up" },
      { id: "FED_RATE", label: "Fed Funds Rate", category: "macro", value: "4.50%", delta: "—", direction: "flat" },
      { id: "CLOUD_REV", label: "Cloud Revenue Growth", category: "fundamental", value: "+22% YoY", delta: "Accel.", direction: "up" },
    ],
    edges: [
      { from: "US10Y", to: "NQ", correlation: "negative", strength: "strong", label: "Long-duration equity hit by yields" },
      { from: "SOX", to: "NQ", correlation: "positive", strength: "strong", label: "Semis lead tech sentiment" },
      { from: "NVDA", to: "NQ", correlation: "positive", strength: "strong", label: "Largest NQ weight, AI bellwether" },
      { from: "AAPL", to: "NQ", correlation: "positive", strength: "moderate", label: "Top NQ constituent" },
      { from: "VIX", to: "NQ", correlation: "negative", strength: "strong", label: "Fear → tech sell-off" },
      { from: "AI_CAPEX", to: "NQ", correlation: "positive", strength: "strong", label: "AI investment boom lifts tech" },
      { from: "CLOUD_REV", to: "NQ", correlation: "positive", strength: "moderate", label: "Cloud growth → SaaS/infra rally" },
      { from: "DXY", to: "NQ", correlation: "negative", strength: "moderate", label: "Strong $ → tech export headwind" },
      { from: "FED_RATE", to: "NQ", correlation: "negative", strength: "moderate", label: "Rate hikes discount growth stocks" },
      // What NQ influences
      { from: "NQ", to: "USDJPY", correlation: "positive", strength: "moderate", label: "Tech rally → risk-on carry" },
      { from: "NQ", to: "ES", correlation: "positive", strength: "strong", label: "Tech weight pulls S&P" },
      // Cross-factor
      { from: "NVDA", to: "SOX", correlation: "positive", strength: "strong" },
      { from: "FED_RATE", to: "US10Y", correlation: "positive", strength: "strong" },
    ],
  },

  CL: {
    nodes: [
      { id: "CL", label: "Crude Oil (CL)", category: "instrument", value: "$94.80", delta: "+0.6%", direction: "up" },
      { id: "OPEC_PROD", label: "OPEC+ Production", category: "fundamental", value: "27.8M b/d", delta: "+0.2M", direction: "up" },
      { id: "EIA_INV", label: "EIA Inventories", category: "fundamental", value: "-1.4M bbl", delta: "Draw", direction: "down" },
      { id: "DXY", label: "US Dollar (DXY)", category: "currency", value: "106.42", delta: "+0.18%", direction: "up" },
      { id: "DEMAND", label: "Global Oil Demand", category: "fundamental", value: "103.1M b/d", delta: "+0.4", direction: "up" },
      { id: "GEOPOLITICS", label: "Geopolitical Risk", category: "sentiment", value: "Elevated", delta: "—", direction: "up" },
      { id: "BRENT", label: "Brent Spread", category: "commodity", value: "$3.12", delta: "-$0.08", direction: "down" },
      { id: "RIG_COUNT", label: "US Rig Count", category: "fundamental", value: "482", delta: "-3", direction: "down" },
      { id: "CHINA_PMI", label: "China Mfg PMI", category: "macro", value: "50.3", delta: "+0.2", direction: "up" },
      { id: "SPR", label: "US SPR Level", category: "fundamental", value: "372M bbl", delta: "Flat", direction: "flat" },
      { id: "CPI", label: "Inflation (CPI YoY)", category: "macro", value: "2.6%", delta: "-0.1%", direction: "down" },
      { id: "GC", label: "Gold (GC)", category: "commodity", value: "$4,168", delta: "+0.4%", direction: "up" },
    ],
    edges: [
      { from: "OPEC_PROD", to: "CL", correlation: "negative", strength: "strong", label: "More supply → lower price" },
      { from: "EIA_INV", to: "CL", correlation: "negative", strength: "moderate", label: "Inventory draws → bullish" },
      { from: "DXY", to: "CL", correlation: "negative", strength: "moderate", label: "Strong $ → oil cheaper globally" },
      { from: "DEMAND", to: "CL", correlation: "positive", strength: "strong", label: "Demand growth supports price" },
      { from: "GEOPOLITICS", to: "CL", correlation: "positive", strength: "strong", label: "Supply disruption risk premium" },
      { from: "RIG_COUNT", to: "CL", correlation: "negative", strength: "moderate", label: "More rigs → future supply" },
      { from: "CHINA_PMI", to: "CL", correlation: "positive", strength: "moderate", label: "China growth = top consumer" },
      { from: "SPR", to: "CL", correlation: "negative", strength: "weak", label: "SPR releases add supply" },
      // What CL influences
      { from: "CL", to: "CPI", correlation: "positive", strength: "strong", label: "Energy costs feed inflation" },
      { from: "CL", to: "BRENT", correlation: "positive", strength: "strong", label: "WTI-Brent linked" },
      { from: "CL", to: "GC", correlation: "positive", strength: "weak", label: "Oil inflation → gold hedge" },
      // Cross-factor
      { from: "CHINA_PMI", to: "DEMAND", correlation: "positive", strength: "moderate" },
      { from: "GEOPOLITICS", to: "OPEC_PROD", correlation: "negative", strength: "moderate" },
    ],
  },
};

/** Category colors for node styling */
export const CATEGORY_COLORS: Record<FactorNode["category"], string> = {
  instrument: "#58a6ff",
  macro: "#f0883e",
  commodity: "#d29922",
  currency: "#3fb950",
  sentiment: "#f778ba",
  fundamental: "#a371f7",
};
