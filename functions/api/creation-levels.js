// GET /api/creation-levels?id=<creationId>
// Public/read-only level data for player-generated games. Published creations
// can expose their level data to players; private creations require the owner
// session, matching /g/<id> access control.

import { json, jsonError } from '../_lib/response.js';
import { canReadPrivateCreation } from '../_lib/creationAccess.js';
import { readCreationLevels } from '../_lib/creationLevels.js';

const ID_RE = /^[0-9a-z]{8,40}$/;

function fail(msg, status) {
  const response = jsonError(msg, status);
  response.headers.set('cache-control', 'no-store');
  return response;
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const id = String(url.searchParams.get('id') || '').toLowerCase();
  if (!ID_RE.test(id)) return fail('bad_id', 400);

  const rec = await env.VOTES.get(`upload:${id}`, 'json');
  if (!rec || rec.source !== 'vibe') return fail('not_found', 404);
  if (!rec.published && !await canReadPrivateCreation(request, env, rec.uid)) return fail('not_found', 404);

  const data = await readCreationLevels(env, id);
  const r = json({
    ok: true,
    id,
    slug: rec.slug || '',
    schema: data.schema,
    levels: data.levels,
    updatedTs: data.updatedTs,
    source: data.source,
  });
  // Access can change at any time (publish/unpublish, logout, account switch).
  // Never let an allowed response survive that authorization transition.
  r.headers.set('cache-control', 'no-store');
  return r;
}
