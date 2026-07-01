// Leech tendrils: per-slot targeting + grab/drain that flays nearby enemies and heals the player.
// Targets are enemy indices; retargetLeechesAfterRemove keeps them valid across swap-removes (called
// synchronously from removeEnemy - CALLGRAPH hard constraint). Part of the SCC: -> enemies (killEnemy),
// combat (angleDelta), fx/particles, systems/shared. leeches pool state lives in state.js.
import { leeches, enemies, player, state } from '../state.js?v=bm9';
import { MAX_LEECHES } from '../config.js?v=bm9';
import { TWO_PI } from '../lib/math.js?v=bm9';
import { perf } from '../core/time.js?v=bm9';
import { killEnemy } from './enemies.js?v=bm9';
import { angleDelta } from './combat.js?v=bm9';
import { currentLeechLevel } from './shared.js?v=bm9';
import { effectAllowed, spawnParticle } from '../fx/particles.js?v=bm9';
import { gainHeal } from '../fx/heal.js?v=bm9';

  export function resetLeeches() {
    for (var i = 0; i < leeches.target.length; i++) {
      leeches.target[i] = -1;
      leeches.grab[i] = 0;
      leeches.phase[i] = i * 1.731;
    }
    leeches.token = 1;
  }

  export function retargetLeechesAfterRemove(removed, last) {
    if (!leeches.target || !leeches.target.length) return;
    for (var i = 0; i < leeches.target.length; i++) {
      if (leeches.target[i] === removed) {
        leeches.target[i] = -1;
        leeches.grab[i] = 0;
      } else if (removed !== last && leeches.target[i] === last) {
        leeches.target[i] = removed;
      }
    }
  }

  export function updateLeeches(dt) {
    var lvl = currentLeechLevel();
    if (lvl <= 0 || enemies.count <= 0) {
      perf.leeches = 0;
      perf.leechMs = 0;
      for (var z = 0; z < leeches.target.length; z++) {
        leeches.target[z] = -1;
        leeches.grab[z] = Math.max(0, leeches.grab[z] - dt * 4);
      }
      return;
    }
    var t0 = performance.now();
    var slots = Math.min(MAX_LEECHES, 2 + lvl);
    var range = 112 + lvl * 18 + Math.min(55, player.level * 1.4);
    var range2 = range * range;
    var drop2 = range2 * 1.62;
    var dps = (12 + lvl * 6) * Math.max(0.25, player.dmg / 20) * (player.unleash > 0 ? 1.35 : 1);
    var active = 0;
    var draining = 0;
    leeches.token = (leeches.token + 1) & 65535;
    if (leeches.token === 0) {
      leeches.mark.fill(0);
      leeches.token = 1;
    }

    for (var i = 0; i < leeches.target.length; i++) {
      if (i >= slots) {
        leeches.target[i] = -1;
        leeches.grab[i] = Math.max(0, leeches.grab[i] - dt * 3.4);
        continue;
      }
      var t = leeches.target[i];
      if (t >= 0) {
        if (t >= enemies.count) {
          leeches.target[i] = -1;
        } else {
          var dx = enemies.x[t] - player.x;
          var dy = enemies.y[t] - player.y;
          if (dx * dx + dy * dy > drop2) {
            leeches.target[i] = -1;
          } else {
            leeches.mark[t] = leeches.token;
            active++;
          }
        }
      }
    }

    for (var s = 0; s < slots; s++) {
      if (leeches.target[s] >= 0) continue;
      var best = -1;
      var bd = 1e30;
      var rootA = (s / slots) * TWO_PI + state.t * 0.42;
      var pref = range * (0.48 + ((s + state.tick) & 3) * 0.075);
      var pref2 = pref * pref;
      for (var e = 0; e < enemies.count; e++) {
        if (leeches.mark[e] === leeches.token) continue;
        var exd = enemies.x[e] - player.x;
        var eyd = enemies.y[e] - player.y;
        var ed2 = exd * exd + eyd * eyd;
        if (ed2 > range2) continue;
        var ad = Math.abs(angleDelta(rootA, Math.atan2(eyd, exd)));
        var score = Math.abs(ed2 - pref2) / Math.max(1, pref2) + ad * 0.18;
        if (score < bd) {
          bd = score;
          best = e;
        }
      }
      if (best >= 0) {
        leeches.target[s] = best;
        leeches.mark[best] = leeches.token;
        active++;
      }
    }

    for (var l = 0; l < slots; l++) {
      var target = leeches.target[l];
      if (target >= 0 && target < enemies.count) {
        leeches.grab[l] = Math.min(1, leeches.grab[l] + dt * 4.5);
        if (leeches.grab[l] > 0.42) {
          var dmg = dps * dt * leeches.grab[l];
          enemies.hp[target] -= dmg;
          draining += dmg;
          if (player.hp < player.maxHp) { var lh = Math.min(player.maxHp - player.hp, dmg * (player.unleash > 0 ? 0.085 : 0.035)); player.hp += lh; gainHeal(lh, true); }   // drain = dim green glow, no "+N" float
          if (((state.tick + l) & 7) === 0 && effectAllowed(enemies.x[target], enemies.y[target], enemies.count > 850 ? 1 : 2)) {
            var a = Math.atan2(player.y - enemies.y[target], player.x - enemies.x[target]);
            spawnParticle(enemies.x[target], enemies.y[target], Math.cos(a) * 45, Math.sin(a) * 45, 1.5, 0.16, 0);
          }
          if (enemies.hp[target] <= 0) {
            killEnemy(target, false);
            leeches.target[l] = -1;
            leeches.grab[l] = 0;
          }
        }
      } else {
        leeches.target[l] = -1;
        leeches.grab[l] = Math.max(0, leeches.grab[l] - dt * 3.2);
      }
    }
    if (draining > 0) player.hurt = Math.max(player.hurt, Math.min(0.38, draining * 0.0015));
    perf.leeches = active;
    perf.leechMs = performance.now() - t0;
  }
