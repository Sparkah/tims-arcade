PRAGMA foreign_keys = ON;

-- The five-game protocol was never used in production. Refuse to rebuild its
-- constrained tables if any participant record exists, so this migration can
-- never silently mix the two instruments or discard collected data.
CREATE TABLE _study_all_games_empty_guard (
  must_be_zero INTEGER NOT NULL CHECK (must_be_zero = 0)
);

INSERT INTO _study_all_games_empty_guard (must_be_zero)
SELECT
  (SELECT COUNT(*) FROM study_sessions)
  + (SELECT COUNT(*) FROM study_assignments)
  + (SELECT COUNT(*) FROM study_responses)
  + (SELECT COUNT(*) FROM study_schedule_claims)
  + (SELECT COUNT(*) FROM study_schedule_completions);

-- D1 installs schedule triggers through scripts/dissertation_schedule_guards.sql.
-- Drop the five-game definitions before replacing the constrained tables.
DROP TRIGGER IF EXISTS trg_study_schedule_activate_valid;
DROP TRIGGER IF EXISTS trg_study_schedule_claim_valid;
DROP TRIGGER IF EXISTS trg_study_schedule_completion_valid;
DROP TRIGGER IF EXISTS trg_study_schedule_deactivate_unclaimed;
DROP TRIGGER IF EXISTS trg_study_schedule_delete_frozen;
DROP TRIGGER IF EXISTS trg_study_schedule_insert_inactive;
DROP TRIGGER IF EXISTS trg_study_schedule_item_delete_frozen;
DROP TRIGGER IF EXISTS trg_study_schedule_item_insert_frozen;
DROP TRIGGER IF EXISTS trg_study_schedule_item_update_frozen;
DROP TRIGGER IF EXISTS trg_study_schedule_metadata_frozen;
DROP TRIGGER IF EXISTS trg_study_schedule_sequence_delete_frozen;
DROP TRIGGER IF EXISTS trg_study_schedule_sequence_insert_frozen;
DROP TRIGGER IF EXISTS trg_study_schedule_sequence_update_frozen;

DROP TABLE study_schedule_completions;
DROP TABLE study_schedule_claims;
DROP TABLE study_schedule_items;
DROP TABLE study_schedule_sequences;
DROP TABLE study_schedules;

DROP TABLE study_responses;
DROP TABLE study_assignments;
DROP TABLE study_sessions;

CREATE TABLE study_sessions (
  session_id TEXT PRIMARY KEY
    CHECK (length(session_id) = 36),
  creation_id TEXT NOT NULL UNIQUE
    CHECK (length(creation_id) = 36),
  information_version TEXT NOT NULL
    CHECK (length(information_version) BETWEEN 1 AND 120),
  service_evaluation_basis TEXT NOT NULL
    CHECK (length(service_evaluation_basis) BETWEEN 1 AND 200),
  opened_at TEXT NOT NULL,
  last_activity_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'complete')),
  completed_at TEXT,
  CHECK (
    (status = 'active' AND completed_at IS NULL)
    OR (status = 'complete' AND completed_at IS NOT NULL)
  )
);

CREATE INDEX idx_study_sessions_status
  ON study_sessions(status, opened_at);

CREATE INDEX idx_study_sessions_activity
  ON study_sessions(status, last_activity_at);

CREATE TABLE study_assignments (
  session_id TEXT NOT NULL,
  public_id TEXT NOT NULL,
  order_position INTEGER NOT NULL
    CHECK (order_position BETWEEN 1 AND 56),
  assigned_at TEXT NOT NULL,
  started_at TEXT,
  PRIMARY KEY (session_id, public_id),
  UNIQUE (session_id, order_position),
  FOREIGN KEY (session_id) REFERENCES study_sessions(session_id) ON DELETE CASCADE,
  FOREIGN KEY (public_id) REFERENCES study_games(public_id) ON DELETE RESTRICT
);

