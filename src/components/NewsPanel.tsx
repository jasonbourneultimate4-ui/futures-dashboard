"use client";

import { useEffect, useState } from "react";
import type { Instrument, NewsItem } from "@/lib/types";

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

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface NewsPanelProps {
  instrument: Instrument;
}

export default function NewsPanel({ instrument }: NewsPanelProps) {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [sources, setSources] = useState<string[]>([]);
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
          setSources(data.sources ?? []);
        }
      } catch {
        if (!cancelled) setNews([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchNews();
    const interval = setInterval(fetchNews, 5 * 60 * 1000); // refresh every 5 min

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [instrument]);

  return (
    <div className="panel" style={{ flex: 1, minHeight: 0 }}>
      <div className="panel-title">
        {instrument} News Feed
        {sources.length > 0 && (
          <span
            style={{
              fontSize: "9px",
              background: "var(--accent-dim)",
              color: "var(--accent)",
              padding: "2px 6px",
              borderRadius: "4px",
              textTransform: "none",
              letterSpacing: 0,
              fontWeight: 500,
            }}
          >
            {sources.join(" · ")}
          </span>
        )}
      </div>

      <div
        style={{
          maxHeight: "460px",
          overflowY: "auto",
        }}
      >
        {loading && news.length === 0 ? (
          <div style={{ fontSize: "12px", color: "var(--text-3)" }}>
            Loading news…
          </div>
        ) : news.length === 0 ? (
          <div style={{ fontSize: "12px", color: "var(--text-3)" }}>
            No news available. Add API keys to .env to enable live feeds.
          </div>
        ) : (
          news.map((item, i) => {
            const tagColor = TAG_COLORS[item.tag ?? "MARKET"] ?? "#8b949e";
            const isRecent =
              Date.now() - new Date(item.publishedAt).getTime() < 30 * 60 * 1000;
            return (
              <div
                key={item.id}
                style={{
                  padding: "10px 0",
                  borderBottom:
                    i < news.length - 1 ? "1px solid var(--border)" : "none",
                  ...(isRecent
                    ? {
                        background: "var(--news-flash, rgba(88,166,255,0.08))",
                        margin: "0 -16px",
                        padding: "10px 16px",
                        borderRadius: "4px",
                        borderBottom: "none",
                        marginBottom: "4px",
                      }
                    : {}),
                }}
              >
                <div>
                  <span
                    style={{
                      fontSize: "10px",
                      color: "var(--text-3)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {timeAgo(item.publishedAt)}
                  </span>
                  {item.tag && (
                    <span
                      style={{
                        fontSize: "9px",
                        fontWeight: 600,
                        padding: "1px 5px",
                        borderRadius: "3px",
                        marginLeft: "6px",
                        background: `${tagColor}20`,
                        color: tagColor,
                      }}
                    >
                      {item.tag}
                    </span>
                  )}
                  {item.sentiment && item.sentiment !== "neutral" && (
                    <span
                      style={{
                        fontSize: "9px",
                        marginLeft: "4px",
                      }}
                    >
                      {item.sentiment === "positive" ? "🟢" : "🔴"}
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 500,
                    marginTop: "4px",
                    lineHeight: 1.4,
                  }}
                >
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
                <div
                  style={{
                    fontSize: "10px",
                    color: "var(--text-3)",
                    marginTop: "3px",
                  }}
                >
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
