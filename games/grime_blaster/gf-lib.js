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

// The VISIBLE viewport size. On mobile, window.innerWidth/innerHeight report the
// LAYOUT viewport, which does NOT shrink when the browser chrome (address bar)
// shows on fullscreen-exit — so sizing the canvas to it left the canvas taller
// than the visible area and the browser scaled it non-uniformly. visualViewport
// reports the true visible box, killing Yandex 1.6.1.3 (deform on fullscreen-exit)
// and 1.6.2.3 (stretch on resize) at the source.
function _vpW() { var vv = window.visualViewport; return Math.max(1, Math.round((vv && vv.width)  ? vv.width  : window.innerWidth)); }
function _vpH() { var vv = window.visualViewport; return Math.max(1, Math.round((vv && vv.height) ? vv.height : window.innerHeight)); }
function resize() {
  W = _vpW(); H = _vpH();
  canvas.width = W; canvas.height = H;
  // Pin the CSS box to the SAME size as the backing store. With backing aspect
  // == display aspect the browser can never stretch the canvas non-uniformly —
  // visual elements stay proportional through every resize / orientation change.
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  cx = W / 2; cy = H / 2;
  S = Math.min(W / DESIGN_W, H / DESIGN_H);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);
// visualViewport fires on the exact transitions window.resize misses on mobile
// (address-bar show/hide, fullscreen-exit) — listen to both so the canvas tracks
// the visible area immediately.
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', resize);
  window.visualViewport.addEventListener('scroll', resize);
}
// Belt-and-suspenders for transitions that settle late: re-fire with two delays.
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
  if (!(w > 0) || !(h > 0) || !isFinite(x) || !isFinite(y)) return;
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  if (!isFinite(r)) r = 0;
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

// ── SCROLL (reusable canvas scroll region) ─────────────────────────────────
// Any screen whose content can exceed the viewport (long lists: rosters,
// collections, shops) MUST scroll - a player can never be left unable to reach
// UI (Tim 2026-06-05, after Orb Champions shipped a desktop team-builder where
// the lower 8 of 12 champions were clipped off-screen with no way to scroll).
//
// Usage (canvas, per-frame):
//   // once per layout, create + keep the controller:
//   sc = GF.makeScroll('team_roster', { x, y, w, h });        // viewport rect
//   sc.setViewport({ x, y, w, h });                            // each layout (S changes on resize)
//   sc.setContentHeight(totalContentPx);                       // full un-clipped height
//   sc.begin(ctx);                                             // clip to viewport + translate by -offset
//     ... draw content in CONTENT space (y measured from contentTop=viewport.y) ...
//   sc.end(ctx);
//   sc.draw(ctx);                                              // scrollbar + top/bottom fades
//   // input:
//   onWheel(dy)  -> sc.handleWheel(dy)
//   onDown(x,y)  -> if (sc.contains(x,y)) sc.dragStart(y)
//   onMove(x,y)  -> sc.dragMove(y)
//   onUp()       -> sc.dragEnd()
//   // hit-testing a content item tapped at screen (x,y): item is at content
//   //   y in [it.y, it.y+it.h]; the tap hits it when
//   //   sc.screenToContentY(y) is within that range AND x within the item.
//   // (Equivalently compare against it.y - sc.offset in screen space.)
//
// The controller hard-CLAMPS offset to [0, contentH-viewportH] so the player
// can never overscroll. It also registers the region (id + rect + scrollMaxY)
// so the reachability gate (window.__gfReach) can prove every item is reachable.
var _scrollRegions = {};   // id -> controller (for the reachability gate)
function makeScroll(id, rect) {
  var c = {
    id: id,
    vp: { x: 0, y: 0, w: 0, h: 0 },   // viewport rect (screen px)
    contentH: 0,                       // total content height (px)
    offset: 0,                         // current scroll offset (px, >= 0)
    _drag: null,                       // { startY, startOffset, lastY, lastT, vel } while dragging
    _vel: 0,                           // flick velocity (px/frame) for momentum
    _grabbed: false,                   // true between dragStart and the first move past threshold
  };
  c.setViewport = function (r) {
    if (r) { c.vp.x = r.x; c.vp.y = r.y; c.vp.w = r.w; c.vp.h = r.h; }
    c.clamp();
    return c;
  };
  c.setContentHeight = function (h) { c.contentH = Math.max(0, h || 0); c.clamp(); return c; };
  c.maxOffset = function () { return Math.max(0, c.contentH - c.vp.h); };
  c.clamp = function () { c.offset = Math.max(0, Math.min(c.offset, c.maxOffset())); return c.offset; };
  c.scrollable = function () { return c.maxOffset() > 0.5; };
  c.contains = function (x, y) { return x >= c.vp.x && x <= c.vp.x + c.vp.w && y >= c.vp.y && y <= c.vp.y + c.vp.h; };
  // map between screen-space y and content-space y (content top == vp.y)
  c.screenToContentY = function (y) { return (y - c.vp.y) + c.offset; };
  c.contentToScreenY = function (cy) { return (cy - c.offset) + c.vp.y; };
  c.scrollBy = function (dy) { c.offset += dy; c.clamp(); };
  c.scrollTo = function (off) { c.offset = off; c.clamp(); };
  c.handleWheel = function (dy) { if (!c.scrollable()) return false; c.offset += dy; c.clamp(); return true; };
  c.dragStart = function (y) {
    if (!c.scrollable()) { c._drag = null; return false; }
    c._drag = { startY: y, startOffset: c.offset, lastY: y, lastT: (typeof performance !== 'undefined' ? performance.now() : Date.now()), vel: 0 };
    c._vel = 0; c._grabbed = true;
    return true;
  };
  c.dragMove = function (y) {
    if (!c._drag) return false;
    var d = c._drag;
    c.offset = d.startOffset - (y - d.startY);   // drag down -> content moves down -> offset decreases
    c.clamp();
    var now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    var dt = Math.max(1, now - d.lastT);
    d.vel = (d.lastY - y) / dt * 16;             // px per ~frame, sign matches offset delta
    d.lastY = y; d.lastT = now;
    return true;
  };
  c.dragEnd = function () {
    if (c._drag) { c._vel = c._drag.vel || 0; c._drag = null; }
    c._grabbed = false;
  };
  c.isDragging = function () { return !!c._drag; };
  // call once per frame (optional) for inertial flick after release
  c.update = function () {
    if (c._drag || Math.abs(c._vel) < 0.4) { c._vel = 0; return; }
    c.offset += c._vel; c.clamp();
    if (c.offset <= 0 || c.offset >= c.maxOffset()) c._vel = 0;
    c._vel *= 0.92;
  };
  // clip to viewport + translate so content drawn at content-y appears at the
  // right screen-y. Pair every begin() with end().
  c.begin = function (cc) {
    cc.save();
    cc.beginPath(); cc.rect(c.vp.x, c.vp.y, c.vp.w, c.vp.h); cc.clip();
    cc.translate(0, c.vp.y - c.offset);   // content-y origin = vp.y, shifted up by offset
  };
  c.end = function (cc) { cc.restore(); };
  // scrollbar track/thumb + top/bottom fades so the player KNOWS there is more.
  c.draw = function (cc) {
    if (!c.scrollable()) return;
    var sc = S, vp = c.vp;
    // top fade if scrolled down
    var fadeH = Math.min(24 * sc, vp.h * 0.18);
    if (c.offset > 1) {
      var gt = cc.createLinearGradient(0, vp.y, 0, vp.y + fadeH);
      gt.addColorStop(0, 'rgba(10,10,20,0.85)'); gt.addColorStop(1, 'rgba(10,10,20,0)');
      cc.fillStyle = gt; cc.fillRect(vp.x, vp.y, vp.w, fadeH);
      // up chevron hint
      _scrollChevron(cc, vp.x + vp.w / 2, vp.y + 9 * sc, sc, true);
    }
    // bottom fade if more below
    if (c.offset < c.maxOffset() - 1) {
      var gb = cc.createLinearGradient(0, vp.y + vp.h - fadeH, 0, vp.y + vp.h);
      gb.addColorStop(0, 'rgba(10,10,20,0)'); gb.addColorStop(1, 'rgba(10,10,20,0.85)');
      cc.fillStyle = gb; cc.fillRect(vp.x, vp.y + vp.h - fadeH, vp.w, fadeH);
      _scrollChevron(cc, vp.x + vp.w / 2, vp.y + vp.h - 9 * sc, sc, false);
    }
    // scrollbar (right edge of viewport)
    var trackX = vp.x + vp.w - 5 * sc, trackW = 3.5 * sc;
    var trackY = vp.y + 3 * sc, trackH = vp.h - 6 * sc;
    cc.fillStyle = 'rgba(255,255,255,0.08)';
    rr(cc, trackX, trackY, trackW, trackH, trackW / 2); cc.fill();
    var frac = vp.h / c.contentH;                       // visible fraction
    var thumbH = Math.max(24 * sc, trackH * frac);
    var prog = c.maxOffset() > 0 ? c.offset / c.maxOffset() : 0;
    var thumbY = trackY + (trackH - thumbH) * prog;
    cc.fillStyle = c._drag ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.32)';
    rr(cc, trackX, thumbY, trackW, thumbH, trackW / 2); cc.fill();
  };
  _scrollRegions[id] = c;
  // sync the rect passed at creation (so the first frame is correct before setViewport)
  if (rect) c.setViewport(rect);
  return c;
}
function _scrollChevron(cc, x, y, sc, up) {
  cc.save(); cc.strokeStyle = 'rgba(220,230,255,0.7)'; cc.lineWidth = 2 * sc; cc.lineCap = 'round'; cc.lineJoin = 'round';
  var w = 7 * sc, h = 4 * sc;
  cc.beginPath();
  if (up) { cc.moveTo(x - w, y + h); cc.lineTo(x, y - h); cc.lineTo(x + w, y + h); }
  else { cc.moveTo(x - w, y - h); cc.lineTo(x, y + h); cc.lineTo(x + w, y - h); }
  cc.stroke(); cc.restore();
}

