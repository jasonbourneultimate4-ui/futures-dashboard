/**
 * News Sentiment Engine
 *
 * Rule-based NLP for futures-relevant news. No external AI needed.
 * Scores headlines/summaries for:
 *   - sentiment (-100 to +100, per instrument direction)
 *   - impact (high / medium / low)
 *   - category tag
 *
 * Then computes an aggregate News Sentiment Index per instrument.
 */

import type { Instrument } from "./types";

// ── Keyword dictionaries with weights ──

interface SentimentKeyword {
  pattern: RegExp;
  score: number; // positive = bullish, negative = bearish
  impact: number; // 1-3 (low/med/high)
}

// Universal market keywords
const UNIVERSAL_BULLISH: SentimentKeyword[] = [
  { pattern: /\brally\b/i, score: 40, impact: 2 },
  { pattern: /\bsurge[sd]?\b/i, score: 50, impact: 3 },
  { pattern: /\bsoar[sed]?\b/i, score: 50, impact: 3 },
  { pattern: /\bjump[sed]?\b/i, score: 35, impact: 2 },
  { pattern: /\bgain[sed]?\b/i, score: 25, impact: 1 },
  { pattern: /\brise[sd]?\b|\brising\b|\brisen\b/i, score: 20, impact: 1 },
  { pattern: /\bbullish\b/i, score: 45, impact: 2 },
  { pattern: /\boptimis[mt]/i, score: 30, impact: 2 },
  { pattern: /\bupbeat\b/i, score: 25, impact: 1 },
  { pattern: /\brecovery\b|\brecover[sed]?\b/i, score: 30, impact: 2 },
  { pattern: /\bbreakout\b/i, score: 40, impact: 2 },
  { pattern: /\ball[- ]time high/i, score: 55, impact: 3 },
  { pattern: /\brecord high/i, score: 50, impact: 3 },
  { pattern: /\bstrong(?:er)? earning/i, score: 40, impact: 2 },
  { pattern: /\bbeat[s]? (?:estimate|expectation|forecast)/i, score: 45, impact: 3 },
  { pattern: /\brate cut/i, score: 40, impact: 3 },
  { pattern: /\bdovish\b/i, score: 35, impact: 2 },
  { pattern: /\bstimulus\b/i, score: 35, impact: 2 },
  { pattern: /\beasing\b/i, score: 30, impact: 2 },
  { pattern: /\bupgrade[sd]?\b/i, score: 30, impact: 2 },
  { pattern: /\binflow[s]?\b/i, score: 20, impact: 1 },
  { pattern: /\bbuy(?:ing|s)?\b/i, score: 15, impact: 1 },
  { pattern: /\baccumulat/i, score: 20, impact: 1 },
];

const UNIVERSAL_BEARISH: SentimentKeyword[] = [
  { pattern: /\bcrash\b/i, score: -60, impact: 3 },
  { pattern: /\bplunge[sd]?\b/i, score: -55, impact: 3 },
  { pattern: /\bplummet/i, score: -55, impact: 3 },
  { pattern: /\btumble[sd]?\b/i, score: -45, impact: 3 },
  { pattern: /\bsell[- ]?off\b/i, score: -50, impact: 3 },
  { pattern: /\bslump\b/i, score: -40, impact: 2 },
  { pattern: /\bdrop[ps]?\b|\bdropping\b/i, score: -25, impact: 1 },
  { pattern: /\bfall[s]?\b|\bfalling\b|\bfell\b/i, score: -25, impact: 1 },
  { pattern: /\bdecline[sd]?\b/i, score: -25, impact: 1 },
  { pattern: /\bbearish\b/i, score: -45, impact: 2 },
  { pattern: /\bpessimis[mt]/i, score: -30, impact: 2 },
  { pattern: /\bfear[s]?\b/i, score: -30, impact: 2 },
  { pattern: /\bpanic\b/i, score: -50, impact: 3 },
  { pattern: /\brecession/i, score: -45, impact: 3 },
  { pattern: /\bcontraction\b/i, score: -30, impact: 2 },
  { pattern: /\bdefault\b/i, score: -40, impact: 3 },
  { pattern: /\bcrisis\b/i, score: -50, impact: 3 },
  { pattern: /\brate hike/i, score: -35, impact: 3 },
  { pattern: /\bhawkish\b/i, score: -35, impact: 2 },
  { pattern: /\btightening\b/i, score: -25, impact: 2 },
  { pattern: /\binflation (?:rise|surge|spike|high|hot)/i, score: -35, impact: 3 },
  { pattern: /\bdowngrade[sd]?\b/i, score: -30, impact: 2 },
  { pattern: /\boutflow[s]?\b/i, score: -20, impact: 1 },
  { pattern: /\bliquidat/i, score: -35, impact: 2 },
  { pattern: /\bmiss(?:es|ed)? (?:estimate|expectation|forecast)/i, score: -45, impact: 3 },
  { pattern: /\bwarn(?:s|ing|ed)\b/i, score: -25, impact: 2 },
  { pattern: /\buncertainty\b/i, score: -20, impact: 1 },
  { pattern: /\bvolatil/i, score: -15, impact: 1 },
  { pattern: /\btariff/i, score: -25, impact: 2 },
  { pattern: /\bsanction/i, score: -25, impact: 2 },
  { pattern: /\bgeopolitic/i, score: -20, impact: 2 },
  { pattern: /\bwar\b/i, score: -30, impact: 3 },
  { pattern: /\bconflict\b/i, score: -25, impact: 2 },
];

