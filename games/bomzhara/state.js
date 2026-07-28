// Centralized mutable state: SoA pools + singletons (Bloodtread idiom).
// Typed arrays allocated ONCE; reset by zeroing .count. context.js imports player/view/sprites/enemies/cam.
import { MAX_BULLETS, MAX_FOES, MAX_PARTS, MAX_PICKUPS, MAX_PUDDLES, BAL } from './config.js?v=20260704a';

var HORROR_STORE = 'bomzhara:horrors_seen';
function loadHorrorSeen() {
  var seen = { blackout: false, possessed: false, window: false };
  try {
    var raw = window.localStorage && window.localStorage.getItem(HORROR_STORE);
    if (raw) {
      var parsed = JSON.parse(raw);
      seen.blackout = !!parsed.blackout; seen.possessed = !!parsed.possessed; seen.window = !!parsed.window;
    }
  } catch (e) {}
  return seen;
}

export function rememberHorror(id) {
  if (!state.horrorSeen || !(id in state.horrorSeen)) return;
  state.horrorSeen[id] = true;
  try { window.localStorage && window.localStorage.setItem(HORROR_STORE, JSON.stringify(state.horrorSeen)); } catch (e) {}
}

// camera target (FIXED at arena centre - single-screen arena, world space == screen space at zoom 1)
export var cam = { x: 0, y: 0 };

// display / camera metrics
export var view = { cssW: 1, cssH: 1, dpr: 1, cameraZoom: 1, viewWorldW: 1, viewWorldH: 1, shake: 0 };

// procedural build: no sprite atlas, but context.js expects the shape
export var sprites = { images: Object.create(null), textures: Object.create(null), meta: Object.create(null), pending: 0, loaded: 0, ready: true };

// -- the bomzh --
export var player = {
  x: 0, y: 0, vx: 0, vy: 0, r: BAL.playerR, face: 0,
  hp: BAL.maxHp, maxHp: BAL.maxHp,
  vodka: BAL.startVodka, maxVodka: BAL.maxVodka,
  belochka: 0,            // 0 calm .. 1 full madness
  fireCd: 0, recoil: 0, hurt: 0, iframe: 0, drinkGlow: 0, bloodFire: 0,
  shield: 0, shieldFlash: 0, shotSeq: 0,
  attackT: 0, attackMax: 0, attackSeq: 0,
  throwQueued: 0, throwT: 0, throwAim: 0, throwMiss: 0, throwKind: 0, throwShots: 0, throwSpread: 0, throwJit: 0, throwMolotov: 0,
  step: 0, dead: false,
  // roguelite upgrade stats (mutated by level-up picks; reset each run)
  up: { shots: 1, fireMul: 1, bounce: 0, dmgMul: 1, vodkaMax: 0, lifesteal: 0, speedMul: 1, pierce: false, ifrBonus: 0, steady: 1, molotov: 0, ricochetSeek: 0, shieldMax: 0, ambulance: 0, wisdom: 0 },
};

// -- your shots (vodka / blood). bounce off the walls. --
export var bullets = {
  x: new Float32Array(MAX_BULLETS), y: new Float32Array(MAX_BULLETS),
  px: new Float32Array(MAX_BULLETS), py: new Float32Array(MAX_BULLETS), // last-frame pos for swept hits (spawn frame: player centre)
  vx: new Float32Array(MAX_BULLETS), vy: new Float32Array(MAX_BULLETS),
  life: new Float32Array(MAX_BULLETS), r: new Float32Array(MAX_BULLETS),
  bounce: new Uint8Array(MAX_BULLETS), kind: new Uint8Array(MAX_BULLETS),  // 0 vodka, 1 blood
  count: 0,
};

// -- foes: REAL evil + белочка HALLUCINATIONS share the pool (real flag splits them) --
export var enemies = {
  x: new Float32Array(MAX_FOES), y: new Float32Array(MAX_FOES),
  vx: new Float32Array(MAX_FOES), vy: new Float32Array(MAX_FOES),
  hp: new Float32Array(MAX_FOES), maxHp: new Float32Array(MAX_FOES),
  r: new Float32Array(MAX_FOES), phase: new Float32Array(MAX_FOES),
  gateX: new Float32Array(MAX_FOES), gateY: new Float32Array(MAX_FOES),
  real: new Uint8Array(MAX_FOES), type: new Uint8Array(MAX_FOES),
  gateActive: new Uint8Array(MAX_FOES),
  wander: new Uint8Array(MAX_FOES), // 1 = ambient outside-roamer: no chase, walks between waypoints
  hitT: new Float32Array(MAX_FOES), seed: new Float32Array(MAX_FOES),
  count: 0,
};

