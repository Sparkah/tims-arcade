// GORE CACHE / BLOOD MARKET data tables - rarities, drop pool, tank skins, GEAR slots/tiers, consumables, odds + pity.
// PURE CONSTANTS + small pure lookups (no state, no RNG - the engine in systems/loot.js rolls/grants).
//
// Monetisation layer: the STORE (below) defines a FREE daily box plus PAID boxes (Telegram Stars random-pull
// cases - box_single / box_legendary / box_bounty) and direct Stars purchases of specific mythic items. All paid
// grants stay gated behind tg.js PAYMENTS_ENABLED=false until server-verified receipts ship, so on the live build
// the paid rows are browse-only and grant NO client-authoritative entitlement. When enabled, every paid outcome
// must be delivered server-side AFTER receipt verification - never a client-trusted pull.
//
// GIT TRAP: this file lives under data/, which ~/Agents/.gitignore greedily ignores - commit with
// `git add -f data/loot.js` or it is silently skipped. (Same trap as data/enemies.js - see CODEMAP.md.)

// -- rarity grades (index 0..3) -------------------------------------------------------------------
// name = in-fiction grade shown on the card; col = [r,g,b] 0..1 for the card/flash; weight = base odds.
export var RARITY = [
  { id: 'scrap',  name: 'SCRAP',  col: [0.64, 0.66, 0.68], weight: 62 },   // common    - grey
  { id: 'vein',   name: 'VEIN',   col: [0.42, 0.82, 0.46], weight: 26 },   // rare      - husk-rot green
  { id: 'core',   name: 'CORE',   col: [0.42, 0.64, 1.00], weight: 9  },   // epic      - cold blue
  { id: 'relic',  name: 'RELIC',  col: [1.00, 0.40, 0.34], weight: 3  },   // legendary - blood red
  { id: 'mythic', name: 'MYTHIC', col: [1.00, 0.42, 0.92], weight: 0  }    // MYTHIC - DIRECT-BUY ONLY. weight 0 = never in a random or box roll; store-purchased outright (no paid RNG for the top tier)
];
export var R_SCRAP = 0, R_VEIN = 1, R_CORE = 2, R_RELIC = 3, R_MYTHIC = 4;

// PITY: opens since the last CORE-or-better. At PITY_HARD the next open is FORCED >= CORE, so a casual
// player never hits the long droughts gacha is infamous for. Shown in the vault UI (transparent odds).
export var PITY_HARD = 10;

// DUPE refund: rolling a SKIN/RELIC you already own refunds blood-shards by rarity (no wasted pull).
// Shards buy a specific unowned relic in the deterministic shard shop (dupe protection).
export var DUPE_SHARDS = [3, 8, 20, 50, 120];   // indexed by rarity (mythic=120; mythics are direct-buy so rarely dupe)

// In-run drop chance: a big/elite creature death awards a Gore Cache at this probability (systems/loot.js
// maybeDropEliteCache, called from systems/enemies.js killEnemy on the `big` gate). Tunable.
export var ELITE_CACHE_CHANCE = 0.11;

// How many equipped relics a player can run at once (the rest stay owned but inactive).
export var RELIC_SLOTS = 3;

export var DEFAULT_TINT = [1.0, 1.0, 1.0];

// -- TANK SKINS (cosmetic) -----------------------------------------------------------------------
// A hull colour wash multiplied onto the tank sprite at render (render/world.js queueOldTankSprite).
// Multiply can warm/brighten/shift hue (it cannot desaturate - same model as the enemy SPRITE_T_* tints),
// so tints >1 on a channel push the hull toward that colour. 'default' (STOCK IRON) is owned free.
export var SKINS = [
  { id: 'default', name: 'STOCK IRON',  rarity: R_SCRAP, tint: [1.00, 1.00, 1.00] },
  { id: 'rust',    name: 'RUSTBLOOD',   rarity: R_VEIN,  tint: [1.30, 0.74, 0.58] },
  { id: 'venom',   name: 'VENOMTRACK',  rarity: R_VEIN,  tint: [0.66, 1.32, 0.70] },
  { id: 'cobalt',  name: 'COBALT WAR',  rarity: R_CORE,  tint: [0.60, 0.80, 1.45] },
  { id: 'ember',   name: 'EMBERHIDE',   rarity: R_CORE,  tint: [1.50, 0.70, 0.34] },
  { id: 'bone',    name: 'BONE SOVEREIGN', rarity: R_RELIC, tint: [1.45, 1.40, 1.24] },
  { id: 'void',    name: 'VOIDMAW',     rarity: R_RELIC, tint: [0.52, 0.46, 0.86] },
  { id: 'm_skin',  name: 'GORELORD',    rarity: R_MYTHIC, tint: [1.55, 0.30, 0.30] }   // MYTHIC - store direct-buy only (never in a roll pool)
];

