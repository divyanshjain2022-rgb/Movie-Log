-- Migration: Advanced Features
-- Adds: Advance booking mode, F&B tracking, multiple gift cards per transaction

-- 1. Add status field to movies for advance booking
ALTER TABLE movies ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'watched'
  CHECK (status IN ('upcoming', 'watched'));

-- 2. Create F&B purchases table
CREATE TABLE IF NOT EXISTS fnb_purchases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Purchase details
  date DATE NOT NULL,
  theater_id UUID REFERENCES theaters(id) ON DELETE SET NULL,
  items TEXT NOT NULL,
  cost DECIMAL(10,2) NOT NULL,
  remarks TEXT,

  -- Link to movie (optional - can be linked later)
  movie_id UUID REFERENCES movies(id) ON DELETE SET NULL
);

-- 3. Create junction table for movie gift cards (multiple GCs per movie)
CREATE TABLE IF NOT EXISTS movie_gift_cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  movie_id UUID REFERENCES movies(id) ON DELETE CASCADE,
  gift_card_id UUID REFERENCES gift_cards(id) ON DELETE CASCADE,
  amount_used DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(movie_id, gift_card_id)
);

-- 4. Create junction table for F&B gift cards
CREATE TABLE IF NOT EXISTS fnb_gift_cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fnb_purchase_id UUID REFERENCES fnb_purchases(id) ON DELETE CASCADE,
  gift_card_id UUID REFERENCES gift_cards(id) ON DELETE CASCADE,
  amount_used DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(fnb_purchase_id, gift_card_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_fnb_purchases_user ON fnb_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_fnb_purchases_movie ON fnb_purchases(movie_id);
CREATE INDEX IF NOT EXISTS idx_movie_gift_cards_movie ON movie_gift_cards(movie_id);
CREATE INDEX IF NOT EXISTS idx_movie_gift_cards_gc ON movie_gift_cards(gift_card_id);
CREATE INDEX IF NOT EXISTS idx_fnb_gift_cards_fnb ON fnb_gift_cards(fnb_purchase_id);
CREATE INDEX IF NOT EXISTS idx_fnb_gift_cards_gc ON fnb_gift_cards(gift_card_id);
CREATE INDEX IF NOT EXISTS idx_movies_status ON movies(user_id, status);

-- Trigger for fnb_purchases updated_at
CREATE TRIGGER update_fnb_purchases_updated_at
    BEFORE UPDATE ON fnb_purchases
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- RLS for new tables
ALTER TABLE fnb_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE movie_gift_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE fnb_gift_cards ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can manage own fnb_purchases" ON fnb_purchases
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own movie_gift_cards" ON movie_gift_cards
  FOR ALL USING (
    EXISTS (SELECT 1 FROM movies WHERE movies.id = movie_gift_cards.movie_id AND movies.user_id = auth.uid())
  );

CREATE POLICY "Users can manage own fnb_gift_cards" ON fnb_gift_cards
  FOR ALL USING (
    EXISTS (SELECT 1 FROM fnb_purchases WHERE fnb_purchases.id = fnb_gift_cards.fnb_purchase_id AND fnb_purchases.user_id = auth.uid())
  );

-- View to calculate gift card usage and balance
CREATE OR REPLACE VIEW gift_card_usage AS
SELECT
  gc.id as gc_id,
  gc.user_id,
  gc.face_value,
  gc.amount_paid,
  gc.expiry_date,
  COALESCE(movie_usage.total, 0) + COALESCE(fnb_usage.total, 0) as total_used,
  gc.face_value - (COALESCE(movie_usage.total, 0) + COALESCE(fnb_usage.total, 0)) as balance,
  CASE
    WHEN gc.expiry_date < CURRENT_DATE THEN 'expired'
    WHEN gc.face_value - (COALESCE(movie_usage.total, 0) + COALESCE(fnb_usage.total, 0)) <= 0 THEN 'exhausted'
    ELSE 'active'
  END as status
FROM gift_cards gc
LEFT JOIN (
  SELECT gift_card_id, SUM(amount_used) as total
  FROM movie_gift_cards
  GROUP BY gift_card_id
) movie_usage ON gc.id = movie_usage.gift_card_id
LEFT JOIN (
  SELECT gift_card_id, SUM(amount_used) as total
  FROM fnb_gift_cards
  GROUP BY gift_card_id
) fnb_usage ON gc.id = fnb_usage.gift_card_id;
