// Admin: write / read / delete per-game remote-config payloads.
// Token-gated (mirrors functions/api/admin/hidden.js auth).
//
//   GET  /api/admin/config?token=...             -> { slugs: [...], count }
//   GET  /api/admin/config?token=...&slug=<s>    -> { slug, config|null }
//   POST /api/admin/config?token=... {slug, config}       -> validate + store
//   POST /api/admin/config?token=... {slug, config: null} -> delete
//
// Storage: KV key `config:<slug>` in the VOTES namespace; served publicly by
// GET /api/config?slug=<s> (CORS *) to gf-lib's GF.remoteConfig.
//
// VALIDATION (server side; gf-lib re-validates client side against each
// game's baked defaults allowlist + clamps, so this is the OUTER fence):
//   - pure DATA only: finite numbers / strings (<= 2000 chars) / booleans /
//     arrays (<= 64 items) / plain objects (<= 64 keys), nesting <= 6.
//     null / anything else is dropped. Config carries tuning numbers, event
//     flags, daily seeds, motd copy - NEVER code, NEVER new content types
//     moderation has not reviewed.
//   - __proto__ / constructor / prototype keys dropped (prototype pollution).
//   - whole cleaned payload <= 8 KB, else 400 too_large.
//   - version: auto-bumped to (stored.version + 1) unless a finite number is
//     passed explicitly (the client exposes it as cfg.version for debugging).
//
// KV write budget: admin writes are manual and rare - negligible against the
// free-tier 1000 writes/day.

import { edgeCached } from '../../_lib/edgecache.js';

const MAX_BYTES = 8192;

function badKey(k) { return k === '__proto__' || k === 'constructor' || k === 'prototype'; }

function cleanData(v, depth) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.slice(0, 2000);
  if (Array.isArray(v)) {
    if (depth >= 6) return undefined;
    const out = [];
    for (const item of v.slice(0, 64)) {
      const c = cleanData(item, depth + 1);
      if (c !== undefined) out.push(c);
    }
    return out;
  }
  if (v && typeof v === 'object') {
    if (depth >= 6) return undefined;
    const out = {};
    let n = 0;
    for (const k of Object.keys(v)) {
      if (badKey(k)) continue;
      if (++n > 64) break;
      const c = cleanData(v[k], depth + 1);
      if (c !== undefined) out[k] = c;
    }
    return out;
  }
  return undefined; // null / undefined / function / symbol - dropped
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function authFail(request, env) {
  const url = new URL(request.url);
  const token =
    url.searchParams.get('token') || request.headers.get('x-admin-token') || '';
  if (!env.ADMIN_TOKEN) {
    return json({ error: 'admin_token_not_configured: set ADMIN_TOKEN in the Pages dashboard' }, 500);
  }
  if (token !== env.ADMIN_TOKEN) return json({ error: 'forbidden' }, 403);
  return null; // authorized
}

function parseSlug(raw) {
  const slug = (typeof raw === 'string') ? raw.trim().toLowerCase() : '';
  return /^[a-z0-9_-]{1,64}$/.test(slug) ? slug : null;
}

async function buildConfigSlugs(env) {
  const slugs = [];
  let cursor;
  do {
    const page = await env.VOTES.list({ prefix: 'config:', cursor });
    for (const k of page.keys) slugs.push(k.name.slice('config:'.length));
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  const r = json({ slugs: slugs.sort(), count: slugs.length });
  r.headers.set('cache-control', 'public, max-age=0, s-maxage=300');  // json() sets no-store; override so the edge can cache
  return r;
}

export async function onRequestGet({ request, env }) {
  const fail = authFail(request, env);
  if (fail) return fail;
  const url = new URL(request.url);
  const rawSlug = url.searchParams.get('slug');
  if (!rawSlug) {
    // Edge-cache the config:* slug listing (auth verified above). 5min. Free
    // tier caps KV LIST at 1000/day. See Knowledge/Learnings/KV List Budget.
    return edgeCached('/api-admin-config-slugs', {}, () => buildConfigSlugs(env));
  }
  const slug = parseSlug(rawSlug);
  if (!slug) return json({ error: 'invalid_slug' }, 400);
  let config = null;
  try { config = await env.VOTES.get('config:' + slug, 'json'); } catch (e) { config = null; }
  return json({ slug, config });
}

export async function onRequestPost({ request, env }) {
  const fail = authFail(request, env);
  if (fail) return fail;

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'bad_json' }, 400); }
  const slug = parseSlug(body && body.slug);
  if (!slug) return json({ error: 'invalid_slug' }, 400);

  if (body.config === null) {
    await env.VOTES.delete('config:' + slug);
    return json({ slug, deleted: true });
  }

  const clean = cleanData(body.config, 0);
  if (!clean || typeof clean !== 'object' || Array.isArray(clean)) {
    return json({ error: 'invalid_config: must be a plain JSON object of numbers/strings/booleans/arrays' }, 400);
  }

  if (!Number.isFinite(clean.version)) {
    let prev = null;
    try { prev = await env.VOTES.get('config:' + slug, 'json'); } catch (e) { prev = null; }
    const prevV = (prev && Number.isFinite(prev.version)) ? Math.floor(prev.version) : 0;
    clean.version = prevV + 1;
  } else {
    clean.version = Math.min(Math.max(Math.floor(clean.version), 0), 2147483647);
  }

  const txt = JSON.stringify(clean);
  if (txt.length > MAX_BYTES) return json({ error: 'too_large: config must stay under 8 KB' }, 400);

  await env.VOTES.put('config:' + slug, txt);
  return json({ slug, config: clean, bytes: txt.length });
}
