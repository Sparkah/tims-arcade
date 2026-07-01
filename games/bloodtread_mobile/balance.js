// =============================================================================================
// balance.js - THE SINGLE SOURCE OF TRUTH for every gameplay tuning knob (Bloodtread rebuild).
// =============================================================================================
// WHY this file exists: the designer (Tim) hated the old balance - the turret fired crazy-fast and
// instant-killed enemies from the START, with no arc. We researched the survivors-like genre
// (Vampire Survivors, Brotato, 20 Minutes Till Dawn) and adopted the research-recommended SLOW-START,
// COUNT-DRIVEN curve: you begin weak and deliberate (~2s/shot, ~3 hits to kill a grunt) and GROW into
// a screen-clearing spray as you take fire-rate + damage picks and stack permanent meta tiers across
// runs. Difficulty is carried by ENEMY COUNT, not sponge HP - a grunt stays 3-5 hits the whole run.
//
// HOW it's used: every gameplay system READS from this BALANCE object instead of hard-coded constants
// (combat fire model, player base stats, enemy HP/contact curves, spawn count curve, XP curve, meta
// tiers). In production the BAKED defaults below ship as-is. In `?tune` mode a published Google Sheet
// CSV is fetched at boot and deep-path keys (e.g. `weapon.baseInterval`, `enemies.grunt.baseHP`)
// override matching knobs BEFORE the first run - so Tim retunes live by editing a spreadsheet and
// reloading. See BALANCE.md for the full knob reference + the step-by-step Sheets wiring.
//
// THE TARGET CURVES (the contract this file encodes):
//  - FIRE:  interval = baseInterval / (1 + asBonus). Base 2.0 s/shot (0.5 shots/s) at L1. Each fire-rate
//           pick = +20% asBonus ADDITIVE. Cap asBonus at +400% (5x -> 0.40 s/shot = the late "spray").
//           NEVER subtract seconds linearly (that hits zero). Other weapons keep their RELATIVE cadence
//           under the same base-interval model (flak/missile slower multiples, laser keeps its burst).
//  - DAMAGE: base 4 (a 10-HP grunt = ~3 hits at start). Each damage pick = +25% additive on a damage
//            multiplier: dmg = baseDmg * (1 + sumDmgBonus). Late game reaches ~20-28.
//  - DPS arc: ~2 DPS start -> ~8 mid -> ~42 late (~20x swing) = the "starts working crazy" payoff.
//  - ENEMY HP: LINEAR per minute. HP(min) = baseHP * (1 + hpPerMinute*min). Grunt base 10, +6/min.
//              A grunt stays 3-5 hits-to-kill the WHOLE run (COUNT carries difficulty, not HP).
//  - ENEMY CONTACT DMG: scales SLOWER than HP (~2.4x asymmetry): dmg(min) = base * (1 + 0.25*min).
//              Late game is a DPS race, not getting one-shot.
//  - ENEMY COUNT (the PRIMARY difficulty lever): on-screen target ramps ~6-10 @0min -> 15 @1 -> 35 @3
//              -> 55 @5 -> 90 @10 -> 120 @15 -> 150 @20 (alive-cap ~150-200).
//  - LEVEL-UP CADENCE: fast early. XP-to-next = 5 + 8*(level-1). ~6-8 picks in the first 2-3 min.
//  - META tiers (permanent between runs): stack ON TOP additively (~+5-10% per tier per stat) so a
//              maxed returning player starts meaningfully stronger.
//
// IMPORTANT: this module is a LEAF (depends on nothing in the sim) so any system can import it without
// a cycle. Knobs are plain numbers/arrays on a single mutable object; `applyBalanceOverrides` mutates
// them in place BEFORE the first run, so importers that read BALANCE.x at call-time see the tuned value.

// Default published-CSV URL. EMPTY = no sheet wired yet (production bakes the defaults below). Tim pastes
// his "Publish to web -> CSV" link here, or passes ?sheet=<url> at runtime to override per-load. Only
// fetched in ?tune mode (see flags.js TUNE_MODE + the boot tail in main.js). See BALANCE.md.
export var BALANCE_SHEET_URL = '';

