import { json, sameOriginOk } from './response.js';

export const STUDY_SESSION_SIZE = 5;
export const STUDY_ELIGIBLE_FALLBACK = 56;
export const STUDY_TARGET_SEQUENCES = 56;
export const STUDY_SCHEDULE_HASH = '7c9d936307af533b738be71b08356e6dba987a2c9e9438a6b57c1de4d1dcebd2';
export const STUDY_SCHEDULE_GUARD_TRIGGERS = Object.freeze([
  'trg_study_schedule_activate_valid',
  'trg_study_schedule_claim_valid',
  'trg_study_schedule_completion_valid',
  'trg_study_schedule_deactivate_unclaimed',
  'trg_study_schedule_delete_frozen',
  'trg_study_schedule_insert_inactive',
  'trg_study_schedule_item_delete_frozen',
  'trg_study_schedule_item_insert_frozen',
  'trg_study_schedule_item_update_frozen',
  'trg_study_schedule_metadata_frozen',
  'trg_study_schedule_sequence_delete_frozen',
  'trg_study_schedule_sequence_insert_frozen',
  'trg_study_schedule_sequence_update_frozen',
]);
export const STUDY_RECORD_VERSION = 1;
export const MIN_RATING_SECONDS = 10;
export const SCHEDULE_REISSUE_AFTER_MS = 30 * 60 * 1000;
export const MAX_SESSIONS_PER_UTC_DAY = 500;
export const MAX_MUTATIONS_PER_MINUTE = 20;
export const RATE_BUCKET_RETENTION_DAYS = 2;

const MAX_BODY_BYTES = 4096;
const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PUBLIC_ID_RE = /^[a-z0-9][a-z0-9_-]{7,39}$/;
const PUBLIC_PATH_RE = /^\/dissertation\/g\/([a-z0-9][a-z0-9_-]{7,39})\/(?:index\.html)?$/;

export const DEVICE_CLASSES = new Set(['desktop', 'tablet', 'mobile', 'unknown']);
export const VIEWPORT_CLASSES = new Set(['narrow', 'medium', 'wide', 'unknown']);
export const INPUT_METHODS = new Set([
  'mouse-or-trackpad',
  'touch',
  'keyboard',
  'mixed',
  'unknown',
]);
export const RATINGS = new Set(['like', 'dislike']);
export const SKIP_REASONS = new Set([
  'technical_failure',
  'confusing_or_unplayable',
  'voluntary_skip',
]);

export function studyJson(body, status = 200, headers = {}) {
  return json(body, status, {
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...headers,
  });
}

export function studyError(code, status) {
  return studyJson({ error: code }, status);
}

export function studyConfiguration(env = {}) {
  const serviceEvaluationBasis = String(
    env.DISSERTATION_SERVICE_EVALUATION_BASIS || '',
  ).trim();
  const informationVersion = String(env.DISSERTATION_INFORMATION_VERSION || '').trim();
  const db = env.DISSERTATION_DB;
  const open = env.DISSERTATION_STUDY_OPEN === '1'
    && Boolean(serviceEvaluationBasis)
    && Boolean(informationVersion)
    && Boolean(db);

  return {
    open,
    db,
    serviceEvaluationBasis,
    informationVersion,
  };
}

export function requireOpenStudy(env) {
  const config = studyConfiguration(env);
  if (!config.db) {
    return { config, response: studyError('study_unavailable', 503) };
  }
  if (!config.open) {
    return { config, response: studyError('study_closed', 403) };
  }
  return { config, response: null };
}

async function claimRateBudget(db, bucketKey, windowStart, limit) {
  const row = await db.prepare(`
    INSERT INTO study_rate_buckets (bucket_key, window_start, used)
    VALUES (?, ?, 1)
    ON CONFLICT(bucket_key) DO UPDATE SET
      used = study_rate_buckets.used + 1
    WHERE study_rate_buckets.used < ?
    RETURNING used
  `).bind(bucketKey, windowStart, limit).first();
  return Boolean(row && Number(row.used) >= 1);
}

