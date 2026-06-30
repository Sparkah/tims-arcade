import { requireAdmin } from '../../_lib/adminAuth.js';
import { json, jsonError, sameOriginOk } from '../../_lib/response.js';
import {
  configuredTelegramBotProfiles,
  telegramBotProfile,
  telegramBotToken,
} from '../../_lib/telegramAuth.js';
import {
  markTelegramBroadcastRecipientBlocked,
  readTelegramBroadcastRecipients,
  telegramBroadcastRecipientStats,
} from '../../_lib/telegramBroadcastRecipients.js';
import { readTelegramGamePlayers } from '../../_lib/telegramPlayHistory.js';

const DEFAULT_CHAT_ID = '@gamefactorytech';
const DEFAULT_DESCRIPTION = 'Indie web games made in public. Fast drops, crates, score chases, leaderboards, updates. First up: Megaton. Next: Bloodtread. Play, break, brag.';
const DEFAULT_PHOTO_URL = 'https://game-factory.tech/tg-megaton/marketing/gamefactory-avatar.png';
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

function noStore(response) {
  response.headers.set('cache-control', 'no-store');
  return response;
}

function adminJson(body, status = 200) {
  return noStore(json(body, status));
}

function botTokenOrThrow(env, profile) {
  const cleanProfile = telegramBotProfile(profile);
  const botToken = telegramBotToken(env, cleanProfile);
  if (botToken) return botToken;
  const error = new Error(cleanProfile === 'test' ? 'telegram_test_bot_token_not_configured' : 'telegram_bot_token_not_configured');
  error.status = 503;
  throw error;
}

function allowedChats(env) {
  const configured = String(env.TELEGRAM_ADMIN_ALLOWED_CHATS || '')
    .split(',')
    .map((item) => normalizeChatAlias(item))
    .filter(Boolean);
  return configured.length ? configured : [DEFAULT_CHAT_ID];
}

function normalizeChatAlias(value) {
  let raw = String(value || '').trim();
  if (!raw) return '';
  raw = raw.replace(/^https?:\/\/t\.me\//i, '@').replace(/^t\.me\//i, '@');
  if (/^@[A-Za-z0-9_]{5,64}$/.test(raw)) return raw;
  if (/^-100\d{5,32}$/.test(raw)) return raw;
  return '';
}

function chatIdFrom(body, env) {
  const requested = normalizeChatAlias(body && body.chatId) || DEFAULT_CHAT_ID;
  return allowedChats(env).includes(requested) ? requested : '';
}

function cleanText(value, max) {
  return String(value || '').replace(/\r\n/g, '\n').trim().slice(0, max);
}

function cleanParseMode(value) {
  const mode = String(value || '').trim();
  return ['HTML', 'MarkdownV2', 'Markdown'].includes(mode) ? mode : undefined;
}

function cleanHttpsUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function cleanGameSlug(value) {
  const slug = String(value || '').trim().toLowerCase();
  return /^[a-z0-9_-]{1,80}$/.test(slug) ? slug : '';
}

function broadcastSegmentFrom(body) {
  const raw = body && body.broadcastSegment && typeof body.broadcastSegment === 'object'
    ? body.broadcastSegment
    : {};
  const type = raw.type === 'playedGame' ? 'playedGame' : 'all';
  const gameSlug = cleanGameSlug(raw.gameSlug);
  if (type === 'playedGame' && gameSlug) return { type, gameSlug };
  return { type: 'all', gameSlug: '' };
}

function replyMarkupFrom(body) {
  const rows = [];
  if (body && body.buttonText && body.buttonUrl) {
    const text = cleanText(body.buttonText, 64);
    const url = cleanHttpsUrl(body.buttonUrl);
    if (text && url) rows.push([{ text, url }]);
  }
  if (body && Array.isArray(body.buttons)) {
    for (const row of body.buttons.slice(0, 6)) {
      const src = Array.isArray(row) ? row : [row];
      const out = [];
      for (const button of src.slice(0, 4)) {
        const text = cleanText(button && button.text, 64);
        const url = cleanHttpsUrl(button && button.url);
        if (text && url) out.push({ text, url });
      }
      if (out.length) rows.push(out);
    }
  }
  return rows.length ? { inline_keyboard: rows } : undefined;
}

function sendMessagePayloadFrom(body, chatId) {
  const text = cleanText(body.text, 4096);
  if (!text) {
    const error = new Error('empty_text');
    error.status = 400;
    throw error;
  }
  const payload = {
    chat_id: chatId,
    text,
    disable_notification: Boolean(body.disableNotification),
    disable_web_page_preview: Boolean(body.disableWebPagePreview),
  };
  const parseMode = cleanParseMode(body.parseMode);
  const replyMarkup = replyMarkupFrom(body);
  if (parseMode) payload.parse_mode = parseMode;
  if (replyMarkup) payload.reply_markup = replyMarkup;
  return payload;
}

async function callBot(env, method, payload, profile) {
  const botToken = botTokenOrThrow(env, profile);
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
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

function isRecipientInactiveError(error) {
  const message = String(error && error.message || '');
  return error && (
    error.status === 403 ||
    /bot was blocked|user is deactivated|chat not found|can't initiate conversation/i.test(message)
  );
}

async function broadcastMessage(env, body, profile) {
  if (body.confirmBroadcast !== true) {
    const error = new Error('broadcast_confirmation_required');
    error.status = 400;
    throw error;
  }

  const basePayload = sendMessagePayloadFrom(body, '0');
  const segment = broadcastSegmentFrom(body);
  let recipients = await readTelegramBroadcastRecipients(env, profile);
  if (segment.type === 'playedGame') {
    const gamePlayers = await readTelegramGamePlayers(env, segment.gameSlug);
    const playerIds = new Set(gamePlayers.map((row) => row.telegramUserId));
    recipients = recipients.filter((recipient) => playerIds.has(String(recipient.telegramUserId || recipient.chatId || '')));
  }
  const maxRecipients = Math.max(1, Math.min(Number(body.maxRecipients) || recipients.length || 1, 5000));
  const selected = recipients.slice(0, maxRecipients);
  const failures = [];
  const messageIds = [];
  let sent = 0;
  let failed = 0;
  let blocked = 0;

  for (const recipient of selected) {
    const payload = { ...basePayload, chat_id: recipient.chatId };
    try {
      const result = await callBot(env, 'sendMessage', payload, profile);
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
          error: error.message || 'telegram_send_failed',
        });
      }
    }
  }

  return {
    action: 'broadcastMessage',
    botProfile: profile,
    segment,
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

async function callBotForm(env, method, form, profile) {
  const botToken = botTokenOrThrow(env, profile);
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: 'POST',
    body: form,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data || !data.ok) {
    const error = new Error((data && data.description) || `telegram_${method}_failed`);
    error.status = response.ok ? 502 : response.status;
    throw error;
  }
  return data.result;
}

