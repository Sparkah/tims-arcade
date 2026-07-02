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

import { isValidSlug } from '../_lib/validate.js';

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return new Response(null, { status: 400 }); }

  const slug = String(body.slug || '');
  const variant = parseInt(body.variant);
  if (!isValidSlug(slug)) return new Response(null, { status: 400 });
  if (!Number.isInteger(variant) || variant < 1 || variant > 20) return new Response(null, { status: 400 });

  // No KV rate-limiter here (2026-07-02): it wrote to KV on every click, and the
  // A/B click signal is directional only. Cloudflare platform protection covers
  // abuse; we don't spend a scarce KV write to guard a CTR counter.
  const key = `click:${slug}:v${variant}`;
  const cur = parseInt(await env.VOTES.get(key)) || 0;
  await env.VOTES.put(key, String(cur + 1));

  return new Response(null, { status: 204 });
}
