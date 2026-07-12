// GET /api/gen/jobs
// A bounded, owner-only list of recent generation jobs. Unlike creation history,
// this includes first-build failures that never produced an upload record.

import { readSession } from '../_session.js';
import { json, jsonError } from '../../_lib/response.js';
import { readUserJobIds } from '../../_lib/genUserJobs.js';
import { classifyBuildError, publicBuildEvents } from '../../_lib/genJobLog.js';

export async function onRequestGet({ request, env }) {
  const session = await readSession(request, env);
  if (!session || !session.uid) return jsonError('sign_in_required', 401);

  const url = new URL(request.url);
  let limit = Number.parseInt(url.searchParams.get('limit') || '20', 10);
  if (!Number.isFinite(limit) || limit < 1) limit = 20;
  limit = Math.min(limit, 50);
  let offset = Number.parseInt(url.searchParams.get('offset') || '0', 10);
  if (!Number.isFinite(offset) || offset < 0) offset = 0;
  offset = Math.min(offset, 600);

  const allRefs = await readUserJobIds(env, session.uid);
  const jobs = [];
  let nextOffset = offset;
  // Advance past stale/missing refs while filling the requested page. A deleted
  // record near the front must not hide valid older failure logs behind it.
  while (nextOffset < allRefs.length && jobs.length < limit) {
    const ref = allRefs[nextOffset++];
    const job = await env.VOTES.get(`genjob:${ref.id}`, 'json');
    if (!job || job.uid !== session.uid) continue;
    const ready = job.status === 'ready';
    const playId = job.baseId || job.id || ref.id;
    jobs.push({
      id: job.id || ref.id,
      status: job.status || 'pending',
      versionName: job.versionName || '',
      title: job.title || '',
      error: job.error ? classifyBuildError(job.error).code : null,
      queuedAt: job.ts || ref.ts || 0,
      buildingAt: job.buildStartedTs || 0,
      updatedAt: job.updatedTs || 0,
      attempts: job.attempts || 0,
      playUrl: ready ? `/g/${playId}` : null,
      events: publicBuildEvents(job.buildEvents),
    });
  }

  const response = json({
    ok: true,
    jobs,
    nextOffset,
    hasMore: nextOffset < allRefs.length,
  });
  response.headers.set('cache-control', 'no-store');
  return response;
}
