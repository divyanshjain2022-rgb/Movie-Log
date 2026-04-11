-- 1. Fix total_cost to subtract passport_savings
-- Drop and recreate the generated column with the correct formula
ALTER TABLE movies DROP COLUMN total_cost;
ALTER TABLE movies ADD COLUMN total_cost DECIMAL(10,2) GENERATED ALWAYS AS (
  ticket_cost + convenience_fee + COALESCE(fnb_cost, 0) + COALESCE(other_expenses, 0) - COALESCE(passport_savings, 0)
) STORED;

-- 2. Create passports table for tracking passport purchases
CREATE TABLE IF NOT EXISTS passports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'PVR Passport',
  purchase_date DATE NOT NULL,
  expiry_date DATE,
  amount_paid DECIMAL(10,2) NOT NULL,
  total_uses INTEGER NOT NULL DEFAULT 3,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Link movies to passports (which passport was used for this movie)
ALTER TABLE movies ADD COLUMN IF NOT EXISTS passport_id UUID REFERENCES passports(id) ON DELETE SET NULL;

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_passports_user ON passports(user_id);
CREATE INDEX IF NOT EXISTS idx_movies_passport ON movies(passport_id);

-- 5. RLS
ALTER TABLE passports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own passports" ON passports
  FOR ALL USING (auth.uid() = user_id);

-- 6. Updated_at trigger
CREATE TRIGGER update_passports_updated_at
  BEFORE UPDATE ON passports
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
