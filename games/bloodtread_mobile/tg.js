// Telegram Mini App adapter (Tim 2026-06-25). Loaded only as a side-effect from main.js; ALL behaviour is gated
// on TG_MODE (the wrapper loads the game with ?tg=1), so the standalone build (game-factory.tech/games/...,
// CrazyGames, Yandex) is completely unaffected. The platform-agnostic game just gains cloud saves + Stars/TON
// product grants + an ad-free flag when it runs inside the tg-bloodtread/ wrapper.
//
// Contract with the wrapper (Gallery/tg-bloodtread/index.html), SAME-ORIGIN on game-factory.tech so localStorage
// is shared:
//   - WRAP_KEY ('bloodtread_v5') = the wrapper's SAVE_KEY: the cloud-synced save mirror. The wrapper pre-loads it
//     from the backend (await loadRemoteState) BEFORE it starts this iframe, so tgHydrate() can read it
//     synchronously at boot - no dependency on window.__tg being injected yet (that races the iframe load event).
//   - window.__tg.saveState(obj) (injected on iframe load) pushes a save to the wrapper -> mirror + backend.
//   - Paid products are NOT granted through a client hook. The wrapper waits for the server to apply the paid
//     receipt to telegram_player_states, writes the refreshed state to WRAP_KEY, then reloads this iframe.
import { META, econ } from './state.js';
import { stats, saveMeta, setSaveHook } from './persistence.js';
import { TG_MODE } from './flags.js';
import { clampInt } from './lib/math.js';
import { MAXTIER } from './data/upgrades.js';
import { RELIC_SLOTS } from './data/loot.js';

var WRAP_KEY = 'bloodtread_v5';
var AD_FREE_KEY = 'bloodtread_rebuild_adfree';

// Payments are enabled only through server-owned cloud state. This file intentionally exposes no paid-grant hook.
var PAYMENTS_ENABLED = true;

// Ad-free entitlement (bought via the ad_free / bloodgod products). Persisted in its own key so it survives a
// local wipe of the meta save independently. input.js reads this to skip the rewarded-ad before a revive.
export var adFree = false;
try { adFree = localStorage.getItem(AD_FREE_KEY) === '1'; } catch (e) {}
function setAdFree() { adFree = true; try { localStorage.setItem(AD_FREE_KEY, '1'); } catch (e) {} }

// The full save object synced to the player's Telegram profile. Kept well under the backend's 32KB cap.
function buildState() {
  return {
    bt: 1,
    adFree: adFree ? 1 : 0,
    meta: {
      armor: META.armor, core: META.core, cannon: META.cannon,
      treads: META.treads, thirst: META.thirst, frenzy: META.frenzy
    },
    bank: Math.floor(econ.totalBank),
    best: Math.floor(econ.bestTime),
    weaponMeta: {
      cannon: econ.weaponMeta.cannon, flak: econ.weaponMeta.flak,
      laser: econ.weaponMeta.laser, missile: econ.weaponMeta.missile
    },
    owned: econ.ownedWeapons,
    weapon: econ.equipWeapon,
    stats: { attempts: stats.attempts, maxMinute: stats.maxMinute, maxLevel: stats.maxLevel, hasWon: stats.hasWon },
    // GORE CACHE (gacha) layer - synced so the vault (caches/skins/relics) survives across devices. Small:
    // a few ints + id-keyed maps, well under the 32KB cap. Merged by applyState (union owned, cloud-wins spendable).
    loot: {
      caches: econ.caches | 0, pity: econ.pity | 0, shards: econ.shards | 0,
      ownedSkins: econ.ownedSkins, equipSkin: econ.equipSkin,
      ownedRelics: econ.ownedRelics, equipRelics: econ.equipRelics,
      consumables: econ.consumables, lastDaily: econ.lastDaily, streak: econ.streak | 0
    }
  };
}

