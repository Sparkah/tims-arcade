// GET /api/admin/level-funnel
//
// Deprecated: per-game level drop-off analytics now belong in GameAnalytics
// only. This endpoint intentionally does not scan Workers KV.

import { json } from '../../_lib/response.js';
import { requireAdmin } from '../../_lib/adminAuth.js';

export async function onRequestGet({ request, env }) {
  const guard = await requireAdmin(request, env);
  if (guard) return guard;

  const url = new URL(request.url);
  return json({
    disabled: true,
    reason: 'game_analytics_moved_to_gameanalytics',
    slug: (url.searchParams.get('slug') || '').trim().toLowerCase(),
    from: null,
    to: null,
    levels: [],
    caveat: 'Level drop-off analytics are disabled. Use GameAnalytics progression events for per-game level analytics.',
  });
}
