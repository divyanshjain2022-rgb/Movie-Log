-- Add purpose column to movie_gift_cards to distinguish ticket vs F&B gift card usage
ALTER TABLE movie_gift_cards ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'ticket';

-- Drop old unique constraint and add new one that includes purpose
-- (same GC can be used for both ticket and F&B on the same movie)
ALTER TABLE movie_gift_cards DROP CONSTRAINT IF EXISTS movie_gift_cards_movie_id_gift_card_id_key;
ALTER TABLE movie_gift_cards ADD CONSTRAINT movie_gift_cards_movie_gc_purpose_key UNIQUE(movie_id, gift_card_id, purpose);
