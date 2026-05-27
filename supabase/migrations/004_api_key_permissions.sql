-- Add api_key_entries JSONB column for per-key permissions (allowedModels, name)
-- Format: [{ "key": "gw_live_sk_xxx", "name": "Production", "allowedModels": ["gpt-4o", "claude-*"] }]
ALTER TABLE gateway_configs
  ADD COLUMN IF NOT EXISTS api_key_entries JSONB NOT NULL DEFAULT '[]'::jsonb;
