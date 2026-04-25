-- ============================================
-- LLM Gateway - Supabase Database Schema
-- ============================================
-- 在 Supabase SQL Editor 中执行以下 SQL
-- 创建三张数据表 + RLS 策略
-- ============================================

-- 1. Providers 表
CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  base_url TEXT NOT NULL,
  api_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  models TEXT[] NOT NULL DEFAULT '{}',
  rate_limit INTEGER,
  proxy_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Usage Records 表
CREATE TABLE IF NOT EXISTS usage_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  cost DECIMAL(10, 4) NOT NULL DEFAULT 0,
  timestamp TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'success',
  latency INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Route Rules 表
CREATE TABLE IF NOT EXISTS route_rules (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  pattern TEXT NOT NULL,
  target_provider_id TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 1,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- Row Level Security (RLS)
-- 每个用户只能访问自己的数据
-- ============================================

ALTER TABLE providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_rules ENABLE ROW LEVEL SECURITY;

-- Providers RLS
CREATE POLICY "Users can view own providers"
  ON providers FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own providers"
  ON providers FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update own providers"
  ON providers FOR UPDATE USING (auth.uid()::text = user_id);

CREATE POLICY "Users can delete own providers"
  ON providers FOR DELETE USING (auth.uid()::text = user_id);

-- Usage Records RLS
CREATE POLICY "Users can view own usage"
  ON usage_records FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own usage"
  ON usage_records FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update own usage"
  ON usage_records FOR UPDATE USING (auth.uid()::text = user_id);

CREATE POLICY "Users can delete own usage"
  ON usage_records FOR DELETE USING (auth.uid()::text = user_id);

-- Route Rules RLS
CREATE POLICY "Users can view own routes"
  ON route_rules FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own routes"
  ON route_rules FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update own routes"
  ON route_rules FOR UPDATE USING (auth.uid()::text = user_id);

CREATE POLICY "Users can delete own routes"
  ON route_rules FOR DELETE USING (auth.uid()::text = user_id);

-- ============================================
-- 索引优化
-- ============================================
CREATE INDEX IF NOT EXISTS idx_providers_user ON providers(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_user ON usage_records(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON usage_records(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_routes_user ON route_rules(user_id, priority ASC);
