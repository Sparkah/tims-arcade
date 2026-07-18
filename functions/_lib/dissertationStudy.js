import { json, sameOriginOk } from './response.js';

export const STUDY_SESSION_SIZE = 5;
export const STUDY_ELIGIBLE_FALLBACK = 56;
export const STUDY_RECORD_VERSION = 1;
export const MIN_RATING_SECONDS = 10;
export const MAX_SESSIONS_PER_UTC_DAY = 500;

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
  const ethicsConfirmationId = String(env.DISSERTATION_ETHICS_CONFIRMATION_ID || '').trim();
  const consentVersion = String(env.DISSERTATION_CONSENT_VERSION || '').trim();
  const db = env.DISSERTATION_DB;
  const rateLimiter = env.DISSERTATION_RATE_LIMITER;
  const abuseProtectionReady = Boolean(rateLimiter && typeof rateLimiter.limit === 'function');
  const open = env.DISSERTATION_STUDY_OPEN === '1'
    && Boolean(ethicsConfirmationId)
    && Boolean(consentVersion)
    && Boolean(db)
    && abuseProtectionReady;

  return {
    open,
    db,
    rateLimiter,
    abuseProtectionReady,
    ethicsConfirmationId,
    consentVersion,
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

export async function enforceStudyRateLimit(config, key) {
  if (!config.abuseProtectionReady) {
    return studyError('study_unavailable', 503);
  }

  try {
    const result = await config.rateLimiter.limit({
      key: `dissertation-player-v1:${key}`,
    });
    if (!result || result.success !== true) {
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
  const row = await db.prepare(`
    INSERT INTO study_rate_buckets (bucket_key, window_start, used)
    VALUES (?, ?, 1)
    ON CONFLICT(bucket_key) DO UPDATE SET
      used = study_rate_buckets.used + 1
    WHERE study_rate_buckets.used < ?
    RETURNING used
  `).bind(bucketKey, day, MAX_SESSIONS_PER_UTC_DAY).first();
  return Boolean(row && Number(row.used) >= 1);
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

export async function readActiveGamePool(db) {
  const query = db.prepare(`
    SELECT
      g.public_id,
      g.public_path AS path,
      g.condition,
      g.prompt_id,
      COUNT(a.session_id) AS assigned_count,
      COALESCE(SUM(CASE WHEN r.response_id IS NOT NULL THEN 1 ELSE 0 END), 0) AS response_count
    FROM study_games AS g
    LEFT JOIN study_assignments AS a ON a.public_id = g.public_id
    LEFT JOIN study_responses AS r
      ON r.session_id = a.session_id AND r.public_id = a.public_id
    WHERE g.active = 1
    GROUP BY g.public_id, g.public_path, g.condition, g.prompt_id
  `);
  const result = await query.all();
  return (result.results || []).filter(validPublicGameRow);
}

function randomFraction() {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0] / 0x100000000;
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function chooseBalancedAssignments(rows, size = STUDY_SESSION_SIZE) {
  if (!Array.isArray(rows) || rows.length < size) return [];

  const conditionStats = new Map();
  const promptStats = new Map();
  for (const row of rows) {
    const assigned = number(row.assigned_count);
    const condition = String(row.condition);
    const prompt = String(row.prompt_id);
    const c = conditionStats.get(condition) || { assigned: 0, games: 0 };
    c.assigned += assigned;
    c.games += 1;
    conditionStats.set(condition, c);
    const p = promptStats.get(prompt) || { assigned: 0, games: 0 };
    p.assigned += assigned;
    p.games += 1;
    promptStats.set(prompt, p);
  }

  const selected = [];
  const selectedIds = new Set();
  const selectedConditions = new Set();
  const selectedPromptCounts = new Map();

  while (selected.length < size) {
    const unused = rows.filter(row => !selectedIds.has(row.public_id));
    const noConditionRepeat = unused.filter(row => !selectedConditions.has(String(row.condition)));
    const promptCapped = candidates => candidates.filter(
      row => (selectedPromptCounts.get(String(row.prompt_id)) || 0) < 2,
    );

    let candidates = promptCapped(noConditionRepeat);
    if (!candidates.length) candidates = noConditionRepeat;
    if (!candidates.length) candidates = promptCapped(unused);
    if (!candidates.length) candidates = unused;
    if (!candidates.length) break;

    candidates = candidates.map(row => {
      const condition = conditionStats.get(String(row.condition)) || { assigned: 0, games: 1 };
      const prompt = promptStats.get(String(row.prompt_id)) || { assigned: 0, games: 1 };
      const selectedForPrompt = selectedPromptCounts.get(String(row.prompt_id)) || 0;

      // Individual exposure dominates. The remaining terms break ties toward
      // prompt/condition coverage and games with fewer completed responses.
      const score = number(row.assigned_count) * 1_000_000_000
        + selectedForPrompt * 10_000_000
        + (condition.assigned / condition.games) * 100_000
        + (prompt.assigned / prompt.games) * 10_000
        + number(row.response_count) * 100
        + randomFraction();
      return { row, score };
    });
    candidates.sort((a, b) => a.score - b.score);

    const picked = candidates[0].row;
    selected.push(picked);
    selectedIds.add(picked.public_id);
    selectedConditions.add(String(picked.condition));
    const prompt = String(picked.prompt_id);
    selectedPromptCounts.set(prompt, (selectedPromptCounts.get(prompt) || 0) + 1);
  }

  return selected;
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