// -- RELICS (equippable permanent passives) ------------------------------------------------------
// Applied at run start (systems/loot.js applyEquippedRelics, called from player.js applyMetaToPlayer),
// layered ADDITIVELY on top of the meta tiers into the SAME player pools the forge + level-ups use.
// Effects are deliberately SMALL + capped (no pay-to-win, no balance debt): a full 3-relic loadout is a
// flavourful sidegrade, not a wall. `eff` keys map 1:1 to applyEquippedRelics.
// `icon` maps to a real game sprite (render/hud.js drawRelicIcon): heart=heart_core, gun0/1/3=weapon_turret
// rows, armor/tread/core=tank layers, fang_*=a creature - so each relic reads as a trophy cut from the war.
export var RELICS = [
  // VEIN (rare) - a single small stat
  { id: 'ironheart',  name: 'IRON HEART',  rarity: R_VEIN, desc: '+20 max hull',       icon: 'heart',      eff: { maxHp: 20 } },
  { id: 'oilveins',   name: 'OIL VEINS',   rarity: R_VEIN, desc: '+8% fire rate',      icon: 'gun1',       eff: { asBonus: 0.08 } },
  { id: 'sharptread', name: 'SHARP TREAD', rarity: R_VEIN, desc: '+12% crush',         icon: 'tread',      eff: { crushMul: 1.12 } },
  // CORE (epic) - bigger or dual stat
  { id: 'heavybore',  name: 'HEAVY BORE',  rarity: R_CORE, desc: '+15% damage',        icon: 'gun0',       eff: { dmgBonus: 0.15 } },
  { id: 'wildblood',  name: 'WILD BLOOD',  rarity: R_CORE, desc: '+10% speed, +30% reach', icon: 'core',   eff: { speedMul: 1.10, pickRMul: 1.30 } },
  { id: 'gluttony',   name: 'GLUTTONY',    rarity: R_CORE, desc: '+1 heal/kill, +0.6 regen', icon: 'armor', eff: { thirst: 1, regen: 0.6 } },
  // RELIC (legendary) - run-shaping but still capped
  { id: 'twinmaw',    name: 'TWIN MAW',    rarity: R_RELIC, desc: '+1 cannon barrel',  icon: 'gun3',       eff: { barrels: 1 } },
  { id: 'berserker',  name: 'BERSERKER',   rarity: R_RELIC, desc: '+18% dmg, +10% fire', icon: 'fang_brute', eff: { dmgBonus: 0.18, asBonus: 0.10 } },
  { id: 'leechlord',  name: 'LEECH LORD',  rarity: R_RELIC, desc: '+1 lash, +1 heal/kill', icon: 'fang_husk', eff: { lashLvl: 1, thirst: 1 } },
  // MYTHIC (store direct-buy ONLY - never in a roll pool). Still CAPPED so it's a flex, not a P2W wall.
  { id: 'm_relic',    name: 'BLOOD CROWN', rarity: R_MYTHIC, desc: '+25 hull, +12% damage', icon: 'heart', eff: { maxHp: 25, dmgBonus: 0.12 } }
];

// -- CONSUMABLES (one-shot, auto-applied at the NEXT run start) -----------------------------------
// Owned as a count; game/session.js startRun consumes one of each owned and applies it for that run only.
export var CONSUMABLES = [
  { id: 'overcharge', name: 'OVERCHARGE',  rarity: R_VEIN, desc: 'Next run starts +1 barrel' },
  { id: 'platelayer', name: 'PLATELAYER',  rarity: R_CORE, desc: 'Next run starts +35 hull' }
];

