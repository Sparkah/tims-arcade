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
// Caching: a Cache-Control header ALONE does not edge-cache a Pages Function
// response (see _lib/edgecache.js + counts.js) — so this endpoint previously
// ran a full `comment:<slug>:*` KV list scan on EVERY game-open, i.e. one list
// op per view. That is a top consumer of the 1k/day free KV list cap. Wrap it
// in the caches.default put/match dance, keyed per (slug, limit), 60s TTL
// (matches the prior stale-while-revalidate intent).
//
// 2026-06-30 hardening: new comments also maintain `commentidx:<slug>`, so the
// hot path is one KV read. The old prefix list remains only as a cold backfill
// for known slugs that predate the index; random valid-looking slugs return
// empty without a LIST.

import { json } from '../_lib/response.js';
import { isValidSlug } from '../_lib/validate.js';
import { edgeCached } from '../_lib/edgecache.js';
import { readPublicCommentIndex, writePublicCommentIndex } from '../_lib/commentIndex.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const slug = String(url.searchParams.get('slug') || '');
  let limit = parseInt(url.searchParams.get('limit') || '10', 10);
  if (!Number.isFinite(limit) || limit < 1) limit = 10;
  if (limit > 50) limit = 50;

  if (!isValidSlug(slug)) {
    return json({ error: 'bad_slug' }, 400);
  }

  // encodeURIComponent the slug into the synthetic cache key so the key can't be
  // split/collided even if SLUG_RE ever widens; `limit` is already a clamped int.
  return edgeCached(`/api-comments/${encodeURIComponent(slug)}?l=${limit}`, {}, () => buildComments(request, env, slug, limit));
}

async function buildComments(request, env, slug, limit) {
  const indexed = await readPublicCommentIndex(env, slug);
  if (indexed) return commentsResponse(slug, indexed.slice(0, limit));

  if (!await isKnownCommentSlug(request, env, slug)) {
    return commentsResponse(slug, []);
  }

  const legacy = await buildLegacyCommentsByList(env, slug, limit);
  try { await writePublicCommentIndex(env, slug, legacy); } catch (e) { /* best effort */ }
  return commentsResponse(slug, legacy.slice(0, limit));
}

async function buildLegacyCommentsByList(env, slug, limit) {
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
  return fetched
    .filter(Boolean)
    .filter(c => c.comment && c.comment.length > 0)
    .sort((a, b) => (b.ts || 0) - (a.ts || 0))
    .slice(0, limit)
    .map(c => ({
      id:      String(c._key || '').slice(prefix.length),
      vote:    c.vote || null,
      comment: String(c.comment || '').slice(0, 500),
      ts:      c.ts || null,
    }));
}

function commentsResponse(slug, rows) {
  return new Response(
    JSON.stringify({ slug, count: rows.length, comments: rows.map(c => ({
      vote:    c.vote || null,
      comment: String(c.comment || '').slice(0, 500),
      ts:      c.ts || null,
    })) }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=60',
      },
    }
  );
}

async function isKnownCommentSlug(request, env, slug) {
  try {
    if (await env.VOTES.get(`creationslug:${slug}`)) return true;
  } catch (e) { /* fall through */ }
  try {
    const url = new URL(request.url);
    const r = await fetch(`${url.origin}/games.json`, { cf: { cacheTtl: 300 } });
    if (!r.ok) return false;
    const games = await r.json();
    return Array.isArray(games) && games.some(g => g && g.slug === slug);
  } catch (e) {
    return false;
  }
}
