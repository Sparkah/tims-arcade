// Centralized mutable game state: the structure-of-arrays pools + run/player singletons.
// RULES: every pool is a STABLE exported object - its typed arrays are allocated once at boot and
// NEVER reassigned (reset by zeroing .count / .fill(0)), so GL buffers + V8 hidden classes stay stable.
// Counts live as `.count` on the object (importers can mutate object properties, not bindings).
import {
  MAX_ENEMIES, MAX_BULLETS, MAX_EBULLETS, MAX_FLOATS, MAX_MOTES, MAX_PARTS, MAX_DECALS, MAX_GORE,
  MAX_SPLATS, MAX_BOOMS, MAX_BUBBLES, MAX_VEINS, MAX_LEECHES, CORPSE_CAP, TRACK_CAP
} from './config.js?v=bm9';
import { OLD_SPRITES } from './flags.js?v=bm9';
import { T_NAME } from './data/enemies.js?v=bm9';
import { upgradeNames } from './data/upgrades.js?v=bm9';

// -- enemies --
export var enemies = {
  x: new Float32Array(MAX_ENEMIES), y: new Float32Array(MAX_ENEMIES),
  vx: new Float32Array(MAX_ENEMIES), vy: new Float32Array(MAX_ENEMIES),
  hp: new Float32Array(MAX_ENEMIES), r: new Float32Array(MAX_ENEMIES),
  spd: new Float32Array(MAX_ENEMIES), phase: new Float32Array(MAX_ENEMIES),
  face: new Float32Array(MAX_ENEMIES), cd: new Float32Array(MAX_ENEMIES),
  aim: new Float32Array(MAX_ENEMIES),   // ranged-foe telegraph aim (Spitter): set to face during the fire wind-up, else -99
  mspd: new Float32Array(MAX_ENEMIES),  // per-frame locomotion speed (px/s, |new-old|/dt), written each tick in updateEnemies - read at render time so a near-stationary creature can alternate idle<->attack instead of freezing on one look
  type: new Uint8Array(MAX_ENEMIES),
  count: 0
};

// -- player bullets -- (row/tier index the per-weapon projectile sprite atlas)
export var bullets = {
  x: new Float32Array(MAX_BULLETS), y: new Float32Array(MAX_BULLETS),
  vx: new Float32Array(MAX_BULLETS), vy: new Float32Array(MAX_BULLETS),
  life: new Float32Array(MAX_BULLETS), dmg: new Float32Array(MAX_BULLETS),
  kind: new Uint8Array(MAX_BULLETS), row: new Uint8Array(MAX_BULLETS),
  tier: new Uint8Array(MAX_BULLETS), rad: new Float32Array(MAX_BULLETS),
  count: 0
};

// -- enemy projectiles -- (Spitter bolts; life-limited, damage the tank on contact)
// cursor advances per full-pool overwrite so bolts fired on the SAME tick land in DISTINCT slots (a 3-shot
// spread doesn't collapse onto one slot when count is pinned at MAX).
export var ebullets = {
  x: new Float32Array(MAX_EBULLETS), y: new Float32Array(MAX_EBULLETS),
  vx: new Float32Array(MAX_EBULLETS), vy: new Float32Array(MAX_EBULLETS),
  life: new Float32Array(MAX_EBULLETS), dmg: new Float32Array(MAX_EBULLETS),
  count: 0, cursor: 0
};

// -- floating "+N" heal numbers -- (HUD-only batch pool; healAccum coalesces sub-1 gains before a float)
export var floats = {
  amt: new Float32Array(MAX_FLOATS), y: new Float32Array(MAX_FLOATS),
  life: new Float32Array(MAX_FLOATS), count: 0, healAccum: 0
};

// -- XP motes -- (age/phase drive the float bob; merge tracks mote-merge growth)
export var motes = {
  x: new Float32Array(MAX_MOTES), y: new Float32Array(MAX_MOTES),
  vx: new Float32Array(MAX_MOTES), vy: new Float32Array(MAX_MOTES),
  val: new Float32Array(MAX_MOTES), age: new Float32Array(MAX_MOTES),
  phase: new Float32Array(MAX_MOTES), merge: new Float32Array(MAX_MOTES),
  count: 0
};

