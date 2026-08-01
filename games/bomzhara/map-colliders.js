import { BAL } from './config.js?v=20260801a';

export var COLLIDER_STORAGE_KEY = 'bomzhara:map-colliders:v1';
export var MAP_COLLIDER_VERSION = 6;   // payload version written by the builder
export var COLLIDER_LEGACY_VERSION = 4; // collider schema last changed here; migrations gate on THIS, not on payload bumps
export var EVENTS_MIN_VERSION = 6;     // stored event tuning is honored from this payload version on
export var SPOTS_MIN_VERSION = 6;      // stored tapok spots are honored from this payload version on (pre-v6 = auto defaults)

// Level-event tuning editable in the builder. Baked defaults mirror BAL / the old hardcoded timers.
export var DEFAULT_EVENT_TUNING = {
  tapokFirst: 60,                        // s until the tapok event (Tim: single event at second 60)
  tapokEveryMin: 0,                      // s after a boom before the next tapok; 0 = ONE tapok per run
  tapokEveryRand: 0,                     // + random extra
  tapokArmTime: BAL.tapokArmTime,        // s of invulnerable stand-on time before BOOM
  wanderMax: BAL.wanderMax,              // ambient outside roamers alive at once
  wanderFirst: BAL.wanderFirst,
  wanderEveryMin: BAL.wanderEveryMin,
  wanderEveryRand: BAL.wanderEveryRand,
  waveFirst: 0.8,                        // s until the first wave spawn
  waveEvery0: 1.95,                      // starting seconds between wave spawns (Tim 2026-07-03: 1.5x calmer than the old 1.3)
  waveEveryMin: 0.63,                    // ramp floor (old 0.42 * 1.5)
  weirdFirst: 8,                         // s until the first weird event (siren/blackout/possessed)
  weirdEveryMin: 10,                     // s between weird events (min)
  weirdEveryRand: 6,                     // + random extra
  windowAt: 30,                          // s: the open-window horror fires ONCE at this moment
  possessedAt: 30,                       // s: залипшая клавиша fires ONCE when a slot is free (right after the window if both hit 30)
  squirrelFirst: 16,                     // белочка debut cooldown
  squirrelEvery: 18,                     // белочка repeat cooldown
};

var EVENT_LIMITS = {
  tapokFirst: [0, 600], tapokEveryMin: [0, 600], tapokEveryRand: [0, 600], tapokArmTime: [1, 60],
  wanderMax: [0, 12], wanderFirst: [0, 600], wanderEveryMin: [1, 600], wanderEveryRand: [0, 600],
  waveFirst: [0, 60], waveEvery0: [0.1, 30], waveEveryMin: [0.1, 30],
  weirdFirst: [0, 600], weirdEveryMin: [1, 600], weirdEveryRand: [0, 600], windowAt: [0, 600], possessedAt: [0, 600],
  squirrelFirst: [0, 600], squirrelEvery: [1, 600],
};

export function sanitizeEventTuning(input) {
  var out = {};
  input = input && typeof input === 'object' ? input : {};
  for (var k in DEFAULT_EVENT_TUNING) {
    var v = Number(input[k]);
    if (!Number.isFinite(v)) v = DEFAULT_EVENT_TUNING[k];
    var lim = EVENT_LIMITS[k];
    if (lim) v = Math.max(lim[0], Math.min(lim[1], v));
    out[k] = +v.toFixed(3);
  }
  return out;
}

// Fractions of the gameplay arena rectangle, not raw pixels.
// Baked from Tim's builder JSON, 2026-07-03 (v4).
var DEFAULT_SOLID_DEFS = [
  { id: 'top-left-wall', x: 0.1805, y: 0.0800, w: 0.4086, h: 0.1001 },
  { id: 'top-right-wall', x: 0.5881, y: 0.0507, w: 0.1244, h: 0.1070 },
  { id: 'left-outer-wall', x: 0.1573, y: 0.1779, w: 0.0528, h: 0.6181 },
  { id: 'right-outer-wall-upper', x: 0.8131, y: 0.3227, w: 0.0700, h: 0.2472 },
  { id: 'right-outer-wall-lower', x: 0.8400, y: 0.6523, w: 0.0600, h: 0.1575 },
  { id: 'bottom-left-room-wall', x: 0.1430, y: 0.7853, w: 0.1734, h: 0.1389 },
  { id: 'bottom-center-wall', x: 0.3098, y: 0.7959, w: 0.2570, h: 0.0890 },
  { id: 'bottom-right-wall', x: 0.6269, y: 0.7945, w: 0.2642, h: 0.1097 },
  { id: 'bathroom-partition', x: 0.6016, y: 0.1440, w: 0.0303, h: 0.2180 },
  { id: 'right-stairwell', x: 0.7187, y: 0.2360, w: 0.0913, h: 0.3541 },
  { id: 'burn-barrel', x: 0.2547, y: 0.3129, w: 0.0271, h: 0.0544 },
  { id: 'lit-table-clutter', x: 0.6926, y: 0.5643, w: 0.1496, h: 0.2362 },
  { id: 'collider', x: 0.6956, y: 0.1559, w: 0.0782, h: 0.1065 },
  { id: 'collider-2', x: 0.6997, y: 0.0796, w: 0.0542, h: 0.0764 },
  { id: 'collider-3', x: 0.2600, y: 0.6122, w: 0.0459, h: 0.1797 },
];

