// GET  /api/admin/uploads?token=<ADMIN_TOKEN>[&status=pending|approved|rejected|live]
// POST /api/admin/uploads?token=<ADMIN_TOKEN>  body: { id, action:'approve'|'reject'|'reset', reason? }
//
// Admin view of community game uploads (from /api/upload). Lists upload:* records
// newest-first with their scan summary + AI verdict, and lets the admin approve
// (queues it for the local deploy step) or reject (stores a reason for the
// rejection email). Lifecycle:
//   pending -> [local review writes scan + verdict] -> pending
//   pending -> approve -> approved -> [local deploy] -> live
//   pending -> reject  -> rejected -> [local emails the reason]
// Metadata only — the raw zip lives under uploadblob:<id> and is never returned.

const STATUSES = ['pending', 'approved', 'rejected', 'live'];
const RECORD_TTL = 60 * 60 * 24 * 45;

export async function onRequestGet({ request, env }) {
  const guard = auth(request, env);
  if (guard) return guard;

  const statusFilter = new URL(request.url).searchParams.get('status') || '';
  const out = [];
  let cursor;
  do {
    const list = await env.VOTES.list({ prefix: 'upload:', cursor });
    for (const k of list.keys) {
      const raw = await env.VOTES.get(k.name);
      if (!raw) continue;
      let row; try { row = JSON.parse(raw); } catch { continue; }
      if (statusFilter && row.status !== statusFilter) continue;
      out.push({ key: k.name, ...row });
    }
    cursor = list.list_complete ? null : list.cursor;
  } while (cursor);

  out.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const counts = Object.fromEntries(STATUSES.map(s => [s, out.filter(u => u.status === s).length]));

  // Rejected-at-the-gate uploads (validation failures) — debug aid, separate
  // prefix so they never mix into the review queue. Written by /api/upload.
  const failures = [];
  let fcursor;
  do {
    const list = await env.VOTES.list({ prefix: 'uploadfail:', cursor: fcursor });
    for (const k of list.keys) {
      const raw = await env.VOTES.get(k.name);
      if (!raw) continue;
      let row; try { row = JSON.parse(raw); } catch { continue; }
      failures.push({ key: k.name, ...row });
    }
    fcursor = list.list_complete ? null : list.cursor;
  } while (fcursor);
  failures.sort((a, b) => (b.ts || 0) - (a.ts || 0));

  return json({ generated_at: new Date().toISOString(), count: out.length, counts, uploads: out, failures });
}

export async function onRequestPost({ request, env }) {
  const guard = auth(request, env);
  if (guard) return guard;

  let body; try { body = await request.json(); } catch { return jsonError('invalid_json', 400); }
  const id = String(body.id || '');
  const action = String(body.action || '');
  const reason = body.reason ? String(body.reason).slice(0, 1000) : '';
  if (!id.startsWith('upload:')) return jsonError('bad_id', 400);
  if (!['approve', 'reject', 'reset', 'review', 'live'].includes(action)) return jsonError('bad_action', 400);

  const raw = await env.VOTES.get(id);
  if (!raw) return jsonError('not_found', 404);
  const row = JSON.parse(raw);

  if (action === 'approve') { row.status = 'approved'; row.approvedAt = Date.now(); }
  else if (action === 'reject') {
    if (reason.length < 3) return jsonError('reason_required', 400);
    row.status = 'rejected'; row.rejectReason = reason; row.rejectedAt = Date.now();
    row.emailed = await sendRejectEmail(env, row, reason);
  }
  else if (action === 'reset') { row.status = 'pending'; }
  else if (action === 'review') {            // local pipeline writes scan + AI verdict back
    if (body.scan !== undefined) row.scan = body.scan;
    if (body.verdict !== undefined) row.verdict = body.verdict;
  }
  else if (action === 'live') {              // publish script confirms the deploy
    row.status = 'live'; row.liveAt = Date.now();
    if (body.sandboxUrl) row.sandboxUrl = String(body.sandboxUrl).slice(0, 300);
  }

  await env.VOTES.put(id, JSON.stringify(row), { expirationTtl: RECORD_TTL });
  return json({ ok: true, status: row.status });
}

function auth(request, env) {
  const token = new URL(request.url).searchParams.get('token') || request.headers.get('x-admin-token') || '';
  if (!env.ADMIN_TOKEN) return jsonError('admin_token_not_configured', 500);
  if (token !== env.ADMIN_TOKEN) return jsonError('forbidden', 403);
  return null;
}

async function sendRejectEmail(env, row, reason) {
  if (!env.RESEND_API_KEY || !row.contact) return false;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.RESEND_FROM || "Tim's Game Lab <login@game-factory.tech>",
        to: [row.contact],
        subject: `Your game "${row.title}" needs changes before it can go live`,
        text: `Thanks for submitting "${row.title}" to game-factory.tech.\n\nWe can't publish it as-is yet:\n\n${reason}\n\nFix those and resubmit at https://game-factory.tech/submit and we'll take another look.\n\n— Tim's Game Lab`,
      }),
    });
    return r.ok;
  } catch { return false; }
}

function json(b, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } }); }
function jsonError(msg, s) { return new Response(JSON.stringify({ error: msg }), { status: s, headers: { 'content-type': 'application/json' } }); }
