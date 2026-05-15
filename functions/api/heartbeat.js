// POST /api/heartbeat
// Body: { slug: string, seconds: number }
//   seconds = actual visible-time delta the client measured since last flush
//             (clamped server-side to [0, 300])
// Returns: 204
//
// Client measures visible time in 5-second ticks (see play.html) and flushes
// every 2 minutes or on pagehide. So the server receives ~1 write per 2 min
// per active visitor but the COUNT reflects real elapsed time at ~5s accuracy.
// This gives a 30-second bounce credit of 30 seconds (not 0 or 120).
//
// Two writes per heartbeat:
//   seconds:<slug>            — cumulative across all time
//   daily:<slug>:<YYYY-MM-DD> — bucketed by day for the trend chart
//
// Cost math (free tier = 1k KV writes/day):
//   200 plays/day × 5 min avg × 1 flush per 2 min × 2 writes = 1000 writes/day.
//   Once traffic exceeds this we migrate to D1 (100k writes/day free).
//
// Anti-abuse: 90 heartbeats / IP / hour. A single tab produces ~30/hour, so
// this allows for shared connections (NAT) while blocking obvious bots.

import { parseCookie } from '../_lib/cookie.js';
import { creditTokens } from '../_lib/meta.js';

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); }
  catch { return new Response('bad json', { status: 400 }); }

  const slug = String(body.slug || '');
  if (!/^[a-z0-9_-]{1,40}$/i.test(slug)) return new Response('bad slug', { status: 400 });

  // Clamp to [0, 300] — caps anyone trying to spam huge numbers
  const seconds = Math.max(0, Math.min(300, parseInt(body.seconds) || 0));
  if (seconds === 0) return new Response(null, { status: 204 });

  // rate limit by IP
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const rateKey = `hbrate:${ip}:${Math.floor(Date.now() / 3600000)}`;
  const rate = parseInt(await env.VOTES.get(rateKey)) || 0;
  if (rate >= 90) return new Response('rate limit', { status: 429 });
  await env.VOTES.put(rateKey, String(rate + 1), { expirationTtl: 7200 });

  // cumulative
  const cumKey = `seconds:${slug}`;
  const cum = parseInt(await env.VOTES.get(cumKey)) || 0;
  await env.VOTES.put(cumKey, String(cum + seconds));

  // per-day bucket (60-day TTL so stale keys don't pile up)
  const dateUtc = new Date().toISOString().slice(0, 10);
  const dayKey = `daily:${slug}:${dateUtc}`;
  const day = parseInt(await env.VOTES.get(dayKey)) || 0;
  await env.VOTES.put(dayKey, String(day + seconds), { expirationTtl: 60 * 24 * 60 * 60 });

  // Credit meta-layer tokens: 1 token per full minute of play. Featured
  // Challenge of the day awards 2× — we look up the featured slug from
  // KV; if it's missing (early in the day before rotation lands) just
  // award the base rate.
  const uid = parseCookie(request.headers.get('Cookie') || '', 'uid');
  if (uid) {
    let minutes = Math.floor(seconds / 60);
    if (minutes > 0) {
      const featured = await env.VOTES.get(`featured:${dateUtc}`);
      if (featured === slug) minutes *= 2;
      await creditTokens(env, uid, minutes);
    }
  }

  return new Response(null, { status: 204 });
}