export async function studyAbuseProtectionReady(db) {
  if (!db) return false;
  try {
    await db.prepare('SELECT used FROM study_rate_buckets LIMIT 1').first();
    return true;
  } catch {
    return false;
  }
}

export async function enforceStudyRateLimit(config, key, now = new Date()) {
  const iso = now.toISOString();
  const minute = iso.slice(0, 16);
  const day = iso.slice(0, 10);
  try {
    const available = await claimRateBudget(
      config.db,
      `minute:${minute}:${key}`,
      day,
      MAX_MUTATIONS_PER_MINUTE,
    );
    if (!available) {
      return studyJson(
        { error: 'rate_limited' },
        429,
        { 'retry-after': '60' },
      );
    }
  } catch {
    return studyError('study_unavailable', 503);
  }
  return null;
}

export async function claimDailySessionBudget(db, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  const bucketKey = `session-create:${day}`;
  const available = await claimRateBudget(
    db,
    bucketKey,
    day,
    MAX_SESSIONS_PER_UTC_DAY,
  );
  const cutoff = new Date(
    now.getTime() - RATE_BUCKET_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString().slice(0, 10);
  await db.prepare(
    'DELETE FROM study_rate_buckets WHERE window_start < ?',
  ).bind(cutoff).run();
  return available;
}

export async function readStudyJson(request, allowedKeys, requiredKeys = allowedKeys) {
  if (!sameOriginOk(request)) {
    return { body: null, response: studyError('forbidden', 403) };
  }

  const fetchSite = String(request.headers.get('Sec-Fetch-Site') || '').toLowerCase();
  if (fetchSite === 'cross-site') {
    return { body: null, response: studyError('forbidden', 403) };
  }

  const contentType = String(request.headers.get('Content-Type') || '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase();
  if (contentType !== 'application/json') {
    return { body: null, response: studyError('content_type_must_be_json', 415) };
  }

  const declaredLength = Number(request.headers.get('Content-Length') || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return { body: null, response: studyError('request_too_large', 413) };
  }

  let text;
  try {
    text = await request.text();
  } catch {
    return { body: null, response: studyError('invalid_json', 400) };
  }
  if (!text || new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    return {
      body: null,
      response: studyError(text ? 'request_too_large' : 'invalid_json', text ? 413 : 400),
    };
  }

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return { body: null, response: studyError('invalid_json', 400) };
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { body: null, response: studyError('invalid_body', 400) };
  }

  const allowed = new Set(allowedKeys);
  if (Object.keys(body).some(key => !allowed.has(key))) {
    return { body: null, response: studyError('unexpected_field', 400) };
  }
  if (requiredKeys.some(key => !Object.hasOwn(body, key))) {
    return { body: null, response: studyError('missing_field', 400) };
  }

  return { body, response: null };
}

export function validSessionId(value) {
  return typeof value === 'string' && SESSION_ID_RE.test(value);
}

export function validPublicId(value) {
  return typeof value === 'string' && PUBLIC_ID_RE.test(value);
}

export function validPublicGameRow(row) {
  if (!row || !validPublicId(row.public_id) || typeof row.path !== 'string') return false;
  const match = row.path.match(PUBLIC_PATH_RE);
  return Boolean(match && match[1] === row.public_id);
}

export function nowIso() {
  return new Date().toISOString();
}

export function newUuid() {
  return crypto.randomUUID();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function validateScheduleStructure(summary = {}) {
  return number(summary.activeScheduleCount) === 1
    && typeof summary.version === 'string'
    && summary.version.length >= 1
    && summary.scheduleHash === STUDY_SCHEDULE_HASH
    && summary.computedScheduleHash === STUDY_SCHEDULE_HASH
    && summary.guardTriggersReady === true
    && number(summary.guardTriggerCount) === STUDY_SCHEDULE_GUARD_TRIGGERS.length
    && number(summary.targetSequences) === STUDY_TARGET_SEQUENCES
    && number(summary.sessionSize) === STUDY_SESSION_SIZE
    && number(summary.activeGames) === STUDY_ELIGIBLE_FALLBACK
    && number(summary.sequenceCount) === STUDY_TARGET_SEQUENCES
    && number(summary.slotCount) === STUDY_TARGET_SEQUENCES * STUDY_SESSION_SIZE
    && number(summary.badSequenceCount) === 0
    && number(summary.badGameCount) === 0
    && number(summary.inactiveItemCount) === 0;
}

export function canonicalScheduleJson(scheduleRows) {
  if (!Array.isArray(scheduleRows)
      || scheduleRows.length !== STUDY_TARGET_SEQUENCES * STUDY_SESSION_SIZE) {
    return null;
  }

  const issueOrder = Array(STUDY_TARGET_SEQUENCES);
  const rows = Array.from(
    { length: STUDY_TARGET_SEQUENCES },
    () => Array(STUDY_SESSION_SIZE),
  );
  for (const item of scheduleRows) {
    const sequenceNumber = number(item && item.sequence_number);
    const issue = number(item && item.issue_order);
    const position = number(item && item.order_position);
    if (!Number.isInteger(sequenceNumber)
        || sequenceNumber < 1
        || sequenceNumber > STUDY_TARGET_SEQUENCES
        || !Number.isInteger(issue)
        || issue < 1
        || issue > STUDY_TARGET_SEQUENCES
        || !Number.isInteger(position)
        || position < 1
        || position > STUDY_SESSION_SIZE
        || !validPublicId(item && item.public_id)) {
      return null;
    }

    const sequenceIndex = sequenceNumber - 1;
    const positionIndex = position - 1;
    if (issueOrder[sequenceIndex] === undefined) {
      issueOrder[sequenceIndex] = issue;
    } else if (issueOrder[sequenceIndex] !== issue) {
      return null;
    }
    if (rows[sequenceIndex][positionIndex] !== undefined) return null;
    rows[sequenceIndex][positionIndex] = item.public_id;
  }
  if (issueOrder.some(value => value === undefined)
      || rows.some(row => row.some(value => value === undefined))) {
    return null;
  }
  return JSON.stringify({ issue_order: issueOrder, rows });
}

export async function computeScheduleHash(scheduleRows) {
  const canonical = canonicalScheduleJson(scheduleRows);
  if (!canonical) return null;
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonical),
  );
  return Array.from(
    new Uint8Array(digest),
    byte => byte.toString(16).padStart(2, '0'),
  ).join('');
}

