// Player weapons + projectiles + the bloodletting UNLEASH ability. spawn/removeBullet (ring buffer),
// per-weapon autoFire patterns (cannon/flak/missile + the sustained laser beam), explodeBullet AoE, and
// triggerUnleash/updateUnleash (rage burst). angleDelta is the shared turret-aim helper. Part of the sim
// SCC: -> enemies (killEnemy), collision (obstacleHitAt/damageCurrentObstacle), fx/*, game/meta, audio.
import { bullets, ebullets, enemies, player, state, laser, econ, view } from '../state.js?v=bm9';
import { BALANCE } from '../balance.js?v=bm9';
import { MAX_BULLETS, MAX_EBULLETS, MAX_BUBBLES, UNLEASH_TIME } from '../config.js?v=bm9';
import { TWO_PI, clampInt } from '../lib/math.js?v=bm9';
import { rnd } from '../lib/rng.js?v=bm9';
import { GOD } from '../flags.js?v=bm9';
import { playSfx, playSfxOneOf } from '../audio.js?v=bm9';
import { WEAPON_ROW } from '../data/weapons.js?v=bm9';
import { currentWeapon, currentWeaponTier, weaponRow, tankRageLevel } from '../game/meta.js?v=bm9';
import { laserRangeWorld, addTrauma } from '../render/camera.js?v=bm9';
import { killEnemy } from './enemies.js?v=bm9';
import { obstacleHitAt, damageCurrentObstacle } from './collision.js?v=bm9';
import { effectAllowed, spawnParticle } from '../fx/particles.js?v=bm9';
import { spawnGoreSpray } from '../fx/gore.js?v=bm9';
import { spawnBoom, spawnVeinTrail, spawnRageBubble } from '../fx/world.js?v=bm9';

  export function projectileRowForKind(kind) {
    if (kind === 2) return WEAPON_ROW.flak;
    if (kind === 1) return WEAPON_ROW.missile;
    return WEAPON_ROW.cannon;
  }

  export function spawnBullet(x, y, vx, vy, dmg, kind, radius, life, visualRow, visualTier) {
    var i;
    if (bullets.count < MAX_BULLETS) i = bullets.count++;
    else i = (state.tick + bullets.count) % MAX_BULLETS;
    bullets.x[i] = x; bullets.y[i] = y; bullets.vx[i] = vx; bullets.vy[i] = vy;
    bullets.life[i] = life == null ? 0.95 : life;
    bullets.dmg[i] = dmg;
    bullets.kind[i] = kind || 0;
    bullets.row[i] = clampInt(visualRow == null ? weaponRow(econ.equipWeapon) : visualRow, 0, 3);
    bullets.tier[i] = clampInt(visualTier == null ? currentWeaponTier() : visualTier, 0, 5);
    bullets.rad[i] = radius || 0;
  }

  export function removeBullet(i) {
    var l = --bullets.count;
    if (i === l) return;
    bullets.x[i] = bullets.x[l]; bullets.y[i] = bullets.y[l]; bullets.vx[i] = bullets.vx[l]; bullets.vy[i] = bullets.vy[l]; bullets.life[i] = bullets.life[l]; bullets.dmg[i] = bullets.dmg[l]; bullets.kind[i] = bullets.kind[l]; bullets.row[i] = bullets.row[l]; bullets.tier[i] = bullets.tier[l]; bullets.rad[i] = bullets.rad[l];
  }

  // -- enemy projectiles (Spitter bolts) -- ring-buffer spawn + swap-remove, mirrors spawnBullet/removeBullet
  export function spawnEnemyProj(x, y, vx, vy, dmg) {
    var i;
    if (ebullets.count < MAX_EBULLETS) i = ebullets.count++;
    else { i = ebullets.cursor; ebullets.cursor = (ebullets.cursor + 1) % MAX_EBULLETS; }   // pool full: advance the cursor so same-tick bolts hit DISTINCT slots (a 3-shot spread can't collapse onto one)
    ebullets.x[i] = x; ebullets.y[i] = y; ebullets.vx[i] = vx; ebullets.vy[i] = vy; ebullets.life[i] = 3; ebullets.dmg[i] = dmg;
  }

  export function removeEnemyBullet(i) {
    var l = --ebullets.count;
    if (i === l) return;
    ebullets.x[i] = ebullets.x[l]; ebullets.y[i] = ebullets.y[l]; ebullets.vx[i] = ebullets.vx[l]; ebullets.vy[i] = ebullets.vy[l]; ebullets.life[i] = ebullets.life[l]; ebullets.dmg[i] = ebullets.dmg[l];
  }

  export function updateEnemyBullets(dt) {
    if (ebullets.count <= 0) return;
    var blasting = player.unleash > 0;   // bloodletting: bolts deal 0.35x and don't flash hurt (matches the target's unleash)
    var hitR = player.r + 12;            // body radius (OLD prad ~24 at S=1)
    var hitR2 = hitR * hitR;
    for (var i = ebullets.count - 1; i >= 0; i--) {
      ebullets.x[i] += ebullets.vx[i] * dt * BALANCE.moveSpeedScale;   // enemy bolts slowed with the swarm
      ebullets.y[i] += ebullets.vy[i] * dt * BALANCE.moveSpeedScale;
      ebullets.life[i] -= dt;
      if (obstacleHitAt(ebullets.x[i], ebullets.y[i])) { removeEnemyBullet(i); continue; }   // rock is cover
      var dx = ebullets.x[i] - player.x, dy = ebullets.y[i] - player.y;
      if (dx * dx + dy * dy < hitR2) {
        if (!GOD) player.hp -= ebullets.dmg[i] * (blasting ? 0.35 : 1);
        if (!blasting) { player.hurt = Math.max(player.hurt, 0.45); addTrauma(Math.min(0.5, ebullets.dmg[i] * 0.025)); }   // bolt impact kicks the camera, scaled by bolt dmg (~0.5 at a 20-dmg bolt), capped; muted during unleash like the hurt-flash
        if (effectAllowed(ebullets.x[i], ebullets.y[i], 2)) spawnParticle(ebullets.x[i], ebullets.y[i], -ebullets.vx[i] * 0.1, -ebullets.vy[i] * 0.1, 2.0, 0.2, 4);
        removeEnemyBullet(i);
        continue;
      }
      if (ebullets.life[i] <= 0) removeEnemyBullet(i);
    }
  }

  export function triggerUnleash() {
    if (player.unleash > 0) return;
    player.unleash = UNLEASH_TIME;
    player.unleashFlash = 1;
    player.meter = 0;
    player.hurt = Math.max(player.hurt, 0.5);
    addTrauma(0.8);   // the unleash PUNCHES - the biggest single shake in the game (paired with the red flush)
    state.banner = 'BLOODLETTING';
    state.bannerT = 1.05;
    playSfxOneOf(['cand_meat1', 'cand_meat6', 'cand_gore1', 'cand_gore5', 'cand_rip1', 'cand_viscera3'], 0.34, 0.06);   // Tim 2026-06-24: 'crunch' DROPPED - the Bloodletting unleash now bursts a heavy kept-gore squelch (pairs with the hitflesh below)
    playSfx('hitflesh', 0.42, 0.04, 0.72);
    for (var i = 0; i < 9; i++) {
      spawnVeinTrail(player.x, player.y, (i / 9) * TWO_PI + (rnd() - 0.5) * 0.18);
    }
    spawnGoreSpray(player.x, player.y, 22, null, 0, 330, 0);
    for (var b = 0; b < 18; b++) spawnRageBubble(Math.max(0.35, tankRageLevel()), 1.35);
  }

  export function updateUnleash(dt) {
    if (player.unleash > 0) {
      player.unleash = Math.max(0, player.unleash - dt);
      if (player.unleash <= 0) player.meter = Math.min(player.meter, 0);
    }
    if (player.unleashFlash > 0) player.unleashFlash = Math.max(0, player.unleashFlash - dt * 2.9);
  }

  export function explodeBullet(x, y, radius, damage) {
    var r2 = radius * radius;
    spawnBoom(x, y, radius * 0.75, 2);   // Tim 2026-06-24: rocket explodes as a FIREBALL (explosion.png sprite), NOT the kind-1 rock-rubble whose 8 procedural chunks read as ugly square tiles. kind 2 = sprite-only fireball, no procedural squares.
    playSfxOneOf(['rep_explosion1', 'rep_explosion2', 'rep_explosion3'], 0.48, 0.055);   // randomised explosion (Tim's kept picks); rocket-impact fireball
    if (effectAllowed(x, y, enemies.count > 850 ? 1 : 3)) {
      var burst = enemies.count > 850 ? 4 : 9;
      for (var k = 0; k < burst; k++) {
        var a = k / burst * TWO_PI + rnd() * 0.28;
        var sp = 90 + rnd() * 120;
        spawnParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 2.4 + rnd() * 2.6, 0.24 + rnd() * 0.26, 2);
      }
    }
    for (var e = enemies.count - 1; e >= 0; e--) {
      var dx = enemies.x[e] - x;
      var dy = enemies.y[e] - y;
      var d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      var falloff = 1 - Math.sqrt(d2) / Math.max(1, radius);
      enemies.hp[e] -= damage * (0.45 + falloff * 0.85);
      if (enemies.hp[e] <= 0) killEnemy(e, false);
    }
  }

  export function updateBullets(dt) {
    for (var i = bullets.count - 1; i >= 0; i--) {
      bullets.x[i] += bullets.vx[i] * dt;
      bullets.y[i] += bullets.vy[i] * dt;
      bullets.life[i] -= dt;
      if (obstacleHitAt(bullets.x[i], bullets.y[i])) {
        damageCurrentObstacle(bullets.dmg[i] * 0.65);
        if (bullets.kind[i] === 1) explodeBullet(bullets.x[i], bullets.y[i], bullets.rad[i] || 58, bullets.dmg[i]);
        removeBullet(i);
        continue;
      }
      var hit = -1;
      for (var e = enemies.count - 1; e >= 0; e--) {
        var dx = enemies.x[e] - bullets.x[i], dy = enemies.y[e] - bullets.y[i];
        var r = enemies.r[e] + 4;
        if (dx * dx + dy * dy < r * r) {
          hit = e;
          break;
        }
      }
      if (hit >= 0) {
        if (bullets.kind[i] === 1) {
          explodeBullet(bullets.x[i], bullets.y[i], bullets.rad[i] || 58, bullets.dmg[i]);
        } else {
          enemies.hp[hit] -= bullets.dmg[i];
          if (effectAllowed(bullets.x[i], bullets.y[i], enemies.count > 850 ? 1 : 3)) {
            spawnParticle(bullets.x[i], bullets.y[i], -bullets.vx[i] * 0.12, -bullets.vy[i] * 0.12, 2.2, 0.18, bullets.kind[i] === 2 ? 3 : 2);
          }
          if (enemies.hp[hit] <= 0) killEnemy(hit, false);
        }
        removeBullet(i);
      } else if (bullets.life[i] <= 0) {
        if (bullets.kind[i] === 1) explodeBullet(bullets.x[i], bullets.y[i], bullets.rad[i] || 58, bullets.dmg[i] * 0.72);
        removeBullet(i);
      }
    }
  }

  export function autoFire(dt, nearest) {
    state.fireCd -= dt;
    var weapon = currentWeapon();
    if (nearest < 0 || nearest >= enemies.count || enemies.count <= 0) {
      if (weapon.id === 'laser') {
        laser.t = 0;
        laser.burstT = 0;
        laser.burstMax = 0;
      }
      return;
    }
    // FIRE ONLY AT WHAT'S ON-SCREEN (Tim 2026-06-25 "only shoot enemies within the visible area; at the edges do not
    // shoot"): retarget to the NEAREST enemy INSIDE the on-screen rectangle, NOT the global `nearest` - else the cannon
    // would hold while an off-screen foe is "nearest" even though a farther enemy is plainly visible (Codex). The box is
    // view.viewWorldW x view.viewWorldH world units (css size / cameraZoom, set in render/camera.js resize() - reliable
    // for this sim read), centred on the tank; 0.46 of the FULL viewport span (just inside the 0.5 half-extent) so a foe
    // right at the edge doesn't draw fire. Nothing on-screen -> hold (turret idles). Replaces the old fixed
    // BALANCE.weapon.range radius, which at the live 1.6 zoom reached well off-screen.
    var gateW = view.viewWorldW * 0.46, gateH = view.viewWorldH * 0.46;
    var target = -1, bestD2 = 1e30;
    for (var ti = enemies.count - 1; ti >= 0; ti--) {
      var tx = enemies.x[ti] - player.x, ty = enemies.y[ti] - player.y;
      if (Math.abs(tx) > gateW || Math.abs(ty) > gateH) continue;
      var td2 = tx * tx + ty * ty;
      if (td2 < bestD2) { bestD2 = td2; target = ti; }
    }
    if (target < 0) {
      if (weapon.id === 'laser') { laser.t = 0; laser.burstT = 0; laser.burstMax = 0; }
      // NO on-screen enemy to aim at: point the turret where the TANK IS MOVING (Tim 2026-06-25) so the gun faces
      // the direction of travel instead of idling at its last aim. Only while actually moving (|v| > 20 u/s); when
      // ~stationary it holds the current aim (no travel direction to face). Same smooth slew as the enemy aim.
      var mv2 = player.vx * player.vx + player.vy * player.vy;
      if (mv2 > 400) player.turret += angleDelta(player.turret, Math.atan2(player.vy, player.vx)) * Math.min(0.5, dt * 9.6);
      return;
    }
    nearest = target;
    var dx = enemies.x[nearest] - player.x;
    var dy = enemies.y[nearest] - player.y;
    var d = Math.sqrt(dx * dx + dy * dy) || 1;
    var a = Math.atan2(dy, dx);
    var aimErr = angleDelta(player.turret, a);
    player.turret += aimErr * Math.min(0.5, dt * 9.6);
    if (weapon.id === 'laser') {
      var laserTier = currentWeaponTier();
      var range = laserRangeWorld();
      var width = 12 + laserTier * 1.3;
      if (d > range + width + enemies.r[nearest]) {
        laser.t = 0;
        laser.burstT = 0;
        laser.burstMax = 0;
        return;
      }
      var laserAimOk = Math.abs(angleDelta(player.turret, a)) < 0.38 || laser.burstT > 0 || state.fireCd < -0.16;
      if (laser.burstT <= 0) {
        laser.t = 0;
        if (state.fireCd > 0 || !laserAimOk) return;
        laser.burstMax = 0.17 + laserTier * 0.012;
        laser.burstT = laser.burstMax;
        state.fireCd = laser.burstMax + Math.max(0.18, 0.34 - laserTier * 0.022);
        playSfx('laser', 0.30, 0.08, 0.98 + rnd() * 0.05);
      }
      var ca = Math.cos(player.turret);
      var sa = Math.sin(player.turret);
      var beamPower = Math.min(1, (laser.burstMax - laser.burstT) / 0.045) * Math.min(1, laser.burstT / 0.055);
      beamPower = Math.max(0.28, beamPower) * (0.86 + 0.14 * Math.sin(state.t * 48));
      // LASER DPS tracks the SAME additive fire model: player.fireRate = (1+asBonus)/baseInterval (equivalent
      // shots/s), so a fire-rate pick speeds the beam exactly as the cannon, and player.dmg carries the damage
      // picks. laserDpsMul is the cannon->beam conversion (BALANCE-tunable, replaces the old hard-coded 2.75).
      var dps = player.dmg * player.fireRate * BALANCE.weapon.laserDpsMul * beamPower;
      for (var le = enemies.count - 1; le >= 0; le--) {
        var rx = enemies.x[le] - player.x;
        var ry = enemies.y[le] - player.y;
        var along = rx * ca + ry * sa;
        if (along < 0 || along > range) continue;
        var side = Math.abs(-rx * sa + ry * ca);
        if (side > width + enemies.r[le]) continue;
        enemies.hp[le] -= dps * dt;
        if (((state.tick + le) & 7) === 0 && effectAllowed(enemies.x[le], enemies.y[le], enemies.count > 850 ? 1 : 2)) {
          spawnParticle(enemies.x[le], enemies.y[le], -ca * 40, -sa * 40, 1.8, 0.15, 0);
        }
        if (enemies.hp[le] <= 0) killEnemy(le, false);
      }
      laser.x0 = player.x + ca * 24;
      laser.y0 = player.y + sa * 24;
      laser.x1 = player.x + ca * range;
      laser.y1 = player.y + sa * range;
      laser.t = beamPower;
      player.recoil = Math.max(player.recoil, 0.32);
      return;
    }
    if (state.fireCd > 0) return;
    var aimed = Math.abs(angleDelta(player.turret, a)) < 0.52 || state.fireCd < -0.22;
    if (!aimed) return;
    // FIRE MODEL (BALANCE.weapon): the cannon interval = baseInterval / (1 + asBonus) - NEVER a linear
    // seconds-subtraction (that hits zero). Each weapon's cadence is this cannon interval times its relative
    // multiple, so the whole roster shifts together when baseInterval/asBonus change (a fire-rate pick or a
    // meta tier). asBonus is already capped at asBonusCap in recomputeWeaponStats.
    var W = BALANCE.weapon;
    // DEFENSIVE FLOOR: clamp the computed interval to >= 0.05s so a degenerate tuning value (baseInterval at/below
    // 0 from a hand-edited sheet, or a runaway asBonus) can NEVER drive fireCd <= 0 -> fire-every-frame (the old
    // crazy-spray bug, this time via the tuning tool). balance.js also clamps baseInterval on apply; this is the
    // last line of defence at the point of use. 0.05s = 20 shots/s, well past the intended 5x asBonus cap (~2.5/s).
    var cannonInterval = player.baseInterval / (1 + player.asBonus);
    if (!(cannonInterval >= 0.05)) cannonInterval = 0.05;   // also catches NaN/negative (NaN fails the >= test)
    if (weapon.id === 'flak') {
      // SHOTGUN pellets scale CLEARLY with the weapon tier (Tim 2026-06-24 "shotgun spawns more bullets as
      // upgraded"): base 6 + the barrel-pick count + the equipped FLAK tier, so a fresh flak throws ~7 and a maxed
      // one (tier 6, a few barrel picks) visibly storms ~16. The flak turret art is a multi-barrel cluster at every
      // tier (grows chunkier with tier), so a denser blast matches the heavier gun. Capped at 16 (well under
      // MAX_BULLETS=160 even with the loop's own count guard) so the spread stays readable.
      var pellets = Math.min(16, 6 + (player.barrels | 0) + currentWeaponTier());
      for (var f = 0; f < pellets && bullets.count < MAX_BULLETS; f++) {
        var fa = player.turret + (rnd() - 0.5) * 0.58;
        var fs = W.flakProjectileSpeed + rnd() * 190;
        spawnBullet(player.x + Math.cos(fa) * 28, player.y + Math.sin(fa) * 28, Math.cos(fa) * fs, Math.sin(fa) * fs, player.dmg * W.flakDmgMul, 2, 0, 0.34 + rnd() * 0.08);
      }
      state.fireCd = cannonInterval * W.flakIntervalMul;   // slower than the cannon (heavy multi-pellet blast)
      playSfxOneOf(['rep_shotgun4', 'rep_shotgun6', 'rep_shotgun8'], 0.34, 0.055);   // randomised shotgun blast (Tim's kept picks)
      addTrauma(0.06);   // tiny kick on the heavy flak blast (slow-firing, so it doesn't accumulate into rattle)
    } else if (weapon.id === 'missile') {
      // MISSILE count MATCHES the barrels DRAWN on the missile turret (Tim 2026-06-24 "rockets up to 3 at a time
      // when the sprite shows 3"). The weapon_turrets missile row (sprites/weapon_turrets_noshadow.png row 3) shows
      // a SINGLE tube at tiers 0-1, then a 3-TUBE launcher block from tier 2 up (there is no 2-tube frame in the
      // art). currentWeaponTier() is the SAME signal that picks the drawn cell (via weaponAtlasTier), so firing
      // 3 from tier 2 lands exactly when the 3-barrel block appears. Capped at 3 (the most the art ever shows).
      var missiles = currentWeaponTier() >= 2 ? 3 : 1;
      for (var m = 0; m < missiles && bullets.count < MAX_BULLETS; m++) {
        var ma = player.turret + (m - (missiles - 1) * 0.5) * 0.22;
        spawnBullet(player.x + Math.cos(ma) * 30, player.y + Math.sin(ma) * 30, Math.cos(ma) * W.missileProjectileSpeed, Math.sin(ma) * W.missileProjectileSpeed, player.dmg * W.missileDmgMul, 1, 64 + currentWeaponTier() * 5, 1.85);
      }
      state.fireCd = cannonInterval * W.missileIntervalMul;   // the slowest, heaviest shot
      playSfxOneOf(['rep_rocket6', 'rep_rocket7', 'rep_rocket9'], 0.42, 0.075);   // randomised rocket launch (Tim's kept picks)
      addTrauma(0.06);   // tiny kick on the missile launch (slow-firing, so it doesn't accumulate into rattle)
    } else {
      var speed = W.cannonProjectileSpeed;
      var shots = Math.max(1, Math.min(8, player.barrels | 0));
      var spread = shots > 1 ? 0.13 : 0;
      for (var s = 0; s < shots && bullets.count < MAX_BULLETS; s++) {
        var a2 = player.turret + (s - (shots - 1) * 0.5) * spread;
        var sx = player.x + Math.cos(a2) * 28;
        var sy = player.y + Math.sin(a2) * 28;
        spawnBullet(sx, sy, Math.cos(a2) * speed, Math.sin(a2) * speed, player.dmg, 0, 0, 0.95);
      }
      state.fireCd = cannonInterval;   // the base interval = baseInterval / (1 + asBonus)
      playSfx('cannon', 0.34, 0.045);
    }
    player.recoil = 1;
  }

  export function angleDelta(a, b) {
    var d = (b - a + Math.PI) % TWO_PI - Math.PI;
    return d < -Math.PI ? d + TWO_PI : d;
  }
