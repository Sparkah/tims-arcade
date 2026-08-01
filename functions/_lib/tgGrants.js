import {
  getTelegramState,
  insertTelegramStateIfMissing,
  updateTelegramStateIfRev,
} from './supabase.js';

// Server-authoritative purchase grants (Tim 2026-06-30). This is the SINGLE place a paid product's
// catalog delta is applied to a player's saved state. The client no longer applies its own paid products
// (that was the spoof the bloodtread tg.js comment demanded be closed): payment endpoints call
// applyPurchaseGrant() on a verified-paid receipt, write it into telegram_player_states, and record the
// payload in state.__server.entitlements.applied so a replayed claim cannot double-grant.
//
// SCOPE: deterministic Bloodtread and Megaton bundles are applied SERVER-SIDE here. Bloodtread's legacy gacha
// products are queued in __server.entitlements.pending for its client redemption flow. Megaton paid Arsenal
// pulls are deliberately NOT queued here: /api/tg-paid-gacha rolls them server-side and persists an immutable
// receipt/inventory grant. Megaton welcome_x8 is retired and cannot be invoiced or granted.
// Every deterministic grant and Bloodtread pending entry is idempotent via applied[payload].
//
// The bloodtread deltas below MUST stay in lockstep with games/bloodtread_mobile/tg.js grant() (the live
// client-feedback path applies the SAME numbers). MAXTIER mirrors data/upgrades.js (6).

const BLOODTREAD_MAXTIER = 6;
const BLOODTREAD_TIERS = ['armor', 'core', 'cannon', 'treads', 'thirst', 'frenzy'];

const MEGATON_UPGRADE_FIELDS = Object.freeze({
  yield: 'powerLvl',
  flares: 'flareLvl',
  pen: 'penLvl',
  mirv: 'mirvLvl',
  shock: 'shockLvl',
  luck: 'luckLvl',
  emp: 'empLvl',
  orbital: 'orbitalLvl',
  cluster: 'clusterLvl',
  firestorm: 'firestormLvl',
  chain: 'chainLvl',
  glass: 'glassLvl',
  seismic: 'seismicLvl',
  inferno: 'infernoLvl',
  topple: 'toppleLvl',
  meltdown: 'meltdownLvl',
  tidal: 'tidalLvl',
  fireworks: 'fireworksLvl',
  eye: 'eyeLvl',
});

const MEGATON_UPGRADE_BASES = Object.freeze({
  yield: 55,
  flares: 70,
  pen: 90,
  mirv: 210,
  shock: 150,
  luck: 100,
  emp: 120,
  orbital: 190,
  cluster: 140,
  firestorm: 130,
  chain: 160,
  glass: 130,
  seismic: 180,
  inferno: 170,
  topple: 200,
  meltdown: 190,
  tidal: 160,
  fireworks: 150,
  eye: 250,
});

const MEGATON_WALL_OPTIONAL_UPGRADES = Object.freeze([
  'flares', 'pen', 'mirv', 'shock', 'emp', 'orbital', 'cluster',
  'firestorm', 'chain', 'glass', 'seismic', 'inferno', 'topple',
  'meltdown', 'tidal', 'fireworks', 'eye',
]);

const MEGATON_GOD_POWER_MAXIMA = Object.freeze({
  powerLvl: 80,
  flareLvl: 12,
  penLvl: 18,
  mirvLvl: 5,
  shockLvl: 10,
  luckLvl: 18,
  empLvl: 8,
  orbitalLvl: 8,
  clusterLvl: 10,
  firestormLvl: 12,
  chainLvl: 10,
  glassLvl: 10,
  seismicLvl: 9,
  infernoLvl: 10,
  toppleLvl: 12,
  meltdownLvl: 12,
  tidalLvl: 10,
  fireworksLvl: 10,
  eyeLvl: 1,
});

function ensureEntitlementShape(state) {
  if (!state.__server || typeof state.__server !== 'object' || Array.isArray(state.__server)) state.__server = {};
  if (!state.__server.entitlements || typeof state.__server.entitlements !== 'object' || Array.isArray(state.__server.entitlements)) {
    state.__server.entitlements = {};
  }
  return state.__server.entitlements;
}

