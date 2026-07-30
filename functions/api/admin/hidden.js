// Admin: hide / unhide games from the public gallery grid.
// Admin-gated (mirrors functions/api/admin/publish-status.js + stats.js auth).
//
//   GET  /api/admin/hidden                 -> { hidden: [slug,...], count }
//   POST /api/admin/hidden  {slug, hide}    -> { hidden:[...], slug, hidden_now, count }
//        hide defaults to true; pass {hide:false} to unhide.
//
// Source of truth = KV key `hidden:set` in the VOTES namespace (same store the
// votes/featured endpoints use), so a toggle is INSTANT (no redeploy). The
// public /api/hidden endpoint reads the same key for the homepage grid filter.

const KEY = 'hidden:set';
const LEGACY_WRITE_KEY = 'curation:legacy-write-enabled';

import { requireAdmin } from '../../_lib/adminAuth.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

async function readSet(env) {
  const value = await env.VOTES.get(KEY, 'json');
  if (
    !Array.isArray(value)
    || value.some(slug => typeof slug !== 'string' || !/^[a-z0-9_-]{1,64}$/.test(slug))
  ) {
    throw new Error('legacy curation set is unavailable');
  }
  const normalized = [...new Set(value)].sort();
  if (JSON.stringify(value) !== JSON.stringify(normalized)) {
    throw new Error('legacy curation set is malformed');
  }
  return normalized;
}

async function legacyWritesEnabled(env) {
  try {
    return (await env.VOTES.get(LEGACY_WRITE_KEY)) !== '0';
  } catch (_) {
    return false;
  }
}

export async function onRequestGet({ request, env }) {
  const fail = await requireAdmin(request, env);
  if (fail) return fail;
  try {
    const hidden = await readSet(env);
    return json({ hidden, count: hidden.length });
  } catch (_) {
    return json({ error: 'curation_store_unavailable' }, 503);
  }
}

export async function onRequestPost({ request, env }) {
  const fail = await requireAdmin(request, env);
  if (fail) return fail;

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'bad_json' }, 400); }
  // Normalize to lowercase so 'Foo' and 'foo' hide the SAME game — slugs in
  // games.json are lowercase, and the public filter matches on g.slug.
  const slug = (body && typeof body.slug === 'string') ? body.slug.trim().toLowerCase() : '';
  if (!slug || !/^[a-z0-9_-]{1,64}$/.test(slug)) return json({ error: 'invalid_slug' }, 400);
  const hide = body.hide !== false; // default true

  // Parse the complete request before observing the lock, then check it again
  // immediately before the write. --prepare waits through KV propagation, so
  // a slow-body or delayed read cannot escape into the D1 authority window.
  if (!(await legacyWritesEnabled(env))) {
    return json({ error: 'curation_cutover_in_progress' }, 503);
  }
  let set;
  try {
    set = new Set(await readSet(env));
  } catch (_) {
    return json({ error: 'curation_store_unavailable' }, 503);
  }
  if (hide) set.add(slug); else set.delete(slug);
  const arr = [...set].sort();
  if (!(await legacyWritesEnabled(env))) {
    return json({ error: 'curation_cutover_in_progress' }, 503);
  }
  try {
    await env.VOTES.put(KEY, JSON.stringify(arr));
  } catch (_) {
    return json({ error: 'curation_store_unavailable' }, 503);
  }

  return json({ hidden: arr, slug, hidden_now: hide, count: arr.length });
}
