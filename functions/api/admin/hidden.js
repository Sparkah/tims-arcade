// Admin: hide / unhide games from the public gallery grid.
// Token-gated (mirrors functions/api/admin/publish-status.js + stats.js auth).
//
//   GET  /api/admin/hidden?token=...                 -> { hidden: [slug,...], count }
//   POST /api/admin/hidden?token=...  {slug, hide}    -> { hidden:[...], slug, hidden_now, count }
//        hide defaults to true; pass {hide:false} to unhide.
//
// Source of truth = KV key `hidden:set` in the VOTES namespace (same store the
// votes/featured endpoints use), so a toggle is INSTANT (no redeploy). The
// public /api/hidden endpoint reads the same key for the homepage grid filter.

const KEY = 'hidden:set';

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

async function readSet(env) {
  let s = [];
  try { s = (await env.VOTES.get(KEY, 'json')) || []; } catch (e) { s = []; }
  return Array.isArray(s) ? s : [];
}

export async function onRequestGet({ request, env }) {
  const fail = authFail(request, env);
  if (fail) return fail;
  const hidden = await readSet(env);
  return json({ hidden, count: hidden.length });
}

export async function onRequestPost({ request, env }) {
  const fail = authFail(request, env);
  if (fail) return fail;

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'bad_json' }, 400); }
  // Normalize to lowercase so 'Foo' and 'foo' hide the SAME game — slugs in
  // games.json are lowercase, and the public filter matches on g.slug.
  const slug = (body && typeof body.slug === 'string') ? body.slug.trim().toLowerCase() : '';
  if (!slug || !/^[a-z0-9_-]{1,64}$/.test(slug)) return json({ error: 'invalid_slug' }, 400);
  const hide = body.hide !== false; // default true

  const set = new Set(await readSet(env));
  if (hide) set.add(slug); else set.delete(slug);
  const arr = [...set].sort();
  await env.VOTES.put(KEY, JSON.stringify(arr));

  return json({ hidden: arr, slug, hidden_now: hide, count: arr.length });
}