export var BALANCE = {
  // -------------------------------------------------------------------------------------------
  // WEAPONS - the fire model. interval = baseInterval / (1 + asBonus); dmg = baseDmg * (1 + dmgBonus).
  // -------------------------------------------------------------------------------------------
  weapon: {
    baseInterval: 2.0,        // s/shot for the CANNON at L1 (0.5 shots/s) - the research "slow start". The
                              //   relative multiples below keep the heavier guns slower under this same model.
    asBonusPerPick: 0.20,     // +20% additive attack-speed bonus per RELOAD-GLAND pick (1+asBonus grows linearly)
    asBonusCap: 4.0,          // cap asBonus at +400% -> 5x speed -> 0.40 s/shot (the late-game "crazy spray")
    baseDmg: 4,               // base per-shot damage at L1 (a 10-HP grunt = ~3 hits). dmg = baseDmg*(1+dmgBonus).
    dmgBonusPerPick: 0.25,    // +25% additive damage bonus per HEAVY-CALIBER pick

    // FIRING RANGE (world units). The turret HOLDS FIRE when the nearest enemy is beyond this - the tank no
    // longer shoots constantly at far-off foes (Tim: "lets create some shooting range, it does not shoot if
    // enemies are outside of it"). The turret still TRACKS/aims; only bullet-spawn / the laser beam is gated.
    // Applies to ALL weapons. Default ~650 ~ the cannon bullet's actual reach (speed 720 * life 0.95 ~= 684),
    // so a held shot could genuinely have connected - i.e. we only fire when it would land near a target.
    range: 650,

    // RELATIVE cadence of the non-cannon weapons, expressed as a MULTIPLE of the cannon baseInterval, so the
    // whole roster shifts together when baseInterval is tuned. (Old code hard-coded flak 2.75/fireRate,
    // missile 3.8/fireRate - those ratios are preserved here against the 0.5 shots/s cannon baseline.)
    flakIntervalMul: 1.30,    // flak interval = baseInterval * 1.30 / (1+asBonus) - a slower, multi-pellet blast
    missileIntervalMul: 1.80, // missile interval = baseInterval * 1.80 / (1+asBonus) - the slowest, heaviest shot
    flakDmgMul: 0.44,         // per-pellet damage = dmg * 0.44 (5+ pellets, so the burst total is high)
    missileDmgMul: 1.65,      // per-missile damage = dmg * 1.65 (AoE explosion)
    // LASER keeps its sustained-burst model (it does NOT fire discrete shots). Its DPS is derived from the
    // SAME dmg + the equivalent shots/s of the base-interval model: dps = dmg * (shotsPerSec) * laserDpsMul,
    // where shotsPerSec = (1+asBonus)/baseInterval. So a fire-rate pick speeds the laser exactly as it speeds
    // the cannon, and a damage pick scales it identically. (Old code: player.dmg*player.fireRate*2.75.)
    laserDpsMul: 5.5,         // tuned so laser DPS tracks the cannon arc (cannon 0.5 shots/s * dmg vs beam)
    cannonProjectileSpeed: 720,
    flakProjectileSpeed: 560,   // + up to 190 jitter (kept from the original feel)
    missileProjectileSpeed: 420
  },

  // -------------------------------------------------------------------------------------------
  // PLAYER base stats (META tier 0, before any meta/upgrade stacking). These seed every fresh run.
  // -------------------------------------------------------------------------------------------
  player: {
    baseMaxHp: 4,             // FRAGILE start (Tim): ~0.7s of grunt contact = death; hull cushion is EARNED via the armor meta tier
    baseSpeed: 205,           // world px/s move speed at tier 0
    baseCrush: 9,             // crush REACH (px past the body) at tier 0
    baseCrushDps: 0,          // NO ram-kill at 0 upgrades (Tim): driving over enemies no longer kills them - crush is EARNED via the TREAD TEETH tier (crushDpsPerPick). NOTE: the unleash meter fills ONLY on crush-kills (enemies.js), so this also gates bloodletting behind that tier.
    basePickR: 135,           // XP-mote magnet radius at tier 0
    startXpNext: 5            // XP to reach level 2 (the XP curve below takes over from level 2+)
  },

  // -------------------------------------------------------------------------------------------
  // PROGRESSION - the XP curve + the per-pick magnitudes (small, compounding) + the meta-per-tier model.
  // -------------------------------------------------------------------------------------------
  progression: {
    // XP-to-next-level = xpBase + xpPerLevel*(level-1). Linear, FAST early (L1->2 = 5, ->3 = 13, ->4 = 21,
    // ...). ~6-8 picks in the first 2-3 min so the build comes online quickly. (Old code was a steeper
    // quadratic floor(6 + level*4 + level*level*0.35) which slowed the all-important early ramp.)
    xpBase: 5,
    xpPerLevel: 8,

    // Per-PICK magnitudes (the level-up cards). Fire-rate + damage are the ADDITIVE-bonus picks above
    // (asBonusPerPick / dmgBonusPerPick); the rest are small multiplicative/flat steps that compound.
    speedPerPick: 0.10,       // BOILER PRESSURE: +10% move speed (multiplicative)
    crushDpsPerPick: 0.22,    // TREAD TEETH: +22% crush dps
    crushReachPerPick: 6,     // TREAD TEETH: +6 px crush reach
    pickRPerPick: 0.30,       // VEIN NETWORK: +30% pickup range
    maxHpPerPick: 22,         // ARMOR PLATING: +22 max HP (and patch up to maxHpPatchCap)
    maxHpPatchCap: 30,        // ARMOR PLATING: heal up to this much of the new headroom on pick
    thirstPerPick: 4,         // THIRST: +4 heal-on-kill

    // META tiers (permanent, between runs). Each owned tier adds a FLAT additive bonus ON TOP of the base,
    // so a maxed returning player (6 tiers) starts meaningfully stronger WITHOUT runaway multiplication.
    // dmgBonus/asBonus tiers add into the SAME additive pools the picks use (so meta + picks compose linearly).
    metaDmgBonusPerTier: 0.10,   // +10% damage bonus per MAW-CANNON tier (additive into dmgBonus)
    metaAsBonusPerTier: 0.08,    // +8% attack-speed bonus per MAW-CANNON tier (additive into asBonus)
    metaHpPerTier: 28,           // +28 max HP per ARMOR tier
    metaSpeedPerTier: 0.06,      // +6% move speed per TREAD tier (multiplicative on baseSpeed)
    metaCrushDpsPerTier: 0.12,   // +12% crush dps per TREAD tier
    metaCrushReachPerTier: 3,    // +3 px crush reach per TREAD tier
    metaRegenPerTier: 0.6,       // +0.6 hp/s regen per BLOOD-CORE tier
    metaPickRPerTier: 10,        // +10 px pickup range per BLOOD-CORE tier
    metaThirstPerTier: 2,        // +2 heal-on-kill per THIRST tier
    metaCoreThirstPerTier: 0.5,  // +0.5 heal-on-kill per BLOOD-CORE tier (small thirst bleed-through)
    metaBarrelEveryTiers: 3,     // +1 cannon barrel per N MAW-CANNON tiers (tier 3 -> 1, tier 6 -> 2)
    metaLashEveryTiers: 3        // +1 leech-lash level per N BLOODLETTING tiers
  },

  // -------------------------------------------------------------------------------------------
  // ENEMIES - per-type base HP + per-minute LINEAR HP slope, plus the shared contact-damage curve.
  // -------------------------------------------------------------------------------------------
  // HP(min) = baseHP * (1 + hpPerMinute*min). Grunts ~10 base + ~0.6/min so a grunt is 3-5 hits the whole
  // run (count carries difficulty). Mid types are 20-40 base; elites have a higher base AND a steeper slope.
  // Keys map onto the 12-type roster (data/enemies.js order): Husk, Mite, Brute, Gorehound, Spitter, Hive,
  // Wisp, Detonator, Needle, Shellback, Leecher, Bombard.
  enemies: {
    husk:      { baseHP: 10,  hpPerMinute: 0.60 },  // 0  the baseline grunt (the "3 hits at start" reference)
    mite:      { baseHP: 7,   hpPerMinute: 0.55 },  // 1  fast swarm filler (1-2 hits)
    brute:     { baseHP: 34,  hpPerMinute: 0.75 },  // 2  slow mid-heavy (a few more hits, hits hard)
    gorehound: { baseHP: 18,  hpPerMinute: 0.65 },  // 3  charging mid
    spitter:   { baseHP: 22,  hpPerMinute: 0.65 },  // 4  ranged kiter (the only bolt-firer)
    hive:      { baseHP: 48,  hpPerMinute: 0.85 },  // 5  elite spawner (higher base + steeper slope)
    wisp:      { baseHP: 14,  hpPerMinute: 0.60 },  // 6  weaving light type
    detonator: { baseHP: 60,  hpPerMinute: 0.95 },  // 7  elite bomb (highest-tier, steep slope)
    needle:    { baseHP: 16,  hpPerMinute: 0.62 },  // 8  fast charging needle
    shellback: { baseHP: 56,  hpPerMinute: 0.90 },  // 9  armored elite (slow, very tanky base)
    leecher:   { baseHP: 26,  hpPerMinute: 0.68 },  // 10 mid drainer
    bombard:   { baseHP: 40,  hpPerMinute: 0.80 },  // 11 heavy wave-mover
    wraith:      { baseHP: 9,   hpPerMinute: 0.55 },  // 12 white small crawler (opens beside the green Mite; 1-2 hits)
    palecrawler: { baseHP: 30,  hpPerMinute: 0.72 },  // 13 white large crawler (opens; mid-heavy, a few hits)
    zombie:      { baseHP: 45,  hpPerMinute: 0.85 },  // 14 LPC pale shambler: slow + TANKY (between bombard 40 + shellback 56; steep slope), melee
    goblin:      { baseHP: 12,  hpPerMinute: 0.58 },  // 15 LPC green goblin: FAST light melee (2-3 hits, near a mite/needle)
    ravener:     { baseHP: 14,  hpPerMinute: 0.55 },  // 16 the HUNTER (Tim anti-kite): FASTEST type (T_SPD 168), light HP (2-3 hits) so it is a kill-or-be-caught threat, not a sponge - the swarm's speed-ramp lets it run the tank down

    // CONTACT DAMAGE - shared curve, intentionally SLOWER than HP (~2.4x asymmetry) so late game is a DPS
    // race, not a one-shot lottery. dmg(min) = (contactDmgBase + type*contactDmgTypeStep) * (1 + contactDmgSlope*min).
    // (Old code: (5.5 + type*1.7) * (1 + t*0.0035) - the type term is preserved; the slope is now per-MINUTE.)
    contactDmgBase: 5.5,         // base contact dmg/s for type 0 at minute 0
    contactDmgTypeStep: 1.7,     // + per type index (heavier types hit harder), matches the original spread
    contactDmgSlope: 0.25        // +25% per minute (vs HP's ~+60%/min on grunts -> the 2.4x asymmetry)
  },

  // -------------------------------------------------------------------------------------------
  // SPAWN - the on-screen COUNT curve (the PRIMARY difficulty lever) + the alive-cap + spawn cadence.
  // -------------------------------------------------------------------------------------------
  // The live target is a piecewise-LINEAR interpolation through these (minute, count) control points, so the
  // shape is exactly the researched ramp and trivially editable. desiredEnemies() reads these, multiplies by
  // the per-map mult, and clamps to aliveCap. (Old code was a quadratic 3 + t*0.10 + t*t*0.00045.)
  spawn: {
    // (minuteMark, onScreenTarget) control points - MUST be ascending by minute. Last point's value holds.
    // DENSITY PASS toward the PUBLISHED 198 feel (Tim 2026-06-24 "more game feel I like" - the 198 build is far
    // busier): 198 desired = min(190, Q, (6+elapsed*0.85)*surge) => ~57 @1min, ~82 @1.5, ~159 @3 (cap 190). Our
    // old slow-burn opened ~15 @1min / 35 @3 = visibly sparse next to 198. These points roughly DOUBLE the early-
    // mid field (where the sparseness was felt) and lift the late cap toward 198's 190, while keeping a modestly
    // deliberate OPEN (min 0 a touch fuller, not a wall - the slow-burn intent survives). The 1.6 camera zoom (vs
    // 198's wider effective view) makes a given alive-count read even DENSER on-screen here, so we don't need to
    // match 198's raw number 1:1 to match its on-screen busyness. Perf-trivial: the WebGL engine holds 1000+
    // (CODEMAP: 110-120fps @ ~1016 enemies); MAX_ENEMIES=1400, so the aliveCap is the only real limiter.
    // Steepened mid-late 2026-06-25 (Tim anti-kite lever 4 "ramp density by minute"): sparse opening kept (0-3min),
    // but 5min+ climbs harder so the late field is a genuine wall, not a manageable trickle. Pairs with speedRamp.
    countCurve: [
      // GENTLE OPEN (Tim 2026-07-01 "too hard from minute 0 - many spawn fast, I just lose"): start with 1
      // monster, +~1 every 5-10s through the first minute, so minute 1 reaches what minute 0 used to be (12).
      // Rejoins the prior ramp by minute 3 -> mid/late intensity UNCHANGED. The target rises slowly and the
      // field just tracks it (spawnRate refills, it does not front-load), so the opening is a real warm-up.
      [0, 1], [0.5, 5], [1, 12], [2, 38], [3, 72], [5, 110], [10, 175], [15, 215], [20, 255]
    ],
    aliveCap: 255,            // hard cap on simultaneously-alive enemies (200->255 with the steeper curve; still far inside MAX_ENEMIES 1400 + the ~1016-enemy/110fps perf budget)
    mobileAliveCap: 180,      // LOWER cap on TOUCH_DEVICE (Tim 2026-06-25 "optimise for mobile"): a phone GPU at 1.25 DPR can't hold the desktop 255 peak, so cap the perf-heavy COUNT on mobile while KEEPING all the anti-kite difficulty (speed-ramp + intercept spawning + the Ravener still apply - those are ~free). desiredEnemies (systems/shared.js) picks this when TOUCH_DEVICE. Still > the old 170; bump via the tune sheet after a real-device test.
    // ANTI-KITE knobs (Tim 2026-06-25). interceptFrac/Arc: spawnEnemy biases this SHARE of spawns into an arc of
    // +-interceptArc rad around the tank's heading (running forward runs you INTO them). speedRamp: updateEnemies
    // multiplies every enemy's speed by min(speedRampCap, 1 + speedRampPerMinute*minute) so the swarm closes the
    // gap late-game (the tank outruns every base T_SPD). All live-tunable via the sheet - dial by feel.
    interceptFrac: 0.5,       // fraction of spawns placed ahead of the tank's heading (rest stay uniform = still surrounded)
    interceptArc: 1.0,        // half-width (rad) of the ahead arc; 1.0 ~= a 114-degree cone of "dead ahead"
    speedRampPerMinute: 0.03, // +3% enemy move speed per minute...
    speedRampCap: 1.6,        // ...capped at +60% (by the cap, goblin 135*1.6=216 > tank base 205 = a real pursuer)
    // Spawn CADENCE: credits accrue per second and each credit spawns one enemy (up to the live target). A
    // higher rate refills a thinned field faster. rate = spawnRateBase + minute*spawnRatePerMinute. Bumped with
    // the count curve so the denser field actually FILLS quickly (and refills after a crush) instead of trickling
    // up to the higher target. 198 bursts 1+floor(elapsed/55) per ~0.1s tick; this keeps our refill ahead of kills.
    spawnRateBase: 10,       // enemies/sec the field can refill early (opens populated + refills a crushed gap fast)
    spawnRatePerMinute: 2.2  // + per minute, so late-game kills are replaced fast enough to hold the higher target
  }
};

