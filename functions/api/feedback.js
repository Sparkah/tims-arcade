// POST /api/feedback
// Body: { slug, vote: 'like' | 'dislike' | 'neutral' | 'empty',
//         comment?: string,
//         imageIds?: string[],   // new shape (≤5 entries)
//         imageId?:  string }    // legacy shape (single id) — still honoured
//
// Logs both:
//   - vote count (votes:<slug>) via the same per-voter state as /api/vote
//   - free-text comment (comments:<slug>:<id>) — capped 500 chars; payload
//     stores imageIds[] when any are attached, plus a single imageId
//     mirroring the first one for back-compat with admin/stats readers
//     that haven't migrated yet.
//
// Triggered by the rate-on-leave overlay in play.html. Tim reads the comments
// from the admin dashboard to inform what mechanics resonate.
//
// Rate limit: 30 feedback posts/min/IP (more lenient than vote since this is
// the "exit interview" path).

import { jsonError } from '../_lib/response.js';
import { isValidSlug } from '../_lib/validate.js';
import { checkRate } from '../_lib/rateLimit.js';
import { parseCookie } from '../_lib/cookie.js';
import { readMeta, VOTE_GATE_MIN } from '../_lib/meta.js';
import { readSession } from './_session.js';
import { applyVoteState } from '../_lib/voteState.js';

const MAX_IMAGES = 5;

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return jsonError('invalid_json', 400); }

  const slug    = String(body.slug || '');
  const vote    = String(body.vote || '');
  const comment = String(body.comment || '').slice(0, 500).trim();

  // Accept both the new array shape and the legacy single-id shape. Merge
  // dedup'd so the same id can't be double-recorded if a client sends both.
  const rawIds = [];
  if (Array.isArray(body.imageIds)) rawIds.push(...body.imageIds);
  if (typeof body.imageId === 'string' && body.imageId) rawIds.push(body.imageId);
  const imageIds = [];
  for (const v of rawIds) {
    const s = String(v || '').slice(0, 32).trim();
    if (!s) continue;
    if (!/^[a-z0-9]{4,32}$/.test(s)) return jsonError('bad_image_id', 400);
    if (!imageIds.includes(s)) imageIds.push(s);
    if (imageIds.length >= MAX_IMAGES) break;
  }

  if (!isValidSlug(slug))                               return jsonError('bad_slug', 400);
  if (!['like','dislike','neutral','empty'].includes(vote)) return jsonError('bad_vote', 400);

  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const rateKey = `fbrate:${ip}:${Math.floor(Date.now() / 60000)}`;
  if (!await checkRate(env, rateKey, 30, 120)) return jsonError('rate_limit', 429);

  // Tally vote (skipped if neutral). Gated identically to /api/vote, then applied
  // through the same per-voter state map so repeated overlay submissions cannot
  // inflate raw counts. The comment/images below are NOT gated. (Codex review
  // 2026-06-16; hardened 2026-06-30)
  if (vote === 'like' || vote === 'dislike') {
    const cookieUid = parseCookie(request.headers.get('Cookie') || '', 'uid');
    const gateMeta = cookieUid ? await readMeta(env, cookieUid) : null;
    const playedSec = (gateMeta && gateMeta.played && gateMeta.played[slug]) || 0;
    if (playedSec >= VOTE_GATE_MIN) {
      const session = await readSession(request, env);
      await applyVoteState(env, { slug, wantedVote: vote, session, anonUid: cookieUid });
    }
    // else: below the play gate -- skip the tally (comment/images still stored below)
  }

  // Note: the +5 like-bonus is granted by /api/vote, NOT here. That's the
  // single source of truth for the token economy — /api/feedback only
  // updates the vote tally and stores the comment.

  // Comment storage (skipped if empty AND no images)
  if (comment || imageIds.length > 0) {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const ckey = `comment:${slug}:${id}`;
    // Mirror the first id into the legacy `imageId` field so existing
    // admin/stats consumers (which read `c.imageId`) keep showing the
    // attachment indicator until they migrate to `imageIds`.
    const payload = JSON.stringify({
      vote,
      comment,
      ts: Date.now(),
      ...(imageIds.length > 0 ? { imageIds, imageId: imageIds[0] } : {}),
    });
    await env.VOTES.put(ckey, payload);
  }

  return new Response(null, { status: 204 });
}
