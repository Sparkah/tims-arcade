// POST /api/admin/gen-result   (auth: X-Admin-Token header == env.ADMIN_TOKEN)
// The vibe-relay posts build outcomes here. Three actions via "status":
//   building -> claim a pending job (so a relay restart won't double-build it)
//   ready    -> store the generated HTML, mark ready, surface it in the creator's
//               "My games" (reusing the upload: schema), and email the player
//   failed   -> mark failed, refund the EXACT charge ONCE (free gen or 60 tokens), email
// Terminal states are idempotent: a job only ever goes pending -> building ->
// ready|failed, refunds happen exactly once, and duplicate/late posts are no-ops
// (Codex review 2026-06-15). Tim 2026-06-15.

import { json, jsonError } from '../../_lib/response.js';
import { refundTokens } from '../../_lib/meta.js';

const ID_RE = /^[0-9a-z]{8,40}$/;
const BLOB_TTL = 60 * 60 * 24 * 30;   // generated game lives 30 days
const JOB_TTL = 60 * 60 * 24 * 7;
const MAX_HTML = 600 * 1024;          // 600 KB cap for a single-file game
const QUEUE_MAX_MS = 5 * 24 * 60 * 60 * 1000;   // keep retrying for up to 5 days (Tim 2026-06-15)
const MAX_ATTEMPTS = 30;                         // safety cap so a truly-unbuildable prompt can't loop forever

export async function onRequestPost({ request, env }) {
  // Header-only token: keeps the secret out of URLs / access logs.
  const token = request.headers.get('x-admin-token') || '';
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

  // Transient failure (relay timeout / claude error / bad output): DON'T fail the
  // job -- re-queue it so it retries when the machine is less loaded (Tim 2026-06-15:
  // "should just queue for up to 5 days and fail only if the laptop is offline that
  // long"). Only hard-fail (+refund) once the job is older than QUEUE_MAX_MS or has
  // exhausted MAX_ATTEMPTS. Backoff spaces retries so we don't hammer under load.
  if (status === 'requeue') {
    if (terminal) return json({ ok: true, status: jobRec.status, noop: true });
    const now = Date.now();
    const ageMs = now - (jobRec.ts || now);
    const attempts = (jobRec.attempts || 0) + 1;
    if (ageMs > QUEUE_MAX_MS || attempts > MAX_ATTEMPTS) {
      jobRec.status = 'failed';
      jobRec.error = ageMs > QUEUE_MAX_MS ? 'expired_after_5d' : 'max_attempts';
      jobRec.attempts = attempts;
      jobRec.updatedTs = now;
      await env.VOTES.put(`genjob:${id}`, JSON.stringify(jobRec), { expirationTtl: JOB_TTL });
      try { await refundCharge(env, jobRec); } catch (e) { /* best effort */ }   // reverse the exact charge, once
      try { await emailUser(env, jobRec, null); } catch (e) { /* best effort */ }
      return json({ ok: true, status: 'failed', reason: jobRec.error });
    }
    jobRec.status = 'pending';
    jobRec.attempts = attempts;
    jobRec.retryAfter = now + Math.min(attempts * 120, 1800) * 1000;   // 2min..30min backoff
    jobRec.updatedTs = now;
    // Expire ~5 days after the ORIGINAL submit, not after the last retry.
    const remainingTtl = Math.max(3600, Math.floor((QUEUE_MAX_MS - ageMs) / 1000));
    await env.VOTES.put(`genjob:${id}`, JSON.stringify(jobRec), { expirationTtl: remainingTtl });
    return json({ ok: true, status: 'pending', attempts, retryAfter: jobRec.retryAfter });
  }

  if (status === 'failed') {
    if (terminal) return json({ ok: true, status: jobRec.status, noop: true });  // refund/email already done (or job succeeded)
    jobRec.status = 'failed';
    jobRec.error = String(body.error || 'generation_failed').slice(0, 200);
    jobRec.updatedTs = Date.now();
    await env.VOTES.put(`genjob:${id}`, JSON.stringify(jobRec), { expirationTtl: JOB_TTL });
    try { await refundCharge(env, jobRec); } catch (e) { /* best effort */ }   // reverse the exact charge, once
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

    // Cover screenshot (base64 PNG from the relay's quality-smoke). Stored as-is;
    // /api/creation-cover decodes + serves it. Capped so a giant shot can't bust KV.
    let hasCover = false;
    const coverB64 = String(body.cover || '');
    if (coverB64 && coverB64.length < 700 * 1024) {
      try { await env.VOTES.put(`creationcover:${id}`, coverB64, { expirationTtl: BLOB_TTL }); hasCover = true; } catch (e) { /* best effort */ }
    }
    const quality = String(body.quality || 'unverified').slice(0, 16);

    jobRec.status = 'ready';
    jobRec.title = title;
    jobRec.slug = slug;
    jobRec.quality = quality;
    jobRec.updatedTs = Date.now();
    await env.VOTES.put(`genjob:${id}`, JSON.stringify(jobRec), { expirationTtl: BLOB_TTL });

    // Surface in the creator's "My games" via the existing upload: schema. Private
    // by default (published:false) -- the creator opts in to the public gallery.
    const rec = {
      id, slug, title,
      hook: String(jobRec.prompt || '').slice(0, 200),
      genre: 'vibe',
      author: jobRec.displayName || (jobRec.email || '').split('@')[0] || 'player',
      contact: jobRec.email || '',
      uid: jobRec.uid, email: jobRec.email,
      status: 'live', sandboxUrl: `/g/${id}`, source: 'vibe', ts: jobRec.ts,
      published: false, quality, hasCover,
    };
    try { await env.VOTES.put(`upload:${id}`, JSON.stringify(rec), { expirationTtl: BLOB_TTL }); } catch (e) { /* best effort */ }
    // Server-side "this slug is a creation" index so heartbeat can refuse to accrue
    // prompts for creation plays even if the client omits kind (Codex review 2026-06-15).
    try { await env.VOTES.put(`creationslug:${slug}`, id, { expirationTtl: BLOB_TTL }); } catch (e) { /* best effort */ }

    try { await emailUser(env, jobRec, `/g/${id}`); } catch (e) { /* best effort */ }
    return json({ ok: true, status: 'ready', slug, playUrl: `/g/${id}` });
  }

  return jsonError('bad_status', 400);
}

// Reverse the exact charge recorded at submit time. Called only on the first
// transition INTO a terminal-failed state (the `terminal` guards make this run
// once), mirroring how submit.js charged: restore the free generation, or refund
// 60 cookie-uid tokens (never touching lifetime). Jobs enqueued before the
// `charge` field existed have none -> nothing to reverse.
async function refundCharge(env, jobRec) {
  const c = jobRec && jobRec.charge;
  if (!c) return;
  if (c.kind === 'free' && c.freeKey) await env.VOTES.delete(c.freeKey);
  else if (c.kind === 'tokens' && c.uid && c.amount > 0) await refundTokens(env, c.uid, c.amount);
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
