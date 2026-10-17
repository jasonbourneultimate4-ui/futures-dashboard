"use client";

import { useEffect, useState } from "react";
import type { Instrument } from "@/lib/types";

interface AnalyzedNewsItem {
  id: string;
  instrument: string;
  headline: string;
  summary?: string;
  source: string;
  url?: string;
  publishedAt: string;
  sentiment?: string;
  tag?: string;
  sentimentScore: number;
  sentimentLabel: string;
  impactLevel: string;
  impactScore: number;
}

interface SentimentIndex {
  index: number;
  label: string;
  articleCount: number;
  bullishPct: number;
  bearishPct: number;
  cachedAt: string;
}

const TAG_COLORS: Record<string, string> = {
  EARNINGS: "#58a6ff",
  FED: "#f0883e",
  OPEC: "#d29922",
  AI: "#a371f7",
  GEOPOLITICS: "#f778ba",
  INFLATION: "#f85149",
  MACRO: "#8b949e",
  ETF: "#58a6ff",
  "CENTRAL BANK": "#d29922",
  INVENTORY: "#58a6ff",
  SUPPLY: "#f85149",
  DEMAND: "#3fb950",
  MARKET: "#8b949e",
};

const IMPACT_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  high:   { label: "HIGH",   color: "#f85149", bg: "rgba(248,81,73,0.15)" },
  medium: { label: "MED",    color: "#d29922", bg: "rgba(210,153,34,0.15)" },
  low:    { label: "LOW",    color: "#8b949e", bg: "rgba(139,148,158,0.10)" },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function sentimentColor(score: number): string {
  if (score >= 40) return "#3fb950";
  if (score >= 15) return "#56d364";
  if (score <= -40) return "#f85149";
  if (score <= -15) return "#da3633";
  return "#8b949e";
}

function sentimentArrow(score: number): string {
  if (score >= 40) return "⬆⬆";
  if (score >= 15) return "⬆";
  if (score <= -40) return "⬇⬇";
  if (score <= -15) return "⬇";
  return "→";
}

interface NewsPanelProps {
  instrument: Instrument;
}

