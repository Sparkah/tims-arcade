-- Mark the participant-shell geometry used for each response. Existing rows
-- and submissions from pre-deployment browser tabs remain NULL; responses
-- produced by the fitted one-screen player are mobile-fit-v1.
ALTER TABLE study_responses
ADD COLUMN player_layout_version TEXT
  CHECK (
    player_layout_version IS NULL
    OR length(player_layout_version) BETWEEN 1 AND 64
  );