// -- particles --
export var particles = {
  x: new Float32Array(MAX_PARTS), y: new Float32Array(MAX_PARTS),
  vx: new Float32Array(MAX_PARTS), vy: new Float32Array(MAX_PARTS),
  r: new Float32Array(MAX_PARTS), life: new Float32Array(MAX_PARTS),
  max: new Float32Array(MAX_PARTS), col: new Uint8Array(MAX_PARTS),
  count: 0, cursor: 0
};

// -- ground decals --
export var decals = {
  x: new Float32Array(MAX_DECALS), y: new Float32Array(MAX_DECALS),
  r: new Float32Array(MAX_DECALS), a: new Float32Array(MAX_DECALS),
  col: new Uint8Array(MAX_DECALS), count: 0, cursor: 0
};

// -- flying gore --
export var gore = {
  x: new Float32Array(MAX_GORE || 1), y: new Float32Array(MAX_GORE || 1),
  vx: new Float32Array(MAX_GORE || 1), vy: new Float32Array(MAX_GORE || 1),
  r: new Float32Array(MAX_GORE || 1), life: new Float32Array(MAX_GORE || 1),
  max: new Float32Array(MAX_GORE || 1), a: new Float32Array(MAX_GORE || 1),
  spin: new Float32Array(MAX_GORE || 1), kind: new Uint8Array(MAX_GORE || 1),
  count: 0, cursor: 0
};

// -- blood splats --
export var splats = {
  x: new Float32Array(MAX_SPLATS || 1), y: new Float32Array(MAX_SPLATS || 1),
  r: new Float32Array(MAX_SPLATS || 1), life: new Float32Array(MAX_SPLATS || 1),
  max: new Float32Array(MAX_SPLATS || 1), ang: new Float32Array(MAX_SPLATS || 1),
  vary: new Float32Array(MAX_SPLATS || 1), kind: new Uint8Array(MAX_SPLATS || 1),
  count: 0, cursor: 0
};

// -- booms (explosions) --
export var booms = {
  x: new Float32Array(MAX_BOOMS || 1), y: new Float32Array(MAX_BOOMS || 1),
  r: new Float32Array(MAX_BOOMS || 1), t: new Float32Array(MAX_BOOMS || 1),
  max: new Float32Array(MAX_BOOMS || 1), kind: new Uint8Array(MAX_BOOMS || 1),
  count: 0, cursor: 0
};

// -- blood bubbles --
export var bubbles = {
  x: new Float32Array(MAX_BUBBLES || 1), y: new Float32Array(MAX_BUBBLES || 1),
  vx: new Float32Array(MAX_BUBBLES || 1), vy: new Float32Array(MAX_BUBBLES || 1),
  r: new Float32Array(MAX_BUBBLES || 1), t: new Float32Array(MAX_BUBBLES || 1),
  max: new Float32Array(MAX_BUBBLES || 1), count: 0, cursor: 0
};

// -- corpses --
export var corpses = {
  x: new Float32Array(CORPSE_CAP || 1), y: new Float32Array(CORPSE_CAP || 1),
  r: new Float32Array(CORPSE_CAP || 1), t: new Float32Array(CORPSE_CAP || 1),
  face: new Int8Array(CORPSE_CAP || 1), type: new Uint8Array(CORPSE_CAP || 1),
  count: 0, cursor: 0
};

// -- tread tracks --
export var tracks = {
  x: new Float32Array(TRACK_CAP), y: new Float32Array(TRACK_CAP),
  a: new Float32Array(TRACK_CAP), life: new Float32Array(TRACK_CAP),
  count: 0, cursor: 0, acc: 0
};

// -- vein trails -- (unleashTrailAcc accumulates the rage-burst spawn cadence)
export var veins = {
  x: new Float32Array(MAX_VEINS || 1), y: new Float32Array(MAX_VEINS || 1),
  a: new Float32Array(MAX_VEINS || 1), len: new Float32Array(MAX_VEINS || 1),
  curl: new Float32Array(MAX_VEINS || 1), grow: new Float32Array(MAX_VEINS || 1),
  life: new Float32Array(MAX_VEINS || 1),
  b1a: new Float32Array(MAX_VEINS || 1), b1l: new Float32Array(MAX_VEINS || 1),
  b2a: new Float32Array(MAX_VEINS || 1), b2l: new Float32Array(MAX_VEINS || 1),
  count: 0, cursor: 0, acc: 0, unleashAcc: 0
};

