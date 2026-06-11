// Social presence + emotes endpoint (pilot 2026-06-11).
//
//   GET  /api/social?slug=<slug>
//        -> 200 { n, e: [{ i, t, n }] }   allowlisted slug
//           n = players seen by heartbeat in the last 3 min (anonymous count)
//           e = emotes from the last 45s: i = index 0-5, t = ms timestamp,
//               n = SERVER-generated nonce (client dedupe across polls)
//        -> 404                            slug not in the pilot allowlist
//   POST /api/social  { slug, emote }
//        -> 200 { n: nonce } | 400 | 403 | 404 | 429
//
// Guardrails (Knowledge/Learnings/Player Chat Options.md - this pilot is
// deliberately ZERO-UGC):
//   - emote is an integer INDEX into a fixed vetted set rendered client-side;
//     no player-authored bytes are stored or echoed, nonces are server-made
//   - no usernames or uids in any response - just an anonymous count
//   - no history: 30-entry ring, 15-min KV TTL, GET window 45s
//   - the play.html overlay probes this GET once and renders NOTHING unless
//     it answers 200, so non-allowlisted games (and any outage) cost nothing
//
// Same-origin only on purpose: no CORS headers - platform builds must never
// reach this (gallery overlay feature, not a game feature).

import { parseCookie } from '../_lib/cookie.js';
import { isValidSlug } from '../_lib/validate.js';
import { checkRate } from '../_lib/rateLimit.js';
import {
  SOCIAL_SLUGS, EMOTE_COUNT, EMOTE_RING_MAX, EMOTE_KEY_TTL_S, EMOTE_FRESH_MS,
  presenceKey, emoteKey, countPresence, hashUid,
} from '../_lib/social.js';

const JSON_HDRS = { 'content-type': 'application/json' };

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const slug = (url.searchParams.get('slug') || '').trim();
  if (!isValidSlug(slug)) {
    return new Response(JSON.stringify({ error: 'bad slug' }), { status: 400, headers: JSON_HDRS });
  }
  // Not in the pilot: 404 BEFORE any KV read, long-cacheable, so the
  // one-time client probe on every other game is effectively free.
  if (!SOCIAL_SLUGS.has(slug)) {
    return new Response(JSON.stringify({ error: 'not enabled' }), {
      status: 404,
      headers: { ...JSON_HDRS, 'cache-control': 'public, max-age=300' },
    });
  }

  const now = Date.now();
  let pMap = null, ring = null;
  try { pMap = await env.VOTES.get(presenceKey(slug), 'json'); } catch (e) { pMap = null; }
  try { ring = await env.VOTES.get(emoteKey(slug), 'json'); } catch (e) { ring = null; }

  const fresh = (Array.isArray(ring) ? ring : [])
    .filter(it => it && typeof it.t === 'number' && now - it.t <= EMOTE_FRESH_MS)
    .slice(-15);

  // max-age=8 is BROWSER caching (a tab-restore or double-mount reuses it);
  // CF Pages does not edge-cache Function responses from this header alone,
  // so each 10s poll costs the 2 KV reads above - budgeted in _lib/social.js.
  return new Response(JSON.stringify({ n: countPresence(pMap || {}, now), e: fresh }), {
    headers: { ...JSON_HDRS, 'cache-control': 'public, max-age=8' },
  });
}

export async function onRequestPost({ request, env }) {
  // Same-origin guard (Codex 2026-06-11): browsers always attach Origin to
  // cross-origin POSTs, so a mismatch = some other site trying to splash
  // emotes onto everyone's screen. Reject it. (Headerless script traffic
  // still passes - that path is covered by the rate limits below.)
  const origin = request.headers.get('Origin');
  if (origin) {
    let oHost = null;
    try { oHost = new URL(origin).host; } catch (e) { oHost = null; }
    if (oHost !== new URL(request.url).host) {
      return new Response('forbidden', { status: 403 });
    }
  }

  let body;
  try { body = await request.json(); }
  catch { return new Response('bad json', { status: 400 }); }

  const slug = String(body.slug || '');
  if (!isValidSlug(slug)) return new Response('bad slug', { status: 400 });
  if (!SOCIAL_SLUGS.has(slug)) return new Response('not enabled', { status: 404 });

  // Strict integer index into the fixed set - the ONLY content channel,
  // and it is 3 bits wide. Anything else is rejected.
  const emote = body.emote;
  if (!Number.isInteger(emote) || emote < 0 || emote >= EMOTE_COUNT) {
    return new Response('bad emote', { status: 400 });
  }

  // Honesty bar: gallery pages always carry the anon uid cookie
  // (identity.js); requests without one are not from our overlay.
  const uid = parseCookie(request.headers.get('Cookie') || '', 'uid');
  if (!uid) return new Response('no identity', { status: 403 });

  // Rate limit on BOTH axes: per uid (10/min - the polite-player budget)
  // and per IP (30/min - uid is client-settable, IP is the harder thing
  // to rotate, same reasoning as heartbeat's hbrate). The uid bucket key
  // uses the hash, never the raw cookie value.
  const uidH = await hashUid(uid);
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  if (!await checkRate(env, `emrate_u:${uidH}`, 10, 60)) {
    return new Response('rate limit', { status: 429 });
  }
  if (!await checkRate(env, `emrate_i:${ip}`, 30, 60)) {
    return new Response('rate limit', { status: 429 });
  }

  // Server-generated nonce - clients dedupe their own emote when it comes
  // back in a poll. Never client-supplied (no player-authored bytes).
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map(b => b.toString(16).padStart(2, '0')).join('');

  // Append to the ring. Read-modify-write: a race between two simultaneous
  // sends can drop one emote - harmless for ephemeral reactions, not worth
  // a Durable Object at this traffic.
  const key = emoteKey(slug);
  const now = Date.now();
  let ring = [];
  try { ring = (await env.VOTES.get(key, 'json')) || []; } catch (e) { ring = []; }
  if (!Array.isArray(ring)) ring = [];
  ring = ring.filter(it => it && typeof it.t === 'number' && now - it.t <= EMOTE_FRESH_MS * 4);
  ring.push({ i: emote, t: now, n: nonce });
  if (ring.length > EMOTE_RING_MAX) ring = ring.slice(-EMOTE_RING_MAX);
  await env.VOTES.put(key, JSON.stringify(ring), { expirationTtl: EMOTE_KEY_TTL_S });

  return new Response(JSON.stringify({ n: nonce }), { headers: JSON_HDRS });
}
