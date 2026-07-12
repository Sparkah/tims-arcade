// GET /api/gen/status?id=<jobId>
// Owner-only status of a generation job. Lets the creator's browser poll
// pending -> building -> ready, including a sanitized persistent build log.

import { json, jsonError } from '../../_lib/response.js';
import { readSession } from '../_session.js';
import { classifyBuildError, publicBuildEvents } from '../../_lib/genJobLog.js';

const ID_RE = /^[0-9a-z]{8,40}$/;   // accepts the 32-char crypto.randomUUID ids

export async function onRequestGet({ request, env }) {
  const session = await readSession(request, env);
  if (!session || !session.uid) return jsonError('sign_in_required', 401);
  const url = new URL(request.url);
  const id = String(url.searchParams.get('id') || '').toLowerCase();
  if (!ID_RE.test(id)) return jsonError('bad_id', 400);

  const jobRec = await env.VOTES.get(`genjob:${id}`, 'json');
  if (!jobRec) return jsonError('not_found', 404);
  if (jobRec.uid !== session.uid) return jsonError('not_found', 404);

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
    error: jobRec.error ? classifyBuildError(jobRec.error).code : null,
    playUrl: ready ? `/g/${playId}` : null,
    targetCreationId: jobRec.targetCreationId || playId,
    versionNumber: jobRec.versionNumber || null,
    versionName: jobRec.versionName || null,
    summary: jobRec.summary || null,
    // Owner-visible charge mode only. Never expose the paid cookie UID or any
    // billing record details; the creator-admin uses this to avoid claiming a
    // refund for comped partner builds that never spent tokens.
    billingMode: jobRec.charge && jobRec.charge.kind === 'comped' ? 'comped' : 'tokens',
    attempts: jobRec.attempts || 0,
    queuedAt: jobRec.ts || 0,
    updatedAt: jobRec.updatedTs || 0,
    retryAfter: jobRec.retryAfter || 0,
    events: publicBuildEvents(jobRec.buildEvents),
    now: Date.now(),
  });
  r.headers.set('cache-control', 'no-store');
  return r;
}
