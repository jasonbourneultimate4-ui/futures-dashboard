import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import {
  INSTRUMENTS,
  NEWS_KEYWORDS,
  type Instrument,
  type NewsItem,
} from "@/lib/types";

/**
 * GET /api/news?instrument=ES
 * Fetches news from multiple free APIs with fallback chain:
 * 1. Finnhub (60 req/min free) — general market news
 * 2. Alpha Vantage (25 req/day free) — news with sentiment
 * 3. NewsData.io (200 req/day free) — broad financial news
 *
 * Returns cached results from Supabase if APIs are exhausted.
 */

// ── Finnhub ──
async function fetchFinnhub(instrument: Instrument): Promise<NewsItem[]> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return [];

  try {
    const category = instrument === "CL" || instrument === "GC" ? "forex" : "general";
    const res = await fetch(
      `https://finnhub.io/api/v1/news?category=${category}&token=${key}`,
      { next: { revalidate: 0 } }
    );
    if (!res.ok) return [];

    const data = await res.json();
    if (!Array.isArray(data)) return [];

    const keywords = NEWS_KEYWORDS[instrument].map((k) => k.toLowerCase());

    return data
      .filter((item: any) => {
        const text = `${item.headline} ${item.summary}`.toLowerCase();
        return keywords.some((kw) => text.includes(kw));
      })
      .slice(0, 15)
      .map((item: any, i: number) => ({
        id: `fh-${instrument}-${i}`,
        instrument,
        headline: item.headline,
        summary: item.summary,
        source: item.source,
        url: item.url,
        publishedAt: new Date(item.datetime * 1000).toISOString(),
        sentiment: "neutral" as const,
        tag: guessTag(item.headline),
      }));
  } catch {
    return [];
  }
}

// ── Alpha Vantage ──
async function fetchAlphaVantage(instrument: Instrument): Promise<NewsItem[]> {
  const key = process.env.ALPHA_VANTAGE_API_KEY;
  if (!key) return [];

  const tickerMap: Record<Instrument, string> = {
    ES: "SPY",
    NQ: "QQQ",
    YM: "DIA",
    CL: "USO",
    GC: "GLD",
  };

  try {
    const res = await fetch(
      `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${tickerMap[instrument]}&limit=15&apikey=${key}`,
      { next: { revalidate: 0 } }
    );
    if (!res.ok) return [];

    const data = await res.json();
    const feed = data.feed;
    if (!Array.isArray(feed)) return [];

    return feed.slice(0, 15).map((item: any, i: number) => {
      const sentScore = parseFloat(item.overall_sentiment_score ?? "0");
      const sentiment: NewsItem["sentiment"] =
        sentScore > 0.15 ? "positive" : sentScore < -0.15 ? "negative" : "neutral";

      return {
        id: `av-${instrument}-${i}`,
        instrument,
        headline: item.title,
        summary: item.summary,
        source: item.source,
        url: item.url,
        publishedAt: formatAVDate(item.time_published),
        sentiment,
        tag: guessTag(item.title),
      };
    });
  } catch {
    return [];
  }
}

// ── NewsData.io ──
async function fetchNewsData(instrument: Instrument): Promise<NewsItem[]> {
  const key = process.env.NEWSDATA_API_KEY;
  if (!key) return [];

  const query = NEWS_KEYWORDS[instrument].slice(0, 2).join(" OR ");

  try {
    const res = await fetch(
      `https://newsdata.io/api/1/latest?apikey=${key}&q=${encodeURIComponent(query)}&category=business&language=en&size=10`,
      { next: { revalidate: 0 } }
    );
    if (!res.ok) return [];

    const data = await res.json();
    const results = data.results;
    if (!Array.isArray(results)) return [];

    return results.map((item: any, i: number) => ({
      id: `nd-${instrument}-${i}`,
      instrument,
      headline: item.title,
      summary: item.description,
      source: item.source_name ?? item.source_id ?? "NewsData",
      url: item.link,
      publishedAt: item.pubDate ?? new Date().toISOString(),
      sentiment: item.sentiment as NewsItem["sentiment"] ?? "neutral",
      tag: guessTag(item.title),
    }));
  } catch {
    return [];
  }
}

