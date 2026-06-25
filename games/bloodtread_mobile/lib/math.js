// Small pure math helpers used across systems/render/ui. No internal deps.
export var TWO_PI = Math.PI * 2;

export function clamp(v, a, b) {
  return v < a ? a : (v > b ? b : v);
}

export function clampInt(v, a, b) {
  if (!isFinite(v)) return a;
  return Math.max(a, Math.min(b, v | 0));
}

export function len2(x, y) {
  return x * x + y * y;
}

export function fmtTime(t) {
  var m = (t / 60) | 0;
  var s = (t - m * 60) | 0;
  return m + ':' + (s < 10 ? '0' : '') + s;
}
