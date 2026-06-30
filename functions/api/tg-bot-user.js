import { safeEqual } from '../_lib/adminAuth.js';
import { json, jsonError, sameOriginOk } from '../_lib/response.js';
import {
  optOutTelegramBroadcastRecipient,
  recordTelegramBroadcastRecipient,
} from '../_lib/telegramBroadcastRecipients.js';

function backendSecret(env = {}) {
  return env.TG_BACKEND_SECRET || env.TELEGRAM_BACKEND_SECRET || '';
}

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function privateChatIdFrom(body) {
  const chat = body && body.chat && typeof body.chat === 'object' ? body.chat : {};
  const user = body && body.user && typeof body.user === 'object' ? body.user : {};
  return String(body.chatId || chat.id || user.id || '').trim();
}

export async function onRequestPost({ request, env }) {
  if (!sameOriginOk(request)) return jsonError('Forbidden', 403);

  const configured = backendSecret(env);
  if (!configured) return jsonError('backend_secret_not_configured', 503);
  const supplied = request.headers.get('x-tg-backend-secret') || '';
  if (!supplied || !safeEqual(supplied, configured)) return jsonError('forbidden', 403);

  const body = await readBody(request);
  if (!body || typeof body !== 'object') return jsonError('Invalid JSON body', 400);

  const action = String(body.action || 'record').trim();
  if (action === 'record') {
    const recipient = await recordTelegramBroadcastRecipient(env, {
      botProfile: body.botProfile,
      chat: body.chat,
      chatId: body.chatId,
      user: body.user,
      source: body.source || 'bot_message',
      reactivate: Boolean(body.reactivate),
    });
    return json({ ok: true, recorded: Boolean(recipient), recipient }, 200, { 'cache-control': 'no-store' });
  }

  if (action === 'optOut') {
    const recipient = await optOutTelegramBroadcastRecipient(
      env,
      body.botProfile,
      privateChatIdFrom(body),
      body.reason || 'user_stop',
    );
    return json({ ok: true, optedOut: Boolean(recipient), recipient }, 200, { 'cache-control': 'no-store' });
  }

  return jsonError('Unknown action', 400);
}
