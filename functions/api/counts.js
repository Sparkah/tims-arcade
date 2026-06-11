// GET /api/counts → returns { slug: { likes, dislikes, plays, seconds, comments } } for every game.
//
// Reads four KV prefixes:
//   - `votes:<slug>`     → like/dislike totals
//   - `plays:<slug>`     → play counter
//   - `seconds:<slug>`   → cumulative play time (load-bearing engagement signal)
//   - `comment:<slug>:*` → counted (KV keys, not values) for the 💬 N badge
//
// Perf (2026-06-11 diagnosis): this endpoint used to do ONE AWAITED get PER KEY,
// serially (~290 sequential KV round trips) with no edge cache — measured
// 3.1-13.5s on EVERY call, gating play-page topbar interactivity and burning
// ~300 KV reads + 4 list ops per visit (the free tier caps LIST at 1k/day).
// Two fixes, same as least-attention.js / admin/stats.js:
//   1. caches.default 60s edge cache — cuts KV read + list cost ~95%+.
//      (The max-age header alone is inert: CF Pages does not edge-cache
//      function responses from headers — see functions/_lib/social.js.)
//   2. Promise.all over each list page — cold-miss latency 13.5s → <1s.

const CACHE_TTL_SECONDS = 60;

export async function onRequestGet({ env }) {
  const cache = caches.default;
  const cacheKey = new Request('https://cache.tims-arcade/api-counts', { method: 'GET' });
  const cached = await cache.match(cacheKey);
  if (cached) {
    const r = new Response(cached.body, cached);
    r.headers.set('x-cache', 'HIT');
    return r;
  }

  const out = {};
  const ensure = (slug) => out[slug] ||
    (out[slug] = { likes: 0, dislikes: 0, plays: 0, seconds: 0, comments: 0 });

  // Walk a prefix, fetching values for each page of keys in parallel.
  async function walk(prefix, apply) {
    let cursor;
    do {
      const list = await env.VOTES.list({ prefix, cursor, limit: 1000 });
      await Promise.all(list.keys.map((k) => apply(k.name, k.name.slice(prefix.length))));
      cursor = list.list_complete ? null : list.cursor;
    } while (cursor);
  }

  await Promise.all([
    walk('votes:', async (key, slug) => {
      const v = await env.VOTES.get(key, 'json');
      const o = ensure(slug);
      if (v) { o.likes = v.likes || 0; o.dislikes = v.dislikes || 0; }
    }),
    walk('plays:', async (key, slug) => {
      ensure(slug).plays = parseInt(await env.VOTES.get(key)) || 0;
    }),
    walk('seconds:', async (key, slug) => {
      ensure(slug).seconds = parseInt(await env.VOTES.get(key)) || 0;
    }),
    // comments — count keys only (no value reads). Key shape: comment:<slug>:<id>
    (async () => {
      let cursor;
      do {
        const list = await env.VOTES.list({ prefix: 'comment:', cursor, limit: 1000 });
        for (const k of list.keys) {
          const rest = k.name.slice('comment:'.length);
          const sep = rest.indexOf(':');
          if (sep < 1) continue;
          ensure(rest.slice(0, sep)).comments += 1;
        }
        cursor = list.list_complete ? null : list.cursor;
      } while (cursor);
    })(),
  ]);

  const fresh = new Response(JSON.stringify(out), {
    headers: {
      'content-type': 'application/json',
      'cache-control': `public, max-age=15, s-maxage=${CACHE_TTL_SECONDS}`,
      'x-cache': 'MISS',
    },
  });
  try { await cache.put(cacheKey, fresh.clone()); } catch (e) { /* cache is best-effort */ }
  return fresh;
}
