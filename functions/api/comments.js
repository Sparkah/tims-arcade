// GET /api/comments?slug=<slug>&limit=10
//
// Public-readable comments stream. Each game's rate-on-leave feedback is
// already stored at `comment:<slug>:<id>` (see /api/feedback). Until now
// only admin/stats read them — this exposes the latest few to every
// player so the gallery feels alive.
//
// Privacy: comments are anonymous by design (no IP, no user_id stored
// alongside the text — see feedback.js storage shape). Nothing more is
// surfaced here than what the writer voluntarily typed.
//
// Caching: 30s edge cache + 60s stale-while-revalidate. Comments don't
// move fast and the read path hits KV once per cache miss.

import { json } from '../_lib/response.js';
import { isValidSlug } from '../_lib/validate.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const slug = String(url.searchParams.get('slug') || '');
  let limit = parseInt(url.searchParams.get('limit') || '10', 10);
  if (!Number.isFinite(limit) || limit < 1) limit = 10;
  if (limit > 50) limit = 50;

  if (!isValidSlug(slug)) {
    return json({ error: 'bad_slug' }, 400);
  }

  const prefix = `comment:${slug}:`;
  let cursor;
  const names = [];
  // KV.list scans keys in ascending lexicographic order. Comment ids are
  // `Date.now().toString(36) + rand` (see feedback.js), so key order is
  // chronological ascending and the NEWEST comments sit at the TAIL. Walk
  // every page (list-only, no value reads — cheap) to reach the tail;
  // stopping at the first 200 keys would freeze the public stream on the
  // OLDEST 200 once a game crosses 200 comments.
  do {
    const page = await env.VOTES.list({ prefix, cursor, limit: 1000 });
    cursor = page.list_complete ? null : page.cursor;
    for (const k of page.keys) names.push(k.name);
  } while (cursor);

  // Fetch only the newest tail (a small multiple of `limit` so a few empty/
  // invalid payloads can't starve the page), then sort by ts and slice.
  const tail = names.slice(-Math.max(limit * 3, 30));
  const fetched = await Promise.all(
    tail.map(async (k) => {
      const raw = await env.VOTES.get(k, 'json');
      return raw ? { ...raw, _key: k } : null;
    })
  );
  const valid = fetched
    .filter(Boolean)
    .filter(c => c.comment && c.comment.length > 0)
    .sort((a, b) => (b.ts || 0) - (a.ts || 0))
    .slice(0, limit)
    .map(c => ({
      vote:    c.vote || null,
      comment: String(c.comment || '').slice(0, 500),
      ts:      c.ts || null,
    }));

  return new Response(
    JSON.stringify({ slug, count: valid.length, comments: valid }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'public, max-age=30, stale-while-revalidate=60',
      },
    }
  );
}
