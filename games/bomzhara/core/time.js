// Perf counters. context.js (reused) writes the sprite* fields in resetSpriteBatches; the rest
// are touched by the main loop. Kept as a single stable object (never reassigned).
export var perf = {
  fps: 60, frameMs: 16.7, updateMs: 0, renderMs: 0, frames: 0,
  spriteDraws: 0, spriteAnimated: 0, spriteStatic: 0, spriteCulled: 0,
  envSprites: 0, corpseSprites: 0, tankSprites: 0,
};
