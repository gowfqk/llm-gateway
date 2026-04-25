-- Preserve provider-level proxy settings in Supabase
ALTER TABLE providers
ADD COLUMN IF NOT EXISTS proxy_json JSONB;
