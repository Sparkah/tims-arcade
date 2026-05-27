// GET /api/counts → returns { slug: { likes, dislikes, plays, seconds, comments } } for every game.
//
// Reads four KV prefixes:
//   - `votes:<slug>`     → like/dislike totals
//   - `plays:<slug>`     → play counter
//   - `seconds:<slug>`   → cumulative play time (load-bearing engagement signal)
//   - `comment:<slug>:*` → counted (KV keys, not values) for the 💬 N badge

export async function onRequestGet({ env }) {
  const out = {};
  let cursor;

  // Pass 1: votes
  do {
    const list = await env.VOTES.list({ prefix: 'votes:', cursor });
    for (const k of list.keys) {
      const v = await env.VOTES.get(k.name, 'json');
      const slug = k.name.slice('votes:'.length);
      if (!out[slug]) out[slug] = { likes: 0, dislikes: 0, plays: 0, seconds: 0, comments: 0 };
      if (v) { out[slug].likes = v.likes || 0; out[slug].dislikes = v.dislikes || 0; }
    }
    cursor = list.list_complete ? null : list.cursor;
  } while (cursor);

  // Pass 2: plays
  cursor = undefined;
  do {
    const list = await env.VOTES.list({ prefix: 'plays:', cursor });
    for (const k of list.keys) {
      const v = parseInt(await env.VOTES.get(k.name)) || 0;
      const slug = k.name.slice('plays:'.length);
      if (!out[slug]) out[slug] = { likes: 0, dislikes: 0, plays: 0, seconds: 0, comments: 0 };
      out[slug].plays = v;
    }
    cursor = list.list_complete ? null : list.cursor;
  } while (cursor);

  // Pass 2b: seconds — cumulative play time, the load-bearing engagement
  // signal. engagementScore() in app.js reads this; without it the Top Rated
  // sort + all-time featured fallback silently degrade to vote-only.
  cursor = undefined;
  do {
    const list = await env.VOTES.list({ prefix: 'seconds:', cursor });
    for (const k of list.keys) {
      const v = parseInt(await env.VOTES.get(k.name)) || 0;
      const slug = k.name.slice('seconds:'.length);
      if (!out[slug]) out[slug] = { likes: 0, dislikes: 0, plays: 0, seconds: 0, comments: 0 };
      out[slug].seconds = v;
    }
    cursor = list.list_complete ? null : list.cursor;
  } while (cursor);

  // Pass 3: comments — count keys only (no fetch). Cheap: one list call
  // per 1000 keys, no value reads. Buckets by slug.
  cursor = undefined;
  do {
    const list = await env.VOTES.list({ prefix: 'comment:', cursor, limit: 1000 });
    for (const k of list.keys) {
      // key shape: comment:<slug>:<id>
      const rest = k.name.slice('comment:'.length);
      const sep = rest.indexOf(':');
      if (sep < 1) continue;
      const slug = rest.slice(0, sep);
      if (!out[slug]) out[slug] = { likes: 0, dislikes: 0, plays: 0, seconds: 0, comments: 0 };
      out[slug].comments = (out[slug].comments || 0) + 1;
    }
    cursor = list.list_complete ? null : list.cursor;
  } while (cursor);

  return new Response(JSON.stringify(out), {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=15',
    },
  });
}
