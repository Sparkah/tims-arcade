import { json, jsonError, sameOriginOk } from '../_lib/response.js';
import { PRODUCTS_BY_GAME, megatonPaidGachaCutoverMs } from '../_lib/tgProducts.js';
import { verifyTelegramInitDataFromEnv } from '../_lib/telegramAuth.js';
import {
  getTelegramState,
  insertTelegramStateIfMissing,
  supabaseIsConfigured,
  updateTelegramStateIfRev,
  upsertTelegramPlayer,
  upsertTelegramState,
} from '../_lib/supabase.js';

const MAX_STATE_BYTES = 32 * 1024;
const MEGATON_STATE_PROTOCOL = 'megaton-state-rev-v1';
const MEGATON_LEGACY_SAVE_WINDOW_MS = 24 * 60 * 60 * 1000;

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
function validateGame(game) {
  return Boolean(game && PRODUCTS_BY_GAME[game]);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function serverBlock(state) {
  return state && state.__server && typeof state.__server === 'object' && !Array.isArray(state.__server)
    ? state.__server
    : null;
}

function cleanSourceTag(value) {
  return String(value || '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64);
}

function sourceMeta(body, auth) {
  const signedStartParam = cleanSourceTag(auth && auth.raw && auth.raw.start_param);
  const bodyStartParam = cleanSourceTag(body && (body.startParam || body.start_param));
  const startParam = signedStartParam || bodyStartParam;
  return {
    source: cleanSourceTag(body && body.source) || startParam,
    startParam,
  };
}

function stateConflict(row) {
  return json({
    ok: false,
    configured: true,
    error: 'state_revision_conflict',
    state: row ? row.state : null,
    stateRev: row ? row.state_rev : null,
    updatedAt: row ? row.updated_at : null,
  }, 409, { 'cache-control': 'no-store' });
}

function expectedRevision(value) {
  if (value == null || value === '') return null;
  const revision = Number(value);
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : null;
}

function hasProtectedMegatonGrant(state) {
  const block = serverBlock(state);
  const entitlements = block && block.entitlements;
  if (!entitlements || typeof entitlements !== 'object' || Array.isArray(entitlements)) return false;
  return Object.entries(entitlements).some(([key, value]) => (
    key === 'applied'
      ? Boolean(value && typeof value === 'object' && Object.keys(value).length)
      : Boolean(value)
  ));
}

function legacyMegatonSaveAllowed(body, env, existing, now = Date.now()) {
  if (!existing || Object.hasOwn(body, 'expectedStateRev')) return false;
  // Only a truly absent marker identifies the pre-protocol client. Unknown or
  // future non-empty markers must never inherit the temporary legacy bypass.
  if (String(body.stateProtocol || '')) return false;
  if (hasProtectedMegatonGrant(existing.state)) return false;
  const cutover = megatonPaidGachaCutoverMs(env);
  return Number.isFinite(cutover)
    && now >= cutover
    && now < cutover + MEGATON_LEGACY_SAVE_WINDOW_MS;
}

export async function onRequestPost({ request, env }) {
  if (!sameOriginOk(request)) return jsonError('Forbidden', 403);

  if (!supabaseIsConfigured(env)) {
    return json({ ok: false, configured: false, error: 'supabase_not_configured' }, 503);
  }

  const body = await readBody(request);
  if (!body || typeof body !== 'object') return jsonError('Invalid JSON body', 400);

  const action = body.action || 'save';
  const game = String(body.game || '');
  if (!validateGame(game)) return jsonError('Unknown game', 400);

  // Accept BOTH the prod and test bot tokens (verifyTelegramInitDataFromEnv tries each): the mini app can be
  // launched by @gamesfactorybot or @gamesfactorytestbot, and the same Supabase save/grant state is shared.
  const auth = await verifyTelegramInitDataFromEnv(body.initData, env);
  if (!auth.ok) return jsonError(`Telegram auth failed: ${auth.error}`, 401);

  await upsertTelegramPlayer(env, auth.user, action === 'load' ? sourceMeta(body, auth) : {});

  if (action === 'load') {
    const row = await getTelegramState(env, game, auth.user.id);
    return json(
      {
        ok: true,
        configured: true,
        state: row ? row.state : null,
        stateRev: row ? row.state_rev : null,
        updatedAt: row ? row.updated_at : null,
        ...(game === 'megaton' ? { stateProtocol: MEGATON_STATE_PROTOCOL } : {}),
      },
      200,
      { 'cache-control': 'no-store' },
    );
  }

  if (action !== 'save') return jsonError('Unknown action', 400);
  if (!body.state || typeof body.state !== 'object' || Array.isArray(body.state)) {
    return jsonError('State must be an object', 400);
  }

  if (
    game === 'megaton'
    && body.stateProtocol != null
    && String(body.stateProtocol) !== ''
    && String(body.stateProtocol) !== MEGATON_STATE_PROTOCOL
  ) return jsonError('Unsupported Megaton state protocol', 400);

  const hasExpectedRevision = Object.hasOwn(body, 'expectedStateRev');
  const suppliedExpectedRevision = expectedRevision(body.expectedStateRev);
  if (game === 'megaton' && hasExpectedRevision && suppliedExpectedRevision == null) {
    return jsonError('Invalid expected state revision', 400);
  }

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const existing = await getTelegramState(env, game, auth.user.id);
    if (game === 'megaton') {
      // Megaton purchases mutate the same cloud state as gameplay. A save may
      // only replace the exact revision it loaded; otherwise return the newer
      // authoritative state so the wrapper can adopt it instead of erasing a
      // paid grant. For 24 hours after the paid-gacha cutover, an already-open
      // legacy client may save without a revision only while the row has no
      // protected purchase grant. The CAS write below still closes races with
      // a grant that lands between this read and update.
      const legacySave = legacyMegatonSaveAllowed(body, env, existing);
      if ((existing
          && suppliedExpectedRevision !== Number(existing.state_rev)
          && !legacySave)
          || (!existing && suppliedExpectedRevision != null)) {
        return stateConflict(existing);
      }
    }
    const cleanState = cloneJson(body.state);
    // __server is server-authoritative reward/payment state; never accept a client-written copy.
    delete cleanState.__server;
    const existingServer = serverBlock(existing && existing.state);
    if (existingServer) cleanState.__server = existingServer;
    // Purchase-exclusive permanent entitlement: a client may NEVER set bloodtread ad-free itself. It is derived
    // solely from the verified-grant ledger in __server.entitlements (written only by server payment endpoints). This
    // closes the self-spoof where a client saved adFree:1 without paying. Consumables (blood/tiers) stay
    // client-writable (they are earnable in-game); the purchase grant for those is applied server-side at claim.
    if (game === 'bloodtread') {
      const ent = existingServer && existingServer.entitlements;
      cleanState.adFree = ent && ent.adFree ? 1 : 0;
    }
    if (game === 'megaton') {
      const ent = existingServer && existingServer.entitlements;
      // God Power is purchase-exclusive. Its client-visible mirror is always
      // derived from the server ledger, so a later/stale autosave cannot revoke
      // a paid entitlement and an edited client save cannot mint one.
      cleanState.godPower = Boolean(ent && ent.godPower);
    }

    const stateBytes = new TextEncoder().encode(JSON.stringify(cleanState)).length;
    if (stateBytes > MAX_STATE_BYTES) {
      return jsonError(`State exceeds ${MAX_STATE_BYTES} bytes`, 413);
    }

    const rows = existing
      ? [await updateTelegramStateIfRev(env, game, auth.user.id, existing.state_rev, cleanState)].filter(Boolean)
      : game === 'megaton'
        ? await insertTelegramStateIfMissing(env, game, auth.user.id, cleanState)
        : await upsertTelegramState(env, game, auth.user.id, cleanState);
    const saved = Array.isArray(rows) && rows.length ? rows[0] : null;
    if (saved) {
      return json(
        {
          ok: true,
          configured: true,
          stateRev: saved.state_rev,
          updatedAt: saved.updated_at,
          ...(game === 'megaton' ? { stateProtocol: MEGATON_STATE_PROTOCOL } : {}),
        },
        200,
        { 'cache-control': 'no-store' },
      );
    }
  }

  return jsonError('State save conflict, retry', 409);
}