// -- the ROLL POOL per rarity --------------------------------------------------------------------
// Once a rarity is rolled, ONE entry is picked uniformly from POOL[rarity]. kind drives grant():
//   blood    - +amt to the bank (filler + dupe payout; never "owned", always grants)
//   skin     - cosmetic hull skin (dupe -> shards)
//   relic    - equippable passive (dupe -> shards)
//   consumable - one-shot next-run buff (stacks as a count)
//   voucher  - a free +1 tier on a random non-maxed forge track (real earnable progression)
export var POOL = [
  // R_SCRAP - soft currency only
  [ { kind: 'blood', amt: 150 }, { kind: 'blood', amt: 240 }, { kind: 'blood', amt: 360 } ],
  // R_VEIN
  [ { kind: 'skin', id: 'rust' }, { kind: 'skin', id: 'venom' },
    { kind: 'relic', id: 'ironheart' }, { kind: 'relic', id: 'oilveins' }, { kind: 'relic', id: 'sharptread' },
    { kind: 'consumable', id: 'overcharge' } ],
  // R_CORE
  [ { kind: 'skin', id: 'cobalt' }, { kind: 'skin', id: 'ember' },
    { kind: 'relic', id: 'heavybore' }, { kind: 'relic', id: 'wildblood' }, { kind: 'relic', id: 'gluttony' },
    { kind: 'consumable', id: 'platelayer' }, { kind: 'voucher' } ],
  // R_RELIC
  [ { kind: 'skin', id: 'bone' }, { kind: 'skin', id: 'void' },
    { kind: 'relic', id: 'twinmaw' }, { kind: 'relic', id: 'berserker' }, { kind: 'relic', id: 'leechlord' } ]
];

// Forge tracks a voucher can advance (cannon is excluded - its tier rides econ.weaponMeta, not META.cannon).
export var VOUCHER_TRACKS = ['armor', 'core', 'treads', 'thirst', 'frenzy'];

// derived id lookups
export var SKIN_BY_ID = Object.create(null);
for (var _si = 0; _si < SKINS.length; _si++) SKIN_BY_ID[SKINS[_si].id] = SKINS[_si];
export var RELIC_BY_ID = Object.create(null);
for (var _ri = 0; _ri < RELICS.length; _ri++) RELIC_BY_ID[RELICS[_ri].id] = RELICS[_ri];
export var CONSUMABLE_BY_ID = Object.create(null);
for (var _ci = 0; _ci < CONSUMABLES.length; _ci++) CONSUMABLE_BY_ID[CONSUMABLES[_ci].id] = CONSUMABLES[_ci];

// -- STORE (version A monetisation: what we SELL) -------------------------------------------------
// FREE daily box is ad-gated (one pull/day). Paid BOXES are server-verified Stars/TON with a GUARANTEED
// rarity FLOOR (disclosed odds + the hard pity above) - a graded supply crate, not a slot. MYTHICS are
// DIRECT-BUY (you buy the EXACT item, never a random pull - per this file's own no-paid-RNG note). `id`
// matches Gallery/functions/_lib/tgProducts.js (bloodtread) + tg.js grant(); `floor` = guaranteed min rarity.
// -- GEAR (merge-collection that REPLACES relics) ------------------------------------------------
// 5 slots, one per tank PART. Each slot is a MERGE ladder: GEAR_MERGE of a tier fuse into 1 of the next,
// from common up through mythic and two POST-mythic tiers (grind-only). You equip your single BEST piece per
// slot; its stat = slot.base * GEAR_TIERS[tier].mul. Commons drop from play + boxes; paid skips you to mythic,
// ascendant/primordial are earned. econ.gear[slotId] = Int array of counts indexed by tier.
export var GEAR_MERGE = 5;   // 5 of a tier -> 1 of the next tier
export var GEAR_SLOTS = [
  { id: 'hull',   name: 'HULL',   stat: 'maxHp',    base: 14,   unit: 'hull' },
  { id: 'cannon', name: 'CANNON', stat: 'dmgBonus', base: 0.05, unit: 'dmg'  },
  { id: 'treads', name: 'TREADS', stat: 'speedMul', base: 0.035, unit: 'spd' },
  { id: 'core',   name: 'CORE',   stat: 'regen',    base: 0.45, unit: 'regen' },
  { id: 'nerves', name: 'NERVES', stat: 'asBonus',  base: 0.05, unit: 'fire' }
];
export var GEAR_TIERS = [
  { id: 'common',     name: 'COMMON',     col: [0.64, 0.66, 0.68], mul: 1 },
  { id: 'uncommon',   name: 'UNCOMMON',   col: [0.42, 0.82, 0.46], mul: 2.4 },
  { id: 'rare',       name: 'RARE',       col: [0.42, 0.64, 1.00], mul: 5 },
  { id: 'legendary',  name: 'LEGENDARY',  col: [1.00, 0.62, 0.22], mul: 10 },
  { id: 'mythic',     name: 'MYTHIC',     col: [1.00, 0.42, 0.92], mul: 20 },   // paid can skip here; below is grind-only
  { id: 'ascendant',  name: 'ASCENDANT',  col: [0.36, 1.00, 0.92], mul: 40 },
  { id: 'primordial', name: 'PRIMORDIAL', col: [1.00, 0.30, 0.30], mul: 80 }
];
export var GEAR_MYTHIC_TIER = 4;   // tier paid pulls can grant directly; ascendant/primordial (5,6) are grind-only

