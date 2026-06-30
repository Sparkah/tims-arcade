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
// SCOPE: only DETERMINISTIC products are server-grantable (the 6 surfaced in the bloodtread shop). Random
// gacha boxes + specific mythics (box_*/mythic_*) need the loot tables ported server-side and are NOT in the
// shop, so they are intentionally unsupported here (claim returns granted:false / unsupported for them).
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
  if (!isServerGrantable(game, productId)) {
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

    if (!applyGrantToState(game, productId, state)) return { granted: false, unsupported: true };
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
