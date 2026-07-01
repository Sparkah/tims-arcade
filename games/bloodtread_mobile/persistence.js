// localStorage save/load of meta-progression: track tiers + per-weapon tiers (weaponMeta) +
// owned/equipped weapon + bank + best time. Cannon's legacy META.cannon mirrors the equipped tier.
import { META, econ } from './state.js?v=bm8';
import { clampInt } from './lib/math.js?v=bm8';
import { MAXTIER } from './data/upgrades.js?v=bm8';
import { WEAPONS, WEAPON_BY_ID } from './data/weapons.js?v=bm8';
import { RELIC_SLOTS } from './data/loot.js?v=bm8';
import { currentWeaponTier, syncLegacyCannonMeta } from './game/meta.js?v=bm8';

var SAVE_META = 'bloodtread_rebuild_meta';
var SAVE_BANK = 'bloodtread_rebuild_bank';
var SAVE_BEST = 'bloodtread_rebuild_best';
// cross-run analytics stats (power GA's "attempts to reach minute 20" + "dropped after N attempts" cohorts).
var SAVE_STATS = 'bloodtread_rebuild_stats';

// Loaded once at boot (loadStats) into this live object; mutated by analytics.js, flushed by saveStats().
export var stats = { attempts: 0, maxMinute: 0, maxLevel: 0, hasWon: 0 };

// Optional post-save hook (registered by tg.js in Telegram mode) so EVERY saveMeta() also syncs to the cloud.
// A callback, not an import of tg.js, to avoid a circular import (tg.js imports saveMeta from here).
var saveHook = null;
export function setSaveHook(fn) { saveHook = typeof fn === 'function' ? fn : null; }

export function loadStats() {
  try {
    var s = JSON.parse(localStorage.getItem(SAVE_STATS) || '{}');
    stats.attempts = (typeof s.attempts === 'number' && s.attempts > 0) ? Math.floor(s.attempts) : 0;
    stats.maxMinute = (typeof s.maxMinute === 'number' && s.maxMinute > 0) ? Math.floor(s.maxMinute) : 0;
    stats.maxLevel = (typeof s.maxLevel === 'number' && s.maxLevel > 0) ? Math.floor(s.maxLevel) : 0;
    stats.hasWon = s.hasWon ? 1 : 0;
  } catch (err) {}
}

export function saveStats() {
  try {
    localStorage.setItem(SAVE_STATS, JSON.stringify({
      attempts: stats.attempts, maxMinute: stats.maxMinute, maxLevel: stats.maxLevel, hasWon: stats.hasWon
    }));
  } catch (err) {}
}

export function saveMeta() {
  try {
    syncLegacyCannonMeta();
    var m = {
      armor: META.armor, core: META.core, cannon: META.cannon,
      treads: META.treads, thirst: META.thirst, frenzy: META.frenzy,
      owned: econ.ownedWeapons, weapon: econ.equipWeapon,
      weaponMeta: {
        cannon: econ.weaponMeta.cannon,
        flak: econ.weaponMeta.flak,
        laser: econ.weaponMeta.laser,
        missile: econ.weaponMeta.missile
      },
      // GORE CACHE (gacha) layer - rides the same save blob, so it cloud-syncs in TG mode for free.
      loot: {
        caches: econ.caches, pity: econ.pity, shards: econ.shards,
        ownedSkins: econ.ownedSkins, equipSkin: econ.equipSkin,
        ownedRelics: econ.ownedRelics, equipRelics: econ.equipRelics,
        consumables: econ.consumables, gear: econ.gear, boughtOnce: econ.boughtOnce, lastDaily: econ.lastDaily, streak: econ.streak
      }
    };
    localStorage.setItem(SAVE_META, JSON.stringify(m));
    localStorage.setItem(SAVE_BANK, String(Math.floor(econ.totalBank)));
    localStorage.setItem(SAVE_BEST, String(Math.floor(econ.bestTime)));
  } catch (err) {}
  if (saveHook) { try { saveHook(); } catch (e) {} }   // Telegram cloud-sync (tg.js), no-op otherwise
}

