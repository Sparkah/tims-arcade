// POST /api/feedback-image
// Body (JSON): { slug, mime: 'image/webp'|'image/jpeg'|'image/png', data: base64 }
//
// Stores a player-attached screenshot in KV under
//   feedbackimg:<slug>:<id>  →  { mime, data, ts, size }
//
// Returns { id } — the client then includes imageId in the /api/feedback POST.
//
// Cap: 1.5 MB decoded. Players who care about a specific bug screenshot in
// at 1024px webp/jpeg comfortably hit ~150-500 KB after the client resize
// pass. Server still rejects anything over 1.5 MB hard.
//
// Rate limit: 10 image uploads/min/IP (tighter than text feedback because
// each blob costs KV space).

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return jsonError('invalid_json', 400); }

  const slug = String(body.slug || '');
  const mime = String(body.mime || '');
  const data = String(body.data || '');

  if (!/^[a-z0-9_-]{1,40}$/i.test(slug))                 return jsonError('bad_slug', 400);
  if (!['image/webp','image/jpeg','image/png'].includes(mime)) return jsonError('bad_mime', 400);
  if (data.length < 64 || data.length > 2_100_000)       return jsonError('bad_size', 413);

  const decodedSize = Math.floor(data.length * 3 / 4);
  if (decodedSize > 1_500_000) return jsonError('too_large', 413);

  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const rateKey = `imgrate:${ip}:${Math.floor(Date.now() / 60000)}`;
  const rate = parseInt(await env.VOTES.get(rateKey)) || 0;
  if (rate >= 10) return jsonError('rate_limit', 429);
  await env.VOTES.put(rateKey, String(rate + 1), { expirationTtl: 120 });

  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const key = `feedbackimg:${slug}:${id}`;
  const payload = JSON.stringify({ mime, data, ts: Date.now(), size: decodedSize });
  await env.VOTES.put(key, payload);

  return new Response(JSON.stringify({ id }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function jsonError(msg, status) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
