// Camera projection. Single-screen arena: the camera target `cam` is pinned at the viewport centre
// (set in main on resize), zoom = 1, so WORLD space == SCREEN space. context.js imports worldToScreenX/Y.
import { view, cam, state } from '../state.js?v=20260704a';
import { MAX_SHAKE_PX, SHAKE_ENABLED } from '../config.js?v=20260704a';
import { NO_SHAKE } from '../flags.js?v=20260704a';

export function updateCameraMetrics() {
  view.cameraZoom = 1;
  view.viewWorldW = view.cssW;
  view.viewWorldH = view.cssH;
}

export function addTrauma(amt) {
  if (!SHAKE_ENABLED || NO_SHAKE || amt <= 0) return;
  var s = view.shake + amt;
  view.shake = s > 1 ? 1 : s;
}

function shakeX() { var tr = view.shake; return tr > 0 ? tr * tr * MAX_SHAKE_PX * Math.sin(state.t * 49.3) : 0; }
function shakeY() { var tr = view.shake; return tr > 0 ? tr * tr * MAX_SHAKE_PX * Math.cos(state.t * 41.7) : 0; }

export function worldToScreenX(x) { return (x - cam.x + shakeX()) * view.cameraZoom + view.cssW * 0.5; }
export function worldToScreenY(y) { return (y - cam.y + shakeY()) * view.cameraZoom + view.cssH * 0.5; }
export function screenLen(v) { return v * view.cameraZoom; }