export function loadMeta() {
  try {
    var m = JSON.parse(localStorage.getItem(SAVE_META) || '{}');
    for (var k in META) {
      if (typeof m[k] === 'number') META[k] = clampInt(m[k], 0, MAXTIER);
    }
    if (m.weaponMeta && typeof m.weaponMeta === 'object') {
      for (var wm = 0; wm < WEAPONS.length; wm++) {
        var wid = WEAPONS[wm].id;
        if (typeof m.weaponMeta[wid] === 'number') econ.weaponMeta[wid] = clampInt(m.weaponMeta[wid], 0, MAXTIER);
      }
    } else {
      econ.weaponMeta.cannon = META.cannon;
    }
    if (m.owned && typeof m.owned === 'object') econ.ownedWeapons = m.owned;
    econ.ownedWeapons.cannon = 1;
    if (typeof m.weapon === 'string' && econ.ownedWeapons[m.weapon] && WEAPON_BY_ID[m.weapon]) econ.equipWeapon = m.weapon;
    // GORE CACHE (gacha) layer restore - defensive: adopt only well-typed values, else keep econ defaults.
    var L = m.loot;
    if (L && typeof L === 'object') {
      if (typeof L.caches === 'number' && L.caches >= 0) econ.caches = Math.min(9999, Math.floor(L.caches));
      if (typeof L.pity === 'number' && L.pity >= 0) econ.pity = Math.min(999, Math.floor(L.pity));
      if (typeof L.shards === 'number' && L.shards >= 0) econ.shards = Math.min(999999, Math.floor(L.shards));
      if (L.ownedSkins && typeof L.ownedSkins === 'object') econ.ownedSkins = L.ownedSkins;
      econ.ownedSkins.default = 1;
      if (typeof L.equipSkin === 'string' && econ.ownedSkins[L.equipSkin]) econ.equipSkin = L.equipSkin;
      if (L.ownedRelics && typeof L.ownedRelics === 'object') econ.ownedRelics = L.ownedRelics;
      if (Array.isArray(L.equipRelics)) {
        var eq = [];
        for (var ei = 0; ei < L.equipRelics.length && eq.length < RELIC_SLOTS; ei++) {
          var rid = L.equipRelics[ei];
          if (typeof rid === 'string' && econ.ownedRelics[rid] && eq.indexOf(rid) < 0) eq.push(rid);
        }
        econ.equipRelics = eq;
      }
      if (L.boughtOnce && typeof L.boughtOnce === 'object') econ.boughtOnce = L.boughtOnce;   // STORE one-time-purchase flags
      if (L.gear && typeof L.gear === 'object') {   // GEAR merge-collection restore: adopt per-slot tier counts (clamped), keep defaults otherwise
        for (var gslot in econ.gear) {
          var ga = L.gear[gslot];
          if (Array.isArray(ga)) {
            for (var gt = 0; gt < econ.gear[gslot].length; gt++) {
              var gv = ga[gt];
              econ.gear[gslot][gt] = (typeof gv === 'number' && gv >= 0) ? Math.min(99999, Math.floor(gv)) : 0;
            }
          }
        }
      }
      if (L.consumables && typeof L.consumables === 'object') econ.consumables = L.consumables;
      if (typeof L.lastDaily === 'string') econ.lastDaily = L.lastDaily;
      if (typeof L.streak === 'number' && L.streak >= 0) econ.streak = Math.min(99999, Math.floor(L.streak));
    }
    syncLegacyCannonMeta();
    econ.totalBank = parseInt(localStorage.getItem(SAVE_BANK) || '0', 10) || 0;
    econ.bestTime = parseInt(localStorage.getItem(SAVE_BEST) || '0', 10) || 0;
  } catch (err) {}
}
