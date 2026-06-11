// POST /api/funnel
// Body: { slug, sid, evs: [{ n, t }] }
//   slug = /games/<slug>/ the event came from (same slug the heartbeat uses)
//   sid  = the anonymous `uid` cookie value (identity.js / heartbeat identity;
//          gf-lib's GF.funnel reads or mints that SAME cookie - one identity)
//   evs  = batched funnel events; n = event name, t = ms since lib boot
// Returns: 200 empty ALWAYS (success, garbage, rate-limited, or thrown -
// never a 4xx/5xx so a confused client can't enter a retry loop and a prober
// learns nothing).
//
// First-60-seconds funnel collector (WS-J, Commercial Push 2026-06-11).
// Client side is GF.funnel in the gf-lib template: GALLERY-ONLY transport
// (hard host gate + relative URL), auto events boot / first_input /
// alive_60 / alive_120 / alive_300 plus per-game marks (tutorial_done /
// first_death / first_upgrade convention).
//
// Storage (mirrors the cohort.js architecture: store small per-visitor facts
// at write time, COMPUTE at read time):
//   fnl:<slug>:<date>:<sid> -> { "<event>": <first t ms>, ... }   TTL 60d
// One key per (slug, UTC day, sid). Dedup of unique sids per (date, slug,
// event) is EXACT by construction - an event merges into the sid's own key
// only once (first t wins). Lock-free read-modify-write on that key is the
// same approximation the heartbeat counters accept: a same-sid concurrent
// double-flush could drop one merge, which at this traffic is noise.
// Cost per eventful flush: 2 KV reads + 2 writes (rate bucket + sid key);
// a typical full session flushes ~5-7 times (events are ~1/min) so ~10-14
// writes/session against the shared 1k/day free budget - watch it alongside
// the heartbeat budget if gallery traffic grows.
//
// Anti-abuse: same-origin guard on the Origin header (social.js idiom),
// 240 posts / IP / hour (a single real session produces well under 30),
// payload < 4 KB, names whitelisted by regex, t clamped to one day.

import { isValidSlug } from '../_lib/validate.js';
import { checkRate } from '../_lib/rateLimit.js';

const EV_RE = /^[a-z0-9_]{1,24}$/;
const SID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const MAX_BYTES = 4096;
const MAX_EVS = 24;                       // 5 auto + 16 marks + margin
const MAX_EVENTS_PER_SID = 24;            // stored-object cap per (slug,day,sid)
const T_MAX = 86400000;                   // 1 day in ms
const KEY_TTL = 60 * 24 * 60 * 60;        // 60d, same as heartbeat daily keys

const silent = () => new Response(null, { status: 200 });

export async function onRequestPost({ request, env }) {
  try {
    // Same-origin guard: browsers always attach Origin to cross-origin POSTs,
    // so a mismatch is some other site splashing events at us. Headerless
    // script traffic still passes - the rate limit below covers that.
    const origin = request.headers.get('Origin');
    if (origin) {
      let oHost = null;
      try { oHost = new URL(origin).host; } catch { oHost = null; }
      if (oHost !== new URL(request.url).host) return silent();
    }

    const raw = await request.text();
    if (!raw || raw.length > MAX_BYTES) return silent();
    let body;
    try { body = JSON.parse(raw); } catch { return silent(); }
    if (!body || typeof body !== 'object') return silent();

    const slug = String(body.slug || '');
    const sid = String(body.sid || '');
    if (!isValidSlug(slug) || !SID_RE.test(sid)) return silent();

    const evsIn = Array.isArray(body.evs) ? body.evs.slice(0, MAX_EVS) : [];
    const seenNames = new Set();
    const evs = [];
    for (const e of evsIn) {
      if (!e || typeof e !== 'object' || typeof e.n !== 'string') continue;
      if (!EV_RE.test(e.n) || seenNames.has(e.n)) continue;
      const t = Number(e.t);
      if (!Number.isFinite(t) || t < 0 || t > T_MAX) continue;
      seenNames.add(e.n);
      evs.push({ n: e.n, t: Math.round(t) });
    }
    if (!evs.length) return silent();

    // rate limit by IP (heartbeat idiom: hourly bucket)
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    const rateKey = `fnlrate:${ip}:${Math.floor(Date.now() / 3600000)}`;
    if (!await checkRate(env, rateKey, 240, 7200)) return silent();

    const date = new Date().toISOString().slice(0, 10);
    const key = `fnl:${slug}:${date}:${sid}`;
    let cur = null;
    try { cur = await env.VOTES.get(key, 'json'); } catch { cur = null; }
    if (!cur || typeof cur !== 'object' || Array.isArray(cur)) cur = {};

    let changed = false;
    for (const e of evs) {
      if (Object.prototype.hasOwnProperty.call(cur, e.n)) continue; // first t wins
      if (Object.keys(cur).length >= MAX_EVENTS_PER_SID) break;
      cur[e.n] = e.t;
      changed = true;
    }
    if (changed) await env.VOTES.put(key, JSON.stringify(cur), { expirationTtl: KEY_TTL });

    return silent();
  } catch {
    return silent(); // never 500: garbage in, nothing out
  }
}
