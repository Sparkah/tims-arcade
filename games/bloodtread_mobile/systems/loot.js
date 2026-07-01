// GORE CACHE engine - the runtime for the gacha layer (data tables live in data/loot.js).
// Rolls (weighted rarity + hard pity), GRANTS into econ, converts dupes to shards, equips skins/relics,
// applies equipped relics to the live player, and the two v1 cache SOURCES (daily + elite in-run drop).
//
// ATOMICITY (anti reroll-by-reload): openCache() consumes the cache, advances pity, grants the item, and
// saveMeta()s ALL of it BEFORE returning the result the UI animates. A reload mid-reveal cannot re-roll.
//
// No module cycle: this imports saveMeta (persistence) + bumpTier (game/meta) + rnd + the data + econ/META,
// but NOT player.js. player.js imports applyEquippedRelics FROM here (one-directional). persistence.js reads
// the econ.* loot fields directly (it does not import this file), so save/load stays self-contained.
import { econ, META } from '../state.js?v=bm6';
import { rnd } from '../lib/rng.js?v=bm6';
import { saveMeta } from '../persistence.js?v=bm6';
import { bumpTier } from '../game/meta.js?v=bm6';
import { MAXTIER } from '../data/upgrades.js?v=bm6';
import {
  RARITY, R_SCRAP, R_VEIN, R_CORE, R_RELIC, R_MYTHIC, PITY_HARD, DUPE_SHARDS, ELITE_CACHE_CHANCE, RELIC_SLOTS,
  DEFAULT_TINT, SKINS, SKIN_BY_ID, RELIC_BY_ID, CONSUMABLE_BY_ID, POOL, VOUCHER_TRACKS,
  GEAR_SLOTS, GEAR_TIERS, GEAR_MERGE, GEAR_MYTHIC_TIER
} from '../data/loot.js?v=bm6';

// ---- GEAR (merge-collection - REPLACES relics) -------------------------------------------------
var GEAR_SLOT_BY_ID = Object.create(null);
for (var _gs = 0; _gs < GEAR_SLOTS.length; _gs++) GEAR_SLOT_BY_ID[GEAR_SLOTS[_gs].id] = GEAR_SLOTS[_gs];

// Highest tier index owned (count >= 1) in a slot, or -1 if empty. The equipped piece per slot = this tier.
export function bestGearTier(slotId) {
  var arr = econ.gear[slotId]; if (!arr) return -1;
  for (var t = arr.length - 1; t >= 0; t--) if (arr[t] > 0) return t;
  return -1;
}
// Drop n COMMON pieces into a slot (random slot if id omitted) - the merge-grind feeder (play + boxes).
export function dropGear(slotId, n) {
  n = n || 1;
  if (!slotId) slotId = GEAR_SLOTS[(rnd() * GEAR_SLOTS.length) | 0].id;
  if (!econ.gear[slotId]) return slotId;
  econ.gear[slotId][0] += n;
  return slotId;
}
// Merge a slot UP as far as possible: GEAR_MERGE of tier T fuse into 1 of T+1, cascading. Returns #fuses.
export function mergeUpSlot(slotId) {
  var arr = econ.gear[slotId]; if (!arr) return 0;
  var fuses = 0;
  for (var t = 0; t < arr.length - 1; t++) {
    while (arr[t] >= GEAR_MERGE) { arr[t] -= GEAR_MERGE; arr[t + 1] += 1; fuses++; }
  }
  if (fuses) saveMeta();
  return fuses;
}
export function mergeAllGear() {
  var f = 0;
  for (var i = 0; i < GEAR_SLOTS.length; i++) f += mergeUpSlot(GEAR_SLOTS[i].id);
  return f;
}
// Reveal card for a single gear drop (slot + tier).
export function gearDropCard(slotId, tier) {
  var slot = GEAR_SLOT_BY_ID[slotId]; var tr = GEAR_TIERS[tier] || GEAR_TIERS[0];
  return { rarity: Math.min(tier, R_MYTHIC), rname: tr.name, col: tr.col, kind: 'gear', dupe: false, shards: 0,
           title: tr.name + ' ' + (slot ? slot.name : 'GEAR'), sub: 'merge ' + GEAR_MERGE + ' to rank up', slot: slotId, tier: tier };
}
// PUBLIC (player.js): apply the equipped (BEST-tier) piece of every slot. One per slot; stat = base * tier.mul,
// added into the SAME pools meta + level-ups fill (so gear + meta + level-ups compose linearly).
export function applyEquippedGear(p) {
  for (var i = 0; i < GEAR_SLOTS.length; i++) {
    var slot = GEAR_SLOTS[i]; var bt = bestGearTier(slot.id);
    if (bt < 0) continue;
    var amt = slot.base * (GEAR_TIERS[bt] ? GEAR_TIERS[bt].mul : 1);
    if (slot.stat === 'maxHp') p.maxHp += amt;
    else if (slot.stat === 'dmgBonus') p.dmgBonus += amt;
    else if (slot.stat === 'asBonus') p.asBonus += amt;
    else if (slot.stat === 'speedMul') p.speed *= (1 + amt);
    else if (slot.stat === 'regen') p.regen += amt;
  }
}

