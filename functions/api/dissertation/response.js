import {
  DEVICE_CLASSES,
  INPUT_METHODS,
  MIN_RATING_SECONDS,
  RATINGS,
  SKIP_REASONS,
  STUDY_RECORD_VERSION,
  STUDY_SCHEDULE_VERSION,
  STUDY_SESSION_SIZE,
  VIEWPORT_CLASSES,
  assignmentForSession,
  duplicateResponseBody,
  enforceStudyRateLimit,
  newUuid,
  nowIso,
  readStudyJson,
  requireOpenStudy,
  studyError,
  studyJson,
  validPublicId,
  validSessionId,
} from '../../_lib/dissertationStudy.js';

const FIELDS = [
  'sessionId',
  'publicId',
  'playtimeSeconds',
  'rating',
  'skipReason',
  'deviceClass',
  'viewportClass',
  'inputMethod',
  'visibilityLossCount',
];

const MAX_RECORDED_PLAYTIME_SECONDS = 3600;

export function normalizePlaytimeForStorage(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return {
    rawSeconds: value,
    recordedSeconds: Math.min(
      MAX_RECORDED_PLAYTIME_SECONDS,
      Math.round(value * 10) / 10,
    ),
    censored: value > MAX_RECORDED_PLAYTIME_SECONDS,
  };
}

export async function onRequestPost({ request, env }) {
  const parsed = await readStudyJson(request, FIELDS);
  if (parsed.response) return parsed.response;
  const gate = requireOpenStudy(env);
  if (gate.response) return gate.response;

  const {
    sessionId,
    publicId,
    rating,
    skipReason,
    deviceClass,
    viewportClass,
    inputMethod,
    visibilityLossCount,
  } = parsed.body;
  const playtime = normalizePlaytimeForStorage(parsed.body.playtimeSeconds);

  if (!validSessionId(sessionId) || !validPublicId(publicId)) {
    return studyError('invalid_assignment', 400);
  }
  if (playtime === null) return studyError('invalid_playtime', 400);
  if (!Number.isInteger(visibilityLossCount)
      || visibilityLossCount < 0
      || visibilityLossCount > 1000) {
    return studyError('invalid_visibility_loss_count', 400);
  }
  if (!DEVICE_CLASSES.has(deviceClass)) return studyError('invalid_device_class', 400);
  if (!VIEWPORT_CLASSES.has(viewportClass)) return studyError('invalid_viewport_class', 400);
  if (!INPUT_METHODS.has(inputMethod)) return studyError('invalid_input_method', 400);

  const hasRating = RATINGS.has(rating);
  const hasSkip = SKIP_REASONS.has(skipReason);
  if (hasRating === hasSkip) return studyError('rating_or_skip_required', 400);
  if (!hasRating && rating !== null) return studyError('invalid_rating', 400);
  if (!hasSkip && skipReason !== null) return studyError('invalid_skip_reason', 400);

  const { db } = gate.config;
  let assignment;
  try {
    assignment = await assignmentForSession(db, sessionId, publicId);
  } catch {
    return studyError('study_database_error', 503);
  }
  if (!assignment) return studyError('assignment_not_found', 404);
  if (assignment.schedule_version !== STUDY_SCHEDULE_VERSION) {
    return studyError('session_protocol_mismatch', 409);
  }
  if (assignment.response_id) {
    return studyJson(duplicateResponseBody(assignment, publicId));
  }
  if (assignment.session_status !== 'active') return studyError('session_not_active', 409);
  if (!assignment.started_at) return studyError('game_not_started', 409);

  let nextPosition;
  try {
    const next = await db.prepare(`
      SELECT MIN(a.order_position) AS order_position
      FROM study_assignments AS a
      LEFT JOIN study_responses AS r
        ON r.session_id = a.session_id AND r.public_id = a.public_id
      WHERE a.session_id = ? AND r.response_id IS NULL
    `).bind(sessionId).first();
    nextPosition = Number(next && next.order_position);
  } catch {
    return studyError('study_database_error', 503);
  }
  if (Number(assignment.order_position) !== nextPosition) {
    return studyError('game_out_of_order', 409);
  }

  const startedAtMs = Date.parse(assignment.started_at);
  const endedAtMs = Date.now();
  if (!Number.isFinite(startedAtMs) || startedAtMs > endedAtMs + 1000) {
    return studyError('invalid_server_timing', 503);
  }
  const serverElapsedSeconds = Math.max(0, (endedAtMs - startedAtMs) / 1000);
  if (playtime.rawSeconds > serverElapsedSeconds + 5) {
    return studyError('invalid_playtime', 400);
  }
  if (hasRating
      && (serverElapsedSeconds < MIN_RATING_SECONDS
        || playtime.rawSeconds < MIN_RATING_SECONDS)) {
    return studyError('play_more_before_rating', 403);
  }

  const rateLimitResponse = await enforceStudyRateLimit(
    gate.config,
    `session:${sessionId}`,
  );
  if (rateLimitResponse) return rateLimitResponse;

  const responseId = newUuid();
  const endedAt = new Date(endedAtMs).toISOString();
  try {
    await db.batch([
      db.prepare(`
        INSERT OR IGNORE INTO study_responses (
          response_id,
          record_version,
          session_id,
          public_id,
          ended_at,
          playtime_seconds,
          playtime_censored,
          rating,
          skip_reason,
          device_class,
          viewport_class,
          input_method,
          visibility_loss_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        responseId,
        STUDY_RECORD_VERSION,
        sessionId,
        publicId,
        endedAt,
        playtime.recordedSeconds,
        playtime.censored ? 1 : 0,
        hasRating ? rating : null,
        hasSkip ? skipReason : null,
        deviceClass,
        viewportClass,
        inputMethod,
        visibilityLossCount,
      ),
      db.prepare(`
        UPDATE study_sessions
        SET last_activity_at = ?
        WHERE session_id = ? AND status = 'active'
      `).bind(endedAt, sessionId),
    ]);
  } catch {
    return studyError('response_save_failed', 503);
  }

  let stored;
  let completedCount;
  try {
    [stored, completedCount] = await Promise.all([
      assignmentForSession(db, sessionId, publicId),
      db.prepare(
        'SELECT COUNT(*) AS count FROM study_responses WHERE session_id = ?',
      ).bind(sessionId).first(),
    ]);
  } catch {
    return studyError('study_database_error', 503);
  }
  if (!stored || !stored.response_id) return studyError('response_save_failed', 503);
  if (stored.response_id !== responseId) {
    return studyJson(duplicateResponseBody(stored, publicId));
  }

  return studyJson({
    ok: true,
    duplicate: false,
    responseId,
    publicId,
    rating: hasRating ? rating : null,
    skipReason: hasSkip ? skipReason : null,
    playtimeCensored: playtime.censored,
    endedAt,
    completedCount: Number(completedCount && completedCount.count) || 0,
    sessionSize: STUDY_SESSION_SIZE,
  }, 201);
}
