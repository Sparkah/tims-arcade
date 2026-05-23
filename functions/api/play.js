// POST /api/play
// Body: { slug: string }
// Returns: { plays: N }  — the updated total play count for that slug
//
// Anti-abuse: per-IP rate limit 60/min (more lenient than vote since legit users
// may reload the play page multiple times). Plays counter is best-effort —
// counts are eventually consistent and we tolerate undercounting.

import { jsonError } from '../_lib/response.js';
import { isValidSlug } from '../_lib/validate.js';
import { checkRate } from '../_lib/rateLimit.js';

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); }
  catch { return jsonError('invalid json', 400); }

  const slug = String(body.slug || '');
  if (!isValidSlug(slug)) return jsonError('bad slug', 400);

  // rate limit by IP
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const rateKey = `playrate:${ip}:${Math.floor(Date.now() / 60000)}`;
  if (!await checkRate(env, rateKey, 60, 120)) return jsonError('rate limit', 429);

  const key = `plays:${slug}`;
  const cur = parseInt(await env.VOTES.get(key)) || 0;
  const next = cur + 1;
  await env.VOTES.put(key, String(next));

  return new Response(JSON.stringify({ plays: next }), {
    headers: { 'content-type': 'application/json' },
  });
}