// ---- rolling -----------------------------------------------------------------------------------

// Weighted rarity. If pity is maxed, FORCE >= CORE (rolled between CORE/RELIC by their own weights).
function rollRarity() {
  if (econ.pity >= PITY_HARD) {
    var wc = RARITY[R_CORE].weight + RARITY[R_RELIC].weight;
    return (rnd() * wc < RARITY[R_CORE].weight) ? R_CORE : R_RELIC;
  }
  var total = 0, i;
  for (i = 0; i < RARITY.length; i++) total += RARITY[i].weight;
  var r = rnd() * total;
  for (i = 0; i < RARITY.length; i++) { r -= RARITY[i].weight; if (r < 0) return i; }
  return R_SCRAP;
}

function pickVoucherTrack() {
  var avail = [];
  for (var i = 0; i < VOUCHER_TRACKS.length; i++) {
    var t = VOUCHER_TRACKS[i];
    if ((META[t] || 0) < MAXTIER) avail.push(t);
  }
  return avail.length ? avail[(rnd() * avail.length) | 0] : null;
}

// Apply ONE rolled outcome to econ and return a display descriptor for the reveal card.
function grant(rarity, entry) {
  var res = { rarity: rarity, rname: RARITY[rarity].name, col: RARITY[rarity].col, kind: entry.kind, dupe: false, shards: 0, title: '', sub: '' };

  if (entry.kind === 'blood') {
    econ.totalBank += entry.amt;
    res.title = '+' + entry.amt + ' BLOOD'; res.sub = 'banked';
    return res;
  }
  if (entry.kind === 'voucher') {
    var tr = pickVoucherTrack();
    if (!tr) {   // forge fully maxed on every voucher track -> pay out blood instead (never a dead pull)
      econ.totalBank += 300;
      res.kind = 'blood'; res.title = '+300 BLOOD'; res.sub = 'forge maxed';
      return res;
    }
    META[tr] = Math.min(MAXTIER, (META[tr] || 0) + 1);
    bumpTier(tr);   // keep the live econ.tank* mirror (menu preview + rage) in step with META
    res.title = 'FORGE VOUCHER'; res.sub = tr.toUpperCase() + ' +1 TIER';
    return res;
  }
  if (entry.kind === 'consumable') {
    var c = CONSUMABLE_BY_ID[entry.id];
    econ.consumables[entry.id] = (econ.consumables[entry.id] || 0) + 1;
    res.title = c ? c.name : 'CONSUMABLE'; res.sub = c ? c.desc : '';
    return res;
  }
  if (entry.kind === 'skin') {
    var sk = SKIN_BY_ID[entry.id];
    res.title = sk ? sk.name : 'SKIN';
    res.id = entry.id;                         // for the reveal's bespoke skin art (hudImages skin_<id>)
    res.tint = sk ? sk.tint : DEFAULT_TINT;   // fallback tinted tank preview
    if (econ.ownedSkins[entry.id]) {
      res.dupe = true; res.shards = DUPE_SHARDS[rarity]; econ.shards += res.shards;
      res.sub = 'DUPLICATE  +' + res.shards + ' SHARDS';
    } else {
      econ.ownedSkins[entry.id] = 1; res.sub = 'NEW HULL SKIN';
    }
    return res;
  }
  // relic
  var rl = RELIC_BY_ID[entry.id];
  res.title = rl ? rl.name : 'RELIC';
  res.id = entry.id;                // for the reveal's bespoke relic art (hudImages relic_<id>)
  res.icon = rl ? rl.icon : null;   // fallback real-sprite relic icon
  if (econ.ownedRelics[entry.id]) {
    res.dupe = true; res.shards = DUPE_SHARDS[rarity]; econ.shards += res.shards;
    res.sub = 'DUPLICATE  +' + res.shards + ' SHARDS';
  } else {
    econ.ownedRelics[entry.id] = 1; res.sub = rl ? rl.desc : 'NEW RELIC';
  }
  return res;
}

