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
import { readSession } from './_session.js';
import { creditPlayAndTokens } from '../_lib/meta.js';
import { isValidSlug } from '../_lib/validate.js';
import { recordActiveDay } from '../_lib/cohort.js';
import { checkRate } from '../_lib/rateLimit.js';
import { SOCIAL_SLUGS, touchPresence } from '../_lib/social.js';

// Token credit and the per-game vote-gate timer share ONE meta write per flush
// (creditPlayAndTokens, see _lib/meta.js), so the gate adds no write-budget cost.
// The retired "prompt" economy used to do a second meta write here; generation is
// now priced directly in tokens (Tim 2026-06-16).

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); }
  catch { return new Response('bad json', { status: 400 }); }

  const slug = String(body.slug || '');
  if (!isValidSlug(slug)) return new Response('bad slug', { status: 400 });

  // Clamp to [0, 300] — caps anyone trying to spam huge numbers
  const seconds = Math.max(0, Math.min(300, parseInt(body.seconds) || 0));
  if (seconds === 0) return new Response(null, { status: 204 });

  // Exclude the OWNER's own traffic from ALL analytics (player counts, retention,
  // playtime) when signed in as an internal account -- his handful of devices
  // otherwise dominate every metric. INTERNAL_UIDS (Pages env, comma-separated) holds
  // the session uids to drop; a signed-in session payload already carries
  // uid = emailToUid(email), so no recompute is needed. Targeted no-op only -- no
  // effect on any other user, no cohort key change (Tim 2026-06-17, Codex-reviewed).
  const internalUids = new Set(String(env.INTERNAL_UIDS || '').split(',').map((s) => s.trim()).filter(Boolean));
  if (internalUids.size) {
    const session = await readSession(request, env);
    if (session && session.uid && internalUids.has(session.uid)) {
      return new Response(null, { status: 204 });   // owner's own play: count nothing
    }
  }

  // rate limit by IP
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const rateKey = `hbrate:${ip}:${Math.floor(Date.now() / 3600000)}`;
  if (!await checkRate(env, rateKey, 90, 7200)) return new Response('rate limit', { status: 429 });

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
    // Creations (player-generated, sandboxed iframe -- active input can't be
    // measured) must NOT feed the token economy or the vote gate, else idling on
    // one would farm tokens + unlock rating. Server-check creationslug:<slug> so a
    // client can't bypass by omitting kind (Codex review 2026-06-16). The `||`
    // short-circuits, so the KV read only fires when kind isn't 'creation'.
    const isCreation = body.kind === 'creation' || !!(await env.VOTES.get(`creationslug:${slug}`));
    if (!isCreation) {
      let featuredMult = 1;
      const featured = await env.VOTES.get(`featured:${dateUtc}`);
      if (featured === slug) featuredMult = 2;
      // ONE meta write, and ONLY when a full minute is credited (creditPlayAndTokens
      // wall-clock-clamps and writes only when minutes>0): credit tokens (1/min, 2x on
      // the featured game) AND bank this slug's active seconds toward the 5-min vote
      // gate. The retired prompt economy's second meta write was removed, so net writes
      // per flush did not increase.
      await creditPlayAndTokens(env, uid, { slug, seconds, featuredMult });
    }

    // Retention cohort: log today as an active day for this uid. recordActiveDay
    // write-gates to ~1 KV write/uid/day (no-ops once today is already recorded),
    // and ANY visible-time heartbeat counts the return so short sessions aren't missed.
    await recordActiveDay(env, uid, dateUtc);

    // Social presence pilot (allowlisted slugs only): refresh this uid's
    // "playing now" liveness off the SAME flush - no extra client traffic.
    // Cost: +1 read +1 write per flush on pilot games. The uid is hashed
    // before storage and the key carries a short TTL (see _lib/social.js).
    if (SOCIAL_SLUGS.has(slug)) {
      try { await touchPresence(env, slug, uid); } catch (e) { /* never block the heartbeat */ }
    }
  }

  return new Response(null, { status: 204 });
}