// Instrument-specific keywords (directional context matters)
const INSTRUMENT_KEYWORDS: Record<Instrument, SentimentKeyword[]> = {
  CL: [
    { pattern: /\bopec\+?\s*cut/i, score: 50, impact: 3 },
    { pattern: /\bproduction cut/i, score: 40, impact: 3 },
    { pattern: /\bsupply (?:tight|shortage|deficit|squeeze)/i, score: 45, impact: 3 },
    { pattern: /\bdemand (?:strong|surge|rise|grow)/i, score: 35, impact: 2 },
    { pattern: /\binventory (?:draw|decline|drop|fall)/i, score: 30, impact: 2 },
    { pattern: /\bopec\+?\s*(?:increase|boost|raise)/i, score: -40, impact: 3 },
    { pattern: /\bsupply (?:glut|surplus|excess|flood)/i, score: -45, impact: 3 },
    { pattern: /\bdemand (?:weak|slow|fall|drop)/i, score: -35, impact: 2 },
    { pattern: /\binventory (?:build|rise|surge|increase)/i, score: -30, impact: 2 },
    { pattern: /\bshale\b/i, score: -15, impact: 1 },
    { pattern: /\bpipeline\b/i, score: 10, impact: 1 },
    { pattern: /\brefinery/i, score: 10, impact: 1 },
    { pattern: /\bhurricane/i, score: 25, impact: 2 },
    { pattern: /\bspr\b/i, score: -20, impact: 2 }, // Strategic Petroleum Reserve release
    { pattern: /\beia\b/i, score: 0, impact: 2 },
  ],
  GC: [
    { pattern: /\bsafe[- ]haven/i, score: 40, impact: 2 },
    { pattern: /\bcentral bank[s]? (?:buy|purchas|accumulat)/i, score: 50, impact: 3 },
    { pattern: /\bgold reserve/i, score: 35, impact: 2 },
    { pattern: /\bdollar (?:weak|fall|drop|decline)/i, score: 35, impact: 2 },
    { pattern: /\bdollar (?:strong|rise|rally|surge)/i, score: -35, impact: 2 },
    { pattern: /\breal yield[s]? (?:fall|drop|negative|decline)/i, score: 40, impact: 3 },
    { pattern: /\breal yield[s]? (?:rise|increase|surge|positive)/i, score: -40, impact: 3 },
    { pattern: /\bdebasement\b/i, score: 30, impact: 2 },
    { pattern: /\bde-?dollar/i, score: 35, impact: 2 },
    { pattern: /\binflation hedge/i, score: 30, impact: 2 },
    { pattern: /\betf inflow/i, score: 25, impact: 2 },
    { pattern: /\betf outflow/i, score: -25, impact: 2 },
    { pattern: /\bmining\b/i, score: -10, impact: 1 },
  ],
  ES: [
    { pattern: /\bearnings (?:beat|strong|growth)/i, score: 40, impact: 3 },
    { pattern: /\bearnings (?:miss|weak|disappoint)/i, score: -40, impact: 3 },
    { pattern: /\bjob[s]? (?:growth|gain|add)/i, score: 25, impact: 2 },
    { pattern: /\bunemployment (?:rise|spike|increase)/i, score: -30, impact: 2 },
    { pattern: /\bgdp (?:growth|expand|beat)/i, score: 30, impact: 2 },
    { pattern: /\bgdp (?:contract|shrink|miss)/i, score: -35, impact: 3 },
    { pattern: /\bbuyback/i, score: 20, impact: 1 },
    { pattern: /\bipo\b/i, score: 15, impact: 1 },
    { pattern: /\bm&a\b|\bmerger|acquisition/i, score: 20, impact: 2 },
  ],
  NQ: [
    { pattern: /\bai (?:boom|revolution|breakthrough)/i, score: 45, impact: 3 },
    { pattern: /\bchip[s]? (?:shortage|demand|surge)/i, score: 35, impact: 2 },
    { pattern: /\btech (?:earnings|revenue|growth)/i, score: 35, impact: 2 },
    { pattern: /\bantitrust\b/i, score: -25, impact: 2 },
    { pattern: /\bregulat(?:ion|ory)\b/i, score: -20, impact: 2 },
    { pattern: /\bmagnificent seven/i, score: 20, impact: 2 },
    { pattern: /\bsemiconductor/i, score: 15, impact: 1 },
    { pattern: /\bcloud (?:growth|revenue|spending)/i, score: 30, impact: 2 },
    { pattern: /\bdata center/i, score: 20, impact: 1 },
  ],
  YM: [
    { pattern: /\bmanufactur(?:ing)?\s*(?:grow|expand|pmI|rise)/i, score: 30, impact: 2 },
    { pattern: /\bmanufactur(?:ing)?\s*(?:contract|shrink|decline)/i, score: -30, impact: 2 },
    { pattern: /\bindustrial (?:output|production)/i, score: 15, impact: 1 },
    { pattern: /\binfrastructure\b/i, score: 25, impact: 2 },
    { pattern: /\brotation (?:into|towards?) (?:value|cyclical)/i, score: 30, impact: 2 },
    { pattern: /\brotation (?:out of|from) (?:value|cyclical)/i, score: -25, impact: 2 },
    { pattern: /\btrade (?:deal|agreement)/i, score: 30, impact: 2 },
    { pattern: /\btrade war/i, score: -35, impact: 3 },
  ],
};

