-- The Cloudflare D1 migration runner rejects CREATE TRIGGER bodies, so install
-- these public guards separately with:
--   wrangler d1 execute dissertation-study --remote \
--     --file=scripts/dissertation_schedule_guards.sql
--
-- Every statement is idempotent. Runtime schedule validation checks the exact
-- expected trigger-name set and fails closed if this file was not applied.
PRAGMA foreign_keys = ON;

CREATE TRIGGER IF NOT EXISTS trg_study_schedule_insert_inactive
BEFORE INSERT ON study_schedules
WHEN NEW.active = 1
  OR EXISTS (
    SELECT 1
    FROM study_schedules
    WHERE version = NEW.version AND active = 1
  )
BEGIN
  SELECT RAISE(ABORT, 'schedule_must_be_seeded_inactive');
END;

CREATE TRIGGER IF NOT EXISTS trg_study_schedule_activate_valid
BEFORE UPDATE OF active ON study_schedules
WHEN OLD.active = 0 AND NEW.active = 1
BEGIN
  SELECT CASE WHEN NEW.schedule_hash
    <> '7c9d936307af533b738be71b08356e6dba987a2c9e9438a6b57c1de4d1dcebd2'
    THEN RAISE(ABORT, 'schedule_hash_mismatch') END;

  SELECT CASE WHEN (
    SELECT COUNT(*) FROM study_games WHERE active = 1
  ) <> 56 THEN RAISE(ABORT, 'schedule_active_game_count_invalid') END;

  SELECT CASE WHEN (
    SELECT COUNT(*)
    FROM study_schedule_sequences
    WHERE version = NEW.version
  ) <> 56 THEN RAISE(ABORT, 'schedule_sequence_count_invalid') END;

  SELECT CASE WHEN (
    SELECT COUNT(*)
    FROM study_schedule_items
    WHERE version = NEW.version
  ) <> 280 THEN RAISE(ABORT, 'schedule_slot_count_invalid') END;

  SELECT CASE WHEN (
    SELECT COUNT(*) FROM (
      SELECT q.sequence_number
      FROM study_schedule_sequences AS q
      LEFT JOIN study_schedule_items AS i
        ON i.version = q.version AND i.sequence_number = q.sequence_number
      WHERE q.version = NEW.version
      GROUP BY q.sequence_number
      HAVING COUNT(i.public_id) <> 5
        OR COUNT(DISTINCT i.order_position) <> 5
    )
  ) <> 0 THEN RAISE(ABORT, 'schedule_sequence_balance_invalid') END;

  SELECT CASE WHEN (
    SELECT COUNT(*) FROM (
      SELECT g.public_id
      FROM study_games AS g
      LEFT JOIN study_schedule_items AS i
        ON i.public_id = g.public_id AND i.version = NEW.version
      WHERE g.active = 1
      GROUP BY g.public_id
      HAVING COUNT(i.public_id) <> 5
        OR COUNT(DISTINCT i.order_position) <> 5
    )
  ) <> 0 THEN RAISE(ABORT, 'schedule_game_balance_invalid') END;

  SELECT CASE WHEN (
    SELECT COUNT(*)
    FROM study_schedule_items AS i
    LEFT JOIN study_games AS g
      ON g.public_id = i.public_id AND g.active = 1
    WHERE i.version = NEW.version AND g.public_id IS NULL
  ) <> 0 THEN RAISE(ABORT, 'schedule_inactive_game_present') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_study_schedule_deactivate_unclaimed
BEFORE UPDATE OF active ON study_schedules
WHEN OLD.active = 1
  AND NEW.active = 0
  AND EXISTS (
    SELECT 1
    FROM study_schedule_claims
    WHERE version = OLD.version
  )
BEGIN
  SELECT RAISE(ABORT, 'claimed_schedule_cannot_be_deactivated');
END;

CREATE TRIGGER IF NOT EXISTS trg_study_schedule_metadata_frozen
BEFORE UPDATE OF version, schedule_hash, target_sequences, session_size
ON study_schedules
WHEN OLD.active = 1
  AND (
    NEW.version <> OLD.version
    OR NEW.schedule_hash <> OLD.schedule_hash
    OR NEW.target_sequences <> OLD.target_sequences
    OR NEW.session_size <> OLD.session_size
  )
BEGIN
  SELECT RAISE(ABORT, 'active_schedule_metadata_frozen');
END;

CREATE TRIGGER IF NOT EXISTS trg_study_schedule_delete_frozen
BEFORE DELETE ON study_schedules
WHEN OLD.active = 1
  OR EXISTS (
    SELECT 1
    FROM study_schedule_claims
    WHERE version = OLD.version
  )
BEGIN
  SELECT RAISE(ABORT, 'active_or_claimed_schedule_frozen');
END;

CREATE TRIGGER IF NOT EXISTS trg_study_schedule_sequence_insert_frozen
BEFORE INSERT ON study_schedule_sequences
WHEN EXISTS (
  SELECT 1 FROM study_schedules
  WHERE version = NEW.version AND active = 1
)
BEGIN
  SELECT RAISE(ABORT, 'active_schedule_sequences_frozen');
END;

