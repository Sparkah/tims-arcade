import { requireAdmin } from '../../_lib/adminAuth.js';
import { readGamesJson } from '../../_lib/publicCatalogue.js';

// Full uncurated catalogue for the authenticated admin dashboard. The public
// /games.json route is deliberately filtered, so hidden games can only be
// enumerated here by an authorised admin who needs to unhide or inspect them.
export async function onRequestGet({ request, env }) {
  const fail = await requireAdmin(request, env);
  if (fail) return fail;
  try {
    const games = await readGamesJson(env);
    return new Response(`${JSON.stringify(games)}\n`, {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (_) {
    return new Response(JSON.stringify({ error: 'catalogue_unavailable' }), {
      status: 503,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    });
  }
}