// Category detection
const CATEGORY_PATTERNS: { pattern: RegExp; tag: string }[] = [
  { pattern: /\bearning[s]?\b|\brevenue\b|\bprofit\b|\beps\b/i, tag: "EARNINGS" },
  { pattern: /\bfed\b|\bfederal reserve\b|\bfomc\b|\bpowell\b/i, tag: "FED" },
  { pattern: /\bopec/i, tag: "OPEC" },
  { pattern: /\bartificial intelligence\b|\b(?:^|\s)ai\b|\bmachine learning/i, tag: "AI" },
  { pattern: /\bgeopolitic|\bwar\b|\bconflict|\bsanction|\btariff/i, tag: "GEOPOLITICS" },
  { pattern: /\binflation|\bcpi\b|\bpce\b|\bprice index/i, tag: "INFLATION" },
  { pattern: /\bgdp\b|\bjob[s]?\b|\bunemploy|\bpmi\b|\bism\b/i, tag: "MACRO" },
  { pattern: /\betf\b/i, tag: "ETF" },
  { pattern: /\bcentral bank|\becb\b|\bboj\b|\bboe\b|\bpboc/i, tag: "CENTRAL BANK" },
  { pattern: /\binventor(?:y|ies)\b|\beia\b|\bstockpile/i, tag: "INVENTORY" },
  { pattern: /\bsupply\b|\bpipeline|\bproduction\b|\brefiner/i, tag: "SUPPLY" },
  { pattern: /\bdemand\b|\bconsumption|\bimport[s]?\b/i, tag: "DEMAND" },
];