export function selectScheduleCandidate(unclaimed, reissuable) {
  if (unclaimed) {
    return {
      version: String(unclaimed.version),
      sequenceNumber: number(unclaimed.sequence_number),
      issueOrder: number(unclaimed.issue_order),
      claimNumber: 1,
      kind: 'initial',
    };
  }
  if (reissuable) {
    return {
      version: String(reissuable.version),
      sequenceNumber: number(reissuable.sequence_number),
      issueOrder: number(reissuable.issue_order),
      claimNumber: number(reissuable.claim_number),
      kind: 'reissue',
    };
  }
  return null;
}

async function scheduleSummary(db, schedule) {
  const [result, scheduleItems, scheduleGuardTriggers] = await Promise.all([
    db.prepare(`
      WITH chosen(version) AS (SELECT ?)
      SELECT
        (SELECT COUNT(*) FROM study_games WHERE active = 1) AS active_games,
        (
          SELECT COUNT(*)
          FROM study_schedule_sequences
          WHERE version = (SELECT version FROM chosen)
        ) AS sequence_count,
        (
          SELECT COUNT(*)
          FROM study_schedule_items
          WHERE version = (SELECT version FROM chosen)
        ) AS slot_count,
        (
          SELECT COUNT(*) FROM (
            SELECT q.sequence_number
            FROM study_schedule_sequences AS q
            LEFT JOIN study_schedule_items AS i
              ON i.version = q.version AND i.sequence_number = q.sequence_number
            WHERE q.version = (SELECT version FROM chosen)
            GROUP BY q.sequence_number
            HAVING COUNT(i.public_id) <> 5
              OR COUNT(DISTINCT i.order_position) <> 5
          )
        ) AS bad_sequence_count,
        (
          SELECT COUNT(*) FROM (
            SELECT g.public_id
            FROM study_games AS g
            LEFT JOIN study_schedule_items AS i
              ON i.public_id = g.public_id
              AND i.version = (SELECT version FROM chosen)
            WHERE g.active = 1
            GROUP BY g.public_id
            HAVING COUNT(i.public_id) <> 5
              OR COUNT(DISTINCT i.order_position) <> 5
          )
        ) AS bad_game_count,
        (
          SELECT COUNT(*)
          FROM study_schedule_items AS i
          LEFT JOIN study_games AS g
            ON g.public_id = i.public_id AND g.active = 1
          WHERE i.version = (SELECT version FROM chosen)
            AND g.public_id IS NULL
        ) AS inactive_item_count,
        (
          SELECT COUNT(*)
          FROM study_schedule_completions
          WHERE version = (SELECT version FROM chosen)
        ) AS completed_sequences
    `).bind(schedule.version).first(),
    db.prepare(`
      SELECT
        q.sequence_number,
        q.issue_order,
        i.order_position,
        i.public_id
      FROM study_schedule_sequences AS q
      INNER JOIN study_schedule_items AS i
        ON i.version = q.version AND i.sequence_number = q.sequence_number
      WHERE q.version = ?
      ORDER BY q.sequence_number, i.order_position
    `).bind(schedule.version).all(),
    db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'trigger'
        AND name LIKE 'trg_study_schedule_%'
      ORDER BY name
    `).all(),
  ]);
  const computedScheduleHash = await computeScheduleHash(
    (scheduleItems && scheduleItems.results) || [],
  );
  const guardTriggerNames = (
    (scheduleGuardTriggers && scheduleGuardTriggers.results) || []
  ).map(row => String(row.name));
  const guardTriggersReady = guardTriggerNames.length
    === STUDY_SCHEDULE_GUARD_TRIGGERS.length
    && guardTriggerNames.every(
      (name, index) => name === STUDY_SCHEDULE_GUARD_TRIGGERS[index],
    );

  return {
    activeScheduleCount: 1,
    version: schedule.version,
    scheduleHash: schedule.schedule_hash,
    computedScheduleHash,
    guardTriggersReady,
    guardTriggerCount: guardTriggerNames.length,
    targetSequences: schedule.target_sequences,
    sessionSize: schedule.session_size,
    activeGames: result && result.active_games,
    sequenceCount: result && result.sequence_count,
    slotCount: result && result.slot_count,
    badSequenceCount: result && result.bad_sequence_count,
    badGameCount: result && result.bad_game_count,
    inactiveItemCount: result && result.inactive_item_count,
    completedSequences: result && result.completed_sequences,
  };
}

export async function findEligibleScheduleCandidate(db, version, now = new Date()) {
  const unclaimed = await db.prepare(`
    SELECT q.version, q.sequence_number, q.issue_order
    FROM study_schedule_sequences AS q
    INNER JOIN study_schedules AS schedule
      ON schedule.version = q.version AND schedule.active = 1
    LEFT JOIN study_schedule_claims AS c
      ON c.version = q.version AND c.sequence_number = q.sequence_number
    WHERE q.version = ?
    GROUP BY q.version, q.sequence_number, q.issue_order
    HAVING COUNT(c.session_id) = 0
    ORDER BY q.issue_order
    LIMIT 1
  `).bind(version).first();
  if (unclaimed) return selectScheduleCandidate(unclaimed, null);

  const staleBefore = new Date(now.getTime() - SCHEDULE_REISSUE_AFTER_MS).toISOString();
  const reissuable = await db.prepare(`
    SELECT
      q.version,
      q.sequence_number,
      q.issue_order,
      MAX(c.claim_number) + 1 AS claim_number
    FROM study_schedule_sequences AS q
    INNER JOIN study_schedules AS schedule
      ON schedule.version = q.version AND schedule.active = 1
    INNER JOIN study_schedule_claims AS c
      ON c.version = q.version AND c.sequence_number = q.sequence_number
    LEFT JOIN study_schedule_completions AS done
      ON done.version = q.version AND done.sequence_number = q.sequence_number
    WHERE q.version = ? AND done.session_id IS NULL
    GROUP BY q.version, q.sequence_number, q.issue_order
    HAVING MAX(c.claimed_at) <= ?
    ORDER BY MAX(c.claimed_at), q.issue_order
    LIMIT 1
  `).bind(version, staleBefore).first();
  return selectScheduleCandidate(null, reissuable);
}

export async function readActiveScheduleState(db, now = new Date()) {
  const schedules = await db.prepare(`
    SELECT version, schedule_hash, target_sequences, session_size
    FROM study_schedules
    WHERE active = 1
    ORDER BY created_at DESC, version
    LIMIT 2
  `).all();
  const active = schedules.results || [];
  if (active.length !== 1) {
    return {
      scheduleReady: false,
      completedSequences: 0,
      targetSequences: STUDY_TARGET_SEQUENCES,
      recruitmentComplete: false,
      candidate: null,
    };
  }

  const summary = await scheduleSummary(db, active[0]);
  summary.activeScheduleCount = active.length;
  const scheduleReady = validateScheduleStructure(summary);
  const completedSequences = number(summary.completedSequences);
  const recruitmentComplete = scheduleReady
    && completedSequences >= STUDY_TARGET_SEQUENCES;
  const candidate = scheduleReady && !recruitmentComplete
    ? await findEligibleScheduleCandidate(db, summary.version, now)
    : null;

  return {
    version: summary.version,
    scheduleReady,
    completedSequences,
    targetSequences: STUDY_TARGET_SEQUENCES,
    recruitmentComplete,
    candidate,
  };
}

export async function readScheduleItems(db, version, sequenceNumber) {
  const result = await db.prepare(`
    SELECT i.public_id, i.order_position, g.public_path AS path
    FROM study_schedule_items AS i
    INNER JOIN study_games AS g ON g.public_id = i.public_id AND g.active = 1
    WHERE i.version = ? AND i.sequence_number = ?
    ORDER BY i.order_position
  `).bind(version, sequenceNumber).all();
  const items = result.results || [];
  if (items.length !== STUDY_SESSION_SIZE) return [];
  for (let index = 0; index < items.length; index += 1) {
    if (number(items[index].order_position) !== index + 1
        || !validPublicGameRow(items[index])) {
      return [];
    }
  }
  return items;
}

export async function assignmentForSession(db, sessionId, publicId) {
  return db.prepare(`
    SELECT
      a.order_position,
      a.started_at,
      s.status AS session_status,
      r.response_id,
      r.rating,
      r.skip_reason,
      r.ended_at
    FROM study_assignments AS a
    INNER JOIN study_sessions AS s ON s.session_id = a.session_id
    LEFT JOIN study_responses AS r
      ON r.session_id = a.session_id AND r.public_id = a.public_id
    WHERE a.session_id = ? AND a.public_id = ?
  `).bind(sessionId, publicId).first();
}

export function duplicateResponseBody(row, publicId) {
  return {
    ok: true,
    duplicate: true,
    responseId: row.response_id,
    publicId,
    rating: row.rating || null,
    skipReason: row.skip_reason || null,
    endedAt: row.ended_at,
  };
}
