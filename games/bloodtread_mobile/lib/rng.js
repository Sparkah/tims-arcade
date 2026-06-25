// Deterministic LCG random - seeded fixed (0x5eed1234) so runs are reproducible.
// seed is module-local mutable state; rnd() advances it. The game never reseeds mid-session.
var seed = 0x5eed1234;

export function rnd() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}

export function setSeed(s) {
  seed = s >>> 0;
}
