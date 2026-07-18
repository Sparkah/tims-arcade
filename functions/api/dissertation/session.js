import {
  STUDY_ELIGIBLE_FALLBACK,
  STUDY_SESSION_SIZE,
  claimDailySessionBudget,
  chooseBalancedAssignments,
  enforceStudyRateLimit,
  newUuid,
  nowIso,
  readActiveGamePool,
  readStudyJson,
  requireOpenStudy,
  studyError,
  studyJson,
} from '../../_lib/dissertationStudy.js';

export async function onRequestPost({ request, env }) {
  const parsed = await readStudyJson(request, ['consent', 'consentVersion']);
  if (parsed.response) return parsed.response;

  const gate = requireOpenStudy(env);
  if (gate.response) return gate.response;
  const { db, consentVersion, ethicsConfirmationId } = gate.config;
  const { body } = parsed;

  if (body.consent !== true) return studyError('consent_required', 400);
  if (typeof body.consentVersion !== 'string' || body.consentVersion !== consentVersion) {
    return studyError('consent_version_mismatch', 409);
  }

  const rateLimitResponse = await enforceStudyRateLimit(gate.config, 'session-create');
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const budgetAvailable = await claimDailySessionBudget(db);
    if (!budgetAvailable) {
      return studyJson(
        { error: 'daily_session_limit_reached' },
        429,
        { 'retry-after': '3600' },
      );
    }
  } catch {
    return studyError('study_database_error', 503);
  }

  let pool;
  try {
    pool = await readActiveGamePool(db);
  } catch {
    return studyError('study_database_error', 503);
  }
  if (pool.length !== STUDY_ELIGIBLE_FALLBACK) {
    return studyError('study_pool_unavailable', 503);
  }
  const assignments = chooseBalancedAssignments(pool);
  if (assignments.length !== STUDY_SESSION_SIZE) {
    return studyError('study_pool_unavailable', 503);
  }

  const sessionId = newUuid();
  const consentedAt = nowIso();
  const statements = [
    db.prepare(`
      INSERT INTO study_sessions (
        session_id, consent_version, ethics_confirmation_id, consented_at, status
      ) VALUES (?, ?, ?, ?, ?)
    `).bind(sessionId, consentVersion, ethicsConfirmationId, consentedAt, 'active'),
    ...assignments.map((game, index) => db.prepare(`
      INSERT INTO study_assignments (
        session_id, public_id, order_position, assigned_at
      ) VALUES (?, ?, ?, ?)
    `).bind(sessionId, game.public_id, index + 1, consentedAt)),
  ];

  try {
    await db.batch(statements);
  } catch {
    return studyError('session_creation_failed', 503);
  }

  return studyJson({
    ok: true,
    sessionId,
    consentVersion,
    sessionSize: STUDY_SESSION_SIZE,
    assignments: assignments.map((game, index) => ({
      publicId: game.public_id,
      path: game.path,
      order: index + 1,
    })),
  }, 201);
}
