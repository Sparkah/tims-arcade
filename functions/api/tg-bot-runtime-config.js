import { readTelegramBotConfig } from '../_lib/telegramBotConfig.js';
import { json, jsonError } from '../_lib/response.js';
import { safeEqual } from '../_lib/adminAuth.js';

function backendSecret(env = {}) {
  return env.TG_BACKEND_SECRET || env.TELEGRAM_BACKEND_SECRET || '';
}

export async function onRequestGet({ request, env }) {
  const configured = backendSecret(env);
  if (!configured) return jsonError('backend_secret_not_configured', 503);
  const supplied = request.headers.get('x-tg-backend-secret') || '';
  if (!supplied || !safeEqual(supplied, configured)) return jsonError('forbidden', 403);
  return json(await readTelegramBotConfig(env), 200, { 'cache-control': 'no-store' });
}
