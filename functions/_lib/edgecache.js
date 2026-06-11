// edgecache.js — shared caches.default wrapper for Pages Function GET endpoints.
//
// CF Pages does NOT edge-cache function responses from cache-control headers
// alone (see _lib/social.js for the incident history) — the Cache API put/match
// dance is required. This helper centralises the boilerplate that was copied
// into counts.js / trending.js / least-attention.js / admin/stats.js
// (scorecard P2, review-20260611-194919).
//
// Usage:
//   import { edgeCached } from '../_lib/edgecache.js';
//   return edgeCached('/api-counts', { bypass: isAdminNocache }, async () =>
//     new Response(body, { headers: { 'content-type': 'application/json',
//                                     'cache-control': 'public, s-maxage=60' } }));
//
// - `cachePath` keys the entry under the synthetic cache.tims-arcade host
//   (never a real origin URL, so it can't collide with page caching).
// - `bypass: true` skips the cache READ but still writes the fresh response,
//   refreshing the shared entry for everyone (the admin ?nocache=1 pattern).
// - The builder's response is served as-is with x-cache: MISS; hits get HIT.

export async function edgeCached(cachePath, { bypass = false } = {}, build) {
  const cache = caches.default;
  const cacheKey = new Request('https://cache.tims-arcade' + cachePath, { method: 'GET' });

  if (!bypass) {
    const cached = await cache.match(cacheKey);
    if (cached) {
      const r = new Response(cached.body, cached);
      r.headers.set('x-cache', 'HIT');
      return r;
    }
  }

  const fresh = await build();
  fresh.headers.set('x-cache', 'MISS');
  try { await cache.put(cacheKey, fresh.clone()); } catch (e) { /* cache is best-effort */ }
  return fresh;
}
