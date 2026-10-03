-- Why a seat-map capture failed. The API returns the reason once and the
-- app shows it in a toast; this keeps a copy for debugging. Service role
-- only (RLS on, no policies), same pattern as bot_state and pvr_cache.
CREATE TABLE IF NOT EXISTS occupancy_failures (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  title TEXT,
  theater TEXT,
  show_date DATE,
  showtime TEXT,
  reason TEXT NOT NULL
);

ALTER TABLE occupancy_failures ENABLE ROW LEVEL SECURITY;
