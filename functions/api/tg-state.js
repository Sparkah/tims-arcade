import { json, jsonError, sameOriginOk } from '../_lib/response.js';
import { PRODUCTS_BY_GAME } from '../_lib/tgProducts.js';
import { verifyTelegramInitData } from '../_lib/telegramAuth.js';
import {
  getTelegramState,
  supabaseIsConfigured,
  updateTelegramStateIfRev,
  upsertTelegramPlayer,
  upsertTelegramState,
} from '../_lib/supabase.js';

const MAX_STATE_BYTES = 32 * 1024;

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

  const auth = await verifyTelegramInitData(body.initData, env.TELEGRAM_GAMEBOT_TOKEN);
  if (!auth.ok) return jsonError(`Telegram auth failed: ${auth.error}`, 401);

  await upsertTelegramPlayer(env, auth.user);

  if (action === 'load') {
    const row = await getTelegramState(env, game, auth.user.id);
    return json(
      {
        ok: true,
        configured: true,
        state: row ? row.state : null,
        stateRev: row ? row.state_rev : null,
        updatedAt: row ? row.updated_at : null,
      },
      200,
      { 'cache-control': 'no-store' },
    );
  }

  if (action !== 'save') return jsonError('Unknown action', 400);
  if (!body.state || typeof body.state !== 'object' || Array.isArray(body.state)) {
    return jsonError('State must be an object', 400);
  }

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const existing = await getTelegramState(env, game, auth.user.id);
    const cleanState = cloneJson(body.state);
    // __server is server-authoritative reward/payment state; never accept a client-written copy.
    delete cleanState.__server;
    const existingServer = serverBlock(existing && existing.state);
    if (existingServer) cleanState.__server = existingServer;

    const stateBytes = new TextEncoder().encode(JSON.stringify(cleanState)).length;
    if (stateBytes > MAX_STATE_BYTES) {
      return jsonError(`State exceeds ${MAX_STATE_BYTES} bytes`, 413);
    }

    const rows = existing
      ? [await updateTelegramStateIfRev(env, game, auth.user.id, existing.state_rev, cleanState)].filter(Boolean)
      : await upsertTelegramState(env, game, auth.user.id, cleanState);
    const saved = Array.isArray(rows) && rows.length ? rows[0] : null;
    if (saved) {
      return json(
        {
          ok: true,
          configured: true,
          stateRev: saved.state_rev,
          updatedAt: saved.updated_at,
        },
        200,
        { 'cache-control': 'no-store' },
      );
    }
  }

  return jsonError('State save conflict, retry', 409);
}
