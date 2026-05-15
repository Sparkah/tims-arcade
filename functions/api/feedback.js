// POST /api/feedback
// Body: { slug, vote: 'like' | 'dislike' | 'neutral', comment?: string }
//
// Logs both:
//   - vote count (votes:<slug> like+1 / dislike+1) — same as /api/vote
//   - free-text comment (comments:<slug>:<id>) — capped 500 chars
//
// Triggered by the rate-on-leave overlay in play.html. Tim reads the comments
// from the admin dashboard to inform what mechanics resonate.
//
// Rate limit: 30 feedback posts/min/IP (more lenient than vote since this is
// the "exit interview" path).

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return jsonError('invalid_json', 400); }

  const slug    = String(body.slug || '');
  const vote    = String(body.vote || '');
  const comment = String(body.comment || '').slice(0, 500).trim();
  const imageId = String(body.imageId || '').slice(0, 32).trim();

  if (!/^[a-z0-9_-]{1,40}$/i.test(slug))                return jsonError('bad_slug', 400);
  if (!['like','dislike','neutral','empty'].includes(vote)) return jsonError('bad_vote', 400);
  if (imageId && !/^[a-z0-9]{4,32}$/.test(imageId))     return jsonError('bad_image_id', 400);

  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const rateKey = `fbrate:${ip}:${Math.floor(Date.now() / 60000)}`;
  const rate = parseInt(await env.VOTES.get(rateKey)) || 0;
  if (rate >= 30) return jsonError('rate_limit', 429);
  await env.VOTES.put(rateKey, String(rate + 1), { expirationTtl: 120 });

  // Tally vote (skipped if neutral)
  if (vote === 'like' || vote === 'dislike') {
    const key = `votes:${slug}`;
    const cur = (await env.VOTES.get(key, 'json')) || { likes: 0, dislikes: 0 };
    if (vote === 'like')    cur.likes    = (cur.likes    || 0) + 1;
    if (vote === 'dislike') cur.dislikes = (cur.dislikes || 0) + 1;
    await env.VOTES.put(key, JSON.stringify(cur));
  }

  // Comment storage (skipped if empty AND no image)
  if (comment || imageId) {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const ckey = `comment:${slug}:${id}`;
    const payload = JSON.stringify({ vote, comment, ts: Date.now(), ...(imageId ? { imageId } : {}) });
    await env.VOTES.put(ckey, payload);
  }

  return new Response(null, { status: 204 });
}

function jsonError(msg, status) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
