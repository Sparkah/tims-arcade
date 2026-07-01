// Heal feedback: the green flush glow + the batched "+N" heal floats. gainHeal is the entry point (a real
// crush/thirst/ranged-heal flushes a float; a leech-drain just dims the glow). Pure fx leaf - it only touches
// player.healGlow + the floats pool; the heal AMOUNT to player.hp is applied by the caller (kill/upgrade).
// updateHealFloats ticks the glow decay + float rise/fade. (Ported from sibling _art build, adapted to the
// target's config-located MAX_FLOATS.)
import { player, floats, state } from '../state.js?v=bm10';
import { MAX_FLOATS } from '../config.js?v=bm10';

export function gainHeal(amount, dim) {
  if (amount <= 0) return;
  if (dim) {                                   // leech/lifesteal drain: a subtle green glow, no "+N" float spam (OLD: healGlow=max(.,0.25))
    player.healGlow = Math.max(player.healGlow, 0.25);
    return;
  }
  player.healGlow = 1;                          // a real crush/thirst heal: full green flush + a per-event "+N" float
  floats.healAccum += amount;
  if (amount > 0.5) flushHealFloat();           // OLD floats ANY gain > 0.5 immediately (don't gate behind a batch threshold)
}

export function flushHealFloat() {
  if (floats.healAccum <= 0.5) return;
  var i;
  if (floats.count < MAX_FLOATS) i = floats.count++;
  else i = (state.tick) % MAX_FLOATS;   // recycle oldest
  floats.amt[i] = Math.max(1, Math.round(floats.healAccum));
  floats.y[i] = 0;
  floats.life[i] = 1;
  floats.healAccum = 0;
}

export function updateHealFloats(dt) {
  if (player.healGlow > 0) player.healGlow = Math.max(0, player.healGlow - dt * 1.4);   // OLD decays ~1.4/s
  for (var i = floats.count - 1; i >= 0; i--) {
    floats.life[i] -= dt * 0.7;
    floats.y[i] += dt * 38;
    if (floats.life[i] <= 0) {
      var l = --floats.count;
      if (i !== l) { floats.amt[i] = floats.amt[l]; floats.y[i] = floats.y[l]; floats.life[i] = floats.life[l]; }
    }
  }
}
