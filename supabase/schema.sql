-- CinemaLog Database Schema
-- Run this in your Supabase SQL editor to set up the database

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Lookup tables (user-configurable)

CREATE TABLE formats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  weight DECIMAL(3,2) DEFAULT 1.0,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE theaters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  city TEXT,
  has_imax BOOLEAN DEFAULT FALSE,
  has_4dx BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE moods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  emoji TEXT,
  sentiment TEXT CHECK (sentiment IN ('positive', 'negative', 'neutral')),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE aspects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE rewatch_options (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  value INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE platforms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Gift cards
CREATE TABLE gift_cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  face_value DECIMAL(10,2) NOT NULL,
  amount_paid DECIMAL(10,2) NOT NULL,
  discount_percent DECIMAL(5,2) GENERATED ALWAYS AS (
    ((face_value - amount_paid) / NULLIF(face_value, 0)) * 100
  ) STORED,
  platform_id UUID REFERENCES platforms(id) ON DELETE SET NULL,
  purchase_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  code TEXT,
  notes TEXT
);

-- Movies (main table)
CREATE TABLE movies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Ticket data
  title TEXT NOT NULL,
  date DATE NOT NULL,
  showtime TIME,
  theater_id UUID REFERENCES theaters(id) ON DELETE SET NULL,
  audi TEXT,
  format_id UUID REFERENCES formats(id) ON DELETE SET NULL,
  seat TEXT,
  ticket_cost DECIMAL(10,2) DEFAULT 0,
  convenience_fee DECIMAL(10,2) DEFAULT 0,
  booking_id TEXT,

  -- TMDB data
  tmdb_id INTEGER,
  runtime_minutes INTEGER,
  genres TEXT[],
  language TEXT,
  director TEXT,
  poster_url TEXT,

  -- User input
  rating DECIMAL(3,1) CHECK (rating >= 1 AND rating <= 10),
  mood_id UUID REFERENCES moods(id) ON DELETE SET NULL,
  fnb_cost DECIMAL(10,2),
  fnb_items TEXT,
  strongest_part_id UUID REFERENCES aspects(id) ON DELETE SET NULL,
  weakest_part_id UUID REFERENCES aspects(id) ON DELETE SET NULL,
  rewatch_id UUID REFERENCES rewatch_options(id) ON DELETE SET NULL,
  review TEXT,
  remarks TEXT,
  gc_id UUID REFERENCES gift_cards(id) ON DELETE SET NULL,
  other_expenses DECIMAL(10,2),
  passport_savings DECIMAL(10,2) DEFAULT 0,

  -- Computed (updated via trigger or on save)
  total_cost DECIMAL(10,2) GENERATED ALWAYS AS (
    ticket_cost + convenience_fee + COALESCE(fnb_cost, 0) + COALESCE(other_expenses, 0)
  ) STORED,
  value_score DECIMAL(10,2)
);

-- Formula config
CREATE TABLE formula_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  params JSONB NOT NULL,
  is_active BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_movies_user_date ON movies(user_id, date DESC);
CREATE INDEX idx_movies_user_rating ON movies(user_id, rating DESC);
CREATE INDEX idx_gift_cards_user ON gift_cards(user_id);
CREATE INDEX idx_gift_cards_expiry ON gift_cards(expiry_date);
CREATE INDEX idx_formats_user ON formats(user_id);
CREATE INDEX idx_theaters_user ON theaters(user_id);
CREATE INDEX idx_moods_user ON moods(user_id);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_movies_updated_at
    BEFORE UPDATE ON movies
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS)

ALTER TABLE movies ENABLE ROW LEVEL SECURITY;
ALTER TABLE gift_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE formats ENABLE ROW LEVEL SECURITY;
ALTER TABLE theaters ENABLE ROW LEVEL SECURITY;
ALTER TABLE moods ENABLE ROW LEVEL SECURITY;
ALTER TABLE aspects ENABLE ROW LEVEL SECURITY;
ALTER TABLE rewatch_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE platforms ENABLE ROW LEVEL SECURITY;
ALTER TABLE formula_configs ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Users can only access their own data

CREATE POLICY "Users can view own movies" ON movies
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own movies" ON movies
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own movies" ON movies
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own movies" ON movies
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own gift_cards" ON gift_cards
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own gift_cards" ON gift_cards
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own gift_cards" ON gift_cards
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own gift_cards" ON gift_cards
  FOR DELETE USING (auth.uid() = user_id);