// -- tank turret debris (DEATH) -- the turret tears off the dying tank, arcs away (vx/vy in the world plane),
// rises + falls on a visual height `z` (vz under gravity `g`), spinning (`spin`/`spinV`), then EXPLODES on
// landing (z<=0) and goes dormant. A SINGLE piece (the gun), so plain scalars (alloc-free) rather than a pool.
// `active` gates the advance in update.js (only during the death window) + the render in render/world.js.
// `cell`/`row` snapshot the equipped-weapon atlas cell at death so the flying piece is the SAME turret that
// was on the tank. `exploded` latches the one-shot landing detonation. Reset in game/session.js resetGame.
export var tankDebris = {
  active: false, x: 0, y: 0, vx: 0, vy: 0, z: 0, vz: 0, spin: 0, spinV: 0, t: 0,
  exploded: false, cell: 0, row: 0, size: 96
};

// -- leech tendrils -- (mark is Uint16Array per original; token starts at 1; init matches the IIFE)
export var leeches = {
  target: new Int32Array(MAX_LEECHES || 1), grab: new Float32Array(MAX_LEECHES || 1),
  phase: new Float32Array(MAX_LEECHES || 1), mark: new Uint16Array(MAX_ENEMIES),
  token: 1
};
for (var _li = 0; _li < leeches.target.length; _li++) { leeches.target[_li] = -1; leeches.phase[_li] = _li * 1.731; }

// -- rock contact-shadow scratch buffer --
export var ROCK_VIS_CAP = 64;
export var rockVis = {
  x: new Float32Array(ROCK_VIS_CAP), y: new Float32Array(ROCK_VIS_CAP),
  r: new Float32Array(ROCK_VIS_CAP), hurt: new Float32Array(ROCK_VIS_CAP),
  count: 0
};

// -- player / run singletons --
// FIRE MODEL (balance.js BALANCE.weapon): interval = baseInterval / (1 + asBonus); dmg = baseDmg * (1 + dmgBonus).
//  - baseInterval / baseDmg are the L1 anchors (research slow start: 2.0 s/shot, 4 dmg = ~3 hits/grunt).
//  - asBonus / dmgBonus are ADDITIVE pools: fire-rate/damage PICKS add to them (progress.js) AND meta tiers add
//    to them (player.js applyMetaToPlayer), so picks + permanent meta compose linearly (no runaway multiply).
//  - dmg / fireRate are DERIVED convenience mirrors recomputed by recomputeWeaponStats (player.js): dmg =
//    baseDmg*(1+dmgBonus), fireRate = (1+asBonus)/baseInterval (= equivalent shots/s, used by the laser DPS model
//    + the HUD). Systems read baseInterval/asBonus/baseDmg/dmgBonus directly for cadence; dmg/fireRate are reads.
export var player = {
  x: 0, y: 0, vx: 0, vy: 0, hull: 0, turret: 0,
  r: 25, hp: 42, maxHp: 42, xp: 0, xpNext: 5, level: 1,
  speed: 205, crush: 9, crushDps: 48, dmg: 4, fireRate: 0.5,
  baseInterval: 2.0, baseDmg: 4, asBonus: 0, dmgBonus: 0,   // the additive fire model (above); seeded from BALANCE each run
  pickR: 135, thirst: 0, rangedHeal: false, barrels: 1, lashLvl: 0,
  regen: 0, frenzyMul: 1, meter: 0, unleash: 0, unleashFlash: 0, recoil: 0, hurt: 0,
  healGlow: 0, dead: false
};