export default function NewsPanel({ instrument }: NewsPanelProps) {
  const [news, setNews] = useState<AnalyzedNewsItem[]>([]);
  const [sentimentIndex, setSentimentIndex] = useState<SentimentIndex | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchNews() {
      setLoading(true);
      try {
        const res = await fetch(`/api/news?instrument=${instrument}`);
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();
        if (!cancelled) {
          setNews(data.news ?? []);
          setSentimentIndex(data.sentimentIndex ?? null);
        }
      } catch {
        if (!cancelled) {
          setNews([]);
          setSentimentIndex(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchNews();
    const interval = setInterval(fetchNews, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [instrument]);

  return (
    <div className="panel" style={{ flex: 1, minHeight: 0 }}>
      <div className="panel-title">
        {instrument} News Intelligence
      </div>

      {/* Sentiment Index Gauge */}
      {sentimentIndex && (
        <div style={{
          margin: "8px 0 12px",
          padding: "10px 12px",
          borderRadius: "8px",
          background: "var(--gauge-bg, rgba(128,128,128,0.08))",
          border: "1px solid var(--border)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
            <span style={{ fontSize: "11px", color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              News Sentiment Index
            </span>
            <span style={{
              fontSize: "16px",
              fontWeight: 700,
              color: sentimentColor(sentimentIndex.index),
              fontFamily: "var(--font-mono, monospace)",
            }}>
              {sentimentIndex.index > 0 ? "+" : ""}{sentimentIndex.index}
              <span style={{ marginLeft: "4px", fontSize: "14px" }}>{sentimentArrow(sentimentIndex.index)}</span>
            </span>
          </div>

          {/* Sentiment bar */}
          <div style={{ position: "relative", height: "8px", borderRadius: "4px", background: "var(--border)", overflow: "hidden" }}>
            <div style={{
              position: "absolute",
              left: 0,
              top: 0,
              height: "100%",
              width: `${((sentimentIndex.index + 100) / 200) * 100}%`,
              borderRadius: "4px",
              background: sentimentIndex.index >= 0
                ? `linear-gradient(90deg, var(--border) 0%, ${sentimentColor(sentimentIndex.index)} 100%)`
                : `linear-gradient(90deg, ${sentimentColor(sentimentIndex.index)} 0%, var(--border) 100%)`,
              transition: "width 0.5s ease",
            }} />
            {/* Center marker */}
            <div style={{
              position: "absolute",
              left: "50%",
              top: 0,
              width: "2px",
              height: "100%",
              background: "var(--text-secondary)",
              opacity: 0.4,
            }} />
          </div>

          {/* Stats row */}
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: "8px",
            fontSize: "10px",
            color: "var(--text-secondary)",
          }}>
            <span style={{ color: sentimentColor(sentimentIndex.index), fontWeight: 600 }}>
              {sentimentIndex.label}
            </span>
            <span>
              <span style={{ color: "#3fb950" }}>▲ {sentimentIndex.bullishPct}%</span>
              {" · "}
              <span style={{ color: "#f85149" }}>▼ {sentimentIndex.bearishPct}%</span>
              {" · "}
              {sentimentIndex.articleCount} articles
            </span>
          </div>
        </div>
      )}

      {/* News feed */}
      <div style={{ maxHeight: "400px", overflowY: "auto" }}>
        {loading && news.length === 0 ? (
          <div style={{ fontSize: "12px", color: "var(--text-3)" }}>Loading news…</div>
        ) : news.length === 0 ? (
          <div style={{ fontSize: "12px", color: "var(--text-3)" }}>
            No news available. Waiting for cron to fetch data.
          </div>
        ) : (
          news.map((item, i) => {
            const tagColor = TAG_COLORS[item.tag ?? "MARKET"] ?? "#8b949e";
            const impact = IMPACT_CONFIG[item.impactLevel] ?? IMPACT_CONFIG.low;
            const isRecent = Date.now() - new Date(item.publishedAt).getTime() < 30 * 60 * 1000;
            const sColor = sentimentColor(item.sentimentScore);

            return (
              <div
                key={item.id}
                style={{
                  padding: "10px 0",
                  borderBottom: i < news.length - 1 ? "1px solid var(--border)" : "none",
                  ...(isRecent ? {
                    background: "var(--news-flash, rgba(88,166,255,0.08))",
                    margin: "0 -16px",
                    padding: "10px 16px",
                    borderRadius: "4px",
                    borderBottom: "none",
                    marginBottom: "4px",
                  } : {}),
                }}
              >
                {/* Top row: time + tags + impact + sentiment score */}
                <div style={{ display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap" }}>
                  <span style={{
                    fontSize: "10px",
                    color: "var(--text-3)",
                    fontFamily: "var(--font-mono)",
                  }}>
                    {timeAgo(item.publishedAt)}
                  </span>

                  {item.tag && (
                    <span style={{
                      fontSize: "9px",
                      fontWeight: 600,
                      padding: "1px 5px",
                      borderRadius: "3px",
                      background: `${tagColor}20`,
                      color: tagColor,
                    }}>
                      {item.tag}
                    </span>
                  )}

                  <span style={{
                    fontSize: "9px",
                    fontWeight: 700,
                    padding: "1px 5px",
                    borderRadius: "3px",
                    background: impact.bg,
                    color: impact.color,
                  }}>
                    {impact.label}
                  </span>

                  {/* Sentiment score pill */}
                  <span style={{
                    fontSize: "9px",
                    fontWeight: 700,
                    padding: "1px 5px",
                    borderRadius: "3px",
                    marginLeft: "auto",
                    background: `${sColor}18`,
                    color: sColor,
                    fontFamily: "var(--font-mono, monospace)",
                  }}>
                    {item.sentimentScore > 0 ? "+" : ""}{item.sentimentScore}
                  </span>
                </div>

                {/* Headline */}
                <div style={{
                  fontSize: "12px",
                  fontWeight: 500,
                  marginTop: "4px",
                  lineHeight: 1.4,
                  borderLeft: `2px solid ${sColor}`,
                  paddingLeft: "8px",
                }}>
                  {item.url ? (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "inherit", textDecoration: "none" }}
                    >
                      {item.headline}
                    </a>
                  ) : (
                    item.headline
                  )}
                </div>

                {/* Source */}
                <div style={{
                  fontSize: "10px",
                  color: "var(--text-3)",
                  marginTop: "3px",
                  paddingLeft: "10px",
                }}>
                  {item.source}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
