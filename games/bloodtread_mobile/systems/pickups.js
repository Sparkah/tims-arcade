// XP-mote pickup logic: updateMotes (magnet pull toward the player + collect -> gainXp) and the
// mote-MERGE mechanic (tryMergeMote coalesces nearby small motes into bigger ones, capped per tick).
// Pool spawn/remove live in fx/particles; this is the per-frame system. -> progress (gainXp), audio.
import { motes, player, state } from '../state.js?v=bm2';
import { perf } from '../core/time.js?v=bm2';
import { removeMote } from '../fx/particles.js?v=bm2';
import { gainXp } from './progress.js?v=bm2';
import { playTone } from '../audio.js?v=bm2';

  export function updateMotes(dt) {
    var pr2 = player.pickR * player.pickR;
    perf.moteMerges = 0;
    for (var i = motes.count - 1; i >= 0; i--) {
      var dx = player.x - motes.x[i], dy = player.y - motes.y[i];
      var d2 = dx * dx + dy * dy + 0.0001;
      motes.age[i] += dt;
      if (motes.merge[i] > 0) motes.merge[i] = Math.max(0, motes.merge[i] - dt * 4.8);
      if (d2 < pr2) {
        var inv = 1 / Math.sqrt(d2);
        var pull = 1 - Math.sqrt(d2) / Math.max(1, player.pickR);
        var force = 635 + pull * 285;
        motes.vx[i] += dx * inv * force * dt;
        motes.vy[i] += dy * inv * force * dt;
        var sway = Math.sin(state.t * 15 + motes.phase[i]) * pull * 38 * dt;
        motes.vx[i] += -dy * inv * sway;
        motes.vy[i] += dx * inv * sway;
      }
      motes.x[i] += motes.vx[i] * dt;
      motes.y[i] += motes.vy[i] * dt;
      motes.vx[i] *= 0.956;
      motes.vy[i] *= 0.956;
      if (tryMergeMote(i)) continue;
      if (d2 < (player.r + 14) * (player.r + 14)) {
        gainXp(motes.val[i]);
        playTone(190 + Math.min(5, motes.val[i]) * 22, 0.035, 0.018);
        removeMote(i);
      }
    }
  }

  export function tryMergeMote(i) {
    if (motes.count < 2 || motes.val[i] >= 16 || ((state.tick + i) & 3) !== 0) return false;
    if (perf.moteMerges >= (motes.count > 420 ? 6 : 12)) return false;
    var checks = motes.count > 420 ? 4 : 7;
    var radius = 18 + Math.min(14, Math.sqrt(Math.max(1, motes.val[i])) * 4.4);
    var r2 = radius * radius;
    for (var k = 1; k <= checks; k++) {
      var j = i - k;
      if (j < 0 || motes.val[j] >= 18) continue;
      var dx = motes.x[j] - motes.x[i];
      var dy = motes.y[j] - motes.y[i];
      if (dx * dx + dy * dy > r2) continue;
      var a = Math.max(0.001, motes.val[i]);
      var b = Math.max(0.001, motes.val[j]);
      var total = a + b;
      motes.x[j] = (motes.x[j] * b + motes.x[i] * a) / total;
      motes.y[j] = (motes.y[j] * b + motes.y[i] * a) / total;
      motes.vx[j] = (motes.vx[j] * b + motes.vx[i] * a) / total;
      motes.vy[j] = (motes.vy[j] * b + motes.vy[i] * a) / total;
      motes.val[j] = total;
      motes.merge[j] = 1;
      motes.phase[j] = (motes.phase[j] + motes.phase[i]) * 0.5 + 0.7;
      perf.moteMerges++;
      removeMote(i);
      return true;
    }
    return false;
  }
