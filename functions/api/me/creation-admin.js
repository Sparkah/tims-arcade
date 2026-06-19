// GET/POST /api/me/creation-admin
// Creator-facing admin data for a generated game. Owners can open it through
// their signed-in session; a per-game admin password can also load/save levels
// without exposing full account controls.

import { readSession } from '../_session.js';
import { json, jsonError, sameOriginOk } from '../../_lib/response.js';
import { makeEditorPasswordRecord, verifyPasswordRecord } from '../../_lib/gameEditorAuth.js';

const ID_RE = /^[0-9a-z]{8,40}$/;
const TTL = 60 * 60 * 24 * 30;
const MAX_LEVELS = 200;
const FIELD = { w: 360, h: 640 };

function levelsKey(id) {
  return `creation-levels:${id}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cleanText(value, max = 80) {
  return String(value == null ? '' : value).replace(/[\r\n\t]/g, ' ').trim().slice(0, max);
}

function cleanPoint(value, fallbackX, fallbackY) {
  return {
    x: clamp(num(value && value.x, fallbackX), 0, FIELD.w),
    y: clamp(num(value && value.y, fallbackY), 0, FIELD.h),
  };
}

function sanitizeObject(value) {
  const type = cleanText(value && value.type, 20).toLowerCase();
  const allowed = ['wall', 'hazard', 'coin', 'enemy', 'platform', 'note'];
  const kind = allowed.includes(type) ? type : 'hazard';
  return {
    id: cleanText(value && value.id, 36) || crypto.randomUUID().replace(/-/g, '').slice(0, 12),
    type: kind,
    x: clamp(num(value && value.x, FIELD.w / 2), 0, FIELD.w),
    y: clamp(num(value && value.y, FIELD.h / 2), 0, FIELD.h),
    w: clamp(num(value && value.w, kind === 'wall' || kind === 'platform' ? 90 : 28), 6, FIELD.w),
    h: clamp(num(value && value.h, kind === 'wall' || kind === 'platform' ? 20 : 28), 6, FIELD.h),
    value: clamp(Math.round(num(value && value.value, kind === 'coin' ? 1 : 0)), 0, 999),
    label: cleanText(value && value.label, 60),
  };
}

function defaultLevels() {
  return [{
    name: 'Level 1',
    width: FIELD.w,
    height: FIELD.h,
    player: { x: 180, y: 560 },
    goal: { x: 180, y: 100 },
    objects: [],
    notes: '',
  }];
}

function sanitizeLevel(value, index) {
  return {
    name: cleanText(value && value.name, 60) || `Level ${index + 1}`,
    width: FIELD.w,
    height: FIELD.h,
    player: cleanPoint(value && value.player, 180, 560),
    goal: cleanPoint(value && value.goal, 180, 100),
    objects: Array.isArray(value && value.objects) ? value.objects.slice(0, 120).map(sanitizeObject) : [],
    notes: cleanText(value && value.notes, 500),
  };
}

function sanitizeLevels(levels) {
  if (!Array.isArray(levels)) return defaultLevels();
  const clean = levels.slice(0, MAX_LEVELS).map(sanitizeLevel);
  return clean.length ? clean : defaultLevels();
}

function makePassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8)}`;
}

async function readCreation(env, id) {
  const rec = await env.VOTES.get(`upload:${id}`, 'json');
  if (!rec || rec.source !== 'vibe') return null;
  return rec;
}

async function readLevels(env, id) {
  const stored = await env.VOTES.get(levelsKey(id), 'json');
  const levels = sanitizeLevels(stored && stored.levels);
  return {
    levels,
    updatedTs: (stored && stored.updatedTs) || 0,
    schema: 'game-factory-generic-levels-v1',
  };
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
  const password = makePassword();
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
  const data = await readLevels(env, id);
  const r = json({
    ok: true,
    game: publicRec(id, access.rec, owner),
    levels: data.levels,
    schema: data.schema,
    updatedTs: data.updatedTs,
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
    const levels = sanitizeLevels(body.levels);
    const payload = {
      schema: 'game-factory-generic-levels-v1',
      levels,
      updatedTs: Date.now(),
    };
    const text = JSON.stringify(payload);
    if (text.length > 256 * 1024) return jsonError('levels_too_large', 413);
    await env.VOTES.put(levelsKey(id), text, { expirationTtl: TTL });
    const r = json({ ok: true, levels: levels.length, bytes: text.length, updatedTs: payload.updatedTs });
    r.headers.set('cache-control', 'no-store');
    return r;
  }

  if (action === 'reset-password') {
    if (!owner) return jsonError('owner_required', 403);
    const password = makePassword();
    rec.adminPasswordHash = await makeEditorPasswordRecord(password);
    rec.adminPasswordSetAt = Date.now();
    await env.VOTES.put(`upload:${id}`, JSON.stringify(rec), { expirationTtl: TTL });
    const r = json({ ok: true, password });
    r.headers.set('cache-control', 'no-store');
    return r;
  }

  return jsonError('bad_action', 400);
}
