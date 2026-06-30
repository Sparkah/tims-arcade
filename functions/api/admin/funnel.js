// GET /api/admin/funnel
//
// Deprecated: game-level funnel analytics now belong in GameAnalytics only.
// This endpoint intentionally does not scan Workers KV.

import { json } from '../../_lib/response.js';
import { requireAdmin } from '../../_lib/adminAuth.js';

export async function onRequestGet({ request, env }) {
  const guard = await requireAdmin(request, env);
  if (guard) return guard;

  return json({
    disabled: true,
    reason: 'game_analytics_moved_to_gameanalytics',
    slugs: {},
    from: null,
    to: null,
    caveat: 'Game funnel analytics are disabled. Use GameAnalytics for per-game events.',
  });
}
