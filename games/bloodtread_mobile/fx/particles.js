// Particle/mote/decal pools + the per-cell FX rate-limiter. effectAllowed() throttles cosmetic spawns
// to <limit> per screen cell per tick (HOT path: per-enemy-per-tick) - kept a DIRECT monomorphic import.
// The FX grid (fxStamp/fxCount) is module-private state owned here. Pool spawn/remove are swap-remove.
import { particles, motes, decals, player, state } from '../state.js?v=bm2';
import { MAX_PARTS, MAX_MOTES, MAX_DECALS } from '../config.js?v=bm2';
import { TWO_PI } from '../lib/math.js?v=bm2';
import { rnd } from '../lib/rng.js?v=bm2';

var FX_GRID = 25;
var FX_HALF = (FX_GRID / 2) | 0;
var FX_CELL = 92;
var fxStamp = new Uint32Array(FX_GRID * FX_GRID);
var fxCount = new Uint8Array(FX_GRID * FX_GRID);

  export function effectAllowed(x, y, limit) {
    var cx = Math.floor((x - player.x) / FX_CELL) + FX_HALF;
    var cy = Math.floor((y - player.y) / FX_CELL) + FX_HALF;
    if (cx < 0 || cy < 0 || cx >= FX_GRID || cy >= FX_GRID) return false;
    var i = cy * FX_GRID + cx;
    if (fxStamp[i] !== state.tick) {
      fxStamp[i] = state.tick;
      fxCount[i] = 0;
    }
    if (fxCount[i] >= limit) return false;
    fxCount[i]++;
    return true;
  }

  var moteCursor = 0;
  export function spawnMote(x, y, v) {
    var i;
    if (motes.count < MAX_MOTES) i = motes.count++;
    else { i = moteCursor; moteCursor = (moteCursor + 1) % MAX_MOTES; }   // ring cursor, NOT state.tick (constant within a frame -> a same-frame burst like the resurrect blood-drop would collapse every mote into ONE slot; Codex)
    motes.x[i] = x; motes.y[i] = y;
    motes.vx[i] = (rnd() - 0.5) * 58;
    motes.vy[i] = (rnd() - 0.5) * 58;
    motes.val[i] = v;
    motes.age[i] = 0;
    motes.phase[i] = rnd() * TWO_PI;
    motes.merge[i] = 0;
  }

  export function removeMote(i) {
    var l = --motes.count;
    if (i === l) return;
    motes.x[i] = motes.x[l]; motes.y[i] = motes.y[l]; motes.vx[i] = motes.vx[l]; motes.vy[i] = motes.vy[l]; motes.val[i] = motes.val[l];
    motes.age[i] = motes.age[l]; motes.phase[i] = motes.phase[l]; motes.merge[i] = motes.merge[l];
  }

  export function spawnParticle(x, y, vx, vy, r, life, col) {
    var i;
    if (particles.count < MAX_PARTS) i = particles.count++;
    else {
      i = particles.cursor;
      particles.cursor = (particles.cursor + 1) % MAX_PARTS;
    }
    particles.x[i] = x; particles.y[i] = y; particles.vx[i] = vx; particles.vy[i] = vy; particles.r[i] = r; particles.life[i] = life; particles.max[i] = life; particles.col[i] = col;
  }

  export function removeParticle(i) {
    var l = --particles.count;
    if (i === l) return;
    particles.x[i] = particles.x[l]; particles.y[i] = particles.y[l]; particles.vx[i] = particles.vx[l]; particles.vy[i] = particles.vy[l];
    particles.r[i] = particles.r[l]; particles.life[i] = particles.life[l]; particles.max[i] = particles.max[l]; particles.col[i] = particles.col[l];
  }

  export function spawnDecal(x, y, r, col, alpha) {
    var i;
    if (decals.count < MAX_DECALS) i = decals.count++;
    else {
      i = decals.cursor;
      decals.cursor = (decals.cursor + 1) % MAX_DECALS;
    }
    decals.x[i] = x; decals.y[i] = y; decals.r[i] = r; decals.a[i] = alpha; decals.col[i] = col;
  }

  export function updateParticles(dt) {
    for (var i = particles.count - 1; i >= 0; i--) {
      particles.life[i] -= dt;
      if (particles.life[i] <= 0) {
        removeParticle(i);
        continue;
      }
      particles.x[i] += particles.vx[i] * dt;
      particles.y[i] += particles.vy[i] * dt;
      particles.vx[i] *= 0.945;
      particles.vy[i] *= 0.945;
    }
  }
