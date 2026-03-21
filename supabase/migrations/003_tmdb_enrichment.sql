-- Migration: TMDB Enrichment
-- Adds detailed TMDB data columns to movies table

ALTER TABLE movies ADD COLUMN IF NOT EXISTS cast_members TEXT[] DEFAULT '{}';
ALTER TABLE movies ADD COLUMN IF NOT EXISTS composer TEXT;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS cinematographer TEXT;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS budget BIGINT;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS box_office BIGINT;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS tmdb_rating DECIMAL(3,1);
ALTER TABLE movies ADD COLUMN IF NOT EXISTS tmdb_vote_count INTEGER;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS certification TEXT;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS trailer_url TEXT;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS keywords TEXT[] DEFAULT '{}';
ALTER TABLE movies ADD COLUMN IF NOT EXISTS overview TEXT;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS release_date DATE;

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_movies_tmdb_rating ON movies(tmdb_rating DESC);
CREATE INDEX IF NOT EXISTS idx_movies_release_date ON movies(release_date DESC);
