ALTER TABLE theaters
ADD COLUMN IF NOT EXISTS default_audi_by_format JSONB DEFAULT '{}'::jsonb;
