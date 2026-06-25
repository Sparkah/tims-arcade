// Gore + blood-splat pools: spawn/remove + the spray/burst composers + updateGore physics.
// goreLoadScale() degrades gore volume under enemy/particle load. spawnGoreSpray/spawnGoreBurst are
// hot at kill time; spawnGoreSpray/spawnSplat are called from updateEnemies' contact branch (per-tick).
// Depends on effectAllowed (fx/particles) - kept a DIRECT import. Pools are ring-buffer swap-remove.
import { gore, splats, player, enemies, particles } from '../state.js';
import { MAX_GORE, MAX_SPLATS, GORE_MUL } from '../config.js';
import { GORE_FX } from '../flags.js';
import { TWO_PI } from '../lib/math.js';
import { rnd } from '../lib/rng.js';
import { perf } from '../core/time.js';
import { effectAllowed } from './particles.js';

  export function isTechType(type) {
    return type === 4 || type === 5 || type === 6 || type === 7 || type === 8 || type === 9 || type === 11;
  }

  export function goreLoadScale() {
    if (!GORE_FX || MAX_GORE <= 0) return 0;
    var scale = 1;
    if (enemies.count > 1120 || particles.count > 2000) scale = 0.42;
    else if (enemies.count > 880) scale = 0.60;
    else if (enemies.count > 640) scale = 0.82;
    return scale * GORE_MUL;
  }

  export function spawnSplat(x, y, r, kind, life) {
    if (!GORE_FX || MAX_SPLATS <= 0) return;
    var i;
    if (splats.count < MAX_SPLATS) i = splats.count++;
    else {
      i = splats.cursor;
      splats.cursor = (splats.cursor + 1) % MAX_SPLATS;
    }
    var variant = kind;
    if (kind === 0) {
      var roll = rnd();
      variant = roll < 0.54 ? 0 : (roll < 0.82 ? 2 : 3);
    }
    splats.x[i] = x;
    splats.y[i] = y;
    splats.r[i] = r;
    splats.life[i] = life;
    splats.max[i] = life;
    splats.ang[i] = rnd() * TWO_PI;
    splats.vary[i] = 0.78 + rnd() * 0.54;
    splats.kind[i] = variant;
  }

  export function removeSplat(i) {
    var l = --splats.count;
    if (i === l) return;
    splats.x[i] = splats.x[l]; splats.y[i] = splats.y[l]; splats.r[i] = splats.r[l]; splats.life[i] = splats.life[l]; splats.max[i] = splats.max[l];
    splats.ang[i] = splats.ang[l]; splats.vary[i] = splats.vary[l]; splats.kind[i] = splats.kind[l];
  }

  export function spawnGorePiece(x, y, vx, vy, r, life, kind, angle, spin) {
    if (!GORE_FX || MAX_GORE <= 0) return;
    var i;
    if (gore.count < MAX_GORE) i = gore.count++;
    else {
      i = gore.cursor;
      gore.cursor = (gore.cursor + 1) % MAX_GORE;
    }
    gore.x[i] = x;
    gore.y[i] = y;
    gore.vx[i] = vx;
    gore.vy[i] = vy;
    gore.r[i] = r;
    gore.life[i] = life;
    gore.max[i] = life;
    gore.kind[i] = kind;
    gore.a[i] = angle;
    gore.spin[i] = spin;
  }

  export function removeGorePiece(i) {
    var l = --gore.count;
    if (i === l) return;
    gore.x[i] = gore.x[l]; gore.y[i] = gore.y[l]; gore.vx[i] = gore.vx[l]; gore.vy[i] = gore.vy[l];
    gore.r[i] = gore.r[l]; gore.life[i] = gore.life[l]; gore.max[i] = gore.max[l]; gore.a[i] = gore.a[l]; gore.spin[i] = gore.spin[l]; gore.kind[i] = gore.kind[l];
  }

  export function spawnGoreSpray(x, y, n, baseA, spread, speed, kindBias) {
    var scale = goreLoadScale();
    if (scale <= 0) return;
    var count = Math.max(1, Math.round(n * scale));
    for (var i = 0; i < count; i++) {
      var a = baseA == null ? rnd() * TWO_PI : baseA + (rnd() - 0.5) * (spread || 1.2);
      var sp = (speed || 210) * (0.45 + rnd() * 0.9);
      var kind = kindBias;
      if (kind == null) kind = rnd() < 0.78 ? 0 : (rnd() < 0.55 ? 1 : 2);
      var life = kind === 5 ? 0.24 + rnd() * 0.18 : (kind === 0 ? 0.42 + rnd() * 0.52 : 0.9 + rnd() * 0.75);
      var rad = kind === 0 ? 1.3 + rnd() * 2.2 : 2.2 + rnd() * 3.4;
      spawnGorePiece(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rad, life, kind, a + rnd() * 0.6, (rnd() - 0.5) * 7.5);
    }
  }

  export function spawnGoreBurst(x, y, type, rad, crushed, headA) {
    if (!GORE_FX) return;
    var tech = isTechType(type);
    var big = rad >= 22 || type === 5 || type === 7 || type === 9 || type === 11;
    var load = goreLoadScale();
    if (load <= 0) return;
    // (`headA` - the old head-slam direction - is now unused: deaths are carried by the _death SPRITE animation,
    // not a directional gib burst. Param kept so the killEnemy call site is unchanged.)
    var localLimit = enemies.count > 950 ? 2 : (enemies.count > 620 ? 3 : 5);
    if (!effectAllowed(x, y, localLimit)) {
      // cheap horde path: a ground stain + a thin spray (no chunk loop under load) - matches art-port-v2's
      // degraded path so a dense swarm still flashes some debris without flooding the pools.
      spawnSplat(x, y, rad * (big ? 1.75 : 1.18), tech ? 1 : 0, tech ? 6.1 : 8.4);
      if (gore.count < MAX_GORE * 0.92 && rnd() < 0.72) spawnGoreSpray(x, y, tech ? 3 : 5, null, 0, tech ? 190 : 245, tech ? 5 : 0);
      return;
    }
    // VIVID DEATH (Tim 2026-06-24 round 2: "the gore is not colorful anymore as it used to be"). The art-port-v2
    // chunk-storm I'd restored threw ~37 GRAY metal PLATES (gore kind 3 = `0.37,0.36,0.40`) + pale-tan BONE (kind 2)
    // on a big death, which buried the vivid red and read grey/dingy. This rebalance keeps the blood + SOME metal
    // parts Tim wants, but makes RED + bright sparks dominate again:
    //   - blood (kind 0 = vivid `0.72,0.02,0.05`) spray is the BIG, lead element (boosted).
    //   - the metal loop is cut ~3x AND biased to copper WIRE (kind 4 = reddish `0.64,0.05,0.08`) over the grey
    //     PLATE (kind 3), and the pieces are smaller, so metal still reads (Tim wants it) but never dominates.
    //   - sparks (kind 5 = bright orange `1.0,0.72,0.26`) kept generous = colorful pop.
    //   - organic stays almost pure red: a fat blood spray + geyser/burst variants; the flesh/bone chunk loop is
    //     cut and biased to red FLESH (kind 1) over grey BONE (kind 2).
    // The METAL-SHRAPNEL still plays on top via the boom kind 4 in killEnemy (untouched) - that's the "metal parts".
    // Still * goreLoadScale + behind effectAllowed + the ring buffers, so it stays perf-safe under a 1000+ swarm.
    var force = crushed ? Math.atan2(y - player.y, x - player.x) : null;
    var spread = crushed ? 1.05 : 0;
    var bloodN = tech ? (big ? 16 : 9) : (big ? 38 : 26);   // BLOOD is the lead element (tech bumped up vs the chunk-storm so red, not grey, dominates a biomech death)
    var metalN = tech ? (big ? 5 : 3) : 0;                  // metal-plate/wire loop CUT ~3x from the 14/7 chunk-storm (kept small so metal still reads but never floods grey)
    var fleshN = tech ? 0 : (big ? 5 : 3);                  // organic flesh/bone chunk loop, also cut down (was 13/7)
    if (!big && enemies.count > 900) {                      // thin the small-fry under a heavy swarm
      bloodN = Math.max(5, (bloodN * 0.6) | 0);
      metalN = (metalN * 0.5) | 0;
      fleshN = (fleshN * 0.5) | 0;
    }
    if (tech) {
      // BIOMECH (flesh + metal): a FAT vivid-blood spray leads; then a SMALL loop of tumbling metal, biased to the
      // reddish copper WIRE (kind 4) over the grey PLATE (kind 3) and smaller than before; a generous spark glint;
      // a blood stain + a dark oil stain. Red + sparks dominate, metal is an accent.
      spawnGoreSpray(x, y, bloodN, force, spread || 1.5, crushed ? 290 : 230, 0);   // vivid blood (kind 0) - the lead
      for (var k = 0; k < Math.max(1, Math.round(metalN * load)); k++) {
        var a = force == null ? rnd() * TWO_PI : force + (rnd() - 0.5) * 1.25;
        var sp = 120 + rnd() * 240;                  // shrapnel velocity (fast, far throw)
        var kind = rnd() < 0.6 ? 4 : 3;              // bias to WIRE (kind 4, reddish) over PLATE (kind 3, grey) so the metal reads less grey
        spawnGorePiece(x, y, Math.cos(a) * sp, Math.sin(a) * sp, (2.0 + rnd() * 3.0) * (big ? 1.2 : 1), 1.0 + rnd() * 0.9, kind, a, (rnd() - 0.5) * 8);   // smaller pieces than the chunk-storm
      }
      spawnGoreSpray(x, y, big ? 9 : 5, force, 1.4, 320, 5);   // sparks (kind 5) - bright orange pop, kept generous
      spawnSplat(x, y, rad * (big ? 1.7 : 1.25), 0, 8.0);      // blood stain (vivid red ground)
      spawnSplat(x, y, rad * (big ? 1.5 : 1.1), 1, 6.6);       // oil/tech stain (smaller so it tints less)
    } else {
      // ORGANIC: almost pure vivid RED - a fat blood spray, an occasional directional geyser/burst variant, then a
      // SMALL loop of tumbling chunks biased to red FLESH (kind 1) over grey BONE (kind 2), and a wide blood stain.
      spawnGoreSpray(x, y, bloodN, force, spread || 0, crushed ? 310 : 230, 0);
      var deathVariant = rnd();
      if (deathVariant < 0.30) {
        spawnGoreSpray(x, y - rad * 0.55, big ? 16 : 9, -Math.PI * 0.5, 0.95, big ? 390 : 330, 0);   // upward blood geyser
        spawnSplat(x, y - rad * 0.22, rad * (big ? 1.75 : 1.24), 0, 9.0);
      } else if (deathVariant < 0.62) {
        spawnGoreSpray(x, y, big ? 20 : 12, null, 0, big ? 355 : 295, 0);   // radial blood burst
        if (rnd() < 0.74) spawnSplat(x + (rnd() - 0.5) * rad, y + (rnd() - 0.5) * rad, rad * (big ? 1.48 : 1.08), 0, 7.6);
      }
      for (var j = 0; j < Math.max(1, Math.round(fleshN * load)); j++) {
        var a2 = force == null ? rnd() * TWO_PI : force + (rnd() - 0.5) * 1.2;
        var sp2 = 95 + rnd() * 190;
        var kind2 = rnd() < 0.85 ? 1 : 2;            // bias to red FLESH (kind 1) over grey BONE (kind 2)
        spawnGorePiece(x, y, Math.cos(a2) * sp2, Math.sin(a2) * sp2, (2.3 + rnd() * 3.6) * (big ? 1.15 : 1), 0.95 + rnd() * 0.85, kind2, a2, (rnd() - 0.5) * 9);
      }
      // TEXTURED RIB GIB (kind 6, sprites/gib_ribs.png) - a recognizable bony chunk flung out + tumbling, over
      // the procedural flesh/bone bits. 1 normally, up to 2 on a big death; gore.r drives the drawn size
      // (queueGibSprite: ~r*GIB_VIS). Longer life so it settles + lingers as a body part. * load + the gore ring
      // buffer keep it perf-safe (gore.kind 6 is skipped by the procedural draw, drawn once in the sprite layer).
      // Tim 2026-06-24: RANDOM 0-3 rib gibs per death (he saw up to 5). goreLoadScale() folds in GORE_MUL which
      // can be >1, so `rnd()*N*load` could exceed N-1; clamp to 3 regardless of GORE_MUL. min(1,load) keeps the
      // horde throttle (load<1 thins the count) without ever letting load>1 inflate it past 3.
      var gibN = Math.min(3, (rnd() * 4 * Math.min(1, load)) | 0);
      for (var gb = 0; gb < gibN; gb++) {
        var ag = force == null ? rnd() * TWO_PI : force + (rnd() - 0.5) * 1.3;
        var spg = 70 + rnd() * 150;                  // slower than blood spray (it's a heavy chunk)
        spawnGorePiece(x, y, Math.cos(ag) * spg, Math.sin(ag) * spg, rad * (0.36 + rnd() * 0.16), 1.4 + rnd() * 0.7, 6, rnd() * TWO_PI, (rnd() - 0.5) * 6);
      }
      spawnSplat(x, y, rad * (crushed ? 2.35 : (big ? 2.25 : 1.65)) * (0.9 + rnd() * 0.25), 0, 8.5);
      if (big && rnd() < 0.86) spawnGoreSpray(x, y - rad * 0.45, 13, -Math.PI * 0.5, 1.15, 350, 0);   // big-creature upward blood gout
    }
  }

  export function updateGore(dt) {
    var t0 = performance.now();
    for (var s = splats.count - 1; s >= 0; s--) {
      splats.life[s] -= dt * 0.055;
      if (splats.life[s] <= 0) removeSplat(s);
    }
    for (var i = gore.count - 1; i >= 0; i--) {
      gore.life[i] -= dt;
      if (gore.life[i] <= 0) {
        removeGorePiece(i);
        continue;
      }
      gore.x[i] += gore.vx[i] * dt;
      gore.y[i] += gore.vy[i] * dt;
      gore.a[i] += gore.spin[i] * dt;
      var damp = Math.pow(gore.kind[i] === 0 || gore.kind[i] === 5 ? 0.015 : 0.055, dt);
      gore.vx[i] *= damp;
      gore.vy[i] *= damp;
    }
    perf.goreMs = performance.now() - t0;
  }
