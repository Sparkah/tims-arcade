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
resize();

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

  if (typeof YaGames === 'undefined') {
    setTimeout(boot, 3000);
  } else {
    YaGames.init().then(function(ysdk) {
      window.ysdk = ysdk;
      try {
        var l = ysdk.environment && ysdk.environment.i18n && ysdk.environment.i18n.lang;
        if (l) lang = l.startsWith('ru') ? 'ru' : 'en';
      } catch(e) {}
      boot();
    }).catch(boot);
    setTimeout(boot, 3000);
  }
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
  gameEnded: function () {
    try { window.parent.postMessage({ type: 'gf:gameEnded' }, '*'); } catch (_) {}
  },
};

// Screenshot helpers — exposed at window for external tooling (take_screenshots.js)
window._setLang = function(l) { lang = (l === 'ru' ? 'ru' : 'en'); };
// _jumpLevel must be defined per-game (each game has its own level model).

})();