// ── Tag guesser ──
function guessTag(headline: string): string {
  const h = headline.toLowerCase();
  if (h.includes("earning") || h.includes("eps") || h.includes("revenue")) return "EARNINGS";
  if (h.includes("fed ") || h.includes("fomc") || h.includes("rate cut") || h.includes("rate hike")) return "FED";
  if (h.includes("opec")) return "OPEC";
  if (h.includes("ai ") || h.includes("artificial intelligence") || h.includes("chatgpt") || h.includes("nvidia")) return "AI";
  if (h.includes("geopoliti") || h.includes("war") || h.includes("sanction") || h.includes("iran") || h.includes("russia")) return "GEOPOLITICS";
  if (h.includes("inflation") || h.includes("cpi") || h.includes("ppi") || h.includes("pce")) return "INFLATION";
  if (h.includes("gdp") || h.includes("pmi") || h.includes("jobs") || h.includes("payroll") || h.includes("unemployment")) return "MACRO";
  if (h.includes("etf") || h.includes("inflow") || h.includes("outflow")) return "ETF";
  if (h.includes("central bank") || h.includes("pboc") || h.includes("ecb") || h.includes("boj")) return "CENTRAL BANK";
  if (h.includes("inventory") || h.includes("stockpile") || h.includes("eia")) return "INVENTORY";
  if (h.includes("supply") || h.includes("production") || h.includes("output")) return "SUPPLY";
  if (h.includes("demand") || h.includes("consumption")) return "DEMAND";
  return "MARKET";
}

// ── Alpha Vantage date parser ──
function formatAVDate(d: string): string {
  // Format: "20261016T143000"
  if (!d || d.length < 15) return new Date().toISOString();
  const year = d.slice(0, 4);
  const month = d.slice(4, 6);
  const day = d.slice(6, 8);
  const hour = d.slice(9, 11);
  const min = d.slice(11, 13);
  const sec = d.slice(13, 15);
  return new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}Z`).toISOString();
}

// ── Cache to Supabase ──
async function cacheNews(items: NewsItem[]) {
  if (items.length === 0) return;
  try {
    const supabase = createServiceClient();
    const rows = items.map((n) => ({
      id: n.id,
      instrument: n.instrument,
      headline: n.headline,
      summary: n.summary ?? null,
      source: n.source,
      url: n.url ?? null,
      published_at: n.publishedAt,
      sentiment: n.sentiment ?? "neutral",
      tag: n.tag ?? "MARKET",
    }));
    await supabase.from("news").upsert(rows, { onConflict: "id" });
  } catch {
    // Cache failure is non-fatal
  }
}

// ── Fallback: read cached news ──
async function getCachedNews(instrument: Instrument): Promise<NewsItem[]> {
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("news")
      .select("*")
      .eq("instrument", instrument)
      .order("published_at", { ascending: false })
      .limit(15);

    if (!data || data.length === 0) return [];
    return data.map((row: any) => ({
      id: row.id,
      instrument: row.instrument,
      headline: row.headline,
      summary: row.summary,
      source: row.source,
      url: row.url,
      publishedAt: row.published_at,
      sentiment: row.sentiment,
      tag: row.tag,
    }));
  } catch {
    return [];
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const instrumentParam = searchParams.get("instrument") ?? "ES";
  const instrument = INSTRUMENTS.includes(instrumentParam as Instrument)
    ? (instrumentParam as Instrument)
    : "ES";

  // Try APIs in order, merge and dedupe
  const [finnhubNews, avNews, ndNews] = await Promise.allSettled([
    fetchFinnhub(instrument),
    fetchAlphaVantage(instrument),
    fetchNewsData(instrument),
  ]);

  const allNews: NewsItem[] = [];
  const seenHeadlines = new Set<string>();

  for (const result of [finnhubNews, avNews, ndNews]) {
    if (result.status === "fulfilled") {
      for (const item of result.value) {
        const key = item.headline.toLowerCase().slice(0, 60);
        if (!seenHeadlines.has(key)) {
          seenHeadlines.add(key);
          allNews.push(item);
        }
      }
    }
  }

  // Sort by date descending
  allNews.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  const finalNews = allNews.slice(0, 20);

  // Cache to Supabase in background
  cacheNews(finalNews);

  // If no live news, fall back to cache
  if (finalNews.length === 0) {
    const cached = await getCachedNews(instrument);
    return NextResponse.json({
      instrument,
      news: cached,
      sources: [],
      cached: true,
    });
  }

  const sources = [
    finnhubNews.status === "fulfilled" && finnhubNews.value.length > 0 ? "Finnhub" : null,
    avNews.status === "fulfilled" && avNews.value.length > 0 ? "Alpha Vantage" : null,
    ndNews.status === "fulfilled" && ndNews.value.length > 0 ? "NewsData.io" : null,
  ].filter(Boolean);

  return NextResponse.json({
    instrument,
    news: finalNews,
    sources,
    cached: false,
  });
}
