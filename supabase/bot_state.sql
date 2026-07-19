-- Tiny key-value state for the Telegram bot's cron dedupe
-- (which movies were prompted/captured, last digest dates, radar memory).
-- Run once in the Supabase SQL editor.
CREATE TABLE IF NOT EXISTS bot_state (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Only the service role (the bot) touches this table.
ALTER TABLE bot_state ENABLE ROW LEVEL SECURITY;
