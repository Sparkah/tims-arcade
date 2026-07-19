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
  let assignments;
  try {
    session = await db.prepare(`
      SELECT
        s.session_id,
        s.information_version,
        s.status,
        s.completed_at,
        c.version AS schedule_version,
        c.sequence_number,
        CASE WHEN done.session_id = s.session_id THEN 1 ELSE 0 END
          AS primary_cohort
      FROM study_sessions AS s
      LEFT JOIN study_schedule_claims AS c ON c.session_id = s.session_id
      LEFT JOIN study_schedule_completions AS done
        ON done.session_id = s.session_id
      WHERE s.session_id = ?
    `).bind(sessionId).first();
    if (!session) return studyError('session_not_found', 404);
    if (session.schedule_version !== STUDY_SCHEDULE_VERSION) {
      return studyError('session_protocol_mismatch', 409);
    }

    if (session.status === 'active') {
      const rateLimitResponse = await enforceStudyRateLimit(
        gate.config,
        `session:${sessionId}`,
      );
      if (rateLimitResponse) return rateLimitResponse;
      await db.prepare(`
        UPDATE study_sessions
        SET last_activity_at = ?
        WHERE session_id = ? AND status = 'active'
      `).bind(nowIso(), sessionId).run();
    }

    const result = await db.prepare(`
      SELECT
        a.public_id,
        a.order_position,
        g.public_path AS path,
        CASE WHEN r.response_id IS NULL THEN 0 ELSE 1 END AS responded
      FROM study_assignments AS a
      INNER JOIN study_games AS g ON g.public_id = a.public_id
      LEFT JOIN study_responses AS r
        ON r.session_id = a.session_id AND r.public_id = a.public_id
      WHERE a.session_id = ?
      ORDER BY a.order_position
    `).bind(sessionId).all();
    assignments = result.results || [];
  } catch {
    return studyError('study_database_error', 503);
  }

  if (assignments.length !== STUDY_SESSION_SIZE) {
    return studyError('session_assignments_invalid', 503);
  }
  const completedCount = assignments.filter(
    game => Number(game.responded) === 1,
  ).length;
  const next = assignments.find(game => Number(game.responded) !== 1);

  return studyJson({
    ok: true,
    sessionId,
    informationVersion: session.information_version,
    status: session.status,
    completedAt: session.completed_at || null,
    primaryCohort: Number(session.primary_cohort) === 1,
    sessionSize: STUDY_SESSION_SIZE,
    completedCount,
    nextPosition: next ? next.order_position : null,
    assignments: assignments.map(game => ({
      publicId: game.public_id,
      path: game.path,
      order: game.order_position,
      responded: Number(game.responded) === 1,
    })),
  });
}
