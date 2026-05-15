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
  const todayStart = Date.parse(today + 'T00:00:00Z');

  // Fast path: cached pick from earlier today
  const cacheKey = `featured:${today}`;
  const cached = await env.VOTES.get(cacheKey);
  if (cached) {
    return new Response(JSON.stringify({ slug: cached, date: today, rewardMultiplier: 2 }), {
      headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=300' },
    });
  }

  const games = {};

  // Pass 1: today's seconds per slug
  let cursor;
  do {
    const list = await env.VOTES.list({ prefix: 'daily:', cursor, limit: 1000 });
    for (const k of list.keys) {
      const rest = k.name.slice('daily:'.length);
      const lastColon = rest.lastIndexOf(':');
      if (lastColon < 1) continue;
      const date = rest.slice(lastColon + 1);
      if (date !== today) continue;
      const slug = rest.slice(0, lastColon);
      const seconds = parseInt(await env.VOTES.get(k.name)) || 0;
      if (!games[slug]) games[slug] = { seconds: 0, comments: 0, score: 0 };
      games[slug].seconds = seconds;
    }
    cursor = list.list_complete ? null : list.cursor;
  } while (cursor);

  // Pass 2: today's comments per slug
  cursor = undefined;
  do {
    const list = await env.VOTES.list({ prefix: 'comment:', cursor, limit: 1000 });
    for (const k of list.keys) {
      const v = await env.VOTES.get(k.name, 'json');
      if (!v || !v.ts || v.ts < todayStart) continue;
      const rest = k.name.slice('comment:'.length);
      const sep = rest.indexOf(':');
      if (sep < 1) continue;
      const slug = rest.slice(0, sep);
      if (!games[slug]) games[slug] = { seconds: 0, comments: 0, score: 0 };
      games[slug].comments = (games[slug].comments || 0) + 1;
    }
    cursor = list.list_complete ? null : list.cursor;
  } while (cursor);

  // Composite score + pick top
  let best = null;
  let bestScore = 0;
  for (const slug of Object.keys(games)) {
    const g = games[slug];
    g.score = (g.seconds || 0) + (g.comments || 0) * 60;
    if (g.score > bestScore) { bestScore = g.score; best = slug; }
  }

  // Fallback: if no signal today (early morning, first visitor), pick a
  // deterministic-by-date slug from games.json so the badge still has
  // SOMETHING to show. Once a heartbeat lands, the slug rotates.
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
