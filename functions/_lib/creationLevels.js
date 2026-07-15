export const CREATION_LEVEL_SCHEMA = 'game-factory-generic-levels-v1';
export const CREATION_LEVEL_TTL = 60 * 60 * 24 * 30;

const MAX_LEVELS = 200;
const FIELD = { w: 360, h: 640 };
const MAX_WORLD_SIZE = 10_000;
const MAX_OBJECT_VALUE = 1_000_000;

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

function cleanPoint(value, fallbackX, fallbackY, bounds = FIELD) {
  return {
    x: clamp(num(value && value.x, fallbackX), 0, bounds.w),
    y: clamp(num(value && value.y, fallbackY), 0, bounds.h),
  };
}

function cleanType(value) {
  return cleanText(value, 32).replace(/[^A-Za-z0-9_-]/g, '') || 'hazard';
}

function cleanDimension(value, fallback) {
  return clamp(num(value, fallback), 64, MAX_WORLD_SIZE);
}

function sanitizeObject(value, bounds = FIELD, levelIndex = 0, objectIndex = 0) {
  // Generated games are allowed to give the generic shape game-specific
  // semantics (camera, climate, coolRock, and so on). Coercing an unknown type
  // to "hazard" changes gameplay and can turn a harmless world-sized region
  // into a lethal one. Keep a bounded token instead; the game owns its mapping.
  const kind = cleanType(value && value.type);
  return {
    // Stable fallback IDs make the exact runtime message reproducible across
    // queue QA, result acceptance, KV storage, and the /cplay bridge.
    id: cleanText(value && value.id, 36) || `level-${levelIndex + 1}-object-${objectIndex + 1}`,
    type: kind,
    x: clamp(num(value && value.x, bounds.w / 2), 0, bounds.w),
    y: clamp(num(value && value.y, bounds.h / 2), 0, bounds.h),
    w: clamp(num(value && value.w, kind === 'wall' || kind === 'platform' ? 90 : 28), 1, MAX_WORLD_SIZE),
    h: clamp(num(value && value.h, kind === 'wall' || kind === 'platform' ? 20 : 28), 1, MAX_WORLD_SIZE),
    // Fractional and negative values are meaningful to generated mechanics
    // (for example scan speed/direction), so do not round or force positive.
    value: clamp(num(value && value.value, kind === 'coin' ? 1 : 0), -MAX_OBJECT_VALUE, MAX_OBJECT_VALUE),
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
  const width = cleanDimension(value && value.width, FIELD.w);
  const height = cleanDimension(value && value.height, FIELD.h);
  const bounds = { w: width, h: height };
  return {
    name: cleanText(value && value.name, 60) || `Level ${index + 1}`,
    width,
    height,
    player: cleanPoint(value && value.player, width / 2, Math.max(0, height - 80), bounds),
    goal: cleanPoint(value && value.goal, width / 2, Math.min(100, height), bounds),
    objects: Array.isArray(value && value.objects)
      ? value.objects.slice(0, 120).map((object, objectIndex) => sanitizeObject(object, bounds, index, objectIndex))
      : [],
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

export function isDefaultLevelSet(levels) {
  const clean = sanitizeLevels(levels).map(stableLevel);
  const fallback = defaultLevels().map(stableLevel);
  return JSON.stringify(clean) === JSON.stringify(fallback);
}

export function shouldPreserveCreationLevels(payload) {
  if (!hasLevelArray(payload)) return false;
  const source = cleanText(payload.source, 40);
  return (!source || source !== 'embedded-seed') && !isDefaultLevelSet(payload.levels);
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
  if (shouldPreserveCreationLevels(existing)) {
    const source = cleanText(existing.source, 40);
    return {
      seeded: false,
      reason: source ? `existing_${source}` : 'existing_levels',
      count: sanitizeLevels(existing.levels).length,
    };
  }

  const payload = await writeCreationLevels(env, id, seed.levels, {
    updatedTs: options.updatedTs,
    source: 'embedded-seed',
  });
  return { seeded: true, count: payload.levels.length, updatedTs: payload.updatedTs };
}
