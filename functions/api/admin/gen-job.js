// GET /api/admin/gen-job?id=<jobId>
// Point lookup for operator debugging without a KV LIST. Returns the same
// sanitized event log as the owner view, never the prompt, email, raw model
// output/stderr, filesystem paths, or relay secrets.

import { json, jsonError } from '../../_lib/response.js';
import { isRelayRequest, requireAdmin } from '../../_lib/adminAuth.js';
import { classifyBuildError, publicBuildEvents } from '../../_lib/genJobLog.js';

const ID_RE = /^[0-9a-z]{8,40}$/;

export async function onRequestGet({ request, env }) {
  // This read-only, sanitized point lookup is also used by the local relay
  // watcher. Relay auth never unlocks broader human-admin endpoints.
  if (!await isRelayRequest(request, env)) {
    const guard = await requireAdmin(request, env);
    if (guard) return guard;
  }
  const id = String(new URL(request.url).searchParams.get('id') || '').toLowerCase();
  if (!ID_RE.test(id)) return jsonError('bad_id', 400);
  const job = await env.VOTES.get(`genjob:${id}`, 'json');
  if (!job) return jsonError('not_found', 404);

  const response = json({
    ok: true,
    job: {
      id,
      status: job.status || 'pending',
      generatorLane: job.generatorLane || 'public',
      versionName: job.versionName || '',
      error: job.error ? classifyBuildError(job.error).code : null,
      attempts: job.attempts || 0,
      queuedAt: job.ts || 0,
      updatedAt: job.updatedTs || 0,
      playUrl: job.status === 'ready' ? `/g/${job.baseId || job.id || id}` : null,
      events: publicBuildEvents(job.buildEvents),
    },
  });
  response.headers.set('cache-control', 'no-store');
  return response;
}
