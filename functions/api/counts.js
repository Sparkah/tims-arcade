// GET /api/counts → returns all vote counts as { slug: { likes, dislikes } }
//
// KV binding: VOTES (configured in wrangler.toml / Pages dashboard)
// Each game's counts stored under key `votes:<slug>` as JSON `{ likes, dislikes }`.
//
// Listing every key on each request is fine while the catalog is small (<200 games).
// If we ever scale beyond that, switch to a single aggregate key updated on each vote.

export async function onRequestGet({ env }) {
  const out = {};
  let cursor;
  do {
    const list = await env.VOTES.list({ prefix: 'votes:', cursor });
    for (const k of list.keys) {
      const v = await env.VOTES.get(k.name, 'json');
      if (v) out[k.name.slice('votes:'.length)] = v;
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
