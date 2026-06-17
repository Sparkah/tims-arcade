// GET /api/gen/status?id=<jobId>
// Public status of a generation job (the id is unguessable). Lets the creator's
// browser poll pending -> building -> ready and get the play URL. Shareable by
// link, so no ownership check. Tim 2026-06-15.

import { json, jsonError } from '../../_lib/response.js';

const ID_RE = /^[0-9a-z]{8,40}$/;   // accepts the 32-char crypto.randomUUID ids

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const id = String(url.searchParams.get('id') || '').toLowerCase();
  if (!ID_RE.test(id)) return jsonError('bad_id', 400);

  const jobRec = await env.VOTES.get(`genjob:${id}`, 'json');
  if (!jobRec) return jsonError('not_found', 404);

  const ready = jobRec.status === 'ready';
  // In-place iterate jobs play at the BASE game's URL, not the (build-only) job id.
  const playId = jobRec.baseId || id;
  // Extra fields so the creator's page can show LIVE progress (elapsed, ETA,
  // attempt count, last retry reason) instead of a static "building". Tim 2026-06-15.
  const r = json({
    id,
    status: jobRec.status,
    title: jobRec.title || null,
    slug: jobRec.slug || null,
    error: jobRec.error || null,
    playUrl: ready ? `/g/${playId}` : null,
    attempts: jobRec.attempts || 0,
    queuedAt: jobRec.ts || 0,
    updatedAt: jobRec.updatedTs || 0,
    retryAfter: jobRec.retryAfter || 0,
    now: Date.now(),
  });
  r.headers.set('cache-control', 'no-store');
  return r;
}