export var DEFAULT_ENEMY_HOLE_DEFS = [
  { id: 'enemy-hole-top-breach', type: 'enemy-hole', x: 0.5000, y: 0.0450, w: 0.0950, h: 0.1642 },
  { id: 'enemy-hole-right-stairs', type: 'enemy-hole', x: 0.6784, y: 0.3886, w: 0.2211, h: 0.1650 },
  { id: 'enemy-hole-left-breach', type: 'enemy-hole', x: 0.1061, y: 0.3857, w: 0.1491, h: 0.1377 },
  { id: 'enemy-hole', type: 'enemy-hole', x: 0.3137, y: 0.0352, w: 0.0800, h: 0.1763 },
  { id: 'enemy-hole-2', type: 'enemy-hole', x: 0.4532, y: 0.7809, w: 0.0800, h: 0.1200 },
];

// Designer-placed tapok spawn spots (type 'tapok-spot'). Default = ONE small spot in the very
// centre of the room (Tim 2026-07-03); empty list = old near-player random placement.
export var DEFAULT_TAPOK_SPOT_DEFS = [
  { id: 'tapok-spot-center', type: 'tapok-spot', x: 0.4860, y: 0.4810, w: 0.0400, h: 0.0500 },
];

export var DEFAULT_MAP_SOLID_DEFS = DEFAULT_SOLID_DEFS.concat(DEFAULT_ENEMY_HOLE_DEFS).concat(DEFAULT_TAPOK_SPOT_DEFS);

function num(v, fallback) {
  v = Number(v);
  return Number.isFinite(v) ? v : fallback;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function safeId(v, i) {
  v = String(v || '').trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return v || ('collider-' + (i + 1));
}

function safeType(v) {
  if (v === 'enemy-hole') return 'enemy-hole';
  if (v === 'tapok-spot') return 'tapok-spot'; // designer-placed tapok spawn location (no collision)
  return 'solid';
}

function hasEnemyHoles(defs) {
  for (var i = 0; i < defs.length; i++) if (defs[i].type === 'enemy-hole') return true;
  return false;
}

function isDeprecatedEnemyHole(d) {
  if (d.type !== 'enemy-hole') return false;
  if (d.id === 'enemy-hole-bottom-door') return true;
  return (d.id === 'enemy-hole' || d.id === 'enemy-hole-2') && d.x < 0.42 && d.y < 0.22;
}

function migrateDoorSolid(d) {
  if (d.id === 'bottom-center-wall' && d.y > 0.75 && d.x < 0.45) {
    d.w = Math.min(d.w, 0.0700);
  } else if (d.id === 'bottom-right-wall' && d.y > 0.75 && d.x < 0.6560) {
    var oldRight = d.x + d.w;
    d.x = 0.6560;
    d.w = Math.max(0.005, +(oldRight - d.x).toFixed(4));
  }
  return d;
}

// Pure validation/clamping. Runs on every builder edit, so it must NEVER rewrite intent
// (no legacy filters, no door migrations) - those live in migrateLegacyMapSolidDefs below.
export function sanitizeMapSolidDefs(input) {
  if (!Array.isArray(input)) return [];
  var out = [];
  for (var i = 0; i < input.length; i++) {
    var d = input[i] || {};
    var w = clamp(num(d.w, 0.08), 0.005, 1);
    var h = clamp(num(d.h, 0.08), 0.005, 1);
    var x = clamp(num(d.x, 0.46), 0, 1 - w);
    var y = clamp(num(d.y, 0.46), 0, 1 - h);
    out.push({
      id: safeId(d.id, i),
      type: safeType(d.type),
      x: +x.toFixed(4),
      y: +y.toFixed(4),
      w: +w.toFixed(4),
      h: +h.toFixed(4),
    });
  }
  return out;
}

// One-time upgrade of colliders stored under an OLDER schema version: drops the two known
// stale auto-generated holes and the removed bottom-door hole, and re-splits the bottom
// door solids. Never applied to current-version data or live builder edits.
export function migrateLegacyMapSolidDefs(defs) {
  var out = [];
  for (var i = 0; i < defs.length; i++) {
    var d = defs[i];
    if (isDeprecatedEnemyHole(d)) continue;
    out.push(migrateDoorSolid(d));
  }
  return out;
}

export function cloneMapSolidDefs(defs) {
  return sanitizeMapSolidDefs(defs || DEFAULT_MAP_SOLID_DEFS);
}

export function loadStoredMapSolidDefs() {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    var raw = window.localStorage.getItem(COLLIDER_STORAGE_KEY);
    if (!raw) return null;
    var parsed = JSON.parse(raw);
    var colliders = Array.isArray(parsed) ? parsed : parsed && parsed.colliders;
    var version = Array.isArray(parsed) ? 0 : num(parsed && parsed.version, 0);
    var clean = sanitizeMapSolidDefs(colliders);
    if (version < COLLIDER_LEGACY_VERSION) {
      // pre-v4 saves predate the current hole layout: keep their walls, swap in the current default holes
      clean = migrateLegacyMapSolidDefs(clean).filter(function (d) { return d.type !== 'enemy-hole'; });
    }
    if (version < SPOTS_MIN_VERSION) {
      // pre-v6 spots were auto-written defaults (the edge layout), not user choices: swap for current defaults
      clean = clean.filter(function (d) { return d.type !== 'tapok-spot'; });
    }
    if (clean.length && !hasEnemyHoles(clean)) {
      clean = clean.concat(sanitizeMapSolidDefs(DEFAULT_ENEMY_HOLE_DEFS));
    }
    if (clean.length && !clean.some(function (d) { return d.type === 'tapok-spot'; })) {
      // saves made before tapok spots existed inherit the default edge spots
      clean = clean.concat(sanitizeMapSolidDefs(DEFAULT_TAPOK_SPOT_DEFS));
    }
    return clean.length ? clean : null;
  } catch (e) {
    return null;
  }
}

