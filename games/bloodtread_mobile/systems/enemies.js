// Enemy lifecycle + behaviour: chooseType (weighted spawn), spawnEnemy/removeEnemy (swap-remove that
// notifies leeches), killEnemy (payout + gore + heal + meter + splitters), updateEnemies (per-type AI +
// player contact damage/crush). Core of the sim SCC: <-> combat (triggerUnleash + killEnemy callers),
// <-> leech (retargetLeechesAfterRemove), -> fx/*, collision, audio. rule-#4: reads enemies.* directly.
import { enemies, player, state, particles, view, ebullets } from '../state.js?v=bm6';
import { BALANCE, enemyHpAt, enemyContactDmgAt } from '../balance.js?v=bm6';
import { MAX_ENEMIES, ENEMY_SCALE, TANK_VIS_R } from '../config.js?v=bm6';
import { TWO_PI } from '../lib/math.js?v=bm6';
import { GORE_FX } from '../flags.js?v=bm6';
import { rnd } from '../lib/rng.js?v=bm6';
import { playSfx, playSfxOneOf } from '../audio.js?v=bm6';
import { T_NAME, T_SPD, T_R, T_PAY, T_UNLOCK, T_WEIGHT, T_CAN_FIRE_BOLT, CONTACT_RANK, SPRITE_VIS_MULT, SPRITE_BODY_FILL } from '../data/enemies.js?v=bm6';
import { seenType } from '../state.js?v=bm6';
import { retargetLeechesAfterRemove } from './leech.js?v=bm6';
import { maybeDropEliteCache } from './loot.js?v=bm6';
import { triggerUnleash, spawnEnemyProj } from './combat.js?v=bm6';
import { collideEnemyObstacles, enemyObstacle, collidePlayerObstacles } from './collision.js?v=bm6';
import { addTrauma } from '../render/camera.js?v=bm6';
import { effectAllowed, spawnParticle, spawnMote, spawnDecal } from '../fx/particles.js?v=bm6';
import { isTechType, spawnSplat, spawnGoreSpray, spawnGoreBurst } from '../fx/gore.js?v=bm6';
import { spawnBoom, spawnCorpse } from '../fx/world.js?v=bm6';
import { gainHeal } from '../fx/heal.js?v=bm6';

  // Higher maps run a TOUGHER type mix from the start: the effective minute used for unlock + weighting is
  // shifted up by 1.5 min per map past 1 (capped +7.5 = map 6). So on map 2 the roster a player faces at 0:30
  // is roughly what map 1 only served at ~2:00 - heavier types unlock + weight in earlier - without editing any
  // data table or adding new enemies. (Count density is the separate mapDifficultyMul applied in desiredEnemies.)
  export function chooseType(minute) {
    if (state.forceType >= 0) return state.forceType;   // DEV enemy-wave override (CHEATS_ENABLED): force every spawn to one type. No-op in production (forceType stays -1).
    var eff = minute + Math.min(5, (state.map - 1)) * 1.5;
    var total = 0;
    for (var i = 0; i < T_NAME.length; i++) if (T_UNLOCK[i] <= eff) total += T_WEIGHT[i];
    var r = rnd() * total;
    for (var j = 0; j < T_NAME.length; j++) {
      if (T_UNLOCK[j] > eff) continue;
      r -= T_WEIGHT[j];
      if (r <= 0) return j;
    }
    return 0;
  }

  export function spawnEnemy(type) {
    if (enemies.count >= MAX_ENEMIES) return;
    var minute = state.t / 60;
    type = type == null ? chooseType(minute) : type;
    // INTERCEPT SPAWNING (Tim 2026-06-25 anti-kite lever 2): a SHARE of spawns appear in an arc AHEAD of the
    // tank's heading, so holding a direction and running drives you INTO fresh enemies instead of away into
    // empty field. The rest stay uniform so you're still surrounded, not only chased from the front. Needs the
    // tank actually moving (a near-stationary tank has no heading -> fall back to uniform around the ring).
    var a;
    var pv2 = player.vx * player.vx + player.vy * player.vy;
    if (pv2 > 2500 && rnd() < BALANCE.spawn.interceptFrac) {        // moving >~50px/s + within the intercept share
      a = Math.atan2(player.vy, player.vx) + (rnd() - 0.5) * 2 * BALANCE.spawn.interceptArc;   // +- interceptArc of dead ahead
    } else {
      a = rnd() * TWO_PI;
    }
    var ring = Math.sqrt(view.cssW * view.cssW + view.cssH * view.cssH) * 0.5 + 170 + rnd() * 180;
    var i = enemies.count++;
    enemies.x[i] = player.x + Math.cos(a) * ring;
    enemies.y[i] = player.y + Math.sin(a) * ring;
    enemies.vx[i] = 0;
    enemies.vy[i] = 0;
    enemies.type[i] = type;
    enemies.phase[i] = rnd() * TWO_PI;
    enemies.face[i] = a + Math.PI;
    enemies.cd[i] = 0.25 + rnd() * 1.6;
    enemies.aim[i] = -99;   // Spitter telegraph aim (-99 = not telegraphing)
    enemies.r[i] = T_R[type] * ENEMY_SCALE;
    enemies.spd[i] = T_SPD[type] * (0.9 + rnd() * 0.22);
    enemies.mspd[i] = enemies.spd[i];   // init locomotion speed so a recycled slot is not falsely 'stationary' on its first render (Codex)
    // HP = baseHP * (1 + hpPerMinute*minute) - LINEAR per minute (balance.js enemyHpAt). A grunt stays 3-5
    // hits-to-kill the whole run; COUNT carries difficulty (desiredEnemies), not sponge HP. (Replaced the old
    // 1+t*0.014 exponential-ish drift + the type>=5 elite bump, now folded into per-type baseHP/hpPerMinute.)
    enemies.hp[i] = enemyHpAt(type, minute);
    if (!seenType[type]) {
      seenType[type] = 1;
      if (state.t > 2 && state.mode === 'PLAYING') {
        state.banner = 'NEW HORROR: ' + T_NAME[type];
        state.bannerT = 1.8;
      }
    }
  }

  // DEV-ONLY enemy-wave spawner (CHEATS_ENABLED, wired from the cheat screen): replace the field with a wave of a
  // SINGLE type so Tim can review one creature in isolation. type<0 = back to the normal mixed spawn (leaves the
  // current enemies). Otherwise: latch state.forceType (so the ONGOING spawner keeps the wave single-type via
  // chooseType), mark the type seen, clear the field + in-flight enemy bolts, then seed ~36 of that type.
  export function spawnEnemyWave(type) {
    if (type < 0) { state.forceType = -1; return; }   // normal mix; leave the current enemies be
    state.forceType = type;
    seenType[type] = 1;
    enemies.count = 0;
    ebullets.count = 0;
    for (var i = 0; i < 36 && enemies.count < MAX_ENEMIES; i++) spawnEnemy();
  }

  export function removeEnemy(i) {
    var l = --enemies.count;
    retargetLeechesAfterRemove(i, l);
    if (i === l) return;
    enemies.x[i] = enemies.x[l]; enemies.y[i] = enemies.y[l]; enemies.vx[i] = enemies.vx[l]; enemies.vy[i] = enemies.vy[l];
    enemies.hp[i] = enemies.hp[l]; enemies.r[i] = enemies.r[l]; enemies.spd[i] = enemies.spd[l];
    enemies.phase[i] = enemies.phase[l]; enemies.face[i] = enemies.face[l]; enemies.cd[i] = enemies.cd[l]; enemies.aim[i] = enemies.aim[l]; enemies.mspd[i] = enemies.mspd[l]; enemies.type[i] = enemies.type[l];
  }

  export function killEnemy(i, crushed) {
    var x = enemies.x[i], y = enemies.y[i], type = enemies.type[i], rad = enemies.r[i];
    var pay = T_PAY[type];
    var tech = isTechType(type);
    var big = rad >= 22 || type === 5 || type === 7 || type === 9 || type === 11;
    state.kills++;
    state.blood += pay;
    if (big) addTrauma(0.25);   // a BIG creature dying thumps the camera; gated on `big` so a horde of mites can't constantly rattle the screen (addTrauma clamps, so a big multi-kill just pins briefly)
    if (big && maybeDropEliteCache()) { state.banner = 'GORE CACHE'; state.bannerT = 1.6; playSfx('metal', 0.55, 0, 1.5); }   // GORE CACHE in-run drop: an elite death has a chance to spit out a cache (banner + bright metal ping); persisted at run end by bankRun

    if (big && !tech) playSfxOneOf(['cand_fall1', 'cand_fall2', 'cand_fall3'], 0.42, 0.06);   // BIG BODY THUD (Tim 2026-06-24): a heavy body-collapse layered on a big organic death (not the mechanical foes)
    playSfx(tech ? 'metal' : 'squish', big ? 0.50 : 0.38, 0.045);
    // CRUSH KILL = Tim's CHOSEN organic-mush pool (2026-06-24, kept candidates from audio/sfx_candidates/). A big
    // varied pool so crushing a horde never machine-guns one sample. 'crunch' DROPPED (Tim). vol 0.34, gap 0.075.
    if (crushed && !tech) playSfxOneOf([
      'squish', 'flesh1', 'flesh2', 'flesh3',
      'cand_flesh4', 'cand_flesh5', 'cand_flesh6', 'cand_flesh7', 'cand_flesh8', 'cand_flesh9', 'cand_flesh10', 'cand_flesh11',
      'cand_meat1', 'cand_meat2', 'cand_meat3', 'cand_meat4', 'cand_meat5', 'cand_meat6', 'cand_meat7', 'cand_meat8', 'cand_meat9', 'cand_meat10',
      'cand_gore1', 'cand_gore2', 'cand_gore3', 'cand_gore4', 'cand_gore5', 'cand_gore6', 'cand_gore7',
      'cand_rip1', 'cand_rip2', 'cand_rip3', 'cand_rip4',
      'cand_viscera3', 'cand_viscera4',
      'cand_skull1', 'cand_skull4', 'cand_skull5', 'cand_skull6',
      'rep_crunch1', 'rep_crunch2', 'rep_crunch3',
      'rep_skull1', 'rep_skull2', 'rep_skull3',
      'rep_viscera1', 'rep_viscera2', 'rep_viscera3'
    ], 0.34, 0.075);
    spawnCorpse(x, y, type, rad, player.x < x ? -1 : 1);
    spawnMote(x, y, Math.min(6, pay));
    if (pay > 5) spawnMote(x + rad * 0.35, y - rad * 0.2, Math.min(6, pay));
    spawnGoreBurst(x, y, type, rad, crushed, enemies.face[i]);   // face = the head-slam direction (points at the player); biases the burst toward the head-crack impact
    if (type === 7 || type === 11 || rad >= 25) spawnBoom(x, y, rad * (type === 7 || type === 11 ? 1.05 : 0.85), 2);   // kind 2 = explosion.png FIREBALL (Tim 2026-06-23: real sprite-anim deaths). Gated to big/explosive types ONLY (Detonator/Bombard/Hive/Shellback) - NOT grunts, per the perf budget. Radius mult dialed down from 1.55/1.15 since the fireball sprite covers ~4.6x r.
    var highLoad = enemies.count > 850 || particles.count > 1900;
    var limit = highLoad ? 1 : (enemies.count > 520 ? 2 : 4);
    var fxOk = effectAllowed(x, y, limit);   // ONE rate-limiter check, shared by the death gore-anim + the particle burst (effectAllowed has per-cell side effects - don't call it twice)
    // ADDITIONAL DEATH GORE ANIMATION (Tim 2026-06-23): organic enemies throw a painterly blood-splash (boom kind 3,
    // gore_blood sheet, sized to the creature); tech/mechanical are BIOMECH (flesh + metal) so they throw BOTH the
    // blood-splash (kind 3) AND gunmetal metal-shrapnel (kind 4) together (Tim "for the more mechanical enemy there
    // should be blood + metal piece"). Organic stay blood-only. Throttled by the SAME effectAllowed gate so a
    // 1000-horde can't flood the boom ring; the corpse _death sprite + the light spawnGoreBurst spray still play underneath.
    if (fxOk) {
      spawnBoom(x, y, rad * 0.9, 3);                 // blood-splash (organic AND biomech - mechanical foes still bleed)
      if (tech) spawnBoom(x, y, rad * 0.95, 4);      // + metal-shrapnel for the mechanical/biomech shell
    }
    if (fxOk) {
      var burst = highLoad ? 3 : (type >= 5 ? 14 : 7);
      var base = rnd() * TWO_PI;
      for (var k = 0; k < burst; k++) {
        var a = base + (k / burst) * TWO_PI + (rnd() - 0.5) * 0.45;
        var sp = 70 + rnd() * (type >= 5 ? 160 : 110);
        spawnParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 1.8 + rnd() * 3.2, 0.25 + rnd() * 0.32, (type === 4 || type === 11) ? 3 : 0);
      }
    }
    if (crushed || rnd() < 0.45) spawnDecal(x, y, rad * (1.3 + rnd() * 1.5), (type === 4 || type === 11) ? 3 : 0, 0.12 + rnd() * 0.12);
    var heal = crushed ? (3 + player.thirst) : (player.rangedHeal ? player.thirst : 0);
    if (player.unleash > 0) heal *= 2.6;
    if (heal > 0) {
      var before = player.hp;
      player.hp = Math.min(player.maxHp, player.hp + heal);
      player.hurt = Math.max(player.hurt, 0.18);
      gainHeal(player.hp - before);   // green "+N" float + heal-glow flush for the amount actually restored
    }
    if (crushed) {
      player.meter = Math.min(100, player.meter + 2.5 + pay * 0.8);
      if (player.meter >= 100) triggerUnleash();
    }
    if ((type === 7 || type === 11) && enemies.count < MAX_ENEMIES - 3) {
      for (var s = 0; s < 3; s++) {
        spawnEnemy(1);
        enemies.x[enemies.count - 1] = x + Math.cos(s / 3 * TWO_PI) * 28;
        enemies.y[enemies.count - 1] = y + Math.sin(s / 3 * TWO_PI) * 28;
      }
    }
    removeEnemy(i);
  }

  export function updateEnemies(dt) {
    var nearest = -1;
    var nearestD2 = 1e30;
    var minute = state.t / 60;
    // Enemy contact-damage scales SLOWER than HP (~2.4x asymmetry) per BALANCE.enemies.contactDmgSlope, so late
    // game is a DPS race, not a one-shot lottery. boltDmgScale applies the SAME per-minute slope to the Spitter's
    // bolt damage for consistency (the per-type base term is kept in the bolt formula below).
    var boltDmgScale = 1 + BALANCE.enemies.contactDmgSlope * minute;
    var playerSpeed = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
    // MINUTE-RAMP (Tim 2026-06-25 anti-kite lever 4): a global enemy-speed climb so the swarm CLOSES the gap
    // late-game into a real wall. The tank outruns every base T_SPD (fastest enemy 135 vs tank 205+), so without
    // this you kite forever. ramp = 1 + speedRampPerMinute*minute, capped at speedRampCap; by the cap the fastest
    // types EXCEED the tank's base speed = genuine pursuers. Computed ONCE per frame, applied to every enemy's spd.
    var enemySpeedRamp = Math.min(BALANCE.spawn.speedRampCap, 1 + BALANCE.spawn.speedRampPerMinute * minute);
    var fxLimit = enemies.count > 850 ? 1 : (enemies.count > 520 ? 2 : 3);
    var contactDmg = 0;
    var contactDmgCap = 46 + player.level * 2.4;
    // TANK<->ENEMY BODY COLLISION (the heavy tank shoves living monsters aside instead of ghosting through):
    //  - SPRITE_BODY_FILL[type] (data/enemies.js) converts the drawn sprite cell to that creature's MEASURED visible
    //    body radius, so collide at enemies.r*SPRITE_VIS_MULT*SPRITE_BODY_FILL (the SAME visual size render/world.js
    //    queueOldEnemySprite draws) - NOT raw enemies.r (far inside the drawn body), and NOT the old single global
    //    VIS_FILL 0.46 which over-reached EVERY creature (they fill 35-72% of their cell, not a flat ~92%).
    //  - The push is weighted: monsters are shoved out HARD (they always clear the tank), the tank feels only a
    //    light, capped resistance (tankPush) so a dense swarm reads as solid but the tank can ALWAYS advance -
    //    never a hard lock / swarm death-trap. Bigger/tougher monsters resist a touch more (mass from T_R).
    //  - Lives INSIDE the existing per-enemy crush/contact pass (no new O(n) loop, no spatial rebuild, no alloc).
    //  - bodyR (the push + the enemy's contact damage) and crushRng (the tank's crush DPS reach) are computed
    //    per-enemy below; the render melee-attack trigger (render/world.js queueOldEnemySprite) uses the EXACT same
    //    bodyR - the creature shown mid-swing is the one physically pressed on the tank.
    var tankPushX = 0, tankPushY = 0;                 // accumulated this-frame shove-back ON the tank (scalar, alloc-free)
    // MASS-WEIGHTED 2-body separation: the overlap is split by mass between the tank and the enemy. M_TANK is the
    // tank's effective mass; enemy mass = (T_R/10)^2 so it grows fast with body size (Mite 8 -> 0.64, Wisp 13 ->
    // 1.69, Gorehound 15 -> 2.25, Brute 23 -> 5.3, Hive 28 -> 7.8). The enemy moves pen*M_TANK/(M_TANK+m), the tank
    // moves pen*m/(M_TANK+m): a LIGHT enemy is shoved ~fully aside and barely budges the tank; a HEAVY enemy resists
    // (moves out less) and pushes the tank back hard, so the tank clearly SLOWS and has to work through the big ones.
    var M_TANK = 6;
    // The tank's TOTAL shove-back this frame is capped at a fraction of its ACTUAL movement this frame (the
    // current speed, not the max-speed stat) so the push can only cancel most of the tank's advance, NEVER
    // reverse it - and it is ZERO when the tank is idle (so an asymmetric crowd can't drift/shove a parked
    // tank). While driving, playerSpeed ~= the speed stat so the drive-into-wall resistance is unchanged.
    var tankPushCap = playerSpeed * dt * 0.72;
    for (var i = enemies.count - 1; i >= 0; i--) {
      var x = enemies.x[i], y = enemies.y[i];
      var oldX = x, oldY = y;
      var dx = player.x - x, dy = player.y - y;
      var d2 = dx * dx + dy * dy + 0.0001;
      if (d2 < nearestD2) { nearestD2 = d2; nearest = i; }
      var inv = 1 / Math.sqrt(d2);
      var ux = dx * inv, uy = dy * inv;
      var type = enemies.type[i];
      var sp = enemies.spd[i] * enemySpeedRamp * BALANCE.moveSpeedScale;   // base speed * minute-ramp * global slow-down
      enemies.phase[i] += dt;
      enemies.face[i] = Math.atan2(uy, ux);

      if (type === 3 || type === 8) {
        enemies.cd[i] -= dt;
        if (enemies.cd[i] <= 0) enemies.cd[i] = 1.1 + rnd() * 0.9;
        var charge = enemies.cd[i] < (type === 8 ? 0.42 : 0.28) ? (type === 8 ? 2.1 : 2.35) : 1;
        x += ux * sp * charge * dt;
        y += uy * sp * charge * dt;
      } else if (T_CAN_FIRE_BOLT[type]) {
        // SPITTER (the only ranged foe - gated on the semantic T_CAN_FIRE_BOLT flag, not a hard-coded index):
        // kite to a preferred distance, telegraph 0.45s via enemies.aim, then fire a 3-shot pale-blue bolt
        // spread toward the player. Needle(8)/Bombard(11)/Wisp(6) stay melee.
        var d = 1 / inv;
        var pref = 250;
        if (d > pref + 36) { x += ux * sp * dt; y += uy * sp * dt; }            // too far: close in
        else if (d < pref - 48) { x -= ux * sp * 0.7 * dt; y -= uy * sp * 0.7 * dt; }   // too near: back off
        enemies.cd[i] -= dt;
        enemies.aim[i] = (enemies.cd[i] < 0.45 && enemies.cd[i] > 0) ? enemies.face[i] : -99;   // 0.45s telegraph window
        if (enemies.cd[i] <= 0) {
          enemies.cd[i] = 1.6 + rnd() * 0.8;
          var ba = enemies.face[i], pspd = 300, pdmg = (6 + type * 1.2) * boltDmgScale;
          for (var sh = 0; sh < 3; sh++) {
            var off = (sh - 1) * 0.30;
            spawnEnemyProj(x + ux * enemies.r[i], y + uy * enemies.r[i], Math.cos(ba + off) * pspd, Math.sin(ba + off) * pspd, pdmg);
          }
          if (rnd() < 0.33) playSfx('laser', 0.14, 0.09, 1.25);   // Tim 2026-06-25: spit sound RARE - only ~1 in 3 spits makes a sound (was every shot)
        }
      } else if (type === 6 || type === 10 || type === 11) {
        var wave = Math.sin(enemies.phase[i] * (type === 6 || type === 10 ? 5.4 : 3.7)) * (type === 6 || type === 10 ? 0.72 : 0.48);
        x += (ux - uy * wave) * sp * dt;
        y += (uy + ux * wave) * sp * dt;
      } else if (type === 5) {
        x += ux * sp * dt;
        y += uy * sp * dt;
        enemies.cd[i] -= dt;
        if (enemies.cd[i] <= 0 && enemies.count < MAX_ENEMIES - 1) {
          enemies.cd[i] = 2.6 + rnd() * 1.5;
          spawnEnemy(1);
          enemies.x[enemies.count - 1] = x + (rnd() - 0.5) * 36;
          enemies.y[enemies.count - 1] = y + (rnd() - 0.5) * 36;
        }
      } else {
        x += ux * sp * dt;
        y += uy * sp * dt;
      }

      x += enemies.vx[i] * dt;
      y += enemies.vy[i] * dt;
      enemies.vx[i] *= 0.89;
      enemies.vy[i] *= 0.89;
      if (collideEnemyObstacles(i, x, y, oldX, oldY, dt)) {
        x = enemyObstacle.x;
        y = enemyObstacle.y;
      }

      // TWO SEPARATE RADII (Tim "colliders bigger than the sprite, I push from far away", and it got worse the more
      // the tank upgraded): the old single colR folded the tread-scaled crush reach (crushR + r) into the body push
      // as a FLOOR, so a high TREAD tier shoved enemies - and let them bite - from farther and farther out.
      //   bodyR    = the VISIBLE body footprint (TANK_VIS_R chassis + the sprite's MEASURED body half-width). The
      //              separation PUSH and the enemy's CONTACT DAMAGE fire here - FIXED, never grows with upgrades, so
      //              treads can't make enemies shove/hit from far. Matches the render melee-swing trigger (world.js).
      //   crushRng = the tank's OFFENSIVE crush-grind reach = bodyR + player.crush (balance.baseCrush is literally
      //              "crush REACH px PAST THE BODY"), so a Tread tier extends the crush DAMAGE zone only, not the
      //              body push. >= bodyR by construction (player.crush > 0) so a pushed enemy is always still inside
      //              crush range - no pile-at-rim where a stationary tank could never grind a rim-held enemy down.
      var bodyR = TANK_VIS_R + enemies.r[i] * SPRITE_VIS_MULT[type] * SPRITE_BODY_FILL[type];   // per-creature body fill (not the global VIS_FILL): push matches each sprite's visible body
      var crushRng = bodyR + player.crush;
      var cdx = x - player.x, cdy = y - player.y;
      var cd2 = cdx * cdx + cdy * cdy;
      var inCrush = cd2 < crushRng * crushRng;     // tank grinds the enemy (crush DPS) - the only range a Tread tier extends
      var inBody = cd2 < bodyR * bodyR;            // visible body contact: enemy damage to the tank + the separation push
      if (inCrush) {
        enemies.hp[i] -= player.crushDps * dt * (playerSpeed > 120 ? 1.45 : 1);
      }
      if (inBody) {
        // contact dmg/s = (contactDmgBase + CONTACT_RANK[type]*contactDmgTypeStep) * (1 + contactDmgSlope*minute)
        // - the slower-than-HP curve (balance.js enemyContactDmgAt). CONTACT_RANK (data/enemies.js) decouples the
        // damage from the raw roster index so the light fast Ravener doesn't hit like the index-16 max. *dt -> this frame.
        var rawDmg = enemyContactDmgAt(CONTACT_RANK[type], minute) * dt;
        if (contactDmg < contactDmgCap * dt) {
          var allowed = Math.min(rawDmg, contactDmgCap * dt - contactDmg);
          player.hp -= allowed;
          contactDmg += allowed;
        }
        player.hurt = 1;
        enemies.vx[i] -= ux * 410 * dt;
        enemies.vy[i] -= uy * 410 * dt;
        if (playerSpeed > 90 && effectAllowed(x, y, fxLimit) && ((state.tick + i) & 1) === 0) {
          var a = Math.atan2(-uy, -ux) + (rnd() - 0.5) * 0.8;
          var spv = 100 + rnd() * 120;
          spawnParticle(x, y, Math.cos(a) * spv, Math.sin(a) * spv, 1.4 + rnd() * 2.2, 0.22 + rnd() * 0.25, (type === 4 || type === 11) ? 3 : 0);
        }
        if (GORE_FX && playerSpeed > 70 && ((state.tick + i) & (enemies.count > 850 ? 3 : 1)) === 0 && effectAllowed(x, y, enemies.count > 850 ? 1 : 2)) {
          var techContact = isTechType(type);
          var sprayA = Math.atan2(-uy, -ux) + (rnd() - 0.5) * 0.75;
          playSfx(techContact ? 'metal' : 'hitflesh', techContact ? 0.16 : 0.20, 0.11);
          spawnGoreSpray(x, y, techContact ? 3 : 6, sprayA, 1.15, techContact ? 250 : 320, techContact ? 5 : 0);
          if (!techContact && rnd() < (enemies.count > 850 ? 0.18 : 0.34)) spawnSplat(x, y, enemies.r[i] * (0.92 + rnd() * 0.68), 0, 5.8);
        }
      }

      // TANK<->ENEMY BODY COLLISION: a MASS-WEIGHTED 2-body separation of the overlap, using bodyR/cd2 (mirrors the
      // obstacle push at collision.js:178). Both bodies move along the contact normal by their mass-share of the
      // penetration: light enemies are shoved ~fully aside (tank barely slows), heavy enemies resist (move out less)
      // and shove the tank back hard. The enemy ends up at bodyR, and crushRng >= bodyR, so it keeps taking crush
      // dmg while pressed (no pinning just outside crush range).
      if (inBody) {
        if (cd2 > 0.0001) {
          var cd = Math.sqrt(cd2);
          var cnx = cdx / cd, cny = cdy / cd;
          var pen = bodyR - cd;
          var m = enemies.r[i] * 0.1; m = m * m;        // enemy mass = (T_R/10)^2 - grows fast with body size
          var fracTank = m / (M_TANK + m);              // heavy enemy -> tank takes a bigger share of the overlap
          var fracEnemy = 1 - fracTank;                 // = M_TANK/(M_TANK+m); light enemy -> enemy moves ~fully
          x += cnx * pen * fracEnemy;                   // enemy shoved out by its mass-share (small = ~full clear)
          y += cny * pen * fracEnemy;
          var inV = enemies.vx[i] * cnx + enemies.vy[i] * cny;   // kill its inward drift so it doesn't instantly re-penetrate
          if (inV < 0) { enemies.vx[i] -= cnx * inV; enemies.vy[i] -= cny * inV; }
          tankPushX -= cnx * pen * fracTank;            // tank pushed back by the enemy's mass-share (heavy = a lot)
          tankPushY -= cny * pen * fracTank;
        } else {
          var fa = enemies.phase[i];                   // exactly concentric: face is degenerate here (atan2(0,0)=0 for all), so eject along the well-distributed per-enemy phase instead
          x += Math.cos(fa) * bodyR;
          y += Math.sin(fa) * bodyR;
        }
      }

      enemies.x[i] = x;
      enemies.y[i] = y;
      var mdx = x - oldX, mdy = y - oldY;
      enemies.mspd[i] = Math.sqrt(mdx * mdx + mdy * mdy) / (dt > 0 ? dt : 0.0166);   // locomotion speed for the render-time idle<->attack alternation
      if (enemies.hp[i] <= 0) {
        killEnemy(i, inCrush);                         // crushed = died inside the tank's crush-grind range (crushRng)
      }
    }
    // Camera shake from taking contact damage THIS frame: applied ONCE off the accumulated contactDmg (not
    // per-enemy in the hot loop). contactDmg is a per-FRAME (already *dt) figure clamped to contactDmgCap (so it
    // can't runaway); the ~0.6 factor + the squared offset means a single mite graze is a faint rumble, getting
    // mobbed at the damage cap pins near the ~0.5 ceiling. Re-added each contact frame, decay finds the balance.
    if (contactDmg > 0) addTrauma(Math.min(0.5, contactDmg * 0.6));
    // Apply the accumulated tank shove-back ONCE, clamped to tankPushCap, so a dense crowd makes the tank feel
    // solid resistance but can NEVER hard-lock or trap it (it always keeps moving under player input).
    if (tankPushX !== 0 || tankPushY !== 0) {
      var tpd2 = tankPushX * tankPushX + tankPushY * tankPushY;
      if (tpd2 > tankPushCap * tankPushCap) {
        var tsc = tankPushCap / Math.sqrt(tpd2);
        tankPushX *= tsc; tankPushY *= tsc;
      }
      player.x += tankPushX;
      player.y += tankPushY;
      // This push runs AFTER updatePlayer's collidePlayerObstacles (player.js), so re-resolve rocks here or the
      // shove could poke the tank into/through a rock for a frame. It early-outs when no rock is near (cheap).
      collidePlayerObstacles();
    }
    return nearest;
  }
