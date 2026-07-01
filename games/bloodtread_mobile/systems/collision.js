// Player/enemy vs breakable-rock collision + rock damage/destruction + decal crushing.
// Consumes the obS/decS scratch pre-populated by obstacleAtCell/decalAtCell (systems/environment) and
// mutates the rock-state arrays (obHp/obHitT/obBroken) by slot - the read-after-query flow stays here.
// damageCurrentObstacle MUST live here (CALLGRAPH hard constraint). enemyObstacle{x,y} is the exported
// scratch collideEnemyObstacles resolves into (updateEnemies reads it back the same tick).
import { player, state, view, enemies } from '../state.js?v=bm8';
import { BREAK_ENV } from '../flags.js?v=bm8';
import { ROCK_DENSITY } from '../config.js?v=bm8';
import { TWO_PI } from '../lib/math.js?v=bm8';
import { rnd } from '../lib/rng.js?v=bm8';
import { perf } from '../core/time.js?v=bm8';
import { playSfx, playSfxOneOf } from '../audio.js?v=bm8';
import {
  obS, decS, obHp, obHitT, obBroken, stateIndexFor, decStateIndexFor, obstacleAtCell, decalAtCell
} from './environment.js?v=bm8';
import { spawnParticle, spawnMote, spawnDecal } from '../fx/particles.js?v=bm8';
import { spawnSplat, spawnGoreSpray } from '../fx/gore.js?v=bm8';
import { spawnBoom } from '../fx/world.js?v=bm8';

