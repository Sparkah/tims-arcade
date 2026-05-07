// GET /api/counts → returns { slug: { likes, dislikes, plays, comments } } for every game.
//
// Reads three KV prefixes:
//   - `votes:<slug>`     → like/dislike totals
//   - `plays:<slug>`     → play counter
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
      if (!out[slug]) out[slug] = { likes: 0, dislikes: 0, plays: 0, comments: 0 };
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
      if (!out[slug]) out[slug] = { likes: 0, dislikes: 0, plays: 0, comments: 0 };
      out[slug].plays = v;
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
      if (!out[slug]) out[slug] = { likes: 0, dislikes: 0, plays: 0, comments: 0 };
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
