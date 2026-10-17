-- Migration: Add news sentiment scoring columns and aggregate cache
-- Run this in your Supabase SQL editor.

-- Add sentiment analysis columns to news table
ALTER TABLE news ADD COLUMN IF NOT EXISTS sentiment_score INTEGER DEFAULT 0;
ALTER TABLE news ADD COLUMN IF NOT EXISTS impact_level TEXT DEFAULT 'low';
ALTER TABLE news ADD COLUMN IF NOT EXISTS impact_score INTEGER DEFAULT 1;
ALTER TABLE news ADD COLUMN IF NOT EXISTS sentiment_label TEXT DEFAULT 'neutral';

-- Aggregate sentiment index cache per instrument
CREATE TABLE IF NOT EXISTS news_sentiment_cache (
  instrument TEXT PRIMARY KEY,
  sentiment_index INTEGER NOT NULL DEFAULT 0,
  sentiment_label TEXT NOT NULL DEFAULT 'Neutral',
  article_count INTEGER NOT NULL DEFAULT 0,
  bullish_pct INTEGER NOT NULL DEFAULT 0,
  bearish_pct INTEGER NOT NULL DEFAULT 0,
  cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE news_sentiment_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon select" ON news_sentiment_cache FOR SELECT USING (true);
CREATE POLICY "Allow service insert" ON news_sentiment_cache FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow service update" ON news_sentiment_cache FOR UPDATE USING (true);
