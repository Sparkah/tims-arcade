// GET /api/admin/cohorts?token=<ADMIN_TOKEN>[&horizons=1,3,7,14,30][&nocache=1]
//
// Anonymous-cohort D1/D7/... retention for the admin dashboard. Token-gated against
// env.ADMIN_TOKEN (same as stats.js). Reads the `cohort:<uid>` keys written by the
// heartbeat capture (see _lib/cohort.js) and computes Dn per first-seen cohort at
// read time. READ-ONLY — no KV writes, so no write-budget impact.
//
// env.INTERNAL_UIDS (comma-separated) are excluded so Tim's own plays don't skew it.
//
// CAVEAT (echoed in the payload): at low traffic this is directional plumbing, not
// decision-grade. At scale the per-key fan-out gets slow -> migrate to D1.
//
// COST: this is the heaviest admin scan — up to 25 KV list pages of `cohort:` PLUS a
// get per key. Opening the admin dashboard re-ran the whole fan-out every time, a top
// consumer of the 1k/day free KV LIST cap (that is the 500 you get once it is hit:
// list() throws inside the Worker -> CF 1101). Edge-cache the computed result 5 min so
// repeat refreshes are free. Auth is checked ABOVE the cache, so only an authorized
// caller ever reaches it; the key binds the normalized horizons only (NOT the token).
// `?nocache=1` forces a fresh scan (the refresh button) and re-warms the shared entry.

import { jsonError } from '../../_lib/response.js';
import { computeCohorts, dateUtc } from '../../_lib/cohort.js';
import { edgeCached } from '../../_lib/edgecache.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') || request.headers.get('x-admin-token') || '';
  const expected = env.ADMIN_TOKEN;
  if (!expected) return jsonError('admin_token_not_configured: set ADMIN_TOKEN in Pages env', 500);
  if (token !== expected) return jsonError('forbidden', 403);

  const horizons = normalizeHorizons(url.searchParams.get('horizons'));
  const bypass = url.searchParams.get('nocache') === '1';

  // Auth is verified ABOVE, so the cache is only ever reached by an authorized
  // caller; with a single ADMIN_TOKEN all callers legitimately share one entry,
  // so the token is deliberately NOT bound into the key (binding it risks leaking
  // the secret via logs/error output; Codex review 2026-06-15). Key by the
  // normalized horizons only.
  return edgeCached(
    `/api-admin-cohorts?z=${horizons.join('.')}`,
    { bypass },
    () => buildCohorts(env, horizons),
  );
}

// Normalize horizons to a deduped, sorted list of bounded positive integers so
// the cache key is canonical and collision-free: "1.2,3" and "1,3" both fold to
// [1,3], and fractional inputs can't alias via join('.') ([1.2,3] vs [1,2.3]).
function normalizeHorizons(param) {
  const cleaned = [...new Set(
    (param ? String(param).split(',') : [])
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isInteger(n) && n > 0 && n <= 365)
  )].sort((a, b) => a - b).slice(0, 12);
  return cleaned.length ? cleaned : [1, 3, 7, 14, 30];
}

async function buildCohorts(env, horizons) {
  // Collect all cohort:<uid> entries (paginate the KV list; bounded for V1).
  const entries = [];
  let cursor = undefined, complete = false, pages = 0;
  while (!complete && pages < 25) {
    const res = await env.VOTES.list({ prefix: 'cohort:', cursor, limit: 1000 });
    for (const k of res.keys) {
      const uid = k.name.slice(7); // 'cohort:'.length === 7
      let v = null;
      try { v = JSON.parse((await env.VOTES.get(k.name)) || 'null'); } catch { v = null; }
      if (v && v.f) entries.push({ uid, f: v.f, d: Array.isArray(v.d) ? v.d : [] });
    }
    complete = res.list_complete;
    cursor = res.cursor;
    pages++;
  }

  const internal = new Set(
    String(env.INTERNAL_UIDS || '').split(',').map((s) => s.trim()).filter(Boolean)
  );

  const result = computeCohorts(entries, {
    today: dateUtc(Date.now()),
    internal,
    horizons,
    confidentN: 10,
  });

  return new Response(JSON.stringify({
    ...result,
    horizons,
    internalExcluded: internal.size,
    truncated: !complete, // true if we hit the 25-page bound (very high user count)
    caveat: 'Directional at low traffic, not decision-grade. Real D1/D7 come from platforms once games are live.',
    generatedAt: new Date().toISOString(),
  }), {
    headers: {
      'content-type': 'application/json',
      // browser must not cache admin data locally; the shared edge entry lives 5 min.
      'cache-control': 'public, max-age=0, s-maxage=300',
    },
  });
}
