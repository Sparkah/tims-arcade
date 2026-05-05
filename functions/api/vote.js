// POST /api/vote
// Body: { slug: string, deltaLike: -1|0|1, deltaDislike: -1|0|1 }
// Returns: { likes, dislikes } — updated counts for that slug
//
// Anti-abuse:
//   - slug whitelist (a-z 0-9 _ -, max 40 chars)
//   - deltas clamped to [-1, 1]
//   - per-IP rate limit: 30 votes / 60 seconds (KV-tracked, soft)
//   - per-IP per-slug write-through prevents trivial spam

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); }
  catch { return jsonError('invalid json', 400); }

  const slug = String(body.slug || '');
  if (!/^[a-z0-9_-]{1,40}$/i.test(slug)) return jsonError('bad slug', 400);

  const dl = clampInt(body.deltaLike,    -1, 1);
  const dd = clampInt(body.deltaDislike, -1, 1);
  if (dl === 0 && dd === 0) return jsonError('no-op', 400);

  // ── rate limit by IP ─────────────────────────────────
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const rateKey = `rate:${ip}:${Math.floor(Date.now() / 60000)}`; // bucketed per minute
  const rate = parseInt(await env.VOTES.get(rateKey)) || 0;
  if (rate >= 30) return jsonError('rate limit', 429);
  await env.VOTES.put(rateKey, String(rate + 1), { expirationTtl: 120 });

  // ── apply delta ──────────────────────────────────────
  const key = `votes:${slug}`;
  const cur = (await env.VOTES.get(key, 'json')) || { likes: 0, dislikes: 0 };
  cur.likes    = Math.max(0, (cur.likes    | 0) + dl);
  cur.dislikes = Math.max(0, (cur.dislikes | 0) + dd);
  await env.VOTES.put(key, JSON.stringify(cur));

  return new Response(JSON.stringify(cur), {
    headers: { 'content-type': 'application/json' },
  });
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