// ── REACHABILITY GATE HOOKS (window.__gfReach / window.__gfTour) ───────────
// The reachability gate (Shared/skills/yandex-testing/tools/reachability_check.js)
// proves EVERY interactive item on EVERY screen can be brought fully into the
// visible viewport at some reachable scroll position. A game opts in by calling:
//
//   GF.exposeReach(function () {
//     return {
//       screen: <string>,            // current screen id (for the gate's report)
//       items: [ { id, x, y, w, h }, ... ],  // interactive hit-rects, CONTENT px
//       // optional: scrollId of the scroll region this screen scrolls (so the
//       // gate reads scrollMaxY automatically), OR pass scrollMaxY directly.
//       scrollId: 'team_roster',     // -> gate uses GF.scrollMax('team_roster')
//       // scrollMaxY: <number>,     // (alternative to scrollId)
//     };
//   });
//   GF.exposeTour([
//     { name: 'menu',       go: function(){ gs='MENU'; } },
//     { name: 'team',       go: function(){ gs='TEAM'; } },
//     ...
//   ]);
//
// Items whose y is INSIDE a scroll region must be reported in CONTENT space
// (y from the region's content top); items pinned outside the scroll region
// (headers, action buttons) are reported with pinned:true in plain screen space
// (scrollMaxY does not apply to them; the gate only checks they sit within
// [0, screenH]). The template wires both into NEW games automatically.
// ONE scroll region per screen: the payload carries a single scrollId + viewportH
// (the active region's on-screen height). A screen with TWO independent scroll
// regions is not expressible in one payload, so split it into two tour steps (one
// per region). Scroll is vertical-only: horizontal overflow is always a hard fail,
// never "scroll right to reveal".
// Coordinate contract (read by reachability_check.js):
//   - For a screen WITHOUT a scroll region: report every item in SCREEN px,
//     return viewportH = screen height, scrollMaxY = 0. Every item must satisfy
//     0 <= y && y+h <= viewportH.
//   - For a screen WITH a scroll region (pass scrollId): report the SCROLLABLE
//     items in the region's CONTENT space (y measured from the region's content
//     top, i.e. as drawn at scroll offset 0 minus the region's screen top), set
//     viewportH = the region's VIEWPORT height (its on-screen px height), and
//     scrollMaxY = the region's max offset (auto from scrollId). Mark any PINNED
//     item (header/action button drawn OUTSIDE the scroll region) with
//     pinned:true and report it in SCREEN px + screenH - the gate verifies a
//     pinned item is within [0, screenH] (it does not scroll). screenH defaults
//     to the screen height. A scrollable item passes iff some scrollY in
//     [0, scrollMaxY] makes [y, y+h] ⊆ [scrollY, scrollY+viewportH].
function exposeReach(getter) {
  if (typeof getter !== 'function') return;
  window.__gfReach = function () {
    try {
      var r = getter() || {};
      var maxY = 0;
      if (typeof r.scrollMaxY === 'number') maxY = r.scrollMaxY;
      else if (r.scrollId && _scrollRegions[r.scrollId]) maxY = _scrollRegions[r.scrollId].maxOffset();
      var vpH = (typeof r.viewportH === 'number') ? r.viewportH : H;
      return {
        screen: r.screen != null ? String(r.screen) : '?',
        viewportH: Math.round(vpH),
        viewportW: W,
        screenH: Math.round(typeof r.screenH === 'number' ? r.screenH : H),
        scrollId: r.scrollId || null,
        scrollMaxY: Math.round(maxY),
        items: (r.items || []).map(function (it) {
          var o = { id: String(it.id), x: Math.round(it.x), y: Math.round(it.y), w: Math.round(it.w), h: Math.round(it.h) };
          if (it.pinned) o.pinned = true;
          return o;
        }),
      };
    } catch (e) { return { screen: '__error', viewportH: H, viewportW: W, screenH: H, scrollMaxY: 0, items: [], error: String(e) }; }
  };
}
var _tourSteps = [];
function exposeTour(steps) {
  _tourSteps = Array.isArray(steps) ? steps : [];
  // __gfTour(i): navigate to tour step i (returns its name), or with no arg
  // returns the list of step names so the gate knows how many screens to visit.
  window.__gfTour = function (i) {
    if (i == null) return _tourSteps.map(function (s) { return s.name; });
    var s = _tourSteps[i];
    if (!s) return null;
    try { if (typeof s.go === 'function') s.go(); } catch (e) {}
    return s.name;
  };
}
function scrollMax(id) { return _scrollRegions[id] ? _scrollRegions[id].maxOffset() : 0; }