function clampTier(n) {
  n = Math.floor(Number(n) || 0);
  if (n < 0) return 0;
  if (n > BLOODTREAD_MAXTIER) return BLOODTREAD_MAXTIER;
  return n;
}

function ensureBloodtreadShape(state) {
  state.bt = 1;
  if (!state.meta || typeof state.meta !== 'object' || Array.isArray(state.meta)) state.meta = {};
  for (const t of BLOODTREAD_TIERS) state.meta[t] = clampTier(state.meta[t]);
  if (typeof state.bank !== 'number' || !isFinite(state.bank)) state.bank = 0;
  ensureEntitlementShape(state);
  return state;
}

function setAdFree(state) {
  state.__server.entitlements.adFree = true; // server-owned source of truth (tg-state derives client adFree from this)
  state.adFree = 1;                          // mirror into the client-visible field for instant load
}

// Products this server can grant deterministically, per game.
export const SERVER_GRANTABLE = Object.freeze({
  bloodtread: Object.freeze(['starter', 'blood_cache', 'hull_kit', 'arsenal', 'ad_free', 'bloodgod']),
  megaton: Object.freeze(['starter', 'caps_pack', 'warhead_tuning', 'mirv_kit', 'god_power']),
});

export function isServerGrantable(game, productId) {
  const list = SERVER_GRANTABLE[game];
  return Boolean(list && list.indexOf(productId) >= 0);
}

// Gacha products the game rolls/grants client-side after a verified payment (queued as a pending pull).
export const SERVER_PENDING = Object.freeze({
  bloodtread: Object.freeze(['box_single', 'box_legendary', 'box_bounty', 'mythic_skin', 'mythic_relic', 'mythic_ultimate']),
});

