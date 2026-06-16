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
const SNAPSHOT_KEY = 'snapshot:boot';
// Gate at boot.js SNAPSHOT_FRESH_SECONDS (900), NOT STALE_SERVE_MAX (960): the
// served response is edge-cached s-maxage=60 (no stale-while-revalidate on this
// endpoint), so worst-case cross-user staleness = 900 + 60 = 960s, which stays
// under app.js VOTE_OVERRIDE_TTL_MS (1020s) — a just-voted user is never shown
// pre-vote like counts. Keep these in sync (Codex review 2026-06-16).
const SNAPSHOT_MAX_AGE_SECONDS = 900;

export function onRequestGet({ env }) {
  return edgeCached('/api-counts', {}, () => buildCounts(env));
}

async function buildCounts(env) {
  // Prefer boot's shared snapshot: 1 read, ZERO list ops. counts.js used to
  // walk votes:+plays:+seconds:+comment: (4 list ops + ~1 read/key over the
  // whole catalogue) on every 60s edge-miss, on nearly every page — the
  // dominant consumer of the free 1000/day KV LIST cap (2026-06-16 incident).
  // boot.js keeps snapshot:boot fresh in the background; serve its .counts and
  // fall back to the live walk only when it's missing or older than boot serves.
  try {
    const snap = await env.VOTES.get(SNAPSHOT_KEY, 'json');
    if (snap && Number.isFinite(snap.ts) && snap.counts && typeof snap.counts === 'object'
        && (Date.now() - snap.ts) / 1000 < SNAPSHOT_MAX_AGE_SECONDS) {
      return countsResponse(snap.counts);
    }
  } catch (e) { /* fall through to the live walk */ }
  return countsResponse(await buildCountsData(env));
}

function countsResponse(out) {
  return new Response(JSON.stringify(out), {
    headers: {
      'content-type': 'application/json',
      'cache-control': `public, max-age=15, s-maxage=${CACHE_TTL_SECONDS}`,
    },
  });
}

// Data-only builder, shared with /api/boot (the homepage's single
// first-paint request bundling counts + trending + featured).
export async function buildCountsData(env) {
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

  return out;
}