// The Blood Market listing. GACHA rows (box_*/mythic_*) roll client-side after the server queues a pending pull;
// DETERMINISTIC rows (bundle/noads: starter/blood_cache/hull_kit/arsenal/ad_free/bloodgod) are applied to state
// SERVER-SIDE (tgGrants.js applyGrantToState) then the wrapper reloads. Both route through window.__tg.buy in
// input.js. Prices MUST match tgProducts.js (server) + the wrapper PRODUCTS. Order: daily, cheap bundles + remove
// ads, gacha boxes, mythics, the bloodgod pact last. bloodgod is TON-only (no stars) - input.js defaults it to TON.
export var STORE = [
  { id: 'daily_box',       kind: 'daily',  title: 'DAILY BLOOD BOX', sub: 'Watch an ad - one free pull a day',   floor: R_SCRAP },
  { id: 'starter',         kind: 'bundle', title: 'STARTER KIT',     sub: '+2000 blood + a tread tier',           stars: 25,   ton: '0.20' },
  { id: 'blood_cache',     kind: 'bundle', title: 'BLOOD CACHE',     sub: '+6000 blood to the bank',              stars: 49,   ton: '0.40' },
  { id: 'hull_kit',        kind: 'bundle', title: 'HULL KIT',        sub: '+2000 blood + 2 armor + 2 core',       stars: 75,   ton: '0.60' },
  { id: 'arsenal',         kind: 'bundle', title: 'ARSENAL',         sub: '+2500 blood + 2 cannon + a frenzy',    stars: 99,   ton: '0.80' },
  { id: 'ad_free',         kind: 'noads',  title: 'REMOVE ADS',      sub: 'Skip every revive ad - permanent',     stars: 150,  ton: '1.20' },
  { id: 'box_single',      kind: 'box',    title: 'BLOOD BOX',       sub: 'One pull, guaranteed VEIN or better',  stars: 49,   ton: '0.40',  floor: R_VEIN },
  { id: 'box_legendary',   kind: 'box',    title: 'RELIC BOX',       sub: 'One pull, guaranteed a RELIC',         stars: 199,  ton: '1.60',  floor: R_RELIC },
  { id: 'box_bounty',      kind: 'bounty', title: 'BOUNTY CRATE',    sub: 'A piece in EVERY slot + extras + a skin', stars: 499, ton: '4.00', once: true },
  { id: 'mythic_skin',     kind: 'mythic', title: 'GORELORD HULL',   sub: 'Mythic hull skin - bought outright',   stars: 999,  ton: '8.00',  mythic: 'm_skin' },
  { id: 'mythic_relic',    kind: 'mythic', title: 'BLOOD CROWN',     sub: 'Mythic signature relic',               stars: 1999, ton: '16.00', mythic: 'm_relic' },
  { id: 'mythic_ultimate', kind: 'mythic', title: 'APEX PREDATOR',   sub: 'A MYTHIC piece in every slot + skin + 250k blood', stars: 4999, ton: '40.00', mythic: 'm_all', once: true },
  { id: 'bloodgod',        kind: 'mythic', title: 'BLOOD GOD PACT',  sub: 'Remove ads + 250k blood + MAX every tier', ton: '20.00', once: true }
];
