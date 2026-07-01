// Player rig: updatePlayer (input -> velocity/hull, env collision, rage/vein/track FX spawns, tread
// decay) + applyMetaToPlayer / syncTankTiersFromMeta (push saved meta tiers onto the live player + tank
// mirror). Reads the input singleton (keys/joystick/pointer). Part of the SCC: -> combat (angleDelta),
// collision (crush/collide), fx/*, game/meta, systems/shared. Mutates player + tracks pool + econ tank tiers.
import { player, state, econ, META, input, tracks, veins, view, tankDebris } from '../state.js?v=bm10';
import { MAX_BUBBLES, TRACK_CAP } from '../config.js?v=bm10';
import { BREAK_ENV, GORE_FX, VEIN_FX, OLD_ENV, TANK_LAYERS } from '../flags.js?v=bm10';
import { rnd } from '../lib/rng.js?v=bm10';
import { TWO_PI } from '../lib/math.js?v=bm10';
import { BALANCE } from '../balance.js?v=bm10';
import { MA_FRENZY } from '../data/meta.js?v=bm10';
import { currentWeaponTier, syncLegacyCannonMeta, tankRageLevel, weaponAtlasTier, weaponRow } from '../game/meta.js?v=bm10';
import { playSfx, playSfxOneOf, playTone } from '../audio.js?v=bm10';
import { angleDelta } from './combat.js?v=bm10';
import { crushNearbyDecals, crushNearbyRocks, collidePlayerObstacles } from './collision.js?v=bm10';
import { currentLeechLevel } from './shared.js?v=bm10';
import { spawnRageBubble, spawnVeinTrail, spawnTrack, spawnBoom } from '../fx/world.js?v=bm10';
import { spawnSplat, spawnGoreSpray } from '../fx/gore.js?v=bm10';
import { spawnParticle } from '../fx/particles.js?v=bm10';
import { addTrauma } from '../render/camera.js?v=bm10';
import { applyEquippedGear } from './loot.js?v=bm10';   // GEAR merge-collection (replaces relics) - equipped best-tier per slot

  export function syncTankTiersFromMeta() {
    syncLegacyCannonMeta();
    econ.tankArmor = META.armor;
    econ.tankCore = META.core;
    econ.tankCannon = currentWeaponTier();
    econ.tankTreads = META.treads;
    econ.tankThirst = META.thirst;
    econ.tankFrenzy = META.frenzy;
  }

  // Derive the convenience mirrors dmg/fireRate from the ADDITIVE fire pools (baseDmg/baseInterval +
  // dmgBonus/asBonus). asBonus is capped at BALANCE.weapon.asBonusCap (the late-game spray ceiling).
  // dmg = baseDmg*(1+dmgBonus); fireRate = (1+asBonus)/baseInterval (equivalent shots/s, used by the laser
  // DPS model + the HUD). Call after ANY change to the pools (a pick in progress.js, or a fresh-run seed here).
  export function recomputeWeaponStats() {
    var W = BALANCE.weapon;
    if (player.asBonus > W.asBonusCap) player.asBonus = W.asBonusCap;   // clamp the additive AS pool to the spray ceiling
    if (player.dmgBonus < 0) player.dmgBonus = 0;
    if (player.asBonus < 0) player.asBonus = 0;
    player.dmg = player.baseDmg * (1 + player.dmgBonus);
    player.fireRate = (1 + player.asBonus) / (player.baseInterval > 0.0001 ? player.baseInterval : 0.0001);
  }

  // Seed the live player from the BALANCE defaults + the permanent META tiers (the ADDITIVE meta model:
  // each owned tier adds a flat bonus ON TOP of the base, into the same asBonus/dmgBonus/HP/etc pools the
  // level-up picks use - so a maxed returning player starts meaningfully stronger without runaway multiply).
  // Called by resetGame at the START of every run. The fire pools (baseInterval/baseDmg/asBonus/dmgBonus)
  // come straight from BALANCE so a Sheet override (?tune) takes effect; recomputeWeaponStats derives dmg/fireRate.
  export function applyMetaToPlayer() {
    var cannonTier = currentWeaponTier();
    META.cannon = cannonTier;
    var P = BALANCE.player, G = BALANCE.progression, W = BALANCE.weapon;

    player.maxHp = P.baseMaxHp + G.metaHpPerTier * META.armor;
    player.hp = player.maxHp;
    player.speed = P.baseSpeed * BALANCE.moveSpeedScale * (1 + G.metaSpeedPerTier * META.treads);
    player.crush = P.baseCrush + G.metaCrushReachPerTier * META.treads;
    player.crushDps = P.baseCrushDps * (1 + G.metaCrushDpsPerTier * META.treads);
    player.pickR = P.basePickR + G.metaPickRPerTier * META.core;
    player.thirst = G.metaThirstPerTier * META.thirst + G.metaCoreThirstPerTier * META.core;
    player.rangedHeal = META.thirst > 0;
    player.regen = G.metaRegenPerTier * META.core;
    player.frenzyMul = MA_FRENZY[META.frenzy];

    // FIRE MODEL: base interval/damage from BALANCE; the additive bonus pools seeded from the cannon/frenzy meta.
    player.baseInterval = W.baseInterval;
    player.baseDmg = W.baseDmg;
    player.dmgBonus = G.metaDmgBonusPerTier * cannonTier;          // meta damage tiers -> dmgBonus (picks add on top)
    player.asBonus = G.metaAsBonusPerTier * cannonTier;            // meta fire-rate tiers -> asBonus (picks add on top)
    player.barrels = 1 + Math.floor(cannonTier / Math.max(1, G.metaBarrelEveryTiers));
    player.lashLvl = Math.floor(META.frenzy / Math.max(1, G.metaLashEveryTiers));

    // GORE CACHE relics: layer the equipped relics on top of the meta (additive into the same pools), then
    // re-derive HP + fire stats so maxHp / dmg / fire-rate relics take effect for this run.
    applyEquippedGear(player);
    player.hp = player.maxHp;
    recomputeWeaponStats();

    syncTankTiersFromMeta();
  }

  export function updatePlayer(dt) {
    var ix = 0, iy = 0;
    if (input.keys[65] || input.keys[37]) ix -= 1;
    if (input.keys[68] || input.keys[39]) ix += 1;
    if (input.keys[87] || input.keys[38]) iy -= 1;
    if (input.keys[83] || input.keys[40]) iy += 1;
    if (input.joyActive) {
      ix += input.joyDX;
      iy += input.joyDY;
    } else if (input.pointerDown) {
      var dx = input.pointerX - view.cssW * 0.5;
      var dy = input.pointerY - view.cssH * 0.5;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d > 18) {
        ix += dx / d;
        iy += dy / d;
      }
    }
    var mag = Math.sqrt(ix * ix + iy * iy);
    if (mag > 0.001) {
      ix /= mag;
      iy /= mag;
      player.vx += ix * player.speed * 6.2 * dt;
      player.vy += iy * player.speed * 6.2 * dt;
    }
    var sp2 = player.vx * player.vx + player.vy * player.vy;
    var max = player.speed * (player.unleash > 0 ? 1.22 : (player.meter >= 100 ? 1.12 : 1));
    if (sp2 > max * max) {
      var inv = max / Math.sqrt(sp2);
      player.vx *= inv;
      player.vy *= inv;
      sp2 = max * max;
    }
    if (sp2 > 70 * 70) {
      var wantHull = Math.atan2(player.vy, player.vx);
      player.hull += angleDelta(player.hull, wantHull) * Math.min(0.46, dt * 8.4);
    }
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    if (BREAK_ENV) {
      var breakReach = player.r + player.crush;
      crushNearbyDecals(player.x, player.y, breakReach * 0.82);
      crushNearbyRocks(player.x, player.y, breakReach);
      collidePlayerObstacles();
    }
    var rage = tankRageLevel();
    if (MAX_BUBBLES > 0 && TANK_LAYERS && rage > 0.08 && rnd() < dt * (0.28 + rage * rage * 5.4) * (player.unleash > 0 ? 2.35 : 1)) {
      spawnRageBubble(rage, player.unleash > 0 ? 1.18 : 1);
    }
    if (player.unleash > 0 && (GORE_FX || VEIN_FX)) {
      veins.unleashAcc += (Math.sqrt(sp2) + 72) * dt;
      var trailSteps = 0;
      while (veins.unleashAcc > 32 && trailSteps++ < 2) {
        veins.unleashAcc -= 32;
        var tail = player.hull + Math.PI + (rnd() - 0.5) * 0.34;
        var side = player.hull + Math.PI * 0.5;
        var tx = player.x + Math.cos(tail) * (18 + rnd() * 12) + Math.cos(side) * (rnd() - 0.5) * 16;
        var ty = player.y + Math.sin(tail) * (18 + rnd() * 12) + Math.sin(side) * (rnd() - 0.5) * 16;
        if (VEIN_FX) spawnVeinTrail(tx, ty, tail + (rnd() - 0.5) * 0.62);
        if (GORE_FX) {
          if (((state.tick + trailSteps) & 1) === 0) spawnSplat(tx, ty, 9 + rnd() * 15, 0, 4.8);
          if (rnd() < 0.26) spawnGoreSpray(tx, ty, 2, tail, 0.8, 125, 0);
        }
      }
    }
    if (VEIN_FX && (currentLeechLevel() > 0 || player.unleash > 0) && sp2 > 90 * 90) {
      veins.acc += Math.sqrt(sp2) * dt;
      var veinGap = player.unleash > 0 ? 42 : 22;
      while (veins.acc > veinGap) {
        veins.acc -= veinGap;
        spawnVeinTrail(player.x - Math.cos(player.hull) * 18, player.y - Math.sin(player.hull) * 18, player.hull + Math.PI + (rnd() - 0.5) * 0.75);
      }
    }
    if (OLD_ENV && sp2 > 120 * 120) {
      tracks.acc += Math.sqrt(sp2) * dt;
      while (tracks.acc > 34) {
        tracks.acc -= 34;
        spawnTrack(player.x - Math.sin(player.hull) * 18, player.y + Math.cos(player.hull) * 18, player.hull);
        spawnTrack(player.x + Math.sin(player.hull) * 18, player.y - Math.cos(player.hull) * 18, player.hull);
      }
    }
    for (var ti = tracks.count - 1; ti >= 0; ti--) {
      tracks.life[ti] -= dt * 0.045;
      if (tracks.life[ti] <= 0) {
        var l = --tracks.count;
        if (ti !== l) {
          tracks.x[ti] = tracks.x[l]; tracks.y[ti] = tracks.y[l]; tracks.a[ti] = tracks.a[l]; tracks.life[ti] = tracks.life[l];
        }
      }
    }
    var damp = Math.pow(0.0009, dt);
    player.vx *= damp;
    player.vy *= damp;
    if (player.recoil > 0) player.recoil = Math.max(0, player.recoil - dt * 8);
    if (player.hurt > 0) player.hurt = Math.max(0, player.hurt - dt * 3);
  }

  // DEATH (Tim 2026-06-24, rework): TWO distinct things happen, and the BODY does NOT fireball.
  //   (1) the TURRET tears off and is launched as a flying debris piece (tankDebris) that arcs away, drops, and
  //       EXPLODES on landing (the only fireball left - advanced in update.js, rendered reusing weapon_turrets).
  //   (2) the tank BODY dies as a visceral BLEED-OUT, NOT an explosion: a heavy BLOOD spill/pool spreading from
  //       the wreck, the exposed biomech HEART revealed (heart_core sprite, render/world.js) which PULSES then
  //       STOPS beating as state.tankBeat eases to a halt, METAL SCRAPS shearing off (boom kind 4, NO fire), and
  //       drifting SMOKE (boom kind 1 dust). The escalation in update.js runDeathSequence now sheds metal +
  //       smoke + more blood (NO kind-2 fireball anywhere on the body). A camera TRAUMA punch still lands the hit.
  export function destroyTank() {
    var x = player.x, y = player.y;
    player.vx = 0; player.vy = 0;
    player.unleash = 0; player.unleashFlash = 0;          // death overrides any in-flight bloodletting
    state.banner = ''; state.bannerT = 0;
    playSfxOneOf(['rep_explosion1', 'rep_explosion2', 'rep_explosion3'], 0.55, 0, 0.7);   // a heavier, wetter thud (rate 0.7 = lower) - a rupture, not a blast; randomised explosion (Tim's kept picks)
    playSfx('metal', 0.6, 0, 0.5);                          // shearing metal scraps
    playTone(48, 0.8, 0.06);
    addTrauma(0.9);                                         // a heavy screen punch on the killing blow (decays in update.js)
    // (1) TURRET TEAR-OFF: launch the gun as a flying debris piece. It travels outward in the world plane along
    // the direction the turret was pointing (with a little spread) AND rises/falls on a visual height `z` so it
    // arcs up, comes down, and explodes on landing (handled in update.js). Snapshot the equipped-weapon atlas
    // cell so the flying piece IS the turret that was on the tank. A war machine's gun is heavy -> a strong,
    // slightly-up-biased launch + a hard tumble. (The in-world turret render is suppressed once dead.)
    var blow = player.turret + (rnd() - 0.5) * 1.1;        // hurled roughly the way it was aimed, with spread
    var ejSpd = 250 + rnd() * 150;                         // world-plane travel speed (px/s)
    tankDebris.active = true;
    tankDebris.x = x; tankDebris.y = y;
    tankDebris.vx = Math.cos(blow) * ejSpd;
    tankDebris.vy = Math.sin(blow) * ejSpd;
    tankDebris.z = 0;
    tankDebris.vz = 430 + rnd() * 130;                     // launch UP (visual height); gravity in update.js pulls it back down. high arc -> clear "tears off + flies" read
    tankDebris.spin = player.turret;
    tankDebris.spinV = (rnd() < 0.5 ? -1 : 1) * (7 + rnd() * 6);   // hard tumble (rad/s)
    tankDebris.t = 0;
    tankDebris.exploded = false;
    tankDebris.cell = weaponAtlasTier(econ.equipWeapon);
    tankDebris.row = weaponRow(econ.equipWeapon);
    tankDebris.size = 75 + weaponAtlasTier(econ.equipWeapon) * 2;   // Tim 2026-06-24: the flying tower must be the EXACT size of the equipped turret. The in-world turret renders at tsz = 75 + weaponAtlasTier*2 (render/world.js queueOldTankSprite) through the same weapon_turrets atlas + cell, so match it precisely (was a fixed 112) -> the torn-off gun reads as the gun that was on the tank, at its tier.
    // (2) BODY BLEED-OUT in place: NO fireball. The hull splits + the heart is exposed -> heavy blood spill +
    // metal scraps shearing off + smoke. The heart (heart_core sprite) is drawn by render/world.js and stops
    // beating as tankBeat eases to a halt (handled in update.js).
    spawnBoom(x, y, 52, 3);                                // BIG central blood-splash (gore_blood sheet) - the rupture spills
    spawnBoom(x - 16, y + 12, 34, 3);                      // more blood pooling off the hull
    spawnBoom(x + 18, y + 8, 30, 3);
    spawnBoom(x, y, 40, 4);                                // metal scraps shear off the breaking hull (NO fire)
    spawnBoom(x - 22, y - 12, 26, 4);
    if (GORE_FX) {
      spawnGoreSpray(x, y, 18, 0, TWO_PI, 320, 0);          // heavy BLOOD spray (kindBias organic) - the body bleeds out
      spawnGoreSpray(x, y, 9, 0, TWO_PI, 300, 5);           // a few metal flecks + sparks alongside (kindBias tech)
    }
    spawnSplat(x, y, 96, 0, 5.6);                           // a wide blood pool spreading under the wreck
    spawnSplat(x + (rnd() - 0.5) * 30, y + (rnd() - 0.5) * 24, 56, 0, 4.6);   // a second offset pool so it reads as a spreading spill
    for (var i = 0; i < 9; i++) spawnVeinTrail(x, y, (i / 9) * TWO_PI + rnd() * 0.4);   // the heart's roots tear loose, bleeding outward
    for (var k = 0; k < 22; k++) {
      var ka = rnd() * TWO_PI, ks = 70 + rnd() * 220;       // debris/grit burst (metal bits, no bright sparks dominating)
      spawnParticle(x, y, Math.cos(ka) * ks, Math.sin(ka) * ks, 1.6 + rnd() * 3.0, 0.3 + rnd() * 0.35, 0);
    }
  }