export var state = {
  mode: 'MENU',
  t: 0,
  tick: 1,
  tankBeat: 0,   // monotonic HEART-BEAT clock for the tank's vein-flow + pulse (Feature C, ported from the webgl build):
                 // advanced in update.js by tankBeatRate so the tank throbs FASTER at low HP. Drives the vein brightness
                 // pulse + flowing blood beads + breathing aura AND the exposed-heart pulse (render/world.js). Separate
                 // from state.t (steady wall-clock) so the heartbeat speeds up under stress - and STOPS on death (R3).
  tankBeatRate: 2.4,   // current beat speed (rad/s). Alive = lerp(2.4, 7.5, 1-hpf) (faster at low HP). On DEATH it EASES
                       // to 0 over ~0.5s so the exposed heart visibly SLOWS then STOPS beating (not a jarring freeze).
  // -- RESURRECT (once-per-session rewarded-ad revive) ----------------------------------------------------------
  // After the ~3.5s death bleed-out plays out, IF a resurrect is still available this session, a "RESURRECT -
  // WATCH AD" prompt shows for reviveT seconds; taking it (a rewarded ad, stubbed in this build) runs the
  // reverse-assembly then continues the run (HP restored, level/upgrades kept, all enemies cleared). Phases:
  //   'none'       - not in a revive flow (alive, or already gone to GAMEOVER)
  //   'prompt'     - death anim done, button showing, reviveT counting down -> GAMEOVER at 0 if not taken
  //   'assembling' - reward taken, the reverse-assembly is playing (assembleT), then the run resumes
  revivePhase: 'none',
  reviveT: 0,            // prompt-window countdown (s); GAMEOVER when it reaches 0 untaken
  reviveMax: 7,          // prompt window length (s)
  assembleT: 0,          // reverse-assembly countdown (s) while revivePhase==='assembling'
  assembleMax: 1.0,      // reverse-assembly length (s)
  reviveAvailable: true, // ONCE PER SESSION: true until a resurrect is consumed. MODULE/SESSION scoped - NOT
                         // reset by resetGame (survives the continue + later runs this page-load) + NOT persisted
                         // (a page reload restores it). After it's used, the prompt never shows again this session.
  kills: 0,
  blood: 0,
  spawnCredit: 0,
  fireCd: 0,
  banner: '',
  bannerT: 0,
  paused: false,
  gameOverT: 0,
  deathT: 0,
  runBanked: false,
  analyticsLossSent: false,
  analyticsWinSent: false,   // WIN telemetry latch (mirrors analyticsLossSent: fired once per run)
  milestonesFired: 0,        // bitmask of minute milestones (1,3,5,10,15,20) already emitted THIS run
  runCheated: false,         // run started or jumped via skip-to-minute -> excluded from ALL GA funnel events (clean denominator)
  forceType: -1,             // DEV-ONLY enemy-wave override (CHEATS_ENABLED): >=0 forces EVERY spawn to that type so a
                             //   single-type wave can be reviewed; -1 = normal mixed spawn (chooseType). resetGame -> -1. No-op in production.
  map: 1,                    // CURRENT map (1 = the original blood-red hellground). CONTINUE on the WIN screen -> map+1 + a FRESH
                             //   20:00 run (clock reset, enemies cleared), harder + a shifted ground palette. Endless map-progression.
                             //   Reset to 1 by a genuine fresh run (resetGame); CARRIED ACROSS the Continue restart (game/session.js).
  mapReachedFired: 0,        // bitmask of map indices (2..N) whose Run:MapReached design event already fired (one-shot per session)
  runId: ''
};

// WIN target: survive 20:00 (1200s) to trigger the victory state (the run is endless until then). EACH map is
// another 20:00 survival run; CONTINUE advances state.map and re-arms the same threshold (see game/session.js
// continueToNextMap + the per-map palette/difficulty helpers in render/world.js, systems/shared.js, systems/enemies.js).
export var WIN_SECONDS = 1200;

// Victory-screen outbound link. Repointed 2026-06-25 from a buymeacoffee PLACEHOLDER to Tim's arcade (a player
// who WON gets sent to more of his games). Swap to a real buymeacoffee/support URL here if Tim wants tipping.
export var COFFEE_URL = 'https://game-factory.tech';
// localStorage flag set when the player taps "Register interest" on the victory screen (read by the screen
// to render the persistent "Thanks - noted" state on a return visit).
export var SAVE_INTEREST = 'bloodtread_rebuild_interest';

// -- laser beam state --
export var laser = { t: 0, x0: 0, y0: 0, x1: 0, y1: 0, burstT: 0, burstMax: 0 };

// -- display / input / asset singletons (mutated by input + render + asset loaders) --
// view carries the camera metrics (cameraZoom + worldspace viewport) computed in updateCameraMetrics.
// shake = 0..1 trauma scalar for the combat-juice camera shake: triggers add (addTrauma, render/camera.js),
// the sim step (update.js) decays it, and worldToScreenX/Y fold the resulting jitter into the WORLD transform
// only (the HUD reads raw cssW/cssH so it never moves). Alloc-free scalar; see config.js MAX_SHAKE_PX.
export var view = { cssW: 1, cssH: 1, dpr: 1, viewW: 1, viewH: 1, cameraZoom: 1, viewWorldW: 1, viewWorldH: 1, shake: 0 };
export var input = {
  keys: new Uint8Array(256), pointerDown: false, pointerX: 0, pointerY: 0, pointerId: -1,
  useJoystick: false, joyActive: false, joyId: -1,
  joyBaseX: 0, joyBaseY: 0, joyKnobX: 0, joyKnobY: 0, joyDX: 0, joyDY: 0, joyRadius: 66
};
export var sprites = { images: Object.create(null), textures: Object.create(null), meta: Object.create(null), pending: 0, loaded: 0, ready: !OLD_SPRITES };
export var hudImages = Object.create(null);   // HUD/menu images (hero cover + upgrade icons), separate from the sprite atlas

