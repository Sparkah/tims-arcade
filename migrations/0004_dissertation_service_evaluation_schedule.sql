PRAGMA foreign_keys = ON;

ALTER TABLE study_sessions
  RENAME COLUMN consent_version TO information_version;
ALTER TABLE study_sessions
  RENAME COLUMN ethics_confirmation_id TO service_evaluation_basis;
ALTER TABLE study_sessions
  RENAME COLUMN consented_at TO opened_at;

DROP INDEX IF EXISTS idx_study_sessions_status;
CREATE INDEX idx_study_sessions_status
  ON study_sessions(status, opened_at);

CREATE TABLE IF NOT EXISTS study_schedules (
  version TEXT PRIMARY KEY
    CHECK (length(version) BETWEEN 1 AND 120),
  schedule_hash TEXT NOT NULL UNIQUE
    CHECK (length(schedule_hash) = 64),
  target_sequences INTEGER NOT NULL
    CHECK (target_sequences = 56),
  session_size INTEGER NOT NULL
    CHECK (session_size = 5),
  active INTEGER NOT NULL DEFAULT 0
    CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_study_schedules_one_active
  ON study_schedules(active)
  WHERE active = 1;

CREATE TABLE IF NOT EXISTS study_schedule_sequences (
  version TEXT NOT NULL,
  sequence_number INTEGER NOT NULL
    CHECK (sequence_number BETWEEN 1 AND 56),
  issue_order INTEGER NOT NULL
    CHECK (issue_order BETWEEN 1 AND 56),
  PRIMARY KEY (version, sequence_number),
  UNIQUE (version, issue_order),
  FOREIGN KEY (version) REFERENCES study_schedules(version) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS study_schedule_items (
  version TEXT NOT NULL,
  sequence_number INTEGER NOT NULL,
  order_position INTEGER NOT NULL
    CHECK (order_position BETWEEN 1 AND 5),
  public_id TEXT NOT NULL,
  PRIMARY KEY (version, sequence_number, order_position),
  UNIQUE (version, sequence_number, public_id),
  FOREIGN KEY (version, sequence_number)
    REFERENCES study_schedule_sequences(version, sequence_number)
    ON DELETE CASCADE,
  FOREIGN KEY (public_id) REFERENCES study_games(public_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_study_schedule_items_game_position
  ON study_schedule_items(version, public_id, order_position);

CREATE TABLE IF NOT EXISTS study_schedule_claims (
  session_id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  sequence_number INTEGER NOT NULL,
  claim_number INTEGER NOT NULL
    CHECK (claim_number BETWEEN 1 AND 500),
  claimed_at TEXT NOT NULL,
  UNIQUE (version, sequence_number, claim_number),
  FOREIGN KEY (session_id) REFERENCES study_sessions(session_id) ON DELETE CASCADE,
  FOREIGN KEY (version, sequence_number)
    REFERENCES study_schedule_sequences(version, sequence_number)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_study_schedule_claims_latest
  ON study_schedule_claims(version, sequence_number, claim_number, claimed_at);

CREATE TABLE IF NOT EXISTS study_schedule_completions (
  session_id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  sequence_number INTEGER NOT NULL,
  completed_at TEXT NOT NULL,
  UNIQUE (version, sequence_number),
  FOREIGN KEY (session_id) REFERENCES study_sessions(session_id) ON DELETE CASCADE,
  FOREIGN KEY (version, sequence_number)
    REFERENCES study_schedule_sequences(version, sequence_number)
    ON DELETE RESTRICT
);