// PUBLIC: open one cache. Returns the reveal descriptor, or null if none owned. ATOMIC (see header).
export function openCache() {
  if (econ.caches <= 0) return null;
  econ.caches -= 1;
  var slotId = dropGear();   // a free cache drops ONE common gear piece into a random slot
  saveMeta();                // persist cache-consumed + drop BEFORE the UI reveals (no reroll-by-reload)
  return gearDropCard(slotId, 0);
}

// PAID BOX (store): roll with a GUARANTEED rarity FLOOR (disclosed) + pity, grant, persist, return the reveal.
// Does NOT consume econ.caches - it is a server-verified purchase (tg.js grant() in prod, or the local
// ?storetest path). Mythics never appear here (weight 0 + floor capped at R_RELIC), so the top tier stays
// direct-buy-only.
// Box tier: starts at the floor, then a JACKPOT climb - ~18% to bump a tier each step, up to ASCENDANT (5).
// So a low box usually gives its floor, but rarely lands a much higher piece (incl a rare ascendant). Primordial
// (6) is NEVER from a box - it stays grind-only.
function rollBoxTier(floor) {
  var t = floor || 0;
  while (t < GEAR_MYTHIC_TIER + 1 && rnd() < 0.18) t++;
  return t;
}
// Pick a SKIN to drop (prefer an unowned non-default; else any non-default).
function pickBoxSkin() {
  var unowned = [], all = [];
  for (var i = 0; i < SKINS.length; i++) {
    if (SKINS[i].id === 'default') continue;
    all.push(SKINS[i].id);
    if (!econ.ownedSkins[SKINS[i].id]) unowned.push(SKINS[i].id);
  }
  var src = unowned.length ? unowned : all;
  return src.length ? src[(rnd() * src.length) | 0] : null;
}
// Reveal card for a won SKIN (kind 'gear' so it rides the gacha roll; the payoff shows the tank in that livery).
function skinDropCard(skinId, dupe) {
  var sk = SKIN_BY_ID[skinId];
  return { kind: 'gear', skinId: skinId, rarity: sk ? sk.rarity : R_VEIN, rname: sk ? RARITY[sk.rarity].name : 'SKIN',
           col: sk ? RARITY[sk.rarity].col : [1, 1, 1], tint: sk ? sk.tint : DEFAULT_TINT,
           title: sk ? sk.name : 'HULL SKIN', sub: dupe ? 'DUPLICATE  +12 SHARDS' : 'NEW HULL SKIN', dupe: !!dupe };
}

// PAID BOX: ~8% a SKIN, else a GEAR piece at a jackpot-rolled tier. Returns a roll card (gear OR skin).
export function openPaidBox(floor) {
  if (rnd() < 0.08) {
    var sk = pickBoxSkin();
    if (sk) {
      var dupe = !!econ.ownedSkins[sk]; econ.ownedSkins[sk] = 1;
      if (dupe) econ.shards += 12;
      saveMeta();
      var scard = skinDropCard(sk, dupe); scard.paid = true; return scard;
    }
  }
  var tier = rollBoxTier(floor || 0);
  var slotId = GEAR_SLOTS[(rnd() * GEAR_SLOTS.length) | 0].id;
  econ.gear[slotId][tier] += 1;
  saveMeta();
  var card = gearDropCard(slotId, tier); card.paid = true;
  return card;
}

