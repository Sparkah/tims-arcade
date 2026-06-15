// GET /api/creations -> the PUBLIC "Player Creations" feed: vibe games their
// creators chose to publish (published + ready/live). Returns cover + author
// display name + basic stats. Edge-cached 30s. Tim 2026-06-15.
//
// NOTE: walks upload:* records; fine at gallery volume + the edge cache. If
// creations grow large, add a snapshot index (see boot.js's pattern).
//
// CACHING: a Cache-Control header alone does NOT edge-cache a Pages Function
// (see _lib/edgecache.js) — so this used to run a full `upload:*` KV list scan
// on EVERY request, one list op per call against the 1k/day free cap. Wrap the
// scan in the caches.default put/match dance (30s TTL).

import { json } from '../_lib/response.js';
import { edgeCached } from '../_lib/edgecache.js';

export function onRequestGet({ env }) {
  // Fixed cache key — this endpoint takes no query params. If a filter/sort/page
  // param is ever added, fold it into the key or all callers share one entry.
  return edgeCached('/api-creations', {}, () => buildCreations(env));
}

async function buildCreations(env) {
  const out = [];
  let cursor;
  do {
    const list = await env.VOTES.list({ prefix: 'upload:', cursor });
    for (const k of list.keys) {
      const raw = await env.VOTES.get(k.name);
      if (!raw) continue;
      let r; try { r = JSON.parse(raw); } catch { continue; }
      if (r.source !== 'vibe' || !r.published || r.status !== 'live') continue;
      const slug = String(r.slug || '');
      const [plays, seconds] = await Promise.all([
        env.VOTES.get(`plays:${slug}`),
        env.VOTES.get(`seconds:${slug}`),
      ]);
      out.push({
        id: r.id, slug,
        title: r.title || slug,
        author: r.author || 'player',
        hasCover: !!r.hasCover,
        ts: r.ts || 0,
        plays: parseInt(plays) || 0,
        seconds: parseInt(seconds) || 0,
        playUrl: `/cplay?id=${r.id}`,
      });
    }
    cursor = list.list_complete ? null : list.cursor;
  } while (cursor);

  out.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const res = json({ ok: true, creations: out.slice(0, 60) });
  res.headers.set('cache-control', 'public, max-age=30, s-maxage=30');
  return res;
}
