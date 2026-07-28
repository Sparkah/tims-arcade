// Input: drag-anywhere joystick (touch/mouse) + WASD/arrows, plus a tap callback for menu buttons.
// Writes a normalized move vector to input.moveX/moveY (read by systems/player each step).
import { input, view } from './state.js?v=20260704a';
import { clamp, len } from './lib/math.js?v=20260704a';

var keysDown = Object.create(null);
var pressCb = null;
export function onPress(fn) { pressCb = fn; }

function keyVec() {
  var kx = 0, ky = 0;
  if (keysDown['ArrowLeft'] || keysDown['KeyA']) kx -= 1;
  if (keysDown['ArrowRight'] || keysDown['KeyD']) kx += 1;
  if (keysDown['ArrowUp'] || keysDown['KeyW']) ky -= 1;
  if (keysDown['ArrowDown'] || keysDown['KeyS']) ky += 1;
  return { kx: kx, ky: ky };
}

function recompute() {
  var jx = 0, jy = 0;
  if (input.joyActive) {
    var dx = input.joyDX, dy = input.joyDY, l = len(dx, dy);
    if (l > 6) { var n = Math.min(l, input.joyRadius) / input.joyRadius / l; jx = dx * n; jy = dy * n; }
  }
  var k = keyVec();
  var mx = jx + k.kx, my = jy + k.ky, l2 = len(mx, my);
  if (l2 > 1) { mx /= l2; my /= l2; }
  input.moveX = mx; input.moveY = my;
}

function resetHeldInput() {
  keysDown = Object.create(null);
  input.pointerDown = false; input.joyActive = false;
  input.joyDX = 0; input.joyDY = 0; input.pointerId = -1;
  recompute();
}

export function initInput() {
  window.addEventListener('keydown', function (e) {
    keysDown[e.code] = 1;
    if (e.code === 'Space' || e.code === 'Enter') { if (pressCb) pressCb(-1, -1, true); }
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space'].indexOf(e.code) >= 0) e.preventDefault();
    recompute();
  }, { passive: false });
  window.addEventListener('keyup', function (e) { keysDown[e.code] = 0; recompute(); });

  var canvas = document.getElementById('hudtouch') || window;
  function down(x, y, id) {
    input.pointerDown = true; input.pointerId = id; input.pointerX = x; input.pointerY = y;
    if (pressCb && pressCb(x, y, false)) return;     // a button ate the tap
    input.joyActive = true; input.joyBaseX = x; input.joyBaseY = y; input.joyDX = 0; input.joyDY = 0;
  }
  function move(x, y) {
    input.pointerX = x; input.pointerY = y;
    if (input.joyActive) { input.joyDX = x - input.joyBaseX; input.joyDY = y - input.joyBaseY; recompute(); }
  }
  function up() { input.pointerDown = false; input.joyActive = false; input.joyDX = 0; input.joyDY = 0; recompute(); }

  window.addEventListener('pointerdown', function (e) { down(e.clientX, e.clientY, e.pointerId); });
  window.addEventListener('pointermove', function (e) { if (input.pointerDown) move(e.clientX, e.clientY); });
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  window.addEventListener('blur', resetHeldInput);
  window.addEventListener('pagehide', resetHeldInput);
  document.addEventListener('visibilitychange', function () { if (document.hidden) resetHeldInput(); });
  window.addEventListener('contextmenu', function (e) { e.preventDefault(); });
}