// -- per-type key order matching the data/enemies.js roster (index = enemy type) -----------------
// Lets the enemy systems read BALANCE.enemies by type INDEX without re-stating the names everywhere.
export var ENEMY_KEYS = [
  'husk', 'mite', 'brute', 'gorehound', 'spitter', 'hive',
  'wisp', 'detonator', 'needle', 'shellback', 'leecher', 'bombard',
  'wraith', 'palecrawler', 'zombie', 'goblin', 'ravener'
];

// -- baked HP arrays derived from BALANCE.enemies (rebuilt by recomputeEnemyTables after any override) -------
// data/enemies.js + systems/enemies.js read these typed views so the hot spawn path stays alloc-free.
export var ENEMY_BASE_HP = new Float32Array(ENEMY_KEYS.length);
export var ENEMY_HP_PER_MIN = new Float32Array(ENEMY_KEYS.length);

export function recomputeEnemyTables() {
  for (var i = 0; i < ENEMY_KEYS.length; i++) {
    var e = BALANCE.enemies[ENEMY_KEYS[i]];
    ENEMY_BASE_HP[i] = e ? e.baseHP : 10;
    ENEMY_HP_PER_MIN[i] = e ? e.hpPerMinute : 0.6;
  }
}
recomputeEnemyTables();

