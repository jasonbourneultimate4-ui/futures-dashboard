-- Futures Dashboard Schema
-- Run this in your Supabase SQL editor to set up tables.

-- 15-minute price bars from Yahoo Finance
CREATE TABLE IF NOT EXISTS price_bars (
  id BIGSERIAL PRIMARY KEY,
  instrument TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  open DOUBLE PRECISION NOT NULL,
  high DOUBLE PRECISION NOT NULL,
  low DOUBLE PRECISION NOT NULL,
  close DOUBLE PRECISION NOT NULL,
  volume BIGINT NOT NULL DEFAULT 0,
  UNIQUE(instrument, timestamp)
);

CREATE INDEX IF NOT EXISTS idx_price_bars_lookup
  ON price_bars (instrument, timestamp DESC);

-- Daily OI context (from CME daily reports)
CREATE TABLE IF NOT EXISTS daily_context (
  id BIGSERIAL PRIMARY KEY,
  instrument TEXT NOT NULL,
  date DATE NOT NULL,
  open_interest BIGINT NOT NULL,
  oi_change BIGINT NOT NULL DEFAULT 0,
  price_change DOUBLE PRECISION NOT NULL DEFAULT 0,
  quadrant TEXT NOT NULL DEFAULT 'unknown',
  UNIQUE(instrument, date)
);

-- Weekly COT data (from CFTC)
CREATE TABLE IF NOT EXISTS cot_data (
  id BIGSERIAL PRIMARY KEY,
  instrument TEXT NOT NULL,
  report_date DATE NOT NULL,
  managed_money_long BIGINT NOT NULL DEFAULT 0,
  managed_money_short BIGINT NOT NULL DEFAULT 0,
  managed_money_net BIGINT NOT NULL DEFAULT 0,
  commercial_long BIGINT NOT NULL DEFAULT 0,
  commercial_short BIGINT NOT NULL DEFAULT 0,
  commercial_net BIGINT NOT NULL DEFAULT 0,
  small_spec_long BIGINT NOT NULL DEFAULT 0,
  small_spec_short BIGINT NOT NULL DEFAULT 0,
  small_spec_net BIGINT NOT NULL DEFAULT 0,
  UNIQUE(instrument, report_date)
);

-- Alerts log
CREATE TABLE IF NOT EXISTS alerts (
  id BIGSERIAL PRIMARY KEY,
  instrument TEXT NOT NULL,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_recent
  ON alerts (created_at DESC);

-- Cached news articles from APIs
CREATE TABLE IF NOT EXISTS news (
  id TEXT PRIMARY KEY,
  instrument TEXT NOT NULL,
  headline TEXT NOT NULL,
  summary TEXT,
  source TEXT NOT NULL,
  url TEXT,
  published_at TIMESTAMPTZ NOT NULL,
  sentiment TEXT NOT NULL DEFAULT 'neutral',
  tag TEXT NOT NULL DEFAULT 'MARKET',
  cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_news_instrument
  ON news (instrument, published_at DESC);

-- Row Level Security: allow anon reads, service role writes
ALTER TABLE price_bars ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE cot_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon select" ON price_bars FOR SELECT USING (true);
CREATE POLICY "Allow service insert" ON price_bars FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow service update" ON price_bars FOR UPDATE USING (true);

CREATE POLICY "Allow anon select" ON daily_context FOR SELECT USING (true);
CREATE POLICY "Allow service insert" ON daily_context FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow service update" ON daily_context FOR UPDATE USING (true);

CREATE POLICY "Allow anon select" ON cot_data FOR SELECT USING (true);
CREATE POLICY "Allow service insert" ON cot_data FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow service update" ON cot_data FOR UPDATE USING (true);

CREATE POLICY "Allow anon select" ON alerts FOR SELECT USING (true);
CREATE POLICY "Allow service insert" ON alerts FOR INSERT WITH CHECK (true);

ALTER TABLE news ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon select" ON news FOR SELECT USING (true);
CREATE POLICY "Allow service insert" ON news FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow service update" ON news FOR UPDATE USING (true);

-- Cached factor values for relationship graph (Yahoo Finance + FRED)
CREATE TABLE IF NOT EXISTS factor_cache (
  id TEXT PRIMARY KEY DEFAULT 'latest',
  data JSONB NOT NULL,
  cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE factor_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon select" ON factor_cache FOR SELECT USING (true);
CREATE POLICY "Allow service insert" ON factor_cache FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow service update" ON factor_cache FOR UPDATE USING (true);

-- Correlation cache (6h TTL, recomputed from Yahoo Finance historical data)
CREATE TABLE IF NOT EXISTS correlation_cache (
  id TEXT PRIMARY KEY DEFAULT 'latest',
  data JSONB NOT NULL,
  cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE correlation_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon select" ON correlation_cache FOR SELECT USING (true);
CREATE POLICY "Allow service insert" ON correlation_cache FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow service update" ON correlation_cache FOR UPDATE USING (true);

-- Supply chain cache (12h TTL, recomputed from FRED/EIA data)
CREATE TABLE IF NOT EXISTS supply_chain_cache (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE supply_chain_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon select" ON supply_chain_cache FOR SELECT USING (true);
CREATE POLICY "Allow service insert" ON supply_chain_cache FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow service update" ON supply_chain_cache FOR UPDATE USING (true);
