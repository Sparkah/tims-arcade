// GET /api/trending → returns { date, games: { slug: today_score } }
//
// Powers the gallery's hero "Trending" card so the featured slot rotates
// daily based on what players actually engaged with TODAY rather than
// all-time leaders. Without this, a one-time hit from week-1 would camp
// the hero forever.
//
// Today's score = today_seconds + (today_comments × 60). Comments are
// rare-but-meaningful; weighting one comment as a minute of play roughly
// matches the engagement intent.
//
// Data source — both already exist:
//   daily:<slug>:<YYYY-MM-DD> → seconds (heartbeat.js writes this)
//   comment:<slug>:<id>       → {vote, comment, ts} (feedback.js)
//
// Perf (2026-06-11 diagnosis): the per-key gets used to be serial and the
// max-age header alone never edge-caches a function response (see
// functions/_lib/social.js), so every call paid the full KV walk — measured
// 13.5s live, landing trending data 13s+ late on the home page's second
// paint. Fixed the same way as counts.js: _lib/edgecache.js + Promise.all.

import { edgeCached } from '../_lib/edgecache.js';

const CACHE_TTL_SECONDS = 120;

export function onRequestGet({ env }) {
  return edgeCached('/api-trending', {}, () => buildTrending(env));
}

async function buildTrending(env) {
  const today = new Date().toISOString().slice(0, 10);
  const todayStart = Date.parse(today + 'T00:00:00Z');
  const games = {};
  const ensure = (slug) => games[slug] || (games[slug] = { seconds: 0, comments: 0, score: 0 });

  // Pass 1: today's seconds per slug — gets parallelized per list page.
  let cursor;
  do {
    const list = await env.VOTES.list({ prefix: 'daily:', cursor, limit: 1000 });
    await Promise.all(list.keys.map(async (k) => {
      // key: daily:<slug>:<YYYY-MM-DD>
      const rest = k.name.slice('daily:'.length);
      const lastColon = rest.lastIndexOf(':');
      if (lastColon < 1) return;
      if (rest.slice(lastColon + 1) !== today) return;
      const slug = rest.slice(0, lastColon);
      const seconds = parseInt(await env.VOTES.get(k.name)) || 0;
      ensure(slug).seconds = seconds;
    }));
    cursor = list.list_complete ? null : list.cursor;
  } while (cursor);

  // Pass 2: today's comments per slug. Comment ids are base36-encoded
  // Date.now() prefixes — but we still need to fetch each value to read
  // its `ts` reliably. Volume is low (~1-10 per game per day), and the
  // gets run in parallel per page.
  cursor = undefined;
  do {
    const list = await env.VOTES.list({ prefix: 'comment:', cursor, limit: 1000 });
    await Promise.all(list.keys.map(async (k) => {
      const v = await env.VOTES.get(k.name, 'json');
      if (!v || !v.ts || v.ts < todayStart) return;
      const rest = k.name.slice('comment:'.length);
      const sep = rest.indexOf(':');
      if (sep < 1) return;
      ensure(rest.slice(0, sep)).comments += 1;
    }));
    cursor = list.list_complete ? null : list.cursor;
  } while (cursor);

  // Composite score
  for (const slug of Object.keys(games)) {
    const g = games[slug];
    g.score = (g.seconds || 0) + (g.comments || 0) * 60;
  }

  return new Response(
    JSON.stringify({ date: today, games }),
    {
      headers: {
        'content-type': 'application/json',
        'cache-control': `public, max-age=30, s-maxage=${CACHE_TTL_SECONDS}, stale-while-revalidate=60`,
      },
    }
  );
}