async function botGet(env, method, params = {}, profile) {
  const botToken = botTokenOrThrow(env, profile);
  const url = new URL(`https://api.telegram.org/bot${botToken}/${method}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url.toString(), { method: 'GET' });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data || !data.ok) {
    const error = new Error((data && data.description) || `telegram_${method}_failed`);
    error.status = response.ok ? 502 : response.status;
    throw error;
  }
  return data.result;
}

async function setChatPhoto(env, chatId, photoUrl, profile) {
  const safePhotoUrl = cleanHttpsUrl(photoUrl || DEFAULT_PHOTO_URL);
  if (!safePhotoUrl) {
    const error = new Error('bad_photo_url');
    error.status = 400;
    throw error;
  }
  const image = await fetch(safePhotoUrl);
  if (!image.ok) {
    const error = new Error('photo_fetch_failed');
    error.status = 400;
    throw error;
  }
  const type = image.headers.get('content-type') || 'image/png';
  if (!type.startsWith('image/')) {
    const error = new Error('photo_must_be_image');
    error.status = 400;
    throw error;
  }
  const size = Number(image.headers.get('content-length') || 0);
  if (size > MAX_PHOTO_BYTES) {
    const error = new Error('photo_too_large');
    error.status = 400;
    throw error;
  }
  const buffer = await image.arrayBuffer();
  if (buffer.byteLength > MAX_PHOTO_BYTES) {
    const error = new Error('photo_too_large');
    error.status = 400;
    throw error;
  }
  const form = new FormData();
  form.set('chat_id', chatId);
  form.set('photo', new Blob([buffer], { type }), 'gamefactory-avatar.png');
  return callBotForm(env, 'setChatPhoto', form, profile);
}

async function handleAction(env, body) {
  const action = String(body.action || '').trim();
  const profile = telegramBotProfile(body.botProfile);

  if (action === 'broadcastStatus') {
    const stats = await telegramBroadcastRecipientStats(env, profile);
    return { action, botProfile: profile, broadcastRecipients: stats };
  }

  if (action === 'broadcastMessage') {
    return broadcastMessage(env, body, profile);
  }

  const chatId = chatIdFrom(body, env);
  if (!chatId) {
    const error = new Error('chat_not_allowed');
    error.status = 403;
    throw error;
  }

  if (action === 'sendMessage') {
    const payload = sendMessagePayloadFrom(body, chatId);
    const result = await callBot(env, 'sendMessage', payload, profile);
    if (body.pin === true && result && result.message_id) {
      await callBot(env, 'pinChatMessage', {
        chat_id: chatId,
        message_id: result.message_id,
        disable_notification: Boolean(body.disableNotification),
      }, profile);
    }
    return { action, chatId, botProfile: profile, messageId: result && result.message_id, result };
  }

  if (action === 'sendPhoto') {
    const photo = cleanHttpsUrl(body.photoUrl || DEFAULT_PHOTO_URL);
    const caption = cleanText(body.caption, 1024);
    if (!photo) {
      const error = new Error('bad_photo_url');
      error.status = 400;
      throw error;
    }
    const payload = {
      chat_id: chatId,
      photo,
      caption,
      disable_notification: Boolean(body.disableNotification),
    };
    const parseMode = cleanParseMode(body.parseMode);
    const replyMarkup = replyMarkupFrom(body);
    if (parseMode) payload.parse_mode = parseMode;
    if (replyMarkup) payload.reply_markup = replyMarkup;
    const result = await callBot(env, 'sendPhoto', payload, profile);
    return { action, chatId, botProfile: profile, messageId: result && result.message_id, result };
  }

  if (action === 'setDescription') {
    const description = cleanText(body.description || DEFAULT_DESCRIPTION, 255);
    if (!description) {
      const error = new Error('empty_description');
      error.status = 400;
      throw error;
    }
    await callBot(env, 'setChatDescription', { chat_id: chatId, description }, profile);
    return { action, chatId, botProfile: profile, description };
  }

  if (action === 'setPhoto') {
    const result = await setChatPhoto(env, chatId, body.photoUrl, profile);
    return { action, chatId, botProfile: profile, result };
  }

  if (action === 'setupChannel') {
    const description = cleanText(body.description || DEFAULT_DESCRIPTION, 255);
    const results = [];
    if (description) {
      await callBot(env, 'setChatDescription', { chat_id: chatId, description }, profile);
      results.push({ action: 'setDescription', ok: true });
    }
    if (body.photoUrl !== false) {
      await setChatPhoto(env, chatId, body.photoUrl || DEFAULT_PHOTO_URL, profile);
      results.push({ action: 'setPhoto', ok: true });
    }
    return { action, chatId, botProfile: profile, results };
  }

  const error = new Error('bad_action');
  error.status = 400;
  throw error;
}

export async function onRequestGet({ request, env }) {
  const guard = await requireAdmin(request, env);
  if (guard) return guard;
  const url = new URL(request.url);
  const profile = telegramBotProfile(url.searchParams.get('botProfile'));
  const chatId = chatIdFrom({ chatId: url.searchParams.get('chatId') }, env);
  if (!chatId) return noStore(jsonError('chat_not_allowed', 403));

  try {
    const [bot, chat, admins, broadcastRecipients] = await Promise.all([
      botGet(env, 'getMe', {}, profile),
      botGet(env, 'getChat', { chat_id: chatId }, profile),
      botGet(env, 'getChatAdministrators', { chat_id: chatId }, profile).catch(() => []),
      telegramBroadcastRecipientStats(env, profile),
    ]);
    const botId = bot && bot.id;
    const botAdmin = Array.isArray(admins)
      ? admins.find((row) => row && row.user && row.user.id === botId) || null
      : null;
    return adminJson({
      ok: true,
      chatId,
      botProfile: profile,
      availableBotProfiles: configuredTelegramBotProfiles(env),
      allowedChats: allowedChats(env),
      broadcastRecipients,
      bot: bot ? { id: bot.id, username: bot.username, first_name: bot.first_name } : null,
      chat: chat ? {
        id: chat.id,
        title: chat.title,
        username: chat.username,
        type: chat.type,
        description: chat.description || '',
        linked_chat_id: chat.linked_chat_id || null,
      } : null,
      botAdmin: botAdmin ? {
        status: botAdmin.status,
        can_post_messages: Boolean(botAdmin.can_post_messages),
        can_edit_messages: Boolean(botAdmin.can_edit_messages),
        can_change_info: Boolean(botAdmin.can_change_info),
        can_pin_messages: Boolean(botAdmin.can_pin_messages),
      } : null,
      defaults: {
        description: DEFAULT_DESCRIPTION,
        photoUrl: DEFAULT_PHOTO_URL,
      },
    });
  } catch (error) {
    return noStore(jsonError(error.message || 'telegram_status_failed', error.status || 502));
  }
}

export async function onRequestPost({ request, env }) {
  const guard = await requireAdmin(request, env);
  if (guard) return guard;
  if (!sameOriginOk(request)) return noStore(jsonError('forbidden', 403));

  let body;
  try {
    body = await request.json();
  } catch {
    return noStore(jsonError('bad_json', 400));
  }

  try {
    const result = await handleAction(env, body || {});
    return adminJson({ ok: true, ...result });
  } catch (error) {
    return noStore(jsonError(error.message || 'telegram_action_failed', error.status || 502));
  }
}
