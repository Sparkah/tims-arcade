// GET /api/admin/stats?token=<ADMIN_TOKEN>
//
// Returns aggregate stats for the admin dashboard. Token-gated against the
// ADMIN_TOKEN env var (configured in CF Pages dashboard → Settings → Environment
// variables → Production).
//
// Response shape:
// {
//   totals: { plays, seconds, likes, dislikes },
//   perGame: [
//     { slug, plays, seconds, likes, dislikes }
//   ],
//   perDay: {                      // last 14 days, keyed by YYYY-MM-DD
//     "<date>": { totalSeconds, perGame: { <slug>: seconds } }
//   }
// }

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') || request.headers.get('x-admin-token') || '';

  const expected = env.ADMIN_TOKEN;
  if (!expected) {
    return jsonError('admin_token_not_configured: set ADMIN_TOKEN env var in Pages dashboard', 500);
  }
  if (token !== expected) {
    return jsonError('forbidden', 403);
  }

  // Server-side cache via Cloudflare Cache API (does NOT count against KV ops).
  // Token-keyed so a leaked token doesn't poison the cache for the real one.
  // 5-minute TTL — admin views see data ≤5 min stale; cuts KV walks by ~60x
  // when the dashboard is reloaded or hit by eligibility_check.sh.
  // Pass `?nocache=1` on the URL to force-refresh.
  const cache = caches.default;
  const cacheKey = new Request(`https://cache.tims-arcade/admin-stats?t=${token}`, { method: 'GET' });
  const noCache = url.searchParams.get('nocache') === '1';

  if (!noCache) {
    const cached = await cache.match(cacheKey);
    if (cached) {
      // Add a header so I can spot-check cache hits in DevTools / curl
      const r = new Response(cached.body, cached);
      r.headers.set('x-cache', 'HIT');
      return r;
    }
  }

  // Aggregate per-game from votes:* / plays:* / seconds:*
  const perGame = {};
  function ensure(slug) {
    if (!perGame[slug]) perGame[slug] = { slug, likes: 0, dislikes: 0, plays: 0, seconds: 0 };
    return perGame[slug];
  }

  for (const prefix of ['votes:', 'plays:', 'seconds:']) {
    let cursor;
    do {
      const list = await env.VOTES.list({ prefix, cursor });
      for (const k of list.keys) {
        const slug = k.name.slice(prefix.length);
        const g = ensure(slug);
        if (prefix === 'votes:') {
          const v = await env.VOTES.get(k.name, 'json');
          if (v) { g.likes = v.likes || 0; g.dislikes = v.dislikes || 0; }
        } else if (prefix === 'plays:') {
          g.plays = parseInt(await env.VOTES.get(k.name)) || 0;
        } else {
          g.seconds = parseInt(await env.VOTES.get(k.name)) || 0;
        }
      }
      cursor = list.list_complete ? null : list.cursor;
    } while (cursor);
  }

  // Player comments from rate-on-leave. Keys: comment:<slug>:<id>
  // Newest first, capped at 60 to avoid blowing up the response.
  const comments = [];
  {
    let cursor;
    do {
      const list = await env.VOTES.list({ prefix: 'comment:', cursor });
      for (const k of list.keys) {
        const rest = k.name.slice('comment:'.length);
        const lastColon = rest.lastIndexOf(':');
        if (lastColon < 0) continue;
        const slug = rest.slice(0, lastColon);
        const id = rest.slice(lastColon + 1);
        const data = await env.VOTES.get(k.name, 'json');
        if (!data) continue;
        comments.push({ slug, id, vote: data.vote, comment: data.comment, ts: data.ts });
      }
      cursor = list.list_complete ? null : list.cursor;
    } while (cursor);
  }
  comments.sort((a, b) => (b.ts || 0) - (a.ts || 0));

  // A/B thumbnail click counts. Keys: click:<slug>:v<N>
  // Result attached as g.variants = { 1: clicks, 2: clicks, ... }
  {
    let cursor;
    do {
      const list = await env.VOTES.list({ prefix: 'click:', cursor });
      for (const k of list.keys) {
        const rest = k.name.slice('click:'.length);
        const lastColon = rest.lastIndexOf(':');
        if (lastColon < 0) continue;
        const slug = rest.slice(0, lastColon);
        const vraw = rest.slice(lastColon + 1);   // "v2"
        if (!vraw.startsWith('v')) continue;
        const variant = parseInt(vraw.slice(1));
        if (!Number.isInteger(variant)) continue;
        const g = ensure(slug);
        if (!g.variants) g.variants = {};
        g.variants[variant] = (g.variants[variant] || 0) + (parseInt(await env.VOTES.get(k.name)) || 0);
      }
      cursor = list.list_complete ? null : list.cursor;
    } while (cursor);
  }

  // Last 14 days
  const today = new Date();
  const dates = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }

  const perDay = {};
  for (const date of dates) {
    perDay[date] = { totalSeconds: 0, perGame: {} };
  }

  // Walk daily:* keys
  let cursor;
  do {
    const list = await env.VOTES.list({ prefix: 'daily:', cursor });
    for (const k of list.keys) {
      // key = daily:<slug>:<date>
      const rest = k.name.slice('daily:'.length);
      const lastColon = rest.lastIndexOf(':');
      if (lastColon < 0) continue;
      const slug = rest.slice(0, lastColon);
      const date = rest.slice(lastColon + 1);
      if (!perDay[date]) continue;
      const sec = parseInt(await env.VOTES.get(k.name)) || 0;
      perDay[date].totalSeconds += sec;
      perDay[date].perGame[slug] = (perDay[date].perGame[slug] || 0) + sec;
    }
    cursor = list.list_complete ? null : list.cursor;
  } while (cursor);

  // Totals
  const totals = { plays: 0, seconds: 0, likes: 0, dislikes: 0 };
  for (const slug in perGame) {
    totals.plays    += perGame[slug].plays;
    totals.seconds  += perGame[slug].seconds;
    totals.likes    += perGame[slug].likes;
    totals.dislikes += perGame[slug].dislikes;
  }

  const games = Object.values(perGame).sort((a, b) => b.seconds - a.seconds);

  // ── Daily highlights: today's pulse + tomorrow's iteration queue ─────────
  const todayKey = dates[dates.length - 1];      // YYYY-MM-DD UTC
  const yesterdayKey = dates[dates.length - 2];

  const todayBlock = perDay[todayKey] || { totalSeconds: 0, perGame: {} };
  const yesterdayBlock = perDay[yesterdayKey] || { totalSeconds: 0, perGame: {} };

  // Today's top game by seconds played
  let todayTop = null;
  for (const [slug, secs] of Object.entries(todayBlock.perGame)) {
    if (!todayTop || secs > todayTop.seconds) todayTop = { slug, seconds: secs };
  }

  // Iteration queue — applies the same logic as eligibility_check.sh:
  // threshold (likes>=3 OR plays>=5 AND avg_sec>=30), engagement score,
  // top 3. We don't know iteration count from KV, so we surface candidates
  // and let the caller worry about the 14-iter cap.
  const iterationQueue = games
    .map(g => {
      const avgSec = g.plays > 0 ? Math.round(g.seconds / g.plays) : 0;
      const eligible = (g.likes || 0) >= 3 || ((g.plays || 0) >= 5 && avgSec >= 30);
      const engagement = g.plays * avgSec + ((g.likes || 0) - (g.dislikes || 0)) * 5;
      return { slug: g.slug, plays: g.plays, avgSec, likes: g.likes, dislikes: g.dislikes, engagement, eligible };
    })
    .filter(g => g.eligible)
    .sort((a, b) => b.engagement - a.engagement)
    .slice(0, 5);   // surface up to 5 — top-3 will actually be picked

  // Comments since 24h ago — what's NEW for the morning scan
  const dayAgoMs = Date.now() - 24 * 60 * 60 * 1000;
  const newComments = comments.filter(c => c.ts && c.ts >= dayAgoMs);

  const highlights = {
    todayDate: todayKey,
    todayPlays: Object.values(todayBlock.perGame).reduce((a, b) => a + (b > 0 ? 1 : 0), 0), // unique games played today
    todaySeconds: todayBlock.totalSeconds,
    yesterdaySeconds: yesterdayBlock.totalSeconds,
    secondsDelta: todayBlock.totalSeconds - yesterdayBlock.totalSeconds,
    todayTop,                  // { slug, seconds } | null
    iterationQueue,            // up to 5 eligible, sorted by engagement
    newCommentsCount: newComments.length,
  };

  const responseBody = JSON.stringify({
    totals,
    perGame: games,
    perDay,
    comments: comments.slice(0, 60),
    highlights,
  });

  const fresh = new Response(responseBody, {
    headers: {
      'content-type': 'application/json',
      // Cache API will honour Cache-Control on .put. 300s = 5 min.
      'cache-control': 'public, max-age=300',
      'x-cache': 'MISS',
    },
  });

  // Stash a clone in the edge cache for the next 5 min of admin views.
  // Errors here are non-fatal — worst case the next call recomputes.
  try { await cache.put(cacheKey, fresh.clone()); } catch (e) { /* ignore */ }

  return fresh;
}

function jsonError(msg, status) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
