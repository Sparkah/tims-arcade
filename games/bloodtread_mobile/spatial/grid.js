// Enemy-enemy + enemy-player collision via a uniform spatial hash grid centered on the player.
// The grid (head/next/cell linked lists) + origin are module-private, rebuilt each tick by
// buildColliderGrid. resolveEnemyColliders pushes overlapping pairs apart (capped) + shoves the player.
// rule-#4: enemies.x/.r etc are read directly per the original (loops never realloc the pool).
import { enemies, player, state } from '../state.js';
import { MAX_ENEMIES, COLLIDER_CELL, COLLIDER_PAIR_CAP, COLLIDER_PAIR_LIMIT, COLLIDER_PLAYER_CAP } from '../config.js';
import { COLLIDERS } from '../flags.js';
import { TWO_PI } from '../lib/math.js';
import { perf } from '../core/time.js';

var COLLIDER_GRID = 80;
var COLLIDER_HALF = COLLIDER_GRID * 0.5;
var colliderHead = new Int32Array(COLLIDER_GRID * COLLIDER_GRID);
var colliderNext = new Int32Array(MAX_ENEMIES);
var colliderCell = new Int32Array(MAX_ENEMIES);
var colliderOriginX = 0;
var colliderOriginY = 0;

  export function buildColliderGrid() {
    colliderOriginX = player.x - COLLIDER_HALF * COLLIDER_CELL;
    colliderOriginY = player.y - COLLIDER_HALF * COLLIDER_CELL;
    colliderHead.fill(-1);
    for (var i = 0; i < enemies.count; i++) {
      var cx0 = ((enemies.x[i] - colliderOriginX) / COLLIDER_CELL) | 0;
      var cy0 = ((enemies.y[i] - colliderOriginY) / COLLIDER_CELL) | 0;
      if (cx0 < 0 || cy0 < 0 || cx0 >= COLLIDER_GRID || cy0 >= COLLIDER_GRID) {
        colliderCell[i] = -1;
        colliderNext[i] = -1;
        continue;
      }
      var cell = cy0 * COLLIDER_GRID + cx0;
      colliderCell[i] = cell;
      colliderNext[i] = colliderHead[cell];
      colliderHead[cell] = i;
    }
  }

  export function resolveEnemyColliders(dt) {
    if (!COLLIDERS || enemies.count <= 0) {
      perf.colliderMs = 0;
      perf.colliderPairs = 0;
      perf.colliderContacts = 0;
      perf.colliderSkipped = 0;
      perf.colliderPush = 0;
      return;
    }
    var t0 = performance.now();
    buildColliderGrid();
    var pairs = 0;
    var contacts = 0;
    var skipped = 0;
    var pushed = 0;

    if (COLLIDER_PAIR_CAP > 0 && COLLIDER_PAIR_LIMIT > 0) {
      outer:
      for (var i = 0; i < enemies.count; i++) {
        var cell = colliderCell[i];
        if (cell < 0) continue;
        var cx0 = cell % COLLIDER_GRID;
        var cy0 = (cell / COLLIDER_GRID) | 0;
        var localPairs = 0;
        for (var oy0 = -1; oy0 <= 1; oy0++) {
          var yy = cy0 + oy0;
          if (yy < 0 || yy >= COLLIDER_GRID) continue;
          for (var ox0 = -1; ox0 <= 1; ox0++) {
            var xx = cx0 + ox0;
            if (xx < 0 || xx >= COLLIDER_GRID) continue;
            var j = colliderHead[yy * COLLIDER_GRID + xx];
            while (j >= 0) {
              if (j > i) {
                pairs++;
                if (pairs > COLLIDER_PAIR_CAP) {
                  skipped++;
                  break outer;
                }
                var dx = enemies.x[i] - enemies.x[j];
                var dy = enemies.y[i] - enemies.y[j];
                var minD = (enemies.r[i] + enemies.r[j]) * 0.72;
                var d2 = dx * dx + dy * dy;
                if (d2 < minD * minD) {
                  var d = Math.sqrt(d2);
                  var nx, ny;
                  if (d > 0.001) {
                    nx = dx / d;
                    ny = dy / d;
                  } else {
                    var a = (((i * 16807 + j * 48271) & 1023) / 1024) * TWO_PI;
                    nx = Math.cos(a);
                    ny = Math.sin(a);
                    d = 0.001;
                  }
                  var push = Math.min(9.5 * dt * 60, (minD - d) * 0.42);
                  var sum = enemies.r[i] + enemies.r[j] + 0.001;
                  var wi = enemies.r[j] / sum;
                  var wj = enemies.r[i] / sum;
                  enemies.x[i] += nx * push * wi;
                  enemies.y[i] += ny * push * wi;
                  enemies.x[j] -= nx * push * wj;
                  enemies.y[j] -= ny * push * wj;
                  pushed += push;
                }
                localPairs++;
                if (localPairs >= COLLIDER_PAIR_LIMIT) break;
              }
              j = colliderNext[j];
            }
            if (localPairs >= COLLIDER_PAIR_LIMIT) break;
          }
          if (localPairs >= COLLIDER_PAIR_LIMIT) break;
        }
      }
    }

    var pxPush = 0;
    var pyPush = 0;
    var solidR = player.r + 8;
    for (var e = 0; e < enemies.count; e++) {
      var dxp = player.x - enemies.x[e];
      var dyp = player.y - enemies.y[e];
      var minP = solidR + enemies.r[e] * 0.82;
      var pd2 = dxp * dxp + dyp * dyp;
      if (pd2 >= minP * minP) continue;
      var pd = Math.sqrt(pd2);
      var ux, uy;
      if (pd > 0.001) {
        ux = dxp / pd;
        uy = dyp / pd;
      } else {
        var pa = ((e * 1103515245 + state.tick * 12345) & 1023) / 1024 * TWO_PI;
        ux = Math.cos(pa);
        uy = Math.sin(pa);
        pd = 0.001;
      }
      var overlap = minP - pd;
      var enemyPush = Math.min(14 * dt * 60, overlap * 0.58);
      enemies.x[e] -= ux * enemyPush;
      enemies.y[e] -= uy * enemyPush;
      pxPush += ux * overlap * 0.16;
      pyPush += uy * overlap * 0.16;
      enemies.vx[e] -= ux * 18 * dt;
      enemies.vy[e] -= uy * 18 * dt;
      contacts++;
    }
    var p2 = pxPush * pxPush + pyPush * pyPush;
    if (p2 > 0.0001) {
      var pm = Math.sqrt(p2);
      var cap = COLLIDER_PLAYER_CAP;
      if (pm > cap) {
        pxPush *= cap / pm;
        pyPush *= cap / pm;
        pm = cap;
      }
      player.x += pxPush;
      player.y += pyPush;
      var nxp = pxPush / pm;
      var nyp = pyPush / pm;
      var into = player.vx * nxp + player.vy * nyp;
      if (into < 0) {
        player.vx -= nxp * into * 1.35;
        player.vy -= nyp * into * 1.35;
      }
      player.vx += pxPush * 28;
      player.vy += pyPush * 28;
      player.vx *= 0.84;
      player.vy *= 0.84;
      pushed += pm;
    }

    perf.colliderMs = performance.now() - t0;
    perf.colliderPairs = pairs;
    perf.colliderContacts = contacts;
    perf.colliderSkipped = skipped;
    perf.colliderPush = pushed;
  }
