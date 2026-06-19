export const CREATION_LEVEL_SCHEMA = 'game-factory-generic-levels-v1';
export const CREATION_LEVEL_TTL = 60 * 60 * 24 * 30;

const MAX_LEVELS = 200;
const FIELD = { w: 360, h: 640 };

export function levelsKey(id) {
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

function objectId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  }
  return Math.random().toString(16).slice(2, 14);
}

function sanitizeObject(value) {
  const type = cleanText(value && value.type, 20).toLowerCase();
  const allowed = ['wall', 'hazard', 'coin', 'enemy', 'platform', 'note'];
  const kind = allowed.includes(type) ? type : 'hazard';
  return {
    id: cleanText(value && value.id, 36) || objectId(),
    type: kind,
    x: clamp(num(value && value.x, FIELD.w / 2), 0, FIELD.w),
    y: clamp(num(value && value.y, FIELD.h / 2), 0, FIELD.h),
    w: clamp(num(value && value.w, kind === 'wall' || kind === 'platform' ? 90 : 28), 6, FIELD.w),
    h: clamp(num(value && value.h, kind === 'wall' || kind === 'platform' ? 20 : 28), 6, FIELD.h),
    value: clamp(Math.round(num(value && value.value, kind === 'coin' ? 1 : 0)), 0, 999),
    label: cleanText(value && value.label, 60),
  };
}

export function defaultLevels() {
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

export function sanitizeLevels(levels) {
  if (!Array.isArray(levels)) return defaultLevels();
  const clean = levels.slice(0, MAX_LEVELS).map(sanitizeLevel);
  return clean.length ? clean : defaultLevels();
}

function hasLevelArray(stored) {
  return !!(stored && Array.isArray(stored.levels) && stored.levels.length);
}

function stableLevel(value) {
  return {
    name: value.name || '',
    width: value.width,
    height: value.height,
    player: value.player,
    goal: value.goal,
    objects: value.objects || [],
    notes: value.notes || '',
  };
}

function isDefaultLevelSet(levels) {
  const clean = sanitizeLevels(levels).map(stableLevel);
  const fallback = defaultLevels().map(stableLevel);
  return JSON.stringify(clean) === JSON.stringify(fallback);
}

export function normalizeLevelPayload(stored) {
  if (!hasLevelArray(stored)) {
    return {
      schema: CREATION_LEVEL_SCHEMA,
      levels: defaultLevels(),
      updatedTs: 0,
      source: 'default',
    };
  }
  return {
    schema: stored.schema || CREATION_LEVEL_SCHEMA,
    levels: sanitizeLevels(stored.levels),
    updatedTs: Number(stored.updatedTs) || 0,
    source: cleanText(stored.source, 40) || 'stored',
  };
}

export async function readCreationLevels(env, id) {
  const stored = await env.VOTES.get(levelsKey(id), 'json');
  return normalizeLevelPayload(stored);
}

export async function writeCreationLevels(env, id, levels, options = {}) {
  const payload = {
    schema: CREATION_LEVEL_SCHEMA,
    levels: sanitizeLevels(levels),
    updatedTs: Number(options.updatedTs) || Date.now(),
    source: cleanText(options.source, 40) || 'creator-admin',
  };
  const text = JSON.stringify(payload);
  if (text.length > 256 * 1024) {
    const err = new Error('levels_too_large');
    err.code = 'levels_too_large';
    throw err;
  }
  await env.VOTES.put(levelsKey(id), text, { expirationTtl: CREATION_LEVEL_TTL });
  return { ...payload, bytes: text.length };
}

function attrValue(attrs, name) {
  const re = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const m = String(attrs || '').match(re);
  return m ? (m[2] || m[3] || m[4] || '') : '';
}

function decodeJsonScriptText(text) {
  return String(text || '')
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#x22;/gi, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}

function seedPayloadFromValue(value) {
  const rawLevels = Array.isArray(value) ? value : (value && value.levels);
  if (!Array.isArray(rawLevels) || !rawLevels.length) return null;
  return {
    schema: CREATION_LEVEL_SCHEMA,
    levels: sanitizeLevels(rawLevels),
    source: 'embedded-seed',
  };
}

export function extractEmbeddedLevelSeed(html) {
  const source = String(html || '');
  const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRe.exec(source))) {
    const attrs = match[1] || '';
    if (attrValue(attrs, 'id') !== 'gameFactoryLevelSeed') continue;
    const body = decodeJsonScriptText(match[2] || '');
    if (!body || body.length > 256 * 1024) return null;
    try {
      return seedPayloadFromValue(JSON.parse(body));
    } catch {
      return null;
    }
  }
  return null;
}

export async function seedCreationLevelsFromHtml(env, id, html, options = {}) {
  const seed = extractEmbeddedLevelSeed(html);
  if (!seed) return { seeded: false, reason: 'missing_seed' };

  const existing = await env.VOTES.get(levelsKey(id), 'json');
  if (hasLevelArray(existing)) {
    const source = cleanText(existing.source, 40);
    if ((!source || source !== 'embedded-seed') && !isDefaultLevelSet(existing.levels)) {
      return {
        seeded: false,
        reason: source ? `existing_${source}` : 'existing_levels',
        count: sanitizeLevels(existing.levels).length,
      };
    }
  }

  const payload = await writeCreationLevels(env, id, seed.levels, {
    updatedTs: options.updatedTs,
    source: 'embedded-seed',
  });
  return { seeded: true, count: payload.levels.length, updatedTs: payload.updatedTs };
}
