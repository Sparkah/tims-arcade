// GET /api/boot → everything the homepage's FIRST paint needs to be correct,
// in one round trip:
//
//   { ts, counts: { slug: {likes,dislikes,plays,seconds,comments} },
//     trending: { date, games: { slug: {seconds,comments,score} } },
//     featured: slug|null }
//
// WHY: app.js used to fire counts + trending + featured as separate fetches
// and paint before they landed — cards showed zeros, the hero showed a
// fallback pick, then everything re-sorted when data arrived (Tim 2026-06-12:
// "switch looks so bad"). On a low-traffic site the per-endpoint 60s edge
// caches are usually cold for a real visitor, so the wait was the full KV
// walk. This endpoint serves a KV snapshot (`snapshot:boot`, ONE read)
// immediately — whatever its age — and refreshes it in the background
// (context.waitUntil) once it's older than SNAPSHOT_FRESH_SECONDS. The first
// visitor after a quiet night gets last-known numbers instantly with no
// switcheroo; the rebuild lands for the next request.
//
// Staleness contract: served data is never older than STALE_SERVE_MAX +
// edge TTL = 960 + 60 = 1020s — exactly app.js's VOTE_OVERRIDE_TTL_MS, so a
// voter reloading inside the staleness window is always covered by the vote
// shields. A snapshot that idle-aged beyond the window (quiet night, zero
// traffic) is rebuilt INLINE — that one visitor pays the walk (~1s, still
// inside the client's 1.5s boot race) and gets exact numbers, never a
// pre-vote repaint. Spectators tolerate minutes-old like counts. Featured
// is date-scoped: a snapshot written on a previous UTC day serves
// featured:null and the client falls back to fetching /api/featured async.
// This endpoint only READS `featured:<date>` — the pick + its 2× reward
// semantics stay owned by featured.js/heartbeat.js.
//
// KV cost: steady state is 2 reads per edge-miss (snapshot + featured key);
// the ~290-read walk runs at most once per SNAPSHOT_FRESH window of active
// traffic, in waitUntil. Snapshot writes ≤ 1 per window — negligible against
// the 1000 writes/day budget.

import { edgeCached } from '../_lib/edgecache.js';
import { buildCountsData } from './counts.js';
import { buildTrendingData } from './trending.js';

const EDGE_TTL_SECONDS = 60;
// Raised 300->900 / 360->960 on 2026-06-16: the background rebuild runs the
// full counts+trending KV walk (~5 list ops) once per FRESH window per busy
// data-center; at 300s that alone was ~1440 list ops/day, over the free
// 1000/day LIST cap. 900s drops it to ~480/day. counts.js + trending.js now
// read this same snapshot (0 list ops) instead of walking per request.
const SNAPSHOT_FRESH_SECONDS = 900;
// Serve-stale ceiling: STALE_SERVE_MAX + EDGE_TTL must equal app.js's
// VOTE_OVERRIDE_TTL_MS (1020s) — change them together.
const STALE_SERVE_MAX_SECONDS = 960;
const SNAPSHOT_KEY = 'snapshot:boot';

export function onRequestGet(context) {
  return edgeCached('/api-boot', {}, () => buildBoot(context));
}

async function buildBoot(context) {
  const env = context.env;
  let snap = null;
  try { snap = await env.VOTES.get(SNAPSHOT_KEY, 'json'); } catch (e) { snap = null; }

  if (snap && snap.ts) {
    const ageSeconds = (Date.now() - snap.ts) / 1000;
    if (ageSeconds < SNAPSHOT_FRESH_SECONDS) {
      return bootResponse(await withFeatured(env, snap));
    }
    if (ageSeconds < STALE_SERVE_MAX_SECONDS) {
      // Inside the client's vote-shield window: serve stale NOW, rebuild for
      // the next request. waitUntil keeps the walk alive after the response;
      // if it's unavailable (old runtime, tests) the promise still runs.
      const refresh = rebuildSnapshot(env).catch(() => { /* next visitor retries */ });
      try { context.waitUntil(refresh); } catch (e) { /* already fired */ }
      return bootResponse(await withFeatured(env, snap));
    }
    // Idle-aged past the shield window — fall through to an inline rebuild
    // so a voter returning after a quiet gap never sees pre-vote numbers.
  }

  // No snapshot yet, or snapshot too old to serve — build inline.
  const fresh = await rebuildSnapshot(env);
  return bootResponse(await withFeatured(env, fresh));
}

async function rebuildSnapshot(env) {
  const [counts, trending] = await Promise.all([
    buildCountsData(env),
    buildTrendingData(env),
  ]);
  const snap = { ts: Date.now(), counts, trending };
  try {
    await env.VOTES.put(SNAPSHOT_KEY, JSON.stringify(snap));
  } catch (e) { /* budget/transient — serving still works, next visitor retries */ }
  return snap;
}

// Featured is read fresh per edge-miss (1 KV read) rather than baked into the
// snapshot: the pick is date-scoped and owned by featured.js, and baking it
// would leak yesterday's 2×-badge slug past midnight.
async function withFeatured(env, snap) {
  const today = new Date().toISOString().slice(0, 10);
  let featured = null;
  try { featured = (await env.VOTES.get(`featured:${today}`)) || null; } catch (e) { /* badge is optional */ }
  return { ts: snap.ts, counts: snap.counts || {}, trending: snap.trending || { date: today, games: {} }, featured };
}

function bootResponse(payload) {
  return new Response(JSON.stringify(payload), {
    headers: {
      'content-type': 'application/json',
      'cache-control': `public, max-age=15, s-maxage=${EDGE_TTL_SECONDS}`,
    },
  });
}