// =============================================================================================
// Live curve helpers (read by the systems). All take MINUTE (state.t/60) and read BALANCE at call-time.
// =============================================================================================

// Enemy HP at a given minute for a type index: baseHP * (1 + hpPerMinute*min). LINEAR (count carries
// difficulty, not sponge HP). minute is clamped >= 0.
export function enemyHpAt(typeIndex, minute) {
  if (minute < 0) minute = 0;
  return ENEMY_BASE_HP[typeIndex] * (1 + ENEMY_HP_PER_MIN[typeIndex] * minute);
}

// Shared enemy contact damage/s at a given minute for a type index:
// (contactDmgBase + type*contactDmgTypeStep) * (1 + contactDmgSlope*minute). Slower-than-HP slope.
export function enemyContactDmgAt(typeIndex, minute) {
  if (minute < 0) minute = 0;
  var e = BALANCE.enemies;
  return (e.contactDmgBase + typeIndex * e.contactDmgTypeStep) * (1 + e.contactDmgSlope * minute);
}

// On-screen enemy target at a given minute = piecewise-linear interpolation through spawn.countCurve.
// Below the first point uses the first value; above the last point HOLDS the last value (no runaway).
export function spawnCountAt(minute) {
  if (minute < 0) minute = 0;
  var pts = BALANCE.spawn.countCurve;
  if (!pts || pts.length === 0) return 8;
  if (minute <= pts[0][0]) return pts[0][1];
  for (var i = 1; i < pts.length; i++) {
    if (minute <= pts[i][0]) {
      var m0 = pts[i - 1][0], v0 = pts[i - 1][1];
      var m1 = pts[i][0], v1 = pts[i][1];
      var f = (m1 - m0) > 0 ? (minute - m0) / (m1 - m0) : 0;
      return v0 + (v1 - v0) * f;
    }
  }
  return pts[pts.length - 1][1];   // past the last control point: hold the final value
}

