-- Audit log of every write the Telegram bot makes, so any bad edit can be
-- inspected and restored. Run once in the Supabase SQL editor.
CREATE TABLE IF NOT EXISTS bot_edits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  changes JSONB NOT NULL,   -- { field: { "old": ..., "new": ... } }
  context TEXT,             -- the chat message that triggered the edit
  undone BOOLEAN DEFAULT FALSE
);

ALTER TABLE bot_edits ENABLE ROW LEVEL SECURITY;
