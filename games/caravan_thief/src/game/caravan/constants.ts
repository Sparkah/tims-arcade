// Caravan Thief - tunables, types, palette. Named to match DESIGN.md so the
// post-build-tester can cross-check the exposed state vars.

export const TUNE = {
  CARAVAN_SPEED: 40, // px/s wagons drift down the road
  DASH_TIME: 0.16, // s the thief is exposed mid-dash
  LOOT_TIME: 0.85, // s hold to fill the loot ring (tier 1)
  ALERT_PER_LOOT: 11, // alertness added per wagon looted
  DETECT_RISE: 52, // detection/sec while inside a cone (base, exposed)
  DETECT_FALL: 16, // detection/sec while hidden (sticky - grazes accumulate)
  CONE_SWEEP_BASE: 0.62, // rad/s cone pan speed at alertness 0
  GUARD_CHARGE_SPEED: 200, // px/s the guard closes once you're spotted
  BAG_BASE: 6, // loot slots carried before Exfil is urged
  SPOT_GRACE: 1.6, // s from spotted -> caught if you never hide
  // derived / secondary
  COVER_RISE_MULT: 0.6, // detection rises at 0.6x while crouched in cover
  DASH_RISE_MULT: 1.6, // and faster while exposed mid-dash
  GIVEUP_DETECT: 50, // guard breaks off the charge below this detection
  EXFIL_COOL: 35, // alertness removed on Exfil (disciplined exfil play stays safe)
  ALERT_DRIFT: 0.4, // alertness/sec the caravan grows suspicious the longer you shadow it
  TIER_DURATION: 68, // s of PLAYING time per caravan tier
  DETECT_SPOTTED: 100,
} as const;

export const HITBOX = {
  THIEF_RADIUS: 16,
  WAGON_W: 64,
  WAGON_H: 52,
  COVER_RADIUS: 30,
  CONE_LENGTH: 210,
  CONE_HALF_ANGLE: 0.5, // rad, base; grows with alertness
} as const;

export const COLORS = {
  duskTop: 0x241436,
  duskBottom: 0x7a3f2c,
  sand: 0xd7a866,
  sandShadow: 0xb07f45,
  road: 0xcaa06a,
  roadEdge: 0x8a6437,
  thiefBody: 0x241d33,
  thiefScarf: 0x37d0c2,
  cover: 0xc59a5e,
  coverShadow: 0x9c7643,
  guard: 0x9c3b3b,
  guardTrim: 0xf0d27a,
  torch: 0xffb347,
  cone: 0xffe49a,
  wagonWood: 0xb9773a,
  coin: 0xf4c948,
  danger: 0xff5b57,
  safe: 0x54e0a6,
} as const;

export type WagonKind = 'loot' | 'strongbox' | 'relic';

export type TierDef = {
  key: string; // i18n key for the caravan name
  cargo: number; // cargo tint color
  lootBase: number; // base loot value per wagon at this tier
  guards: number; // guards patrolling
  dogs: number; // sniffing dogs
  night: boolean; // narrowed-visibility night heist
  strongboxChance: number; // 0..1 chance a spawned wagon is a strongbox
  relicChance: number; // 0..1 chance a spawned wagon carries a relic
};

// Tier ladder. Beyond the named list the caravan loops on the last entry with a
// rising loot multiplier (see lootMultiplier + tierDef).
export const TIERS: TierDef[] = [
  { key: 'tier_spice', cargo: 0xe08a3c, lootBase: 10, guards: 1, dogs: 0, night: false, strongboxChance: 0, relicChance: 0 },
  { key: 'tier_silk', cargo: 0xb761d6, lootBase: 16, guards: 2, dogs: 0, night: false, strongboxChance: 0.12, relicChance: 0.05 },
  { key: 'tier_gold', cargo: 0xf4c948, lootBase: 26, guards: 2, dogs: 1, night: false, strongboxChance: 0.2, relicChance: 0.07 },
  { key: 'tier_royal', cargo: 0xff7a9c, lootBase: 40, guards: 3, dogs: 1, night: true, strongboxChance: 0.26, relicChance: 0.1 },
];

export function tierDef(tier: number): TierDef {
  const idx = Math.min(tier - 1, TIERS.length - 1);
  return TIERS[Math.max(0, idx)];
}

// Loot value scales past the named tiers so the number keeps climbing endlessly.
export function lootMultiplier(tier: number): number {
  if (tier <= TIERS.length) return 1;
  return 1 + (tier - TIERS.length) * 0.35;
}

export const RELIC_COUNT = 6;

export type UpgradeId = 'boots' | 'bag' | 'smoke' | 'lockpick' | 'camel';

export type UpgradeDef = {
  id: UpgradeId;
  nameKey: string;
  descKey: string;
  maxLevel: number;
  cost: (level: number) => number; // cost to buy the NEXT level from `level`
};

export const UPGRADES: UpgradeDef[] = [
  { id: 'boots', nameKey: 'up_boots', descKey: 'up_boots_d', maxLevel: 3, cost: (l) => 60 + l * 90 },
  { id: 'bag', nameKey: 'up_bag', descKey: 'up_bag_d', maxLevel: 3, cost: (l) => 70 + l * 110 },
  { id: 'smoke', nameKey: 'up_smoke', descKey: 'up_smoke_d', maxLevel: 3, cost: (l) => 80 + l * 120 },
  { id: 'lockpick', nameKey: 'up_lockpick', descKey: 'up_lockpick_d', maxLevel: 1, cost: () => 150 },
  { id: 'camel', nameKey: 'up_camel', descKey: 'up_camel_d', maxLevel: 3, cost: (l) => 90 + l * 130 },
];

export type Upgrades = Record<UpgradeId, number>;

export const DEFAULT_UPGRADES: Upgrades = { boots: 0, bag: 0, smoke: 0, lockpick: 0, camel: 0 };
