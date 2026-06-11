// Social presence + emotes - shared constants and helpers (pilot 2026-06-11).
//
// OPT-IN allowlist. The overlay is a per-game experiment, NOT a default:
// only slugs listed here get presence counting, emote storage, and the
// play.html overlay (the client probes GET /api/social and renders nothing
// on 404, so this Set is the single source of truth - no client copy).
// Seeded from /api/trending on pilot day (top 5 by engagement score).
// Widen after a clean week - see Knowledge/Backlog.md.
//
// Privacy + UGC guardrails (Knowledge/Learnings/Player Chat Options.md):
//   - no raw uids stored: presence map keys are sha256(uid) truncated to 12 hex
//   - no free text on the wire: an emote is an integer index 0..EMOTE_COUNT-1,
//     rendered from a fixed client-side table; nonces are SERVER-generated
//   - no persistent history: presence keys + emote rings carry short TTLs
//
// KV cost (VOTES namespace, free tier = 1k writes/day shared with heartbeat):
//   - presence: +1 read +1 write per heartbeat flush, allowlisted slugs only
//   - emote send: 3 reads + 3 writes (TWO checkRate buckets - uid + IP, each
//     read+write - plus the ring read-modify-write)
//   - poll GET: 2 reads per poll. cache-control max-age=8 is BROWSER cache
//     only (CF Pages does not edge-cache Function responses on the header
//     alone), and 10s polls outlive it - so budget every poll as 2 KV reads:
//     a 10-min session = ~120 reads against the 100k/day read budget. Fine.
//   - non-allowlisted GETs cost zero KV ops (404 before any read)

export const SOCIAL_SLUGS = new Set([
  'shipwreck_scrub',
  'mirror_drift',
  'parry_knight',
  'critical_mass',
  'asteroid_farm',
]);

// A uid counts as "playing now" if its last heartbeat flush is within this
// window. Flushes land every ~120s, so 300s tolerates one missed flush
// without flickering the count; cost is a player ghosting for up to 5 min
// after leaving (pagehide beacons refresh the entry one last time).
export const PRESENCE_WINDOW_MS = 5 * 60 * 1000;

// KV TTL on the per-slug presence map - abandoned games' keys evaporate.
export const PRESENCE_KEY_TTL_S = 900;

// Fixed vetted emote set SIZE. The glyphs live client-side (play.html);
// the server only ever validates and stores the index.
export const EMOTE_COUNT = 6;

export const EMOTE_RING_MAX = 30;       // ring buffer cap per slug
export const EMOTE_KEY_TTL_S = 900;     // ring key TTL - no persistent history
export const EMOTE_FRESH_MS = 45 * 1000; // GET returns only this window

export function presenceKey(slug) { return `social_p:${slug}`; }
export function emoteKey(slug)    { return `social_e:${slug}`; }

// sha256(uid) -> first 12 hex chars. Same shape as _lib/uid.js emailToUid
// but kept separate: this is an ANONYMIZER for transient presence entries,
// not a stable account id - never join the two.
export async function hashUid(uid) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(uid)));
  return Array.from(new Uint8Array(h)).slice(0, 6).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Prune entries older than PRESENCE_WINDOW_MS and count the rest.
export function countPresence(map, now) {
  let n = 0;
  for (const k of Object.keys(map || {})) {
    if (now - map[k] <= PRESENCE_WINDOW_MS) n++;
  }
  return n;
}

// Refresh this uid's liveness in the per-slug presence map.
// Read-modify-write; a lost update between two simultaneous flushes only
// delays one player's refresh by a flush period, which the 300s window
// absorbs - acceptable for an anonymous counter, so no locking.
export async function touchPresence(env, slug, uid) {
  const key = presenceKey(slug);
  const now = Date.now();
  let map = {};
  try { map = (await env.VOTES.get(key, 'json')) || {}; } catch (e) { map = {}; }
  const pruned = {};
  for (const k of Object.keys(map)) {
    if (now - map[k] <= PRESENCE_WINDOW_MS) pruned[k] = map[k];
  }
  pruned[await hashUid(uid)] = now;
  await env.VOTES.put(key, JSON.stringify(pruned), { expirationTtl: PRESENCE_KEY_TTL_S });
}