-- Similar policies for all lookup tables
CREATE POLICY "Users can manage own formats" ON formats
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own theaters" ON theaters
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own moods" ON moods
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own aspects" ON aspects
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own rewatch_options" ON rewatch_options
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own platforms" ON platforms
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own formula_configs" ON formula_configs
  FOR ALL USING (auth.uid() = user_id);

-- Seed data function (call after user signs up)
CREATE OR REPLACE FUNCTION seed_user_defaults(p_user_id UUID)
RETURNS void AS $$
BEGIN
  -- Default formats (weights matching user's spreadsheet)
  INSERT INTO formats (user_id, name, weight, sort_order) VALUES
    (p_user_id, '2D', 1.0, 1),
    (p_user_id, '3D', 1.0, 2),
    (p_user_id, 'IMAX 2D', 1.6, 3),
    (p_user_id, 'IMAX 3D', 1.6, 4),
    (p_user_id, 'MX4D 2D', 1.3, 5),
    (p_user_id, 'MX4D 3D', 1.3, 6),
    (p_user_id, '4DX', 1.2, 7),
    (p_user_id, 'PXL', 1.4, 8),
    (p_user_id, 'Kotak Insignia', 1.25, 9),
    (p_user_id, 'Dolby Atmos', 1.3, 10),
    (p_user_id, 'ScreenX', 1.2, 11),
    (p_user_id, 'IMAX Laser', 1.7, 12);

  -- Default moods (matching user's spreadsheet)
  INSERT INTO moods (user_id, name, emoji, sentiment, sort_order) VALUES
    (p_user_id, 'Blown Away', NULL, 'positive', 1),
    (p_user_id, 'Energized', NULL, 'positive', 2),
    (p_user_id, 'Uplifted', NULL, 'positive', 3),
    (p_user_id, 'Satisfied', NULL, 'positive', 4),
    (p_user_id, 'Goosebumps', NULL, 'positive', 5),
    (p_user_id, 'Mixed', NULL, 'neutral', 6),
    (p_user_id, 'Pensive', NULL, 'neutral', 7),
    (p_user_id, 'Conflicted', NULL, 'neutral', 8),
    (p_user_id, 'Bored', NULL, 'negative', 9),
    (p_user_id, 'Disappointed', NULL, 'negative', 10),
    (p_user_id, 'Frustrated', NULL, 'negative', 11);

  -- Default aspects (matching user's spreadsheet)
  INSERT INTO aspects (user_id, name, category) VALUES
    (p_user_id, 'Story', 'narrative'),
    (p_user_id, 'Dialogues', 'narrative'),
    (p_user_id, 'Pacing', 'narrative'),
    (p_user_id, 'Worldbuilding', 'narrative'),
    (p_user_id, 'Theme Message', 'narrative'),
    (p_user_id, 'Logic', 'narrative'),
    (p_user_id, 'Acting', 'performance'),
    (p_user_id, 'Direction', 'technical'),
    (p_user_id, 'Cinematography', 'technical'),
    (p_user_id, 'VFX', 'technical'),
    (p_user_id, 'Animation', 'technical'),
    (p_user_id, 'Music', 'technical'),
    (p_user_id, 'Action Sequence', 'technical'),
    (p_user_id, 'Nothing', NULL);

  -- Default rewatch options (matching user's spreadsheet)
  INSERT INTO rewatch_options (user_id, name, value, sort_order) VALUES
    (p_user_id, 'Definitely', 5, 1),
    (p_user_id, 'Maybe', 4, 2),
    (p_user_id, 'Clip Rewatch', 3, 3),
    (p_user_id, 'Unlikely', 2, 4),
    (p_user_id, 'Never Again', 1, 5);

  -- Default platforms (including Zingoy and Woohoo)
  INSERT INTO platforms (user_id, name) VALUES
    (p_user_id, 'Zingoy'),
    (p_user_id, 'Woohoo'),
    (p_user_id, 'PVR INOX'),
    (p_user_id, 'Amazon Pay'),
    (p_user_id, 'BookMyShow'),
    (p_user_id, 'Other');

  -- Default formula config
  INSERT INTO formula_configs (user_id, name, params, is_active) VALUES
    (p_user_id, 'Default Formula', '{
      "rating_exponents": {
        "tier1": {"max_rating": 6, "exponent": 1.3},
        "tier2": {"max_rating": 7, "exponent": 1.4},
        "tier3": {"max_rating": 8, "exponent": 1.5},
        "tier4": {"max_rating": 9, "exponent": 1.8},
        "tier5": {"max_rating": 10, "exponent": 1.9}
      },
      "cost_floor": 100,
      "use_true_cost": true
    }', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
