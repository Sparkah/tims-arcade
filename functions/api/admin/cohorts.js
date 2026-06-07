// GET /api/admin/cohorts?token=<ADMIN_TOKEN>[&horizons=1,3,7,14,30]
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

import { jsonError } from '../../_lib/response.js';
import { computeCohorts, dateUtc } from '../../_lib/cohort.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') || request.headers.get('x-admin-token') || '';
  const expected = env.ADMIN_TOKEN;
  if (!expected) return jsonError('admin_token_not_configured: set ADMIN_TOKEN in Pages env', 500);
  if (token !== expected) return jsonError('forbidden', 403);

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
  const horizonsParam = url.searchParams.get('horizons');
  const horizons = horizonsParam
    ? horizonsParam.split(',').map(Number).filter((n) => n > 0)
    : [1, 3, 7, 14, 30];

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
  }), { headers: { 'content-type': 'application/json' } });
}
