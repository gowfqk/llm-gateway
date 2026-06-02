-- Add route mode and ordered_candidates columns to route_rules table
ALTER TABLE route_rules
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'pattern',
  ADD COLUMN IF NOT EXISTS ordered_candidates JSONB;

-- Migrate existing routes to mode='pattern'
UPDATE route_rules SET mode = 'pattern' WHERE mode IS NULL OR mode = '';

-- Allow pattern to be null (fallback mode doesn't use pattern)
ALTER TABLE route_rules ALTER COLUMN pattern DROP NOT NULL;
