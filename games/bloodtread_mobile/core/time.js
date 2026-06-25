// Perf / frame-timing subsystem: the perf counters everything writes to, the rolling frame-gap ring
// (for the debug graph), and the long-animation-frame (LoAF) observer. resetPerfTiming() clears the
// rolling stats (called on run start / sprite load). ringI is exported so the loop + HUD can advance/read it.
export var perf = {
  fps: 60, frameMs: 16.7, updateMs: 0, renderMs: 0, hudMs: 0, worstMs: 0,
  updateAvg: 0, renderAvg: 0, updateWorst: 0, renderWorst: 0,
  rafGap: 16.7, loafs: 0, loafWorst: 0, scripts: '', instances: 0,
  creatureDetails: 0, spriteDraws: 0, spriteAnimated: 0, spriteStatic: 0,
  spriteCulled: 0, envSprites: 0, corpseSprites: 0, tankSprites: 0,
  colliderMs: 0, colliderPairs: 0, colliderContacts: 0, colliderSkipped: 0, colliderPush: 0,
  moteInst: 0, moteMerges: 0,
  leechMs: 0, leeches: 0, leechInst: 0, veins: 0, veinInst: 0, tankFeelInst: 0, tankVeinInst: 0, resurrectVeinInst: 0,
  goreMs: 0, gorePieces: 0, goreInst: 0, splats: 0, splatInst: 0,
  booms: 0, boomInst: 0, bubbles: 0, bubbleInst: 0,
  envRocks: 0, envContacts: 0, envEnemyContacts: 0, envBroken: 0,
  frames: 0, longFrames: 0
};

export var ring = new Float32Array(120);   // rolling frame-gap history (read by the debug HUD)
export var ringState = { i: 0 };           // write cursor; the loop advances ringState.i
export var loafLog = [];
var perfResetAt = 0;

export function resetPerfTiming() {
  if (!perf) return;
  perf.fps = 60;
  perf.frameMs = 16.7;
  perf.updateMs = 0;
  perf.renderMs = 0;
  perf.hudMs = 0;
  perf.worstMs = 0;
  perf.updateAvg = 0;
  perf.renderAvg = 0;
  perf.updateWorst = 0;
  perf.renderWorst = 0;
  perf.rafGap = 16.7;
  perf.loafs = 0;
  perf.loafWorst = 0;
  perf.scripts = '';
  perf.longFrames = 0;
  perf.spriteDraws = 0;
  perf.spriteAnimated = 0;
  perf.spriteStatic = 0;
  perf.spriteCulled = 0;
  perf.envSprites = 0;
  perf.corpseSprites = 0;
  perf.tankSprites = 0;
  perf.colliderMs = 0;
  perf.colliderPairs = 0;
  perf.colliderContacts = 0;
  perf.colliderSkipped = 0;
  perf.colliderPush = 0;
  perf.leechMs = 0;
  perf.leeches = 0;
  perf.leechInst = 0;
  perf.veins = 0;
  perf.veinInst = 0;
  perf.tankFeelInst = 0;
  perf.tankVeinInst = 0;
  perf.goreMs = 0;
  perf.gorePieces = 0;
  perf.goreInst = 0;
  perf.splats = 0;
  perf.splatInst = 0;
  perf.booms = 0;
  perf.boomInst = 0;
  perf.bubbles = 0;
  perf.bubbleInst = 0;
  perf.envRocks = 0;
  perf.envContacts = 0;
  perf.envEnemyContacts = 0;
  perf.envBroken = 0;
  perfResetAt = performance.now() + 650;
  loafLog.length = 0;
  for (var i = 0; i < ring.length; i++) ring[i] = 0;
}

if ('PerformanceObserver' in window) {
  try {
    var po = new PerformanceObserver(function (list) {
      var entries = list.getEntries();
      for (var i = 0; i < entries.length; i++) {
        var e = entries[i];
        if ((e.startTime || 0) < perfResetAt) continue;
        perf.loafs++;
        perf.loafWorst = Math.max(perf.loafWorst, e.duration || 0);
        if (e.duration > 50) {
          var src = '';
          if (e.scripts && e.scripts.length) {
            var worst = e.scripts[0];
            for (var s = 1; s < e.scripts.length; s++) {
              if ((e.scripts[s].duration || 0) > (worst.duration || 0)) worst = e.scripts[s];
            }
            src = (worst.sourceFunctionName || worst.invokerType || 'script') + ' ' + Math.round(worst.duration || 0) + 'ms';
          }
          perf.scripts = src || 'browser/render';
          loafLog.push({ t: performance.now(), d: e.duration, src: perf.scripts });
          if (loafLog.length > 24) loafLog.shift();
        }
      }
    });
    po.observe({ type: 'long-animation-frame', buffered: true });
  } catch (err) {}
}
