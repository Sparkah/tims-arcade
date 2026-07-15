// GET /api/creation-levels?id=<creationId>
// Public/read-only level data for live Studio games. New games are unlisted,
// not private: anyone holding the opaque play URL needs this exact payload.
// Mutation and history remain protected by /api/me/creation-admin.

import { json, jsonError } from '../_lib/response.js';
import { isPlayableStudioCreation } from '../_lib/creationVisibility.js';
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

  const [rec, html] = await Promise.all([
    env.VOTES.get(`upload:${id}`, 'json'),
    env.VOTES.get(`genblob:${id}`),
  ]);
  // Match /g/<id> exactly so cplay never starts metrics and attaches an iframe
  // for a metadata-only record whose actual game bytes are gone.
  if (!html || !isPlayableStudioCreation(rec)) return fail('not_found', 404);

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
  // Level edits, iteration, deletion, and moderation must be visible immediately.
  r.headers.set('cache-control', 'no-store');
  return r;
}