// scratch the enemy-vs-rock solver resolves into; updateEnemies reads enemyObstacle.x/.y after a hit.
export var enemyObstacle = { x: 0, y: 0 };

  export function collideEnemyObstacles(i, x, y, oldX, oldY, dt) {
    if (!BREAK_ENV || ROCK_DENSITY <= 0) return 0;
    var viewRange = Math.max(view.viewWorldW, view.viewWorldH) * 0.58 + 220;
    var pdx = x - player.x;
    var pdy = y - player.y;
    if (pdx * pdx + pdy * pdy > viewRange * viewRange) return 0;
    enemyObstacle.x = x;
    enemyObstacle.y = y;
    var cell = 250;
    var cx = Math.floor(x / cell);
    var cy = Math.floor(y / cell);
    var contacts = 0;
    for (var pass = 0; pass < 2; pass++) {
      for (var gx = cx - 1; gx <= cx + 1; gx++) {
        for (var gy = cy - 1; gy <= cy + 1; gy++) {
          if (!obstacleAtCell(gx, gy)) continue;
          var dx = enemyObstacle.x - obS.x;
          var dy = enemyObstacle.y - obS.y;
          var rr = obS.r + enemies.r[i] * 0.76;
          var d2 = dx * dx + dy * dy;
          if (d2 >= rr * rr) continue;
          contacts++;
          if (d2 > 0.001) {
            var d = Math.sqrt(d2);
            var nx = dx / d;
            var ny = dy / d;
            enemyObstacle.x += nx * (rr - d);
            enemyObstacle.y += ny * (rr - d);
            var mx = enemyObstacle.x - oldX;
            var my = enemyObstacle.y - oldY;
            var into = mx * nx + my * ny;
            if (into < 0) {
              enemyObstacle.x -= nx * into * 0.38;
              enemyObstacle.y -= ny * into * 0.38;
            }
            var slideSign = ((i + state.tick + gx * 3 + gy * 7) & 1) ? 1 : -1;
            enemies.vx[i] += -ny * slideSign * 26 * dt;
            enemies.vy[i] += nx * slideSign * 26 * dt;
          } else {
            var a = ((i * 1103515245 + state.tick * 12345) & 1023) / 1024 * TWO_PI;
            enemyObstacle.x += Math.cos(a) * rr;
            enemyObstacle.y += Math.sin(a) * rr;
          }
        }
      }
    }
    perf.envEnemyContacts += contacts;
    return contacts;
  }

  export function damageCurrentObstacle(dmg) {
    var key = obS.key;
    var slot = obS.slot >= 0 ? obS.slot : stateIndexFor(key, true, obS.cx, obS.cy, obS.maxHp);
    if (slot < 0) return false;
    obHp[slot] -= dmg;
    obHitT[slot] = state.t;
    obS.hp = obHp[slot];
    obS.hit = state.t;
    if (obHp[slot] > 0 || obBroken[slot]) return false;
    obBroken[slot] = 1;
    perf.envBroken++;
    playSfx('rock', 0.42, 0.08);
    spawnBoom(obS.x, obS.y, obS.r * 0.9, 1);
    spawnDecal(obS.x, obS.y, obS.r * 1.25, 3, 0.16);
    for (var i = 0; i < 10; i++) {
      var a = rnd() * TWO_PI;
      var sp = 80 + rnd() * 180;
      spawnParticle(obS.x, obS.y, Math.cos(a) * sp, Math.sin(a) * sp, 2 + rnd() * 3.5, 0.35 + rnd() * 0.35, 4);
    }
    for (var m = 0; m < 3; m++) spawnMote(obS.x + (rnd() - 0.5) * obS.r, obS.y + (rnd() - 0.5) * obS.r, 2);
    return true;
  }

  export function obstacleHitAt(x, y) {
    if (!BREAK_ENV) return false;
    var cell = 250;
    var cx = Math.floor(x / cell);
    var cy = Math.floor(y / cell);
    for (var gx = cx - 1; gx <= cx + 1; gx++) {
      for (var gy = cy - 1; gy <= cy + 1; gy++) {
        if (!obstacleAtCell(gx, gy)) continue;
        var dx = x - obS.x;
        var dy = y - obS.y;
        if (dx * dx + dy * dy < obS.r * obS.r) return true;
      }
    }
    return false;
  }

  export function crushNearbyDecals(px0, py0, cr) {
    if (!BREAK_ENV) return;
    var cell = 132;
    var cx = Math.floor(px0 / cell);
    var cy = Math.floor(py0 / cell);
    var cr2 = cr * cr;
    for (var gx = cx - 1; gx <= cx + 1; gx++) {
      for (var gy = cy - 1; gy <= cy + 1; gy++) {
        if (!decalAtCell(gx, gy)) continue;
        if (!(decS.kind === 2 || decS.kind === 3 || decS.kind === 4 || decS.kind === 5 || decS.kind === 7)) continue;
        var dx = px0 - decS.x;
        var dy = py0 - decS.y;
        if (dx * dx + dy * dy >= cr2) continue;
        decStateIndexFor(decS.key, true);
        if (decS.kind === 3 || decS.kind === 5 || decS.kind === 7) {
          // kind 3/5/7 = bones/ribs/skull decals -> Tim's CHOSEN bone-break pool (2026-06-24 kept candidates).
          // 'crunch' DROPPED (Tim). vol 0.18, gap 0.16.
          playSfxOneOf(['bone1', 'bone2', 'bone3', 'cand_bone4', 'cand_bone5', 'cand_bone6', 'cand_bone7', 'cand_bone8', 'cand_bone9', 'cand_bone10', 'cand_bone11', 'cand_bone12', 'rep_crunch1', 'rep_crunch2', 'rep_crunch3'], 0.18, 0.16);
          spawnSplat(decS.x, decS.y, 14 + rnd() * 12, 0, 4.5);
          spawnGoreSpray(decS.x, decS.y, 5, null, 0, 150, 0);
        } else {
          for (var p = 0; p < 4; p++) {
            var a = rnd() * TWO_PI;
            spawnParticle(decS.x, decS.y, Math.cos(a) * 80, Math.sin(a) * 80, 1.6 + rnd() * 2.2, 0.22 + rnd() * 0.25, 3);
          }
        }
      }
    }
  }

  export function crushNearbyRocks(px0, py0, cr) {
    if (!BREAK_ENV) return;
    var power = Math.max(1, player.crushDps / 72);
    if (power < 1.18) return;
    var cell = 250;
    var cx = Math.floor(px0 / cell);
    var cy = Math.floor(py0 / cell);
    for (var gx = cx - 1; gx <= cx + 1; gx++) {
      for (var gy = cy - 1; gy <= cy + 1; gy++) {
        if (!obstacleAtCell(gx, gy)) continue;
        if (power < 1.18 + obS.size * 0.075) continue;
        var dx = px0 - obS.x;
        var dy = py0 - obS.y;
        var rr = obS.r + cr;
        if (dx * dx + dy * dy < rr * rr) damageCurrentObstacle(obS.maxHp + 999);
      }
    }
  }

  export function collidePlayerObstacles() {
    if (!BREAK_ENV) return;
    var cell = 250;
    var cx = Math.floor(player.x / cell);
    var cy = Math.floor(player.y / cell);
    var contacts = 0;
    for (var pass = 0; pass < 2; pass++) {
      for (var gx = cx - 1; gx <= cx + 1; gx++) {
        for (var gy = cy - 1; gy <= cy + 1; gy++) {
          if (!obstacleAtCell(gx, gy)) continue;
          perf.envRocks++;
          var dx = player.x - obS.x;
          var dy = player.y - obS.y;
          var rr = obS.r + player.r + 8;
          var d2 = dx * dx + dy * dy;
          if (d2 >= rr * rr) continue;
          contacts++;
          if (d2 > 0.001) {
            var d = Math.sqrt(d2);
            var push = rr - d;
            var nx = dx / d;
            var ny = dy / d;
            player.x += nx * push;
            player.y += ny * push;
            var into = player.vx * nx + player.vy * ny;
            if (into < 0) {
              player.vx -= nx * into * 1.35;
              player.vy -= ny * into * 1.35;
            }
          } else {
            player.x += rr;
          }
        }
      }
    }
    perf.envContacts += contacts;
  }
