-- Occupancy + seat-map snapshot for logged movies.
-- Captured from PVR's live seat layout at log time (PVR has no historical
-- occupancy, so this is a point-in-time snapshot stored on the movie).

ALTER TABLE movies ADD COLUMN IF NOT EXISTS occupancy DECIMAL(5,2);
ALTER TABLE movies ADD COLUMN IF NOT EXISTS seat_map JSONB;

COMMENT ON COLUMN movies.occupancy IS 'Percent of seats sold at capture time (0-100).';
COMMENT ON COLUMN movies.seat_map IS 'Snapshot of the PVR seat layout at capture time (categories, rows, counts).';
