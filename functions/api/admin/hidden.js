// Admin: hide / unhide games from the public gallery grid.
// Admin-gated (mirrors functions/api/admin/publish-status.js + stats.js auth).
//
//   GET  /api/admin/hidden                 -> { hidden: [slug,...], count }
//   POST /api/admin/hidden  {slug, hide}    -> { hidden:[...], slug, hidden_now, count }
//        hide defaults to true; pass {hide:false} to unhide.
//
// Source of truth = per-slug rows in the GALLERY_DB D1 binding, so concurrent
// dashboards cannot overwrite one another's read-modify-write array. The
// public /api/hidden endpoint reads the same transactionally updated table.

import { requireAdmin } from '../../_lib/adminAuth.js';
import {
  mutateHiddenState,
  readHiddenState,
} from '../../_lib/publicCatalogue.js';
import { indexNowUrlsForCuration, notifyIndexNow } from '../../_lib/indexNow.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function mutationHostAllowed(request) {
  const host = new URL(request.url).hostname.toLowerCase();
  return (
    host === 'game-factory.tech'
    || host === 'www.game-factory.tech'
    || host === 'localhost'
    || host === '127.0.0.1'
  );
}

export async function onRequestGet({ request, env }) {
  const fail = await requireAdmin(request, env);
  if (fail) return fail;
  try {
    const { hidden } = await readHiddenState(env);
    return json({ hidden, count: hidden.length });
  } catch (_) {
    return json({ error: 'curation_store_unavailable' }, 503);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const fail = await requireAdmin(request, env);
  if (fail) return fail;
  // Pages previews share configured production bindings. Never let an
  // authenticated preview deployment mutate the production curation DB.
  if (!mutationHostAllowed(request)) {
    return json({ error: 'production_host_required' }, 403);
  }

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'bad_json' }, 400); }
  // Normalize to lowercase so 'Foo' and 'foo' hide the SAME game — slugs in
  // games.json are lowercase, and the public filter matches on g.slug.
  const slug = (body && typeof body.slug === 'string') ? body.slug.trim().toLowerCase() : '';
  if (!slug || !/^[a-z0-9_-]{1,64}$/.test(slug)) return json({ error: 'invalid_slug' }, 400);
  const hide = body.hide !== false; // default true

  const updatedAt = new Date().toISOString();
  let updated;
  try {
    updated = await mutateHiddenState(env, slug, hide, updatedAt);
  } catch (_) {
    return json({ error: 'curation_store_unavailable' }, 503);
  }
  if (typeof context.waitUntil === 'function') {
    context.waitUntil(notifyIndexNow(indexNowUrlsForCuration(slug)));
  }

  return json({
    hidden: updated.hidden,
    slug,
    hidden_now: hide,
    count: updated.hidden.length,
    updated_at: updated.updatedAt,
  });
}
