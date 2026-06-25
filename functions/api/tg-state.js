import { json, jsonError, sameOriginOk } from '../_lib/response.js';
import { PRODUCTS_BY_GAME } from '../_lib/tgProducts.js';
import { verifyTelegramInitData } from '../_lib/telegramAuth.js';
import {
  getTelegramState,
  supabaseIsConfigured,
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

  const stateBytes = new TextEncoder().encode(JSON.stringify(body.state)).length;
  if (stateBytes > MAX_STATE_BYTES) {
    return jsonError(`State exceeds ${MAX_STATE_BYTES} bytes`, 413);
  }

  const rows = await upsertTelegramState(env, game, auth.user.id, body.state);
  const saved = Array.isArray(rows) && rows.length ? rows[0] : null;
  return json(
    {
      ok: true,
      configured: true,
      stateRev: saved ? saved.state_rev : null,
      updatedAt: saved ? saved.updated_at : null,
    },
    200,
    { 'cache-control': 'no-store' },
  );
}
