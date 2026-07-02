// POST /api/play
// Body: { slug: string }
// Returns: { plays: N }  — the updated total play count for that slug
//
// Anti-abuse: per-IP rate limit 60/min (more lenient than vote since legit users
// may reload the play page multiple times). Plays counter is best-effort —
// counts are eventually consistent and we tolerate undercounting.

import { jsonError } from '../_lib/response.js';
import { isValidSlug } from '../_lib/validate.js';

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); }
  catch { return jsonError('invalid json', 400); }

  const slug = String(body.slug || '');
  if (!isValidSlug(slug)) return jsonError('bad slug', 400);

  // No KV rate-limiter here (2026-07-02): the limiter did a KV write on every
  // call, doubling the cost of this counter and helping drain the 1k/day budget.
  // The play count is best-effort social proof only; lean on Cloudflare's
  // platform bot/DDoS protection instead of spending a KV write to guard it.
  const key = `plays:${slug}`;
  const cur = parseInt(await env.VOTES.get(key)) || 0;
  const next = cur + 1;
  await env.VOTES.put(key, String(next));

  return new Response(JSON.stringify({ plays: next }), {
    headers: { 'content-type': 'application/json' },
  });
}
