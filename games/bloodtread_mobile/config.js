// Numeric caps + fixed constants. URL-tunable pool sizes are clamped here once at boot.
// Imports qs from flags.js so all URL parsing lives behind one query object.
import { qs } from './flags.js?v=bm3';
import { clamp, clampInt } from './lib/math.js?v=bm3';

export var MAX_ENEMIES = clampInt(parseInt(qs.get('maxe') || '1400', 10), 200, 1800);
export var MAX_BULLETS = 160;
export var MAX_EBULLETS = 256;   // enemy projectiles (Spitter bolts); 2 instances each in MAX_INST below
export var MAX_FLOATS = 24;      // floating "+N" heal numbers (HUD-only, but reserve a small instance slack)
export var MAX_MOTES = 720;
export var MAX_PARTS = 2400;
export var MAX_DECALS = 640;
export var MAX_GORE = clampInt(parseInt(qs.get('gorecap') || '980', 10), 0, 1400);
export var MAX_SPLATS = clampInt(parseInt(qs.get('splatcap') || '320', 10), 0, 480);
export var MAX_BOOMS = clampInt(parseInt(qs.get('boomcap') || '34', 10), 0, 90);
export var MAX_BUBBLES = clampInt(parseInt(qs.get('bubblecap') || '48', 10), 0, 96);
export var MAX_VEINS = clampInt(parseInt(qs.get('veincap') || '130', 10), 0, 260);
export var MAX_LEECHES = clampInt(parseInt(qs.get('leechcap') || '9', 10), 0, 12);
export var DETAIL_MAX = clampInt(parseInt(qs.get('detail') || '360', 10), 0, 720);
export var MAX_INST = MAX_ENEMIES * 4 + MAX_BULLETS + MAX_EBULLETS * 2 + MAX_MOTES * 6 + MAX_PARTS + MAX_DECALS + MAX_GORE * 2 + MAX_SPLATS * 3 + MAX_BOOMS * 8 + MAX_BUBBLES * 3 + MAX_VEINS * 6 + MAX_LEECHES * 10 + 640;
export var LASER_RANGE_MULT = clamp(parseFloat(qs.get('laserrange') || '6'), 3, 20);
export var STEP = 1 / 60;
export var MAX_STEPS = 3;
export var INV_STRIDE = 12;
export var BASE_DPR = clamp(parseFloat(qs.get('dpr') || '1.25'), 0.75, 1.5);
export var GORE_MUL = clamp(parseFloat(qs.get('goremul') || '2.65'), 0.2, 3.5);
export var ENEMY_SCALE = clamp(parseFloat(qs.get('enemysize') || '1.12'), 0.8, 1.5);
export var ROCK_DENSITY = clampInt(parseInt(qs.get('rockdensity') || '24', 10), 0, 60);
export var DECAL_DENSITY = clampInt(parseInt(qs.get('decaldensity') || '48', 10), 0, 80);
export var COLLIDER_CELL = clampInt(parseInt(qs.get('collidercell') || '58', 10), 24, 96);   // wider so the 3x3 grid search catches contacts at the bigger VISIBLE-body block radius
export var COLLIDER_PAIR_CAP = clampInt(parseInt(qs.get('colliderpairs') || '14000', 10), 0, 30000);
export var COLLIDER_PAIR_LIMIT = clampInt(parseInt(qs.get('colliderlimit') || '12', 10), 0, 24);
export var COLLIDER_PLAYER_CAP = clamp(parseFloat(qs.get('colliderpush') || '8.5'), 0, 24);
export var COLLIDER_BODY_K = clamp(parseFloat(qs.get('blockk') || '0.75'), 0.4, 1.3);   // enemy<->enemy block radius as a fraction of the summed VISIBLE bodies; <1 lets sprites slightly overlap (0.75 = a little stacking, no full pile-up, and tight enough that the front row still reaches the tank to attack). Tune live with ?blockk=
export var SPRITE_ANIM_CAP = clampInt(parseInt(qs.get('spritecap') || '360', 10), 0, 1200);
export var SPRITE_CELL = clampInt(parseInt(qs.get('spritecell') || '112', 10), 64, 220);
// TANK<->ENEMY visual-body collision radii. SINGLE SOURCE shared by the body-push/contact logic in
// systems/enemies.js AND the melee-attack trigger in render/world.js (queueOldEnemySprite), so the
// melee creature that VISIBLY presses against the tank (collision rim) is the same one the render
// shows mid-swing - they can never drift apart. TANK_VIS_R = the tank chassis' solid radius in world
// units (the body is drawn at screenLen(92), so ~34 sits a hair inside the chassis edge).
// VIS_FILL (the monster's solid-body fraction of its drawn sprite cell) is SUPERSEDED 2026-06-25 by the
// per-creature SPRITE_BODY_FILL[] in data/enemies.js: one global 0.46 still over-reached every creature
// (they fill 35-72% of their cell, not a flat fraction), so the tank pushed/bit from far - worse the more
// it upgraded, because the crush-tier reach was folded into the body radius as a floor. The body push now
// reads SPRITE_BODY_FILL per type and the crush reach is split out (systems/enemies.js bodyR vs crushRng).
// This export is kept only so an old ?-flag reference can't crash; nothing imports it. Do NOT wire it back in.
export var TANK_VIS_R = 34;
export var VIS_FILL = 0.46;
export var CORPSE_CAP = clampInt(parseInt(qs.get('corpsecap') || '82', 10), 0, 180);
export var TRACK_CAP = 260;
export var UNLEASH_TIME = 5;

// -- camera shake (trauma-based combat juice) -----------------------------------------------------
// view.shake is a 0..1 trauma scalar: triggers ADD trauma (clamped to 1), the sim step decays it, and
// render/camera.js folds trauma*trauma * MAX_SHAKE_PX of sin/cos jitter into the world->screen transform
// (WORLD ONLY - the HUD/joystick/buttons draw in raw screen-space and never move). MOBILE-FIRST: keep
// MAX_SHAKE_PX SMALL (portrait zoom 0.70 scales it down further on-screen) - over-shake nauseates on a
// 393x852 phone. To dial the whole effect: bump/zero MAX_SHAKE_PX here; ?noshake=1 disables it at runtime.
export var SHAKE_ENABLED = qs.get('noshake') !== '1' && qs.get('shake') !== '0';
export var MAX_SHAKE_PX = clamp(parseFloat(qs.get('shakepx') || '7'), 0, 24);   // peak WORLD-px offset at full trauma (subtle; squared falloff means a graze barely moves)
export var SHAKE_DECAY = clamp(parseFloat(qs.get('shakedecay') || '2.6'), 0.5, 8); // trauma units bled off per second (a single hit settles in <0.4s)