export function hasStoredMapSolidDefs() {
  return !!loadStoredMapSolidDefs();
}

export function loadMapSolidDefs() {
  return loadStoredMapSolidDefs() || cloneMapSolidDefs(DEFAULT_MAP_SOLID_DEFS);
}

export function loadStoredEventTuning() {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    var raw = window.localStorage.getItem(COLLIDER_STORAGE_KEY);
    if (!raw) return null;
    var parsed = JSON.parse(raw);
    if (!parsed || Array.isArray(parsed) || !parsed.events) return null;
    if (num(parsed.version, 0) < EVENTS_MIN_VERSION) return null; // pre-v5 events were auto-written defaults, not user choices
    return sanitizeEventTuning(parsed.events);
  } catch (e) {
    return null;
  }
}

export function loadEventTuning() {
  return loadStoredEventTuning() || sanitizeEventTuning(DEFAULT_EVENT_TUNING);
}

export function saveStoredMapSolidDefs(defs, events) {
  var clean = sanitizeMapSolidDefs(defs);
  if (!clean.length) throw new Error('No colliders to save');
  if (typeof window === 'undefined' || !window.localStorage) throw new Error('localStorage unavailable');
  window.localStorage.setItem(COLLIDER_STORAGE_KEY, JSON.stringify({
    version: MAP_COLLIDER_VERSION,
    colliders: clean,
    events: sanitizeEventTuning(events || DEFAULT_EVENT_TUNING),
  }, null, 2));
  return clean;
}

export function clearStoredMapSolidDefs() {
  if (typeof window !== 'undefined' && window.localStorage) window.localStorage.removeItem(COLLIDER_STORAGE_KEY);
}

export function formatMapSolidDefs(defs, events) {
  return JSON.stringify({
    version: MAP_COLLIDER_VERSION,
    colliders: sanitizeMapSolidDefs(defs),
    events: sanitizeEventTuning(events || DEFAULT_EVENT_TUNING),
  }, null, 2);
}

export function formatSourceSnippet(defs, events) {
  var clean = sanitizeMapSolidDefs(defs);
  var solids = [];
  var holes = [];
  var spots = [];
  for (var i = 0; i < clean.length; i++) {
    if (clean[i].type === 'enemy-hole') holes.push(clean[i]);
    else if (clean[i].type === 'tapok-spot') spots.push(clean[i]);
    else solids.push(clean[i]);
  }
  return [
    '// Replace the default collider + event blocks in map-colliders.js with this before building a zip.',
    '// These are fractions of the rendered map/arena rectangle, not raw pixels.',
    'var DEFAULT_SOLID_DEFS = ' + JSON.stringify(solids, null, 2) + ';',
    '',
    'export var DEFAULT_ENEMY_HOLE_DEFS = ' + JSON.stringify(holes, null, 2) + ';',
    '',
    'export var DEFAULT_TAPOK_SPOT_DEFS = ' + JSON.stringify(spots, null, 2) + ';',
    '',
    'export var DEFAULT_MAP_SOLID_DEFS = DEFAULT_SOLID_DEFS.concat(DEFAULT_ENEMY_HOLE_DEFS).concat(DEFAULT_TAPOK_SPOT_DEFS);',
    '',
    '// Event tuning (replace the value block inside DEFAULT_EVENT_TUNING):',
    'export var DEFAULT_EVENT_TUNING = ' + JSON.stringify(sanitizeEventTuning(events || DEFAULT_EVENT_TUNING), null, 2) + ';',
    '',
  ].join('\n');
}
