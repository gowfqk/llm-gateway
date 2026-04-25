-- Gateway config storage for per-user proxy URL and gateway API keys
CREATE TABLE IF NOT EXISTS gateway_configs (
  user_id TEXT PRIMARY KEY,
  proxy_url TEXT NOT NULL DEFAULT '',
  api_keys TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE gateway_configs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gateway_configs' AND policyname = 'Users can view own gateway config'
  ) THEN
    CREATE POLICY "Users can view own gateway config"
      ON gateway_configs FOR SELECT USING (auth.uid()::text = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gateway_configs' AND policyname = 'Users can insert own gateway config'
  ) THEN
    CREATE POLICY "Users can insert own gateway config"
      ON gateway_configs FOR INSERT WITH CHECK (auth.uid()::text = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gateway_configs' AND policyname = 'Users can update own gateway config'
  ) THEN
    CREATE POLICY "Users can update own gateway config"
      ON gateway_configs FOR UPDATE USING (auth.uid()::text = user_id);
  END IF;
END $$;
