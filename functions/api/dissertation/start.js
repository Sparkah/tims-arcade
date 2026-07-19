import {
  STUDY_SCHEDULE_VERSION,
  assignmentForSession,
  enforceStudyRateLimit,
  nowIso,
  readStudyJson,
  requireOpenStudy,
  studyError,
  studyJson,
  validPublicId,
  validSessionId,
} from '../../_lib/dissertationStudy.js';

export async function onRequestPost({ request, env }) {
  const parsed = await readStudyJson(request, ['sessionId', 'publicId']);
  if (parsed.response) return parsed.response;
  const gate = requireOpenStudy(env);
  if (gate.response) return gate.response;

  const { sessionId, publicId } = parsed.body;
  if (!validSessionId(sessionId) || !validPublicId(publicId)) {
    return studyError('invalid_assignment', 400);
  }

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
  if (assignment.session_status !== 'active') return studyError('session_not_active', 409);
  if (assignment.response_id) {
    return studyJson({
      ok: true,
      sessionId,
      publicId,
      startedAt: assignment.started_at,
      alreadyResponded: true,
    });
  }

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

  const rateLimitResponse = await enforceStudyRateLimit(
    gate.config,
    `session:${sessionId}`,
  );
  if (rateLimitResponse) return rateLimitResponse;

  const activityAt = nowIso();
  try {
    await db.batch([
      db.prepare(`
        UPDATE study_assignments
        SET started_at = COALESCE(started_at, ?)
        WHERE session_id = ? AND public_id = ?
      `).bind(activityAt, sessionId, publicId),
      db.prepare(`
        UPDATE study_sessions
        SET last_activity_at = ?
        WHERE session_id = ? AND status = 'active'
      `).bind(activityAt, sessionId),
    ]);
    assignment = await assignmentForSession(db, sessionId, publicId);
  } catch {
    return studyError('study_database_error', 503);
  }

  return studyJson({
    ok: true,
    sessionId,
    publicId,
    startedAt: assignment.started_at,
    alreadyResponded: Boolean(assignment.response_id),
  });
}