export function isStorePending(game, productId) {
  const list = SERVER_PENDING[game];
  return Boolean(list && list.indexOf(productId) >= 0);
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function megatonUpgradeLevel(state, id) {
  const field = MEGATON_UPGRADE_FIELDS[id];
  return field ? Math.max(0, finiteNumber(state[field])) : 0;
}

export function megatonUpgradeCost(state, id) {
  const base = MEGATON_UPGRADE_BASES[id] || 100;
  const rate = id === 'mirv' || id === 'orbital' ? 2.25 : 1.33;
  const cost = Math.round(base * Math.pow(rate, megatonUpgradeLevel(state, id)));
  return Number.isFinite(cost) ? Math.max(1, cost) : Number.MAX_SAFE_INTEGER;
}

// Mirrors the current Telegram wrapper's localMaxUpgradeCost(): Yield always participates,
// Extra Income unlocks at city tier 1, and the remaining perks participate once owned.
export function megatonMaxUpgradeCost(state) {
  const ids = ['yield'];
  if (finiteNumber(state.cityTier) >= 1) ids.push('luck');
  for (const id of MEGATON_WALL_OPTIONAL_UPGRADES) {
    if (megatonUpgradeLevel(state, id) > 0) ids.push(id);
  }
  let max = 0;
  for (const id of ids) max = Math.max(max, megatonUpgradeCost(state, id));
  return Math.max(40, max);
}

function addMegatonCaps(state, amount) {
  const caps = Math.ceil(finiteNumber(amount));
  state.money = finiteNumber(state.money) + caps;
  state.totalEarned = finiteNumber(state.totalEarned) + caps;
  state.best = Math.max(finiteNumber(state.best), state.totalEarned);
}

function addMegatonNukeAmmo(state, id, amount) {
  if (!state.nukeAmmo || typeof state.nukeAmmo !== 'object' || Array.isArray(state.nukeAmmo)) state.nukeAmmo = {};
  state.nukeAmmo[id] = Math.max(0, finiteNumber(state.nukeAmmo[id])) + amount;
}

function clampMegatonLevel(state, field, amount, maximum) {
  state[field] = Math.min(maximum, Math.max(0, finiteNumber(state[field])) + amount);
}

function maxMegatonNukes(state) {
  const prior = Array.isArray(state.nukeOwned)
    ? state.nukeOwned
    : state.nukeOwned && typeof state.nukeOwned === 'object'
      ? Object.keys(state.nukeOwned).filter((id) => state.nukeOwned[id])
      : [];
  state.nukeOwned = Array.from(new Set(['std', ...prior, 'wide', 'tsar']));
  if (!state.nukeAmmo || typeof state.nukeAmmo !== 'object' || Array.isArray(state.nukeAmmo)) state.nukeAmmo = {};
  state.nukeAmmo.wide = Math.max(999, finiteNumber(state.nukeAmmo.wide));
  state.nukeAmmo.tsar = Math.max(999, finiteNumber(state.nukeAmmo.tsar));
  state.activeNuke = 'tsar';
}

function applyMegatonGrant(productId, state) {
  const entitlements = ensureEntitlementShape(state);
  const upgradeWall = megatonMaxUpgradeCost(state);
  switch (productId) {
    case 'starter':
      addMegatonCaps(state, 1500 + upgradeWall * 1.5);
      clampMegatonLevel(state, 'powerLvl', 1, 80);
      clampMegatonLevel(state, 'luckLvl', 2, 18);
      break;
    case 'caps_pack':
      addMegatonCaps(state, 5000 + upgradeWall * 5);
      break;
    case 'warhead_tuning':
      addMegatonCaps(state, 1200);
      clampMegatonLevel(state, 'powerLvl', 4, 80);
      clampMegatonLevel(state, 'luckLvl', 2, 18);
      addMegatonNukeAmmo(state, 'wide', 1);
      break;
    case 'mirv_kit':
      addMegatonCaps(state, 1800);
      clampMegatonLevel(state, 'mirvLvl', 1, 5);
      clampMegatonLevel(state, 'penLvl', 2, 18);
      clampMegatonLevel(state, 'flareLvl', 2, 12);
      addMegatonNukeAmmo(state, 'wide', 3);
      break;
    case 'god_power':
      entitlements.godPower = true;
      state.godPower = true;
      addMegatonCaps(state, 250000 + upgradeWall * 10);
      for (const [field, maximum] of Object.entries(MEGATON_GOD_POWER_MAXIMA)) {
        state[field] = Math.max(finiteNumber(state[field]), maximum);
      }
      maxMegatonNukes(state);
      break;
    default:
      return false;
  }

  // Paid bundles finish onboarding so the authoritative reload cannot strand
  // the buyer inside a tutorial step that no longer matches their loadout.
  state.tutDone = true;
  state.upgDone = true;
  state.tutorialV = 3;
  state.tutStep = 13;
  state.tutDailyPending = false;
  state.tutorialGiftOpen = false;
  return true;
}

// Queue a pending gacha pull the game redeems once. Payload-keyed so a re-claim before the ack can't double it.
function pushPending(state, productId, payload) {
  ensureBloodtreadShape(state);
  const ent = state.__server.entitlements;
  if (!Array.isArray(ent.pending)) ent.pending = [];
  if (!ent.pending.some((p) => p && p.payload === payload)) {
    ent.pending.push({ id: productId, payload, ts: Date.now() });
    while (ent.pending.length > 50) ent.pending.shift();
  }
}

// Mutate `state` IN PLACE with the product's delta. Returns true if applied, false if the product is not a
// server-grantable deterministic product (caller must NOT grant in that case).
export function applyGrantToState(game, productId, state) {
  if (!state || typeof state !== 'object' || Array.isArray(state) || !isServerGrantable(game, productId)) return false;
  if (game === 'megaton') return applyMegatonGrant(productId, state);
  if (game !== 'bloodtread') return false;
  ensureBloodtreadShape(state);
  const m = state.meta;
  switch (productId) {
    case 'starter':     state.bank += 2000;   m.treads = clampTier(m.treads + 1); break;
    case 'blood_cache': state.bank += 6000;   break;
    case 'hull_kit':    state.bank += 2000;   m.armor = clampTier(m.armor + 2); m.core = clampTier(m.core + 2); break;
    case 'arsenal':     state.bank += 2500;   m.cannon = clampTier(m.cannon + 2); m.frenzy = clampTier(m.frenzy + 1); break;
    case 'ad_free':     setAdFree(state);     break;
    case 'bloodgod':
      setAdFree(state);
      state.bank += 250000;
      for (const t of BLOODTREAD_TIERS) m[t] = BLOODTREAD_MAXTIER;
      break;
    default: return false;
  }
  state.bank = Math.floor(state.bank);
  return true;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function appliedLedger(state, game) {
  const ent = game === 'bloodtread'
    ? ensureBloodtreadShape(state).__server.entitlements
    : ensureEntitlementShape(state);
  if (!ent.applied || typeof ent.applied !== 'object' || Array.isArray(ent.applied)) ent.applied = {};
  return ent.applied;
}

export async function applyPurchaseGrant(env, game, telegramUserId, productId, payload) {
  const deterministic = isServerGrantable(game, productId);
  const pendingGacha = isStorePending(game, productId);
  if (!deterministic && !pendingGacha) {
    return { granted: false, unsupported: true };
  }

  const userId = String(telegramUserId || '');
  const grantKey = String(payload || '');
  if (!userId || !grantKey) return { granted: false, invalid: true };

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const existing = await getTelegramState(env, game, userId);
    if (!existing) {
      // Seed the row without merge-upsert. Concurrent first purchases/saves
      // then converge through the same revision-CAS loop instead of one
      // silently overwriting another's state or entitlement ledger.
      await insertTelegramStateIfMissing(env, game, userId, {});
      continue;
    }
    const state = existing && existing.state ? cloneJson(existing.state) : {};
    const applied = appliedLedger(state, game);
    if (applied[grantKey]) {
      return {
        granted: true,
        alreadyApplied: true,
        state,
        stateRev: existing ? existing.state_rev : null,
        updatedAt: existing ? existing.updated_at : null,
      };
    }

    if (deterministic) {
      if (!applyGrantToState(game, productId, state)) return { granted: false, unsupported: true };
    } else {
      pushPending(state, productId, grantKey);   // gacha: the game redeems + reveals this pull, then acks
    }
    applied[grantKey] = { productId, ts: Date.now() };

    const rows = [await updateTelegramStateIfRev(env, game, userId, existing.state_rev, state)].filter(Boolean);
    const saved = Array.isArray(rows) && rows.length ? rows[0] : null;
    if (saved) {
      return {
        granted: true,
        alreadyApplied: false,
        state: saved.state,
        stateRev: saved.state_rev,
        updatedAt: saved.updated_at,
      };
    }
  }

  return { granted: false, conflict: true };
}

// Remove a redeemed pending pull (called by the game after it rolls the box / grants the mythic + shows the
// reveal). Idempotent: a missing payload is a no-op success. CAS-guarded like the grant path.
export async function ackPendingGrant(env, game, telegramUserId, payload) {
  const userId = String(telegramUserId || '');
  const key = String(payload || '');
  if (game !== 'bloodtread' || !userId || !key) return { ok: false, invalid: true };

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const existing = await getTelegramState(env, game, userId);
    if (!existing || !existing.state) return { ok: true, empty: true };
    const ent = existing.state.__server && existing.state.__server.entitlements;
    if (!ent || !Array.isArray(ent.pending) || !ent.pending.some((p) => p && p.payload === key)) {
      return { ok: true, nochange: true };
    }
    const state = cloneJson(existing.state);
    state.__server.entitlements.pending = state.__server.entitlements.pending.filter((p) => p && p.payload !== key);
    const rows = [await updateTelegramStateIfRev(env, game, userId, existing.state_rev, state)].filter(Boolean);
    if (rows.length) return { ok: true, state: rows[0].state, stateRev: rows[0].state_rev };
  }
  return { ok: false, conflict: true };
}
