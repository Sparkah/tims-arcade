// GET /api/admin/cohorts  — RETIRED 2026-07-02.
//
// Anonymous D1/D7 retention now lives in GameAnalytics (per-game) — the
// decision-grade source once games are live. The old KV implementation wrote a
// cohort:<uid> key per active user per day AND list()-scanned all of them on
// every admin open, a top consumer of BOTH the 1k/day KV write budget and the
// 1k/day KV LIST budget. The heartbeat capture write has been removed (see
// functions/api/heartbeat.js); this reader no longer scans KV.
//
// The endpoint is kept (admin-gated) so the dashboard fetch doesn't 404; it now
// returns an empty, clearly-labelled payload pointing at GameAnalytics.

import { requireAdmin } from '../../_lib/adminAuth.js';

export async function onRequestGet({ request, env }) {
  const guard = await requireAdmin(request, env);
  if (guard) return guard;

  return new Response(JSON.stringify({
    retired: true,
    cohorts: [],
    summary: { totalUsers: 0, byHorizon: {} },
    horizons: [1, 3, 7, 14, 30],
    caveat: 'Retired 2026-07-02. Retention (D1/D7) now lives in GameAnalytics; the KV cohort scan was removed to protect the free write + list budgets.',
    generatedAt: new Date().toISOString(),
  }), {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=0, s-maxage=300',
    },
  });
}
