// POST /api/play
// Body: { slug: string }
// Returns: { plays: N }  — the updated total play count for that slug
//
// Anti-abuse: per-IP rate limit 60/min (more lenient than vote since legit users
// may reload the play page multiple times). Plays counter is best-effort —
// counts are eventually consistent and we tolerate undercounting.

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); }
  catch { return jsonError('invalid json', 400); }

  const slug = String(body.slug || '');
  if (!/^[a-z0-9_-]{1,40}$/i.test(slug)) return jsonError('bad slug', 400);

  // rate limit by IP
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const rateKey = `playrate:${ip}:${Math.floor(Date.now() / 60000)}`;
  const rate = parseInt(await env.VOTES.get(rateKey)) || 0;
  if (rate >= 60) return jsonError('rate limit', 429);
  await env.VOTES.put(rateKey, String(rate + 1), { expirationTtl: 120 });

  const key = `plays:${slug}`;
  const cur = parseInt(await env.VOTES.get(key)) || 0;
  const next = cur + 1;
  await env.VOTES.put(key, String(next));

  return new Response(JSON.stringify({ plays: next }), {
    headers: { 'content-type': 'application/json' },
  });
}

function jsonError(msg, status) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