// Spawn refill rate (enemies/sec) at a given minute: spawnRateBase + minute*spawnRatePerMinute.
export function spawnRateAt(minute) {
  if (minute < 0) minute = 0;
  return BALANCE.spawn.spawnRateBase + minute * BALANCE.spawn.spawnRatePerMinute;
}

// =============================================================================================
// TUNE MODE - published Google Sheet CSV override (NO API / NO auth). Parsed at boot in ?tune mode.
// =============================================================================================
// Status string surfaced in the debug overlay (render/hud.js) so a fetch failure is VISIBLE, never silent.
// '' = not attempted (production). 'loading' / 'ok N keys' / 'fail: <reason> (defaults)'.
export var tuneStatus = '';
export function setTuneStatus(s) { tuneStatus = s; }

// Parse a tiny CSV (key,value[,description]) into [{key,value}] rows. Tolerant: skips blank lines, a header
// row (`key,value...`), and quoted fields; ignores anything past the 2nd column (descriptions). Numbers are
// parsed where the value is numeric; everything else stays a string (so a future string knob still works).
export function parseBalanceCsv(text) {
  var out = [];
  if (!text) return out;
  var lines = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  for (var i = 0; i < lines.length; i++) {
    var raw = lines[i];
    if (!raw || !raw.trim()) continue;
    var cells = splitCsvLine(raw);
    if (cells.length < 2) continue;
    var key = cells[0].trim();
    var valRaw = cells[1].trim();
    if (!key) continue;
    if (key.toLowerCase() === 'key' && valRaw.toLowerCase() === 'value') continue;   // header row
    if (key.charAt(0) === '#') continue;                                             // comment row
    out.push({ key: key, value: valRaw });
  }
  return out;
}

// minimal CSV line splitter honoring double-quoted fields (so a description with a comma is safe)
function splitCsvLine(line) {
  var cells = [];
  var cur = '';
  var inQ = false;
  for (var i = 0; i < line.length; i++) {
    var c = line.charAt(i);
    if (inQ) {
      if (c === '"') {
        if (line.charAt(i + 1) === '"') { cur += '"'; i++; }   // escaped quote
        else inQ = false;
      } else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { cells.push(cur); cur = ''; }
      else cur += c;
    }
  }
  cells.push(cur);
  return cells;
}

// -- per-key SANE BOUNDS [min, max] (hardening #3) ------------------------------------------------------------
// A sheet value is clamped to its key's range on apply, so a typo like weapon.baseInterval=0 (which would make
// the fire cadence <=0 -> fire-every-frame, re-introducing the crazy-spray bug VIA the tuning tool) is forced
// back into a survivable window. Keys not listed get the DEFAULT_BOUND (a finite, non-absurd catch-all).
// Bounds use prefix matching for the per-type enemy HP keys (enemies.<type>.baseHP / .hpPerMinute) and the
// curve points (spawn.countCurve.<min>). Lower bounds on intervals/HP are STRICTLY POSITIVE.
var DEFAULT_BOUND = [-1e6, 1e6];
var KNOB_BOUNDS = {
  'weapon.baseInterval': [0.05, 20],        // STRICTLY positive (and >= the combat.js floor) - never 0/negative
  'weapon.asBonusPerPick': [0, 5],
  'weapon.asBonusCap': [0, 50],
  'weapon.baseDmg': [0.1, 1000],            // > 0 so a grunt is always killable in finite hits
  'weapon.dmgBonusPerPick': [0, 20],
  'weapon.range': [50, 100000],             // firing range (world units); >= 50 so the tank can always defend itself up close

  'weapon.flakIntervalMul': [0.05, 20],
  'weapon.missileIntervalMul': [0.05, 20],
  'weapon.flakDmgMul': [0, 50],
  'weapon.missileDmgMul': [0, 50],
  'weapon.laserDpsMul': [0, 100],
  'weapon.cannonProjectileSpeed': [1, 100000],
  'weapon.flakProjectileSpeed': [1, 100000],
  'weapon.missileProjectileSpeed': [1, 100000],
  'player.baseMaxHp': [1, 100000],
  'player.baseSpeed': [1, 100000],
  'player.baseCrush': [0, 10000],
  'player.baseCrushDps': [0, 100000],
  'player.basePickR': [1, 100000],
  'player.startXpNext': [1, 100000],
  'progression.xpBase': [1, 100000],
  'progression.xpPerLevel': [0, 100000],
  'progression.speedPerPick': [0, 100],
  'progression.crushDpsPerPick': [0, 100],
  'progression.crushReachPerPick': [0, 10000],
  'progression.pickRPerPick': [0, 100],
  'progression.maxHpPerPick': [0, 100000],
  'progression.maxHpPatchCap': [0, 100000],
  'progression.thirstPerPick': [0, 100000],
  'progression.metaDmgBonusPerTier': [0, 100],
  'progression.metaAsBonusPerTier': [0, 100],
  'progression.metaHpPerTier': [0, 100000],
  'progression.metaSpeedPerTier': [0, 100],
  'progression.metaCrushDpsPerTier': [0, 100],
  'progression.metaCrushReachPerTier': [0, 10000],
  'progression.metaRegenPerTier': [0, 100000],
  'progression.metaPickRPerTier': [0, 100000],
  'progression.metaThirstPerTier': [0, 100000],
  'progression.metaCoreThirstPerTier': [0, 100000],
  'progression.metaBarrelEveryTiers': [1, 100],     // divisor - never 0
  'progression.metaLashEveryTiers': [1, 100],       // divisor - never 0
  'enemies.contactDmgBase': [0, 100000],
  'enemies.contactDmgTypeStep': [0, 100000],
  'enemies.contactDmgSlope': [0, 1000],
  'spawn.aliveCap': [1, 100000],
  'spawn.mobileAliveCap': [1, 100000],
  'spawn.spawnRateBase': [0, 100000],
  'spawn.spawnRatePerMinute': [0, 100000],
  'spawn.interceptFrac': [0, 1],
  'spawn.interceptArc': [0, 3.15],
  'spawn.speedRampPerMinute': [0, 100],
  'spawn.speedRampCap': [1, 100]
};
function boundsFor(canonicalPath) {
  if (KNOB_BOUNDS[canonicalPath]) return KNOB_BOUNDS[canonicalPath];
  if (/^enemies\.[a-z]+\.baseHP$/.test(canonicalPath)) return [0.1, 1000000];      // per-type HP > 0 (always killable)
  if (/^enemies\.[a-z]+\.hpPerMinute$/.test(canonicalPath)) return [0, 100000];
  if (/^spawn\.countCurve\./.test(canonicalPath)) return [0, 100000];              // an on-screen count, clamped to MAX_ENEMIES downstream
  return DEFAULT_BOUND;
}

