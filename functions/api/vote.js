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
import { parseCookie } from '../_lib/cookie.js';
import { grantOnce, readMeta, VOTE_GATE_MIN } from '../_lib/meta.js';
import { jsonError } from '../_lib/response.js';
import { isValidSlug } from '../_lib/validate.js';
import { checkRate } from '../_lib/rateLimit.js';

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); }
  catch { return jsonError('invalid json', 400); }

  const slug = String(body.slug || '');
  if (!isValidSlug(slug)) return jsonError('bad slug', 400);

  // Rate limit by IP
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const rateKey = `rate:${ip}:${Math.floor(Date.now() / 60000)}`;
  if (!await checkRate(env, rateKey, 30, 120)) return jsonError('rate limit', 429);

  // Fairness + anti-farm gate (Tim 2026-06-16): a player can only register a
  // like/dislike after VOTE_GATE_SECONDS of ACTIVE play on THIS game. Active
  // seconds are banked per (cookie uid, slug) by the heartbeat into meta.played.
  // Clearing an existing vote is always allowed. The play page shows a countdown
  // so the gate is visible; this server check is the backstop against spoofing.
  const settingVote = body.vote === 'like' || body.vote === 'dislike'
                   || Number(body.deltaLike) > 0 || Number(body.deltaDislike) > 0;
  if (settingVote) {
    const cookieUidForGate = parseCookie(request.headers.get('Cookie') || '', 'uid');
    const gateMeta = cookieUidForGate ? await readMeta(env, cookieUidForGate) : null;
    const playedSec = (gateMeta && gateMeta.played && gateMeta.played[slug]) || 0;
    if (playedSec < VOTE_GATE_MIN) return jsonError('play_to_rate', 403);
  }

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
  // Anonymous uid (cookie) so even non-signed-in players earn. Single
  // source of truth for the like-bonus — /api/feedback does NOT grant.
  if (dl > 0) {
    const uid = parseCookie(request.headers.get('Cookie') || '', 'uid');
    if (uid) await grantOnce(env, uid, `liked-earned:${uid}:${slug}`, 5);
  }

  return new Response(JSON.stringify({ ...cur, myVote }), {
    headers: { 'content-type': 'application/json' },
  });
}

function clampInt(v, lo, hi) {
  const n = parseInt(v);
  if (isNaN(n)) return 0;
  return n < lo ? lo : n > hi ? hi : n;
}
