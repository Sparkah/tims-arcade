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
// Staleness contract: typical max ≈ SNAPSHOT_FRESH + edge TTL (~6 min) plus
// however long the site sat with zero traffic (stale data ages while nobody
// looks — acceptable: nobody saw it drift). app.js vote shields cover a voter
// reloading inside the window (VOTE_OVERRIDE_TTL_MS > this endpoint's worst
// typical staleness); spectators tolerate minutes-old like counts. Featured
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
const SNAPSHOT_FRESH_SECONDS = 300;
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
    if (ageSeconds >= SNAPSHOT_FRESH_SECONDS) {
      // Serve stale NOW, rebuild for the next request. waitUntil keeps the
      // walk alive after the response; if it's unavailable (old runtime,
      // tests) fall back to a fire-and-forget promise.
      const refresh = rebuildSnapshot(env).catch(() => { /* next visitor retries */ });
      try { context.waitUntil(refresh); } catch (e) { /* already fired */ }
    }
    return bootResponse(await withFeatured(env, snap));
  }

  // No snapshot yet (first request after this endpoint ships) — build inline.
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