CREATE TRIGGER IF NOT EXISTS trg_study_schedule_sequence_update_frozen
BEFORE UPDATE ON study_schedule_sequences
WHEN (
  EXISTS (
    SELECT 1 FROM study_schedules
    WHERE version = OLD.version AND active = 1
  )
  OR EXISTS (
    SELECT 1 FROM study_schedules
    WHERE version = NEW.version AND active = 1
  )
)
  AND (
    NEW.version <> OLD.version
    OR NEW.sequence_number <> OLD.sequence_number
    OR NEW.issue_order <> OLD.issue_order
  )
BEGIN
  SELECT RAISE(ABORT, 'active_schedule_sequences_frozen');
END;

CREATE TRIGGER IF NOT EXISTS trg_study_schedule_sequence_delete_frozen
BEFORE DELETE ON study_schedule_sequences
WHEN EXISTS (
  SELECT 1 FROM study_schedules
  WHERE version = OLD.version AND active = 1
)
BEGIN
  SELECT RAISE(ABORT, 'active_schedule_sequences_frozen');
END;

CREATE TRIGGER IF NOT EXISTS trg_study_schedule_item_insert_frozen
BEFORE INSERT ON study_schedule_items
WHEN EXISTS (
  SELECT 1 FROM study_schedules
  WHERE version = NEW.version AND active = 1
)
BEGIN
  SELECT RAISE(ABORT, 'active_schedule_items_frozen');
END;

CREATE TRIGGER IF NOT EXISTS trg_study_schedule_item_update_frozen
BEFORE UPDATE ON study_schedule_items
WHEN (
  EXISTS (
    SELECT 1 FROM study_schedules
    WHERE version = OLD.version AND active = 1
  )
  OR EXISTS (
    SELECT 1 FROM study_schedules
    WHERE version = NEW.version AND active = 1
  )
)
  AND (
    NEW.version <> OLD.version
    OR NEW.sequence_number <> OLD.sequence_number
    OR NEW.order_position <> OLD.order_position
    OR NEW.public_id <> OLD.public_id
  )
BEGIN
  SELECT RAISE(ABORT, 'active_schedule_items_frozen');
END;

CREATE TRIGGER IF NOT EXISTS trg_study_schedule_item_delete_frozen
BEFORE DELETE ON study_schedule_items
WHEN EXISTS (
  SELECT 1 FROM study_schedules
  WHERE version = OLD.version AND active = 1
)
BEGIN
  SELECT RAISE(ABORT, 'active_schedule_items_frozen');
END;

CREATE TRIGGER IF NOT EXISTS trg_study_schedule_claim_valid
BEFORE INSERT ON study_schedule_claims
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM study_schedules
    WHERE version = NEW.version AND active = 1
  ) THEN RAISE(ABORT, 'schedule_not_active') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM study_schedule_completions
    WHERE version = NEW.version
      AND sequence_number = NEW.sequence_number
  ) THEN RAISE(ABORT, 'schedule_sequence_complete') END;

  SELECT CASE WHEN NEW.claim_number <> COALESCE((
    SELECT MAX(claim_number) + 1
    FROM study_schedule_claims
    WHERE version = NEW.version
      AND sequence_number = NEW.sequence_number
  ), 1) THEN RAISE(ABORT, 'schedule_claim_out_of_order') END;

  SELECT CASE WHEN NEW.claim_number = 1 AND EXISTS (
    SELECT 1
    FROM study_schedule_sequences AS earlier
    INNER JOIN study_schedule_sequences AS current
      ON current.version = earlier.version
      AND current.sequence_number = NEW.sequence_number
    WHERE earlier.version = NEW.version
      AND earlier.issue_order < current.issue_order
      AND NOT EXISTS (
        SELECT 1
        FROM study_schedule_claims AS prior_claim
        WHERE prior_claim.version = earlier.version
          AND prior_claim.sequence_number = earlier.sequence_number
      )
  ) THEN RAISE(ABORT, 'schedule_not_next_unclaimed') END;

  SELECT CASE WHEN NEW.claim_number > 1 AND (
    SELECT COUNT(DISTINCT sequence_number)
    FROM study_schedule_claims
    WHERE version = NEW.version
  ) < 56 THEN RAISE(ABORT, 'schedule_initial_issue_incomplete') END;

  SELECT CASE WHEN NEW.claim_number > 1 AND COALESCE((
    SELECT
      unixepoch(NEW.claimed_at) - unixepoch(claimed_at)
    FROM study_schedule_claims
    WHERE version = NEW.version
      AND sequence_number = NEW.sequence_number
    ORDER BY claim_number DESC
    LIMIT 1
  ), -1) < 1800 THEN RAISE(ABORT, 'schedule_claim_not_stale') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_study_schedule_completion_valid
BEFORE INSERT ON study_schedule_completions
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM study_sessions AS s
    INNER JOIN study_schedule_claims AS c ON c.session_id = s.session_id
    WHERE s.session_id = NEW.session_id
      AND s.status = 'complete'
      AND c.version = NEW.version
      AND c.sequence_number = NEW.sequence_number
  ) THEN RAISE(ABORT, 'invalid_schedule_completion') END;
END;
