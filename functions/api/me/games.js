// GET /api/me/games
// The signed-in user's OWN community uploads + live engagement stats, so a
// community dev can watch their game perform. Scoped by session uid (NOT the
// admin token): returns only uploads whose owner uid == the caller's uid. The
// owner uid is set at submit time, or via the admin "reassign owner" action when
// Tim uploads on a dev's behalf.
//
// Stats are read by slug from the same KV the gallery uses:
//   plays:<slug>    play count
//   seconds:<slug>  cumulative play time (seconds)
//   votes:<slug>    { likes, dislikes }
// A game only accrues these once it is live AND played through the gallery, so
// pending/just-approved games legitimately show zeros.
//
// Read-only (no KV writes). { signed_in:false } when not logged in.
//
// CACHING: this walks the whole upload:* set (a KV LIST) and the dev's "my
// games" page can poll it. Edge-cache per-uid (the caller's session, so each
// dev only ever reads their own entry), 30s. The free tier caps LIST at
// 1000/day. See Knowledge/Learnings/KV List Budget.

import { readSession } from '../_session.js';
import { edgeCached } from '../../_lib/edgecache.js';

export async function onRequestGet({ request, env }) {
  const session = await readSession(request, env);
  if (!session) {
    return new Response(JSON.stringify({ signed_in: false, games: [] }),
      { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  }
  return edgeCached(`/api-me-games/${session.uid}`, {}, () => buildMyGames(env, session));
}

async function buildMyGames(env, session) {
  const mine = [];
  let cursor;
  do {
    const list = await env.VOTES.list({ prefix: 'upload:', cursor });
    for (const k of list.keys) {
      const raw = await env.VOTES.get(k.name);
      if (!raw) continue;
      let row; try { row = JSON.parse(raw); } catch { continue; }
      if (row.uid !== session.uid) continue;
      mine.push(row);
    }
    cursor = list.list_complete ? null : list.cursor;
  } while (cursor);

  const games = await Promise.all(mine.map(async (row) => {
    const slug = String(row.slug || '');
    const [playsRaw, secondsRaw, votes] = await Promise.all([
      env.VOTES.get(`plays:${slug}`),
      env.VOTES.get(`seconds:${slug}`),
      env.VOTES.get(`votes:${slug}`, 'json'),
    ]);
    return {
      id: row.id || '',
      slug,
      title: row.title || slug,
      hook: row.hook || '',
      genre: row.genre || '',
      source: row.source || '',
      status: row.status || 'pending',
      published: !!row.published,
      hasCover: !!row.hasCover,
      ts: row.ts || 0,
      sandboxUrl: row.sandboxUrl || null,
      plays: parseInt(playsRaw) || 0,
      seconds: parseInt(secondsRaw) || 0,
      likes: (votes && votes.likes) || 0,
      dislikes: (votes && votes.dislikes) || 0,
    };
  }));

  games.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  return new Response(
    JSON.stringify({ signed_in: true, email: session.email, count: games.length, games }),
    { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=0, s-maxage=30' } });
}
