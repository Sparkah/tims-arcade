// balance.ts - the thin adapter that loads the externalized tuning data
// (../../../balance.json) and exposes it to the pure run engine. The game logic
// (RunEngine.ts) and the card table (cards.ts) read ONLY through here, so the
// balance-sim (tools/sim.mjs) can tune balance.json without ever touching logic.
//
// Vite inlines the JSON at build time (resolveJsonModule + the Vite JSON plugin),
// so this stays synchronous and Yandex/offline-safe (no fetch). The node sim
// bundles the same chain via esbuild, so sim and shipped game share one source.

import balanceData from '../../../balance.json';

export type CardTag = 'edge' | 'guard' | 'venom' | 'frost' | 'greed' | 'berserk';

export interface Offer {
  id: string;
  /** localization key for the short title (see i18n.ts cardName_<id>). */
  nameKey: string;
  /** localization key for the one-line effect blurb (cardDesc_<id>). */
  descKey: string;
  edge?: number;
  guard?: number;
  maxHp?: number;
  heal?: number;
  crit?: number;
  venom?: number;
  frost?: number;
  greed?: number;
  edgeTaxPct?: number;
  tags: CardTag[];
  /** lifetime-Shard threshold to unlock into the pool (0 = starting pool). */
  unlockShards: number;
  /** accent archetype - drives the card tint + which synergy line it builds. */
  archetype: CardTag;
}

interface RawOffer {
  id: string;
  archetype: CardTag;
  tags: CardTag[];
  unlockShards: number;
  edge?: number;
  guard?: number;
  maxHp?: number;
  heal?: number;
  crit?: number;
  venom?: number;
  frost?: number;
  greed?: number;
  edgeTaxPct?: number;
}

export interface BalanceData {
  version: number;
  run: { totalSteps: number };
  baseStats: {
    hp: number; maxHp: number; edge: number; guard: number; crit: number;
    venom: number; frost: number; greed: number; edgeTax: number;
  };
  gauntlet: { maxHp: number; clearBonusShards: number };
  threat: { start: number; perStep: number; accel: number; chip: number };
  combat: {
    critMult: number; critCap: number;
    frostReducePerStack: number; frostReduceMax: number;
    shatterFactor: number;
    shatterMinVenom?: number; shatterMinFrost?: number;
    greedTaxMax: number; greedInRunEdgePerStack?: number;
    berserkGuardPerCard: number;
    berserkLifestealPerCard?: number; berserkLifestealCap?: number; berserkLifestealThreatDecay?: number;
    shardsBasePerStep: number; shardsCritBonus: number;
  };
  offers: RawOffer[];
}

export const BAL: BalanceData = balanceData as unknown as BalanceData;

// Re-hydrate the raw offer rows into the engine's Offer shape. nameKey/descKey
// are derived from the id by the convention cards.ts has always used, so the
// i18n tables (cardName_<id>/cardDesc_<id>) keep matching with no churn.
export const OFFERS: Offer[] = BAL.offers.map((o) => {
  const offer: Offer = {
    id: o.id,
    nameKey: `cardName_${o.id}`,
    descKey: `cardDesc_${o.id}`,
    tags: o.tags,
    unlockShards: o.unlockShards,
    archetype: o.archetype,
  };
  if (o.edge !== undefined) offer.edge = o.edge;
  if (o.guard !== undefined) offer.guard = o.guard;
  if (o.maxHp !== undefined) offer.maxHp = o.maxHp;
  if (o.heal !== undefined) offer.heal = o.heal;
  if (o.crit !== undefined) offer.crit = o.crit;
  if (o.venom !== undefined) offer.venom = o.venom;
  if (o.frost !== undefined) offer.frost = o.frost;
  if (o.greed !== undefined) offer.greed = o.greed;
  if (o.edgeTaxPct !== undefined) offer.edgeTaxPct = o.edgeTaxPct;
  return offer;
});

export const TOTAL_STEPS: number = BAL.run.totalSteps;
