import { requireAdmin } from '../../_lib/adminAuth.js';
import { studyError, studyJson } from '../../_lib/dissertationStudy.js';

const EXPORT_SQL = `
  SELECT
    r.record_version,
    r.response_id,
    s.session_id,
    s.consent_version,
    s.ethics_confirmation_id,
    s.consented_at,
    s.status AS session_status,
    s.completed_at AS session_completed_at,
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
    r.ended_at,
    r.playtime_seconds,
    r.rating,
    r.skip_reason,
    r.device_class,
    r.viewport_class,
    r.input_method,
    r.visibility_loss_count
  FROM study_assignments AS a
  INNER JOIN study_sessions AS s ON s.session_id = a.session_id
  INNER JOIN study_games AS g ON g.public_id = a.public_id
  LEFT JOIN study_responses AS r
    ON r.session_id = a.session_id AND r.public_id = a.public_id
  ORDER BY s.consented_at, s.session_id, a.order_position
`;

const COLUMNS = [
  'record_version',
  'response_id',
  'session_id',
  'consent_version',
  'ethics_confirmation_id',
  'consented_at',
  'session_status',
  'session_completed_at',
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
  'ended_at',
  'playtime_seconds',
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
