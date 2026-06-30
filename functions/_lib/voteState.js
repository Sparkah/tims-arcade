// Authoritative per-voter state for like/dislike counts.
// Both /api/vote and /api/feedback use this so anonymous callers cannot inflate
// raw counters by replaying client-supplied deltas.

export function normalizeVoteRequest(body = {}) {
  if (Object.prototype.hasOwnProperty.call(body, 'vote')) {
    const vote = String(body.vote || '');
    return vote === 'like' || vote === 'dislike' || vote === 'clear' ? vote : null;
  }

  // Legacy clients used to send raw deltas. Keep them working, but treat the
  // deltas only as a requested end-state; never apply their numeric values.
  const dl = clampDelta(body.deltaLike);
  const dd = clampDelta(body.deltaDislike);
  if (dl > 0 && dd <= 0) return 'like';
  if (dd > 0 && dl <= 0) return 'dislike';
  if (dl < 0 || dd < 0) return 'clear';
  return null;
}

export async function applyVoteState(env, { slug, wantedVote, session, anonUid }) {
  if (!env || !env.VOTES || !slug) return { ok: false, error: 'bad_vote_context' };
  if (wantedVote !== 'like' && wantedVote !== 'dislike' && wantedVote !== 'clear') {
    return { ok: false, error: 'bad_vote' };
  }

  const userKey = voteStateKey({ session, anonUid, slug });
  if (!userKey) return { ok: false, error: 'missing_voter' };

  const prevRaw = await env.VOTES.get(userKey);
  const prev = prevRaw === 'like' || prevRaw === 'dislike' ? prevRaw : null;
  const myVote = wantedVote === 'clear' ? null : wantedVote;

  let dl = 0;
  let dd = 0;
  if (prev === 'like') dl -= 1;
  if (prev === 'dislike') dd -= 1;
  if (wantedVote === 'like') dl += 1;
  if (wantedVote === 'dislike') dd += 1;

  const key = `votes:${slug}`;
  const cur = normalizeCounts(await env.VOTES.get(key, 'json'));

  if (dl === 0 && dd === 0) {
    return { ok: true, counts: cur, myVote: prev, dl: 0, dd: 0, changed: false };
  }

  if (wantedVote === 'clear') await env.VOTES.delete(userKey);
  else await env.VOTES.put(userKey, wantedVote);

  cur.likes = Math.max(0, (cur.likes | 0) + dl);
  cur.dislikes = Math.max(0, (cur.dislikes | 0) + dd);
  await env.VOTES.put(key, JSON.stringify(cur));

  return { ok: true, counts: cur, myVote, dl, dd, changed: true };
}

function voteStateKey({ session, anonUid, slug }) {
  if (session && session.uid) return `user_vote:${session.uid}:${slug}`;
  if (anonUid) return `user_vote:anon:${anonUid}:${slug}`;
  return null;
}

function normalizeCounts(value) {
  const likes = value && Number.isFinite(Number(value.likes)) ? Number(value.likes) | 0 : 0;
  const dislikes = value && Number.isFinite(Number(value.dislikes)) ? Number(value.dislikes) | 0 : 0;
  return {
    likes: Math.max(0, likes),
    dislikes: Math.max(0, dislikes),
  };
}

function clampDelta(v) {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return 0;
  return n < -1 ? -1 : n > 1 ? 1 : n;
}