// Reject any path segment that could climb the prototype chain (hardening #1). NEVER let a sheet key touch
// __proto__ / constructor / prototype - those would let a crafted key (e.g. `__proto__.toString`) clobber
// Object.prototype for the whole page. Every segment of every path passes through this gate.
var FORBIDDEN_SEGMENTS = { '__proto__': 1, 'constructor': 1, 'prototype': 1 };
function hasForbiddenSegment(parts) {
  for (var i = 0; i < parts.length; i++) {
    if (Object.prototype.hasOwnProperty.call(FORBIDDEN_SEGMENTS, parts[i])) return true;
  }
  return false;
}
function ownProp(obj, key) {   // own-property check only (not `in`, which would let inherited props pass - hardening #1)
  return obj != null && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, key);
}
function clamp1(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

// VALIDATE a deep-path key WITHOUT mutating BALANCE. Returns a descriptor the apply step commits:
//   { kind:'number', target, leaf, value }            - a scalar numeric knob (clamped to its bounds)
//   { kind:'curve', minute, value }                   - a spawn.countCurve.<minute> point (clamped)
//   { kind:'reject', reason }                         - rejected (typo / forbidden / container / non-numeric / out-of-shape)
// Used by both applyBalanceKey (single) and applyBalanceOverrides (atomic batch) so the rules are identical.
// Hardening covered here: #1 prototype pollution (forbidden segments + own-prop walk), #2 container-key
// clobber (only NUMBER leaves are assignable - object/array leaves are rejected), #3 range validation+clamp
// (strict Number() + per-key min/max).
function validateBalanceKey(path, value) {
  if (!path) return { kind: 'reject', reason: 'empty-key' };
  var p = String(path).trim();
  // alias: the spec/sheet may say "grunt" for the baseline husk grunt
  p = p.replace(/^enemies\.grunt\./, 'enemies.husk.');
  var parts = p.split('.');
  if (hasForbiddenSegment(parts)) return { kind: 'reject', reason: 'forbidden-segment' };   // #1

  // SPECIAL: spawn.countCurve.<minute> - a curve POINT (not a plain leaf). Validated/clamped here, committed
  // (insert/update keeping the curve ascending) in commitBalanceDescriptor.
  var cm = p.match(/^spawn\.countCurve\.(-?\d+(?:\.\d+)?)$/);
  if (cm) {
    var minute = Number(cm[1]);
    var cv = Number(value);
    if (!isFinite(minute) || !isFinite(cv)) return { kind: 'reject', reason: 'non-numeric-curve' };   // #3 strict Number()
    var cb = boundsFor(p);
    return { kind: 'curve', minute: minute, value: clamp1(cv, cb[0], cb[1]) };
  }

  // walk to the container using OWN-property checks only (never create keys; never follow the prototype chain)
  var obj = BALANCE;
  for (var i = 0; i < parts.length - 1; i++) {
    if (!ownProp(obj, parts[i])) return { kind: 'reject', reason: 'no-such-path' };
    obj = obj[parts[i]];
  }
  var leaf = parts[parts.length - 1];
  if (!ownProp(obj, leaf)) return { kind: 'reject', reason: 'no-such-leaf' };
  var existing = obj[leaf];
  if (typeof existing !== 'number') return { kind: 'reject', reason: 'non-number-leaf' };   // #2 only numeric leaves are assignable (a container key like `weapon` / `spawn.countCurve` is an object/array -> rejected)
  var n = Number(value);                                                                    // #3 strict Number() (parseFloat would accept "0xyz")
  if (!isFinite(n)) return { kind: 'reject', reason: 'non-numeric-value' };
  var b = boundsFor(p);
  return { kind: 'number', target: obj, leaf: leaf, value: clamp1(n, b[0], b[1]) };
}

// COMMIT a validated descriptor (the ONLY place that mutates BALANCE from a sheet value). Returns true on a
// committed write. Pure mutation - all checks happened in validateBalanceKey.
function commitBalanceDescriptor(d) {
  if (!d || d.kind === 'reject') return false;
  if (d.kind === 'number') { d.target[d.leaf] = d.value; return true; }
  if (d.kind === 'curve') {
    var curve = BALANCE.spawn.countCurve;
    for (var ci = 0; ci < curve.length; ci++) {
      if (curve[ci][0] === d.minute) { curve[ci][1] = d.value; return true; }            // update existing point
      if (curve[ci][0] > d.minute) { curve.splice(ci, 0, [d.minute, d.value]); return true; }  // insert keeping ascending order
    }
    curve.push([d.minute, d.value]);   // past the last point
    return true;
  }
  return false;
}

// Set a single deep-path key on BALANCE. Returns true if it resolved to a valid, in-bounds numeric knob (or a
// curve point) and was committed. We never CREATE keys (a typo is reported, not injected), never assign to an
// object/array container, never climb the prototype chain, and always clamp to the key's sane range.
export function applyBalanceKey(path, value) {
  return commitBalanceDescriptor(validateBalanceKey(path, value));
}

// Apply an array of {key,value} rows ATOMICALLY (hardening #4): every row is VALIDATED first (no mutation),
// then only the valid descriptors are committed in a second pass. So a malformed/throwing row can NEVER leave
// BALANCE half-mutated - either a row's value is committed wholesale or that row is skipped. Bad rows are
// skipped individually (a single typo doesn't discard the whole sheet); returns the count of committed keys.
// Each row is guarded so an unexpected throw in validation is contained to that row (defence in depth).
export function applyBalanceOverrides(rows) {
  var descriptors = [];
  for (var i = 0; i < rows.length; i++) {
    var d;
    try { d = validateBalanceKey(rows[i].key, rows[i].value); }
    catch (e) { d = { kind: 'reject', reason: 'threw' }; }
    if (d && d.kind !== 'reject') descriptors.push(d);   // collect only the VALID ones (validation does NOT mutate)
  }
  var n = 0;
  for (var j = 0; j < descriptors.length; j++) { if (commitBalanceDescriptor(descriptors[j])) n++; }
  recomputeEnemyTables();   // rebuild the derived enemy HP views from any committed enemies.* overrides
  return n;
}

// Fetch + parse + apply a published Google Sheet CSV. Resolves to {ok, applied, total, error}. NEVER throws
// (a network/parse failure resolves ok:false with the defaults left intact) so the boot path can't crash.
// Google's "Publish to web -> CSV" endpoint sends permissive CORS headers, so a plain fetch() works from any
// origin (verified against a real published sheet - see BALANCE.md).
export function loadBalanceFromSheet(url) {
  setTuneStatus('loading');
  if (!url) {
    setTuneStatus('fail: no sheet url (defaults)');
    return Promise.resolve({ ok: false, applied: 0, total: 0, error: 'no-url' });
  }
  return fetch(url, { cache: 'no-store', redirect: 'follow' })
    .then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.text();
    })
    .then(function (text) {
      // a published CSV is text/csv; an auth wall / wrong link returns an HTML login page - guard against it
      if (/^\s*<(!doctype|html)/i.test(text)) throw new Error('got HTML not CSV (publish-to-web CSV?)');
      var rows = parseBalanceCsv(text);
      var applied = applyBalanceOverrides(rows);
      setTuneStatus('ok ' + applied + '/' + rows.length + ' keys');
      return { ok: true, applied: applied, total: rows.length, error: null };
    })
    .catch(function (err) {
      setTuneStatus('fail: ' + (err && err.message ? err.message : 'fetch') + ' (defaults)');
      return { ok: false, applied: 0, total: 0, error: String(err && err.message || err) };
    });
}

