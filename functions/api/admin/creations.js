// Player-creation moderation (admin-session gated). Tim 2026-06-15.
//   GET  /api/admin/creations               -> all vibe creations (with email + flags)
//   POST /api/admin/creations {id, action}:  delete | unpublish
// UI: /chat-mod (shared moderation page).
//
// The GET walks upload:* (a KV LIST). It returns submitter emails, so the
// response is no-store; keep it manual/button-triggered rather than polling.

import { json, jsonError } from '../../_lib/response.js';
import { edgeCached } from '../../_lib/edgecache.js';
import { requireAdmin } from '../../_lib/adminAuth.js';

const ID_RE = /^[0-9a-z]{8,40}$/;
const TTL = 60 * 60 * 24 * 30;

export async function onRequestGet({ request, env }) {
  const guard = await requireAdmin(request, env); if (guard) return guard;
  return edgeCached('/api-admin-creations', {}, () => buildCreations(env));
}

async function buildCreations(env) {
  const out = [];
  let cursor;
  do {
    const list = await env.VOTES.list({ prefix: 'upload:', cursor });
    for (const k of list.keys) {
      const raw = await env.VOTES.get(k.name);
      if (!raw) continue;
      let r; try { r = JSON.parse(raw); } catch { continue; }
      if (r.source !== 'vibe') continue;
      out.push({ id: r.id, slug: r.slug, title: r.title, author: r.author, email: r.email, published: !!r.published, quality: r.quality || 'unverified', ts: r.ts || 0 });
    }
    cursor = list.list_complete ? null : list.cursor;
  } while (cursor);
  out.sort((x, y) => (y.ts || 0) - (x.ts || 0));
  const r = json({ ok: true, creations: out });
  r.headers.set('cache-control', 'no-store');  // PII; synthetic edgeCached() entry still handles KV-list budget.
  return r;
}

export async function onRequestPost({ request, env }) {
  const guard = await requireAdmin(request, env); if (guard) return guard;
  let body;
  try { body = await request.json(); } catch { return jsonError('bad_json', 400); }
  const id = String(body.id || '').toLowerCase();
  const action = String(body.action || '');
  if (!ID_RE.test(id)) return jsonError('bad_id', 400);

  if (action === 'delete') {
    await env.VOTES.delete(`upload:${id}`);
    await env.VOTES.delete(`genblob:${id}`);
    await env.VOTES.delete(`creationcover:${id}`);
    return ns(json({ ok: true, deleted: true }));
  }
  if (action === 'unpublish') {
    const raw = await env.VOTES.get(`upload:${id}`);
    if (!raw) return jsonError('not_found', 404);
    let r; try { r = JSON.parse(raw); } catch { return jsonError('not_found', 404); }
    r.published = false;
    await env.VOTES.put(`upload:${id}`, JSON.stringify(r), { expirationTtl: TTL });
    return ns(json({ ok: true, unpublished: true }));
  }
  return jsonError('bad_action', 400);
}
function ns(r) { r.headers.set('cache-control', 'no-store'); return r; }
