// POST /api/me/name  { name }
// Sets the signed-in player's public creator display name (shown on creations they
// publish to the gallery). Stored on meta:<sessionUid>.displayName. Same-origin +
// session only; sanitized (no links/profanity) via cleanName. Tim 2026-06-15.

import { readSession } from '../_session.js';
import { json, jsonError, sameOriginOk } from '../../_lib/response.js';
import { readMeta, writeMeta } from '../../_lib/meta.js';
import { cleanName } from '../../_lib/chatmod.js';

export async function onRequestPost({ request, env }) {
  if (!sameOriginOk(request)) return jsonError('forbidden', 403);
  const session = await readSession(request, env);
  if (!session || !session.uid) return jsonError('sign_in_required', 401);

  let body;
  try { body = await request.json(); } catch { return jsonError('bad_json', 400); }
  const name = cleanName(body.name || '', 24);

  const m = await readMeta(env, session.uid);
  m.displayName = name;
  await writeMeta(env, session.uid, m);

  const r = json({ ok: true, displayName: name });
  r.headers.set('cache-control', 'no-store');
  return r;
}