// =============================================================================================
// EXPORT - dump the current BALANCE as key,value,description CSV (so Tim seeds the sheet from defaults).
// Wired to window.__exportBalanceCSV in main.js. Walks the object to the same deep-path keys applyBalanceKey
// reads, attaching the short descriptions below. Returns the CSV string (and logs it for easy copy).
// =============================================================================================
var KNOB_DESC = {
  'weapon.baseInterval': 'Cannon seconds-per-shot at L1 (0.5 shots/s). Lower = faster start.',
  'weapon.asBonusPerPick': 'Attack-speed bonus added per fire-rate pick (additive, +0.20 = +20%).',
  'weapon.asBonusCap': 'Max attack-speed bonus (4.0 = 5x speed = 0.40s/shot late spray).',
  'weapon.baseDmg': 'Base per-shot damage at L1 (grunt has 10 HP -> ~3 hits).',
  'weapon.dmgBonusPerPick': 'Damage bonus added per damage pick (additive, +0.25 = +25%).',
  'weapon.range': 'Firing range (world units). Holds fire if the nearest enemy is farther. ~650 = bullet reach.',
  'weapon.flakIntervalMul': 'Flak interval as a multiple of the cannon base interval (slower).',
  'weapon.missileIntervalMul': 'Missile interval as a multiple of the cannon base interval (slowest).',
  'weapon.flakDmgMul': 'Flak per-pellet damage as a fraction of base damage.',
  'weapon.missileDmgMul': 'Missile per-shot damage as a multiple of base damage.',
  'weapon.laserDpsMul': 'Laser DPS multiplier (DPS = dmg * shotsPerSec * this).',
  'weapon.cannonProjectileSpeed': 'Cannon projectile speed (world px/s).',
  'weapon.flakProjectileSpeed': 'Flak pellet base speed (world px/s, +jitter).',
  'weapon.missileProjectileSpeed': 'Missile speed (world px/s).',
  'player.baseMaxHp': 'Starting hull HP at meta tier 0.',
  'player.baseSpeed': 'Starting move speed (world px/s) at tier 0.',
  'player.baseCrush': 'Starting crush reach (px past the body) at tier 0.',
  'player.baseCrushDps': 'Crush damage/sec the tank deals to overlapped bodies.',
  'player.basePickR': 'XP-mote magnet radius (px) at tier 0.',
  'player.startXpNext': 'XP needed to reach level 2.',
  'progression.xpBase': 'XP-to-next base (level 1->2 cost).',
  'progression.xpPerLevel': 'XP-to-next added per level (linear curve).',
  'progression.speedPerPick': 'Move-speed bonus per Boiler-Pressure pick (multiplicative).',
  'progression.crushDpsPerPick': 'Crush-dps bonus per Tread-Teeth pick.',
  'progression.crushReachPerPick': 'Crush-reach px per Tread-Teeth pick.',
  'progression.pickRPerPick': 'Pickup-range bonus per Vein-Network pick.',
  'progression.maxHpPerPick': 'Max-HP added per Armor-Plating pick.',
  'progression.maxHpPatchCap': 'Max HP healed on an Armor-Plating pick.',
  'progression.thirstPerPick': 'Heal-on-kill added per Thirst pick.',
  'progression.metaDmgBonusPerTier': 'Damage bonus per Maw-Cannon meta tier (additive).',
  'progression.metaAsBonusPerTier': 'Attack-speed bonus per Maw-Cannon meta tier (additive).',
  'progression.metaHpPerTier': 'Max HP per Armor meta tier.',
  'progression.metaSpeedPerTier': 'Move-speed bonus per Tread meta tier (multiplicative).',
  'progression.metaCrushDpsPerTier': 'Crush-dps bonus per Tread meta tier.',
  'progression.metaCrushReachPerTier': 'Crush-reach px per Tread meta tier.',
  'progression.metaRegenPerTier': 'HP/sec regen per Blood-Core meta tier.',
  'progression.metaPickRPerTier': 'Pickup-range px per Blood-Core meta tier.',
  'progression.metaThirstPerTier': 'Heal-on-kill per Thirst meta tier.',
  'progression.metaCoreThirstPerTier': 'Heal-on-kill per Blood-Core meta tier.',
  'progression.metaBarrelEveryTiers': 'Cannon barrels: +1 per N Maw-Cannon tiers.',
  'progression.metaLashEveryTiers': 'Leech-lash: +1 per N Bloodletting tiers.',
  'enemies.contactDmgBase': 'Enemy contact dmg/s base (type 0, minute 0).',
  'enemies.contactDmgTypeStep': 'Enemy contact dmg/s added per type index.',
  'enemies.contactDmgSlope': 'Enemy contact dmg/s growth per minute (+0.25 = +25%/min).',
  'spawn.aliveCap': 'Hard cap on simultaneously-alive enemies (desktop).',
  'spawn.mobileAliveCap': 'Hard cap on simultaneously-alive enemies on touch devices (mobile perf).',
  'spawn.spawnRateBase': 'Enemy refill rate (per sec) at minute 0.',
  'spawn.spawnRatePerMinute': 'Enemy refill rate added per minute.',
  'spawn.interceptFrac': 'Fraction of spawns placed in an arc ahead of the tank heading (anti-kite).',
  'spawn.interceptArc': 'Half-width (rad) of the ahead spawn arc.',
  'spawn.speedRampPerMinute': 'Enemy move-speed multiplier added per minute.',
  'spawn.speedRampCap': 'Max enemy move-speed multiplier (cap on the minute ramp).'
};

