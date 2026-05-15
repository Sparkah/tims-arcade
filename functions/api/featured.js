// GET /api/featured
// Returns today's Featured Challenge game:
//   { slug, date: 'YYYY-MM-DD', rewardMultiplier: 2 }
//
// Rotation is deterministic — same date → same slug for every visitor,
// no matter when they hit the endpoint. We pick by hashing the date and
// modding into the games.json slug list, skipping anything explicitly
// flagged unpublished. Writes the picked slug to `featured:<date>` so
// heartbeat.js can honor the 2× token rate when crediting play time.
//
// Why deterministic: simpler than nightly rotation cron, no missed runs,
// reproducible for debugging.

async function fetchSlugs(env, hostname) {
  // games.json is statically served — we still fetch via the public URL
  // because Pages Functions can't read static assets directly.
  try {
    const url = `https://${hostname}/games.json`;
    const r = await fetch(url, { cf: { cacheTtl: 60 } });
    if (!r.ok) return [];
    const j = await r.json();
    const games = Array.isArray(j) ? j : (j.games || []);
    return games
      .filter(g => g && g.published !== false && typeof g.slug === 'string')
      .map(g => g.slug);
  } catch (e) {
    return [];
  }
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

function todayUTC() {
  const d = new Date();
  return d.getUTCFullYear() + '-'
       + String(d.getUTCMonth() + 1).padStart(2, '0') + '-'
       + String(d.getUTCDate()).padStart(2, '0');
}

export async function onRequestGet({ request, env }) {
  const date = todayUTC();
  const hostname = new URL(request.url).hostname;

  // First check the cache so we don't refetch games.json each request
  const cacheKey = `featured:${date}`;
  const cached = await env.VOTES.get(cacheKey);
  if (cached) {
    return new Response(JSON.stringify({ slug: cached, date, rewardMultiplier: 2 }), {
      headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=300' },
    });
  }

  const slugs = await fetchSlugs(env, hostname);
  if (!slugs.length) {
    return new Response(JSON.stringify({ slug: null, date, rewardMultiplier: 1 }), {
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  const slug = slugs[hashStr(date) % slugs.length];
  // 25-hour TTL so the key naturally rolls over each UTC day
  await env.VOTES.put(cacheKey, slug, { expirationTtl: 25 * 60 * 60 });

  return new Response(JSON.stringify({ slug, date, rewardMultiplier: 2 }), {
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=300' },
  });
}
