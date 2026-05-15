// POST /api/vote
// Body: { slug: string, vote: 'like' | 'dislike' | 'clear' }
//   (legacy delta form { deltaLike, deltaDislike } also accepted)
//
// Returns: { likes, dislikes, myVote? }  — updated counts + caller's vote state.
//
// Per-user vote integrity:
//   - If signed in (tgl_session cookie): uid = session uid (stable per email)
//     → server computes the delta from the user's PREVIOUS vote, so multi-
//     voting is impossible. Vote map persists in KV under user_vote:<uid>.
//   - If not signed in: falls back to deltaLike/deltaDislike from request
//     (legacy mode — anon UUID in identity.js cookie does the dedup
//     client-side). Less secure but doesn't break old clients.
//
// Anti-abuse:
//   - slug whitelist (a-z 0-9 _ -, max 40 chars)
//   - per-IP rate limit: 30 votes / 60 sec
//   - signed-in users effectively can't multi-vote on any single slug

import { readSession } from './_session.js';

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); }
  catch { return jsonError('invalid json', 400); }

  const slug = String(body.slug || '');
  if (!/^[a-z0-9_-]{1,40}$/i.test(slug)) return jsonError('bad slug', 400);

  // Rate limit by IP
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const rateKey = `rate:${ip}:${Math.floor(Date.now() / 60000)}`;
  const rate = parseInt(await env.VOTES.get(rateKey)) || 0;
  if (rate >= 30) return jsonError('rate limit', 429);
  await env.VOTES.put(rateKey, String(rate + 1), { expirationTtl: 120 });

  const session = await readSession(request, env);

  // Compute deltas. Path A: signed-in user sets explicit vote state.
  // Path B: legacy anon caller sends raw deltas.
  let dl = 0, dd = 0, myVote = null;
  if (session && body.vote !== undefined) {
    const wantedVote = body.vote === 'like' ? 'like'
                     : body.vote === 'dislike' ? 'dislike'
                     : 'clear';
    const userKey = `user_vote:${session.uid}:${slug}`;
    const prev = await env.VOTES.get(userKey);

    // Reverse previous vote
    if (prev === 'like')    dl -= 1;
    if (prev === 'dislike') dd -= 1;
    // Apply new vote
    if (wantedVote === 'like')    { dl += 1; myVote = 'like'; }
    if (wantedVote === 'dislike') { dd += 1; myVote = 'dislike'; }
    // (clear → no add, myVote stays null)

    if (dl === 0 && dd === 0) {
      // No-op — user clicked their existing vote button. Still return state.
      const cur = (await env.VOTES.get(`votes:${slug}`, 'json')) || { likes: 0, dislikes: 0 };
      return new Response(JSON.stringify({ ...cur, myVote: prev || null }), {
        headers: { 'content-type': 'application/json' },
      });
    }

    // Persist the user's new vote (or clear)
    if (wantedVote === 'clear') await env.VOTES.delete(userKey);
    else await env.VOTES.put(userKey, wantedVote);
  } else {
    // Legacy delta path
    dl = clampInt(body.deltaLike,    -1, 1);
    dd = clampInt(body.deltaDislike, -1, 1);
    if (dl === 0 && dd === 0) return jsonError('no-op', 400);
  }

  const key = `votes:${slug}`;
  const cur = (await env.VOTES.get(key, 'json')) || { likes: 0, dislikes: 0 };
  cur.likes    = Math.max(0, (cur.likes    | 0) + dl);
  cur.dislikes = Math.max(0, (cur.dislikes | 0) + dd);
  await env.VOTES.put(key, JSON.stringify(cur));

  // Meta-layer: credit +5 tokens the FIRST time a uid up-votes a slug.
  // We use the uid cookie (anonymous) here, not session.uid, so anon
  // players also earn — matches the /api/feedback behaviour.
  if (dl > 0) {
    const uid = parseCookie(request.headers.get('Cookie') || '', 'uid');
    if (uid) {
      const earnedKey = `liked-earned:${uid}:${slug}`;
      const already = await env.VOTES.get(earnedKey);
      if (!already) {
        await env.VOTES.put(earnedKey, '1', { expirationTtl: 60 * 60 * 24 * 365 });
        const raw = await env.VOTES.get(`meta:${uid}`, 'json');
        const m = raw || { tokens: 0, lifetime: 0, streak: 0, bestStreak: 0, lastLogin: null, unlocked: [] };
        m.tokens   = (m.tokens   || 0) + 5;
        m.lifetime = (m.lifetime || 0) + 5;
        await env.VOTES.put(`meta:${uid}`, JSON.stringify(m));
      }
    }
  }

  return new Response(JSON.stringify({ ...cur, myVote }), {
    headers: { 'content-type': 'application/json' },
  });
}

function parseCookie(headerVal, name) {
  if (!headerVal) return null;
  const parts = headerVal.split(/;\s*/);
  for (const p of parts) {
    const eq = p.indexOf('=');
    if (eq < 0) continue;
    if (p.slice(0, eq) === name) return p.slice(eq + 1);
  }
  return null;
}

function jsonError(msg, status) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
function clampInt(v, lo, hi) {
  const n = parseInt(v);
  if (isNaN(n)) return 0;
  return n < lo ? lo : n > hi ? hi : n;
}