// BOUNTY BOX: a big haul - a piece in every slot (rare+ jackpots) + 3 extras + a skin. Returns a summary card.
export function openBountyBox() {
  var haul = [];
  for (var i = 0; i < GEAR_SLOTS.length; i++) {
    var t = rollBoxTier(2);
    econ.gear[GEAR_SLOTS[i].id][t] += 1;
    haul.push({ slot: GEAR_SLOTS[i].id, tier: t });
  }
  for (var x = 0; x < 3; x++) {
    var s = GEAR_SLOTS[(rnd() * GEAR_SLOTS.length) | 0].id, et = rollBoxTier(1);
    econ.gear[s][et] += 1; haul.push({ slot: s, tier: et });
  }
  var bsk = pickBoxSkin();
  if (bsk) { var bd = !!econ.ownedSkins[bsk]; econ.ownedSkins[bsk] = 1; if (bd) econ.shards += 12; }
  saveMeta();
  return { kind: 'bounty', haul: haul, skin: bsk, paid: true, title: 'BOUNTY HAUL', col: GEAR_TIERS[3].col };
}

// MYTHIC direct-buy: grant the EXACT mythic (no roll). 'm_all' = the APEX bundle (skin + crown + every relic
// + 250k blood). Returns the reveal descriptor. (Mythics live in SKINS/RELICS but are excluded from POOL.)
export function grantMythic(mid) {
  // m_skin = the cosmetic hull skin (skins kept). m_relic = ONE mythic GEAR piece (paid skip to tier 4).
  // m_all = a mythic piece in EVERY slot + the skin + 250k blood (the "get mythic straight away" bundle).
  if (mid === 'm_skin') {
    var mdupe = !!econ.ownedSkins['m_skin']; econ.ownedSkins['m_skin'] = 1; saveMeta();
    var mc = skinDropCard('m_skin', mdupe); mc.paid = true; return mc;   // rides the gacha roll like every other box (no old UI)
  }
  if (mid === 'm_all') {
    var ahaul = [];
    for (var i = 0; i < GEAR_SLOTS.length; i++) { econ.gear[GEAR_SLOTS[i].id][GEAR_MYTHIC_TIER] += 1; ahaul.push({ slot: GEAR_SLOTS[i].id, tier: GEAR_MYTHIC_TIER }); }
    econ.ownedSkins['m_skin'] = 1; econ.totalBank += 250000; saveMeta();
    return { kind: 'bounty', haul: ahaul, skin: 'm_skin', paid: true, title: 'APEX PREDATOR', col: GEAR_TIERS[GEAR_MYTHIC_TIER].col };   // haul reveal (mythic in every slot + skin)
  }
  var slotId = GEAR_SLOTS[(rnd() * GEAR_SLOTS.length) | 0].id;   // m_relic -> one MYTHIC gear piece, random slot
  econ.gear[slotId][GEAR_MYTHIC_TIER] += 1; saveMeta();
  var card = gearDropCard(slotId, GEAR_MYTHIC_TIER); card.paid = true; return card;
}

// ---- equipping ---------------------------------------------------------------------------------

export function setSkin(id) {
  if (!econ.ownedSkins[id]) return false;
  econ.equipSkin = id; saveMeta(); return true;
}

// Equipped-skin tint for render/world.js (default white when the equipped skin is missing/unowned).
export function skinTint() {
  var s = SKIN_BY_ID[econ.equipSkin];
  return (s && econ.ownedSkins[econ.equipSkin]) ? s.tint : DEFAULT_TINT;
}

// Toggle a relic on/off. Equipping is capped at RELIC_SLOTS; returns false if full or not owned.
export function toggleRelic(id) {
  if (!econ.ownedRelics[id]) return false;
  var i = econ.equipRelics.indexOf(id);
  if (i >= 0) { econ.equipRelics.splice(i, 1); saveMeta(); return true; }
  if (econ.equipRelics.length >= RELIC_SLOTS) return false;
  econ.equipRelics.push(id); saveMeta(); return true;
}

