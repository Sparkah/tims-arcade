ALTER TABLE gallery_curation_state
ADD COLUMN ready INTEGER NOT NULL DEFAULT 0
  CHECK (ready IN (0, 1));

CREATE TRIGGER gallery_hidden_insert_ready
BEFORE INSERT ON gallery_hidden_games
WHEN NOT EXISTS (
  SELECT 1 FROM gallery_curation_state
  WHERE singleton = 1 AND ready = 1
)
BEGIN
  SELECT RAISE(ABORT, 'gallery curation is not initialized');
END;

CREATE TRIGGER gallery_hidden_update_ready
BEFORE UPDATE ON gallery_hidden_games
WHEN NOT EXISTS (
  SELECT 1 FROM gallery_curation_state
  WHERE singleton = 1 AND ready = 1
)
BEGIN
  SELECT RAISE(ABORT, 'gallery curation is not initialized');
END;

CREATE TRIGGER gallery_hidden_delete_ready
BEFORE DELETE ON gallery_hidden_games
WHEN NOT EXISTS (
  SELECT 1 FROM gallery_curation_state
  WHERE singleton = 1 AND ready = 1
)
BEGIN
  SELECT RAISE(ABORT, 'gallery curation is not initialized');
END;
