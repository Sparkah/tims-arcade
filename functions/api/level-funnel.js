// POST /api/level-funnel
// Body: { slug, sid, evs: [{ group, level, name, t }] }
//
// First-party per-level telemetry for hosted/editor-driven games. GameAnalytics
// remains the platform analytics source; this small KV stream exists so the
// Game Factory admin can show level drop-off without scraping a vendor portal.
//
// Storage:
//   lfn:<slug>:<date>:<sid> -> {
//     "campaign:5": {
//       starts, completes, fails,
//       startFirst, completeFirst, failFirst
//     }
//   }
// Repeated attempts in the same level/session are stored as presence, not a
// counter, so a tester or retry loop cannot rewrite KV hundreds of times.
//
// Returns 200/204 silently for every malformed/rate-limited case so clients do
// not retry noisy telemetry and probers learn nothing useful.

import { isValidSlug } from '../_lib/validate.js';
import { checkRate } from '../_lib/rateLimit.js';

const SID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const GROUPS = new Set(['campaign', 'daily', 'endless']);
const EVENTS = new Set(['start', 'fail', 'complete']);
const MAX_BYTES = 8192;
const MAX_EVS = 64;
const MAX_LEVELS_PER_SID_DAY = 128;
const T_MAX = 86400000;
const KEY_TTL = 60 * 24 * 60 * 60;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
  'cache-control': 'no-store',
};

const silent = (status = 200) => new Response(null, { status, headers: CORS });

export function onRequestOptions() {
  return silent(204);
}

function cleanEvent(input) {
  if (!input || typeof input !== 'object') return null;
  const name = String(input.name || '').toLowerCase();
  const group = String(input.group || 'campaign').toLowerCase();
  if (!EVENTS.has(name) || !GROUPS.has(group)) return null;

  const level = Math.floor(Number(input.level));
  if (!Number.isFinite(level) || level < 1 || level > 9999) return null;

  const t = Number(input.t);
  if (!Number.isFinite(t) || t < 0 || t > T_MAX) return null;

  return { name, group, level, t: Math.round(t) };
}

function bump(rec, name, t) {
  const countKey = name === 'start' ? 'starts' : name === 'complete' ? 'completes' : 'fails';
  const firstKey = name === 'start' ? 'startFirst' : name === 'complete' ? 'completeFirst' : 'failFirst';
  if (typeof rec[firstKey] === 'number') return false;
  rec[countKey] = 1;
  rec[firstKey] = t;
  return true;
}

export async function onRequestPost({ request, env }) {
  try {
    const raw = await request.text();
    if (!raw || raw.length > MAX_BYTES) return silent();

    let body;
    try { body = JSON.parse(raw); } catch { return silent(); }
    if (!body || typeof body !== 'object') return silent();

    const slug = String(body.slug || '').toLowerCase();
    const sid = String(body.sid || '');
    if (!isValidSlug(slug) || !SID_RE.test(sid)) return silent();

    const evs = (Array.isArray(body.evs) ? body.evs.slice(0, MAX_EVS) : [])
      .map(cleanEvent)
      .filter(Boolean);
    if (!evs.length) return silent();

    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    const rateKey = `lfnrate:${ip}:${Math.floor(Date.now() / 3600000)}`;
    if (!await checkRate(env, rateKey, 600, 7200)) return silent();

    const date = new Date().toISOString().slice(0, 10);
    const key = `lfn:${slug}:${date}:${sid}`;
    let cur = null;
    try { cur = await env.VOTES.get(key, 'json'); } catch { cur = null; }
    if (!cur || typeof cur !== 'object' || Array.isArray(cur)) cur = {};

    let changed = false;
    for (const ev of evs) {
      const slot = `${ev.group}:${ev.level}`;
      let rec = cur[slot];
      if (!rec || typeof rec !== 'object' || Array.isArray(rec)) {
        if (Object.keys(cur).length >= MAX_LEVELS_PER_SID_DAY) continue;
        rec = { starts: 0, completes: 0, fails: 0 };
        cur[slot] = rec;
      }
      if (bump(rec, ev.name, ev.t)) changed = true;
    }

    if (changed) await env.VOTES.put(key, JSON.stringify(cur), { expirationTtl: KEY_TTL });
    return silent();
  } catch {
    return silent();
  }
}