// PUBLIC (player.js): layer every equipped relic's effect onto the live player at run start. Additive into
// the SAME pools applyMetaToPlayer fills - so relics + meta + level-ups compose linearly (no runaway). The
// caller re-sets player.hp = player.maxHp and recomputeWeaponStats() AFTER this so maxHp/fire bumps apply.
export function applyEquippedRelics(p) {
  var eq = econ.equipRelics;
  for (var i = 0; i < eq.length; i++) {
    var rl = RELIC_BY_ID[eq[i]];
    if (!rl) continue;
    var e = rl.eff;
    if (e.maxHp) p.maxHp += e.maxHp;
    if (e.dmgBonus) p.dmgBonus += e.dmgBonus;
    if (e.asBonus) p.asBonus += e.asBonus;
    if (e.speedMul) p.speed *= e.speedMul;
    if (e.crushMul) { p.crush *= e.crushMul; p.crushDps *= e.crushMul; }
    if (e.pickRMul) p.pickR *= e.pickRMul;
    if (e.thirst) { p.thirst += e.thirst; p.rangedHeal = true; }
    if (e.regen) p.regen += e.regen;
    if (e.barrels) p.barrels = Math.min(8, p.barrels + e.barrels);
    if (e.lashLvl) p.lashLvl = Math.min(8, p.lashLvl + e.lashLvl);
  }
}

// PUBLIC (game/session.js startRun): consume any owned one-shot consumables for THIS run. Called once a
// genuine run actually starts (not on a menu reset), AFTER applyMetaToPlayer + applyEquippedRelics.
export function consumeRunStartItems(p) {
  var changed = false;
  if (econ.consumables.overcharge > 0) { econ.consumables.overcharge -= 1; p.barrels = Math.min(8, p.barrels + 1); changed = true; }
  if (econ.consumables.platelayer > 0) { econ.consumables.platelayer -= 1; p.maxHp += 35; p.hp = p.maxHp; changed = true; }
  if (changed) saveMeta();
}

// ---- shard shop --------------------------------------------------------------------------------

export var SHARD_RELIC_COST = 60;   // forge ONE random unowned relic

export function unownedRelicIds() {
  var out = [];
  for (var id in RELIC_BY_ID) { if (!econ.ownedRelics[id]) out.push(id); }
  return out;
}

// Spend shards to forge a random relic you do not own yet (deterministic sink for the dupe currency).
export function forgeRelicFromShards() {
  if (econ.shards < SHARD_RELIC_COST) return null;
  var pool = unownedRelicIds();
  if (!pool.length) return null;
  econ.shards -= SHARD_RELIC_COST;
  var id = pool[(rnd() * pool.length) | 0];
  econ.ownedRelics[id] = 1;
  saveMeta();
  return RELIC_BY_ID[id];
}

// ---- cache sources (v1: daily + elite in-run drop) ---------------------------------------------

function pad2(n) { return (n < 10 ? '0' : '') + n; }
function dayStr(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }

// PUBLIC (main.js boot): grant the once-per-day free cache + advance the login streak. Streak gives a 2nd
// cache every 7th consecutive day. No-op (returns null) if already claimed today. Soft retention only -
// the date is the CLIENT clock (trivially abusable), so this is flavour, never meaningful progression.
export function grantDailyCache() {
  var now = new Date();
  var today = dayStr(now);
  if (econ.lastDaily === today) return null;
  var yest = new Date(now.getTime()); yest.setDate(yest.getDate() - 1);
  econ.streak = (econ.lastDaily === dayStr(yest)) ? (econ.streak + 1) : 1;
  econ.lastDaily = today;
  var n = 1 + ((econ.streak % 7 === 0) ? 1 : 0);
  econ.caches += n;
  saveMeta();
  return { caches: n, streak: econ.streak };
}

// PUBLIC (systems/enemies.js killEnemy, gated on the `big`/elite flag): chance to award a cache mid-run.
// Returns true when one dropped (so the caller can fire a banner + sound). DELIBERATELY does NOT saveMeta:
// in TG mode every saveMeta triggers a cloud write, and this fires mid-horde - the count is persisted at
// run end by bankRun() (enterDeath/enterWin both bank, serializing econ.caches). The only loss window is a
// tab-close mid-run, acceptable for a free in-run bonus.
export function maybeDropEliteCache() {
  dropGear(null, 1);   // every elite kill also drops a COMMON gear piece - the play-driven merge grind (the 10k-to-top loop)
  if (rnd() < ELITE_CACHE_CHANCE) {
    econ.caches += 1;
    return true;
  }
  return false;
}
