// GET  /api/admin/uploads?token=<ADMIN_TOKEN>[&status=pending|approved|rejected|live]
//      -> { uploads[], failures[], counts }
// POST /api/admin/uploads?token=<ADMIN_TOKEN>  body: { id, action, ... }
//      actions: approve | reject(reason) | reset | review(scan/verdict) |
//               live(sandboxUrl) | reassign(email) | request-review | worker
//
// Admin view of community game uploads (from /api/upload). Lists upload:* records
// newest-first with scan + AI verdict, and drives the lifecycle. The local
// background worker (Shared/tools/ugc-pipeline/ugc-worker.mjs) does the heavy
// steps the website buttons can't (sandboxed scan + wrangler deploy):
//   pending --request-review--> reviewRequested --(worker runs review)--> verdict
//   pending --approve--> approved --(worker publishes)--> live + announced
//   pending --reject--> rejected (emails the reason)
// Worker-managed flags (set via action:'worker'): reviewRequested,
// publishAttempted, publishError, workerNote. approve/reset clear the publish
// flags so a failed deploy retries; a written verdict clears reviewRequested.
// Metadata only — the raw zip lives under uploadblob:<id> and is never returned.

import { emailToUid } from '../../_lib/uid.js';

const STATUSES = ['pending', 'approved', 'rejected', 'live'];
const RECORD_TTL = 60 * 60 * 24 * 45;

export async function onRequestGet({ request, env }) {
  const guard = auth(request, env);
  if (guard) return guard;

  const url = new URL(request.url);
  // Cheap single-key READ so the background worker can poll without LIST ops
  // (KV free tier = 1000 list/day; a 15s list-poll blows it). `ugc:work` is
  // bumped by request-review + approve; the worker only does a full list when
  // this value changes. Reads are 100k/day — plenty.
  if (url.searchParams.get('signal') === '1') {
    return json({ work: (await env.VOTES.get('ugc:work')) || '0' });
  }

  const statusFilter = url.searchParams.get('status') || '';
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
  if (!['approve', 'reject', 'reset', 'review', 'live', 'reassign', 'worker', 'request-review'].includes(action)) return jsonError('bad_action', 400);

  const raw = await env.VOTES.get(id);
  if (!raw) return jsonError('not_found', 404);
  const row = JSON.parse(raw);

  if (action === 'approve') {
    // Approving means "publish it": clear any prior publish failure so the
    // background worker (re)attempts the deploy.
    row.status = 'approved'; row.approvedAt = Date.now();
    row.publishAttempted = false; row.publishError = '';
    await env.VOTES.put('ugc:work', String(Date.now()));   // wake the worker
  }
  else if (action === 'reject') {
    if (reason.length < 3) return jsonError('reason_required', 400);
    // If the card is already LIVE, flag the worker to UNPUBLISH the public
    // Gallery card (published:false -> sync -> push -> /p/<slug> 404). A reject
    // that only flips KV would leave the rejected game live on the site.
    if (row.status === 'live') { row.unpublishRequested = true; row.unpublishAttempted = false; }
    row.status = 'rejected'; row.rejectReason = reason; row.rejectedAt = Date.now();
    row.emailed = await sendRejectEmail(env, row, reason);
    await env.VOTES.put('ugc:work', String(Date.now()));   // wake the worker (unpublish + email already sent)
  }
  else if (action === 'reset') {
    row.status = 'pending'; row.publishAttempted = false; row.publishError = ''; row.reviewRequested = false;
  }
  else if (action === 'request-review') {    // ⚡ AI check button -> worker runs the review
    row.reviewRequested = true; row.reviewRequestedAt = Date.now();
    await env.VOTES.put('ugc:work', String(Date.now()));   // wake the worker
  }
  else if (action === 'worker') {            // background worker sets its own flags
    for (const k of ['reviewRequested', 'publishRequested', 'publishAttempted', 'publishError', 'workerNote',
                     'unpublishRequested', 'unpublishAttempted', 'unpublishError']) {
      if (k in body) row[k] = body[k];
    }
  }
  else if (action === 'review') {            // local pipeline writes scan + AI verdict back
    if (body.scan !== undefined) row.scan = body.scan;
    if (body.verdict !== undefined) {
      row.verdict = body.verdict; row.reviewRequested = false;
      // A reject/needs_work verdict on a card that's already LIVE must pull it.
      const d = body.verdict && body.verdict.decision;
      if (row.status === 'live' && (d === 'reject' || d === 'needs_work')) {
        row.unpublishRequested = true; row.unpublishAttempted = false;
        await env.VOTES.put('ugc:work', String(Date.now()));   // wake the worker to unpublish
      }
    }
  }
  else if (action === 'live') {              // publish script confirms the deploy
    row.status = 'live'; row.liveAt = Date.now();
    if (body.sandboxUrl) row.sandboxUrl = String(body.sandboxUrl).slice(0, 300);
  }
  else if (action === 'reassign') {          // hand the upload to its real owner
    const email = String(body.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 200) return jsonError('bad_email', 400);
    // uid MUST match what verify.js derives on login, so the new owner sees this
    // game in their account (sha256(lowercased email), first 8 bytes -> 16 hex).
    row.email = email; row.contact = email;
    row.uid = await emailToUid(email);
    row.reassignedAt = Date.now();
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
