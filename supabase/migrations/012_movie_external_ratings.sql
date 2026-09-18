-- IMDb, Letterboxd and Rotten Tomatoes ratings kept on the movie, so they
-- survive a broken scraper and can be used by stats and the Telegram bot.
-- Filled a few movies at a time by the telegram-cron ratings task.

ALTER TABLE movies ADD COLUMN IF NOT EXISTS external_ratings JSONB;

COMMENT ON COLUMN movies.external_ratings IS 'Last known outside ratings: {imdbId, imdb:{rating,votes}, letterboxd:{rating,votes}, rottenTomatoes:{score,certified}, updatedAt}. A failed source keeps its previous value.';
