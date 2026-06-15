// POST /api/admin/gen-result   (auth: X-Admin-Token header == env.ADMIN_TOKEN)
// The vibe-relay posts build outcomes here. Three actions via "status":
//   building -> claim a pending job (so a relay restart won't double-build it)
//   ready    -> store the generated HTML, mark ready, surface it in the creator's
//               "My games" (reusing the upload: schema), and email the player
//   failed   -> mark failed, refund the prompt ONCE, email the player
// Terminal states are idempotent: a job only ever goes pending -> building ->
// ready|failed, refunds happen exactly once, and duplicate/late posts are no-ops
// (Codex review 2026-06-15). Tim 2026-06-15.

import { json, jsonError } from '../../_lib/response.js';
import { creditPrompts } from '../../_lib/meta.js';

const ID_RE = /^[0-9a-z]{8,40}$/;
const BLOB_TTL = 60 * 60 * 24 * 30;   // generated game lives 30 days
const JOB_TTL = 60 * 60 * 24 * 7;
const MAX_HTML = 600 * 1024;          // 600 KB cap for a single-file game

export async function onRequestPost({ request, env }) {
  // Header-only token: keeps the secret out of URLs / access logs.
  const token = request.headers.get('x-admin-token') || new URL(request.url).searchParams.get('token') || '';
  if (!env.ADMIN_TOKEN) return jsonError('admin_token_not_configured', 500);
  if (token !== env.ADMIN_TOKEN) return jsonError('forbidden', 403);

  let body;
  try { body = await request.json(); } catch { return jsonError('bad_json', 400); }
  const id = String(body.id || '').toLowerCase();
  const status = String(body.status || '');
  if (!ID_RE.test(id)) return jsonError('bad_id', 400);

  const jobRec = await env.VOTES.get(`genjob:${id}`, 'json');
  if (!jobRec) return jsonError('not_found', 404);
  const terminal = jobRec.status === 'ready' || jobRec.status === 'failed';

  if (status === 'building') {
    if (terminal) return json({ ok: true, status: jobRec.status, noop: true });  // don't revert a finished job
    jobRec.status = 'building';
    jobRec.updatedTs = Date.now();
    await env.VOTES.put(`genjob:${id}`, JSON.stringify(jobRec), { expirationTtl: JOB_TTL });
    return json({ ok: true, status: 'building' });
  }

  if (status === 'failed') {
    if (terminal) return json({ ok: true, status: jobRec.status, noop: true });  // refund/email already done (or job succeeded)
    jobRec.status = 'failed';
    jobRec.error = String(body.error || 'generation_failed').slice(0, 200);
    jobRec.updatedTs = Date.now();
    await env.VOTES.put(`genjob:${id}`, JSON.stringify(jobRec), { expirationTtl: JOB_TTL });
    try { await creditPrompts(env, jobRec.uid, 1); } catch (e) { /* best effort */ }   // refund exactly once
    try { await emailUser(env, jobRec, null); } catch (e) { /* best effort */ }
    return json({ ok: true, status: 'failed' });
  }

  if (status === 'ready') {
    if (terminal) return json({ ok: true, status: jobRec.status, noop: true });  // already ready, or failed+refunded -- don't resurrect
    const html = String(body.html || '');
    if (html.length < 64) return jsonError('empty_html', 400);
    if (html.length > MAX_HTML) return jsonError('html_too_large', 413);
    const title = (String(body.title || jobRec.prompt || 'My Game').trim() || 'My Game').slice(0, 80);
    const slug = `${slugify(title)}-${id.slice(-4)}`;

    await env.VOTES.put(`genblob:${id}`, html, { expirationTtl: BLOB_TTL });

    jobRec.status = 'ready';
    jobRec.title = title;
    jobRec.slug = slug;
    jobRec.updatedTs = Date.now();
    await env.VOTES.put(`genjob:${id}`, JSON.stringify(jobRec), { expirationTtl: BLOB_TTL });

    // Surface in the creator's "My games" via the existing upload: schema
    // (status 'live' so it never enters the UGC moderation queue).
    const rec = {
      id, slug, title,
      hook: String(jobRec.prompt || '').slice(0, 200),
      genre: 'vibe',
      author: (jobRec.email || '').split('@')[0] || 'player',
      contact: jobRec.email || '',
      uid: jobRec.uid, email: jobRec.email,
      status: 'live', sandboxUrl: `/g/${id}`, source: 'vibe', ts: jobRec.ts,
    };
    try { await env.VOTES.put(`upload:${id}`, JSON.stringify(rec), { expirationTtl: BLOB_TTL }); } catch (e) { /* best effort */ }

    try { await emailUser(env, jobRec, `/g/${id}`); } catch (e) { /* best effort */ }
    return json({ ok: true, status: 'ready', slug, playUrl: `/g/${id}` });
  }

  return jsonError('bad_status', 400);
}

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'game';
}

async function emailUser(env, jobRec, playPath) {
  if (!env.RESEND_API_KEY || !jobRec.email) return;
  const origin = 'https://game-factory.tech';
  const ready = !!playPath;
  const subject = ready ? 'Your game is ready to play' : 'Your game could not be built';
  const link = ready ? origin + playPath : origin + '/create';
  const html = ready
    ? `<p>Your game <b>${escapeHtml(jobRec.title || 'game')}</b> is ready.</p>` +
      `<p><a href="${link}">Play it now</a></p><p>-- game-factory.tech</p>`
    : `<p>Sorry, we could not build your game this time, so your prompt was refunded.</p>` +
      `<p><a href="${link}">Try again</a></p><p>-- game-factory.tech</p>`;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.RESEND_FROM || "Tim's Game Lab <onboarding@resend.dev>",
      to: [jobRec.email], subject, html,
    }),
  });
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
