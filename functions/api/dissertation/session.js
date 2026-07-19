import {
  STUDY_SESSION_SIZE,
  claimDailySessionBudget,
  enforceStudyRateLimit,
  findEligibleScheduleCandidate,
  newUuid,
  nowIso,
  readActiveScheduleState,
  readScheduleItems,
  readStudyJson,
  requireOpenStudy,
  studyError,
  studyJson,
} from '../../_lib/dissertationStudy.js';

const MAX_CLAIM_ATTEMPTS = 64;

export async function onRequestPost({ request, env }) {
  const parsed = await readStudyJson(request, ['informationVersion']);
  if (parsed.response) return parsed.response;

  const gate = requireOpenStudy(env);
  if (gate.response) return gate.response;
  const {
    db,
    informationVersion,
    serviceEvaluationBasis,
  } = gate.config;
  const { body } = parsed;

  if (typeof body.informationVersion !== 'string'
      || body.informationVersion !== informationVersion) {
    return studyError('information_version_mismatch', 409);
  }

  let schedule;
  try {
    schedule = await readActiveScheduleState(db);
  } catch {
    return studyError('study_database_error', 503);
  }
  if (!schedule.scheduleReady) return studyError('schedule_unavailable', 503);
  if (schedule.recruitmentComplete) return studyError('recruitment_complete', 409);
  if (!schedule.candidate) return studyError('schedule_temporarily_unavailable', 503);

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

  let candidate = schedule.candidate;
  for (let attempt = 0; attempt < MAX_CLAIM_ATTEMPTS; attempt += 1) {
    if (attempt > 0) {
      try {
        candidate = await findEligibleScheduleCandidate(db, schedule.version);
      } catch {
        return studyError('study_database_error', 503);
      }
      if (!candidate) return studyError('schedule_temporarily_unavailable', 503);
    }

    let assignments;
    try {
      assignments = await readScheduleItems(
        db,
        candidate.version,
        candidate.sequenceNumber,
      );
    } catch {
      return studyError('study_database_error', 503);
    }
    if (assignments.length !== STUDY_SESSION_SIZE) {
      return studyError('schedule_unavailable', 503);
    }

    const sessionId = newUuid();
    const openedAt = nowIso();
    const statements = [
      db.prepare(`
        INSERT INTO study_sessions (
          session_id,
          information_version,
          service_evaluation_basis,
          opened_at,
          status
        ) VALUES (?, ?, ?, ?, ?)
      `).bind(
        sessionId,
        informationVersion,
        serviceEvaluationBasis,
        openedAt,
        'active',
      ),
      db.prepare(`
        INSERT INTO study_schedule_claims (
          session_id,
          version,
          sequence_number,
          claim_number,
          claimed_at
        ) VALUES (?, ?, ?, ?, ?)
      `).bind(
        sessionId,
        candidate.version,
        candidate.sequenceNumber,
        candidate.claimNumber,
        openedAt,
      ),
      ...assignments.map(game => db.prepare(`
        INSERT INTO study_assignments (
          session_id, public_id, order_position, assigned_at
        ) VALUES (?, ?, ?, ?)
      `).bind(
        sessionId,
        game.public_id,
        game.order_position,
        openedAt,
      )),
    ];

    try {
      await db.batch(statements);
      return studyJson({
        ok: true,
        sessionId,
        informationVersion,
        sessionSize: STUDY_SESSION_SIZE,
        assignments: assignments.map(game => ({
          publicId: game.public_id,
          path: game.path,
          order: game.order_position,
        })),
      }, 201);
    } catch {
      // A concurrent request can win the same claim number between the
      // candidate read and this atomic batch. Re-read the frozen schedule and
      // retry; the failed D1 batch leaves no session or assignment rows.
    }
  }

  return studyError('schedule_claim_conflict', 503);
}