// -- particles --
export var parts = {
  x: new Float32Array(MAX_PARTS), y: new Float32Array(MAX_PARTS),
  vx: new Float32Array(MAX_PARTS), vy: new Float32Array(MAX_PARTS),
  r: new Float32Array(MAX_PARTS), life: new Float32Array(MAX_PARTS),
  max: new Float32Array(MAX_PARTS), col: new Uint8Array(MAX_PARTS),
  count: 0, cursor: 0,
};

// -- dropped pickups: kind 0 = vodka bottle (ammo+sanity), kind 1 = закуска (heal blood + a sip of sanity) --
export var pickups = {
  x: new Float32Array(MAX_PICKUPS), y: new Float32Array(MAX_PICKUPS),
  vy: new Float32Array(MAX_PICKUPS), r: new Float32Array(MAX_PICKUPS),
  phase: new Float32Array(MAX_PICKUPS), kind: new Uint8Array(MAX_PICKUPS), count: 0,
};

// -- burning puddles: bad vodka upgrade leaves noisy ground hazards that also stain the room --
export var puddles = {
  x: new Float32Array(MAX_PUDDLES), y: new Float32Array(MAX_PUDDLES),
  r: new Float32Array(MAX_PUDDLES), life: new Float32Array(MAX_PUDDLES),
  max: new Float32Array(MAX_PUDDLES), phase: new Float32Array(MAX_PUDDLES),
  count: 0, cursor: 0,
};

// -- белочка, the squirrel: your delirium given a face (single taunting entity) --
export var squirrel = { active: false, x: 0, y: 0, vx: 0, vy: 0, t: 0, talkT: 0, line: 0 };

// -- заминированный тапок: one battlefield safe-zone meme object --
export var tapok = {
  active: false, armed: false,
  x: 0, y: 0, r: 34, safeR: 98, blastR: 176,
  timer: 0, max: 10,
  spawnCd: 7.5, popupT: 0, boomT: 0, pulse: 0,
};

// -- input --
export var input = {
  keys: new Uint8Array(256),
  pointerDown: false, pointerX: 0, pointerY: 0, pointerId: -1,
  joyActive: false, joyBaseX: 0, joyBaseY: 0, joyDX: 0, joyDY: 0, joyRadius: 64,
  moveX: 0, moveY: 0,
};

// -- run state --
export var state = {
  mode: 'MENU',       // MENU | PLAY | UPGRADE | DEAD | WIN
  t: 0, tick: 0,
  score: 0, kills: 0, phantoms: 0,
  spawnCd: 0, hallucCd: 0, shadowCd: 0, squirrelCd: 14, wanderCd: 6,
  difficulty: 'medium', // easy = half monsters, hard = x1.5 (menu picker, persisted)
  helpFrom: 'PLAY',     // which mode the ? screen returns to
  goalTime: 90,       // survive this many seconds until the ambulance arrives
  survived: 0,
  banner: '', bannerT: 0,
  endReason: '',      // 'bled' | 'sane' | 'wreck'
  best: 0,
  warp: 0,            // current белочка screen-warp amount (eased)
  taughtBounce: false,
  taughtBlood: false,
  taughtMolotov: false,
  taughtTapok: false,
  weirdCd: 8,
  windowFired: false,   // the scripted 30s window one-shot
  possessedFired: false, // the scripted залипшая клавиша one-shot
  dyingT: 0, dyingMax: 0, // green-vomit death animation before the DEAD screen
  tutorStep: 2, tutorDist: 0, tutorT: 0, // first-run tutorial (0 move, 1 stop-to-throw, 2 done)
  vision: { kind: 0, x: 0, y: 0, t: 0, max: 0 }, // ambient hallucination visual
  visionCd: 12,
  weirdKind: '',      // '' | siren | blackout | possessed | window
  weirdT: 0,
  weirdMax: 0,
  weirdSeq: 0,
  sirenPulse: 0,
  blackoutPulse: 0,
  possessedX: 0,
  possessedY: 0,
  windowPulse: 0,
  ambulancePulse: 0,
  windX: 0,
  windY: 0,
  windowKillWarn: 0,
  horrorSeen: loadHorrorSeen(),
  // progression
  xp: 0, xpNext: 6, level: 1, upChoices: [], takenUpgrades: {},
};
