// POST /api/heartbeat
// Body: { slug: string }
// Returns: 204 (no body)
//
// Counts the visitor as having played for HEARTBEAT_SECONDS more seconds.
// Client fires every HEARTBEAT_SECONDS while the tab is visible (see play.html).
//
// To stay under the 1000 KV writes/day free tier we use a 2-minute interval:
//   - 200 plays/day × 5 min each = 500 writes — fine
//   - granularity is 2 min (partial sessions <2 min aren't counted, which is
//     actually a useful "did they really engage?" threshold)
//
// Two writes per heartbeat:
//   seconds:<slug>            — cumulative across all time
//   daily:<slug>:<YYYY-MM-DD> — bucketed by day for the trend chart
//
// Anti-abuse: 60 heartbeats / IP / hour. A single legitimate browser tab
// produces 30 heartbeats/hour at the 2-min interval, so this allows ~2x.

const HEARTBEAT_SECONDS = 120;

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); }
  catch { return new Response('bad json', { status: 400 }); }

  const slug = String(body.slug || '');
  if (!/^[a-z0-9_-]{1,40}$/i.test(slug)) return new Response('bad slug', { status: 400 });

  // rate limit
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const rateKey = `hbrate:${ip}:${Math.floor(Date.now() / 3600000)}`; // hourly bucket
  const rate = parseInt(await env.VOTES.get(rateKey)) || 0;
  if (rate >= 60) return new Response('rate limit', { status: 429 });
  await env.VOTES.put(rateKey, String(rate + 1), { expirationTtl: 7200 });

  // cumulative
  const cumKey = `seconds:${slug}`;
  const cum = parseInt(await env.VOTES.get(cumKey)) || 0;
  await env.VOTES.put(cumKey, String(cum + HEARTBEAT_SECONDS));

  // per-day
  const dateUtc = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
  const dayKey = `daily:${slug}:${dateUtc}`;
  const day = parseInt(await env.VOTES.get(dayKey)) || 0;
  // expire after 60 days so stale daily keys don't accumulate forever
  await env.VOTES.put(dayKey, String(day + HEARTBEAT_SECONDS), { expirationTtl: 60 * 24 * 60 * 60 });

  return new Response(null, { status: 204 });
}
