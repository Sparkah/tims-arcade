import {
  readTelegramBotConfig,
  writeTelegramBotConfig,
} from '../../_lib/telegramBotConfig.js';
import { requireAdmin } from '../../_lib/adminAuth.js';
import { json, jsonError, sameOriginOk } from '../../_lib/response.js';

function adminJson(body, status = 200) {
  return json(body, status, { 'cache-control': 'no-store' });
}

export async function onRequestGet({ request, env }) {
  const guard = await requireAdmin(request, env);
  if (guard) return guard;
  const config = await readTelegramBotConfig(env);
  return adminJson({ ok: true, config });
}

export async function onRequestPost({ request, env }) {
  const guard = await requireAdmin(request, env);
  if (guard) return guard;
  if (!sameOriginOk(request)) return adminJson({ error: 'forbidden' }, 403);

  let body;
  try {
    body = await request.json();
  } catch {
    return adminJson({ error: 'bad_json' }, 400);
  }

  const rawConfig = body && body.config ? body.config : body;
  try {
    const config = await writeTelegramBotConfig(env, rawConfig);
    return adminJson({ ok: true, config });
  } catch (error) {
    return jsonError(error && error.message ? error.message : 'telegram_bot_config_failed', 500);
  }
}
