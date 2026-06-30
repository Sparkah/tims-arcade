// POST /api/vote
// Body: { slug: string, vote: 'like' | 'dislike' | 'clear' }
//   Legacy delta bodies are accepted only as requested end-state hints; the
//   server computes the actual count delta from stored per-voter state.
//
// Returns: { likes, dislikes, myVote? }  — updated counts + caller's vote state.
//
// Per-user vote integrity:
//   - If signed in (tgl_session cookie): uid = session uid (stable per email)
//     → server computes the delta from the user's PREVIOUS vote, so multi-
//     voting is impossible. Vote map persists in KV under user_vote:<uid>.
//   - If not signed in: uid = anonymous identity cookie. The same previous-vote
//     map is used, so replaying requests cannot inflate raw counters.
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
import { applyVoteState, normalizeVoteRequest } from '../_lib/voteState.js';

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

  const wantedVote = normalizeVoteRequest(body);
  if (!wantedVote) return jsonError('bad_vote', 400);

  const cookieHeader = request.headers.get('Cookie') || '';
  const cookieUidForGate = parseCookie(cookieHeader, 'uid');

  // Fairness + anti-farm gate (Tim 2026-06-16): a player can only register a
  // like/dislike after VOTE_GATE_SECONDS of ACTIVE play on THIS game. Active
  // seconds are banked per (cookie uid, slug) by the heartbeat into meta.played.
  // Clearing an existing vote is always allowed. The play page shows a countdown
  // so the gate is visible; this server check is the backstop against spoofing.
  const settingVote = wantedVote === 'like' || wantedVote === 'dislike';
  if (settingVote) {
    const gateMeta = cookieUidForGate ? await readMeta(env, cookieUidForGate) : null;
    const playedSec = (gateMeta && gateMeta.played && gateMeta.played[slug]) || 0;
    if (playedSec < VOTE_GATE_MIN) return jsonError('play_to_rate', 403);
  }

  const session = await readSession(request, env);
  const applied = await applyVoteState(env, {
    slug,
    wantedVote,
    session,
    anonUid: cookieUidForGate,
  });
  if (!applied.ok) {
    return jsonError(settingVote ? 'play_to_rate' : 'no-op', settingVote ? 403 : 400);
  }

  // Meta-layer: credit +5 tokens the FIRST time a uid up-votes a slug.
  // Anonymous uid (cookie) so even non-signed-in players earn. Single
  // source of truth for the like-bonus — /api/feedback does NOT grant.
  if (applied.dl > 0) {
    if (cookieUidForGate) await grantOnce(env, cookieUidForGate, `liked-earned:${cookieUidForGate}:${slug}`, 5);
  }

  return new Response(JSON.stringify({ ...applied.counts, myVote: applied.myVote }), {
    headers: { 'content-type': 'application/json' },
  });
}
