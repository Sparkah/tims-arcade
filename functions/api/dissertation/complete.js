import {
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

  const rateLimitResponse = await enforceStudyRateLimit(
    gate.config,
    `session:${sessionId}`,
  );
  if (rateLimitResponse) return rateLimitResponse;

  const { db } = gate.config;
  let session;
  let responseCount;
  try {
    [session, responseCount] = await Promise.all([
      db.prepare(`
        SELECT status, completed_at
        FROM study_sessions
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
  if (session.status === 'complete') {
    return studyJson({
      ok: true,
      duplicate: true,
      sessionId,
      completedAt: session.completed_at,
    });
  }

  const completed = Number(responseCount && responseCount.count) || 0;
  if (completed !== STUDY_SESSION_SIZE) {
    return studyJson({
      error: 'session_incomplete',
      completedCount: completed,
      sessionSize: STUDY_SESSION_SIZE,
    }, 409);
  }

  const completedAt = nowIso();
  try {
    await db.prepare(`
      UPDATE study_sessions
      SET status = ?, completed_at = COALESCE(completed_at, ?)
      WHERE session_id = ? AND status = ?
    `).bind('complete', completedAt, sessionId, 'active').run();
    session = await db.prepare(`
      SELECT status, completed_at
      FROM study_sessions
      WHERE session_id = ?
    `).bind(sessionId).first();
  } catch {
    return studyError('session_completion_failed', 503);
  }
  if (!session || session.status !== 'complete') {
    return studyError('session_completion_failed', 503);
  }

  return studyJson({
    ok: true,
    duplicate: false,
    sessionId,
    completedAt: session.completed_at,
  });
}
