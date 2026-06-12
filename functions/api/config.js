// Public remote-config READ endpoint for live games (gf-lib GF.remoteConfig).
//
//   GET /api/config?slug=<slug>  -> 200 (stored config JSON) | 204 (no config)
//
// Storage: KV key `config:<slug>` in the VOTES namespace, written ONLY by the
// token-gated /api/admin/config endpoint (which validates: pure DATA - finite
// numbers / strings / booleans / arrays / plain objects, no proto keys,
// <= 8 KB). Shape by convention: { tuning, events, daily, motd, version }.
// Never code - the client merges it against a per-game defaults allowlist.
//
// CORS is `*` because platform builds fetch cross-origin (Yandex / CG game
// iframes). Yandex ALSO requires game-factory.tech in Console -> Settings ->
// External hosts (per-game CSP connect-src), set AT SUBMISSION TIME. Until
// whitelisted the game-side fetch just times out and baked defaults apply -
// the client is built to require exactly that failure mode.
//
// cache-control max-age=60: a tuning change propagates within ~1 minute and
// repeat loads stay off the KV read path (free-tier read budget).

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const slug = (url.searchParams.get('slug') || '').trim().toLowerCase();
  const hdrs = { 'content-type': 'application/json', ...CORS };
  if (!/^[a-z0-9_-]{1,64}$/.test(slug)) {
    return new Response(JSON.stringify({ error: 'invalid_slug' }), { status: 400, headers: hdrs });
  }
  let txt = null;
  try { txt = await env.VOTES.get('config:' + slug); } catch (e) { txt = null; }
  if (!txt) {
    // No config is the NORMAL state for most games: defaults apply client-side.
    // Return 204 instead of 404 so browsers do not log a console error during
    // otherwise-clean gameplay sessions.
    return new Response(null, {
      status: 204,
      headers: { ...CORS, 'cache-control': 'public, max-age=60' },
    });
  }
  return new Response(txt, {
    status: 200,
    headers: { ...hdrs, 'cache-control': 'public, max-age=60' },
  });
}
