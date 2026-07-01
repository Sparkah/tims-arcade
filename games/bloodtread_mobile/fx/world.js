// World-cosmetic pools: explosions (booms), blood bubbles, rage bubbles, corpses, vein trails, tread
// tracks + updateWorldFx (laser timers + boom/bubble physics). Pure leaf pools (swap-remove / ring).
// spawnRageBubble + the vein/track spawns are driven by the player/unleash systems at runtime.
import { booms, bubbles, corpses, veins, tracks, player, laser } from '../state.js?v=bm9';
import { MAX_BOOMS, MAX_BUBBLES, MAX_VEINS, CORPSE_CAP, TRACK_CAP } from '../config.js?v=bm9';
import { OLD_DEATH, VEIN_FX } from '../flags.js?v=bm9';
import { TWO_PI } from '../lib/math.js?v=bm9';
import { rnd } from '../lib/rng.js?v=bm9';

  export function spawnBoom(x, y, r, kind) {
    if (MAX_BOOMS <= 0) return;
    var i;
    if (booms.count < MAX_BOOMS) i = booms.count++;
    else {
      i = booms.cursor;
      booms.cursor = (booms.cursor + 1) % MAX_BOOMS;
    }
    booms.x[i] = x;
    booms.y[i] = y;
    booms.r[i] = r;
    booms.t[i] = 0;
    // kind 0 = light procedural puff; kind 1 = rock rubble-shatter; kind 3 = organic blood-splash sprite
    // (gore_blood, 16f); kind 4 = tech metal-shrapnel - all 0.72s so the debris/splash reads + lingers. kind 2 =
    // the explosion.png FIREBALL sprite (Tim 2026-06-23: real sprite-anim deaths) - 0.9s plays all 50 frames then
    // settles, so a tank death's fireball blends into the ~1.35s wreck pause.
    booms.max[i] = kind === 2 ? 0.9 : 0.72;
    booms.kind[i] = kind || 0;
  }

  export function removeBoom(i) {
    var l = --booms.count;
    if (i === l) return;
    booms.x[i] = booms.x[l]; booms.y[i] = booms.y[l]; booms.r[i] = booms.r[l];
    booms.t[i] = booms.t[l]; booms.max[i] = booms.max[l]; booms.kind[i] = booms.kind[l];
  }

  export function spawnBubble(x, y, vx, vy, r, life) {
    if (MAX_BUBBLES <= 0) return;
    var i;
    if (bubbles.count < MAX_BUBBLES) i = bubbles.count++;
    else {
      i = bubbles.cursor;
      bubbles.cursor = (bubbles.cursor + 1) % MAX_BUBBLES;
    }
    bubbles.x[i] = x; bubbles.y[i] = y; bubbles.vx[i] = vx; bubbles.vy[i] = vy;
    bubbles.r[i] = r; bubbles.t[i] = 0; bubbles.max[i] = life;
  }

  export function removeBubble(i) {
    var l = --bubbles.count;
    if (i === l) return;
    bubbles.x[i] = bubbles.x[l]; bubbles.y[i] = bubbles.y[l]; bubbles.vx[i] = bubbles.vx[l]; bubbles.vy[i] = bubbles.vy[l];
    bubbles.r[i] = bubbles.r[l]; bubbles.t[i] = bubbles.t[l]; bubbles.max[i] = bubbles.max[l];
  }

  export function spawnRageBubble(rage, boost) {
    if (MAX_BUBBLES <= 0) return;
    var ba = rnd() * TWO_PI;
    var brd = 6 + rnd() * (18 + rage * 10);
    var sp = boost || 1;
    spawnBubble(
      player.x + Math.cos(ba) * brd,
      player.y + Math.sin(ba) * brd,
      (Math.cos(ba) * 22 + (rnd() - 0.5) * 34) * sp,
      (Math.sin(ba) * 17 - 38 - rnd() * 30) * sp,
      (3.2 + rnd() * 5.8 + rage * 5.2) * sp,
      0.52 + rnd() * 0.55
    );
  }

  export function updateWorldFx(dt) {
    if (laser.t > 0) laser.t = Math.max(0, laser.t - dt * 7.0);
    if (laser.burstT > 0) laser.burstT = Math.max(0, laser.burstT - dt);
    for (var i = booms.count - 1; i >= 0; i--) {
      booms.t[i] += dt;
      if (booms.t[i] >= booms.max[i]) removeBoom(i);
    }
    for (var b = bubbles.count - 1; b >= 0; b--) {
      bubbles.t[b] += dt;
      if (bubbles.t[b] >= bubbles.max[b]) {
        removeBubble(b);
        continue;
      }
      bubbles.x[b] += bubbles.vx[b] * dt;
      bubbles.y[b] += bubbles.vy[b] * dt;
      bubbles.vx[b] *= Math.pow(0.16, dt);
      bubbles.vy[b] *= Math.pow(0.12, dt);
    }
  }

  export function spawnCorpse(x, y, type, rad, face) {
    if (!OLD_DEATH || CORPSE_CAP <= 0) return;
    var i;
    if (corpses.count < CORPSE_CAP) i = corpses.count++;
    else {
      i = corpses.cursor;
      corpses.cursor = (corpses.cursor + 1) % CORPSE_CAP;
    }
    corpses.x[i] = x;
    corpses.y[i] = y;
    corpses.r[i] = rad;
    corpses.t[i] = 0;
    corpses.type[i] = type;
    corpses.face[i] = face < 0 ? -1 : 1;
  }

  export function removeCorpse(i) {
    var l = --corpses.count;
    if (i === l) return;
    corpses.x[i] = corpses.x[l]; corpses.y[i] = corpses.y[l]; corpses.r[i] = corpses.r[l]; corpses.t[i] = corpses.t[l]; corpses.type[i] = corpses.type[l]; corpses.face[i] = corpses.face[l];
  }

  export function updateCorpses(dt) {
    // CORPSE_LIFE was 0.72s - the 12-frame death-collapse sheet crammed into ~0.7s then vanished, reading as a
    // flash rather than "the creature dies". Now ~1.5s: the collapse plays out over the first ~0.85s (see
    // queueOldCorpseSprite's frame map), HOLDS the final crumpled frame, then fades in the last stretch.
    for (var i = corpses.count - 1; i >= 0; i--) {
      corpses.t[i] += dt;
      if (corpses.t[i] > 1.5) removeCorpse(i);
    }
  }

  export function spawnVeinTrail(x, y, angle) {
    if (!VEIN_FX || MAX_VEINS <= 0) return;
    var i;
    if (veins.count < MAX_VEINS) i = veins.count++;
    else {
      i = veins.cursor;
      veins.cursor = (veins.cursor + 1) % MAX_VEINS;
    }
    var len = 18 + rnd() * 28;
    veins.x[i] = x;
    veins.y[i] = y;
    veins.a[i] = angle;
    veins.len[i] = len;
    veins.curl[i] = (rnd() - 0.5) * 0.9;
    veins.grow[i] = 0;
    veins.life[i] = 4.8 + rnd() * 1.5;
    veins.b1a[i] = angle + (rnd() - 0.5) * 1.45;
    veins.b1l[i] = len * (0.38 + rnd() * 0.45);
    veins.b2a[i] = angle + (rnd() - 0.5) * 1.9;
    veins.b2l[i] = rnd() < 0.55 ? len * (0.28 + rnd() * 0.34) : 0;
  }

  export function removeVein(i) {
    var l = --veins.count;
    if (i === l) return;
    veins.x[i] = veins.x[l]; veins.y[i] = veins.y[l]; veins.a[i] = veins.a[l]; veins.len[i] = veins.len[l]; veins.curl[i] = veins.curl[l];
    veins.grow[i] = veins.grow[l]; veins.life[i] = veins.life[l]; veins.b1a[i] = veins.b1a[l]; veins.b1l[i] = veins.b1l[l]; veins.b2a[i] = veins.b2a[l]; veins.b2l[i] = veins.b2l[l];
  }

  export function updateVeinTrails(dt) {
    for (var i = veins.count - 1; i >= 0; i--) {
      if (veins.grow[i] < 1) veins.grow[i] = Math.min(1, veins.grow[i] + dt * 4.6);
      veins.life[i] -= dt;
      if (veins.life[i] <= 0) removeVein(i);
    }
  }

  export function spawnTrack(x, y, angle) {
    var i;
    if (tracks.count < TRACK_CAP) i = tracks.count++;
    else {
      i = tracks.cursor;
      tracks.cursor = (tracks.cursor + 1) % TRACK_CAP;
    }
    tracks.x[i] = x;
    tracks.y[i] = y;
    tracks.a[i] = angle;
    tracks.life[i] = 1;
  }
