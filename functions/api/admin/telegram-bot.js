import {
  readTelegramBotConfig,
  writeTelegramBotConfig,
} from '../../_lib/telegramBotConfig.js';
import { requireAdmin } from '../../_lib/adminAuth.js';
import { json, jsonError, sameOriginOk } from '../../_lib/response.js';

function adminJson(body, status = 200) {
  return json(body, status, { 'cache-control': 'no-store' });
}

export function mutationHostAllowed(request) {
  const host = new URL(request.url).hostname.toLowerCase();
  return (
    host === 'game-factory.tech'
    || host === 'www.game-factory.tech'
    || host === 'localhost'
    || host === '127.0.0.1'
  );
}

export async function onRequestGet({ request, env }) {
  const guard = await requireAdmin(request, env);
  if (guard) return guard;
  try {
    const config = await readTelegramBotConfig(env, { strict: true });
    return adminJson({ ok: true, config });
  } catch {
    return jsonError('telegram_bot_config_unavailable', 503);
  }
}

export async function onRequestPost({ request, env }) {
  const guard = await requireAdmin(request, env);
  if (guard) return guard;
  if (!sameOriginOk(request)) return adminJson({ error: 'forbidden' }, 403);
  if (!mutationHostAllowed(request)) return adminJson({ error: 'production_host_required' }, 403);

  let body;
  try {
    body = await request.json();
  } catch {
    return adminJson({ error: 'bad_json' }, 400);
  }

  const rawConfig = body && body.config ? body.config : body;
  try {
    const config = await writeTelegramBotConfig(env, rawConfig, {
      expectedVersion: body && body.expectedVersion,
    });
    return adminJson({ ok: true, config });
  } catch (error) {
    return jsonError(
      error && error.message ? error.message : 'telegram_bot_config_failed',
      error && Number.isInteger(error.status) ? error.status : 500,
    );
  }
}