export function exportBalanceCSV() {
  var rows = ['key,value,description'];
  function esc(s) { s = String(s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function emit(path, val) { rows.push(esc(path) + ',' + esc(val) + ',' + esc(KNOB_DESC[path] || '')); }

  // weapon, player, progression: flat numeric leaves
  var groups = ['weapon', 'player', 'progression'];
  for (var g = 0; g < groups.length; g++) {
    var obj = BALANCE[groups[g]];
    for (var k in obj) {
      if (typeof obj[k] === 'number') emit(groups[g] + '.' + k, obj[k]);
    }
  }
  // enemies: per-type baseHP + hpPerMinute, then the shared contact knobs
  for (var i = 0; i < ENEMY_KEYS.length; i++) {
    var ek = ENEMY_KEYS[i], e = BALANCE.enemies[ek];
    rows.push(esc('enemies.' + ek + '.baseHP') + ',' + esc(e.baseHP) + ',' + esc(ek + ' base HP (HP=base*(1+perMin*min))'));
    rows.push(esc('enemies.' + ek + '.hpPerMinute') + ',' + esc(e.hpPerMinute) + ',' + esc(ek + ' HP growth per minute (linear)'));
  }
  emit('enemies.contactDmgBase', BALANCE.enemies.contactDmgBase);
  emit('enemies.contactDmgTypeStep', BALANCE.enemies.contactDmgTypeStep);
  emit('enemies.contactDmgSlope', BALANCE.enemies.contactDmgSlope);
  // spawn: the count curve as point rows + the scalar caps/rates
  for (var c = 0; c < BALANCE.spawn.countCurve.length; c++) {
    var pt = BALANCE.spawn.countCurve[c];
    rows.push(esc('spawn.countCurve.' + pt[0]) + ',' + esc(pt[1]) + ',' + esc('On-screen enemy target at minute ' + pt[0]));
  }
  emit('spawn.aliveCap', BALANCE.spawn.aliveCap);
  emit('spawn.mobileAliveCap', BALANCE.spawn.mobileAliveCap);
  emit('spawn.spawnRateBase', BALANCE.spawn.spawnRateBase);
  emit('spawn.spawnRatePerMinute', BALANCE.spawn.spawnRatePerMinute);
  emit('spawn.interceptFrac', BALANCE.spawn.interceptFrac);
  emit('spawn.interceptArc', BALANCE.spawn.interceptArc);
  emit('spawn.speedRampPerMinute', BALANCE.spawn.speedRampPerMinute);
  emit('spawn.speedRampCap', BALANCE.spawn.speedRampCap);

  return rows.join('\n');
}
