import {
  getTelegramState,
  updateTelegramStateIfRev,
  upsertTelegramState,
} from './supabase.js';

// Server-authoritative purchase grants (Tim 2026-06-30). This is the SINGLE place a paid product's
// catalog delta is applied to a player's saved state. The client no longer applies its own paid products
// (that was the spoof the bloodtread tg.js comment demanded be closed): payment endpoints call
// applyPurchaseGrant() on a verified-paid receipt, write it into telegram_player_states, and record the
// payload in state.__server.entitlements.applied so a replayed claim cannot double-grant.
//
// SCOPE: two kinds of paid product. (1) DETERMINISTIC bundles (bank/tiers/adFree: starter/blood_cache/hull_kit/
// arsenal/ad_free/bloodgod) are applied to state SERVER-SIDE here. (2) GACHA pulls (box_*/mythic_*, the in-game
// Blood Market / STORE) can't be rolled server-side (the loot tables + pity live in the game), so the server
// VERIFIES the payment and QUEUES a pending pull in __server.entitlements.pending; the game redeems it exactly
// once (rolls the box / grants the mythic + shows the reveal) then acks to clear it. Both paths are idempotent
// via applied[payload]; pending is additionally payload-keyed so a redeem can't double even before the ack.
//
// The bloodtread deltas below MUST stay in lockstep with games/bloodtread_mobile/tg.js grant() (the live
// client-feedback path applies the SAME numbers). MAXTIER mirrors data/upgrades.js (6).

const BLOODTREAD_MAXTIER = 6;
const BLOODTREAD_TIERS = ['armor', 'core', 'cannon', 'treads', 'thirst', 'frenzy'];

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
  if (!state.__server || typeof state.__server !== 'object' || Array.isArray(state.__server)) state.__server = {};
  if (!state.__server.entitlements || typeof state.__server.entitlements !== 'object' || Array.isArray(state.__server.entitlements)) {
    state.__server.entitlements = {};
  }
  return state;
}

function setAdFree(state) {
  state.__server.entitlements.adFree = true; // server-owned source of truth (tg-state derives client adFree from this)
  state.adFree = 1;                          // mirror into the client-visible field for instant load
}

// Products this server can grant deterministically, per game.
export const SERVER_GRANTABLE = Object.freeze({
  bloodtread: Object.freeze(['starter', 'blood_cache', 'hull_kit', 'arsenal', 'ad_free', 'bloodgod']),
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
  if (game !== 'bloodtread' || !isServerGrantable(game, productId)) return false;
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

function appliedLedger(state) {
  ensureBloodtreadShape(state);
  const ent = state.__server.entitlements;
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
    const state = existing && existing.state ? cloneJson(existing.state) : {};
    const applied = appliedLedger(state);
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

    const rows = existing
      ? [await updateTelegramStateIfRev(env, game, userId, existing.state_rev, state)].filter(Boolean)
      : await upsertTelegramState(env, game, userId, state);
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
