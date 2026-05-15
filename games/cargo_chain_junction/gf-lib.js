// gf-lib.js — Tim's Game Factory shared library
//
// Loaded via <script src="./gf-lib.js"></script> BEFORE the game's inline
// script. Exposes window.GF — the game registers its update/draw/strings
// via GF.init({...}) and the lib handles canvas/resize, input, particles,
// localisation, sprite loading, SDK boot, and the main loop.
//
// Per-game code shrinks from ~500 lines (vanilla template) to ~100-200
// lines focused purely on game logic + look.

(function() {
'use strict';

// ── CANVAS / RESIZE ──────────────────────────────────────────────────────
var canvas = document.getElementById('c');
if (!canvas) {
  // Auto-create one if the page didn't include it
  canvas = document.createElement('canvas');
  canvas.id = 'c';
  document.body.appendChild(canvas);
}
var ctx = canvas.getContext('2d');
var W = 0, H = 0, cx = 0, cy = 0, S = 1;
var DESIGN_W = 800, DESIGN_H = 600;

function resize() {
  W = canvas.width  = window.innerWidth;
  H = canvas.height = window.innerHeight;
  cx = W / 2; cy = H / 2;
  S = Math.min(W / DESIGN_W, H / DESIGN_H);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);
// Yandex 1.6.2.3 — on mobile, exiting fullscreen can leave the viewport at
// the fullscreen dimensions because the resize event sometimes fires before
// the browser settles. Fire resize on every dimension-changing transition
// with two delayed retries so the canvas always matches the viewport.
function _gfForceResize() { setTimeout(resize, 60); setTimeout(resize, 250); }
document.addEventListener('fullscreenchange',       _gfForceResize);
document.addEventListener('webkitfullscreenchange', _gfForceResize);
window.addEventListener('pageshow', _gfForceResize);
resize();

// Yandex 1.9 — run progress must persist across page refreshes. Games call
// GF.persist(key, getState, applyState) inside their onReady. The lib:
//   - on boot: reads localStorage[key], if present passes it to applyState
//   - exposes GF.saveRun() — call after every state transition
// The game keeps its own state shape; the lib only ferries JSON.
var _persistKey = null, _persistGetter = null;
function persist(key, getState, applyState) {
  _persistKey = key; _persistGetter = getState;
  try {
    var raw = localStorage.getItem(key);
    if (raw) { applyState(JSON.parse(raw)); return true; }
  } catch (_) {}
  return false;
}
function saveRun() {
  if (!_persistKey || !_persistGetter) return;
  try {
    var s = _persistGetter();
    if (s === null || s === undefined) { localStorage.removeItem(_persistKey); return; }
    localStorage.setItem(_persistKey, JSON.stringify(s));
  } catch (_) {}
}

// ── LOCALISATION ─────────────────────────────────────────────────────────
var lang = 'en';
var STRINGS = { en: {} };
function t(k) { return (STRINGS[lang] || STRINGS.en)[k] || k; }

// ── UTILS ────────────────────────────────────────────────────────────────
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function lerp(a, b, x)    { return a + (b - a) * x; }
function dist(ax, ay, bx, by) { var dx=ax-bx, dy=ay-by; return Math.sqrt(dx*dx+dy*dy); }
function rr(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

// ── KEYBOARD ─────────────────────────────────────────────────────────────
var keys = {};
document.addEventListener('keydown', function(e) { keys[e.code] = true; });
document.addEventListener('keyup',   function(e) { keys[e.code] = false; });
document.addEventListener('contextmenu', function(e) { e.preventDefault(); });
document.addEventListener('wheel', function(e) { e.preventDefault(); }, { passive: false });

// ── TOUCH (joystick-style drag) ──────────────────────────────────────────
var touch = { active: false, sx: 0, sy: 0, dx: 0, dy: 0, x: 0, y: 0, id: null };
canvas.addEventListener('touchstart', function(e) {
  e.preventDefault();
  var t0 = e.changedTouches[0];
  touch.active = true; touch.id = t0.identifier;
  touch.sx = t0.clientX; touch.sy = t0.clientY;
  touch.x = t0.clientX; touch.y = t0.clientY;
  touch.dx = 0; touch.dy = 0;
  checkButtons(t0.clientX, t0.clientY);
}, { passive: false });
canvas.addEventListener('touchmove', function(e) {
  e.preventDefault();
  for (var i = 0; i < e.changedTouches.length; i++) {
    var t0 = e.changedTouches[i];
    if (t0.identifier !== touch.id) continue;
    touch.x = t0.clientX; touch.y = t0.clientY;
    var dx = t0.clientX - touch.sx, dy = t0.clientY - touch.sy;
    var d = Math.sqrt(dx*dx + dy*dy);
    if (d > 8) { touch.dx = dx / Math.max(d, 50); touch.dy = dy / Math.max(d, 50); }
  }
}, { passive: false });
canvas.addEventListener('touchend', function(e) {
  e.preventDefault();
  for (var i = 0; i < e.changedTouches.length; i++) {
    if (e.changedTouches[i].identifier === touch.id) {
      touch.active = false; touch.dx = 0; touch.dy = 0;
    }
  }
}, { passive: false });
document.addEventListener('touchmove', function(e) { e.preventDefault(); }, { passive: false });

// ── BUTTONS (declarative click-targets, populated by overlay screens) ───
var buttons = [];
function checkButtons(x, y) {
  for (var i = 0; i < buttons.length; i++) {
    var b = buttons[i];
    if (x >= b.x && x <= b.x+b.w && y >= b.y && y <= b.y+b.h) { b.fn(); return true; }
  }
  return false;
}
canvas.addEventListener('click', function(e) { checkButtons(e.clientX, e.clientY); });

// ── PARTICLES & FLOATS ───────────────────────────────────────────────────
var particles = [];
function spawnParticles(x, y, color, n) {
  for (var i = 0; i < n; i++) {
    var a = Math.random() * Math.PI * 2;
    var sp = (1.5 + Math.random() * 3.5) * S;
    particles.push({ x:x, y:y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp,
      r:(2 + Math.random()*4)*S, color:color, life:1 });
  }
}
function updateParticles(dt) {
  for (var i = particles.length - 1; i >= 0; i--) {
    var p = particles[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.05 * S;
    p.life -= dt * 1.6;
    if (p.life <= 0) particles.splice(i, 1);
  }
}
function drawParticles() {
  for (var i = 0; i < particles.length; i++) {
    var p = particles[i];
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = p.color; ctx.fill();
  }
  ctx.globalAlpha = 1;
}

var floats = [];
function spawnFloat(x, y, txt, col) {
  floats.push({ x:x, y:y, txt:txt, col:col || '#fff', life:1.3, vy:-2 * S });
}
function updateFloats(dt) {
  for (var i = floats.length - 1; i >= 0; i--) {
    var f = floats[i];
    f.y += f.vy; f.life -= dt * 1.0;
    if (f.life <= 0) floats.splice(i, 1);
  }
}
function drawFloats() {
  for (var i = 0; i < floats.length; i++) {
    var f = floats[i];
    ctx.globalAlpha = Math.max(0, f.life);
    ctx.font = 'bold ' + clamp(15*S, 11, 22) + 'px sans-serif';
    ctx.fillStyle = f.col; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(f.txt, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

// ── SCREEN SHAKE ─────────────────────────────────────────────────────────
var shake = 0;
function setShake(v) { shake = Math.max(shake, v); }
function updateShake(dt) { shake = Math.max(0, shake - dt * 8); }
function shakeOffset() {
  if (shake <= 0) return { x: 0, y: 0 };
  return { x: (Math.random() - 0.5) * shake * 12 * S, y: (Math.random() - 0.5) * shake * 12 * S };
}

// ── SPRITES ──────────────────────────────────────────────────────────────
var sprites = {};
function loadSprites(names) {
  if (!names || !names.length) return Promise.resolve();
  return Promise.all(names.map(function(name) {
    return new Promise(function(resolve) {
      var img = new Image();
      img.onload  = function() { sprites[name] = img;  resolve(); };
      img.onerror = function() { sprites[name] = null; resolve(); };
      img.src = './sprites/' + name + '.png';
    });
  }));
}
function drawSprite(name, x, y, size, fallbackFn) {
  var img = sprites[name];
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, x - size/2, y - size/2, size, size);
  } else if (typeof fallbackFn === 'function') {
    fallbackFn(ctx, x, y, size);
  }
}

// ── OVERLAY (menu / gameover / level-end screen) ─────────────────────────
function drawOverlay(opts) {
  // opts: { title, sub, sub2, btnText, btnFn, bestText }
  buttons = [];
  ctx.fillStyle = 'rgba(8,8,18,0.88)';
  ctx.fillRect(0, 0, W, H);

  var titleFs = clamp(36*S, 22, 56);
  var subFs   = clamp(16*S, 12, 22);
  var btnW    = clamp(240*S, 160, 320), btnH = clamp(52*S, 40, 66);
  var btnX    = cx - btnW/2, btnY = cy + 20*S;

  // title with glow
  ctx.shadowColor = 'rgba(46,204,113,0.4)'; ctx.shadowBlur = 30*S;
  ctx.font = 'bold '+titleFs+'px sans-serif';
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(opts.title || '', cx, cy - 50*S);
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;

  if (opts.sub)  { ctx.font = subFs+'px sans-serif'; ctx.fillStyle = '#9ab'; ctx.fillText(opts.sub,  cx, cy - 16*S); }
  if (opts.sub2) { ctx.font = subFs+'px sans-serif'; ctx.fillStyle = '#bcd'; ctx.fillText(opts.sub2, cx, cy + 2*S);  }

  if (opts.btnText && opts.btnFn) {
    var grad = ctx.createLinearGradient(btnX, btnY, btnX, btnY+btnH);
    grad.addColorStop(0, '#2ecc71'); grad.addColorStop(1, '#27ae60');
    rr(ctx, btnX, btnY, btnW, btnH, btnH/2);
    ctx.fillStyle = grad; ctx.fill();
    ctx.font = 'bold '+subFs+'px sans-serif'; ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    ctx.fillText(opts.btnText, cx, btnY + btnH/2);
    ctx.textBaseline = 'alphabetic';
    buttons.push({ x: btnX, y: btnY, w: btnW, h: btnH, fn: opts.btnFn });
  }

  if (opts.bestText) {
    ctx.font = clamp(13*S,10,17)+'px sans-serif';
    ctx.fillStyle = '#557';
    ctx.fillText(opts.bestText, cx, btnY + btnH + 28*S);
  }
}

// ── SHARE CARD (1200×630 PNG for social shares) ──────────────────────────
// Generates a brand-styled share card with the game's title, primary stat,
// and a CTA. Returns a Promise<Blob>. Pair with shareBlob() to push it
// through the Web Share API or download fallback.
//
// opts: {
//   gameTitle:     string,                          // big game-name line
//   primaryLabel:  string (default 'I scored'),      // small label above primary
//   primaryStat:   string,                           // the headline number / time
//   secondaryStat: string (optional, e.g. '🏆 Rank #3')
//   footer:        string (optional, e.g. 'Day seed 20260507')
//   slug:          string (game slug, used in CTA URL)
//   bg:            { from, mid, to } gradient stops (defaults: synthwave)
//   accent:        accent colour (default '#4dd0e1')
// }
function shareCard(opts) {
  return new Promise(function(resolve) {
    var c = document.createElement('canvas');
    c.width = 1200; c.height = 630;
    var x = c.getContext('2d');

    var bg = opts.bg || { from: '#0a0a14', mid: '#1a0a2a', to: '#0a0a14' };
    var accent = opts.accent || '#4dd0e1';

    // Background gradient
    var bgGrad = x.createLinearGradient(0, 0, 1200, 630);
    bgGrad.addColorStop(0, bg.from); bgGrad.addColorStop(0.5, bg.mid); bgGrad.addColorStop(1, bg.to);
    x.fillStyle = bgGrad; x.fillRect(0, 0, 1200, 630);

    // Faint grid
    x.strokeStyle = 'rgba(255,255,255,0.05)';
    x.lineWidth = 1;
    for (var gx = 0; gx <= 1200; gx += 60) { x.beginPath(); x.moveTo(gx, 0); x.lineTo(gx, 630); x.stroke(); }
    for (var gy = 0; gy <= 630; gy += 60) { x.beginPath(); x.moveTo(0, gy); x.lineTo(1200, gy); x.stroke(); }

    // Brand wordmark
    x.fillStyle = accent;
    x.font = 'bold 24px -apple-system, BlinkMacSystemFont, sans-serif';
    x.textBaseline = 'top'; x.textAlign = 'left';
    x.fillText("TIM'S GAME LAB", 60, 60);

    // Game title
    x.fillStyle = '#fff';
    x.font = 'bold 88px -apple-system, BlinkMacSystemFont, sans-serif';
    x.shadowColor = accent + 'a0'; x.shadowBlur = 30;
    x.fillText((opts.gameTitle || 'GAME').toUpperCase(), 60, 160);
    x.shadowColor = 'transparent'; x.shadowBlur = 0;

    // Primary stat with label above
    x.fillStyle = '#9ab';
    x.font = '24px sans-serif'; x.textBaseline = 'bottom';
    x.fillText(opts.primaryLabel || 'I scored', 60, 280);
    x.textBaseline = 'top';
    x.fillStyle = '#FFD700';
    x.font = 'bold 140px sans-serif';
    x.fillText(opts.primaryStat || '0', 60, 280);

    // Secondary stat (rank, etc.)
    if (opts.secondaryStat) {
      x.fillStyle = '#48c9b0';
      x.font = 'bold 36px sans-serif';
      x.fillText(opts.secondaryStat, 60, 440);
    }

    // Footer line (day seed, etc.)
    if (opts.footer) {
      x.fillStyle = '#5a5a72';
      x.font = '20px monospace';
      x.fillText(opts.footer, 60, opts.secondaryStat ? 490 : 460);
    }

    // CTA bottom-right
    x.fillStyle = accent;
    x.font = 'bold 28px sans-serif';
    x.textAlign = 'right'; x.textBaseline = 'bottom';
    var ctaUrl = opts.slug ? 'game-factory.tech/p/' + opts.slug : 'game-factory.tech';
    x.fillText('Beat me at ' + ctaUrl, 1140, 570);

    // Hairline
    x.strokeStyle = accent + '66'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(60, 590); x.lineTo(1140, 590); x.stroke();

    c.toBlob(function(blob) { resolve(blob); }, 'image/png', 0.92);
  });
}

// shareBlob — Web Share API with file (mobile) or download fallback (desktop).
// Also copies a text snippet to clipboard so the user can paste-attach.
function shareBlob(blob, opts) {
  if (!blob) return;
  opts = opts || {};
  var fileName = opts.fileName || 'share.png';
  var title = opts.title || "Tim's Game Lab";
  var text  = opts.text  || 'Play it: https://game-factory.tech';
  var file  = new File([blob], fileName, { type: 'image/png' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: title, text: text }).catch(function() {});
    return;
  }
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(function() {});
  }
}

// ── MAIN LOOP ────────────────────────────────────────────────────────────
var lastTs = 0, onUpdate = null, onDraw = null, isRunning = false;

function frame(ts) {
  var dt = Math.min((ts - lastTs) / 1000, 0.08);
  lastTs = ts;

  updateParticles(dt);
  updateFloats(dt);
  updateShake(dt);
  if (onUpdate) onUpdate(dt);

  var ofs = shakeOffset();
  ctx.save();
  ctx.translate(ofs.x, ofs.y);
  if (onDraw) onDraw(ctx, dt);
  drawParticles();
  drawFloats();
  ctx.restore();

  requestAnimationFrame(frame);
}

// ── INIT (the public entry point) ────────────────────────────────────────
var SAVE_KEY = 'gf';
function init(config) {
  config = config || {};
  if (config.designW) DESIGN_W = config.designW;
  if (config.designH) DESIGN_H = config.designH;
  if (config.strings) STRINGS = config.strings;
  if (config.saveKey) SAVE_KEY = config.saveKey;
  onUpdate = config.onUpdate || null;
  onDraw   = config.onDraw   || null;

  resize(); // re-resize with the new design dimensions

  function startLoop() {
    if (isRunning) return;
    isRunning = true;
    lastTs = performance.now();
    requestAnimationFrame(frame);
  }

  var booted = false;
  function boot() {
    if (booted) return; booted = true;
    loadSprites(config.sprites || []).then(function() {
      if (window.ysdk && window.ysdk.features && window.ysdk.features.LoadingAPI) {
        window.ysdk.features.LoadingAPI.ready();
      }
      if (typeof config.onReady === 'function') config.onReady();
      startLoop();
    });
  }

  // Platform detection: Yandex (YaGames) > CrazyGames > local/standalone.
  // build_platforms.sh swaps the SDK <script> tag per zip, so at runtime
  // exactly one of these globals (or none) is defined.
  if (typeof YaGames !== 'undefined') {
    platform = 'yandex';
    YaGames.init().then(function(ysdk) {
      window.ysdk = ysdk;
      try {
        var l = ysdk.environment && ysdk.environment.i18n && ysdk.environment.i18n.lang;
        if (l) lang = l.startsWith('ru') ? 'ru' : 'en';
      } catch(e) {}
      boot();
    }).catch(boot);
    setTimeout(boot, 3000);
  } else if (window.CrazyGames && window.CrazyGames.SDK) {
    platform = 'crazygames';
    window.CrazyGames.SDK.init().then(function() {
      try {
        var lp = window.CrazyGames.SDK.user && window.CrazyGames.SDK.user.systemInfo;
        if (lp && lp.countryCode && lp.countryCode.toLowerCase() === 'ru') lang = 'ru';
      } catch(e) {}
      boot();
    }).catch(boot);
    setTimeout(boot, 3000);
  } else {
    setTimeout(boot, 3000);
  }
}

// Platform-aware lifecycle. Games call GF.gameplayStart() when entering
// the PLAYING state and GF.gameplayStop() on game-over/menu-return.
// These no-op locally; on CG they're required for ad timing (Full Launch);
// on Yandex they're a no-op today but kept here so games using GF only
// need ONE set of calls. Safe to call repeatedly — the platform SDKs
// dedupe internally.
var platform = 'local';
function gameplayStart() {
  try {
    if (platform === 'crazygames' && window.CrazyGames && window.CrazyGames.SDK && window.CrazyGames.SDK.game) {
      window.CrazyGames.SDK.game.gameplayStart();
    }
  } catch (e) {}
}
function gameplayStop() {
  try {
    if (platform === 'crazygames' && window.CrazyGames && window.CrazyGames.SDK && window.CrazyGames.SDK.game) {
      window.CrazyGames.SDK.game.gameplayStop();
    }
  } catch (e) {}
}
// Request an ad. Resolves regardless of outcome — caller should treat
// resolve as "you may resume" and never block gameplay on this.
// type = 'midgame' | 'rewarded' (CG) — Yandex maps both to its single
// interstitial today.
function showAd(type) {
  type = type || 'midgame';
  return new Promise(function(ok) {
    try {
      if (platform === 'crazygames' && window.CrazyGames && window.CrazyGames.SDK && window.CrazyGames.SDK.ad) {
        window.CrazyGames.SDK.ad.requestAd(type, {
          adFinished: ok, adError: ok, adStarted: function() {}
        });
        setTimeout(ok, 30000);  // safety timeout
        return;
      }
      if (platform === 'yandex' && window.ysdk && window.ysdk.adv) {
        window.ysdk.adv.showFullscreenAdv({
          callbacks: { onClose: ok, onError: ok }
        });
        setTimeout(ok, 30000);
        return;
      }
    } catch (e) {}
    ok();  // local / unknown → resolve immediately
  });
}

// ── PUBLIC API ───────────────────────────────────────────────────────────
window.GF = {
  init: init,
  canvas: canvas,
  ctx: ctx,
  // Live properties (read whenever the game needs current values)
  get W()  { return W; },
  get H()  { return H; },
  get cx() { return cx; },
  get cy() { return cy; },
  get S()  { return S; },
  get lang() { return lang; },
  set lang(v) { lang = (v === 'ru' ? 'ru' : 'en'); },
  t: t,
  // Utils
  clamp: clamp, lerp: lerp, dist: dist, rr: rr,
  // Input
  keys: keys, touch: touch,
  // FX
  spawnParticles: spawnParticles,
  spawnFloat: spawnFloat,
  setShake: setShake,
  // Sprites
  drawSprite: drawSprite,
  sprites: sprites,
  // Overlay
  drawOverlay: drawOverlay,
  // Share card (Promise<Blob>)
  shareCard: shareCard,
  shareBlob: shareBlob,
  // Tells the gallery shell (parent of the iframe) that the round just ended,
  // so the "More games" rail can surface without interrupting active play.
  // Call from the game's onGameOver / onWin handler.
  // Also calls platform gameplayStop() (CG ad lifecycle) — safe no-op elsewhere.
  gameEnded: function () {
    gameplayStop();
    try { window.parent.postMessage({ type: 'gf:gameEnded' }, '*'); } catch (_) {}
  },
  // Tells the shell a new round / level just started. Call after the player
  // hits Next Level / Retry so the gallery's "More games" rail dismisses
  // itself instead of lingering over fresh play.
  // Also calls platform gameplayStart() (CG ad lifecycle) — safe no-op elsewhere.
  gameStarted: function () {
    gameplayStart();
    try { window.parent.postMessage({ type: 'gf:gameStarted' }, '*'); } catch (_) {}
  },
  // Platform-aware ad request. Promise resolves when the ad finishes
  // (or immediately on local). Games call this at natural breaks — never
  // during active gameplay (CG rejects games that do).
  showAd: showAd,
  get platform() { return platform; },
  // Register a state-getter for the post-build-tester gate.
  //   GF.exposeState(() => ({ gs, score, level, lives, ... }));
  // The gate calls window.__gfState() during playtest to verify the game
  // actually has progression and reaches terminal states.
  exposeState: function (getter) {
    if (typeof getter !== 'function') return;
    window.__gfState = function () {
      try { return getter(); } catch (e) { return { __error: String(e) }; }
    };
  },
  // Persist run state to localStorage (Yandex 1.9 — game progress must
  // survive page refresh). Usage:
  //   GF.persist('mygame_run_v1',
  //     () => ({ level, coins, ... }),         // getter — what to save
  //     (s) => { level = s.level; coins = s.coins; ... }  // applier — how to restore
  //   );
  // Then call GF.saveRun() after every state transition that changes
  // persisted fields (level++, coin spend, gs change, etc.).
  persist: persist,
  saveRun: saveRun,

  // ── Interactive tutorial system (added 2026-05-13 after subscriber
  // complaints that text-only tutorials weren't clear enough) ──────────
  //
  // Usage in a game:
  //   GF.tutorial.start([
  //     { text: 'Tap the pendulum to freeze it.',
  //       target: { x: 200, y: 300, r: 40 },
  //       advance: 'click_target' },
  //     { text: 'Now release to fire.', advance: 'click_any' },
  //     { text: 'Clear all targets to win.', advance: 'auto', after: 2500 },
  //   ], { storageKey: 'pendulum_sniper_tutorial_v1' });
  //
  // Game integration:
  //   - update(dt) — call GF.tutorial.update(dt) at the start.
  //     Gate the rest of update() on `if (GF.tutorial.active) return;`
  //     so the world freezes between steps.
  //   - render() — call GF.tutorial.draw(ctx) LAST so the overlay is on top.
  //   - onPress(x, y) — call GF.tutorial.handleClick(x, y) FIRST.
  //     If it returns true, return early (tutorial consumed the click).
  //   - Help (?) button — call GF.tutorial.reopen() to re-run from step 1.
  tutorial: (function () {
    var pulseT = 0;
    var state = {
      active: false,
      step: 0,
      steps: [],
      _autoTimer: 0,
      _storageKey: 'game_tutorial_done',
      _skipBtn: null,
    };
    function wrap(c, text, x, y, maxW, lineH) {
      var words = String(text).split(/\s+/);
      var lines = [], cur = '';
      for (var i = 0; i < words.length; i++) {
        var probe = cur ? cur + ' ' + words[i] : words[i];
        if (c.measureText(probe).width > maxW && cur) { lines.push(cur); cur = words[i]; }
        else { cur = probe; }
      }
      if (cur) lines.push(cur);
      var startY = y - ((lines.length - 1) * lineH) / 2;
      for (var j = 0; j < lines.length; j++) c.fillText(lines[j], x, startY + j * lineH);
    }
    state.start = function (steps, opts) {
      opts = opts || {};
      state._storageKey = opts.storageKey || (steps && steps[0] && steps[0]._key) || 'game_tutorial_done';
      if (!opts.force) {
        try { if (localStorage.getItem(state._storageKey)) { state.active = false; return false; } } catch (e) {}
      }
      state.active = true;
      state.step = 0;
      state.steps = steps || [];
      state._autoTimer = 0;
      // Click cooldown: ignore taps within 200 ms of starting so the
      // gesture that started the game (menu PLAY press, etc.) cannot
      // also be consumed as the advance for step 1.
      state._startTs = Date.now();
      return true;
    };
    state.next = function () {
      var prev = state.steps[state.step];
      if (prev && typeof prev.onAdvance === 'function') { try { prev.onAdvance(); } catch (e) {} }
      state.step++;
      state._autoTimer = 0;
      if (state.step >= state.steps.length) {
        state.active = false;
        try { localStorage.setItem(state._storageKey, '1'); } catch (e) {}
      }
    };
    state.reopen = function () {
      if (!state.steps.length) return;
      state.active = true;
      state.step = 0;
      state._autoTimer = 0;
    };
    state.update = function (dt) {
      if (!state.active) return;
      pulseT += dt;
      var step = state.steps[state.step];
      if (!step) return;
      if (step.advance === 'auto') {
        state._autoTimer += dt * 1000;
        if (state._autoTimer >= (step.after || 1800)) state.next();
      }
    };
    state.draw = function (c) {
      if (!state.active) return;
      var step = state.steps[state.step];
      if (!step) return;
      // Resolve target (may be a function returning {x,y,r} so games can
      // point at moving things like a swinging pendulum)
      var tg = typeof step.target === 'function' ? step.target() : step.target;
      // Dim scrim
      c.fillStyle = 'rgba(0, 0, 0, 0.55)';
      c.fillRect(0, 0, W, H);
      // Pulse highlight
      if (tg && typeof tg.x === 'number') {
        var pulse = 0.5 + 0.5 * Math.sin(pulseT * 3.5);
        var baseR = tg.r || 40;
        var r = baseR + pulse * 12 * S;
        c.save();
        c.shadowColor = '#ffeb3b';
        c.shadowBlur = 16;
        c.strokeStyle = '#ffeb3b';
        c.lineWidth = 3 + pulse * 1.5;
        c.globalAlpha = 0.85;
        c.beginPath();
        c.arc(tg.x, tg.y, r, 0, Math.PI * 2);
        c.stroke();
        c.restore();
        var tipY = tg.y - baseR - 14 * S;
        var baseY = tipY - 26 * S;
        c.fillStyle = '#ffeb3b';
        c.beginPath();
        c.moveTo(tg.x, tipY);
        c.lineTo(tg.x - 12 * S, baseY);
        c.lineTo(tg.x + 12 * S, baseY);
        c.closePath();
        c.fill();
      }
      // Bottom panel
      var panelH = clamp(118 * S, 96, 150);
      var panelY = H - panelH;
      c.fillStyle = 'rgba(12, 16, 26, 0.96)';
      c.fillRect(0, panelY, W, panelH);
      c.fillStyle = '#ffeb3b';
      c.fillRect(0, panelY, W, 3);
      var fsSmall = clamp(12 * S, 10, 15) | 0;
      c.fillStyle = '#9aa3b2';
      c.font = fsSmall + 'px Inter, system-ui, sans-serif';
      c.textAlign = 'left';
      c.fillText('TUTORIAL  ' + (state.step + 1) + ' / ' + state.steps.length, 16, panelY + 22);
      // Skip ✕
      c.fillStyle = '#9bb';
      c.textAlign = 'right';
      var skipLabel = (lang === 'ru' ? 'пропустить ✕' : 'skip ✕');
      c.fillText(skipLabel, W - 16, panelY + 22);
      state._skipBtn = { x: W - 110, y: panelY + 4, w: 110, h: 30 };
      // Instruction
      c.fillStyle = '#fff';
      c.textAlign = 'center';
      var fs = clamp(17 * S, 13, 22) | 0;
      c.font = 'bold ' + fs + 'px Inter, system-ui, sans-serif';
      wrap(c, step.text, W / 2, panelY + panelH / 2 + 4, W - 60, fs + 6);
      // Hint
      var hintTxt = '';
      if (step.advance === 'click_any') hintTxt = (lang === 'ru' ? '(нажмите в любом месте)' : '(tap anywhere to continue)');
      else if (step.advance === 'auto') hintTxt = (lang === 'ru' ? '(продолжение автоматически…)' : '(continuing automatically…)');
      if (hintTxt) {
        c.fillStyle = '#aac';
        c.font = fsSmall + 'px Inter, system-ui, sans-serif';
        c.fillText(hintTxt, W / 2, panelY + panelH - 12);
      }
    };
    state.handleClick = function (x, y) {
      if (!state.active) return false;
      // Cooldown after start (see start() comment) — swallow the click but
      // don't advance, so the bubbled startGame click can't skip step 1.
      if (state._startTs && Date.now() - state._startTs < 200) return true;
      var step = state.steps[state.step];
      if (!step) return false;
      var b = state._skipBtn;
      if (b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        state.active = false;
        try { localStorage.setItem(state._storageKey, '1'); } catch (e) {}
        return true;
      }
      if (step.advance === 'click_target') {
        var tg = typeof step.target === 'function' ? step.target() : step.target;
        if (tg && typeof tg.x === 'number') {
          var dx = x - tg.x, dy = y - tg.y;
          var hitR = (tg.r || 40) + 28 * S;
          if (dx * dx + dy * dy <= hitR * hitR) {
            state.next();
            return true;
          }
        }
        return true; // swallow misses too
      }
      if (step.advance === 'click_any') {
        state.next();
        return true;
      }
      return true; // 'auto' or unknown — swallow
    };
    return state;
  })(),
};

// Screenshot helpers — exposed at window for external tooling (take_screenshots.js)
window._setLang = function(l) { lang = (l === 'ru' ? 'ru' : 'en'); };
// _jumpLevel must be defined per-game (each game has its own level model).

})();
