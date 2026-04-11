-- Migration: Missing fields from spreadsheet + Payment tracking
-- Adds: watched_with, payment_methods columns to movies
-- Adds: capabilities to theaters (replacing rigid has_imax/has_4dx)
-- Updates: seed function with correct defaults

-- 1. Add missing fields to movies
ALTER TABLE movies ADD COLUMN IF NOT EXISTS watched_with TEXT;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS payment_methods JSONB DEFAULT '[]';

-- 2. Add flexible capabilities to theaters
ALTER TABLE theaters ADD COLUMN IF NOT EXISTS capabilities TEXT[] DEFAULT '{}';

-- 3. Update seed function with corrected defaults matching the user's spreadsheet
CREATE OR REPLACE FUNCTION seed_user_defaults(p_user_id UUID)
RETURNS void AS $$
BEGIN
  -- Default formats (weights matching spreadsheet)
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

  -- Default moods (matching spreadsheet)
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

  -- Default aspects (matching spreadsheet)
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

  -- Default rewatch options (matching spreadsheet)
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
