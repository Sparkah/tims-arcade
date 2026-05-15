// GET /api/leaderboard?limit=20
// Returns the top players by lifetime tokens earned across the gallery.
//
// Response: { players: [{ uid, lifetime, tokens, streak, bestStreak }], total }
//
// Privacy: uid is the anonymous cookie UUID — no email / no PII exposed.
// Display: the gallery shows a shortened uid (first 6 chars) by default;
// players who set a display name (later feature) will appear by name.
//
// Cost note: scans all `meta:*` keys via KV list. With ~1k active players
// that's ~1k key reads per request — too expensive on every page load.
// Cache the result in KV for 5 min (`lb:cache`) so a hot page just reads
// the cache; the first request of the cache window pays the scan cost.

const CACHE_KEY = 'lb:cache';
const CACHE_TTL = 5 * 60;  // 5 minutes

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get('limit')) || 20));

  // Try cache first
  const cached = await env.VOTES.get(CACHE_KEY, 'json');
  if (cached && cached.players) {
    return new Response(JSON.stringify({
      players: cached.players.slice(0, limit),
      total: cached.total,
      cached: true,
    }), {
      headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=60' },
    });
  }

  // Cold scan path — expensive (1k+ KV reads). Cache miss is rate-limited
  // per IP so an attacker can't bust the 5-min cache to force repeated
  // scans. 5 cold-scans/IP/hour is plenty for normal users; the warm cache
  // path is uncapped.
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const rateKey = `lbrate:${ip}:${Math.floor(Date.now() / 3600000)}`;
  const rate = parseInt(await env.VOTES.get(rateKey)) || 0;
  if (rate >= 5) {
    return new Response(JSON.stringify({ players: [], total: 0, error: 'rate_limit' }), {
      status: 429,
      headers: { 'content-type': 'application/json' },
    });
  }
  await env.VOTES.put(rateKey, String(rate + 1), { expirationTtl: 7200 });

  const players = [];
  let cursor;
  let scanned = 0;
  do {
    const list = await env.VOTES.list({ prefix: 'meta:', cursor, limit: 1000 });
    for (const k of list.keys) {
      const raw = await env.VOTES.get(k.name, 'json');
      if (!raw) continue;
      const uid = k.name.slice('meta:'.length);
      const lifetime = raw.lifetime | 0;
      if (lifetime <= 0) continue;
      players.push({
        uid,
        lifetime,
        tokens: raw.tokens | 0,
        streak: raw.streak | 0,
        bestStreak: raw.bestStreak | 0,
      });
      scanned++;
    }
    cursor = list.list_complete ? null : list.cursor;
    if (scanned > 5000) break;   // safety cap on the scan
  } while (cursor);

  players.sort((a, b) => b.lifetime - a.lifetime);
  const top = players.slice(0, 100);

  // Cache the top 100 — future paginated requests slice from this
  await env.VOTES.put(CACHE_KEY, JSON.stringify({
    players: top,
    total: players.length,
    builtAt: Date.now(),
  }), { expirationTtl: CACHE_TTL });

  return new Response(JSON.stringify({
    players: top.slice(0, limit),
    total: players.length,
    cached: false,
  }), {
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=60' },
  });
}
