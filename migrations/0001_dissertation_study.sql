PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS study_games (
  public_id TEXT PRIMARY KEY
    CHECK (length(public_id) BETWEEN 8 AND 40),
  public_path TEXT NOT NULL UNIQUE,
  condition TEXT NOT NULL
    CHECK (condition IN ('T1', 'T1B', 'T2', 'T3', 'T4', 'T5')),
  prompt_id TEXT NOT NULL
    CHECK (length(prompt_id) BETWEEN 1 AND 80),
  trial INTEGER NOT NULL
    CHECK (trial BETWEEN 1 AND 5),
  source_run_id TEXT NOT NULL UNIQUE
    CHECK (length(source_run_id) BETWEEN 1 AND 200),
  batch_id TEXT NOT NULL
    CHECK (length(batch_id) BETWEEN 1 AND 240),
  source_sha256 TEXT NOT NULL
    CHECK (length(source_sha256) = 64),
  served_sha256 TEXT NOT NULL
    CHECK (length(served_sha256) = 64),
  active INTEGER NOT NULL DEFAULT 1
    CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS study_sessions (
  session_id TEXT PRIMARY KEY
    CHECK (length(session_id) = 36),
  consent_version TEXT NOT NULL
    CHECK (length(consent_version) BETWEEN 1 AND 120),
  ethics_confirmation_id TEXT NOT NULL
    CHECK (length(ethics_confirmation_id) BETWEEN 1 AND 200),
  consented_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'complete')),
  completed_at TEXT,
  CHECK (
    (status = 'active' AND completed_at IS NULL)
    OR (status = 'complete' AND completed_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS study_assignments (
  session_id TEXT NOT NULL,
  public_id TEXT NOT NULL,
  order_position INTEGER NOT NULL
    CHECK (order_position BETWEEN 1 AND 5),
  assigned_at TEXT NOT NULL,
  started_at TEXT,
  PRIMARY KEY (session_id, public_id),
  UNIQUE (session_id, order_position),
  FOREIGN KEY (session_id) REFERENCES study_sessions(session_id) ON DELETE CASCADE,
  FOREIGN KEY (public_id) REFERENCES study_games(public_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS study_responses (
  response_id TEXT PRIMARY KEY
    CHECK (length(response_id) = 36),
  record_version INTEGER NOT NULL DEFAULT 1
    CHECK (record_version = 1),
  session_id TEXT NOT NULL,
  public_id TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  playtime_seconds REAL NOT NULL
    CHECK (playtime_seconds BETWEEN 0 AND 3600),
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

CREATE INDEX IF NOT EXISTS idx_study_games_active
  ON study_games(active, prompt_id, condition);

CREATE INDEX IF NOT EXISTS idx_study_assignments_game
  ON study_assignments(public_id, assigned_at);

CREATE INDEX IF NOT EXISTS idx_study_assignments_session_order
  ON study_assignments(session_id, order_position);

CREATE INDEX IF NOT EXISTS idx_study_responses_game
  ON study_responses(public_id, ended_at);

CREATE INDEX IF NOT EXISTS idx_study_responses_session
  ON study_responses(session_id);

CREATE INDEX IF NOT EXISTS idx_study_sessions_status
  ON study_sessions(status, consented_at);
