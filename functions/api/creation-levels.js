// GET /api/creation-levels?id=<creationId>
// Public/read-only level data for player-generated games. Published creations
// can expose their level data to players; private creations require the owner
// session, matching /g/<id> access control.

import { readSession } from './_session.js';
import { json, jsonError } from '../_lib/response.js';
import { readCreationLevels } from '../_lib/creationLevels.js';

const ID_RE = /^[0-9a-z]{8,40}$/;

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const id = String(url.searchParams.get('id') || '').toLowerCase();
  if (!ID_RE.test(id)) return jsonError('bad_id', 400);

  const rec = await env.VOTES.get(`upload:${id}`, 'json');
  if (!rec || rec.source !== 'vibe') return jsonError('not_found', 404);
  if (!rec.published) {
    const session = await readSession(request, env);
    if (!session || session.uid !== rec.uid) return jsonError('not_found', 404);
  }

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
  r.headers.set('cache-control', rec.published ? 'public, max-age=0, s-maxage=30' : 'no-store');
  return r;
}
