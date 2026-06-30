// GET /api/admin/gen-queue[?limit=5]
// The vibe-relay (Shared/tools/vibe-relay) polls this to find generation jobs to
// build. Returns PENDING jobs, plus any stuck in BUILDING longer than STUCK_MS
// (a relay that crashed mid-build) so they get retried rather than stranded.
// Oldest-first. Auth is X-Relay-Token against GAME_FACTORY_RELAY_TOKEN; browser
// admin sessions do not unlock the build queue. Read-only. Tim 2026-06-15.

import { json } from '../../_lib/response.js';
import { requireRelay } from '../../_lib/adminAuth.js';

const STUCK_MS = 10 * 60 * 1000;   // a "building" job older than this is presumed dropped

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const guard = await requireRelay(request, env);
  if (guard) return guard;

  // Cheap poll path for the vibe-relay (every 15s): return the single
  // genjob:signal value — 1 READ, 0 LIST. The relay only does the full list
  // below when this changes (new job enqueued, see gen/submit.js) or on its own
  // periodic stuck-sweep. The 15s poll otherwise did a genjob: LIST every time
  // = ~5760 list ops/day, over the free 1000/day cap alone (2026-06-16).
  // Mirrors uploads.js ?signal=1.
  if (url.searchParams.get('signal') === '1') {
    const r = json({ ok: true, signal: (await env.VOTES.get('genjob:signal')) || '0' });
    r.headers.set('cache-control', 'no-store');
    return r;
  }

  let limit = parseInt(url.searchParams.get('limit') || '5', 10);
  if (!Number.isFinite(limit) || limit < 1) limit = 5;
  limit = Math.min(limit, 20);

  const now = Date.now();
  const jobs = [];
  let cursor;
  do {
    const page = await env.VOTES.list({ prefix: 'genjob:', cursor });
    for (const k of page.keys) {
      const jobRec = await env.VOTES.get(k.name, 'json');
      if (!jobRec) continue;
      const readyPending = jobRec.status === 'pending' && (!jobRec.retryAfter || jobRec.retryAfter <= now);
      const stuck = jobRec.status === 'building' && (now - (jobRec.updatedTs || 0)) > STUCK_MS;
      if (readyPending || stuck) {
        jobs.push({ id: jobRec.id, prompt: jobRec.prompt, ts: jobRec.ts, baseId: jobRec.baseId || null });
      }
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor && jobs.length < 200);

  jobs.sort((a, b) => (a.ts || 0) - (b.ts || 0));
  const out = jobs.slice(0, limit);
  // For in-place iterate jobs, attach the CURRENT game HTML so the relay can evolve it.
  // Only for the jobs we actually return -> bounds the extra KV reads + response size.
  for (const j of out) {
    if (j.baseId) { j.iterate = true; j.baseHtml = (await env.VOTES.get(`genblob:${j.baseId}`)) || ''; }
    delete j.baseId;
  }
  const r = json({ ok: true, jobs: out });
  r.headers.set('cache-control', 'no-store');
  return r;
}
