// World render pass (the per-frame HOT path): renderWorld + every instance/creature/sprite builder.
// Builds into the shared `inst` Float32Array via the context.js primitives (addInst/addLine/addCurve +
// the sprite-batch queue), then drawInstances flushes. rule-#4 array aliasing is NOT separately hoisted
// here (the builders read pool.field[i] directly, byte-faithful to the original); the loops never realloc.
// Camera-zoom aware: positions go through worldToScreenX/Y + screenLen (render/camera).
import {
  enemies, bullets, ebullets, motes, particles, decals, gore, splats, booms, bubbles,
  corpses, veins, leeches, player, state, view, sprites, econ, laser, tankDebris
} from '../state.js';
import { clamp, clampInt, TWO_PI } from '../lib/math.js';
import {
  DETAIL_MAX, MAX_LEECHES, SPRITE_ANIM_CAP, TANK_VIS_R
} from '../config.js';
import {
  OLD_SPRITES, OLD_ENV, OLD_TANK, OLD_DEATH, TANK_LAYERS,
  GORE_FX, BREAK_ENV, VEIN_FX, LEECH_FX, SPRITE_LOD
} from '../flags.js';
import {
  C_R, C_G, C_B, T_COL, T_CAN_FIRE_BOLT, SPRITE_BASE, SPRITE_VIS_MULT, SPRITE_BODY_FILL, SPRITE_T_R, SPRITE_T_G, SPRITE_T_B
} from '../data/enemies.js';
import { WEAPON_ROW, WEAPON_TURRET_CELL, WEAPON_PROJECTILE_CELL } from '../data/weapons.js';
import { enemyHpAt } from '../balance.js';   // live HP model baseHP*(1+perMin*min) - the hit hot-flash normalizes by this, not the old T_HP*(1+t*0.014)
import { perf } from '../core/time.js';
import {
  gl, glCanvas, inst, addInst, addRot, addLineInst, addCurveInst, drawInstances,
  queueSprite, queueSpriteRot, resetSpriteBatches, flushSprites, prepareSpriteDensity,
  spriteCellIndex, spriteDir, spriteGridCountAt, spriteGridAnimAt, bumpSpriteGridAnim
} from './context.js';
import { worldToScreenX, worldToScreenY, screenLen, viewWorldMax } from './camera.js';
import { tankRageLevel, weaponAtlasTier, weaponRow } from '../game/meta.js';
import { currentLeechLevel } from '../systems/shared.js';
import { obS, decS, obstacleAtCell, decalAtCell } from '../systems/environment.js';
import { isTechType } from '../fx/gore.js';   // pure type predicate (TECH/biomech vs organic) - routes the corpse death sheet (metal_gore vs flesh_gore). fx/gore does NOT import world, so no cycle.

  // -- PER-MAP GROUND PALETTE --------------------------------------------------------------------------------
  // Returns {r,g,b} multipliers that recolor every ground layer (GL clear base, the fallback floor grid, and the
  // OLD_ENV ground-sprite tint) so each map reads as a distinct biomech hellscape while keeping the same art.
  // Map 1 = {1,1,1} = the ORIGINAL dark blood-red ground, untouched. Map 2+ pick from a small hand-tuned table
  // (plague-green, ashen-grey, deeper-crimson, bruised-violet, bilious-amber); past the table it cycles + darkens
  // ~6%/lap so deeper maps feel more oppressive. Deterministic, alloc-light (one cached scratch object).
  // Multipliers applied to the floor grid + ground-sprite tint, and (max-normalized) to the per-map clear ambient.
  // Strong hue separation so each map's floor reads clearly AFTER sRGB gamma compresses low values toward neutral.
  // explosion.png fireball sheet layout (Tim 2026-06-23): 1000x500 = 10 cols x 5 rows of 100px cells = 50 frames.
  // EXPL_VIS scales the drawn sprite to ~cover the boom's blast radius (booms.r) - tuned by capture.
  var EXPL_CELL = 100, EXPL_COLS = 10, EXPL_FRAMES = 50, EXPL_VIS = 4.6;
  // gore_blood sheet layout: 2048x2048 = 4 cols x 4 rows of 512px cells = 16 frames. GORE_VIS scales the splash
  // to ~the creature (the boom carries the creature radius in booms.r); ONE quad per splash (creature-sized, NOT
  // 512px) keeps overdraw bounded under a horde. GORE_KEY picks the variant (gore_blood vs gore_blood_burst).
  // A/B verdict (Tim 2026-06-23): gore_blood (clean wet bloom) reads as BLOOD for organic deaths; gore_blood_burst's
  // radial flash looked like a spark/explosion (would clash with the metal-shrapnel spark + the fireball). Kept gore_blood.
  var GORE_CELL = 512, GORE_COLS = 4, GORE_FRAMES = 16, GORE_VIS = 5.5, GORE_KEY = 'gore_blood';
  // GORE GIB (Tim-downloaded LPC gore bit): a single textured CHUNK (the ribcage from Ribs.png, cropped + cleaned
  // into a 96px transparent cell -> sprites/gib_ribs.png) flung on ORGANIC deaths as an extra textured gib over
  // the procedural spray. ONE static-frame sprite quad per gib, sized off the gore-piece radius, tumbling on
  // gore.a, fading with gore.life. gore.kind===6 = a rib gib (skipped by the procedural addGoreInstances draw,
  // drawn here in the sprite layer like the boom blood-splash). (The other downloaded bits - Bloody Arm / Bleeding
  // Eye / Bloody Mouth - are tiny 3-17px LPC FACE/body overlays, not standalone gibs, so they read as specks at
  // game scale and are NOT used; the ribcage is the one that reads as a real chunk.)
  var GIB_KEY = 'gib_ribs', GIB_CELL = 96, GIB_VIS = 2.6;
  var MAP_GROUND_TINTS = [
    { r: 1.00, g: 1.00, b: 1.00 },   // map 1: untouched (blood-red hellground)
    { r: 0.34, g: 1.25, b: 0.40 },   // map 2: sickly plague-green (green clearly leads)
    { r: 0.78, g: 0.90, b: 1.20 },   // map 3: ashen blue-grey (cool, blue-led)
    { r: 1.35, g: 0.34, b: 0.36 },   // map 4: deeper crimson (red-led, darker than map 1)
    { r: 0.92, g: 0.40, b: 1.30 },   // map 5: bruised violet (magenta-led)
    { r: 1.28, g: 0.96, b: 0.30 }    // map 6: bilious amber (yellow-led)
  ];
  var _mapTint = { r: 1, g: 1, b: 1 };
  function mapGroundTint() {
    var m = state.map | 0;
    if (m <= 1) { _mapTint.r = 1; _mapTint.g = 1; _mapTint.b = 1; return _mapTint; }
    var base = MAP_GROUND_TINTS[((m - 1) % (MAP_GROUND_TINTS.length - 1)) + 1];   // cycle maps 2..table over the non-identity entries
    var dark = Math.pow(0.94, Math.floor((m - 1) / (MAP_GROUND_TINTS.length - 1)));   // each full lap dims ~6%
    _mapTint.r = base.r * dark;
    _mapTint.g = base.g * dark;
    _mapTint.b = base.b * dark;
    return _mapTint;
  }

  // Absolute GL clear color (the dominant floor tone). Map 1 returns the ORIGINAL near-black blood tone byte-for-byte
  // so the baseline stays identical; map 2+ LIFTS the ambient to ~0.052 luminance carried in the map's tint hue so
  // the floor reads as a distinctly different biome at a glance (a pure multiply on the ~0.02 base is too dark to
  // see). Writes into the passed [r,g,b] array (alloc-free). 0.06 cap keeps it a dim hellscape floor, not a bright bg.
  function mapClearColor(out) {
    var m = state.map | 0;
    if (m <= 1) { out[0] = 0.028; out[1] = 0.023; out[2] = 0.019; return; }
    var t = mapGroundTint();
    var mx = Math.max(t.r, t.g, t.b) || 1;
    // dim floor 0.016 (so the weakest channel isn't pure black) + up to 0.10 scaled by each channel's strength
    // RELATIVE TO THE DOMINANT one. So the map's hue clearly leads (map 2 green-led, map 4 red-led, ...) and the
    // floor reads as a different biome at a glance, while staying a dim ~0.11-luminance hellscape (not a bright bg).
    out[0] = Math.min(0.12, 0.016 + 0.10 * (t.r / mx));
    out[1] = Math.min(0.12, 0.016 + 0.10 * (t.g / mx));
    out[2] = Math.min(0.12, 0.016 + 0.10 * (t.b / mx));
  }
  var _mapClear = [0.028, 0.023, 0.019];

  function queueOldEnvironment() {
    if (!OLD_ENV || !sprites.textures.ground) return;
    var gt = mapGroundTint();
    var ts = 240;
    var tsS = screenLen(ts);
    var ox = -((((player.x * view.cameraZoom) % tsS) + tsS) % tsS);
    var oy = -((((player.y * view.cameraZoom) % tsS) + tsS) % tsS);
    var gm = sprites.meta.ground;
    for (var gx = ox - tsS; gx < view.cssW + tsS; gx += tsS) {
      for (var gy = oy - tsS; gy < view.cssH + tsS; gy += tsS) {
        if (queueSprite('ground', 0, 0, gm.w, gm.h, gx, gy, tsS, tsS, 0.64 * gt.r, 0.58 * gt.g, 0.54 * gt.b, 0.92)) perf.envSprites++;
      }
    }

    var cell = 132;
    var marginX = view.viewWorldW * 0.5 + 90;
    var marginY = view.viewWorldH * 0.5 + 90;
    var c0 = Math.floor((player.x - marginX) / cell), c1 = Math.floor((player.x + marginX) / cell);
    var r0 = Math.floor((player.y - marginY) / cell), r1 = Math.floor((player.y + marginY) / cell);
    var kinds = ['blood', 'crack', 'bush', 'bones', 'flower', 'ribs', 'scorch', 'skull'];
    for (var cx0 = c0; cx0 <= c1; cx0++) {
      for (var cy0 = r0; cy0 <= r1; cy0++) {
        if (!decalAtCell(cx0, cy0)) continue;
        var kind = kinds[decS.kind];
        var key = 'dec_' + kind;
        var meta = sprites.meta[key];
        if (!sprites.textures[key] || !meta) continue;
        var dsize = screenLen(decS.size);
        var sx = worldToScreenX(decS.x) - dsize * 0.5;
        var sy = worldToScreenY(decS.y) - dsize * 0.5;
        if (sx < -dsize || sx > view.cssW + dsize || sy < -dsize || sy > view.cssH + dsize) continue;
        if (queueSprite(key, 0, 0, meta.w, meta.h, sx, sy, dsize, dsize, 0.86, 0.82, 0.76, 0.76)) perf.envSprites++;
      }
    }

    if (!BREAK_ENV) return;
    var rockCell = 250;
    var rockMarginX = view.viewWorldW * 0.5 + 160;
    var rockMarginY = view.viewWorldH * 0.5 + 160;
    var rc0 = Math.floor((player.x - rockMarginX) / rockCell), rc1 = Math.floor((player.x + rockMarginX) / rockCell);
    var rr0 = Math.floor((player.y - rockMarginY) / rockCell), rr1 = Math.floor((player.y + rockMarginY) / rockCell);
    for (var rx0 = rc0; rx0 <= rc1; rx0++) {
      for (var ry0 = rr0; ry0 <= rr1; ry0++) {
        if (!obstacleAtCell(rx0, ry0)) continue;
        var rkey = 'rock' + obS.v;
        var rmeta = sprites.meta[rkey];
        if (!sprites.textures[rkey] || !rmeta) continue;
        var size = screenLen(obS.r * 2.35);
        var rsx = worldToScreenX(obS.x) - size * 0.5;
        var rsy = worldToScreenY(obS.y) - size * 0.5;
        if (rsx < -size || rsx > view.cssW + size || rsy < -size || rsy > view.cssH + size) continue;
        var hurt = Math.max(0, 1 - obS.hp / obS.maxHp);
        var flash = state.t - obS.hit < 0.16 ? 0.35 : 0;
        if (queueSprite(rkey, 0, 0, rmeta.w, rmeta.h, rsx, rsy, size, size, 0.88 + flash, 0.84 - hurt * 0.12 + flash, 0.78 - hurt * 0.18 + flash, 0.98)) {
          perf.envSprites++;
          perf.envRocks++;
        }
      }
    }
  }

  function queueOldEnemySprite(i) {
    var cell = spriteCellIndex(enemies.x[i], enemies.y[i]);
    if (cell < 0) return true;
    var type = enemies.type[i];
    var base = SPRITE_BASE[type] || 'husk';
    var dxp = enemies.x[i] - player.x;
    var dyp = enemies.y[i] - player.y;
    // MELEE-AT-TANK trigger: a melee creature pressed against the tank should visibly SWING. It must fire at the
    // SAME radius the body-push parks the creature at - bodyR = the VISIBLE body footprint (TANK_VIS_R chassis +
    // the sprite's measured body half-width, systems/enemies.js). NOT the crush-grind reach: the old version floored
    // this at player.r+player.crush+r, so thin creatures (and any tank with Tread upgrades) swung from empty space.
    // Reuse bodyR exactly so a creature touching the tank body plays its `_attack` swing (which loops on its own
    // frame cadence ~0.9s/swing -> a repeating beat). (The Spitter's aim/fire trigger below is separate and unchanged.)
    var bodyR = TANK_VIS_R + enemies.r[i] * SPRITE_VIS_MULT[type] * SPRITE_BODY_FILL[type];   // per-creature body fill (not global VIS_FILL) - the attack trigger matches the body-push radius exactly
    var contactR = bodyR + 1;   // +1px tolerance, non-strict: the collision parks enemies at EXACTLY bodyR (then may nudge the tank away), so a strict < would flicker the attack off for rim-held creatures = the "rarely attack" Tim saw (Codex)
    var contact = dxp * dxp + dyp * dyp <= contactR * contactR;
    var dir = spriteDir(enemies.face[i]);
    var firing = T_CAN_FIRE_BOLT[type] && enemies.aim[i] > -90;   // ranged Spitter: play the spit anim during its aim/fire window, not just melee contact
    // STATIONARY ALTERNATION: when a creature holds position (low locomotion speed) and is NOT in its contact/fire
    // window, it would otherwise freeze on a single walk frame and read as dead. Alternate idle<->attack on a slow
    // per-enemy beat (driven by its own `phase`, offset by type so a clump doesn't pulse in lockstep): ~3.4s idle
    // then a ~0.7s attack flourish, looping. mspd is the per-frame px/s locomotion written in updateEnemies.
    var still = enemies.mspd[i] < 18;   // below ~18px/s = effectively holding position (creatures cruise at 55-130)
    var stillAttack = false;
    if (still && !contact && !firing) {
      var beat = (enemies.phase[i] + type * 0.9) % 4.1;
      stillAttack = beat < 0.7;   // brief attack flourish once per ~4.1s cycle
    }
    var wantAttack = contact || firing || stillAttack;
    var key = wantAttack && sprites.textures[base + '_attack'] ? base + '_attack'
            : (still && sprites.textures[base + '_idle'] ? base + '_idle' : base + '_walk_d' + dir);
    if (!sprites.textures[key]) key = base + '_idle';
    if (!sprites.textures[key]) key = type < 2 || type === 4 || type === 6 || type === 8 || type === 10 ? 'husk_base' : 'brute_base';
    if (!sprites.textures[key]) return false;

    var count = spriteGridCountAt(cell) || 1;
    var perCell = count > 28 ? 1 : (count > 16 ? 2 : (count > 8 ? 3 : 6));
    var animated = !SPRITE_LOD || (perf.spriteAnimated < SPRITE_ANIM_CAP && spriteGridAnimAt(cell) < perCell);
    if (animated) {
      bumpSpriteGridAnim(cell);
      perf.spriteAnimated++;
    } else {
      perf.spriteStatic++;
    }

    var meta = sprites.meta[key];
    var frames = meta ? meta.frames : 1;
    var phase = enemies.phase[i];
    var frame = animated
      ? ((phase * (contact ? 13 : 11) + type * 0.73) | 0) % frames
      : ((i * 7 + type * 3) % frames);
    var size = screenLen(enemies.r[i] * SPRITE_VIS_MULT[type]);   // per-type visual multiplier (shared with tank<->enemy collision in systems/enemies.js)
    var hurt = Math.max(0, Math.min(1, 1 - enemies.hp[i] / (enemyHpAt(type, state.t / 60) + 1)));   // normalize by the live HP curve (balance.js) so the hit hot-flash tracks the new per-minute model
    var sxScreen = worldToScreenX(enemies.x[i]);
    var syScreen = worldToScreenY(enemies.y[i]);
    if (animated) {
      // Asset-free procedural animation (mirrors addCreatureBase / queueOldTankSprite): squash from the
      // legged "walk" cadence + a slow "breathe", a vertical bob, a small sway rotation, and a brief
      // hit-squash on damage (the sprite analogue of the procedural `pulse` hot-flash). All driven by the
      // enemy's own per-frame `phase` so the two render paths share cadence. No per-frame allocation.
      var walk = Math.sin(phase * (type === 1 || type === 8 ? 10.5 : 6.5) + type);
      var breathe = Math.sin(phase * 3.1 + type * 0.7);
      var live = contact ? 1.25 : 1;                       // lunge harder while biting (matches frame-rate bump)
      var hit = hurt * Math.max(0, Math.sin(phase * 17));   // quick flinch pulse on a damaged creature
      // Creatures with REAL multi-frame baked animation (our engine single-sheets like the Spitter, frames>1) already
      // carry their own squash/bob/sway IN the frames; the procedural fake-life squash below is ONLY for single STATIC
      // frames (the old directional husk/brute poses). Layering it on a real animation double-animates and reads as a
      // bad "resize" (Tim's note), so gate it to frames===1 and let real animations play clean.
      var realAnim = frames > 1;
      var sqW = realAnim ? 1 : 1 + walk * 0.06 * live + hit * 0.10;
      var sqH = realAnim ? 1 : 1 - walk * 0.045 * live + breathe * 0.025 - hit * 0.12;
      var bob = realAnim ? 0 : breathe * size * 0.022 + Math.abs(walk) * size * 0.018 * live;   // gentle up/down body bob (static frames only)
      // NO ROTATION on cutout creatures (Tim 2026-06-24 "only left/right/front/back, looks weird rotating 45/30 deg").
      // The sprite is a flat cutout, so ANY rotation angle reads wrong - both the old procedural `walk*0.07` rocking
      // AND the vertical-approach lean (cos(face)*|sin(face)| tilt toward the player on diagonals) are REMOVED. The
      // creature still reads alive via the squash (sqW/sqH) + the vertical bob; facing is the L/R mirror (faceW
      // negative-width) below, which is untouched. queueSpriteRot is passed rotation 0 (kept over queueSprite so the
      // mirror's negative-width still maps the UVs correctly).
      var sway = 0;
      var cx = sxScreen;
      var cy = syScreen - size * 0.08 + bob;                // keep the ~0.58 top-bias as a center offset (0.5-0.08)
      // FACING: our single-sheet engine creatures (Spitter + Husk + Brute) are a RIGHT-facing profile, so to face a
      // player on the LEFT we mirror horizontally (negative width flips the quad's left/right corners via
      // queueSpriteRot); a player on the RIGHT needs no flip (art already faces right). The remaining directional
      // bases (husk_rot, brute_char) use 8 DIRECTIONAL walk sheets (picked by `dir` above) that already face
      // correctly, so they must NOT be mirrored or they turn their backs. Mirror gated to the single-sheet bases only.
      var faceW = ((base === 'spitter' || base === 'husk' || base === 'brute' || base === 'zombie' || base === 'goblin' || base === 'demon') && Math.cos(enemies.face[i]) < 0) ? -(size * sqW) : (size * sqW);
      return queueSpriteRot(key, frame * 160, 0, 160, 160, cx, cy, faceW, size * sqH, sway, SPRITE_T_R[type] + hurt * 0.18, SPRITE_T_G[type], SPRITE_T_B[type], 0.96);
    }
    // Same right-facing mirror for the cheap static branch (single-sheet Spitter + Husk + Brute; directional bases
    // never mirrored); the anchor shifts so the mirrored quad still centers on the enemy.
    var faceWS = ((base === 'spitter' || base === 'husk' || base === 'brute' || base === 'zombie' || base === 'goblin' || base === 'demon') && Math.cos(enemies.face[i]) < 0) ? -size : size;
    var sx = sxScreen - faceWS * 0.5;
    var sy = syScreen - size * 0.58;
    return queueSprite(key, frame * 160, 0, 160, 160, sx, sy, faceWS, size, SPRITE_T_R[type] + hurt * 0.18, SPRITE_T_G[type], SPRITE_T_B[type], 0.96);
  }

  function queueOldCorpseSprite(i) {
    if (!OLD_DEATH) return false;
    var type = corpses.type[i];
    // GORE-DEATH ROUTING (Tim 2026-06-24, fix: "added it to the wrong one" -> per-creature gore sheets). The old
    // 198-ported metal_gore_death + flesh_gore_death sheets are HUSK-SILHOUETTE-derived, so they only read right on
    // the white/green husk family. Now six per-creature gore sheets (husk/husk_white/brute/spitter/zombie/goblin,
    // verified live in assets/) cover all 16 types via ROOT RESOLUTION: tinted bases collapse to their root sheet
    // (husk_rot -> husk for the green crawlers types 1/6/8/10; brute_char -> brute for the charred Gorehound/
    // Detonator/Bombard 3/7/11), so each creature bursts from its own silhouette/palette. Order:
    //   (a) `<root>_gore_death` sheet (the resolved per-creature gore) - the normal path, covers all 16 types.
    //   (b) load-FAILURE safety net: husk-family bases fall to the husk-derived flesh_gore_death if its sheet
    //       didn't load (it matches their silhouette).
    //   (c) load-FAILURE safety net: the ORIGINAL per-creature <base>_death collapse, then the static base cutout.
    // Nothing routes to metal_gore_death. A per-creature PNG that 404s leaves sprites.textures empty -> drop through
    // (a) into (b)/(c) gracefully. The gore burst (fx/gore.js spawnGoreBurst) + the blood/metal booms (kind 3/4)
    // still play UNDERNEATH (spawned in killEnemy, effectAllowed-gated - untouched). The gore sheets are a single
    // horizontal strip of 16x 160px cells (2560x160), col=frame/row=0 exactly like the creature _death strips.
    var base = SPRITE_BASE[type] || 'husk';
    var root = base === 'brute_char' ? 'brute' : base;   // resolve the charred brute_char to brute's sheet; husk_rot now has its OWN green gore sheet (husk/husk_white/spitter/zombie/goblin all map directly too)
    var huskFamily = base === 'husk' || base === 'husk_rot' || base === 'husk_white';
    var key, isDeathStrip, goreOn;
    if (sprites.textures[root + '_gore_death']) {
      key = root + '_gore_death'; isDeathStrip = true; goreOn = true;   // (a) per-creature gore splatter (covers all 16 via root)
    } else if (huskFamily && sprites.textures.flesh_gore_death) {
      key = 'flesh_gore_death'; isDeathStrip = true; goreOn = true;     // (b) load-failure net: husk-derived gore fits the crawler family
    } else {
      // (c) load-failure net: the original per-creature collapse, then the static base cutout.
      goreOn = false;
      key = base + '_death';
      if (!sprites.textures[key]) key = type < 2 || type === 4 || type === 6 || type === 8 || type === 10 ? 'husk_base' : 'brute_base';
      if (!sprites.textures[key]) return false;
      isDeathStrip = key.indexOf('_death') > 0;
    }
    var meta = sprites.meta[key];
    var frames = meta ? meta.frames : 1;
    var ct = corpses.t[i];
    // Retimed for the ~1.5s corpse life (baseline was 0.72s = a blink): the death clip (16-frame gore, or the
    // 12-frame collapse fallback) plays over the first 0.85s, HOLDS the final frame so the kill clearly reads, then
    // the body lingers + fades 1.1s -> 1.5s. Clean 1,1,1 sprite tint so the baked art reads as authored.
    var k = Math.min(1, ct / 0.85);
    var frame = isDeathStrip ? Math.min(frames - 1, Math.floor(k * frames)) : 0;
    // The gore sheets are full-bleed splatter (not a creature silhouette), so they read best a touch larger + want
    // to cover the death spot (198 drew its gore at c.r*3.4); the collapse fallback keeps its tuned per-type sizes.
    var sizeMul = goreOn
      ? (type === 1 || type === 8 || type === 12 ? 3.3 : (type === 2 || type === 5 || type === 7 || type === 9 || type === 11 || type === 13 || type === 14 ? 3.8 : 3.55))
      : (type === 1 || type === 8 ? 2.85 : (type === 2 || type === 5 || type === 7 || type === 9 || type === 11 ? 3.25 : 3.1));
    var size = screenLen(corpses.r[i] * sizeMul);
    var alpha = ct > 1.1 ? Math.max(0, (1.5 - ct) / 0.4) : 0.94;
    var w = corpses.face[i] < 0 ? -size : size;
    var sx = worldToScreenX(corpses.x[i]) - (corpses.face[i] < 0 ? -size : size) * 0.5;
    // gore splash centers on the death spot; the collapse anchored its feet (-size*0.55). Use a near-centered
    // anchor for the gore (it's a radial splatter, not a standing body) so it sits ON the kill, not floating above.
    var sy = worldToScreenY(corpses.y[i]) - size * (goreOn ? 0.5 : 0.55);
    if (sx < -size * 1.5 || sx > view.cssW + size * 1.5 || sy < -size * 1.5 || sy > view.cssH + size * 1.5) return true;
    perf.corpseSprites++;
    return queueSprite(key, frame * 160, 0, Math.min(160, meta.w), Math.min(160, meta.h), sx, sy, w, size, 1, 1, 1, alpha);
  }

  // EXPLOSION SPRITE off the explosion.png sheet (10 cols x 5 rows of 100px cells = 50 frames: spark -> white-hot
  // -> orange -> smoke -> ash). Drawn in the SPRITE layer (alpha-blended over gore). Two modes (Tim 2026-06-23):
  //  - kind 2 = FIREBALL: full sheet, full colour - a tank/big-enemy death reads as an actual blast.
  //  - kind 1 = ROCK DUST: ONLY the late smoke/ash frames (rows 3-4), TINTED grey-brown + desaturated, so a rock
  //    break gets a real animated dust cloud (a fireball would be wrong for stone) layered with the procedural rubble.
  function queueExplosionSprite(i) {
    var meta = sprites.meta.explosion;
    if (!sprites.textures.explosion || !meta) return false;
    var k = booms.t[i] / Math.max(0.001, booms.max[i]);   // 0..1 over the boom's life
    var dustMode = booms.kind[i] === 1;
    var f, size, r, g, b, a;
    if (dustMode) {
      // map the boom life across the smoke/ash frames only (28..49 = the dark dissipating rows)
      var DUST_START = 28;
      f = Math.min(EXPL_FRAMES - 1, DUST_START + (k * (EXPL_FRAMES - DUST_START)) | 0);
      size = screenLen(booms.r[i] * 3.4);                 // dust spreads a bit beyond the rubble but tighter than a full fireball
      r = 0.46; g = 0.40; b = 0.34;                       // grey-brown desaturate (stone dust, not fire)
      a = (k < 0.15 ? k / 0.15 : (1 - k) / 0.85 + 0.0) * 0.7;   // quick rise then fade out
      if (a < 0) a = 0;
    } else {
      f = Math.min(EXPL_FRAMES - 1, (k * EXPL_FRAMES) | 0);
      size = screenLen(booms.r[i] * EXPL_VIS);
      r = 1; g = 1; b = 1;
      a = k > 0.8 ? Math.max(0, (1 - k) / 0.2) : 1;       // hold full, fade only the last ~20%
    }
    var col = f % EXPL_COLS, row = (f / EXPL_COLS) | 0;
    var sxs = worldToScreenX(booms.x[i]);
    var sys = worldToScreenY(booms.y[i]);
    if (sxs < -size || sxs > view.cssW + size || sys < -size || sys > view.cssH + size) return true;
    perf.boomSprites++;
    return queueSpriteRot('explosion', col * EXPL_CELL, row * EXPL_CELL, EXPL_CELL, EXPL_CELL, sxs, sys, size, size, 0, r, g, b, a);
  }

  // BLOOD-SPLASH SPRITE (boom kind 3): the gore_blood CC0 sheet (4x4 of 512px = 16 frames) played as the ORGANIC
  // death gore - ONE creature-sized quad (booms.r carries the creature radius), full colour (the art is red),
  // brief life, a per-boom rotation for variety. Drawn in the SPRITE layer over the floor/gore. Tech deaths use
  // kind 4 (metal shrapnel) instead - no blood. PERF: one quad each, throttled at spawn by effectAllowed.
  function queueGoreSprite(i) {
    var meta = sprites.meta[GORE_KEY];
    if (!sprites.textures[GORE_KEY] || !meta) return false;
    var k = booms.t[i] / Math.max(0.001, booms.max[i]);
    var f = Math.min(GORE_FRAMES - 1, (k * GORE_FRAMES) | 0);
    var col = f % GORE_COLS, row = (f / GORE_COLS) | 0;
    var size = screenLen(Math.max(60, booms.r[i] * GORE_VIS));   // floor so tiny grunts (mite r=8) still get a readable bloom, not a speck
    var sxs = worldToScreenX(booms.x[i]);
    var sys = worldToScreenY(booms.y[i]);
    if (sxs < -size || sxs > view.cssW + size || sys < -size || sys > view.cssH + size) return true;
    perf.boomSprites++;
    var a = k > 0.8 ? Math.max(0, (1 - k) / 0.2) : 1;       // the art self-thins; just ease the last 20%
    var ang = (i * 1.7) % TWO_PI;                            // per-boom spin so splashes don't all look identical
    return queueSpriteRot(GORE_KEY, col * GORE_CELL, row * GORE_CELL, GORE_CELL, GORE_CELL, sxs, sys, size, size, ang, 1, 1, 1, a);
  }

  // GORE GIB SPRITE (gore.kind===6): one textured ribcage chunk, tumbling (gore.a, advanced by gore.spin in
  // fx/gore.js updateGore) + fading as gore.life decays. Sized off the gore-piece radius. Drawn in the sprite
  // layer (alongside queueGoreSprite); the procedural addGoreInstances skips kind 6. One static-frame quad each.
  function queueGibSprite(i) {
    if (!sprites.textures[GIB_KEY]) return false;
    var size = screenLen(Math.max(16, gore.r[i] * GIB_VIS));   // floor so it reads even on a small grunt
    var sxs = worldToScreenX(gore.x[i]);
    var sys = worldToScreenY(gore.y[i]);
    if (sxs < -size || sxs > view.cssW + size || sys < -size || sys > view.cssH + size) return true;
    var fade = gore.life[i] < 0.6 ? Math.max(0, gore.life[i] / 0.6) : 1;   // ease out the last 0.6s
    perf.boomSprites++;
    return queueSpriteRot(GIB_KEY, 0, 0, GIB_CELL, GIB_CELL, sxs, sys, size, size, gore.a[i], 1, 1, 1, fade);
  }

  function queueWeaponProjectileSprite(i, angle) {
    if (!sprites.textures.weapon_projectiles) return false;
    var row = clampInt(bullets.row[i], 0, 3);
    var tier = clampInt(bullets.tier[i], 0, 5);
    var size = row === WEAPON_ROW.missile ? 30 : row === WEAPON_ROW.flak ? 18 : 28;   // Tim 2026-06-24: bullets SMALLER (cannon 42->28, flak 26->18, missile 44->30)
    var pxs = worldToScreenX(bullets.x[i]);
    var pys = worldToScreenY(bullets.y[i]);
    var screenSize = screenLen(size);
    if (pxs < -screenSize || pxs > view.cssW + screenSize || pys < -screenSize || pys > view.cssH + screenSize) return true;
    return queueSpriteRot('weapon_projectiles', tier * WEAPON_PROJECTILE_CELL, row * WEAPON_PROJECTILE_CELL, WEAPON_PROJECTILE_CELL, WEAPON_PROJECTILE_CELL, pxs, pys, screenSize, screenSize, angle, 1, 1, 1, 0.96);
  }

  // DEFERRED TURRET draw (R1): queueOldTankSprite stashes the live turret's exact draw args here instead of
  // queueing it into the main sprite batch; renderWorld flushes it in a SECOND sprite pass AFTER the vein
  // instances so the turret sits OVER the veins (veins beneath the turret, over the hull). Byte-identical args.
  var _tankTurret = { on: false, key: 'weapon_turrets', sx: 0, sy: 0, sw: 48, sh: 48, x: 0, y: 0, w: 0, h: 0, ang: 0, r: 1 };
  function queueTankTurretSprite() {
    if (!_tankTurret.on) return;
    var t = _tankTurret;
    if (sprites.textures[t.key]) queueSpriteRot(t.key, t.sx, t.sy, t.sw, t.sh, t.x, t.y, t.w, t.h, t.ang, t.r, 1, 1, 1);
  }

  function queueOldTankSprite(dead) {
    _tankTurret.on = false;   // cleared each frame; set true (with args) only on the layered LIVE-tank path below
    if (!OLD_TANK || !sprites.textures.tank_body || !sprites.textures.tank_turret) return false;
    var alive = tankRageLevel();
    // DEAD (Tim 2026-06-24): the wreck is a SCORCHED, SETTLED tank BASE - no breathe/bob, no hit-flash, a dark
    // burnt tint, and a slight collapse-squash. The live tank keeps its breathing/bob. (No turret + no core on
    // the dead base - the turret tore off and flew, the core/heart is gone.)
    var breathe = dead ? 0 : Math.sin(state.t * (3.4 + alive * 1.4));
    var breathAmp = (0.004 + alive * 0.012) + (player.unleash > 0 ? 0.008 : 0);
    var breathW = dead ? 1 : 1 + breathe * breathAmp;
    var breathH = dead ? 1 : 1 - breathe * breathAmp * 0.55;
    var liveBob = dead ? 0 : Math.sin(state.t * 4.2 + alive) * screenLen(alive * 0.9 + (player.unleash > 0 ? 0.6 : 0));
    var bob = dead ? 0 : Math.round(Math.sin(state.t * 8.5) * 1.15 + liveBob);
    var sx = view.cssW * 0.5;
    var sy = view.cssH * 0.5 + bob;
    var hot = dead ? 0 : Math.max(player.hurt, player.recoil * 0.5);
    if (TANK_LAYERS && sprites.textures.lp_treads && sprites.textures.lp_armor && (sprites.textures.weapon_turrets || sprites.textures.lp_cannon)) {
      var size = screenLen(92);
      var hullA = player.hull + Math.PI * 0.5;
      var turretA = player.turret + Math.PI * 0.5;
      var pulse = 0.5 + 0.5 * Math.sin(state.t * 8.0);
      // WRECK tint + collapse-squash: a dark warm scorch (burnt steel) + the hull settles ~10% flatter so it
      // reads as a destroyed, slumped base rather than the crisp live chassis. Live tank = identity (1,1,1).
      var wr = dead ? 0.40 : 1, wg = dead ? 0.345 : 1, wb = dead ? 0.32 : 1;   // scorched gunmetal multiplier
      var deadSquash = dead ? 0.90 : 1;                                          // settle the hull a touch flatter
      var tankLayerSprites = 3;
      queueSpriteRot('lp_treads', econ.tankTreads * 64, 0, 64, 64, sx, sy, size * (1 + hot * 0.06), size * deadSquash, hullA, wr * (1 + hot * 0.12), wg, wb, 0.98);
      queueSpriteRot('lp_armor', econ.tankArmor * 64, 0, 64, 64, sx, sy, size * breathW, size * breathH * deadSquash, hullA, wr * (1 + hot * 0.18), wg, wb, 0.98);
      if (sprites.textures.lp_thirst) {
        queueSpriteRot('lp_thirst', econ.tankThirst * 64, 0, 64, 64, sx, sy + breathe * screenLen(0.6), size * (1 + (breathW - 1) * 1.35), size * (1 + (breathH - 1) * 1.2) * deadSquash, hullA, wr, wg, wb, 0.96);
        tankLayerSprites++;
      }
      // CORE layer (the heart-glow): LIVE tank only - the dead base has no beating core (heart removed Tim 2026-06-24).
      if (!dead && sprites.textures.lp_core && econ.tankCore > 0) {
        queueSpriteRot('lp_core', econ.tankCore * 64, 0, 64, 64, sx, sy + breathe * screenLen(0.8), size * (1 + (breathW - 1) * 1.7), size * (1 + (breathH - 1) * 1.7), hullA, 1 + pulse * 0.04, 1, 1, 0.9);
        tankLayerSprites++;
      }
      // TURRET: LIVE tank only. On death the gun tore off + flew (tankDebris) so the base has NO turret. (Live:
      // R1 defers the turret to a 2nd sprite pass AFTER the veins so it draws OVER them - byte-identical args.)
      if (dead) {
        perf.tankSprites = tankLayerSprites;   // base layers only; no deferred turret
        return true;
      }
      if (sprites.textures.weapon_turrets) {
        _tankTurret.on = true; _tankTurret.key = 'weapon_turrets';
        var wtier = weaponAtlasTier(econ.equipWeapon);
        _tankTurret.sx = wtier * WEAPON_TURRET_CELL; _tankTurret.sy = weaponRow(econ.equipWeapon) * WEAPON_TURRET_CELL;
        _tankTurret.sw = WEAPON_TURRET_CELL; _tankTurret.sh = WEAPON_TURRET_CELL;
        _tankTurret.x = sx + Math.cos(player.turret) * screenLen(player.recoil * 3); _tankTurret.y = sy + Math.sin(player.turret) * screenLen(player.recoil * 3);
        var tsz = 75 + wtier * 2;   // Tim 2026-06-24 r3: atlas content now has a 0.80 MARGIN (gun never cropped at the cell edge), so the cell render is bumped 1.25x to keep the drawn gun's size: cell tier0=75 -> tier5=85 => net drawn gun ~60 (tier0) -> ~68 (tier5), full gun visible at every tier, no edge crop
        _tankTurret.w = screenLen(tsz); _tankTurret.h = screenLen(tsz); _tankTurret.ang = player.turret; _tankTurret.r = 1 + hot * 0.22;
      } else {
        _tankTurret.on = true; _tankTurret.key = 'lp_cannon';
        _tankTurret.sx = econ.tankCannon * 64; _tankTurret.sy = 0; _tankTurret.sw = 64; _tankTurret.sh = 64;
        _tankTurret.x = sx + Math.cos(player.turret) * screenLen(player.recoil * 3); _tankTurret.y = sy + Math.sin(player.turret) * screenLen(player.recoil * 3);
        _tankTurret.w = size; _tankTurret.h = size; _tankTurret.ang = turretA; _tankTurret.r = 1 + hot * 0.22;
      }
      perf.tankSprites = tankLayerSprites + 1;   // +1 for the deferred turret (flushed separately)
      return true;
    }
    // SIMPLE tank (baseline look, matches the frozen :8334 build). REVERTED 2026-06-23 (Tim: "ONLY
    // tank death animation was supposed to change, you changed the way tank looks") - rolled back the
    // 160x160 biomech body swap, the 96px hull size, and the weapon_turrets-atlas turret. Restores the
    // original 32x32 tank_body + generic tank_turret at the baseline screenLen(68/72).
    var hullSize = screenLen(68);
    queueSpriteRot('tank_body', 0, 0, sprites.meta.tank_body.w, sprites.meta.tank_body.h, sx, sy, hullSize * breathW, hullSize * breathH, player.hull + Math.PI * 0.5, 1 + hot * 0.18, 1, 1, 0.98);
    queueSpriteRot('tank_turret', 0, 0, sprites.meta.tank_turret.w, sprites.meta.tank_turret.h, sx + Math.cos(player.turret) * screenLen(player.recoil * 3), sy + Math.sin(player.turret) * screenLen(player.recoil * 3), screenLen(72), screenLen(72), player.turret + Math.PI * 0.5, 1 + hot * 0.22, 1, 1, 1);
    perf.tankSprites = 2;
    return true;
  }

  // The torn-off TURRET in flight (DEATH; Tim "tower tiering off the tank and flying away, dropping and
  // exploding"). Reuses the SAME weapon_turrets atlas cell that was on the tank (snapshot at death in
  // destroyTank) so the flying piece IS the gun. Tracked in WORLD space (tankDebris.x/y, advanced in
  // update.js advanceTankDebris) and projected like every other world sprite; the visual HEIGHT `z` reads
  // as (a) a screen offset upward (it lifts off the ground) and (b) a slight scale-up while high (nearer the
  // camera). Spins by `spin`. Airborne = a hot/bright tint; after landing (exploded) = a dim scorched wreck on
  // the ground. Drawn in the SPRITE layer (alpha-blended, like the corpse/boom sprites). Alloc-free scalars.
  function queueTankDebrisSprite() {
    if (!tankDebris.active || !sprites.textures.weapon_turrets) return false;
    var d = tankDebris;
    var sxs = worldToScreenX(d.x);
    var sys = worldToScreenY(d.y) - screenLen(d.z);   // height lifts the sprite UP the screen so it reads as airborne
    var hi = Math.max(0, Math.min(1, d.z / 220));      // 0 on the ground .. ~1 at apex
    var sizeBase = d.size * (1 + hi * 0.28);           // a touch bigger while high (perspective), settles to base on landing
    var size = screenLen(sizeBase);
    if (sxs < -size || sxs > view.cssW + size || sys < -size || sys > view.cssH + size) return true;
    var r, g, b, a;
    if (!d.exploded) { r = 1 + hi * 0.5; g = 1; b = 1; a = 1; }           // airborne: hot, fully opaque
    else { r = 0.62; g = 0.58; b = 0.55; a = Math.max(0, 1 - d.t * 0.18); } // landed scorched wreck, slowly fades with the wreck
    perf.boomSprites++;
    return queueSpriteRot('weapon_turrets', d.cell * WEAPON_TURRET_CELL, d.row * WEAPON_TURRET_CELL, WEAPON_TURRET_CELL, WEAPON_TURRET_CELL, sxs, sys, size, size, d.spin, r, g, b, a);
  }

  // The EXPOSED biomech HEART revealed when the tank BODY dies (R3, Tim 2026-06-24): as the hull ruptures and
  // bleeds out, the war machine's heart (heart_core sprite, cropped from the CC0 heartcore_pulse art) is laid
  // bare at the wreck. It PULSES on state.tankBeat - and because tankBeatRate EASES to 0 on death (update.js),
  // the pulse visibly SLOWS then STOPS, the heart going still. Drawn in the WORLD sprite layer at the wreck
  // (player.x/y, where the suppressed live chassis was). The vein instances (addTankVeinInstances) keep drawing
  // during death, frozen, flowing INTO this heart. Fades out over the back half of the death window with the wreck.
  function queueTankHeartSprite() {
    if (!player.dead || !sprites.textures.heart_core) return false;
    var meta = sprites.meta.heart_core;
    // pulse amplitude scales with the CURRENT beat rate (state.tankBeatRate): full throb while the rate is high,
    // easing to a dead-still heart as the rate -> 0. So the heart is seen beating then stopping.
    var amp = 0.16 * Math.min(1, state.tankBeatRate / 2.4);
    var beatScale = 1 + Math.sin(state.tankBeat) * amp;
    var size = screenLen(58) * beatScale;
    var sxs = worldToScreenX(player.x);
    var sys = worldToScreenY(player.y);
    // brighten the red as it beats; dim toward the end of the death window as the wreck settles/fades
    var lifeFade = state.deathT > 0.45 ? 1 : Math.max(0.25, state.deathT / 0.45);
    var glowR = 1 + 0.25 * Math.max(0, Math.sin(state.tankBeat)) * Math.min(1, state.tankBeatRate / 2.4);
    if (sxs < -size || sxs > view.cssW + size || sys < -size || sys > view.cssH + size) return true;
    perf.boomSprites++;
    return queueSpriteRot('heart_core', 0, 0, meta.w, meta.h, sxs, sys, size, size, player.hull + Math.PI * 0.5, glowR, 0.92, 0.92, lifeFade);
  }
  function addVeinTrailInstances(n) {
    if (!VEIN_FX || veins.count <= 0) {
      perf.veins = 0;
      perf.veinInst = 0;
      return n;
    }
    var start = n;
    var margin = viewWorldMax() * 0.72;
    for (var i = 0; i < veins.count; i++) {
      var x = veins.x[i], y = veins.y[i];
      if (Math.abs(x - player.x) > margin || Math.abs(y - player.y) > margin) continue;
      var grow = veins.grow[i];
      var fade = veins.life[i] < 1.15 ? Math.max(0, veins.life[i] / 1.15) : 1;
      var pulse = 0.25 + 0.22 * Math.sin(state.t * 7.0 + i * 1.31);
      var len = veins.len[i] * grow;
      var a = veins.a[i];
      var ex1 = x + Math.cos(a) * len;
      var ey1 = y + Math.sin(a) * len;
      var ca = a + Math.PI * 0.5;
      var bow = veins.curl[i] * len * 0.42;
      var mx0 = x + Math.cos(a) * len * 0.52 + Math.cos(ca) * bow;
      var my0 = y + Math.sin(a) * len * 0.52 + Math.sin(ca) * bow;
      n = addCurveInst(n, x, y, mx0, my0, ex1, ey1, 5.2, 0.18, 0.015, 0.025, 0.42 * fade, 0, 3);
      n = addCurveInst(n, x, y, mx0, my0, ex1, ey1, 2.0, 0.86, 0.07, 0.10, (0.32 + pulse) * fade, 0.25, 3);
      if (veins.b1l[i] > 0.5) {
        var b1 = veins.b1a[i];
        var bl1 = veins.b1l[i] * grow;
        var bx1 = x + Math.cos(b1) * bl1;
        var by1 = y + Math.sin(b1) * bl1;
        n = addLineInst(n, x, y, bx1, by1, 3.5, 0.18, 0.015, 0.025, 0.34 * fade, 0);
        n = addLineInst(n, x, y, bx1, by1, 1.4, 0.82, 0.055, 0.075, 0.30 * fade, 0.18);
      }
      if (veins.b2l[i] > 0.5) {
        var b2 = veins.b2a[i];
        var bl2 = veins.b2l[i] * grow;
        var bx2 = x + Math.cos(b2) * bl2;
        var by2 = y + Math.sin(b2) * bl2;
        n = addLineInst(n, x, y, bx2, by2, 3.0, 0.16, 0.012, 0.022, 0.26 * fade, 0);
        n = addLineInst(n, x, y, bx2, by2, 1.2, 0.82, 0.05, 0.07, 0.22 * fade, 0.15);
      }
      n = addInst(n, x, y, 3.6, 3.6, 0, 0, 0.62, 0.035, 0.055, 0.45 * fade, 0.18);
    }
    perf.veins = veins.count;
    perf.veinInst = n - start;
    return n;
  }

  function addGoreSplatInstances(n) {
    if (!GORE_FX || splats.count <= 0) {
      perf.splats = 0;
      perf.splatInst = 0;
      return n;
    }
    var start = n;
    var margin = viewWorldMax() * 0.78;
    for (var i = 0; i < splats.count; i++) {
      var x = splats.x[i], y = splats.y[i];
      if (Math.abs(x - player.x) > margin || Math.abs(y - player.y) > margin) continue;
      var fade = splats.max[i] > 0 ? clamp(splats.life[i] / splats.max[i], 0, 1) : 1;
      var a = splats.ang[i];
      var r = splats.r[i];
      var v = splats.vary[i] || 1;
      var kind = splats.kind[i];
      // OLD-ART SPLATS (restored to the :8334 baseline, Tim 2026-06-23): subtle dark blood stains, NOT the
      // bright contrast-ring puddles - the dying-creature SPRITE is the star, splats are just ground residue.
      if (kind === 1) {   // tech/oil splat: dark mechanical fluid
        n = addInst(n, x, y, r * 0.88 * v, r * 0.52 / v, a, 0, 0.055, 0.047, 0.048, 0.42 * fade, 0);
        n = addInst(n, x + Math.cos(a) * r * 0.16, y + Math.sin(a) * r * 0.12, r * 0.42, r * 0.22, -a, 0, 0.28, 0.25, 0.23, 0.24 * fade, 0);
      } else if (kind === 2) {   // blood spray splat
        n = addInst(n, x, y, r * 1.12 * v, r * 0.46 / v, a, 0, 0.15, 0.004, 0.014, 0.58 * fade, 0);
        n = addInst(n, x + Math.cos(a + 1.8) * r * 0.22, y + Math.sin(a + 1.8) * r * 0.18, r * 0.44, r * 0.30, a - 0.55, 0, 0.34, 0.020, 0.036, 0.30 * fade, 0);
      } else if (kind === 3) {   // blood pool splat
        n = addInst(n, x, y, r * 0.84, r * 0.74, a, 0, 0.13, 0.005, 0.017, 0.54 * fade, 0);
        n = addInst(n, x + Math.cos(a) * r * 0.32, y + Math.sin(a) * r * 0.22, r * 0.36, r * 0.23, a + 0.95, 0, 0.33, 0.020, 0.038, 0.30 * fade, 0);
        n = addInst(n, x - Math.cos(a + 0.72) * r * 0.28, y - Math.sin(a + 0.72) * r * 0.20, r * 0.28, r * 0.18, a - 1.35, 0, 0.42, 0.032, 0.050, 0.24 * fade, 0);
      } else {   // default blood splat
        n = addInst(n, x, y, r * v, r * 0.68 / v, a, 0, 0.14, 0.006, 0.018, 0.62 * fade, 0);
        n = addInst(n, x - Math.cos(a) * r * 0.22, y + Math.sin(a) * r * 0.16, r * 0.36, r * 0.23, a + 0.9, 0, 0.34, 0.026, 0.046, 0.34 * fade, 0);
      }
    }
    perf.splats = splats.count;
    perf.splatInst = n - start;
    return n;
  }

  function addGoreInstances(n) {
    if (!GORE_FX || gore.count <= 0) {
      perf.gorePieces = 0;
      perf.goreInst = 0;
      return n;
    }
    var start = n;
    var margin = viewWorldMax() * 0.82;
    var cheap = enemies.count > 900 || gore.count > 280 || perf.renderAvg > 10;
    // OLD-ART GORE (restored to the :8334 baseline look, Tim 2026-06-23): the chunky shaded red/metal GIBS were
    // "bad" - the death SPRITE animation (queueOldCorpseSprite, the _death sheets) is meant to BE the death, with
    // only a subtle dark spray/splat for impact. Whatever little gore spawns (counts gutted in fx/gore.js
    // spawnGoreBurst) renders subtle + dark here so it never competes with the dying-creature sprite.
    for (var i = 0; i < gore.count; i++) {
      var x = gore.x[i], y = gore.y[i];
      if (Math.abs(x - player.x) > margin || Math.abs(y - player.y) > margin) continue;
      var kind = gore.kind[i];
      if (kind === 6) continue;   // rib GIB: SPRITE-only (queueGibSprite in the sprite layer); no procedural draw
      var fade = gore.life[i] < 0.5 ? Math.max(0, gore.life[i] / 0.5) : 1;
      var r = gore.r[i];
      var a = gore.a[i];
      if (cheap) {
        if (kind === 3) n = addInst(n, x, y, r, r * 0.62, a, 1, 0.45, 0.45, 0.49, fade, 0);
        else if (kind === 4) n = addLineInst(n, x - Math.cos(a) * r, y - Math.sin(a) * r, x + Math.cos(a) * r, y + Math.sin(a) * r, 2.0, 0.64, 0.06, 0.09, fade, 0);
        else if (kind === 2) n = addInst(n, x, y, r * 0.55, r * 1.05, a, 1, 0.74, 0.68, 0.55, fade, 0);
        else if (kind === 5) n = addInst(n, x, y, r * 0.8, r * 0.8, 0, 0, 1.0, 0.72, 0.26, fade * 0.85, 0.4);
        else n = addInst(n, x, y, r, r, a, 1, 0.62, 0.03, 0.065, fade, 0);
        continue;
      }
      if (kind === 0) {
        var sp = Math.abs(gore.vx[i]) + Math.abs(gore.vy[i]);
        var trail = Math.min(r * 5.2, sp * 0.018);
        var ba = Math.atan2(gore.vy[i], gore.vx[i]);
        n = addInst(n, x, y, r, r * 0.82, ba, 0, 0.72, 0.025, 0.055, 0.82 * fade, 0);
        if (trail > r * 1.3) n = addLineInst(n, x, y, x - Math.cos(ba) * trail, y - Math.sin(ba) * trail, r * 1.2, 0.64, 0.02, 0.045, 0.48 * fade, 0);
      } else if (kind === 1) {
        n = addInst(n, x, y, r, r * 0.9, a, 0, 0.46, 0.018, 0.035, 0.92 * fade, 0);
        n = addInst(n, x - Math.cos(a) * r * 0.22, y - Math.sin(a) * r * 0.18, r * 0.45, r * 0.38, a, 0, 0.78, 0.06, 0.08, 0.62 * fade, 0);
      } else if (kind === 2) {
        n = addInst(n, x, y, r * 0.48, r * 1.15, a, 1, 0.78, 0.72, 0.60, 0.88 * fade, 0);
        n = addInst(n, x + Math.cos(a) * r * 0.12, y + Math.sin(a) * r * 0.12, r * 0.38, r * 0.32, a, 1, 0.52, 0.47, 0.36, 0.42 * fade, 0);
      } else if (kind === 3) {
        n = addInst(n, x, y, r * 1.15, r * 0.55, a, 1, 0.37, 0.36, 0.40, 0.95 * fade, 0);
        n = addInst(n, x - Math.sin(a) * r * 0.18, y + Math.cos(a) * r * 0.18, r * 1.0, 1.2, a, 1, 0.62, 0.64, 0.70, 0.55 * fade, 0);
      } else if (kind === 4) {
        var curl = Math.sin(state.t * 4.2 + i) * r * 0.28;
        n = addCurveInst(n, x - Math.cos(a) * r, y - Math.sin(a) * r, x + Math.sin(a) * curl, y - Math.cos(a) * curl, x + Math.cos(a) * r, y + Math.sin(a) * r, 2.1, 0.64, 0.055, 0.08, 0.86 * fade, 0, 2);
      } else {
        n = addInst(n, x, y, r * 0.78, r * 0.78, 0, 0, 1.0, 0.68, 0.23, 0.82 * fade, 0.55);
      }
    }
    perf.gorePieces = gore.count;
    perf.goreInst = n - start;
    return n;
  }

  function addExplosionInstances(n) {
    if (booms.count <= 0) {
      perf.booms = 0;
      perf.boomInst = 0;
      return n;
    }
    var start = n;
    var margin = viewWorldMax() * 0.84;
    for (var i = 0; i < booms.count; i++) {
      var kind = booms.kind[i];
      if (kind === 2 && sprites.ready && sprites.textures.explosion) continue;   // fireball: drawn in the SPRITE layer (queueExplosionSprite); fall through to the procedural fire puff if sprites aren't ready
      if (kind === 3) continue;                                                   // blood-splash: SPRITE-ONLY (queueGoreSprite); no procedural fallback (it's purely cosmetic gore)
      var x = booms.x[i], y = booms.y[i];
      if (Math.abs(x - player.x) > margin || Math.abs(y - player.y) > margin) continue;
      var k = booms.t[i] / Math.max(0.001, booms.max[i]);
      var fade = 1 - k;
      var r = booms.r[i] * (0.35 + k * 1.35);
      if (kind === 4) {
        // METAL SHRAPNEL (Tim 2026-06-23): tech/mechanical deaths fling gunmetal debris (the rock-rubble burst,
        // re-tinted cold steel - NO dust cloud, NO fire). A bright spark glint leads, then 8 plates tumble out.
        if (k < 0.2) n = addInst(n, x, y, r * (0.45 + k * 2.0), r * (0.45 + k * 2.0), 0, 0, 1.0, 0.85, 0.5, 0.55 * (1 - k / 0.2), 0.7);   // hot spark flash at the break
        var mchunks = 8;
        for (var ms = 0; ms < mchunks; ms++) {
          var ma = ms * (TWO_PI / mchunks) + i * 0.7;
          var mspd = 0.8 + ((ms * 7 + i * 3) % 5) * 0.24;        // fast, far throw (shrapnel)
          var mrr = r * (0.25 + k * (1.35 + mspd));
          var mcs = r * (0.16 + ((ms * 5 + i) % 4) * 0.07);      // varied plate size
          var mca = ma * 2.6 + k * 13;                           // hard tumble
          var msh = 0.5 + ((ms + i) % 3) * 0.16;                 // varied gunmetal tone
          n = addInst(n, x + Math.cos(ma) * mrr, y + Math.sin(ma) * mrr, mcs, mcs * 0.66, mca, 1, 0.34 * msh + 0.12, 0.36 * msh + 0.13, 0.42 * msh + 0.16, (0.92 * fade) * (1 - k * 0.25), 0);
        }
      } else if (kind === 1) {
        // STONE-SHATTER (Tim 2026-06-23, PUSHED FURTHER): the animated grey-brown DUST cloud is now the
        // explosion.png ash frames drawn as a sprite (queueExplosionSprite dust mode); here we throw the PUNCHY
        // RUBBLE - a bright impact flash + 8 big chunks flung far + tumbling (deterministic trig scatter off the
        // boom age `k`, no alloc). Rock breaks are sparse (never a simultaneous horde), so 9 inst/boom is safe.
        if (k < 0.22) n = addInst(n, x, y, r * (0.5 + k * 2.2), r * (0.4 + k * 1.8), i * 0.5, 0, 0.86, 0.80, 0.70, 0.5 * (1 - k / 0.22), 0.2);   // bright dust-burst impact flash
        var chunks = 8;
        for (var s = 0; s < chunks; s++) {
          var a = s * (TWO_PI / chunks) + i * 0.7;                 // even fan, per-boom rotation offset
          var spd = 0.7 + ((s * 7 + i * 3) % 5) * 0.22;           // varied, FARther throw (was 0.55 + .14)
          var rr = r * (0.25 + k * (1.25 + spd));                  // flies outward harder as the boom ages
          var cs = r * (0.2 + ((s * 5 + i) % 4) * 0.08);          // BIGGER, varied chunk size (was 0.13 + .05)
          var ca = a * 2.3 + k * 11;                               // tumble (rotates as it flies)
          var shade = 0.5 + ((s + i) % 3) * 0.13;                  // varied rock tone
          n = addInst(n, x + Math.cos(a) * rr, y + Math.sin(a) * rr, cs, cs * 0.72, ca, 1, 0.46 * shade + 0.18, 0.40 * shade + 0.15, 0.34 * shade + 0.12, (0.92 * fade) * (1 - k * 0.25), 0);
        }
      } else {
        n = addInst(n, x, y, r, r, 0, 0, 0.95, 0.16, 0.08, 0.22 * fade, 0.3);
        n = addInst(n, x, y, r * 0.42, r * 0.42, 0, 0, 1.0, 0.43, 0.16, 0.55 * fade, 0.6);
        for (var b = 0; b < 5; b++) {
          var ba = b * TWO_PI / 5 + i * 0.41;
          var br = r * (0.30 + k * 0.65);
          n = addInst(n, x + Math.cos(ba) * br, y + Math.sin(ba) * br, r * 0.13, r * 0.13, 0, 0, 1.0, 0.28, 0.12, 0.46 * fade, 0.5);
        }
      }
    }
    perf.booms = booms.count;
    perf.boomInst = n - start;
    return n;
  }

  function addBubbleInstances(n) {
    if (bubbles.count <= 0) {
      perf.bubbles = 0;
      perf.bubbleInst = 0;
      return n;
    }
    var start = n;
    for (var i = 0; i < bubbles.count; i++) {
      var p = bubbles.t[i] / Math.max(0.001, bubbles.max[i]);
      var pop = p > 0.74 ? (p - 0.74) / 0.26 : 0;
      var grow = p < 0.3 ? p / 0.3 : 1;
      var r = bubbles.r[i] * (grow + pop * 0.9);
      var a = (1 - pop) * 0.62;
      n = addInst(n, bubbles.x[i], bubbles.y[i], r, r, 0, 0, 0.54, 0.02, 0.055, a, 0.25);
      n = addInst(n, bubbles.x[i] - r * 0.28, bubbles.y[i] - r * 0.28, r * 0.28, r * 0.28, 0, 0, 1.0, 0.18, 0.20, a * 0.55, 0.4);
    }
    perf.bubbles = bubbles.count;
    perf.bubbleInst = n - start;
    return n;
  }

  function addLeechInstances(n) {
    if (!LEECH_FX || MAX_LEECHES <= 0) {
      perf.leechInst = 0;
      return n;
    }
    var start = n;
    var lvl = currentLeechLevel();
    var slots = Math.min(MAX_LEECHES, lvl > 0 ? 2 + lvl : 0);
    if (slots <= 0) {
      perf.leechInst = 0;
      return n;
    }
    for (var i = 0; i < slots; i++) {
      var grab = leeches.grab[i];
      var target = leeches.target[i];
      if (grab <= 0.02 && target < 0) continue;
      var rootA = (i / slots) * TWO_PI + state.t * 0.42;
      var rx = player.x + Math.cos(rootA) * 15;
      var ry = player.y + Math.sin(rootA) * 15;
      var tx, ty, latched = target >= 0 && target < enemies.count;
      if (latched) {
        tx = enemies.x[target];
        ty = enemies.y[target];
      } else {
        var idle = 30 + lvl * 4;
        tx = player.x + Math.cos(rootA) * idle;
        ty = player.y + Math.sin(rootA) * idle;
      }
      var reach = Math.max(0.16, grab);
      var tipX = rx + (tx - rx) * reach;
      var tipY = ry + (ty - ry) * reach;
      var dx = tipX - rx;
      var dy = tipY - ry;
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      var nx = -dy / len;
      var ny = dx / len;
      var wob = Math.sin(state.t * 5.4 + leeches.phase[i]) * Math.min(17, len * 0.16) * (0.72 + lvl * 0.055);
      var c1x = rx + dx * 0.38 + nx * wob;
      var c1y = ry + dy * 0.38 + ny * wob;
      var mx = rx + dx * 0.62 + nx * wob * 0.22;
      var my = ry + dy * 0.62 + ny * wob * 0.22;
      var c2x = rx + dx * 0.82 - nx * wob * 0.55;
      var c2y = ry + dy * 0.82 - ny * wob * 0.55;
      var bodyA = latched ? 0.68 : 0.38;
      n = addCurveInst(n, rx, ry, c1x, c1y, mx, my, 6.6 + lvl * 0.18, 0.10, 0.004, 0.015, bodyA, 0, 2);
      n = addCurveInst(n, mx, my, c2x, c2y, tipX, tipY, 6.6 + lvl * 0.18, 0.10, 0.004, 0.015, bodyA, 0, 2);
      if (latched && grab > 0.38) {
        var pulse = 0.45 + 0.25 * Math.sin(state.t * 18 + i);
        n = addCurveInst(n, rx, ry, c1x, c1y, mx, my, 2.3 + lvl * 0.1, 1.0, 0.13, 0.16, 0.72 + pulse * 0.24, 0.62, 2);
        n = addCurveInst(n, mx, my, c2x, c2y, tipX, tipY, 2.3 + lvl * 0.1, 1.0, 0.13, 0.16, 0.72 + pulse * 0.24, 0.62, 2);
        var ba = Math.atan2(tipY - c2y, tipX - c2x);
        var barb = 6.4;
        n = addLineInst(n, tipX, tipY, tipX + Math.cos(ba - 2.45) * barb, tipY + Math.sin(ba - 2.45) * barb, 2.0, 1.0, 0.16, 0.18, 0.86, 0.5);
        n = addLineInst(n, tipX, tipY, tipX + Math.cos(ba + 2.45) * barb, tipY + Math.sin(ba + 2.45) * barb, 2.0, 1.0, 0.16, 0.18, 0.86, 0.5);
      }
    }
    perf.leechInst = n - start;
    return n;
  }

  // RESURRECT VEINS (Tim 2026-06-24 FIX 3): during the reverse-assembly, leech-style biomech tendrils connect the
  // tank BASE (player.x/y) to the torn-off / returning TOWER (tankDebris.x/y) and read as VEINS PULLING the tower
  // back down onto the base. Same curve look as addLeechInstances (a dark always-on blood-red body via addCurveInst
  // + a bright additive pulse overlay). Driven by the assembly PROGRESS (1 - max(0,assembleT)/assembleMax, 0->1):
  // as the tower returns the cords THICKEN + the wobble TIGHTENS (taut) + the pulse BRIGHTENS = "contracting,
  // pulling together". The tendrils also shorten on their own because tankDebris lerps back to player.x/y
  // (advanceResurrect, update.js). Only active while revivePhase==='assembling' && tankDebris.active. Drawn after
  // addLeechInstances in renderWorld, so it sits over the tank sprites. Alloc-free scalars; capped tendril count.
  function addResurrectVeinInstances(n) {
    if (!VEIN_FX || state.revivePhase !== 'assembling' || !tankDebris.active) { perf.resurrectVeinInst = 0; return n; }
    var start = n;
    var progress = 1 - Math.max(0, state.assembleT) / (state.assembleMax || 1);   // 0 at the start of assembly -> 1 fully reseated
    if (progress < 0) progress = 0; else if (progress > 1) progress = 1;
    var taut = 1 - progress * 0.7;            // wobble amplitude factor: slack early, taut as it contracts
    var tendrils = 4;                          // 3-5 leech-style cords (Tim)
    var ease = progress * progress * (3 - 2 * progress);   // smoothstep for the brightening pulse
    for (var i = 0; i < tendrils; i++) {
      var rootA = (i / tendrils) * TWO_PI + state.t * 0.5;
      var rx = player.x + Math.cos(rootA) * 14;            // root ring on the BASE
      var ry = player.y + Math.sin(rootA) * 14;
      // target a small ring around the returning tower so the cords don't all collapse to one point
      var tipX = tankDebris.x + Math.cos(rootA) * 9;
      var tipY = tankDebris.y + Math.sin(rootA) * 9;
      var dx = tipX - rx, dy = tipY - ry;
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      var nx = -dy / len, ny = dx / len;
      var wob = Math.sin(state.t * 6.2 + i * 1.7) * Math.min(20, len * 0.14) * taut;   // tightens as progress -> 1
      var c1x = rx + dx * 0.38 + nx * wob, c1y = ry + dy * 0.38 + ny * wob;
      var mx = rx + dx * 0.6 + nx * wob * 0.3, my = ry + dy * 0.6 + ny * wob * 0.3;
      var c2x = rx + dx * 0.82 - nx * wob * 0.5, c2y = ry + dy * 0.82 - ny * wob * 0.5;
      var width = 2.2 + progress * 5.4;        // THICKENS as the tower seats (pulling harder)
      // dark always-on cord body (blood-red, like the leech body)
      n = addCurveInst(n, rx, ry, c1x, c1y, mx, my, width, 0.12, 0.004, 0.016, 0.78, 0, 2);
      n = addCurveInst(n, mx, my, c2x, c2y, tipX, tipY, width, 0.12, 0.004, 0.016, 0.78, 0, 2);
      // bright additive pulse running the cord - brightens with progress = the contracting "pull" glow
      var pulse = 0.5 + 0.3 * Math.sin(state.t * 16 + i);
      var pa = (0.4 + ease * 0.5) * (0.7 + pulse * 0.3);
      var pw = width * 0.42;
      n = addCurveInst(n, rx, ry, c1x, c1y, mx, my, pw, 1.0, 0.14, 0.17, pa, 0.6, 2);
      n = addCurveInst(n, mx, my, c2x, c2y, tipX, tipY, pw, 1.0, 0.14, 0.17, pa, 0.6, 2);
    }
    perf.resurrectVeinInst = n - start;
    return n;
  }

  // FLOWING VEINS + PULSE on the tank (Feature C, ported from the webgl build's drawTankSprite vein overlay,
  // Tim: "I like the vein flow and pulsating on the tank"). The webgl original is Canvas2D: a Path2D of vein
  // curves stroked twice - a DARK always-on structure (source-over) then a BRIGHT additive pulse whose dashes
  // SCROLL inward (setLineDash + animated lineDashOffset = "blood flowing"), all throbbing on a `heartBeat`
  // clock that beats faster at low HP. Our build is WebGL2-instanced (no Canvas2D setLineDash), so the flow is
  // reproduced with the instanced primitives: each vein = a dark structure CURVE (always visible, alpha throbs
  // with state.tankBeat) + a bright highlight CURVE (additive `pulse`, brightens on heal/rage) + a bright
  // BLOOD BEAD that travels rim->heart ALONG the curve (a moving additive blob, phase-offset per vein, looping)
  // = the "flow". Plus a faint breathing AURA blob (the webgl radial-gradient aura), faint until the Heart Core
  // /rage grows it. Drawn OVER the existing layered chassis (does NOT touch the body/turret sprites or scale).
  // All in WORLD space centered on the tank (player.x/y = screen centre) and ROTATED with player.hull so the
  // veins ride the chassis as it turns - exactly like the webgl chassis-local frame. Alloc-free scalar math.
  // The vein anchors (rim angle in the hull frame + a curl) are a small fixed table; reach ~ the chassis body.
  var TANK_VEINS = [
    // [rimAngleOffset(rad, in hull frame), reach(world px from centre), curlSign]
    [-0.55, 21, 1], [0.55, 21, -1], [Math.PI - 0.5, 20, -1], [Math.PI + 0.5, 20, 1], [Math.PI * 0.5, 16, 1]
  ];
  function addTankVeinInstances(n) {
    // LIVE-tank vein-flow + pulse ONLY (Feature C). On death the veins no longer draw: the exposed-heart image
    // they used to flow into was REMOVED (Tim 2026-06-24), and the wreck is now a scorched tank base, so veins
    // riding a dead hull would read wrong. Gate them to the live tank.
    if (!TANK_LAYERS || player.dead) {
      perf.tankVeinInst = 0;
      return n;
    }
    var start = n;
    var beat = state.tankBeat;
    var rage = tankRageLevel();
    var heal = player.healGlow;                                   // heal flush = the webgl feedGlow brighten
    var unl = player.unleash > 0 ? 1 : 0;
    // core "grown" factor (faint veins at base, prominent once upgraded) - mirrors the webgl (0.3 + 0.7*mCore)
    var coreF = Math.min(1, (econ.tankCore + econ.tankThirst * 0.5) / 6);
    var beatN = 0.5 + 0.5 * Math.sin(beat);                       // 0..1 heart-beat envelope
    var ragePulse = rage * (0.55 + 0.45 * Math.sin(beat * 1.5 + 1));
    var hull = player.hull;
    var ch = Math.cos(hull), shh = Math.sin(hull);
    var px = player.x, py = player.y;
    // BREATHING AURA: a SMALL, restrained red glow that swells with the beat (the webgl tank's aura is subtle,
    // not a flood - and addTankFeelInstances already adds the big core/unleash glow at high rage, so keep this
    // TIGHT so the veins stay the star). One tight additive blob; faint until the core/rage grows it.
    var auraA = (0.07 + 0.07 * beatN) * (0.35 + 0.65 * coreF) + heal * 0.14 + ragePulse * 0.08;
    if (auraA > 0.012) {
      var ar = 22 + 6 * beatN + heal * 6;
      n = addInst(n, px, py, ar, ar * 0.82, hull, 0, 1.0, 0.05, 0.09, Math.min(0.26, auraA), 0.5);
    }
    // THE VEINS: dark structure curve + bright throbbing highlight + a flowing blood bead, per vein.
    var flowSpeed = 0.55 + rage * 0.55 + heal * 0.9 + unl * 0.7;  // beads run faster when feeding/raging
    var flowClock = state.t * flowSpeed;
    for (var i = 0; i < TANK_VEINS.length; i++) {
      var v = TANK_VEINS[i];
      var ra = hull + v[0];                                       // rim anchor angle (hull-relative)
      var reach = v[1];
      // rim point (local rotated into world) and the curve control point (bowed sideways for an organic bend)
      var rx = px + Math.cos(ra) * reach;
      var ry = py + Math.sin(ra) * reach;
      var perp = ra + Math.PI * 0.5;
      var bow = v[2] * reach * 0.32;
      var cxp = px + Math.cos(ra) * reach * 0.5 + Math.cos(perp) * bow;
      var cyp = py + Math.sin(ra) * reach * 0.5 + Math.sin(perp) * bow;
      // dark structure (always visible; alpha throbs gently with the beat + rage). pulse 0 = flat, not additive.
      var darkA = 0.34 + coreF * 0.22 + ragePulse * 0.28 + beatN * 0.10;
      n = addCurveInst(n, rx, ry, cxp, cyp, px, py, (1.7 + ragePulse * 1.5), 0.42, 0.03, 0.05, Math.min(0.85, darkA), 0, 3);
      // bright highlight along the same path (additive `pulse`); brightens on heal/rage/feed + the beat
      var hiA = 0.20 + 0.42 * heal + coreF * 0.20 + ragePulse * 0.4 + 0.20 * Math.max(0, Math.sin(beat * 1.5)) + unl * 0.25;
      var hg = heal > 0 ? 0.55 : 0.10;                            // flush green-ish on heal (like the webgl healP)
      n = addCurveInst(n, rx, ry, cxp, cyp, px, py, (1.0 + heal * 1.3 + ragePulse * 1.1), 1.0, hg, 0.30, Math.min(0.92, hiA), 0.62, 3);
      // FLOWING BLOOD BEAD: a bright additive blob travelling rim->centre along the quadratic (looping, phase-
      // offset per vein) = the "flow". t runs 0..1; sample the same Bezier the curve uses.
      var t = (flowClock + i * 0.37) % 1;
      var it = 1 - t;
      var bx = it * it * rx + 2 * it * t * cxp + t * t * px;
      var by = it * it * ry + 2 * it * t * cyp + t * t * py;
      var beadA = (0.45 + heal * 0.4 + ragePulse * 0.35) * (0.5 + 0.5 * Math.sin(t * Math.PI));   // fade in/out along the run
      var beadR = (2.2 + heal * 1.4 + rage * 1.2) * (0.7 + 0.3 * Math.sin(t * Math.PI));
      n = addInst(n, bx, by, beadR, beadR, 0, 0, 1.0, heal > 0 ? 0.7 : 0.12, 0.28, Math.min(0.95, beadA), 0.7);
    }
    perf.tankVeinInst = n - start;
    return n;
  }
  function addTankFeelInstances(n) {
    if (!TANK_LAYERS) {
      perf.tankFeelInst = 0;
      return n;
    }
    var start = n;
    var pulse = 0.5 + 0.5 * Math.sin(state.t * 8.2);
    var core = Math.max(econ.tankCore, Math.floor((econ.tankThirst + econ.tankFrenzy) * 0.45));
    var unleashA = Math.max(player.unleashFlash, player.unleash > 0 ? 0.22 + 0.18 * Math.sin(state.t * 10) : 0);
    if (unleashA > 0.01) {
      var burst = player.unleashFlash;
      var ring = 25 + burst * 18 + econ.tankFrenzy * 1.4;
      n = addInst(n, player.x, player.y, ring, ring * 0.72, player.hull, 0, 0.45, 0.006, 0.025, 0.18 * unleashA, 0.22);
      n = addInst(n, player.x, player.y, ring * 0.42, ring * 0.28, player.hull, 0, 1.0, 0.055, 0.085, 0.22 * unleashA, 0.62);
      for (var u = 0; u < 4; u++) {
        var trail = player.hull + Math.PI + (u - 1.5) * 0.18;
        var side = player.hull + Math.PI * 0.5;
        var off = (u - 1.5) * 6;
        var dist = 18 + u * 8 + burst * 18;
        n = addInst(n, player.x + Math.cos(trail) * dist + Math.cos(side) * off, player.y + Math.sin(trail) * dist + Math.sin(side) * off, 3.0 + burst * 4.0, 2.0 + burst * 2.6, trail, 0, 0.82, 0.025, 0.05, 0.40 * unleashA, 0.25);
      }
    }
    if (core > 0) {
      var coreCount = Math.min(5, 2 + Math.floor(core * 0.45));
      for (var v = 0; v < coreCount; v++) {
        var pop = Math.max(0, Math.sin(state.t * 6.8 + v * 1.7));
        var localX = -7 + v * 3.6;
        var localY = ((v & 1) ? 5 : -5) + Math.sin(state.t * 3.2 + v) * 0.8;
        var ca = Math.cos(player.hull), sa = Math.sin(player.hull);
        var pxv = player.x + localX * ca - localY * sa;
        var pyv = player.y + localX * sa + localY * ca;
        var pr = (1.6 + pop * 2.4 + core * 0.12) * (player.unleash > 0 ? 1.22 : 1);
        n = addInst(n, pxv, pyv, pr, pr * 0.82, player.hull, 0, 0.92, 0.035, 0.065, 0.24 + pop * 0.28 + (player.unleash > 0 ? 0.10 : 0), 0.55);
      }
    }
    if (player.recoil > 0.02) {
      var mx0 = player.x + Math.cos(player.turret) * 43;
      var my0 = player.y + Math.sin(player.turret) * 43;
      var mr = 5 + player.recoil * 12;
      n = addInst(n, mx0, my0, mr, mr, 0, 0, 1.0, 0.42, 0.15, 0.55 * player.recoil, 0.8);
    }
    perf.tankFeelInst = n - start;
    return n;
  }
  function colorForEnemy(type) {
    return T_COL[type] || 0;
  }

  function addCreatureBase(n, type, x, y, rad, face, phase, pulse) {
    var cid = colorForEnemy(type);
    var walk = Math.sin(phase * (type === 1 || type === 8 ? 10.5 : 6.5) + type);
    var breathe = Math.sin(phase * 3.1 + type * 0.7);
    var sx = rad * (1 + walk * 0.06);
    var sy = rad * (1 - walk * 0.045 + breathe * 0.025);
    var shape = 0;
    var angle = face + walk * 0.07;
    var alpha = 0.92;

    if (type === 1) { shape = 2; sx = rad * 0.95; sy = rad * (0.86 + walk * 0.07); angle = phase * 1.7; }
    else if (type === 2) { shape = 0; sx = rad * 1.12; sy = rad * (1.04 + breathe * 0.03); }
    else if (type === 3 || type === 8) { shape = 2; sx = rad * (type === 8 ? 1.75 : 1.55); sy = rad * 0.72; angle = face; }
    else if (type === 4 || type === 11) { shape = 3; sx = rad * (1.05 + breathe * 0.08); sy = rad * (1.05 + breathe * 0.08); }
    else if (type === 5) { shape = 0; sx = rad * (1.15 + breathe * 0.04); sy = rad * 1.05; }
    else if (type === 6 || type === 10) { shape = 2; sx = rad * (1.15 + breathe * 0.04); sy = rad * 0.88; angle = phase * (type === 10 ? -1.1 : 1.1); alpha = 0.84; }
    else if (type === 7) { shape = 0; sx = rad * (1.12 + breathe * 0.08); sy = rad * (1.12 + breathe * 0.08); }
    else if (type === 9) { shape = 1; sx = rad * 1.1; sy = rad * 0.95; angle = face + walk * 0.035; }

    return addInst(n, x, y, sx, sy, angle, shape, C_R[cid], C_G[cid], C_B[cid], alpha, pulse);
  }

  function addLocal(n, x, y, ox, oy, sx, sy, baseAngle, spin, shape, color, alpha, pulse) {
    var ca = Math.cos(baseAngle), sa = Math.sin(baseAngle);
    return addInst(n, x + ox * ca - oy * sa, y + ox * sa + oy * ca, sx, sy, baseAngle + spin, shape, C_R[color], C_G[color], C_B[color], alpha, pulse);
  }

  function addCreatureDetails(n, type, x, y, rad, face, phase, pulse) {
    var cid = colorForEnemy(type);
    var dark = 6;
    var hot = type === 4 || type === 11 ? 5 : cid;
    var walk = Math.sin(phase * 8.0);
    var alt = Math.sin(phase * 8.0 + Math.PI);
    var bite = Math.max(0, Math.sin(phase * 9.5));

    if (type === 0) {
      n = addLocal(n, x, y, -rad * 0.05, -rad * 0.82, rad * 0.72, rad * 0.15, face, 0.55 + walk * 0.28, 1, dark, 0.72, pulse);
      n = addLocal(n, x, y, -rad * 0.05, rad * 0.82, rad * 0.72, rad * 0.15, face, -0.55 + alt * 0.28, 1, dark, 0.72, pulse);
      n = addLocal(n, x, y, rad * 0.48, 0, rad * 0.28 + bite * 2, rad * 0.18, face, 0, 2, 5, 0.78, pulse);
    } else if (type === 1) {
      n = addLocal(n, x, y, rad * 0.55, 0, rad * 0.32, rad * 0.18, face, 0, 2, 5, 0.78, pulse);
      n = addLocal(n, x, y, -rad * 0.58, 0, rad * 0.38, rad * 0.1, face, 0, 1, dark, 0.65, pulse);
    } else if (type === 2 || type === 9) {
      n = addInst(n, x, y, rad * 0.52, rad * 0.52, face + phase * 0.25, 1, C_R[dark], C_G[dark], C_B[dark], 0.62, pulse);
      n = addLocal(n, x, y, rad * 0.55, -rad * 0.42, rad * 0.38, rad * 0.12, face, 0.25, 1, 5, 0.76, pulse);
      n = addLocal(n, x, y, rad * 0.55, rad * 0.42, rad * 0.38, rad * 0.12, face, -0.25, 1, 5, 0.76, pulse);
    } else if (type === 3 || type === 8) {
      n = addLocal(n, x, y, rad * 0.72, 0, rad * 0.36, rad * 0.32, face, 0, 0, hot, 0.84, pulse);
      n = addLocal(n, x, y, -rad * 0.72, 0, rad * 0.44, rad * 0.12, face, 0, 1, dark, 0.62, pulse);
      n = addLocal(n, x, y, 0, -rad * 0.55, rad * 0.5, rad * 0.1, face, walk * 0.36, 1, dark, 0.58, pulse);
      n = addLocal(n, x, y, 0, rad * 0.55, rad * 0.5, rad * 0.1, face, alt * 0.36, 1, dark, 0.58, pulse);
    } else if (type === 4 || type === 11) {
      n = addInst(n, x, y, rad * 0.45, rad * 0.45, phase * 1.4, 0, C_R[hot], C_G[hot], C_B[hot], 0.78, 0.35 + pulse);
      n = addLocal(n, x, y, rad * 0.78, 0, rad * 0.46, rad * 0.13, face, 0, 1, hot, 0.82, 0.45);
      if (type === 11) n = addInst(n, x, y, rad * 1.32, rad * 1.32, phase, 3, C_R[hot], C_G[hot], C_B[hot], 0.30, pulse);
    } else if (type === 5) {
      n = addInst(n, x, y, rad * 0.48, rad * 0.48, phase, 2, C_R[dark], C_G[dark], C_B[dark], 0.66, pulse);
      n = addLocal(n, x, y, rad * 0.48, 0, rad * 0.24, rad * 0.24, phase, 0, 0, 1, 0.75, pulse);
      n = addLocal(n, x, y, -rad * 0.24, rad * 0.42, rad * 0.22, rad * 0.22, phase, 0, 0, 1, 0.72, pulse);
      n = addLocal(n, x, y, -rad * 0.24, -rad * 0.42, rad * 0.22, rad * 0.22, phase, 0, 0, 1, 0.72, pulse);
    } else if (type === 6 || type === 10) {
      n = addInst(n, x, y, rad * 1.28, rad * 1.28, phase, 3, C_R[cid], C_G[cid], C_B[cid], 0.34, pulse);
      n = addLocal(n, x, y, rad * 0.42, 0, rad * (type === 10 ? 1.0 : 0.7), rad * 0.09, face, walk * 0.75, 1, cid, 0.58, pulse);
    } else {
      n = addInst(n, x, y, rad * 0.55, rad * 0.55, -phase * 1.2, 2, C_R[dark], C_G[dark], C_B[dark], 0.66, pulse);
      n = addInst(n, x, y, rad * 1.25, rad * 1.25, phase, 3, C_R[hot], C_G[hot], C_B[hot], 0.24 + pulse * 0.12, pulse);
    }
    return n;
  }

  function addMoteInstances(n) {
    var start = n;
    for (var m = 0; m < motes.count; m++) {
      var vx = motes.vx[m];
      var vy = motes.vy[m];
      var speed = Math.sqrt(vx * vx + vy * vy);
      var dx = player.x - motes.x[m];
      var dy = player.y - motes.y[m];
      var dist = Math.sqrt(dx * dx + dy * dy);
      var pull = clamp(1 - dist / Math.max(1, player.pickR), 0, 1);
      var pulseM = 1 + Math.sin(state.t * 8 + motes.phase[m]) * 0.14;
      var birth = clamp(1 - motes.age[m] * 3.4, 0, 1);
      var merge = motes.merge[m];
      var base = (3.25 + Math.sqrt(Math.min(20, Math.max(1, motes.val[m]))) * 1.45) * pulseM * (1 + birth * 0.22 + merge * 0.30);
      var speedStretch = clamp((speed - 55) / 560, 0, 1);
      speedStretch = speedStretch * speedStretch * (3 - 2 * speedStretch);
      var stretch = clamp(speedStretch * (0.22 + pull * 1.08) + merge * 0.32, 0, 1.45);
      var ang = speed > 8 ? Math.atan2(vy, vx) : (pull > 0.25 ? Math.atan2(dy, dx) : motes.phase[m] + state.t * 0.8);
      var ca = Math.cos(ang);
      var sa = Math.sin(ang);
      if (stretch > 0.05) {
        var tail = base * (0.30 + stretch * 0.70);
        var tailAlpha = Math.min(1, speedStretch * 1.18 + merge * 0.34);
        n = addInst(n, motes.x[m] - ca * tail * 0.58, motes.y[m] - sa * tail * 0.58, base * (0.56 + stretch * 0.28), base * (0.38 + stretch * 0.10), ang, 0, 0.52, 0.006, 0.020, (0.12 + pull * 0.06) * tailAlpha, 0.20 + merge * 0.22);
        if (stretch > 0.34) {
          n = addInst(n, motes.x[m] - ca * tail * 0.92 - sa * base * 0.11, motes.y[m] - sa * tail * 0.92 + ca * base * 0.11, base * 0.28, base * 0.22, ang + 0.3, 0, 0.88, 0.030, 0.050, 0.14 * tailAlpha, 0.28 + merge * 0.14);
        }
      }
      n = addInst(n, motes.x[m], motes.y[m], base * (1 + stretch * 1.02), base * Math.max(0.46, 1 - stretch * 0.24), ang, 0, 0.94, 0.025 + merge * 0.05, 0.055 + merge * 0.04, 0.88, 0.38 + merge * 0.36);
      n = addInst(n, motes.x[m] - ca * base * 0.30 - sa * base * 0.10, motes.y[m] - sa * base * 0.30 + ca * base * 0.10, base * 0.34, base * 0.23, ang - 0.18, 0, 1.0, 0.18 + merge * 0.08, 0.22 + merge * 0.06, 0.50 + pull * 0.08, 0.54);
      if (merge > 0.02 || motes.val[m] >= 5) {
        n = addInst(n, motes.x[m], motes.y[m], base * (1.42 + merge * 0.34), base * (1.02 + merge * 0.22), motes.phase[m] + state.t * 1.2, 3, 1.0, 0.055, 0.085, (0.14 + merge * 0.24) * Math.min(1, 0.45 + motes.val[m] * 0.08), 0.42 + merge * 0.35);
      }
    }
    perf.moteInst = n - start;
    return n;
  }

  export function renderWorld() {
    var n = 0;
    var usingOldSprites = OLD_SPRITES && sprites.ready;
    perf.envRocks = 0;
    if (usingOldSprites) {
      resetSpriteBatches();
      prepareSpriteDensity();
      queueOldEnvironment();
    } else {
      perf.spriteDraws = 0;
      perf.spriteAnimated = 0;
      perf.spriteStatic = 0;
      perf.spriteCulled = 0;
      perf.envSprites = 0;
      perf.corpseSprites = 0;
      perf.tankSprites = 0;
      perf.boomSprites = 0;
    }
    var grid = 160;
    var left = Math.floor((player.x - view.viewWorldW * 0.55) / grid) * grid;
    var right = player.x + view.viewWorldW * 0.55;
    var top = Math.floor((player.y - view.viewWorldH * 0.55) / grid) * grid;
    var bottom = player.y + view.viewWorldH * 0.55;
    if (!(usingOldSprites && OLD_ENV)) {
      var fgt = mapGroundTint();   // recolor the default floor grid per map (sprite path tints its ground texture instead)
      var grR = 0.18 * fgt.r, grG = 0.11 * fgt.g, grB = 0.08 * fgt.b;
      for (var gx = left; gx < right; gx += grid) {
        n = addInst(n, gx, player.y, 1.2, view.viewWorldH * 0.62, 0, 1, grR, grG, grB, 0.16);
      }
      for (var gy = top; gy < bottom; gy += grid) {
        n = addInst(n, player.x, gy, view.viewWorldW * 0.62, 1.2, 0, 1, grR, grG, grB, 0.16);
      }
      for (var d = 0; d < decals.count; d++) {
        var dc = decals.col[d];
        n = addInst(n, decals.x[d], decals.y[d], decals.r[d], decals.r[d] * 0.72, 0, 0, C_R[dc], C_G[dc], C_B[dc], decals.a[d]);
      }
    }
    n = addVeinTrailInstances(n);
    n = addGoreSplatInstances(n);
    n = addGoreInstances(n);
    var bgN = n;

    if (usingOldSprites) {
      for (var c = 0; c < corpses.count; c++) queueOldCorpseSprite(c);
      perf.boomSprites = 0;
      // EXPOSED-HEART death image REMOVED (Tim 2026-06-24): no heart at the wreck anymore - the death now leaves
      // a scorched tank BASE (queueOldTankSprite's dead path) instead. queueTankHeartSprite is kept as dead code
      // (no longer called); the heart_core asset is loaded-but-unused (lead to drop it from assets.js later).
      for (var bm = 0; bm < booms.count; bm++) {
        var bk = booms.kind[bm];
        if (bk === 1 || bk === 2) queueExplosionSprite(bm);   // kind 2 = fireball, kind 1 = rock dust-cloud (kind 1 ALSO keeps its procedural rubble in addExplosionInstances)
        else if (bk === 3) queueGoreSprite(bm);               // kind 3 = organic blood-splash (sprite-only). kind 0/4 stay procedural in addExplosionInstances.
      }
      for (var gi = 0; gi < gore.count; gi++) if (gore.kind[gi] === 6) queueGibSprite(gi);   // textured rib GIBS (sprite-only; procedural addGoreInstances skips kind 6)
      // NOTE: queueTankDebrisSprite() (the torn-off / returning turret) is queued LATER - AFTER the dead tank base
      // below - so the flying/landing tower draws OVER the base ("tower on top of base"), not under it (Tim FIX 2).
    }

    var detailLeft = enemies.count > 1050 ? Math.min(DETAIL_MAX, 170) : (enemies.count > 650 ? Math.min(DETAIL_MAX, 280) : DETAIL_MAX);
    var detailStart = detailLeft;
    var closeX = view.viewWorldW * 0.6;
    var closeY = view.viewWorldH * 0.6;
    for (var e = 0; e < enemies.count; e++) {
      var type = enemies.type[e];
      var pulse = Math.max(0, Math.min(1, 1 - enemies.hp[e] / (enemyHpAt(type, state.t / 60) + 1)));   // live HP-model normalization (balance.js enemyHpAt), matches the new per-minute curve
      if (usingOldSprites && queueOldEnemySprite(e)) continue;
      n = addCreatureBase(n, type, enemies.x[e], enemies.y[e], enemies.r[e], enemies.face[e], enemies.phase[e], pulse);
      var dxv = enemies.x[e] - player.x;
      var dyv = enemies.y[e] - player.y;
      if (detailLeft > 0 && Math.abs(dxv) < closeX && Math.abs(dyv) < closeY &&
          (enemies.r[e] > 16 || dxv * dxv + dyv * dyv < 160000 || ((e + state.tick) & 15) === 0)) {
        n = addCreatureDetails(n, type, enemies.x[e], enemies.y[e], enemies.r[e], enemies.face[e], enemies.phase[e], pulse);
        detailLeft--;
      }
    }
    perf.creatureDetails = usingOldSprites ? 0 : detailStart - detailLeft;

    n = addMoteInstances(n);

    for (var b = 0; b < bullets.count; b++) {
      var ba = Math.atan2(bullets.vy[b], bullets.vx[b]);
      if (usingOldSprites && queueWeaponProjectileSprite(b, ba)) continue;
      if (bullets.kind[b] === 1) {
        n = addInst(n, bullets.x[b], bullets.y[b], 17, 5.2, ba, 1, 1.0, 0.62, 0.18, 0.98, 0.56);
        n = addInst(n, bullets.x[b] - Math.cos(ba) * 10, bullets.y[b] - Math.sin(ba) * 10, 7, 4, ba, 0, 1.0, 0.22, 0.08, 0.55, 0.55);
      } else if (bullets.kind[b] === 2) {
        n = addInst(n, bullets.x[b], bullets.y[b], 7, 2.8, ba, 1, 0.48, 0.95, 0.38, 0.9, 0.25);
      } else {
        n = addInst(n, bullets.x[b], bullets.y[b], 12, 3.5, ba, 1, 1.0, 0.46, 0.23, 0.96, 0.45);
      }
    }

    // Spitter aim telegraph REMOVED (Tim 2026-06-25 "remove the spitter yellow direction line where it spits").
    // The spitter still aims + fires via enemies.aim (systems/enemies.js); the venom bolt below is the only spit cue now.

    // enemy bolts (Spitter): recolored off the old near-white #e6f0ff (Tim: "enemy bullets white is bad") to
    // a sickly VENOM bile yellow-green - clearly an ENEMY projectile, distinct from the player's spring-green
    // flak / orange cannon AND from the bright-red blood. A soft olive halo + a toxic chartreuse-yellow core.
    for (var eb2 = 0; eb2 < ebullets.count; eb2++) {
      n = addInst(n, ebullets.x[eb2], ebullets.y[eb2], 7, 7, 0, 0, 0.50, 0.55, 0.06, 0.45, 0.6);   // murky olive glow halo
      n = addInst(n, ebullets.x[eb2], ebullets.y[eb2], 3.6, 3.6, 0, 0, 0.88, 0.92, 0.14, 0.98, 0.4);   // toxic bile core
    }

    if (laser.t > 0) {
      var la = Math.min(1, laser.t);
      var lp = 0.78 + 0.22 * Math.sin(state.t * 54);
      var lwa = Math.atan2(laser.y1 - laser.y0, laser.x1 - laser.x0);
      n = addLineInst(n, laser.x0, laser.y0, laser.x1, laser.y1, 13.0 + la * 2.2, 0.24, 0.004, 0.026, 0.36 * la, 0.35);
      n = addLineInst(n, laser.x0, laser.y0, laser.x1, laser.y1, 6.4 + lp * 1.4, 0.92, 0.055, 0.095, 0.70 * la, 0.68);
      n = addLineInst(n, laser.x0, laser.y0, laser.x1, laser.y1, 2.0 + lp * 0.9, 1.0, 0.56, 0.56, 0.86 * la, 0.78);
      n = addInst(n, laser.x0 + Math.cos(lwa) * 8, laser.y0 + Math.sin(lwa) * 8, 8.5 + la * 5.5, 6.0 + la * 3.2, lwa, 0, 1.0, 0.12, 0.12, 0.70 * la, 0.72);
      if (la > 0.45) {
        for (var ls = 1; ls <= 3; ls++) {
          var kls = ls * 0.22 + 0.11 * Math.sin(state.t * 18 + ls);
          n = addInst(n, laser.x0 + (laser.x1 - laser.x0) * kls, laser.y0 + (laser.y1 - laser.y0) * kls, 3.2, 2.0, lwa, 0, 1.0, 0.18, 0.18, 0.26 * la, 0.45);
        }
      }
    }

    for (var p = 0; p < particles.count; p++) {
      var pc = particles.col[p];
      var alpha = Math.max(0, particles.life[p] / particles.max[p]);
      n = addInst(n, particles.x[p], particles.y[p], particles.r[p], particles.r[p], 0, 0, C_R[pc], C_G[pc], C_B[pc], alpha * 0.75, 0);
    }

    n = addExplosionInstances(n);
    n = addLeechInstances(n);
    n = addResurrectVeinInstances(n);   // FIX 3: leech-style veins pulling the returning tower onto the base (resurrect only); over the tank sprites
    n = addTankVeinInstances(n);   // flowing veins + pulse ON the LIVE tank (Feature C); skipped on death
    if (!player.dead) n = addTankFeelInstances(n);   // core glow / unleash rings - LIVE tank only (the dead base has no core/heart glow)

    // DEATH (Tim 2026-06-24): draw the SCORCHED, SETTLED tank BASE (treads/armor/thirst, NO turret - it tore off)
    // as the wreck, instead of suppressing the chassis. queueOldTankSprite(true) = the dead base path.
    var tankQueued = usingOldSprites && queueOldTankSprite(player.dead);
    // FIX 2 (Tim 2026-06-24 "tower on top of base"): queue the torn-off / returning turret AFTER the dead base
    // so it draws OVER it in the same sprite batch (death = turret flies up over the base; resurrect = it lands
    // ON TOP of the base). It stays over the booms/gore (queued earlier above). Moved here from before the enemy
    // loop, where the base (queued later) was painting over it = the tower landing UNDER the base.
    if (usingOldSprites) queueTankDebrisSprite();
    if (!tankQueued && !player.dead) {
      var hot = player.hurt > 0 ? player.hurt : player.recoil * 0.35;
      n = addInst(n, player.x, player.y, player.r + 10, player.r + 7, 0, 0, 0.02, 0.005, 0.004, 0.5, 0);
      n = addRot(n, -1, -17, 27, 5, player.hull, 1, 0.34, 0.31, 0.27, 0.95, hot);
      n = addRot(n, -1, 17, 27, 5, player.hull, 1, 0.34, 0.31, 0.27, 0.95, hot);
      n = addInst(n, player.x, player.y, 28, 20, player.hull, 1, 0.47, 0.40, 0.34, 0.98, hot);
      n = addInst(n, player.x + Math.cos(player.turret) * 21, player.y + Math.sin(player.turret) * 21, 26, 4.2, player.turret, 1, 0.70, 0.58, 0.45, 0.98, player.recoil);
      n = addInst(n, player.x, player.y, 9, 9, 0, 0, 0.95, 0.08, 0.05, 0.85, player.meter / 100);
    }
    n = addBubbleInstances(n);

    gl.viewport(0, 0, glCanvas.width, glCanvas.height);
    mapClearColor(_mapClear);    // per-map base ground color (map 1 = original near-black; map 2+ lifted + hue-tinted)
    gl.clearColor(_mapClear[0], _mapClear[1], _mapClear[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (usingOldSprites) {
      drawInstances(0, bgN);
      flushSprites();
      drawInstances(bgN, n - bgN);
      // R1: 2nd sprite pass for the TURRET only, so it draws OVER the vein instances (veins beneath the turret).
      // resetSpriteBatches clears the just-flushed batch geometry so the re-queued turret is the ONLY thing the
      // 2nd flushSprites draws (without it, flushSprites would re-draw the whole tank). It also ZEROES the sprite
      // perf counters as a side effect, so snapshot + restore them around the reset (the counts __perfStats reads
      // for this frame must survive) - then add the turret's single draw back.
      if (_tankTurret.on) {   // _tankTurret.on is set ONLY on the layered LIVE path of queueOldTankSprite (the dead path returns with it false), so on death there's no deferred turret here - the gun tore off + flew (tankDebris). The 2nd pass draws the LIVE turret OVER the veins.
        var _pSpriteDraws = perf.spriteDraws, _pAnim = perf.spriteAnimated, _pStatic = perf.spriteStatic,
            _pCulled = perf.spriteCulled, _pEnv = perf.envSprites, _pCorpse = perf.corpseSprites,
            _pTank = perf.tankSprites, _pBoom = perf.boomSprites;
        resetSpriteBatches();
        queueTankTurretSprite();
        flushSprites();
        perf.spriteDraws = _pSpriteDraws + 1; perf.spriteAnimated = _pAnim; perf.spriteStatic = _pStatic;
        perf.spriteCulled = _pCulled; perf.envSprites = _pEnv; perf.corpseSprites = _pCorpse;
        perf.tankSprites = _pTank; perf.boomSprites = _pBoom;
      }
    } else {
      drawInstances(0, n);
    }
    perf.instances = n;
  }
