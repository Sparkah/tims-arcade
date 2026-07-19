import {
  STUDY_SCHEDULE_VERSION,
  STUDY_SESSION_SIZE,
  enforceStudyRateLimit,
  nowIso,
  readStudyJson,
  requireOpenStudy,
  studyError,
  studyJson,
  validSessionId,
} from '../../_lib/dissertationStudy.js';

export async function onRequestPost({ request, env }) {
  const parsed = await readStudyJson(request, ['sessionId']);
  if (parsed.response) return parsed.response;
  const gate = requireOpenStudy(env);
  if (gate.response) return gate.response;

  const { sessionId } = parsed.body;
  if (!validSessionId(sessionId)) return studyError('invalid_session', 400);

  const { db } = gate.config;
  let session;
  let assignmentCount;
  let responseCount;
  try {
    [session, assignmentCount, responseCount] = await Promise.all([
      db.prepare(`
        SELECT
          s.status,
          s.completed_at,
          c.version AS schedule_version,
          c.sequence_number
        FROM study_sessions AS s
        LEFT JOIN study_schedule_claims AS c ON c.session_id = s.session_id
        WHERE s.session_id = ?
      `).bind(sessionId).first(),
      db.prepare(`
        SELECT COUNT(*) AS count
        FROM study_assignments
        WHERE session_id = ?
      `).bind(sessionId).first(),
      db.prepare(`
        SELECT COUNT(*) AS count
        FROM study_responses
        WHERE session_id = ?
      `).bind(sessionId).first(),
    ]);
  } catch {
    return studyError('study_database_error', 503);
  }
  if (!session) return studyError('session_not_found', 404);
  if (!session.schedule_version || !session.sequence_number) {
    return studyError('schedule_claim_missing', 409);
  }
  if (session.schedule_version !== STUDY_SCHEDULE_VERSION) {
    return studyError('session_protocol_mismatch', 409);
  }

  const assigned = Number(assignmentCount && assignmentCount.count) || 0;
  const completed = Number(responseCount && responseCount.count) || 0;
  if (session.status !== 'complete'
      && (assigned !== STUDY_SESSION_SIZE || completed !== STUDY_SESSION_SIZE)) {
    return studyJson({
      error: 'session_incomplete',
      assignedCount: assigned,
      completedCount: completed,
      sessionSize: STUDY_SESSION_SIZE,
    }, 409);
  }

  const duplicate = session.status === 'complete';
  if (!duplicate) {
    const rateLimitResponse = await enforceStudyRateLimit(
      gate.config,
      `session:${sessionId}`,
    );
    if (rateLimitResponse) return rateLimitResponse;
  }

  const completedAt = session.completed_at || nowIso();
  try {
    await db.batch([
      db.prepare(`
        UPDATE study_sessions
        SET
          status = ?,
          completed_at = COALESCE(completed_at, ?),
          last_activity_at = ?
        WHERE session_id = ? AND status = ?
      `).bind('complete', completedAt, completedAt, sessionId, 'active'),
      db.prepare(`
        INSERT OR IGNORE INTO study_schedule_completions (
          session_id, version, sequence_number, completed_at
        )
        SELECT
          s.session_id,
          c.version,
          c.sequence_number,
          s.completed_at
        FROM study_sessions AS s
        INNER JOIN study_schedule_claims AS c ON c.session_id = s.session_id
        WHERE s.session_id = ? AND s.status = ?
      `).bind(sessionId, 'complete'),
    ]);
    session = await db.prepare(`
      SELECT
        s.status,
        s.completed_at,
        CASE WHEN done.session_id = s.session_id THEN 1 ELSE 0 END AS primary_cohort
      FROM study_sessions AS s
      LEFT JOIN study_schedule_completions AS done
        ON done.session_id = s.session_id
      WHERE s.session_id = ?
    `).bind(sessionId).first();
  } catch {
    return studyError('session_completion_failed', 503);
  }
  if (!session || session.status !== 'complete') {
    return studyError('session_completion_failed', 503);
  }

  return studyJson({
    ok: true,
    duplicate,
    sessionId,
    completedAt: session.completed_at,
    primaryCohort: Number(session.primary_cohort) === 1,
    completedCount: STUDY_SESSION_SIZE,
    sessionSize: STUDY_SESSION_SIZE,
  });
}
