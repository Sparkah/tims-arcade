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
//   1. 60s edge cache via _lib/edgecache.js — cuts KV read + list cost ~95%+.
//   2. Promise.all over each list page — cold-miss latency 13.5s → <1s.
//
// Staleness contract: consumers that let the user VOTE (app.js index, play.html)
// carry the voteOverride/votedThisSession shields so a fresh vote is never
// repainted over within the TTL. Read-only consumers (lab.html) accept ≤60s
// staleness by design — verified the full consumer list 2026-06-11.

import { edgeCached } from '../_lib/edgecache.js';

const CACHE_TTL_SECONDS = 60;

export function onRequestGet({ env }) {
  return edgeCached('/api-counts', {}, () => buildCounts(env));
}

async function buildCounts(env) {
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

  return new Response(JSON.stringify(out), {
    headers: {
      'content-type': 'application/json',
      'cache-control': `public, max-age=15, s-maxage=${CACHE_TTL_SECONDS}`,
    },
  });
}