// Apply a cloud save over the current state. MERGE-MAX the MONOTONIC fields (tiers / best time / weapon tiers /
// stats / ad-free) - those only ever go up, so max can never lose progress. BANK is SPENDABLE, so it is NOT
// max'd (Codex 2026-06-25): max'ing it would systematically RESURRECT spent blood the moment a stale cloud read
// reported a higher balance. Bank takes the cloud's synced value (the wrapper resolves the latest state_rev into
// the SAVE_KEY mirror before this runs). [Known limit: a robust earned/spent ledger keyed by state_rev is the
// full fix for spendable currency across an unsynced device - tracked as payment-hardening, not shipped here.]
function applyState(o) {
  if (!o || o.bt !== 1) return;
  if (o.adFree) setAdFree();
  if (o.meta) {
    for (var k in META) {
      if (typeof o.meta[k] === 'number') META[k] = clampInt(Math.max(META[k], o.meta[k]), 0, MAXTIER);
    }
  }
  if (typeof o.bank === 'number') econ.totalBank = o.bank | 0;   // spendable: cloud (latest synced) wins, NOT max
  if (typeof o.best === 'number') econ.bestTime = Math.max(econ.bestTime | 0, o.best | 0);
  if (o.weaponMeta && typeof o.weaponMeta === 'object') {
    for (var wid in econ.weaponMeta) {
      if (typeof o.weaponMeta[wid] === 'number') econ.weaponMeta[wid] = clampInt(Math.max(econ.weaponMeta[wid], o.weaponMeta[wid]), 0, MAXTIER);
    }
  }
  if (o.owned && typeof o.owned === 'object') { for (var ow in o.owned) econ.ownedWeapons[ow] = o.owned[ow]; }
  if (typeof o.weapon === 'string' && econ.ownedWeapons[o.weapon]) econ.equipWeapon = o.weapon;
  if (o.stats && typeof o.stats === 'object') {
    stats.attempts = Math.max(stats.attempts | 0, o.stats.attempts | 0);
    stats.maxMinute = Math.max(stats.maxMinute | 0, o.stats.maxMinute | 0);
    stats.maxLevel = Math.max(stats.maxLevel | 0, o.stats.maxLevel | 0);
    stats.hasWon = (stats.hasWon || o.stats.hasWon) ? 1 : 0;
  }
  // GORE CACHE (gacha): UNION the owned collections (owning is monotonic - never lose a skin/relic), and
  // CLOUD-WINS the spendable/counter fields (caches/shards/pity/streak/consumables) - same model as bank: the
  // wrapper resolves the latest state_rev into the mirror before this runs, so the cloud value is the freshest.
  if (o.loot && typeof o.loot === 'object') {
    var L = o.loot;
    if (typeof L.caches === 'number') econ.caches = Math.max(0, L.caches | 0);
    if (typeof L.shards === 'number') econ.shards = Math.max(0, L.shards | 0);
    if (typeof L.pity === 'number') econ.pity = Math.max(0, L.pity | 0);
    if (typeof L.streak === 'number') econ.streak = Math.max(0, L.streak | 0);
    if (typeof L.lastDaily === 'string') econ.lastDaily = L.lastDaily;
    if (L.ownedSkins && typeof L.ownedSkins === 'object') { for (var sk in L.ownedSkins) econ.ownedSkins[sk] = 1; }
    if (L.ownedRelics && typeof L.ownedRelics === 'object') { for (var rl in L.ownedRelics) econ.ownedRelics[rl] = 1; }
    if (L.consumables && typeof L.consumables === 'object') econ.consumables = L.consumables;
    if (typeof L.equipSkin === 'string' && econ.ownedSkins[L.equipSkin]) econ.equipSkin = L.equipSkin;
    if (Array.isArray(L.equipRelics)) {
      var eqr = [];
      for (var ei = 0; ei < L.equipRelics.length && eqr.length < RELIC_SLOTS; ei++) {
        var rid = L.equipRelics[ei];
        if (typeof rid === 'string' && econ.ownedRelics[rid] && eqr.indexOf(rid) < 0) eqr.push(rid);
      }
      econ.equipRelics = eqr;
    }
  }
}

// Push the current save to the wrapper -> cloud. Registered as persistence.js's save-hook, so EVERY saveMeta()
// (bank a run, buy a tier, equip a weapon) also syncs to Telegram. window.__tg is injected on iframe load; by
// the time the player can trigger a save it exists, and the call is a no-op (not an error) if it does not.
function tgPersist() {
  if (!TG_MODE) return;
  try {
    if (window.__tg && typeof window.__tg.saveState === 'function') window.__tg.saveState(buildState());
  } catch (e) {}
}

// Boot hydrate: read the wrapper's pre-loaded cloud mirror (synchronous - no __tg dependency) + apply pending
// grants. Called from main.js right after loadMeta()/loadStats() so the cloud save wins over the local one.
export function tgHydrate() {
  if (!TG_MODE) return;
  try {
    var raw = localStorage.getItem(WRAP_KEY);
    if (raw) applyState(JSON.parse(raw));
  } catch (e) {}
}

if (TG_MODE) {
  setSaveHook(tgPersist);   // cloud SAVES (no money) - always on in TG mode
  if (!PAYMENTS_ENABLED && typeof window !== 'undefined') {
    // Kept as a feature-flag guard for emergency rollback builds. Never expose a client paid-grant hook here.
  }
}
