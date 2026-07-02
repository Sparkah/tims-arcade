// Camera metrics + world->screen projection (NEW vs the sibling, which had no camera zoom).
// updateCameraMetrics() recomputes zoom + worldspace viewport from view.cssW/cssH and the device
// profile, and also derives the joystick-active flag + radius onto the input singleton. The projection
// helpers are pure reads of view.cameraZoom + player.x/y; called all over render + input + combat.
import { view, player, input, state } from '../state.js?v=bm9';
import { JOYSTICK_ALLOWED, TOUCH_DEVICE, ZOOM_OVERRIDE, qs } from '../flags.js?v=bm9';
import { LASER_RANGE_MULT, SHAKE_ENABLED, MAX_SHAKE_PX } from '../config.js?v=bm9';
import { clamp } from '../lib/math.js?v=bm9';

export function updateCameraMetrics() {
  var portrait = view.cssH >= view.cssW;
  // Zoom-in so creatures READ (Tim: "everything is tiny, can't see the green monsters"). The gap was DESKTOP:
  // it sat at 1, so on a big screen even the bumped sprites looked tiny - now 1.6. Mobile/touch -> 1.45.
  // Survivors still needs the incoming horde visible (don't over-zoom into a keyhole), so this is a balance;
  // dial it live with ?zoom=N (ZOOM_OVERRIDE) - e.g. ?zoom=2 for more, ?zoom=1.3 for less.
  view.cameraZoom = ZOOM_OVERRIDE || (TOUCH_DEVICE || view.cssW < 760 ? 1.45 : 1.6);
  view.viewWorldW = view.cssW / view.cameraZoom;
  view.viewWorldH = view.cssH / view.cameraZoom;
  input.useJoystick = JOYSTICK_ALLOWED && (TOUCH_DEVICE || view.cssW < 760 || qs.has('joystick') || qs.has('joy'));
  input.joyRadius = clamp(Math.min(view.cssW, view.cssH) * 0.105, 52, 76);
}

// COMBAT JUICE - trauma-based camera shake. Triggers call addTrauma() to ADD trauma (clamped to 1); the sim
// step (update.js) bleeds it off. The screen offset is trauma*trauma (squared so a small graze barely moves
// while a big moment punches) * MAX_SHAKE_PX, jittered by sin/cos of the run clock state.t at two DIFFERENT,
// incommensurate frequencies for x vs y (NOT Math.random - banned here, and it would jitter uglily/non-
// deterministically). The offset is in WORLD units and folded into worldToScreenX/Y below, so ONLY the world
// shakes - the HUD/joystick/buttons (render/hud.js, raw screen-space) never move. Alloc-free scalar math.
export function addTrauma(amt) {
  // DEATH-ONLY shake (Tim 2026-06-24): combat shake (taking hits, firing, killing) is gone - only the death
  // sequence shakes. Gate on player.dead: enterDeath (update.js) sets it true BEFORE runDeathSequence fires its
  // death-boom addTrauma calls, so the death wreck still shakes; every combat trigger (combat.js bolt/unleash/
  // flak/missile, enemies.js big-kill/contact, player.js) fires while ALIVE and is now a no-op.
  if (!SHAKE_ENABLED || amt <= 0 || !player.dead) return;
  var s = view.shake + amt;
  view.shake = s > 1 ? 1 : s;
}

// Per-axis world-space shake offset for the CURRENT frame (zero when no trauma -> no extra math in the hot
// render path). x and y use distinct frequencies so the camera traces a nervous path, not a clean diagonal.
function shakeOffsetX() {
  var tr = view.shake;
  return tr > 0 ? tr * tr * MAX_SHAKE_PX * Math.sin(state.t * 51.7) : 0;
}
function shakeOffsetY() {
  var tr = view.shake;
  return tr > 0 ? tr * tr * MAX_SHAKE_PX * Math.cos(state.t * 43.1) : 0;
}

export function worldToScreenX(x) {
  return (x - player.x + shakeOffsetX()) * view.cameraZoom + view.cssW * 0.5;
}

export function worldToScreenY(y) {
  return (y - player.y + shakeOffsetY()) * view.cameraZoom + view.cssH * 0.5;
}

export function screenLen(v) {
  return v * view.cameraZoom;
}

export function viewWorldMax() {
  return Math.max(view.viewWorldW, view.viewWorldH);
}

export function laserRangeWorld() {
  return player.r * LASER_RANGE_MULT;
}
