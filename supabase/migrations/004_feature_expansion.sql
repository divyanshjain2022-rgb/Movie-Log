-- ============================================================
-- Migration 004: Feature Expansion
-- New tables: watchlist, budgets, franchises, companions,
--             movie_companions, movie_photos, theater_ratings,
--             fnb_items, fnb_purchase_items
-- New columns on movies: franchise_id, original_movie_id, is_rewatch
-- ============================================================

-- ====================
-- Watchlist
-- ====================
CREATE TABLE IF NOT EXISTS watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  tmdb_id INTEGER,
  poster_url TEXT,
  release_date TEXT,
  genres TEXT[],
  runtime_minutes INTEGER,
  notes TEXT,
  priority INTEGER DEFAULT 0 CHECK (priority IN (0, 1, 2)),
  added_at TIMESTAMPTZ DEFAULT now(),
  watched_movie_id UUID REFERENCES movies(id) ON DELETE SET NULL
);

ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own watchlist" ON watchlist
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_watchlist_user ON watchlist(user_id);
CREATE INDEX idx_watchlist_tmdb ON watchlist(user_id, tmdb_id);

-- ====================
-- Budgets
-- ====================
CREATE TABLE IF NOT EXISTS budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INTEGER NOT NULL,
  amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  UNIQUE(user_id, month, year)
);

ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own budgets" ON budgets
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_budgets_user_period ON budgets(user_id, year, month);

-- ====================
-- Franchises
-- ====================
CREATE TABLE IF NOT EXISTS franchises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  tmdb_collection_id INTEGER,
  poster_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE franchises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own franchises" ON franchises
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_franchises_user ON franchises(user_id);

-- ====================
-- Companions
-- ====================
CREATE TABLE IF NOT EXISTS companions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  avatar_emoji TEXT DEFAULT '🧑',
  UNIQUE(user_id, name)
);

ALTER TABLE companions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own companions" ON companions
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_companions_user ON companions(user_id);

-- ====================
-- Movie-Companions junction
-- ====================
CREATE TABLE IF NOT EXISTS movie_companions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movie_id UUID NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  companion_id UUID NOT NULL REFERENCES companions(id) ON DELETE CASCADE,
  UNIQUE(movie_id, companion_id)
);

ALTER TABLE movie_companions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage movie companions through movies" ON movie_companions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM movies WHERE movies.id = movie_companions.movie_id AND movies.user_id = auth.uid())
  );

CREATE INDEX idx_movie_companions_movie ON movie_companions(movie_id);
CREATE INDEX idx_movie_companions_companion ON movie_companions(companion_id);

-- ====================
-- Movie Photos
-- ====================
CREATE TABLE IF NOT EXISTS movie_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  movie_id UUID NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  caption TEXT,
  photo_type TEXT DEFAULT 'general' CHECK (photo_type IN ('ticket', 'selfie', 'fnb', 'general')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE movie_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own photos" ON movie_photos
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_movie_photos_movie ON movie_photos(movie_id);

-- ====================
-- Theater Ratings
-- ====================
CREATE TABLE IF NOT EXISTS theater_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  theater_id UUID NOT NULL REFERENCES theaters(id) ON DELETE CASCADE,
  audi TEXT,
  sound INTEGER CHECK (sound BETWEEN 1 AND 5),
  seat INTEGER CHECK (seat BETWEEN 1 AND 5),
  screen INTEGER CHECK (screen BETWEEN 1 AND 5),
  cleanliness INTEGER CHECK (cleanliness BETWEEN 1 AND 5),
  notes TEXT,
  movie_id UUID REFERENCES movies(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE theater_ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own theater ratings" ON theater_ratings
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_theater_ratings_theater ON theater_ratings(theater_id);
CREATE INDEX idx_theater_ratings_user ON theater_ratings(user_id);

-- ====================
-- F&B Items catalog
-- ====================
CREATE TABLE IF NOT EXISTS fnb_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'snack' CHECK (category IN ('snack', 'beverage', 'combo', 'other')),
  UNIQUE(user_id, name)
);

ALTER TABLE fnb_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own fnb items" ON fnb_items
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_fnb_items_user ON fnb_items(user_id);

-- ====================
-- F&B Purchase Items (structured line items)
-- ====================
CREATE TABLE IF NOT EXISTS fnb_purchase_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fnb_purchase_id UUID NOT NULL REFERENCES fnb_purchases(id) ON DELETE CASCADE,
  fnb_item_id UUID REFERENCES fnb_items(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  price NUMERIC(10,2) DEFAULT 0
);

ALTER TABLE fnb_purchase_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage fnb purchase items through purchases" ON fnb_purchase_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM fnb_purchases WHERE fnb_purchases.id = fnb_purchase_items.fnb_purchase_id AND fnb_purchases.user_id = auth.uid())
  );

CREATE INDEX idx_fnb_purchase_items_purchase ON fnb_purchase_items(fnb_purchase_id);

-- ====================
-- New columns on movies
-- ====================
ALTER TABLE movies ADD COLUMN IF NOT EXISTS franchise_id UUID REFERENCES franchises(id) ON DELETE SET NULL;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS original_movie_id UUID REFERENCES movies(id) ON DELETE SET NULL;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS is_rewatch BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_movies_franchise ON movies(franchise_id);
CREATE INDEX IF NOT EXISTS idx_movies_original ON movies(original_movie_id);
CREATE INDEX IF NOT EXISTS idx_movies_rewatch ON movies(is_rewatch) WHERE is_rewatch = TRUE;

-- ====================
-- Storage bucket for movie photos
-- ====================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('movie-photos', 'movie-photos', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Users can upload their own photos" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'movie-photos' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can view their own photos" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'movie-photos' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete their own photos" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'movie-photos' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );
