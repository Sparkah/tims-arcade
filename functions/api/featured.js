// GET /api/featured
// Returns the slug of today's Featured Challenge — the game the hero card
// surfaces + the slug that earns 2× tokens via /api/heartbeat.
//
//   { slug, date, rewardMultiplier: 2 }
//
// Picks the top engagement-today slug (same metric /api/trending uses:
// today_seconds + today_comments × 60) so the badge in the hero
// "FEATURED TODAY · 2× TOKENS" always names a game the player can see
// without scrolling. Falls back to all-time engagement or newest when
// today's signal is empty (e.g. the first visitor of the day before any
// heartbeat has landed).
//
// Caches the picked slug to `featured:<date>` so heartbeat.js can honor
// the 2× rate without redoing the scan each tick.

export async function onRequestGet({ request, env }) {
  const today = new Date().toISOString().slice(0, 10);

  // Fast path: cached pick from earlier today
  const cacheKey = `featured:${today}`;
  const cached = await env.VOTES.get(cacheKey);
  if (cached) {
    return new Response(JSON.stringify({ slug: cached, date: today, rewardMultiplier: 2 }), {
      headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=300' },
    });
  }

  // Cold path: reuse the engagement aggregate /api/trending already builds
  // (same daily:* + comment:* scan, edge-cached 30s) instead of duplicating
  // the KV scan here. One fetch, pick top by score.
  const hostname = new URL(request.url).hostname;
  let best = null;
  try {
    const r = await fetch(`https://${hostname}/api/trending`, { cf: { cacheTtl: 30 } });
    if (r.ok) {
      const j = await r.json();
      const slugs = j && j.games ? Object.keys(j.games) : [];
      let bestScore = 0;
      for (const slug of slugs) {
        const s = (j.games[slug] && j.games[slug].score) || 0;
        if (s > bestScore) { bestScore = s; best = slug; }
      }
    }
  } catch (_) { /* fall through to fallback */ }

  // Fallback: no engagement signal today (early morning, first visitor).
  // Pick a deterministic-by-date slug from games.json so the badge still
  // has SOMETHING. Once a heartbeat lands, /api/trending will outrank it
  // on the next cache miss.
  if (!best) {
    best = await pickFallbackSlug(request, today);
  }

  if (best) {
    // 25-hour TTL so the key rolls over each UTC day
    await env.VOTES.put(cacheKey, best, { expirationTtl: 25 * 60 * 60 });
  }

  return new Response(JSON.stringify({ slug: best, date: today, rewardMultiplier: 2 }), {
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=300' },
  });
}

async function pickFallbackSlug(request, today) {
  try {
    const hostname = new URL(request.url).hostname;
    const r = await fetch(`https://${hostname}/games.json`, { cf: { cacheTtl: 60 } });
    if (!r.ok) return null;
    const j = await r.json();
    const games = Array.isArray(j) ? j : (j.games || []);
    const slugs = games
      .filter(g => g && g.published !== false && typeof g.slug === 'string')
      .map(g => g.slug);
    if (!slugs.length) return null;
    let h = 0;
    for (let i = 0; i < today.length; i++) h = ((h << 5) - h + today.charCodeAt(i)) | 0;
    return slugs[(h >>> 0) % slugs.length];
  } catch (_) {
    return null;
  }
}
