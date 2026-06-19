// GET/POST /api/me/creation-admin
// Creator-facing admin data for a generated game. Owners can open it through
// their signed-in session; a per-game admin password can also load/save levels
// without exposing full account controls.

import { readSession } from '../_session.js';
import { json, jsonError, sameOriginOk } from '../../_lib/response.js';
import { makeReadablePassword } from '../../_lib/crypto.js';
import { makeEditorPasswordRecord, verifyPasswordRecord } from '../../_lib/gameEditorAuth.js';
import { readCreationLevels, writeCreationLevels } from '../../_lib/creationLevels.js';

const ID_RE = /^[0-9a-z]{8,40}$/;
const TTL = 60 * 60 * 24 * 30;

async function readCreation(env, id) {
  const rec = await env.VOTES.get(`upload:${id}`, 'json');
  if (!rec || rec.source !== 'vibe') return null;
  return rec;
}

async function isOwner(request, env, rec) {
  const session = await readSession(request, env);
  return !!(session && session.uid && rec && rec.uid === session.uid);
}

async function passwordOk(rec, password) {
  if (!rec || !rec.adminPasswordHash) return false;
  return verifyPasswordRecord(String(password || ''), rec.adminPasswordHash);
}

async function ensureAdminPassword(env, id, rec) {
  if (rec.adminPasswordHash) return { rec, password: null };
  const password = makeReadablePassword();
  rec.adminPasswordHash = await makeEditorPasswordRecord(password);
  rec.adminPasswordSetAt = Date.now();
  await env.VOTES.put(`upload:${id}`, JSON.stringify(rec), { expirationTtl: TTL });
  return { rec, password };
}

function publicRec(id, rec, owner) {
  return {
    id,
    slug: rec.slug || '',
    title: rec.title || rec.slug || 'Untitled game',
    hook: rec.hook || '',
    status: rec.status || 'live',
    published: !!rec.published,
    owner: !!owner,
    hasAdminPassword: !!rec.adminPasswordHash,
    playUrl: `/cplay?id=${encodeURIComponent(id)}&slug=${encodeURIComponent(rec.slug || '')}&title=${encodeURIComponent(rec.title || '')}`,
  };
}

async function responseFor(request, env, id, rec, owner) {
  const access = owner ? await ensureAdminPassword(env, id, rec) : { rec, password: null };
  const data = await readCreationLevels(env, id);
  const r = json({
    ok: true,
    game: publicRec(id, access.rec, owner),
    levels: data.levels,
    schema: data.schema,
    updatedTs: data.updatedTs,
    source: data.source,
    generatedPassword: access.password,
  });
  r.headers.set('cache-control', 'no-store');
  return r;
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const id = String(url.searchParams.get('id') || '').toLowerCase();
  if (!ID_RE.test(id)) return jsonError('bad_id', 400);
  const rec = await readCreation(env, id);
  if (!rec) return jsonError('not_found', 404);
  if (!await isOwner(request, env, rec)) return jsonError('password_required', 401);
  return responseFor(request, env, id, rec, true);
}

export async function onRequestPost({ request, env }) {
  if (!sameOriginOk(request)) return jsonError('forbidden', 403);
  let body;
  try { body = await request.json(); } catch { return jsonError('bad_json', 400); }
  const id = String(body.id || '').toLowerCase();
  const action = String(body.action || 'load');
  if (!ID_RE.test(id)) return jsonError('bad_id', 400);

  const rec = await readCreation(env, id);
  if (!rec) return jsonError('not_found', 404);
  const owner = await isOwner(request, env, rec);
  const pass = await passwordOk(rec, body.password);
  if (!owner && !pass) return jsonError('password_required', 401);

  if (action === 'load') return responseFor(request, env, id, rec, owner);

  if (action === 'save-levels') {
    let payload;
    try {
      payload = await writeCreationLevels(env, id, body.levels, { source: 'creator-admin' });
    } catch (e) {
      if (e && e.code === 'levels_too_large') return jsonError('levels_too_large', 413);
      throw e;
    }
    const r = json({ ok: true, levels: payload.levels.length, bytes: payload.bytes, updatedTs: payload.updatedTs });
    r.headers.set('cache-control', 'no-store');
    return r;
  }

  if (action === 'reset-password') {
    if (!owner) return jsonError('owner_required', 403);
    const password = makeReadablePassword();
    rec.adminPasswordHash = await makeEditorPasswordRecord(password);
    rec.adminPasswordSetAt = Date.now();
    await env.VOTES.put(`upload:${id}`, JSON.stringify(rec), { expirationTtl: TTL });
    const r = json({ ok: true, password });
    r.headers.set('cache-control', 'no-store');
    return r;
  }

  return jsonError('bad_action', 400);
}
