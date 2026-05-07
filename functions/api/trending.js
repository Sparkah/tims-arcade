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
// Cache: 30s edge cache. Comments + seconds don't move fast.

export async function onRequestGet({ env }) {
  const today = new Date().toISOString().slice(0, 10);
  const todayStart = Date.parse(today + 'T00:00:00Z');
  const games = {};

  // Pass 1: today's seconds per slug (one list call, one get per slug)
  let cursor;
  do {
    const list = await env.VOTES.list({ prefix: 'daily:', cursor, limit: 1000 });
    for (const k of list.keys) {
      // key: daily:<slug>:<YYYY-MM-DD>
      const rest = k.name.slice('daily:'.length);
      const lastColon = rest.lastIndexOf(':');
      if (lastColon < 1) continue;
      const date = rest.slice(lastColon + 1);
      if (date !== today) continue;
      const slug = rest.slice(0, lastColon);
      const seconds = parseInt(await env.VOTES.get(k.name)) || 0;
      if (!games[slug]) games[slug] = { seconds: 0, comments: 0, score: 0 };
      games[slug].seconds = seconds;
    }
    cursor = list.list_complete ? null : list.cursor;
  } while (cursor);

  // Pass 2: today's comments per slug. Comment ids are base36-encoded
  // Date.now() prefixes — but we still need to fetch each value to read
  // its `ts` reliably. Comment volume is low (~1-10 per game per day) so
  // the read cost is bounded.
  cursor = undefined;
  do {
    const list = await env.VOTES.list({ prefix: 'comment:', cursor, limit: 1000 });
    for (const k of list.keys) {
      const v = await env.VOTES.get(k.name, 'json');
      if (!v || !v.ts || v.ts < todayStart) continue;
      const rest = k.name.slice('comment:'.length);
      const sep = rest.indexOf(':');
      if (sep < 1) continue;
      const slug = rest.slice(0, sep);
      if (!games[slug]) games[slug] = { seconds: 0, comments: 0, score: 0 };
      games[slug].comments = (games[slug].comments || 0) + 1;
    }
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
        'cache-control': 'public, max-age=30, stale-while-revalidate=60',
      },
    }
  );
}
