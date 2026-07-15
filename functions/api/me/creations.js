// POST /api/me/creations  { id, action: 'publish' | 'unpublish' | 'delete' }
// The signed-in creator manages their OWN vibe creation: list it in the public
// gallery, return it to unlisted direct-link access, or delete it entirely.
// Ownership is enforced by uid. Same-origin + session only. Tim 2026-06-15.

import { readSession } from '../_session.js';
import { json, jsonError, sameOriginOk } from '../../_lib/response.js';

const ID_RE = /^[0-9a-z]{8,40}$/;
const TTL = 60 * 60 * 24 * 30;   // matches the genblob/cover lifetime

export async function onRequestPost({ request, env }) {
  if (!sameOriginOk(request)) return jsonError('forbidden', 403);
  const session = await readSession(request, env);
  if (!session || !session.uid) return jsonError('sign_in_required', 401);

  let body;
  try { body = await request.json(); } catch { return jsonError('bad_json', 400); }
  const id = String(body.id || '').toLowerCase();
  const action = String(body.action || '');
  if (!ID_RE.test(id)) return jsonError('bad_id', 400);

  const raw = await env.VOTES.get(`upload:${id}`);
  if (!raw) return jsonError('not_found', 404);
  let rec; try { rec = JSON.parse(raw); } catch { return jsonError('not_found', 404); }
  if (rec.uid !== session.uid) return jsonError('forbidden', 403);   // must own it

  if (action === 'publish' || action === 'unpublish') {
    if (rec.disabled === true || rec.visibility === 'disabled') return jsonError('creation_disabled', 409);
    if (action === 'publish' && (rec.source !== 'vibe' || rec.status !== 'live')) return jsonError('not_publishable', 400);
    rec.published = action === 'publish';
    rec.visibility = rec.published ? 'listed' : 'unlisted';
    await env.VOTES.put(`upload:${id}`, JSON.stringify(rec), { expirationTtl: TTL });
    return nostore(json({ ok: true, published: rec.published, visibility: rec.visibility }));
  }
  if (action === 'delete') {
    await env.VOTES.delete(`upload:${id}`);
    await env.VOTES.delete(`genblob:${id}`);
    await env.VOTES.delete(`creationcover:${id}`);
    return nostore(json({ ok: true, deleted: true }));
  }
  return jsonError('bad_action', 400);
}

function nostore(r) { r.headers.set('cache-control', 'no-store'); return r; }
