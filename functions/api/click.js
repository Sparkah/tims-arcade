// POST /api/click
// Body: { slug: string, variant: integer 1..N }
// Logs a thumbnail-variant click for A/B analysis.
//
// We only count *clicks*, not impressions: the gallery picks variants randomly
// per pageview, so impression distribution is uniform over time, and raw click
// counts give a directional CTR signal without burning KV writes on impressions.
//
// Anti-abuse: 120 clicks/min per IP. Returns 204 — no-content; sendBeacon
// callers don't read the response anyway.

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return new Response(null, { status: 400 }); }

  const slug = String(body.slug || '');
  const variant = parseInt(body.variant);
  if (!/^[a-z0-9_-]{1,40}$/i.test(slug)) return new Response(null, { status: 400 });
  if (!Number.isInteger(variant) || variant < 1 || variant > 20) return new Response(null, { status: 400 });

  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const rateKey = `clickrate:${ip}:${Math.floor(Date.now() / 60000)}`;
  const rate = parseInt(await env.VOTES.get(rateKey)) || 0;
  if (rate >= 120) return new Response(null, { status: 429 });
  await env.VOTES.put(rateKey, String(rate + 1), { expirationTtl: 120 });

  const key = `click:${slug}:v${variant}`;
  const cur = parseInt(await env.VOTES.get(key)) || 0;
  await env.VOTES.put(key, String(cur + 1));

  return new Response(null, { status: 204 });
}