export interface SentimentResult {
  sentimentScore: number; // -100 to +100
  sentimentLabel: "very_bullish" | "bullish" | "neutral" | "bearish" | "very_bearish";
  impactLevel: "high" | "medium" | "low";
  impactScore: number; // 1-3
  tag: string;
  matchedKeywords: string[];
}

/**
 * Analyze a single news item for an instrument
 */
export function analyzeHeadline(
  headline: string,
  summary: string | null,
  instrument: Instrument
): SentimentResult {
  const text = `${headline} ${summary ?? ""}`;
  let totalScore = 0;
  let maxImpact = 1;
  const matchedKeywords: string[] = [];

  // Check universal keywords
  for (const kw of UNIVERSAL_BULLISH) {
    if (kw.pattern.test(text)) {
      totalScore += kw.score;
      maxImpact = Math.max(maxImpact, kw.impact);
      matchedKeywords.push(kw.pattern.source);
    }
  }
  for (const kw of UNIVERSAL_BEARISH) {
    if (kw.pattern.test(text)) {
      totalScore += kw.score; // already negative
      maxImpact = Math.max(maxImpact, kw.impact);
      matchedKeywords.push(kw.pattern.source);
    }
  }

  // Check instrument-specific keywords (weighted 1.5x)
  const instKws = INSTRUMENT_KEYWORDS[instrument] ?? [];
  for (const kw of instKws) {
    if (kw.pattern.test(text)) {
      totalScore += kw.score * 1.5;
      maxImpact = Math.max(maxImpact, kw.impact);
      matchedKeywords.push(kw.pattern.source);
    }
  }

  // Clamp to -100..+100
  const sentimentScore = Math.max(-100, Math.min(100, Math.round(totalScore)));

  // Determine label
  let sentimentLabel: SentimentResult["sentimentLabel"];
  if (sentimentScore >= 40) sentimentLabel = "very_bullish";
  else if (sentimentScore >= 15) sentimentLabel = "bullish";
  else if (sentimentScore <= -40) sentimentLabel = "very_bearish";
  else if (sentimentScore <= -15) sentimentLabel = "bearish";
  else sentimentLabel = "neutral";

  // Impact level
  const impactLevel: SentimentResult["impactLevel"] =
    maxImpact >= 3 ? "high" : maxImpact >= 2 ? "medium" : "low";

  // Category tag
  let tag = "MARKET";
  for (const cat of CATEGORY_PATTERNS) {
    if (cat.pattern.test(text)) {
      tag = cat.tag;
      break;
    }
  }

  return {
    sentimentScore,
    sentimentLabel,
    impactLevel,
    impactScore: maxImpact,
    tag,
    matchedKeywords,
  };
}

/**
 * Compute aggregate News Sentiment Index for an instrument.
 * Weighted by impact and recency (exponential decay over 24h).
 */
export function computeNewsSentimentIndex(
  articles: { sentimentScore: number; impactScore: number; publishedAt: string }[]
): { index: number; label: string; articleCount: number; bullishPct: number; bearishPct: number } {
  if (articles.length === 0) {
    return { index: 0, label: "neutral", articleCount: 0, bullishPct: 0, bearishPct: 0 };
  }

  const now = Date.now();
  let weightedSum = 0;
  let totalWeight = 0;
  let bullish = 0;
  let bearish = 0;

  for (const a of articles) {
    const ageHours = (now - new Date(a.publishedAt).getTime()) / 3_600_000;
    const recencyWeight = Math.exp(-ageHours / 12); // half-life ~8.3 hours
    const impactWeight = a.impactScore; // 1-3
    const weight = recencyWeight * impactWeight;

    weightedSum += a.sentimentScore * weight;
    totalWeight += weight;

    if (a.sentimentScore > 10) bullish++;
    else if (a.sentimentScore < -10) bearish++;
  }

  const index = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
  const clamped = Math.max(-100, Math.min(100, index));

  let label: string;
  if (clamped >= 40) label = "Very Bullish";
  else if (clamped >= 15) label = "Bullish";
  else if (clamped <= -40) label = "Very Bearish";
  else if (clamped <= -15) label = "Bearish";
  else label = "Neutral";

  const total = articles.length;

  return {
    index: clamped,
    label,
    articleCount: total,
    bullishPct: Math.round((bullish / total) * 100),
    bearishPct: Math.round((bearish / total) * 100),
  };
}
