-- Durable PVR response cache. The in-memory cache in src/lib/pvr/client.ts
-- dies with each serverless instance, so most prod requests hit PVR cold;
-- this table makes cached responses survive across instances and lets the
-- cron pre-warm them. Only the service role touches it (RLS on, no policies)
-- — same pattern as bot_state.
CREATE TABLE IF NOT EXISTS pvr_cache (
  key TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL,
  data JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL,
  ttl_seconds INTEGER NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  stale_until TIMESTAMPTZ NOT NULL
);

ALTER TABLE pvr_cache ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_pvr_cache_stale ON pvr_cache (stale_until);