CREATE TABLE study_responses (
  response_id TEXT PRIMARY KEY
    CHECK (length(response_id) = 36),
  record_version INTEGER NOT NULL DEFAULT 2
    CHECK (record_version = 2),
  session_id TEXT NOT NULL,
  public_id TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  playtime_seconds REAL NOT NULL
    CHECK (playtime_seconds BETWEEN 0 AND 3600),
  playtime_censored INTEGER NOT NULL DEFAULT 0
    CHECK (playtime_censored IN (0, 1)),
  rating TEXT
    CHECK (rating IN ('like', 'dislike')),
  skip_reason TEXT
    CHECK (skip_reason IN (
      'technical_failure',
      'confusing_or_unplayable',
      'voluntary_skip'
    )),
  device_class TEXT NOT NULL
    CHECK (device_class IN ('desktop', 'tablet', 'mobile', 'unknown')),
  viewport_class TEXT NOT NULL
    CHECK (viewport_class IN ('narrow', 'medium', 'wide', 'unknown')),
  input_method TEXT NOT NULL
    CHECK (input_method IN (
      'mouse-or-trackpad',
      'touch',
      'keyboard',
      'mixed',
      'unknown'
    )),
  visibility_loss_count INTEGER NOT NULL
    CHECK (visibility_loss_count BETWEEN 0 AND 1000),
  UNIQUE (session_id, public_id),
  CHECK (
    (rating IS NOT NULL AND skip_reason IS NULL)
    OR (rating IS NULL AND skip_reason IS NOT NULL)
  ),
  FOREIGN KEY (session_id, public_id)
    REFERENCES study_assignments(session_id, public_id)
    ON DELETE CASCADE
);

CREATE INDEX idx_study_assignments_game
  ON study_assignments(public_id, assigned_at);

CREATE INDEX idx_study_assignments_session_order
  ON study_assignments(session_id, order_position);

CREATE INDEX idx_study_responses_game
  ON study_responses(public_id, ended_at);

CREATE INDEX idx_study_responses_session
  ON study_responses(session_id);

CREATE TABLE study_schedules (
  version TEXT PRIMARY KEY
    CHECK (length(version) BETWEEN 1 AND 120),
  schedule_hash TEXT NOT NULL UNIQUE
    CHECK (length(schedule_hash) = 64),
  target_sequences INTEGER NOT NULL
    CHECK (target_sequences = 56),
  session_size INTEGER NOT NULL
    CHECK (session_size = 56),
  active INTEGER NOT NULL DEFAULT 0
    CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_study_schedules_one_active
  ON study_schedules(active)
  WHERE active = 1;

CREATE TABLE study_schedule_sequences (
  version TEXT NOT NULL,
  sequence_number INTEGER NOT NULL
    CHECK (sequence_number BETWEEN 1 AND 56),
  issue_order INTEGER NOT NULL
    CHECK (issue_order BETWEEN 1 AND 56),
  PRIMARY KEY (version, sequence_number),
  UNIQUE (version, issue_order),
  FOREIGN KEY (version) REFERENCES study_schedules(version) ON DELETE CASCADE
);

CREATE TABLE study_schedule_items (
  version TEXT NOT NULL,
  sequence_number INTEGER NOT NULL,
  order_position INTEGER NOT NULL
    CHECK (order_position BETWEEN 1 AND 56),
  public_id TEXT NOT NULL,
  PRIMARY KEY (version, sequence_number, order_position),
  UNIQUE (version, sequence_number, public_id),
  FOREIGN KEY (version, sequence_number)
    REFERENCES study_schedule_sequences(version, sequence_number)
    ON DELETE CASCADE,
  FOREIGN KEY (public_id) REFERENCES study_games(public_id) ON DELETE RESTRICT
);

CREATE INDEX idx_study_schedule_items_game_position
  ON study_schedule_items(version, public_id, order_position);

CREATE TABLE study_schedule_claims (
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

CREATE INDEX idx_study_schedule_claims_latest
  ON study_schedule_claims(version, sequence_number, claim_number, claimed_at);

CREATE TABLE study_schedule_completions (
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

DROP TABLE _study_all_games_empty_guard;
