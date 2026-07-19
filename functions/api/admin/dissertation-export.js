import { requireAdmin } from '../../_lib/adminAuth.js';
import { studyError, studyJson } from '../../_lib/dissertationStudy.js';

const EXPORT_SQL = `
  SELECT
    r.record_version,
    r.response_id,
    s.session_id,
    s.information_version,
    s.service_evaluation_basis,
    s.opened_at,
    s.last_activity_at,
    s.status AS session_status,
    s.completed_at AS session_completed_at,
    claim.version AS schedule_version,
    schedule.schedule_hash,
    schedule.session_size AS schedule_session_size,
    claim.sequence_number,
    sequence.issue_order AS schedule_issue_order,
    claim.claim_number,
    claim.claimed_at,
    CASE WHEN primary_done.session_id = s.session_id THEN 1 ELSE 0 END
      AS primary_cohort,
    (
      SELECT COUNT(*)
      FROM study_assignments AS session_assignment
      WHERE session_assignment.session_id = s.session_id
    ) AS session_assignment_count,
    (
      SELECT COUNT(*)
      FROM study_responses AS session_response
      WHERE session_response.session_id = s.session_id
    ) AS session_response_count,
    g.public_id AS game_id,
    g.prompt_id,
    g.condition AS team_condition,
    g.trial,
    g.source_run_id,
    g.batch_id,
    g.source_sha256,
    g.served_sha256,
    a.order_position,
    a.assigned_at,
    a.started_at,
    CASE WHEN r.response_id IS NULL THEN 'missing' ELSE 'responded' END
      AS outcome_state,
    r.ended_at,
    r.playtime_seconds,
    r.playtime_censored,
    r.rating,
    r.skip_reason,
    r.device_class,
    r.viewport_class,
    r.input_method,
    r.visibility_loss_count
  FROM study_assignments AS a
  INNER JOIN study_sessions AS s ON s.session_id = a.session_id
  LEFT JOIN study_schedule_claims AS claim ON claim.session_id = s.session_id
  LEFT JOIN study_schedule_sequences AS sequence
    ON sequence.version = claim.version
    AND sequence.sequence_number = claim.sequence_number
  LEFT JOIN study_schedules AS schedule
    ON schedule.version = claim.version
  LEFT JOIN study_schedule_completions AS primary_done
    ON primary_done.version = claim.version
    AND primary_done.sequence_number = claim.sequence_number
  INNER JOIN study_games AS g ON g.public_id = a.public_id
  LEFT JOIN study_responses AS r
    ON r.session_id = a.session_id AND r.public_id = a.public_id
  ORDER BY s.opened_at, s.session_id, a.order_position
`;

const COLUMNS = [
  'record_version',
  'response_id',
  'session_id',
  'information_version',
  'service_evaluation_basis',
  'opened_at',
  'last_activity_at',
  'session_status',
  'session_completed_at',
  'schedule_version',
  'schedule_hash',
  'schedule_session_size',
  'sequence_number',
  'schedule_issue_order',
  'claim_number',
  'claimed_at',
  'primary_cohort',
  'session_assignment_count',
  'session_response_count',
  'game_id',
  'prompt_id',
  'team_condition',
  'trial',
  'source_run_id',
  'batch_id',
  'source_sha256',
  'served_sha256',
  'order_position',
  'assigned_at',
  'started_at',
  'outcome_state',
  'ended_at',
  'playtime_seconds',
  'playtime_censored',
  'rating',
  'skip_reason',
  'device_class',
  'viewport_class',
  'input_method',
  'visibility_loss_count',
];

function csvCell(value) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function asCsv(rows) {
  const lines = [COLUMNS.map(csvCell).join(',')];
  for (const row of rows) {
    lines.push(COLUMNS.map(column => csvCell(row[column])).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

export async function onRequestGet({ request, env }) {
  const guard = await requireAdmin(request, env);
  if (guard) return guard;
  if (!env.DISSERTATION_DB) return studyError('study_unavailable', 503);

  const format = String(new URL(request.url).searchParams.get('format') || 'csv').toLowerCase();
  if (format !== 'csv' && format !== 'json') return studyError('invalid_format', 400);

  let rows;
  try {
    const result = await env.DISSERTATION_DB.prepare(EXPORT_SQL).all();
    rows = result.results || [];
  } catch {
    return studyError('study_database_error', 503);
  }

  if (format === 'json') {
    return studyJson({
      ok: true,
      exportedAt: new Date().toISOString(),
      rowCount: rows.length,
      rows,
    });
  }

  return new Response(asCsv(rows), {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="dissertation-study-export.csv"',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
