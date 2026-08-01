// BULLET HELL BOMZHARA - config / tuning.
// Engine constants (consumed by the reused render/context.js) + game balance.
// Same data-oriented stack as Bloodtread: SoA pools sized here, WebGL2 instance buffer.

// -- engine: instance renderer + loop (context.js + main loop read these) --
import { T } from './texts.js?v=20260801a';

export var INV_STRIDE = 12;          // floats per GL instance (matches context.js addInst layout)
export var STEP = 1 / 60;            // fixed sim timestep
export var MAX_STEPS = 4;            // max catch-up steps per frame
export var SPRITE_CELL = 112;        // (sprite-density grid; unused in the procedural build)
export var SPRITE_ANIM_CAP = 360;    // (unused; satisfies context.js import)
export var MAX_SHAKE_PX = 16;        // world-space camera shake amplitude
export var SHAKE_ENABLED = true;

// -- pool caps (SoA typed arrays allocated once in state.js) --
export var MAX_BULLETS = 1600;       // persistent vodka/blood shots (bounce until they hit something)
export var MAX_FOES = 320;           // the "evil" + belochka hallucinations share one pool
export var MAX_PARTS = 2200;         // particles (splatter, glints, smoke)
export var MAX_PICKUPS = 96;         // dropped bottles
export var MAX_PUDDLES = 64;         // burning vodka/glass puddles from bad upgrades

// total GL instances per frame (generous; ~575KB buffer)
export var MAX_INST = 12000;

// -- arena (single screen, walls bounce bullets). Inset from the viewport edges (px). --
export var ARENA_INSET = { top: 84, bottom: 36, side: 22 };

// -- balance knobs (one place; the "feel" lives here) --
export var BAL = {
  // player
  moveSpeed: 300,
  playerR: 20,
  maxHp: 10,               // BLOOD is a tiny desperate reserve (vs 100 vodka)
  maxVodka: 50,   // Tim 2026-07-03: half the old tank
  startVodka: 50,

  // firing (auto-fire; you cannot stop drinking-and-shooting)
  fireInterval: 0.46,      // s between thrown bottles at the start
  bulletSpeed: 520,
  bulletR: 7,
  bulletLife: 0,           // legacy: shots no longer time out
  bulletMaxBounce: 0,      // legacy: wall bounces no longer expire shots
  vodkaPerShot: 2.2,       // ammo cost per thrown bottle (~45 shots on a full bottle)
  aimJitterBase: 0.08,     // baseline shaking hands; ЯСНЫЙ ВЗГЛЯД improves this through player.up.steady
  aimJitterBelochka: 0.62,
  aimMissChance: 0.18,
  aimMissAngle: 0.30,
  bloodPerShot: 1,         // 1 blood per shot once vodka is dry -> ~9 desperate shots
  bloodFireRate: 0.25,     // blood cadence = 25% of normal: slow + labored, every drop counts
  bloodReserve: 1,         // NEVER fire the shot that would drop blood this low (no suicide-by-trigger)
  selfGraze: 1,            // blood lost if your OWN sloshed (bounced) shot clips you
  dmg: 26,

  // белочка (delirium): tracks your vodka/sanity. 0 calm .. 1 full madness = you lose. You go mad ONLY by
  // letting the bottle run LOW for too long - never while you are holding a healthy reserve.
  belochkaDanger: 0.5,     // vodka fraction below which the shakes start climbing (Tim 2026-07-03: half the bottle)
  belochkaCalm: 0.13,      // /s recede rate when above the danger line (scaled by how far above)
  belochkaLowVodka: 0.10,  // /s climb rate when bone-dry (scaled by how far below the danger line)
  belochkaPerPhantom: 0.022,// shooting a hallucination = losing your grip (kept low so the spiral is recoverable)
  belochkaKillCalm: 0.03,  // killing something REAL steadies your hands
  drinkRestoresVodka: 36,
  // drops from REAL kills + the закуска heal
  vodkaDropChance: 0.28,   // uncommon: a bottle (ammo + sanity)
  zakuskaDropChance: 0.07, // rare: a snack (heals blood) - keeps blood precious
  healBlood: 2,            // blood restored per закуска (out of 10 - never a full heal)
  zakuskaCalm: 0.06,       // eating sobers you a touch (small белочка dip)
  vodkaPickupXp: 1.15,     // collecting vodka also pushes the bad-upgrade ritual forward
  zakuskaPickupXp: 0.55,

  // abilities / bad upgrades
  molotovEvery: 9,         // every N vodka shots becomes a fire bottle per stack
  molotovRadius: 74,
  molotovLife: 4.8,
  molotovDps: 34,
  molotovSelfGraze: 0.55,  // fire burns you slowly and can finish you if you stand in it
  ricochetSeek: 1.65,      // homing bend strength after first wall bounce
  shieldBlastDmg: 8,
  shieldBlastPush: 430,
  ambulanceSkip: 6,
  ambulanceSpawnKick: 4,
  tapokSpawnFirst: 7.5,
  tapokSpawnEveryMin: 22,
  tapokSpawnEveryRand: 10,
  tapokArmTime: 10,
  tapokPickupR: 34,
  tapokSafeRadius: 98,
  tapokBlastRadius: 176,
  tapokBlastDamage: 30,
  tapokBlastPush: 660,

  // enemies
  foeR: 19,
  hallucEvery: 2.4,        // s between belochka hallucinations (scales with белочка)
  // progression
  xpFirst: 6,              // kills for the first level-up
  xpGrow: 1.4,             // xpNext multiplier each level
  lifestealHeal: 0.5,      // blood healed per kill per LIFESTEAL stack
  // difficulty ramp (harder over the run)
  spawnEvery0: 1.3,        // starting seconds between spawns
  spawnEveryMin: 0.42,     // floor
  spawnRamp: 0.012,        // /s reduction
  multiSpawnAt: 25,        // s after which spawns come in pairs, then triples
  spawnPlayerSideChance: 0.66, // anti-corner-camp: real spawns usually enter from the player's nearest edge
  shadowHallucEveryMin: 5.4,
  shadowHallucEveryRand: 3.4,
  shadowHallucWaveLead: 0.55,
  // ambient roamers in the snow outside the building: sparse, aimless, never path to the player
  wanderMax: 3,
  wanderFirst: 6,
  wanderEveryMin: 9,
  wanderEveryRand: 8,
  wanderSpeedMul: 0.34,
};

