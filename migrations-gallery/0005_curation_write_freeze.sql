ALTER TABLE gallery_curation_state
ADD COLUMN write_enabled INTEGER NOT NULL DEFAULT 1
  CHECK (write_enabled IN (0, 1));

-- Rollback freezes writes before copying the D1 snapshot to legacy KV. These
-- guards serialize the freeze against any in-flight per-slug mutation.
CREATE TRIGGER gallery_hidden_insert_write_enabled
BEFORE INSERT ON gallery_hidden_games
WHEN NOT EXISTS (
  SELECT 1 FROM gallery_curation_state
  WHERE singleton = 1 AND write_enabled = 1
)
BEGIN
  SELECT RAISE(ABORT, 'gallery curation writes are frozen');
END;

CREATE TRIGGER gallery_hidden_update_write_enabled
BEFORE UPDATE ON gallery_hidden_games
WHEN NOT EXISTS (
  SELECT 1 FROM gallery_curation_state
  WHERE singleton = 1 AND write_enabled = 1
)
BEGIN
  SELECT RAISE(ABORT, 'gallery curation writes are frozen');
END;

CREATE TRIGGER gallery_hidden_delete_write_enabled
BEFORE DELETE ON gallery_hidden_games
WHEN NOT EXISTS (
  SELECT 1 FROM gallery_curation_state
  WHERE singleton = 1 AND write_enabled = 1
)
BEGIN
  SELECT RAISE(ABORT, 'gallery curation writes are frozen');
END;
