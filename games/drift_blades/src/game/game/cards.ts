// Upgrade-card data table - the heart of Drift Blades' depth.
//
// The card VALUES now live in ../../../balance.json (externalized for the
// balance-sim, P2/Phase-1 of the Balance-Sim project). This module is the pure,
// rendering-free FACADE the rest of the game has always imported from: it
// re-exports the offer table the adapter (balance.ts) hydrates from the JSON,
// plus the unlock helpers, so no caller changed when the data moved.
//
// Effect fields per offer (all optional, default 0):
//   edge       flat attack added
//   guard      flat mitigation added (can be negative = a cost)
//   maxHp      flat max-HP added (can be negative = a cost)
//   heal       immediate HP restored
//   crit       crit chance added (0..1)
//   venom      poison stacks added (ticks each step)
//   frost      frost stacks added (reduces incoming dmg, enables Shatter)
//   greed      shard-gain bonus added (flat per step)
//   edgeTaxPct multiplicative Edge tax this offer imposes (Greed trade-off), 0..1
//   tags       archetype tags used for synergy / anti-synergy detection
//
// unlockShards: 0 = in the starting pool; >0 = unlocks once lifetime Shards reach it.

import { OFFERS, type Offer } from './balance';

export { type CardTag, type Offer, OFFERS, TOTAL_STEPS } from './balance';

// Shard thresholds (sorted) used by the hub's "next unlock" progress bar.
export const CARD_UNLOCKS = OFFERS.filter((o) => o.unlockShards > 0)
  .map((o) => ({ id: o.id, nameKey: o.nameKey, at: o.unlockShards }))
  .sort((a, b) => a.at - b.at);

export function offersUnlocked(lifetimeShards: number): Offer[] {
  return OFFERS.filter((o) => o.unlockShards <= lifetimeShards);
}

/** The next card that will unlock above the current lifetime Shards, or null. */
export function nextUnlock(lifetimeShards: number): { id: string; nameKey: string; at: number } | null {
  for (const u of CARD_UNLOCKS) {
    if (u.at > lifetimeShards) return u;
  }
  return null;
}
