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
//   - window.__tgApplyBloodtreadProduct(id) is what the wrapper calls to grant a paid product live.
//   - PEND_KEY ('bloodtread_pending_grants') = grants queued by the wrapper when the game hook was not ready yet.
import { META, econ } from './state.js';
import { stats, saveMeta, setSaveHook } from './persistence.js';
import { TG_MODE } from './flags.js';
import { clampInt } from './lib/math.js';
import { MAXTIER } from './data/upgrades.js';
import { RELIC_SLOTS } from './data/loot.js';
import { openPaidBox, openBountyBox, grantMythic } from './systems/loot.js';   // STORE: server-verified box/bounty/mythic grants (post-payment)

var WRAP_KEY = 'bloodtread_v5';
var PEND_KEY = 'bloodtread_pending_grants';
var AD_FREE_KEY = 'bloodtread_rebuild_adfree';

// PAYMENTS HELD OFF (Tim 2026-06-26, "ship core now, payments later"). The Stars/TON grant model is
// client-authoritative (Codex hard blocker): a client applying its own paid products can be spoofed via the
// exposed grant hook / the pending-grants localStorage. Until grant application moves SERVER-SIDE (a claim
// endpoint that verifies the paid receipt + applies the catalog delta to telegram_player_states, + tg-state
// rejecting unbacked entitlements), the game must NOT expose the grant hook or drain the pending queue, and the
// wrapper shop is gated off (config.js BLOODTREAD_SHOP_ENABLED). Cloud SAVES (no money) stay on. Flip to true
// only TOGETHER with the server-side grant flow.
var PAYMENTS_ENABLED = false;

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

// Grant a purchased product by its catalog id (Gallery/functions/_lib/tgProducts.js bloodtread + the wrapper
// PRODUCTS). Mutates META/econ/adFree then saveMeta() (which fires the save-hook -> cloud). Returns true so the
// wrapper knows the live grant landed and need not fall back to the pending queue.
function grant(id) {
  var addBank = 0;
  switch (id) {
    case 'starter':     addBank = 2000; META.treads += 1; break;
    case 'blood_cache': addBank = 6000; break;
    case 'hull_kit':    addBank = 2000; META.armor += 2; META.core += 2; break;
    case 'arsenal':     addBank = 2500; META.cannon += 2; META.frenzy += 1; break;
    case 'box_single':      openPaidBox(1); break;   // STORE box: guaranteed VEIN+ (server-verified post-payment)
    case 'box_legendary':   openPaidBox(3); break;   // STORE box: guaranteed a RELIC
    case 'box_bounty':      openBountyBox(); econ.boughtOnce['box_bounty'] = 1; break;   // STORE: a piece in every slot + extras + a skin (one-time)
    case 'mythic_skin':     grantMythic('m_skin'); break;
    case 'mythic_relic':    grantMythic('m_relic'); break;
    case 'mythic_ultimate': grantMythic('m_all'); econ.boughtOnce['mythic_ultimate'] = 1; break;   // one-time
    case 'ad_free':     setAdFree(); break;
    case 'bloodgod':
      setAdFree(); addBank = 250000;
      META.armor = META.core = META.cannon = META.treads = META.thirst = META.frenzy = MAXTIER;
      break;
    default: return false;   // unknown id - tell the wrapper nothing was granted
  }
  econ.totalBank += addBank;
  for (var mk in META) META[mk] = clampInt(META[mk], 0, MAXTIER);
  saveMeta();   // -> setSaveHook(tgPersist) pushes the new state to the cloud
  return true;
}

// Drain any grants the wrapper queued while this game hook was not yet defined (the wrapper-side fallback path).
// Returns true if anything was granted (so the caller can ensure it reaches the cloud once __tg injects - the
// drain runs at boot, but tgPersist no-ops until the wrapper injects window.__tg on the iframe load event).
function drainPending() {
  var granted = false;
  try {
    var pend = JSON.parse(localStorage.getItem(PEND_KEY) || '[]');
    if (Array.isArray(pend) && pend.length) {
      for (var i = 0; i < pend.length; i++) { if (grant(String(pend[i]))) granted = true; }
      localStorage.removeItem(PEND_KEY);
    }
  } catch (e) {}
  return granted;
}

// Push the local state to the cloud once window.__tg is injected (it arrives on the iframe 'load' event, which
// can land after this boot code). Used to flush a boot-time pending-grant drain that tgPersist missed (Codex #5).
function persistWhenReady(tries) {
  if (!TG_MODE) return;
  if (window.__tg && typeof window.__tg.saveState === 'function') { tgPersist(); return; }
  if ((tries || 0) > 40) return;   // ~ up to 20s of 500ms polls, then give up (next saveMeta will sync anyway)
  setTimeout(function () { persistWhenReady((tries || 0) + 1); }, 500);
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
  if (PAYMENTS_ENABLED && drainPending()) persistWhenReady(0);   // queued grants OFF until server-side grants ship
}

if (TG_MODE) {
  setSaveHook(tgPersist);   // cloud SAVES (no money) - always on in TG mode
  if (PAYMENTS_ENABLED && typeof window !== 'undefined') {
    // The wrapper calls this after a confirmed Stars/TON purchase to grant the product live. EXPOSED ONLY when
    // payments are on (else it is a client-side free-grant vector) - see PAYMENTS_ENABLED above.
    window.__tgApplyBloodtreadProduct = function (id) { return grant(String(id || '')); };
  }
}
