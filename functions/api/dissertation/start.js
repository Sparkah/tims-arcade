import {
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
  if (assignment.session_status !== 'active') return studyError('session_not_active', 409);

  const rateLimitResponse = await enforceStudyRateLimit(
    gate.config,
    `session:${sessionId}`,
  );
  if (rateLimitResponse) return rateLimitResponse;

  if (!assignment.started_at) {
    try {
      await db.prepare(`
        UPDATE study_assignments
        SET started_at = COALESCE(started_at, ?)
        WHERE session_id = ? AND public_id = ?
      `).bind(nowIso(), sessionId, publicId).run();
      assignment = await assignmentForSession(db, sessionId, publicId);
    } catch {
      return studyError('study_database_error', 503);
    }
  }

  return studyJson({
    ok: true,
    sessionId,
    publicId,
    startedAt: assignment.started_at,
    alreadyResponded: Boolean(assignment.response_id),
  });
}
