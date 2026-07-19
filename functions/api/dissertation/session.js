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
  validCreationId,
} from '../../_lib/dissertationStudy.js';

// A failed claim costs six D1 queries. Six total attempts keep the complete
// invocation below D1's 50-query limit; the client can safely retry with the
// same creationId if all six lose concurrent races.
const MAX_CLAIM_ATTEMPTS = 6;

async function sessionForCreation(db, creationId) {
  const session = await db.prepare(`
    SELECT session_id, information_version, status, completed_at
    FROM study_sessions
    WHERE creation_id = ?
  `).bind(creationId).first();
  if (!session) return null;

  const assignments = await db.prepare(`
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
  `).bind(session.session_id).all();
  const rows = assignments.results || [];
  if (rows.length !== STUDY_SESSION_SIZE) return null;
  return {
    session,
    assignments: rows,
  };
}

function sessionBody(existing, duplicate) {
  const { session, assignments } = existing;
  return {
    ok: true,
    duplicate,
    sessionId: session.session_id,
    informationVersion: session.information_version,
    status: session.status,
    completedAt: session.completed_at || null,
    sessionSize: STUDY_SESSION_SIZE,
    completedCount: assignments.filter(game => Number(game.responded) === 1).length,
    assignments: assignments.map(game => ({
      publicId: game.public_id,
      path: game.path,
      order: game.order_position,
      responded: Number(game.responded) === 1,
    })),
  };
}

export async function onRequestPost({ request, env }) {
  const parsed = await readStudyJson(request, ['informationVersion', 'creationId']);
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
  if (!validCreationId(body.creationId)) {
    return studyError('invalid_creation_id', 400);
  }

  try {
    const existing = await sessionForCreation(db, body.creationId);
    if (existing) return studyJson(sessionBody(existing, true));
  } catch {
    return studyError('study_database_error', 503);
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
          creation_id,
          information_version,
          service_evaluation_basis,
          opened_at,
          last_activity_at,
          status
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        sessionId,
        body.creationId,
        informationVersion,
        serviceEvaluationBasis,
        openedAt,
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
      db.prepare(`
        INSERT INTO study_assignments (
          session_id, public_id, order_position, assigned_at
        )
        SELECT ?, item.public_id, item.order_position, ?
        FROM study_schedule_items AS item
        INNER JOIN study_games AS game
          ON game.public_id = item.public_id AND game.active = 1
        WHERE item.version = ? AND item.sequence_number = ?
        ORDER BY item.order_position
      `).bind(
        sessionId,
        openedAt,
        candidate.version,
        candidate.sequenceNumber,
      ),
    ];

    try {
      await db.batch(statements);
      return studyJson(sessionBody({
        session: {
          session_id: sessionId,
          information_version: informationVersion,
          status: 'active',
          completed_at: null,
        },
        assignments: assignments.map(game => ({
          ...game,
          responded: 0,
        })),
      }, false), 201);
    } catch {
      try {
        const existing = await sessionForCreation(db, body.creationId);
        if (existing) return studyJson(sessionBody(existing, true));
      } catch {
        return studyError('study_database_error', 503);
      }
      // A concurrent request can win the same claim number between the
      // candidate read and this atomic batch. Re-read the frozen schedule and
      // retry; the failed D1 batch leaves no session or assignment rows.
    }
  }

  return studyError('schedule_claim_conflict', 503);
}
