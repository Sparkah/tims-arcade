// GET /api/least-attention?limit=N
//
// The bottom of the attention ranking: published games that players have
// barely touched, so they can be (a) surfaced to players as the "Hidden Gems"
// shelf on the homepage and (b) triaged by Tim on the admin dashboard
// ("fix or kill").
//
// Attention score (ascending = least attention first):
//
//   attention = plays + votes * 3 + comments * 5
//
// where votes = likes + dislikes (a dislike is still attention). NOTE: the
// spec asked for plays_7d, but KV has no per-day PLAY counter - `plays:<slug>`
// is a lifetime counter and `daily:<slug>:<date>` buckets store SECONDS, not
// plays (see heartbeat.js). Lifetime plays is the established stand-in across
// the codebase (build_dashboard.py publishes it as `plays7d` too), so it is
// used here and the raw numbers are returned so callers can see exactly what
// the score is made of.
//
// Exclusions:
//   - games younger than 48h (they belong on the NEW shelf, not this one)
//   - hidden slugs (KV `hidden:set`, the admin curation list)
//   - unpublished games (games.json `published: false`)
//   - external link-out games (no local play tracking - they would camp the
//     bottom of the list forever on numbers that are not actually measured)
//
// Response:
//   {
//     generated, formula, excludedNewerThanHours, count,
//     games: [ { slug, attention, plays, likes, dislikes, votes, comments,
//                addedDate, daysSinceShip } ]   // ascending by attention
//   }
//
// Cost: one games.json fetch + the same votes:/plays:/comment: KV walk
// counts.js does, behind a 5-minute edge cache (_lib/edgecache.js, same
// pattern as counts/trending/admin-stats). ?nocache=1 forces a recompute but
// only with a valid ADMIN_TOKEN (?token= or x-admin-token header) - public
// callers always get the cached path.

import { edgeCached } from '../_lib/edgecache.js';

const NEW_WINDOW_MS = 48 * 60 * 60 * 1000;

export function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get('limit')) || 12));
  // ?nocache=1 forces a full recompute (the expensive KV walk), so it is
  // admin-token-gated - otherwise any visitor could spam the uncached path.
  // A wrong/missing token silently falls back to the cached response; the
  // recompute also refreshes the shared cache entry for everyone.
  const noCache = url.searchParams.get('nocache') === '1'
    && !!env.ADMIN_TOKEN
    && (url.searchParams.get('token') || request.headers.get('x-admin-token') || '') === env.ADMIN_TOKEN;

  return edgeCached(`/least-attention?limit=${limit}`, { bypass: noCache },
    () => buildLeastAttention(url, env, limit));
}

async function buildLeastAttention(url, env, limit) {
  // Catalogue - games.json from this deployment's origin (url.origin works on
  // both prod and `wrangler pages dev`, unlike a hardcoded https://hostname).
  let catalogue = [];
  try {
    const r = await fetch(`${url.origin}/games.json`, { cf: { cacheTtl: 60 } });
    if (r.ok) {
      const j = await r.json();
      catalogue = Array.isArray(j) ? j : (j.games || []);
    }
  } catch (e) { /* origin hiccup - fall through to empty list */ }

  // Admin-hidden slugs - same source /api/hidden reads.
  let hidden = new Set();
  try {
    const h = await env.VOTES.get('hidden:set', 'json');
    if (Array.isArray(h)) hidden = new Set(h);
  } catch (e) { /* treat as none hidden */ }

  const now = Date.now();
  const eligible = catalogue.filter(g => {
    if (!g || typeof g.slug !== 'string') return false;
    if (g.published === false) return false;
    if (g.external) return false;
    if (hidden.has(g.slug)) return false;
    if (g.addedDate) {
      const added = Date.parse(g.addedDate);
      if (Number.isFinite(added) && now - added < NEW_WINDOW_MS) return false;
    }
    return true;
  });

  // Aggregate engagement from KV - same walk counts.js does.
  const agg = {};
  const ensure = (slug) => {
    if (!agg[slug]) agg[slug] = { likes: 0, dislikes: 0, plays: 0, comments: 0 };
    return agg[slug];
  };

  let cursor;
  do {
    const list = await env.VOTES.list({ prefix: 'votes:', cursor });
    for (const k of list.keys) {
      const v = await env.VOTES.get(k.name, 'json');
      const g = ensure(k.name.slice('votes:'.length));
      if (v) { g.likes = v.likes || 0; g.dislikes = v.dislikes || 0; }
    }
    cursor = list.list_complete ? null : list.cursor;
  } while (cursor);

  cursor = undefined;
  do {
    const list = await env.VOTES.list({ prefix: 'plays:', cursor });
    for (const k of list.keys) {
      ensure(k.name.slice('plays:'.length)).plays = parseInt(await env.VOTES.get(k.name)) || 0;
    }
    cursor = list.list_complete ? null : list.cursor;
  } while (cursor);

  // Comments - count keys only, no value reads (key shape comment:<slug>:<id>).
  cursor = undefined;
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

  const rows = eligible.map(g => {
    const c = agg[g.slug] || { likes: 0, dislikes: 0, plays: 0, comments: 0 };
    const votes = (c.likes || 0) + (c.dislikes || 0);
    const addedMs = g.addedDate ? Date.parse(g.addedDate) : NaN;
    return {
      slug: g.slug,
      attention: (c.plays || 0) + votes * 3 + (c.comments || 0) * 5,
      plays: c.plays || 0,
      likes: c.likes || 0,
      dislikes: c.dislikes || 0,
      votes,
      comments: c.comments || 0,
      addedDate: g.addedDate || null,
      daysSinceShip: Number.isFinite(addedMs) ? Math.max(0, Math.floor((now - addedMs) / 86400000)) : null,
    };
  });

  // Least attention first; ties break oldest-first (longer neglected = more
  // deserving of the review slot). ISO dates compare fine as strings.
  rows.sort((a, b) =>
    (a.attention - b.attention) ||
    String(a.addedDate || '9999').localeCompare(String(b.addedDate || '9999')));

  const body = JSON.stringify({
    generated: new Date(now).toISOString(),
    formula: 'plays + votes*3 + comments*5 (votes = likes + dislikes)',
    excludedNewerThanHours: 48,
    count: Math.min(limit, rows.length),
    games: rows.slice(0, limit),
  });

  return new Response(body, {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=300, stale-while-revalidate=600',
    },
  });
}