// -- economy / meta-progression (mutated by input/economy, read by render, saved by persistence) --
// Reassigned primitives live as object props; META/ownedWeapons/weaponMeta are mutated-in-place objects.
export var META = { armor: 0, core: 0, cannon: 0, treads: 0, thirst: 0, frenzy: 0 };
export var econ = {
  totalBank: 0, bestTime: 0, equipWeapon: 'cannon', ownedWeapons: { cannon: 1 }, selectedTrack: 'armor',
  weaponMeta: { cannon: 0, flak: 0, laser: 0, missile: 0 },
  tankArmor: 0, tankCore: 0, tankCannon: 0, tankTreads: 0, tankThirst: 0, tankFrenzy: 0,
  // -- GORE CACHE (gacha) layer: all soft/earned, persisted by persistence.js + cloud-synced in TG mode.
  // Mutated by systems/loot.js (rolls/grants/equip), read by ui/screens.js (vault) + render/world.js (skin).
  caches: 0,                       // unopened Gore Caches
  pity: 0,                         // opens since the last CORE+ (forces a CORE+ at PITY_HARD)
  shards: 0,                       // dupe-refund currency (deterministic shard shop)
  ownedSkins: { default: 1 },      // id -> 1 for owned cosmetic hull skins ('default' free)
  equipSkin: 'default',            // currently worn skin id (render tint)
  ownedRelics: {},                 // id -> 1 for owned relics (dupes refund shards, never stack)
  equipRelics: [],                 // equipped relic ids (<= RELIC_SLOTS); applied to the player at run start
  consumables: {},                 // id -> count of owned one-shot next-run buffs
  gear: {                          // GEAR merge-collection (replaces relics): slotId -> counts by tier [common..primordial]
    hull:   [0, 0, 0, 0, 0, 0, 0],
    cannon: [0, 0, 0, 0, 0, 0, 0],
    treads: [0, 0, 0, 0, 0, 0, 0],
    core:   [0, 0, 0, 0, 0, 0, 0],
    nerves: [0, 0, 0, 0, 0, 0, 0]
  },
  boughtOnce: {},                  // STORE one-time-purchase ids already bought (apex predator, bounty crate)
  redeemedPulls: [],               // payloads of gacha pulls already redeemed (cross-device double-roll guard; capped 80, cloud-synced)
  lastDaily: '',                   // YYYY-MM-DD of the last daily-cache claim
  streak: 0                        // consecutive daily-claim days (a 2nd cache every 7th)
};

// -- run-progression / level-up draft (in-place typed arrays + the reassigned hover index) --
export var seenType = new Uint8Array(T_NAME.length);
export var upgradePick = new Int8Array(3);
export var upgradeRollPool = new Int8Array(upgradeNames.length);
export var upgradeCounts = new Uint16Array(upgradeNames.length);
export var upgradeRect = new Float32Array(12);
export var ui = { upgradeHover: -1 };

// -- UI hit-rects (reassigned each draw; null until first menu/shop/cheat/gameover render) --
export var rects = {
  play: null, forge: null, cheat: null, retry: null, menu: null,
  shopBack: null, cheatBack: null, cheatMax: null, cheatMoney: null, cheatReset: null, cheatMin9: null,
  resume: null, quit: null, hudPause: null, hudMenu: null, pauseForge: null,
  win_continue: null, win_interest: null, win_coffee: null,
  revive: null,
  // GORE VAULT (gacha) hit-rects: the menu/gameover entry button + the vault screen + the reveal CLAIM.
  vault: null, vaultOpen: null, vaultBack: null, vaultClaim: null, vaultShard: null, vaultStore: null,
  vaultSkins: [], vaultRelics: [], vaultGear: [], store: [], storeBack: null,
  shop: [], weapons: []
};
