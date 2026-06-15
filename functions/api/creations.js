// GET /api/creations -> the PUBLIC "Player Creations" feed: vibe games their
// creators chose to publish (published + ready/live). Returns cover + author
// display name + basic stats. Edge-cached 30s. Tim 2026-06-15.
//
// NOTE: walks upload:* records; fine at gallery volume + the 30s edge cache. If
// creations grow large, add a snapshot index (see boot.js's pattern).

import { json } from '../_lib/response.js';

export async function onRequestGet({ env }) {
  const out = [];
  let cursor;
  do {
    const list = await env.VOTES.list({ prefix: 'upload:', cursor });
    for (const k of list.keys) {
      const raw = await env.VOTES.get(k.name);
      if (!raw) continue;
      let r; try { r = JSON.parse(raw); } catch { continue; }
      if (r.source !== 'vibe' || !r.published || r.status !== 'live') continue;
      const slug = String(r.slug || '');
      const [plays, seconds] = await Promise.all([
        env.VOTES.get(`plays:${slug}`),
        env.VOTES.get(`seconds:${slug}`),
      ]);
      out.push({
        id: r.id, slug,
        title: r.title || slug,
        author: r.author || 'player',
        hasCover: !!r.hasCover,
        ts: r.ts || 0,
        plays: parseInt(plays) || 0,
        seconds: parseInt(seconds) || 0,
        playUrl: `/cplay?id=${r.id}`,
      });
    }
    cursor = list.list_complete ? null : list.cursor;
  } while (cursor);

  out.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const res = json({ ok: true, creations: out.slice(0, 60) });
  res.headers.set('cache-control', 'public, max-age=30');
  return res;
}
