-- Add OAuth support for providers (Authorization Code flow)
-- auth_type: "api_key" (default) or "oauth"
ALTER TABLE providers
ADD COLUMN IF NOT EXISTS auth_type TEXT NOT NULL DEFAULT 'api_key';

-- OAuth configuration fields (stored as JSONB for flexibility)
-- Contains: clientId, clientSecret, authUrl, tokenUrl, scopes
ALTER TABLE providers
ADD COLUMN IF NOT EXISTS oauth_config JSONB;

-- OAuth tokens (separate columns for easier querying/updating)
ALTER TABLE providers
ADD COLUMN IF NOT EXISTS oauth_access_token TEXT;

ALTER TABLE providers
ADD COLUMN IF NOT EXISTS oauth_refresh_token TEXT;

ALTER TABLE providers
ADD COLUMN IF NOT EXISTS oauth_token_expiry TIMESTAMPTZ;

-- Index for quickly finding providers needing token refresh
CREATE INDEX IF NOT EXISTS idx_providers_oauth_expiry
ON providers (oauth_token_expiry)
WHERE auth_type = 'oauth' AND oauth_token_expiry IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN providers.auth_type IS 'Authentication type: api_key or oauth';
COMMENT ON COLUMN providers.oauth_config IS 'OAuth config JSON: {clientId, clientSecret, authUrl, tokenUrl, scopes}';
COMMENT ON COLUMN providers.oauth_access_token IS 'Current OAuth access token';
COMMENT ON COLUMN providers.oauth_refresh_token IS 'OAuth refresh token for token renewal';
COMMENT ON COLUMN providers.oauth_token_expiry IS 'When the current access token expires';