// THE BESTIARY: the bomzh loves VODKA only. Every OTHER drink is a demon coming for him.
// unlockT = seconds into the run before this booze starts showing up.
export var BOOZE = [
  { id: 'beer',  ru: 'пиво',       hp: 38,  sp: 82,  r: 16, touch: 1,   col: [0.85, 0.62, 0.15], xp: 1, split: 0, unlockT: 0 },
  { id: 'wine',  ru: 'вино',       hp: 78,  sp: 72,  r: 18, touch: 1.5, col: [0.55, 0.07, 0.22], xp: 2, split: 0, unlockT: 12 },
  { id: 'champ', ru: 'шампанское', hp: 30,  sp: 140, r: 14, touch: 1,   col: [0.74, 0.78, 0.38], xp: 2, split: 2, unlockT: 20 },
  { id: 'cognac',ru: 'коньяк',     hp: 190, sp: 40,  r: 25, touch: 2.5, col: [0.5, 0.27, 0.08],  xp: 4, split: 0, unlockT: 32 },
];

// vodka-flavoured roguelite upgrades (applied to player.up on level-up).
// Names/descriptions live in texts.js (T.upgrades[id]); ids are stable for logic checks.
export var UPGRADES = [
  { id: 'shots', ru: T.upgrades.shots.name, de: T.upgrades.shots.desc, fn: function (u) { u.shots += 1; } },
  { id: 'fireRate', ru: T.upgrades.fireRate.name, de: T.upgrades.fireRate.desc, fn: function (u) { u.fireMul *= 1.25; } },
  { id: 'ricochet', ru: T.upgrades.ricochet.name, de: T.upgrades.ricochet.desc, fn: function (u) { u.bounce += 1; } },
  { id: 'damage', ru: T.upgrades.damage.name, de: T.upgrades.damage.desc, fn: function (u) { u.dmgMul *= 1.3; } },
  { id: 'vodkaMax', ru: T.upgrades.vodkaMax.name, de: T.upgrades.vodkaMax.desc, fn: function (u) { u.vodkaMax += 40; } },
  { id: 'lifesteal', ru: T.upgrades.lifesteal.name, de: T.upgrades.lifesteal.desc, fn: function (u) { u.lifesteal += 1; } },
  { id: 'speed', ru: T.upgrades.speed.name, de: T.upgrades.speed.desc, fn: function (u) { u.speedMul *= 1.18; } },
  { id: 'pierce', ru: T.upgrades.pierce.name, de: T.upgrades.pierce.desc, fn: function (u) { u.pierce = true; } },
  { id: 'crossed', ru: T.upgrades.crossed.name, de: T.upgrades.crossed.desc, fn: function (u) { u.blessed = (u.blessed || 0) + 1; } },
  { id: 'steady', ru: T.upgrades.steady.name, de: T.upgrades.steady.desc, fn: function (u) { u.steady *= 0.6; } },
  { id: 'molotov', ru: T.upgrades.molotov.name, de: T.upgrades.molotov.desc, fn: function (u) { u.molotov += 1; } },
  { id: 'seek', ru: T.upgrades.seek.name, de: T.upgrades.seek.desc, fn: function (u) { u.ricochetSeek += 1; } },
  { id: 'shield', ru: T.upgrades.shield.name, de: T.upgrades.shield.desc, fn: function (u) { u.shieldMax += 1; } },
  { id: 'ambulance', ru: T.upgrades.ambulance.name, de: T.upgrades.ambulance.desc, fn: function (u) { u.ambulance += 1; } },
  { id: 'wisdom', ru: T.upgrades.wisdom.name, de: T.upgrades.wisdom.desc, fn: function (u) { u.wisdom += 1; } },
];
