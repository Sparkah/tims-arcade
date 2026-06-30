import { safeEqual } from '../_lib/adminAuth.js';
import { json, jsonError, sameOriginOk } from '../_lib/response.js';
import { telegramBotProfile, telegramBotToken } from '../_lib/telegramAuth.js';
import {
  markTelegramBroadcastRecipientBlocked,
  readTelegramBroadcastRecipients,
} from '../_lib/telegramBroadcastRecipients.js';

const MAX_RECIPIENTS = 5000;

function backendSecret(env = {}) {
  return env.TG_BACKEND_SECRET || env.TELEGRAM_BACKEND_SECRET || '';
}

function cleanChatId(value) {
  const raw = String(value || '').trim();
  if (/^@[A-Za-z0-9_]{5,64}$/.test(raw)) return raw;
  if (/^-100\d{5,32}$/.test(raw)) return raw;
  if (/^-?\d{5,32}$/.test(raw)) return raw;
  return '';
}

function cleanMessageId(value) {
  const id = Math.floor(Number(value));
  return Number.isFinite(id) && id > 0 ? id : 0;
}

function isRecipientInactiveError(error) {
  const message = String(error && error.message || '');
  return error && (
    error.status === 403 ||
    /bot was blocked|user is deactivated|can't initiate conversation/i.test(message)
  );
}

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function callBot(env, method, payload, profile) {
  const token = telegramBotToken(env, profile);
  if (!token) {
    const error = new Error(profile === 'test' ? 'telegram_test_bot_token_not_configured' : 'telegram_bot_token_not_configured');
    error.status = 503;
    throw error;
  }
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data || !data.ok) {
    const error = new Error((data && data.description) || `telegram_${method}_failed`);
    error.status = response.ok ? 502 : response.status;
    throw error;
  }
  return data.result;
}

async function copyChannelPostToRecipients(env, body) {
  const profile = telegramBotProfile(body.botProfile);
  const fromChatId = cleanChatId(body.fromChatId);
  const messageId = cleanMessageId(body.messageId);
  if (!fromChatId) return { error: 'bad_from_chat_id', status: 400 };
  if (!messageId) return { error: 'bad_message_id', status: 400 };

  const recipients = await readTelegramBroadcastRecipients(env, profile);
  const maxRecipients = Math.max(1, Math.min(Number(body.maxRecipients) || recipients.length || 1, MAX_RECIPIENTS));
  const selected = recipients.slice(0, maxRecipients);
  const failures = [];
  const messageIds = [];
  let sent = 0;
  let failed = 0;
  let blocked = 0;

  for (const recipient of selected) {
    try {
      const result = await callBot(env, 'copyMessage', {
        chat_id: recipient.chatId,
        from_chat_id: fromChatId,
        message_id: messageId,
        disable_notification: Boolean(body.disableNotification),
      }, profile);
      sent += 1;
      if (result && result.message_id && messageIds.length < 20) {
        messageIds.push({ chatId: recipient.chatId, messageId: result.message_id });
      }
    } catch (error) {
      failed += 1;
      if (isRecipientInactiveError(error)) {
        blocked += 1;
        await markTelegramBroadcastRecipientBlocked(env, profile, recipient.chatId, error.message);
      }
      if (failures.length < 12) {
        failures.push({
          chatId: recipient.chatId,
          username: recipient.username || null,
          status: error.status || 0,
          error: error.message || 'telegram_copy_failed',
        });
      }
    }
  }

  return {
    ok: true,
    action: 'copyChannelPostToRecipients',
    botProfile: profile,
    fromChatId,
    messageId,
    recipients: recipients.length,
    attempted: selected.length,
    limited: recipients.length > selected.length,
    sent,
    failed,
    blocked,
    messageIds,
    failures,
  };
}

export async function onRequestPost({ request, env }) {
  if (!sameOriginOk(request)) return jsonError('Forbidden', 403);

  const configured = backendSecret(env);
  if (!configured) return jsonError('backend_secret_not_configured', 503);
  const supplied = request.headers.get('x-tg-backend-secret') || '';
  if (!supplied || !safeEqual(supplied, configured)) return jsonError('forbidden', 403);

  const body = await readBody(request);
  if (!body || typeof body !== 'object') return jsonError('Invalid JSON body', 400);
  if (body.action !== 'copyChannelPostToRecipients') return jsonError('Unknown action', 400);

  const result = await copyChannelPostToRecipients(env, body);
  if (result && result.error) return jsonError(result.error, result.status || 400);
  return json(result, 200, { 'cache-control': 'no-store' });
}
