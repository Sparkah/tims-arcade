ALTER TABLE gallery_curation_state
ADD COLUMN revision INTEGER NOT NULL DEFAULT 1
  CHECK (revision >= 1);
