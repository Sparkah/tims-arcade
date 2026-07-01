// rAF frame loop with a fixed-timestep accumulator: clamps gap spikes, steps update(STEP) up to
// MAX_STEPS, then renders world + HUD, recording per-phase perf timing + the frame-gap ring.
// startLoop() kicks the first requestAnimationFrame (called by main at the end of boot).
import { STEP, MAX_STEPS } from '../config.js?v=bm10';
import { RENDER_ONLY, LOGIC_ONLY } from '../flags.js?v=bm10';
import { perf, ring, ringState } from './time.js?v=bm10';
import { update } from '../update.js?v=bm10';
import { renderWorld } from '../render/world.js?v=bm10';
import { renderHud } from '../render/hud.js?v=bm10';

var last = performance.now();
var acc = 0;

  function frame(now) {
    var gap = now - last;
    last = now;
    if (gap > 250) gap = 16.7;
    perf.rafGap = gap;
    perf.frameMs = gap;
    perf.fps = perf.fps * 0.92 + (1000 / Math.max(1, gap)) * 0.08;
    if (gap > perf.worstMs) perf.worstMs = gap; else perf.worstMs += (gap - perf.worstMs) * 0.01;
    if (gap > 34) perf.longFrames++;
    ring[ringState.i++ % ring.length] = gap;

    var u0 = performance.now();
    if (!RENDER_ONLY) {
      acc += gap / 1000;
      var maxAcc = STEP * MAX_STEPS;
      if (acc > maxAcc) acc = maxAcc;
      var steps = 0;
      while (acc >= STEP && steps < MAX_STEPS) {
        update(STEP);
        acc -= STEP;
        steps++;
      }
    }
    perf.updateMs = performance.now() - u0;
    perf.updateAvg = perf.updateAvg * 0.94 + perf.updateMs * 0.06;
    if (perf.updateMs > perf.updateWorst) perf.updateWorst = perf.updateMs; else perf.updateWorst += (perf.updateMs - perf.updateWorst) * 0.004;

    var r0 = performance.now();
    if (!LOGIC_ONLY) renderWorld();
    perf.renderMs = performance.now() - r0;
    perf.renderAvg = perf.renderAvg * 0.94 + perf.renderMs * 0.06;
    if (perf.renderMs > perf.renderWorst) perf.renderWorst = perf.renderMs; else perf.renderWorst += (perf.renderMs - perf.renderWorst) * 0.004;
    renderHud();
    perf.frames++;

    requestAnimationFrame(frame);
  }

export function startLoop() {
  requestAnimationFrame(frame);
}
