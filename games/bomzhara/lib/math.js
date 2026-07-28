// Small math helpers.
export var TAU = Math.PI * 2;
export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function dist2(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
export function len(x, y) { return Math.sqrt(x * x + y * y); }
export function rand(a, b) { return a + Math.random() * (b - a); }
export function randInt(a, b) { return (a + Math.random() * (b - a + 1)) | 0; }
export function approach(v, target, d) { return v < target ? Math.min(v + d, target) : Math.max(v - d, target); }
