// GET /api/admin/funnel[?slug=<s>][&from=YYYY-MM-DD][&to=YYYY-MM-DD]
//
// First-60-seconds funnel read side (WS-J). Admin-gated exactly like cohorts.js.
// Reads the fnl:<slug>:<date>:<sid> keys written by
// /api/funnel and computes, at READ time (cohort.js architecture):
//   per slug:
//     steps - the 5 standard events in funnel order
//             boot -> first_input -> alive_60 -> alive_120 -> alive_300
//             each with count (unique sid-days), pctOfBoot, pctOfPrev, medianT
//     marks - any custom game marks (tutorial_done / first_death /
//             first_upgrade convention) sorted by median t ascending,
//             each with count, pctOfBoot, medianT
// "count" = unique sids per day, summed over the range (sid-days - the same
// daily-unique convention a DAU sum uses). medianT = median ms-since-boot
// across those sids.
//
// Defaults: last 7 days including today. Range is capped to 31 days. READ-ONLY,
// no KV writes. Like cohorts.js the KV list is bounded (25 pages x 1000 keys);
// `truncated` flips true if the bound is hit.

import { jsonError } from '../../_lib/response.js';
import { isValidSlug } from '../../_lib/validate.js';
import { edgeCached } from '../../_lib/edgecache.js';
import { requireAdmin } from '../../_lib/adminAuth.js';

const STANDARD = ['boot', 'first_input', 'alive_60', 'alive_120', 'alive_300'];
const DAY = 86400000;

function dateUtc(ts) { return new Date(ts).toISOString().slice(0, 10); }
function median(arr) {
  if (!arr.length) return null;
  const s = arr.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return Math.round(s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2);
}
function pct(part, whole) {
  return whole > 0 ? +(part / whole * 100).toFixed(1) : null;
}

export async function onRequestGet(ctx) {
  // Admin read side may 500 (unlike the always-200 collector) but must do so
  // gracefully as JSON, never as an unhandled worker exception.
  try { return await handleGet(ctx); }
  catch (e) { return jsonError('internal_error', 500); }
}

async function handleGet({ request, env }) {
  const url = new URL(request.url);
  const guard = await requireAdmin(request, env);
  if (guard) return guard;

  const slugParam = (url.searchParams.get('slug') || '').trim();
  if (slugParam && !isValidSlug(slugParam)) return jsonError('bad slug', 400);

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const today = dateUtc(Date.now());
  let to = url.searchParams.get('to') || today;
  let from = url.searchParams.get('from') || dateUtc(Date.now() - 6 * DAY);
  if (!DATE_RE.test(to)) to = today;
  if (!DATE_RE.test(from)) from = dateUtc(Date.now() - 6 * DAY);
  if (from > to) { const tmp = from; from = to; to = tmp; }
  // cap the window at 31 days
  if (Date.parse(to) - Date.parse(from) > 31 * DAY) {
    from = dateUtc(Date.parse(to) - 31 * DAY);
  }

  // Edge-cache the fnl:* scan (auth verified above; key by slug+range). 5min.
  // The factory iteration loop hits this per game; the free tier caps KV LIST
  // at 1000/day. See Knowledge/Learnings/KV List Budget.
  return edgeCached(`/api-admin-funnel?s=${slugParam || ''}&f=${from}&t=${to}`, {},
    () => buildFunnel(env, slugParam, from, to));
}

async function buildFunnel(env, slugParam, from, to) {
  // Collect fnl:<slug>:<date>:<sid> keys (key NAME carries slug+date, so the
  // range filter needs no value read; values are read only for in-range keys).
  const prefix = slugParam ? `fnl:${slugParam}:` : 'fnl:';
  const hits = []; // { slug, date, key }
  let cursor = undefined, complete = false, pages = 0;
  while (!complete && pages < 25) {
    const res = await env.VOTES.list({ prefix, cursor, limit: 1000 });
    for (const k of res.keys) {
      // fnl:<slug>:<YYYY-MM-DD>:<sid>
      const m = k.name.match(/^fnl:([a-z0-9_-]{1,40}):(\d{4}-\d{2}-\d{2}):(.+)$/i);
      if (!m) continue;
      if (m[2] < from || m[2] > to) continue;
      hits.push({ slug: m[1].toLowerCase(), date: m[2], key: k.name });
    }
    complete = res.list_complete;
    cursor = res.cursor;
    pages++;
  }

  // Subrequest budget (Workers free plan ~50/request): the list pages above
  // already spent `pages`, and each value read below is one more subrequest.
  // Cap reads so list+gets can never breach the cap and hard-500 the endpoint
  // as data accumulates. Slicing keeps lexicographic key order (slug, then
  // date) - a capped read therefore biases toward earlier dates/slugs; the
  // `truncated` flag tells the panel the picture is partial (narrow by slug
  // or date range to see the rest).
  const GET_BUDGET = Math.max(0, 45 - pages);
  const overBudget = hits.length > GET_BUDGET;
  const readHits = overBudget ? hits.slice(0, GET_BUDGET) : hits;

  // slug -> event -> [t, t, ...] (one entry per sid-day)
  const bySlug = new Map();
  for (const h of readHits) {
    let v = null;
    try { v = await env.VOTES.get(h.key, 'json'); } catch { v = null; }
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
    let evMap = bySlug.get(h.slug);
    if (!evMap) { evMap = new Map(); bySlug.set(h.slug, evMap); }
    for (const [name, t] of Object.entries(v)) {
      if (typeof t !== 'number' || !Number.isFinite(t)) continue;
      if (!evMap.has(name)) evMap.set(name, []);
      evMap.get(name).push(t);
    }
  }

  const slugs = {};
  for (const [slug, evMap] of [...bySlug.entries()].sort()) {
    const count = (n) => (evMap.has(n) ? evMap.get(n).length : 0);
    const boot = count('boot');
    let prev = null;
    const steps = STANDARD.map((name) => {
      const c = count(name);
      const row = {
        name,
        count: c,
        pctOfBoot: name === 'boot' ? (boot > 0 ? 100 : null) : pct(c, boot),
        pctOfPrev: prev === null ? null : pct(c, prev),
        medianT: median(evMap.get(name) || []),
      };
      prev = c;
      return row;
    });
    const marks = [...evMap.keys()]
      .filter((n) => !STANDARD.includes(n))
      .map((n) => ({
        name: n,
        count: count(n),
        pctOfBoot: pct(count(n), boot),
        medianT: median(evMap.get(n) || []),
      }))
      .sort((a, b) => (a.medianT ?? Infinity) - (b.medianT ?? Infinity));
    slugs[slug] = { steps, marks, sidDays: boot };
  }

  return new Response(JSON.stringify({
    from, to, slugs,
    totalSidDays: hits.length,
    readSidDays: readHits.length,
    truncated: !complete || overBudget, // key-list bound hit OR read budget capped
    caveat: 'Gallery-only funnel (platform builds never beacon). Directional at low traffic; counts are unique sids per day summed over the range.',
    generatedAt: new Date().toISOString(),
  }), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=0, s-maxage=300' } });
}
