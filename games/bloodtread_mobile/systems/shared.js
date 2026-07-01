// Small cross-cutting sim helpers used by BOTH systems and the render/debug HUD. Leaf-like:
// depends only on state/config/flags, never on render or other systems (no import cycle).
import { state, player } from '../state.js?v=bm7';
import { BALANCE, spawnCountAt } from '../balance.js?v=bm7';
import { MAX_ENEMIES, MAX_LEECHES } from '../config.js?v=bm7';
import { LEECH_FX, TOUCH_DEVICE } from '../flags.js?v=bm7';

  // Per-map enemy-count multiplier. Map 1 = 1.0 (unchanged baseline). Each map past 1 adds 22% to the live
  // enemy target, capped at +110% (map 6) so the late-map horde stays inside MAX_ENEMIES / the perf budget
  // rather than running away. Shared by desiredEnemies (here) and the chooseType type-mix shift (enemies.js).
  export function mapDifficultyMul() {
    return 1 + Math.min(5, (state.map - 1)) * 0.22;
  }

  export function desiredEnemies() {
    // ON-SCREEN COUNT is the PRIMARY difficulty lever (NOT sponge HP). Piecewise-linear through the researched
    // control points in BALANCE.spawn.countCurve: ~6-10 @0min -> 15 @1 -> 35 @3 -> 55 @5 -> 90 @10 -> 120 @15
    // -> 150 @20. (Replaced the old quadratic 3 + t*0.10 + t*t*0.00045.) Then the per-map mult densifies map 2+,
    // and the result is clamped to the alive-cap (and MAX_ENEMIES / the perf budget). ?tune retunes the curve live.
    var target = spawnCountAt(state.t / 60);
    target *= mapDifficultyMul();   // map 2+ packs the field denser (see mapDifficultyMul)
    // Mobile (TOUCH_DEVICE) caps the COUNT lower so a phone GPU holds framerate; the speed-ramp + intercept
    // spawning + the Ravener keep the difficulty up, so mobile is still hard, just not as DENSE at the peak.
    var hardCap = TOUCH_DEVICE ? (BALANCE.spawn.mobileAliveCap | 0) : (BALANCE.spawn.aliveCap | 0);
    var cap = Math.min(MAX_ENEMIES, hardCap);
    return Math.min(cap, target | 0);
  }

  export function currentLeechLevel() {
    if (!LEECH_FX || MAX_LEECHES <= 0) return 0;
    return Math.min(8, player.lashLvl);
  }
