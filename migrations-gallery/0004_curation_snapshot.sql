ALTER TABLE gallery_curation_state
ADD COLUMN hidden_json TEXT NOT NULL DEFAULT '[]'
  CHECK (
    json_valid(hidden_json)
    AND json_type(hidden_json) = 'array'
  );

UPDATE gallery_curation_state
SET hidden_json = (
  SELECT json_group_array(slug)
  FROM (
    SELECT slug
    FROM gallery_hidden_games
    ORDER BY slug
  )
)
WHERE singleton = 1;

-- Runtime verifies ready=1 before mutation and never creates the singleton.
-- Removing the write triggers also permits a new database to be seeded while
-- ready=0, then atomically marked ready only after set/hash verification.
DROP TRIGGER IF EXISTS gallery_hidden_insert_ready;
DROP TRIGGER IF EXISTS gallery_hidden_update_ready;
DROP TRIGGER IF EXISTS gallery_hidden_delete_ready;
