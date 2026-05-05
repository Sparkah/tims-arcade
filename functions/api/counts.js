// GET /api/counts → returns { slug: { likes, dislikes, plays } } for every game.
//
// Reads two KV prefixes: `votes:<slug>` for like/dislike, `plays:<slug>` for play count.

export async function onRequestGet({ env }) {
  const out = {};
  let cursor;

  // Pass 1: votes
  do {
    const list = await env.VOTES.list({ prefix: 'votes:', cursor });
    for (const k of list.keys) {
      const v = await env.VOTES.get(k.name, 'json');
      const slug = k.name.slice('votes:'.length);
      if (!out[slug]) out[slug] = { likes: 0, dislikes: 0, plays: 0 };
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
      if (!out[slug]) out[slug] = { likes: 0, dislikes: 0, plays: 0 };
      out[slug].plays = v;
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