// ── SPRITES ──────────────────────────────────────────────────────────────
var sprites = {};
function loadSprites(names) {
  if (!names || !names.length) return Promise.resolve();
  return Promise.all(names.map(function(name) {
    return new Promise(function(resolve) {
      var img = new Image();
      var done = false;
      function finish(ok) { if (done) return; done = true; sprites[name] = ok ? img : null; resolve(); }
      // Per-image BOOT-TIMEOUT (6s): if a sprite never fires load/error (CDN stall,
      // blocked request, decode hang) the boot Promise.all would hang forever and the
      // game never starts. Resolve with a null sprite after 6s so onReady always runs
      // and the procedural fallbacks draw. (2026-06 hard requirement.)
      var to = setTimeout(function() { finish(false); }, 6000);
      img.onload  = function() { clearTimeout(to); finish(true); };
      img.onerror = function() { clearTimeout(to); finish(false); };
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
  var wide    = W / H > 1.15;   // desktop/wide: a noticeably bigger CTA so PLAY is unmissable
  var btnW    = clamp((wide?320:248)*S, 170, 400), btnH = clamp((wide?64:54)*S, 42, 82);
  var btnX    = cx - btnW/2, btnY = cy + 22*S;

  // title with glow
  ctx.shadowColor = 'rgba(46,204,113,0.4)'; ctx.shadowBlur = 30*S;
  ctx.font = 'bold '+titleFs+'px sans-serif';
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(opts.title || '', cx, cy - 50*S);
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;

  if (opts.sub)  { ctx.font = subFs+'px sans-serif'; ctx.fillStyle = '#9ab'; ctx.fillText(opts.sub,  cx, cy - 16*S); }
  if (opts.sub2) { ctx.font = subFs+'px sans-serif'; ctx.fillStyle = '#bcd'; ctx.fillText(opts.sub2, cx, cy + 2*S);  }

  if (opts.btnText && opts.btnFn) {
    // gentle breathing pulse + glow so the eye lands on PLAY without hunting.
    // Drawn size breathes; the pushed hit-rect stays the stable base size.
    var _t = (typeof performance!=='undefined'?performance.now():Date.now())/1000, _k = Math.sin(_t*2.2), _p = 1 + 0.05*_k;
    var _w = btnW*_p, _h = btnH*_p, _x = cx - _w/2, _y = btnY + btnH/2 - _h/2;
    var grad = ctx.createLinearGradient(_x, _y, _x, _y+_h);
    grad.addColorStop(0, '#2ee07a'); grad.addColorStop(1, '#23a657');
    ctx.save(); ctx.shadowColor = 'rgba(46,224,122,'+(0.4+0.28*_k).toFixed(3)+')'; ctx.shadowBlur = (22+10*_k)*S;
    rr(ctx, _x, _y, _w, _h, _h/2);
    ctx.fillStyle = grad; ctx.fill(); ctx.restore();
    ctx.font = 'bold '+clamp((wide?22:18)*S,14,30)+'px sans-serif'; ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    ctx.fillText('▶ '+opts.btnText, cx, btnY + btnH/2);
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
    // Platform-aware CTA: on CrazyGames NEVER print game-factory.tech (their
    // static scanner flags cross-promotion); use a domain-free call to action.
    if (platform === 'crazygames') {
      x.fillText('Beat my score!', 1140, 570);
    } else {
      var ctaUrl = opts.slug ? 'game-factory.tech/p/' + opts.slug : 'game-factory.tech';
      x.fillText('Beat me at ' + ctaUrl, 1140, 570);
    }

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
  // On CrazyGames omit the game-factory.tech URL (cross-promo scanner); the
  // caller's opts.text always wins, only the default is platform-aware.
  var text  = opts.text  || (platform === 'crazygames' ? 'Can you beat my score?' : 'Play it: https://game-factory.tech');
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

  // Re-sync the canvas to the live visible viewport BEFORE drawing, so no frame
  // is ever rendered at a stale size. This eliminates the transient stretched /
  // deformed frame a moderator catches mid-transition (Yandex 1.6.1.3 / 1.6.2.3).
  // Cheap integer compare; resize() only runs on an actual dimension change.
  if (W !== _vpW() || H !== _vpH()) resize();

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
      // CrazyGames pairs the loading lifecycle with the gameplay lifecycle —
      // calling loadingStop here tells CG the boot phase is done, which
      // anchors their Gameplay Conversion measurement.
      try {
        if (platform === 'crazygames' && window.CrazyGames && window.CrazyGames.SDK && window.CrazyGames.SDK.game && window.CrazyGames.SDK.game.loadingStop) {
          window.CrazyGames.SDK.game.loadingStop();
        }
      } catch (e) {}
      if (typeof config.onReady === 'function') config.onReady();
      startLoop();
    });
  }

  // Platform detection: GamePush (gp global from gamepush SDK) >
  // Yandex (YaGames) > CrazyGames > local/standalone.
  // build_platforms.sh swaps the SDK <script> tag per zip, so at runtime
  // exactly one of these init paths fires.
  //
  // GamePush priority: when the gamepush SDK is loaded, it owns ad / save /
  // leaderboard / achievement routing across all 9 supported platforms
  // (Yandex, CrazyGames, GameDistribution, GameMonetize,
  // Playgama, Telegram Mini Apps, VK Play, WG Playground). The native
  // YaGames / CrazyGames init paths below stay as fallbacks for legacy
  // games not yet migrated to GP.
  if (window.__gpReady && window.gp) {
    // SDK already finished init before gf-lib loaded (unlikely but cheap to handle)
    _onGpReady(window.gp);
  } else if (window.__gpKey) {
    // GP SDK is loading async; the index.html template installed a callback
    // window.onGPInit which sets window.gp and dispatches __gpReady=true.
    platform = 'gamepush';
    var _gpTimeout = setTimeout(boot, 4000);  // safety: ship locally if GP is slow
    window.addEventListener('gpReady', function () {
      clearTimeout(_gpTimeout);
      _onGpReady(window.gp);
    }, { once: true });
  } else if (typeof YaGames !== 'undefined') {
    platform = 'yandex';
    YaGames.init().then(function(ysdk) {
      window.ysdk = ysdk;
      // Yandex 1.3 - mute/resume audio on the platform's own pause lifecycle
      // (tab hidden, system dialog, etc.), independent of visibilitychange.
      try { ysdk.on('game_api_pause', pauseAudio); ysdk.on('game_api_resume', resumeAudio); } catch (e) {}
      try {
        var l = ysdk.environment && ysdk.environment.i18n && ysdk.environment.i18n.lang;
        if (l) lang = l.startsWith('ru') ? 'ru' : 'en';
      } catch(e) {}
      boot();
    }).catch(boot);
    setTimeout(boot, 3000);
  } else if (window.CrazyGames && window.CrazyGames.SDK) {
    platform = 'crazygames';
    // Fire loadingStart SYNCHRONOUSLY before init resolves — CG QA scanner
    // requires the literal call path before the .then() chain. See
    // Shared/skills/crazygames-publish/SKILL.md "SDK Integration Pattern".
    try { window.CrazyGames.SDK.game.loadingStart(); } catch(e) {}
    window.CrazyGames.SDK.init().then(function() {
      try {
        var lp = window.CrazyGames.SDK.user && window.CrazyGames.SDK.user.systemInfo;
        if (lp && lp.countryCode && lp.countryCode.toLowerCase() === 'ru') lang = 'ru';
      } catch(e) {}
      boot();
      try { window.CrazyGames.SDK.game.loadingStop(); } catch(e) {}
      // CrazyGames quality: honour the platform mute button (settings.muteAudio)
      // so the SDK's mute actually silences the game. Set BOTH mute flags to the
      // platform value (toggleMute only when it actually differs, plus music).
      try {
        if (window.CrazyGames.SDK.game.addSettingsChangeListener) {
          window.CrazyGames.SDK.game.addSettingsChangeListener(function (key, value) {
            if (key === 'muteAudio') {
              // Set both mute flags to the platform value WITHOUT persisting
              // gf_muted: the platform mute is the SDK's own state, not the
              // in-game mute button, so don't cross-contaminate localStorage.
              AUDIO_MUTED = !!value;
              try { setMusicMuted(!!value); } catch (e) {}
              try {
                if (_music) {
                  _music.muted = AUDIO_MUTED;
                  if (AUDIO_MUTED) { _music.pause(); }
                  else if (_musicSrc) { var _p = _music.play(); if (_p && _p.catch) _p.catch(function () {}); }
                }
              } catch (e) {}
            }
          });
        }
      } catch (e) {}
    }).catch(boot);
    setTimeout(boot, 3000);
  } else {
    // Standalone / Gallery: no platform SDK to await, so boot immediately.
    // (boot() is idempotent via the `booted` guard.) Waiting here just showed
    // a blank canvas for 3s before the first frame.
    boot();
  }

  function _onGpReady(gp) {
    try {
      // gp.player.ready is a promise that resolves once the player has
      // synced with the server. Wait for it so leaderboards/achievements
      // are safe to call from onReady.
      if (gp.player && gp.player.ready && typeof gp.player.ready.then === 'function') {
        gp.player.ready.then(function () { _gpExtractLang(gp); boot(); }).catch(boot);
      } else {
        _gpExtractLang(gp);
        boot();
      }
    } catch (e) { boot(); }
  }
  function _gpExtractLang(gp) {
    try {
      // GP exposes the runtime platform's locale via gp.language (e.g. 'ru', 'en').
      var l = gp.language || (gp.platform && gp.platform.language) || '';
      if (l) lang = String(l).toLowerCase().startsWith('ru') ? 'ru' : 'en';
    } catch (e) {}
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
// type = 'midgame' | 'rewarded' — Yandex maps both to its interstitial;
// GamePush has separate showFullscreen / showRewardedVideo paths.
// Returns a Promise that resolves to:
//   { shown: bool, rewarded: bool }
// Old callers that just `await GF.showAd()` still work — the resolved
// object is truthy and they ignore it.
function showAd(type) {
  type = type || 'midgame';
  return new Promise(function(rawOk) {
    // Yandex 4.7 - mute audio while the ad is open; resume on EVERY exit path
    // (success / error / 30s no-fill timeout) exactly once. pauseAudio and
    // resumeAudio are idempotent.
    var _resolved = false;
    var ok = function (res) { if (_resolved) return; _resolved = true; resumeAudio(); rawOk(res); };
    // Pause audio when the ad actually STARTS, not at request time — a no-fill /
    // adblock / 30s-watchdog path must never mute with no visible ad (CG: mute on
    // ad start; Yandex: pause on onOpen). GamePush's promise API has no reliable
    // "started" hook, so for GP we pause at request time (best available) — its
    // promise resolves only when the ad is actually done, so a no-fill there is
    // rare and the resume on every exit still fires.
    try {
      // GamePush — preferred when present. Routes to whichever ad network
      // the active platform supports. showRewardedVideo resolves to bool.
      if (platform === 'gamepush' && window.gp && window.gp.ads) {
        if (type === 'rewarded' && typeof window.gp.ads.showRewardedVideo === 'function') {
          pauseAudio();
          window.gp.ads.showRewardedVideo()
            .then(function (success) { ok({ shown: true, rewarded: !!success }); })
            .catch(function () { ok({ shown: false, rewarded: false }); });
          setTimeout(function () { ok({ shown: false, rewarded: false }); }, 30000);
          return;
        }
        // A rewarded request must NEVER fall through to a fullscreen ad (that
        // shows an unrewarded ad on a reward button). Only fullscreen for non-rewarded.
        if (type !== 'rewarded' && typeof window.gp.ads.showFullscreen === 'function') {
          pauseAudio();
          window.gp.ads.showFullscreen()
            .then(function () { ok({ shown: true, rewarded: false }); })
            .catch(function () { ok({ shown: false, rewarded: false }); });
          setTimeout(function () { ok({ shown: false, rewarded: false }); }, 30000);
          return;
        }
      }
      if (platform === 'crazygames' && window.CrazyGames && window.CrazyGames.SDK && window.CrazyGames.SDK.ad) {
        window.CrazyGames.SDK.ad.requestAd(type, {
          adStarted:  function () { pauseAudio(); },   // mute only once the ad is on screen
          adFinished: function () { ok({ shown: true, rewarded: type === 'rewarded' }); },
          adError:    function () { ok({ shown: false, rewarded: false }); },
        });
        setTimeout(function () { ok({ shown: false, rewarded: false }); }, 30000);
        return;
      }
      if (platform === 'yandex' && window.ysdk && window.ysdk.adv) {
        if (type === 'rewarded') {
          // A rewarded request must route to showRewardedVideo (the reward is
          // granted ONLY in onRewarded). NEVER fall through to showFullscreenAdv,
          // which can't pay out → a reward button would show an unrewarded ad. If
          // the rewarded API is missing, resolve cleanly so the UI recovers.
          if (typeof window.ysdk.adv.showRewardedVideo !== 'function') { ok({ shown: false, rewarded: false }); return; }
          var _granted = false;
          window.ysdk.adv.showRewardedVideo({
            callbacks: {
              onOpen:     function () { pauseAudio(); },
              onRewarded: function () { _granted = true; },
              // onClose's arg isn't reliably passed for rewarded; _granted is the
              // source of truth for whether it actually played + paid out.
              onClose:    function () { ok({ shown: _granted, rewarded: _granted }); },
              onError:    function () { ok({ shown: false, rewarded: false }); },
            },
          });
          setTimeout(function () { ok({ shown: false, rewarded: false }); }, 30000);
          return;
        }
        window.ysdk.adv.showFullscreenAdv({
          callbacks: {
            // Yandex passes wasShown=false when no ad actually displayed (e.g. an
            // over-frequent call) — honour it so the cap layer doesn't count a
            // phantom impression.
            onOpen:  function () { pauseAudio(); },
            onClose: function (wasShown) { ok({ shown: wasShown !== false, rewarded: false }); },
            onError: function () { ok({ shown: false, rewarded: false }); },
          },
        });
        setTimeout(function () { ok({ shown: false, rewarded: false }); }, 30000);
        return;
      }
    } catch (e) {}
    ok({ shown: false, rewarded: false });  // local / unknown → resolve immediately
  });
}
// Convenience: rewarded ad with callbacks. Audio pause/resume + the no-fill
// watchdog are handled inside showAd; onReward fires ONLY on a confirmed reward.
function rewardedAd(onReward, onSkip) {
  return showAd('rewarded').then(function (r) {
    if (r && r.rewarded) { if (onReward) onReward(); }
    else if (onSkip) onSkip();
    return r;
  });
}

// ── AD MONETIZATION (GF.ads) — frequency-capped, default-on monetization ────
// A thin POLICY layer on top of showAd(): showAd already routes per platform
// (Yandex showFullscreenAdv / CrazyGames requestAd / GamePush) using the gf-lib
// SDK adapter (the `platform` var set during init — NOT re-detected here),
// brackets audio with pauseAudio/resumeAudio (Yandex 1.3 + 4.7), and has a 30s
// no-fill watchdog that resolves cleanly. GF.ads adds:
//   - a session-aware frequency CAP for interstitials (the thing a game would
//     otherwise get wrong and either spam ads → Yandex 4.4 / CG reject, or never
//     monetize). Default: min 60s BETWEEN interstitials + a 45s startup grace so
//     the player never eats an ad in the opening seconds of a session.
//   - clean rewarded semantics (onReward only on a real reward; onClose always),
//     so a no-fill / adblock / missing-SDK degrades to "continue/bonus button did
//     nothing bad" instead of stranding the UI.
// Every promise RESOLVES (never rejects) so gameplay never blocks on ads. With no
// ad SDK present (gallery / local / standalone) both are safe no-ops.
//
// Yandex 4.4-safe by CONTRACT: the helper only rate-limits — the CALLER is
// responsible for only invoking interstitial() at a natural break (round-end /
// game-over / level-complete), NEVER from the per-frame loop or mid-action.
var _ads = {
  sessionStart: (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  lastInterstitial: 0,          // timestamp (same clock) of the last SHOWN interstitial
  minGapMs: 60000,              // min ms between interstitials (default ~60s)
  startupGraceMs: 45000,        // no interstitial within the first ~45s of a session
  inFlight: false,              // an ad (either kind) is currently open — never overlap
};
function _adsNow() { return (typeof performance !== 'undefined' ? performance.now() : Date.now()); }
// Is an ad SDK actually READY to serve right now? `platform` flips to
// yandex/crazygames/gamepush before the SDK's init() promise resolves, so
// checking `platform !== 'local'` alone can be true while the ad object is still
// missing — gate on the concrete ad API existing.
function _adsSdkReady() {
  try {
    if (platform === 'gamepush')   return !!(window.gp && window.gp.ads);
    if (platform === 'crazygames') return !!(window.CrazyGames && window.CrazyGames.SDK && window.CrazyGames.SDK.ad);
    if (platform === 'yandex')     return !!(window.ysdk && window.ysdk.adv);
  } catch (e) {}
  return false;
}
var adsApi = {
  // Tune the cap once (e.g. from a game's onReady) if 60s/45s doesn't fit the
  // loop length. Pass any subset: { minGapMs, startupGraceMs }.
  configure: function (opts) {
    opts = opts || {};
    if (typeof opts.minGapMs === 'number' && opts.minGapMs >= 0) _ads.minGapMs = opts.minGapMs;
    if (typeof opts.startupGraceMs === 'number' && opts.startupGraceMs >= 0) _ads.startupGraceMs = opts.startupGraceMs;
    return adsApi;
  },
  // True iff an interstitial WOULD show right now (cap satisfied, none in flight,
  // an ad SDK is present). Lets a game decide UI flow without firing an ad.
  canShowInterstitial: function () {
    if (_ads.inFlight) return false;
    if (!_adsSdkReady()) return false;
    var now = _adsNow();
    if (now - _ads.sessionStart < _ads.startupGraceMs) return false;
    if (_ads.lastInterstitial && now - _ads.lastInterstitial < _ads.minGapMs) return false;
    return true;
  },
  // Show a fullscreen/interstitial ad IF the frequency cap allows, else resolve
  // immediately without showing. Call ONLY at a natural break (round-end /
  // game-over) — the helper rate-limits, it does not police WHERE you call it.
  // opts: { force?: bool } — force:true bypasses the cap (use sparingly, e.g. a
  // big "you died" wall), but still respects inFlight + SDK presence + audio.
  // Resolves to { shown: bool } and NEVER rejects.
  interstitial: function (opts) {
    opts = opts || {};
    if (_ads.inFlight) return Promise.resolve({ shown: false });
    // force bypasses the CAP, but never the SDK-readiness / overlap guards — we
    // must not claim a shown ad (or churn audio) when no ad SDK can serve.
    if (!_adsSdkReady()) return Promise.resolve({ shown: false });
    if (!opts.force && !adsApi.canShowInterstitial()) return Promise.resolve({ shown: false });
    // Mark the timestamp at REQUEST time so a slow no-fill can't let a second
    // call slip through the gap window while the first is still open.
    _ads.inFlight = true;
    _ads.lastInterstitial = _adsNow();
    // showAd is built never to reject, but enforce it at the public boundary so
    // inFlight always clears and the caller's onClose always runs.
    return showAd('midgame').catch(function () { return { shown: false }; }).then(function (r) {
      _ads.inFlight = false;
      var shown = !!(r && r.shown);
      // If nothing actually showed (no-fill/adblock), don't burn the cap — let
      // the next natural break try again rather than enforcing a 60s dead zone
      // off a phantom impression.
      if (!shown) _ads.lastInterstitial = 0;
      if (typeof opts.onClose === 'function') { try { opts.onClose(shown); } catch (e) {} }
      return { shown: shown };
    });
  },
  // Opt-in rewarded video — call FROM A USER CLICK (continue / double / bonus).
  // onReward fires ONLY on a confirmed reward; onClose ALWAYS fires once at the
  // end (reward, skip, no-fill, adblock, or missing SDK) so the UI can recover.
  // Resolves to { shown, rewarded } and NEVER rejects.
  rewarded: function (opts) {
    opts = opts || {};
    var onReward = opts.onReward, onClose = opts.onClose;
    if (_ads.inFlight) {            // an ad is already open — don't overlap
      if (typeof onClose === 'function') { try { onClose(false); } catch (e) {} }
      return Promise.resolve({ shown: false, rewarded: false });
    }
    _ads.inFlight = true;
    return showAd('rewarded').catch(function () { return { shown: false, rewarded: false }; }).then(function (r) {
      _ads.inFlight = false;
      var shown = !!(r && r.shown), rewarded = !!(r && r.rewarded);
      // CG/Yandex reject CHAINED ads — a rewarded that actually played arms the
      // interstitial cooldown too, so a reward-then-game-over can't fire a midgame
      // ad back-to-back.
      if (shown) _ads.lastInterstitial = _adsNow();
      if (rewarded && typeof onReward === 'function') { try { onReward(); } catch (e) {} }
      if (typeof onClose === 'function') { try { onClose(rewarded); } catch (e) {} }
      return { shown: shown, rewarded: rewarded };
    });
  },
};

// ── GamePush wrappers ────────────────────────────────────────────────────
// Thin convenience layer so games can call GF.gp.leaderboard.publish(...)
// without checking whether GP is present. All methods no-op gracefully when
// gp isn't initialised, so games migrated to GP still run locally / on
// non-GP-wrapped platforms during the transition.
function _gp() { return (platform === 'gamepush' && window.gp) ? window.gp : null; }
var gpApi = {
  get ready() {
    var gp = _gp();
    return gp && gp.player && gp.player.ready ? gp.player.ready : Promise.resolve();
  },
  get isPresent() { return _gp() !== null; },
  // Player state via GP fields. `field` must match a numeric/string field
  // declared in the GP panel (Settings → Player → Fields). For free-form
  // run state, prefer GF.persist() (localStorage) which works everywhere.
  player: {
    get: function (field) {
      var gp = _gp(); if (!gp || !gp.player) return null;
      try { return gp.player.get(field); } catch (e) { return null; }
    },
    set: function (field, value) {
      var gp = _gp(); if (!gp || !gp.player) return;
      try { gp.player.set(field, value); } catch (e) {}
    },
    add: function (field, delta) {
      var gp = _gp(); if (!gp || !gp.player) return;
      try { gp.player.add(field, delta); } catch (e) {}
    },
    sync: function () {
      var gp = _gp(); if (!gp || !gp.player || typeof gp.player.sync !== 'function') return Promise.resolve();
      try { return gp.player.sync(); } catch (e) { return Promise.resolve(); }
    },
  },
  leaderboard: {
    // Publish a score to a Global Leaderboard. `field` is the player-field
    // tag used by GP's auto-generated leaderboard (commonly 'score').
    // Higher-is-better is the default; configure direction in the GP panel.
    publish: function (field, score) {
      var gp = _gp(); if (!gp || !gp.player) return;
      try { gp.player.set(field, score); gp.player.sync(); } catch (e) {}
    },
    // Fetch the top-N entries; resolves to an array (empty if unavailable).
    fetch: function (tag, limit) {
      var gp = _gp();
      if (!gp || !gp.leaderboard || typeof gp.leaderboard.fetch !== 'function') return Promise.resolve([]);
      try {
        return gp.leaderboard.fetch({ tag: tag, limit: limit || 10 })
          .then(function (r) { return (r && r.players) || []; })
          .catch(function () { return []; });
      } catch (e) { return Promise.resolve([]); }
    },
  },
  achievement: {
    unlock: function (idOrTag) {
      var gp = _gp();
      if (!gp || !gp.achievements || typeof gp.achievements.unlock !== 'function') return;
      try { gp.achievements.unlock(idOrTag); } catch (e) {}
    },
  },
  // Banner ads — call once on game-ready, GP handles the refresh.
  showSticky: function () {
    var gp = _gp(); if (!gp || !gp.ads || typeof gp.ads.showSticky !== 'function') return;
    try { gp.ads.showSticky(); } catch (e) {}
  },
  // Pre-game ad — call after assets load, BEFORE the player can interact.
  // Resolves regardless of outcome.
  showPreloader: function () {
    var gp = _gp();
    if (!gp || !gp.ads || typeof gp.ads.showPreloader !== 'function') return Promise.resolve();
    try { return gp.ads.showPreloader().catch(function () {}); } catch (e) { return Promise.resolve(); }
  },
};

// ── PROCEDURAL MUSIC BED ───────────────────────────────────────────────────
// Zero-asset looping background music, synthesised with WebAudio (no mp3, no
// network, no credits, no bundle weight). Started on the first user gesture
// (browser autoplay policy). Mute-aware via setMusicMuted. This is the FACTORY
// BASELINE so every shipped game has a theme — call GF.startMusic({preset}) in
// onReady. Presets pick scale/chords/tempo/timbre; pass one matching the vibe.
var _mus = { ctx: null, master: null, on: false, muted: false, timer: null, next: 0, step: 0, bar: 0, preset: null, root: 0, started: false };
// Each preset carries a TABLE of roots (same mode, different key). startMusic
// picks one via a stable per-game seed (see _musSeed) so two games on the same
// preset play in DIFFERENT keys instead of being pitch-identical. The first
// root in each table is the historical default for that preset.
var MUSIC_PRESETS = {
  // warm major lo-fi (root G) — cozy/management/puzzle
  cozy:   { bpm: 82,  roots: [196.00, 174.61, 220.00, 246.94], scale: [0,2,4,5,7,9,11], chords: [[0,2,4],[5,0,2],[3,5,0],[4,6,1]], wave: 'triangle', bassWave: 'sine',     drums: false, gain: 0.16, arpDiv: 2 },
  // driving minor synthwave (root A) — runner/arcade/action
  synth:  { bpm: 122, roots: [220.00, 196.00, 246.94, 261.63], scale: [0,2,3,5,7,8,10], chords: [[0,2,4],[5,0,2],[3,5,0],[6,1,3]], wave: 'sawtooth', bassWave: 'square',   drums: true,  gain: 0.12, arpDiv: 4 },
  // bright chiptune (root C) — fast casual/score
  arcade: { bpm: 132, roots: [261.63, 220.00, 246.94, 293.66], scale: [0,2,4,5,7,9,11], chords: [[0,2,4],[3,5,0],[4,6,1],[0,2,4]], wave: 'square',   bassWave: 'triangle', drums: true,  gain: 0.11, arpDiv: 4 },
  // slow ambient major (root F) — calm/zen
  calm:   { bpm: 68,  roots: [174.61, 164.81, 196.00, 220.00], scale: [0,2,4,5,7,9,11], chords: [[0,2,4],[4,6,1],[5,0,2],[3,5,0]], wave: 'sine',     bassWave: 'sine',     drums: false, gain: 0.15, arpDiv: 2 },
  // upbeat lo-fi for idle/tycoon (D major, bouncy bass groove, no drums)
  idle:   { bpm: 96,  roots: [220.00, 246.94, 261.63, 293.66], scale: [0,2,4,5,7,9,11], chords: [[0,2,4],[4,6,1],[5,0,2],[2,4,6]], wave: 'triangle', bassWave: 'triangle', drums: false, gain: 0.15, arpDiv: 3 },
  // tense pulse for horror/survival (E minor, driven, heavy bass)
  tense:  { bpm: 108, roots: [164.81, 174.61, 196.00, 220.00], scale: [0,2,3,5,7,8,10], chords: [[0,2,4],[3,5,0],[5,0,2],[4,6,1]], wave: 'sawtooth', bassWave: 'square',   drums: true,  gain: 0.10, arpDiv: 4 },
};
// Stable per-game seed. window.GF_GAME_KEY is NOT set by the factory today, so
// relying on it alone collapses every game to one shared key. Derive instead
// from values that are always present AND differ per game (title + path), with
// GF_GAME_KEY as an optional override if a game ever sets one.
function _musSeed() {
  var k = '';
  try { if (window.GF_GAME_KEY) k = String(window.GF_GAME_KEY); } catch (e) {}
  if (!k) { try { k = String(document.title || ''); } catch (e) {} }
  try { k += '|' + String(location.pathname || ''); } catch (e) {}
  if (!k) k = 'gf';
  // FNV-1a-ish 32-bit hash over the whole string (every char counts, so titles
  // sharing a first/last letter still diverge).
  var h = 2166136261;
  for (var i = 0; i < k.length; i++) { h ^= k.charCodeAt(i); h = (h * 16777619) >>> 0; }
  return h >>> 0;
}
function _musFreq(root, n) { return root * Math.pow(2, n / 12); }
function _musTone(freq, t, dur, wave, peak, o) {
  o = o || {}; var c = _mus.ctx; if (!c) return;
  var osc = c.createOscillator(), g = c.createGain();
  osc.type = wave; osc.frequency.setValueAtTime(freq, t);
  if (o.glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.glideTo), t + dur);
  var a = o.attack != null ? o.attack : 0.02, r = o.release != null ? o.release : 0.12;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  g.gain.setValueAtTime(Math.max(0.0002, peak), t + Math.max(a + 0.01, dur - r));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  if (o.filter) { var f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.filter; osc.connect(f); f.connect(g); }
  else osc.connect(g);
  g.connect(_mus.master);
  osc.start(t); osc.stop(t + dur + 0.05);
}
function _musNoise(t, dur, peak, freq) {
  var c = _mus.ctx; if (!c) return;
  var n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
  for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  var src = c.createBufferSource(); src.buffer = buf;
  var hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = freq || 6000;
  var g = c.createGain(); g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(hp); hp.connect(g); g.connect(_mus.master); src.start(t); src.stop(t + dur + 0.02);
}
function _musKick(t) { _musTone(130, t, 0.16, 'sine', 0.42, { glideTo: 48, attack: 0.004, release: 0.12 }); }
function _musSchedule() {
  var p = _mus.preset, c = _mus.ctx; if (!p || !c) return;
  var root = _mus.root || (p.roots ? p.roots[0] : p.root) || 220.00;
  var spb = 60 / p.bpm, stepDur = spb / 4;          // 16 sixteenth-steps per bar
  while (_mus.next < c.currentTime + 0.25) {
    var t = _mus.next, step = _mus.step % 16;
    var chord = p.chords[_mus.bar % p.chords.length], sc = p.scale, L = sc.length;
    var deg2semi = function (deg) { return sc[((deg % L) + L) % L] + 12 * Math.floor(deg / L); };
    if (step === 0) {                                // bar: pad chord + bass + kick
      for (var ci = 0; ci < chord.length; ci++) _musTone(_musFreq(root, deg2semi(chord[ci])), t, spb * 4 * 0.96, p.wave, 0.085, { attack: 0.10, release: 0.5, filter: 1500 });
      _musTone(_musFreq(root, deg2semi(chord[0]) - 12), t, spb * 2 * 0.92, p.bassWave, 0.17, { attack: 0.02, release: 0.16, filter: 480 });
      if (p.drums) _musKick(t);
    }
    if (step === 8) {                                // beat 3: bass + kick
      _musTone(_musFreq(root, deg2semi(chord[0]) - 12), t, spb * 2 * 0.9, p.bassWave, 0.15, { attack: 0.02, release: 0.16, filter: 480 });
      if (p.drums) _musKick(t);
    }
    var arpEvery = Math.max(1, Math.round(4 / p.arpDiv));
    if (step % arpEvery === 0) {                     // arpeggiated lead, up an octave
      // Change 4: walk the chord up then back down (contour) instead of always
      // rising, so the melody is less mechanical and more song-like.
      var idx = Math.floor(step / arpEvery);
      var contour = [0, 1, 2, 1, 0, 2, 1, 0];
      var deg = chord[contour[idx % contour.length] % chord.length] + ((idx % 8) >= 4 ? 7 : 0);
      _musTone(_musFreq(root, deg2semi(deg) + 12), t, stepDur * arpEvery * 0.85, p.wave, 0.05, { attack: 0.008, release: 0.06, filter: 2800 });
    }
    if (p.drums && step % 2 === 1) _musNoise(t, 0.035, 0.045, 7000);  // offbeat hats
    _mus.next += stepDur; _mus.step++;
    if (_mus.step % 16 === 0) _mus.bar++;
  }
}
function startMusic(opts) {
  opts = opts || {};
  var p = _mus.preset = MUSIC_PRESETS[opts.preset] || MUSIC_PRESETS.cozy;
  if (typeof opts.muted === 'boolean') _mus.muted = opts.muted;
  // Change 1+2: per-game key + chord-start offset from a stable seed, so two
  // games on the same preset sound in different keys / start on a different chord.
  var seed = _musSeed();
  var roots = p.roots || [p.root || 220.00];
  // Use distinct bit-slices of the 32-bit seed for the two selectors (low bits
  // alone correlate), and keep everything UNSIGNED so the index is never
  // negative (a negative index would read chords[undefined] and break the loop).
  _mus.root = roots[((seed >>> 5) & 0xffff) % roots.length];
  _mus.startBar = ((seed >>> 17) & 0xffff) % p.chords.length;
  // Test-only hook (guarded; games never set the flag): expose the resolved
  // key so a headless harness can prove two games differ.
  try { if (window.__GF_MUSIC_DEBUG) window.__gfMusicResolved = { preset: opts.preset || 'cozy', seed: seed, root: _mus.root, startBar: _mus.startBar }; } catch (e) {}
  if (_mus.started) return; _mus.started = true;
  var begin = function () {
    if (_mus.on) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      _mus.ctx = _mus.ctx || new AC();
      if (_mus.ctx.state === 'suspended') _mus.ctx.resume();
      _mus.master = _mus.ctx.createGain();
      _mus.master.gain.value = _mus.muted ? 0.0001 : _mus.preset.gain;
      _mus.master.connect(_mus.ctx.destination);
      _mus.next = _mus.ctx.currentTime + 0.12; _mus.step = 0; _mus.bar = _mus.startBar || 0; _mus.on = true;
      _mus.timer = setInterval(function () { try { if (_mus.on) _musSchedule(); } catch (e) {} }, 30);
    } catch (e) {}
  };
  // Hard-rule #8: suspend the music context on tab-hide.
  if (!_mus._visBound) {
    _mus._visBound = true;
    document.addEventListener('visibilitychange', function () {
      if (!_mus.ctx) return;
      try {
        if (document.hidden) _mus.ctx.suspend();
        else if (_mus.on && !_extPaused) { _mus.ctx.resume(); _mus.next = _mus.ctx.currentTime + 0.1; }
      } catch (e) {}
    });
  }
  var fire = function () { begin(); ['pointerdown', 'keydown', 'touchstart', 'mousedown'].forEach(function (ev) { document.removeEventListener(ev, fire, true); }); };
  ['pointerdown', 'keydown', 'touchstart', 'mousedown'].forEach(function (ev) { document.addEventListener(ev, fire, true); });
}
function setMusicMuted(m) {
  _mus.muted = !!m;
  if (_mus.master && _mus.ctx) { try { _mus.master.gain.setTargetAtTime(m ? 0.0001 : (_mus.preset ? _mus.preset.gain : 0.15), _mus.ctx.currentTime, 0.04); } catch (e) {} }
}


// ── PUBLIC API ───────────────────────────────────────────────────────────
// ── AUDIO: procedural SFX synth + bg-music loop + mute (reusable) ──────────
// Games MUST ship sound before publish (Tim 2026-06-04). SFX are synthesized via
// WebAudio (no asset files, tiny, reliable); music is an mp3 loop from the Suno
// tool (Shared/tools/game-audio/gen_music.py → <game>/audio/bg_loop.mp3). Both
// respect GF.muted (persisted) and start on the first user gesture (autoplay policy).
var _ac = null, _music = null, _musicSrc = null, _musicVol = 0.4;
var AUDIO_MUTED = false;
var _extPaused = false;   // audio suspended over an ad / platform pause (Yandex 4.7 + 1.3)
try { AUDIO_MUTED = (localStorage.getItem('gf_muted') === '1'); } catch (e) {}
function audioCtx() {
  if (!_ac) { try { _ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  if (_ac && _ac.state === 'suspended') { try { _ac.resume(); } catch (e) {} }
  return _ac;
}
function tone(freq, dur, type, gain, slideTo) {
  if (AUDIO_MUTED || _extPaused) return;
  var c = audioCtx(); if (!c) return;
  try {
    var g = c.createGain(), t0 = c.currentTime;
    g.gain.setValueAtTime(gain || 0.12, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    g.connect(c.destination);
    var o = c.createOscillator();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    o.connect(g); o.start(t0); o.stop(t0 + dur + 0.02);
  } catch (e) {}
}
function arp(notes, step, dur, type, gain) {
  for (var i = 0; i < notes.length; i++) (function (idx, f) {
    setTimeout(function () { tone(f, dur || 0.16, type || 'sine', gain || 0.13); }, idx * (step || 70));
  })(i, notes[i]);
}
// named stinger library — games call GF.sfx('merge') etc.
var SFX_LIB = {
  click:   function () { tone(660, 0.05, 'square', 0.05); },
  tap:     function () { tone(520, 0.06, 'triangle', 0.07); },
  merge:   function () { tone(440, 0.10, 'triangle', 0.12, 720); },
  spawn:   function () { tone(300, 0.08, 'sine', 0.08, 440); },
  pickup:  function () { tone(880, 0.06, 'sine', 0.09); },
  coin:    function () { tone(988, 0.07, 'square', 0.08, 1319); },
  hit:     function () { tone(170, 0.10, 'sawtooth', 0.10, 80); },
  hurt:    function () { tone(140, 0.16, 'sawtooth', 0.13, 60); },
  levelup: function () { arp([523, 659, 784, 1047], 80, 0.18, 'triangle', 0.14); },
  evolve:  function () { arp([523, 659, 880, 1175], 90, 0.20, 'sine', 0.15); },
  unlock:  function () { arp([659, 988, 1319], 70, 0.18, 'sine', 0.15); },
  reward:  function () { arp([784, 1047, 1319], 70, 0.16, 'triangle', 0.14); },
  win:     function () { arp([523, 659, 784, 1047, 1319], 90, 0.20, 'triangle', 0.15); },
  lose:    function () { tone(330, 0.45, 'sawtooth', 0.13, 90); },
  error:   function () { tone(200, 0.12, 'square', 0.07, 140); },
};
function sfx(name) { var f = SFX_LIB[name]; if (f) f(); }
function music(url, vol) {
  if (!url) return;
  try {
    if (!_music) { _music = new Audio(); _music.loop = true; _music.preload = 'auto'; }
    if (vol != null) _musicVol = vol;
    _musicSrc = url; _music.src = url; _music.volume = _musicVol; _music.muted = AUDIO_MUTED;
    if (!AUDIO_MUTED) { var p = _music.play(); if (p && p.catch) p.catch(function () {}); }
  } catch (e) {}
}
function toggleMute() {
  AUDIO_MUTED = !AUDIO_MUTED;
  try { localStorage.setItem('gf_muted', AUDIO_MUTED ? '1' : '0'); } catch (e) {}
  if (_music) {
    _music.muted = AUDIO_MUTED;
    if (AUDIO_MUTED) { try { _music.pause(); } catch (e) {} }
    else { var p = _music.play(); if (p && p.catch) p.catch(function () {}); }
  }
  return AUDIO_MUTED;
}
// ── External pause (Yandex 4.7 rewarded-ad mute + 1.3 game_api_pause / CG) ──
// Suspend ALL audio (procedural music ctx + sfx ctx + mp3 element) while an ad
// is open or the platform fires a pause event, then resume RESPECTING the mute
// button. Idempotent via _extPaused so overlapping triggers (ad + tab-hide)
// can't double-suspend/resume; tone() and the visibilitychange handler honour it.
function pauseAudio() {
  if (_extPaused) return;
  _extPaused = true;
  try { if (_mus.ctx && _mus.ctx.state === 'running') _mus.ctx.suspend(); } catch (e) {}
  try { if (_ac && _ac.state === 'running') _ac.suspend(); } catch (e) {}
  try { if (_music) _music.pause(); } catch (e) {}
}
function resumeAudio() {
  if (!_extPaused) return;
  _extPaused = false;
  try { if (_mus.ctx && _mus.on && _mus.ctx.state === 'suspended') { _mus.ctx.resume(); _mus.next = _mus.ctx.currentTime + 0.1; } } catch (e) {}
  try { if (_ac && _ac.state === 'suspended') _ac.resume(); } catch (e) {}
  try { if (_music && _musicSrc && !AUDIO_MUTED) { var p = _music.play(); if (p && p.catch) p.catch(function () {}); } } catch (e) {}
}
// vector speaker / muted-speaker icon (never emoji) — games place + wire the click
function drawMuteIcon(c, x, y, r, muted) {
  c.save(); c.translate(x, y); c.lineWidth = Math.max(1.5, r * 0.16);
  c.strokeStyle = muted ? '#8a8a9a' : '#dfe7ff'; c.fillStyle = c.strokeStyle;
  c.beginPath(); c.moveTo(-r * 0.7, -r * 0.28); c.lineTo(-r * 0.3, -r * 0.28); c.lineTo(0, -r * 0.6); c.lineTo(0, r * 0.6); c.lineTo(-r * 0.3, r * 0.28); c.lineTo(-r * 0.7, r * 0.28); c.closePath(); c.fill();
  if (muted) { c.beginPath(); c.moveTo(r * 0.22, -r * 0.35); c.lineTo(r * 0.72, r * 0.35); c.moveTo(r * 0.72, -r * 0.35); c.lineTo(r * 0.22, r * 0.35); c.stroke(); }
  else { c.beginPath(); c.arc(r * 0.12, 0, r * 0.42, -0.9, 0.9); c.stroke(); c.beginPath(); c.arc(r * 0.12, 0, r * 0.72, -0.8, 0.8); c.stroke(); }
  c.restore();
}
// resume audio + (re)start music on the first user gesture (autoplay policy)
(function () {
  var kick = function () {
    audioCtx();
    if (_music && _musicSrc && !AUDIO_MUTED && _music.paused) { var p = _music.play(); if (p && p.catch) p.catch(function () {}); }
  };
  window.addEventListener('pointerdown', kick, { passive: true });
  window.addEventListener('touchstart', kick, { passive: true });
  window.addEventListener('keydown', kick);
})();

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
  // Scroll regions (REQUIRED for any screen whose content can exceed the
  // viewport - long lists/grids). GF.makeScroll(id, {x,y,w,h}) -> controller
  // with .setViewport/.setContentHeight/.begin/.end/.draw/.handleWheel/.dragStart/
  // .dragMove/.dragEnd/.update/.offset/.clamp()/.screenToContentY/.contains.
  // See the SCROLL block above for the per-frame usage pattern.
  makeScroll: makeScroll,
  scrollMax: scrollMax,
  // Reachability gate hooks - GF.exposeReach(getter) + GF.exposeTour(steps).
  // Every NEW game wires these so reachability_check.js can prove all UI is
  // reachable. See the REACHABILITY GATE HOOKS block above.
  exposeReach: exposeReach,
  exposeTour: exposeTour,
  // Audio (REQUIRED before publish) — GF.sfx('merge'|'spawn'|'hit'|'levelup'|'unlock'|
  // 'reward'|'win'|'lose'|'coin'|'click'|...), GF.music('audio/bg_loop.mp3'),
  // GF.toggleMute(), GF.muted, GF.drawMuteIcon(ctx,x,y,r,muted). See Build Hygiene.
  sfx: sfx, tone: tone, arp: arp, music: music, toggleMute: toggleMute, drawMuteIcon: drawMuteIcon,
  // Procedural music bed (no-credit baseline; GF.music(mp3) is the Suno upgrade):
  startMusic: startMusic, setMusicMuted: setMusicMuted,
  // Suspend/resume ALL audio over an ad or platform pause (Yandex 4.7 + 1.3).
  // showAd() brackets these automatically; call directly only for custom flows.
  pauseAudio: pauseAudio, resumeAudio: resumeAudio,
  hasSfx: function (n) { return !!SFX_LIB[n]; },
  get muted() { return AUDIO_MUTED; },
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
  // Rewarded ad with callbacks: GF.rewardedAd(onReward[, onSkip]). onReward
  // fires only on a confirmed reward; audio + no-fill watchdog handled inside.
  rewardedAd: rewardedAd,
  // ── Default-on ad monetization (frequency-capped). EVERY new game should:
  //   onGameOver/roundEnd:  GF.ads.interstitial();          // capped, safe no-op
  //   continue/2x/bonus btn: GF.ads.rewarded({ onReward: grant, onClose: resume });
  // Interstitial respects a cap (min 60s apart + 45s startup grace) and only
  // shows at the natural break the CALLER picks (never mid-gameplay = Yandex 4.4).
  // Routes via the existing SDK adapter (Yandex/CrazyGames/GamePush); audio
  // pause/resume + no-fill are handled inside showAd; no SDK = clean no-op.
  // Also: GF.ads.canShowInterstitial() (peek without firing),
  // GF.ads.configure({ minGapMs, startupGraceMs }) (tune the cap).
  ads: adsApi,
  // CrazyGames "happy moment" — triggers their confetti animation on victory
  // / new high score. Use sparingly (CG rejects games that fire it on every
  // level clear). Safe no-op on other platforms.
  happytime: function () {
    try {
      if (platform === 'crazygames' && window.CrazyGames && window.CrazyGames.SDK && window.CrazyGames.SDK.game && window.CrazyGames.SDK.game.happytime) {
        window.CrazyGames.SDK.game.happytime();
      }
    } catch (e) {}
  },
  get platform() { return platform; },
  // GamePush wrappers — no-op when GP isn't loaded, so games can call these
  // unconditionally. See _gp / gpApi above for the full surface.
  gp: gpApi,
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
  // Register a BOT action contract for the autonomous progression probe (#276).
  //   GF.exposeBot(
  //     () => ['merge','spawn'],        // actions available RIGHT NOW (strings)
  //     (action) => { /* apply it */ }  // perform one action
  //   );
  // The probe enumerates actions, applies a heuristic one, fast-forwards the
  // logic via window.__gfStep(), and samples __gfState() to build a progression
  // curve (score / difficulty / time-to-wall) over a simulated 10-15 min run —
  // verifying BALANCE/pacing, which the boot + 60s vision gates can't see.
  exposeBot: function (getActions, doAction) {
    window.__gfBot = {
      actions: function () { try { var a = getActions(); return Array.isArray(a) ? a : []; } catch (e) { return []; } },
      act: function (a) { try { return doAction(a); } catch (e) {} },
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
    // ── Animated demo HAND (Tim 2026-06-04: tutorials must SHOW the gesture, not
    // a text panel). Vector pointing hand; FINGERTIP sits at (x,y), fist trails
    // below-right. `press` squashes it for the grab/tap; `down` flips it to point
    // down from above (for targets near the bottom edge). See feedback_tutorial_demo_hand_ux.
    function _tEase(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
    function _tRR(c, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
    function _tHand(c, x, y, press, down) {
      c.save();
      c.translate(x, y);
      var k = (press ? 0.88 : 1);
      c.scale(k * S, k * S);
      if (down) c.scale(1, -1);
      c.rotate(-0.26);
      c.lineJoin = 'round'; c.lineCap = 'round';
      c.shadowColor = 'rgba(0,0,0,0.32)'; c.shadowBlur = 7; c.shadowOffsetX = 2; c.shadowOffsetY = 4;
      c.fillStyle = '#ffd9b0'; c.strokeStyle = '#7a4e2c'; c.lineWidth = 2.4;
      _tRR(c, -15, 23, 30, 33, 13); c.fill(); c.stroke();
      c.beginPath(); c.ellipse(-15, 31, 7, 10, -0.5, 0, Math.PI * 2); c.fill(); c.stroke();
      _tRR(c, -6, 0, 12, 30, 6); c.fill(); c.stroke();
      c.shadowColor = 'transparent';
      c.strokeStyle = 'rgba(122,78,44,0.45)'; c.lineWidth = 1.3;
      c.beginPath(); c.moveTo(-9, 36); c.lineTo(13, 36); c.moveTo(-10, 44); c.lineTo(14, 44); c.moveTo(-9, 51); c.lineTo(12, 51); c.stroke();
      c.restore();
    }
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
      // Light scrim — the HAND is the focus, keep the board visible (Tim 2026-06-04:
      // "hand is enough", dropped the heavy bottom panel).
      c.fillStyle = 'rgba(0, 0, 0, 0.26)';
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
        // ── animated demo: a HAND performs the gesture (tap, or drag from→to) ──
        var to = step.target2 ? (typeof step.target2 === 'function' ? step.target2() : step.target2) : null;
        var ges = step.gesture || (to ? 'drag' : 'tap');
        if (ges === 'drag' && to && typeof to.x === 'number') {
          c.save(); c.shadowColor = '#7CFC9A'; c.shadowBlur = 14; c.strokeStyle = '#7CFC9A';
          c.lineWidth = 3 + pulse * 1.5; c.globalAlpha = 0.85;
          c.beginPath(); c.arc(to.x, to.y, (to.r || 40) + pulse * 10 * S, 0, Math.PI * 2); c.stroke(); c.restore();
          c.save(); c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 3 * S;
          c.setLineDash([7 * S, 7 * S]); c.lineDashOffset = -pulseT * 36;
          c.beginPath(); c.moveTo(tg.x, tg.y); c.lineTo(to.x, to.y); c.stroke(); c.restore();
          var cyc = 2.6, tt = (pulseT % cyc) / cyc, hx, hy, pr;
          if (tt < 0.16) { hx = tg.x; hy = tg.y; pr = true; }
          else if (tt < 0.62) { var kk = _tEase((tt - 0.16) / 0.46); hx = lerp(tg.x, to.x, kk); hy = lerp(tg.y, to.y, kk); pr = true; }
          else if (tt < 0.74) { hx = to.x; hy = to.y; pr = true; }
          else { hx = to.x; hy = to.y; pr = false; }
          _tHand(c, hx, hy, pr);
        } else {
          var ph = (pulseT % 1.3) / 1.3, pr2 = ph < 0.22;
          if (pr2) {
            c.save(); c.strokeStyle = '#ffeb3b'; c.lineWidth = 3 * S; c.globalAlpha = 0.55 * (1 - ph / 0.22);
            c.beginPath(); c.arc(tg.x, tg.y, (tg.r || 40) * (0.4 + (ph / 0.22) * 0.9), 0, Math.PI * 2); c.stroke(); c.restore();
          }
          var low = tg.y > H * 0.66;
          _tHand(c, tg.x, tg.y - (pr2 ? 0 : 9 * S), pr2, low);
        }
      }
      // ── slim caption + skip, anchored above the action (NOT a full-width bottom
      // panel — Tim 2026-06-04: "drop that bottom ui panel, hand is enough") ──
      var aTg = (tg && typeof tg.x === 'number') ? tg : { x: W / 2, y: H * 0.5, r: 40 };
      var aTo = step.target2 ? (typeof step.target2 === 'function' ? step.target2() : step.target2) : null;
      var capFs = clamp(14 * S, 12, 18) | 0;
      c.font = 'bold ' + capFs + 'px Inter, system-ui, sans-serif';
      var capTxt = String(step.text || '');
      var capW = c.measureText(capTxt).width;
      var maxW = Math.min(W * 0.88, 520 * S);
      while (capW > maxW && capFs > 11) { capFs--; c.font = 'bold ' + capFs + 'px Inter, system-ui, sans-serif'; capW = c.measureText(capTxt).width; }
      var skipTxt = (lang === 'ru' ? 'пропустить ✕' : 'skip ✕');
      c.font = (capFs - 1) + 'px Inter, system-ui, sans-serif';
      var skipW = c.measureText(skipTxt).width;
      var padX = 14 * S, gapX = 16 * S, pillH = clamp(32 * S, 27, 42);
      var pillW = capW + padX * 2 + gapX + skipW;
      var ax = aTg.x, ay = aTg.y, ar = aTg.r || 40;
      if (aTo && typeof aTo.x === 'number') { ax = (aTg.x + aTo.x) / 2; ay = Math.min(aTg.y, aTo.y); ar = Math.max(aTg.r || 40, aTo.r || 40); }
      var pillY = ay - ar - pillH - 16 * S;
      if (pillY < 52 * S) pillY = (aTo ? Math.max(aTg.y, aTo.y) : aTg.y) + ar + 16 * S;
      pillY = clamp(pillY, 52 * S, H - pillH - 12 * S);
      var pillX = clamp(ax - pillW / 2, 8 * S, W - pillW - 8 * S);
      c.save();
      c.shadowColor = 'rgba(0,0,0,0.4)'; c.shadowBlur = 9 * S; c.shadowOffsetY = 3 * S;
      c.fillStyle = 'rgba(16, 20, 30, 0.9)';
      rr(c, pillX, pillY, pillW, pillH, pillH / 2); c.fill();
      c.restore();
      c.textBaseline = 'middle';
      c.fillStyle = '#fff'; c.textAlign = 'left';
      c.font = 'bold ' + capFs + 'px Inter, system-ui, sans-serif';
      c.fillText(capTxt, pillX + padX, pillY + pillH / 2 + 1);
      c.fillStyle = '#9cc'; c.font = (capFs - 1) + 'px Inter, system-ui, sans-serif';
      c.fillText(skipTxt, pillX + padX + capW + gapX, pillY + pillH / 2 + 1);
      c.textBaseline = 'alphabetic';
      state._skipBtn = { x: pillX + padX + capW + gapX - 8 * S, y: pillY - 5 * S, w: skipW + 24 * S, h: pillH + 10 * S };
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
// Fast-forward hook for the progression probe (#276): advance the game's logic
// by `n` ticks of `dt` seconds with NO rendering or realtime wait, so a bot can
// drive a 10-15 min run in milliseconds. Calls the same onUpdate(dt) the RAF
// loop uses; no-op until a game registered onUpdate via GF.init. Guarded so a
// throwing onUpdate stops the stepping (returns how many ticks actually applied)
// instead of wedging. NOTE: only DT-DRIVEN logic fast-forwards; a game whose
// timers use setTimeout/Date.now won't advance (the probe flags that case).
window.__gfStep = function (n, dt) {
  n = n | 0; dt = (typeof dt === 'number' && dt > 0) ? dt : (1 / 60);
  var i = 0;
  for (; i < n; i++) { try { if (onUpdate) onUpdate(dt); } catch (e) { return i; } }
  return i;
};
// Deterministic PLAY/CTA locator for the QA gates (fixes the canvas-button
// false-negative: random taps scattered across the viewport miss a canvas-drawn
// PLAY capsule, and the IIFE hides its rect). Returns the PRIMARY overlay button
// (buttons[0] — PLAY on the menu, RETRY on game-over) in CSS px + its centre, so
// a gate can tap the REAL button. null when no overlay button shows (game in
// play, or it hand-draws its menu without drawOverlay → gate falls back to sweep).
window.__gfPlayRect = function () {
  try {
    if (!buttons || !buttons.length || !canvas) return null;
    var b = buttons[0], r = canvas.getBoundingClientRect();
    if (!r.width || !canvas.width) return null;
    var sx = r.width / canvas.width, sy = r.height / canvas.height;
    return { x: r.left + b.x * sx, y: r.top + b.y * sy, w: b.w * sx, h: b.h * sy,
             cx: r.left + (b.x + b.w / 2) * sx, cy: r.top + (b.y + b.h / 2) * sy };
  } catch (e) { return null; }
};
// _jumpLevel must be defined per-game (each game has its own level model).

})();
