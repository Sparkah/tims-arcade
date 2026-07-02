// POST /api/heartbeat
// Body: { slug: string, seconds: number }
//   seconds = actual visible-time delta the client measured since last flush
//             (clamped server-side to [0, 300])
// Returns: 204
//
// Client measures visible time in 5-second ticks (see play.html) and flushes
// every 2 minutes for the signed-in economy, plus one FINAL flush when the tab
// is hidden / closed.
//
// KV write policy (2026-07-02 rework — free tier is 1k writes/day, ONE shared
// namespace). Game telemetry (playtime, funnels, retention) is GameAnalytics's
// job now; these KV counters exist ONLY to rank/sort the gallery + trending:
//   seconds:<slug> / daily:<slug>:<date>  — written ONCE per session, and only
//     when the client sends `playSeconds` on its final flush (was 2 writes per
//     2-min flush; that fan-out plus the rate-limiter write drained the budget).
//   meta:<uid>  — token economy + vote-gate banking, per flush, signed-in only
//     (self-gated to when a minute lands / the gate is crossed).
// Removed here: the per-request rate-limiter write and the retention cohort
// write (D1/D7 live in GameAnalytics). No console output (Yandex rule).

import { parseCookie } from '../_lib/cookie.js';
import { readSession } from './_session.js';
import { creditPlayAndTokens } from '../_lib/meta.js';
import { isValidSlug } from '../_lib/validate.js';
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

  // `seconds` = per-flush active delta; drives the signed-in token economy +
  // vote-gate banking (creditPlayAndTokens). Clamp to [0, 300].
  const seconds = Math.max(0, Math.min(300, parseInt(body.seconds) || 0));
  // `playSeconds` = whole-session active time, sent ONLY on the client's final
  // flush (tab hidden / pagehide). It is the ONLY input that writes the
  // seconds:/daily: gallery-ranking counters, so playtime now costs ~1 write
  // PER SESSION instead of one per 2-min flush. Clamp to a sane ceiling (4h).
  const playSeconds = Math.max(0, Math.min(4 * 3600, parseInt(body.playSeconds) || 0));
  if (seconds === 0 && playSeconds === 0) return new Response(null, { status: 204 });

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

  // Playtime counters (gallery ranking + trending hero). Written ONLY when the
  // client reports playSeconds on its final flush, so a whole session is ~2
  // writes here rather than 2 per 2-min flush. No per-request rate-limiter write
  // (that anti-abuse counter was itself a KV write on every heartbeat); rely on
  // Cloudflare's platform protection + the wall-clock clamp in the economy.
  const dateUtc = new Date().toISOString().slice(0, 10);
  if (playSeconds > 0) {
    const cumKey = `seconds:${slug}`;
    const cum = parseInt(await env.VOTES.get(cumKey)) || 0;
    await env.VOTES.put(cumKey, String(cum + playSeconds));

    // per-day bucket (60-day TTL so stale keys don't pile up)
    const dayKey = `daily:${slug}:${dateUtc}`;
    const day = parseInt(await env.VOTES.get(dayKey)) || 0;
    await env.VOTES.put(dayKey, String(day + playSeconds), { expirationTtl: 60 * 24 * 60 * 60 });
  }

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

    // (Retention cohort removed 2026-07-02: D1/D7 now live in GameAnalytics, and
    // the per-uid cohort: keys plus their list() scan were a top KV write+list
    // drain. See admin/cohorts.js for the retired reader.)

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
