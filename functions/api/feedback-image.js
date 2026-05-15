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

  // Sniff magic bytes — don't trust client-declared mime. Decode just the
  // first dozen bytes and verify they match the claimed format. Anything
  // mismatched is rejected so an admin clicking the served URL never gets
  // an unexpected blob.
  let head;
  try {
    head = Uint8Array.from(atob(data.slice(0, 24)), c => c.charCodeAt(0));
  } catch { return jsonError('bad_base64', 400); }
  if (!magicMatches(head, mime)) return jsonError('mime_mismatch', 400);

  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const rateKey = `imgrate:${ip}:${Math.floor(Date.now() / 60000)}`;
  const rate = parseInt(await env.VOTES.get(rateKey)) || 0;
  if (rate >= 10) return jsonError('rate_limit', 429);
  await env.VOTES.put(rateKey, String(rate + 1), { expirationTtl: 120 });

  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const key = `feedbackimg:${slug}:${id}`;
  const payload = JSON.stringify({ mime, data, ts: Date.now(), size: decodedSize });
  // 60-day TTL: feedback is rarely actioned after that window, and the cap
  // auto-cleans abandoned uploads (image POST succeeded but feedback POST
  // never followed) so a bad actor can't fill KV indefinitely.
  await env.VOTES.put(key, payload, { expirationTtl: 60 * 60 * 24 * 60 });

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

function magicMatches(bytes, mime) {
  if (!bytes || bytes.length < 4) return false;
  if (mime === 'image/png') {
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;
  }
  if (mime === 'image/jpeg') {
    return bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF;
  }
  if (mime === 'image/webp') {
    return bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
        && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  }
  return false;
}
