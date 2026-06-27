import { json, jsonError, sameOriginOk } from '../_lib/response.js';
import { PRODUCTS_BY_GAME } from '../_lib/tgProducts.js';
import { verifyTelegramInitData } from '../_lib/telegramAuth.js';
import {
  supabaseIsConfigured,
  upsertTelegramPlayer,
} from '../_lib/supabase.js';

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function publicOrigin(request, env) {
  const configured = String(env.PUBLIC_ORIGIN || env.SITE_ORIGIN || '').replace(/\/+$/, '');
  if (configured) return configured;
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

function safeSkinId(value) {
  const id = String(value || '').trim();
  return /^[a-z0-9_]{2,80}$/i.test(id) ? id : '';
}

function baseAssetId(skinId) {
  return skinId.replace(/_[0-9]{3}$/, '');
}

export async function onRequestPost({ request, env }) {
  if (!sameOriginOk(request)) return jsonError('Forbidden', 403);
  if (!env.TELEGRAM_GAMEBOT_TOKEN) return jsonError('telegram bot token not configured', 503);

  const body = await readBody(request);
  if (!body || typeof body !== 'object') return jsonError('Invalid JSON body', 400);
  const game = String(body.game || '').toLowerCase();
  if (!Object.hasOwn(PRODUCTS_BY_GAME, game) || game !== 'megaton') return jsonError('bad game', 400);

  const auth = await verifyTelegramInitData(String(body.initData || ''), env.TELEGRAM_GAMEBOT_TOKEN);
  if (!auth.ok) return jsonError(`Telegram auth failed: ${auth.error}`, 401);
  if (supabaseIsConfigured(env)) await upsertTelegramPlayer(env, auth.user);

  const skinId = safeSkinId(body.skinId);
  if (!skinId) return jsonError('bad skin id', 400);
  const skinName = String(body.skinName || 'Megaton payload').slice(0, 64);
  const text = String(body.text || `I pulled ${skinName} in Megaton.`).slice(0, 900);
  const origin = publicOrigin(request, env);
  const gifUrl = `${origin}/tg-megaton/game/assets/gacha/anim_gifs/${skinId}.gif`;
  const thumbUrl = `${origin}/tg-megaton/game/assets/gacha/icons_alpha/${baseAssetId(skinId)}.png`;

  const telegramResponse = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_GAMEBOT_TOKEN}/savePreparedInlineMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      user_id: auth.user.id,
      result: {
        type: 'gif',
        id: `megaton_${skinId}`.slice(0, 64),
        gif_url: gifUrl,
        thumbnail_url: thumbUrl,
        title: skinName,
        caption: text,
        reply_markup: {
          inline_keyboard: [[
            { text: 'Open Megaton', url: 'https://t.me/gamesfactorybot/megaton' },
          ]],
        },
      },
      allow_user_chats: true,
      allow_bot_chats: true,
      allow_group_chats: true,
      allow_channel_chats: true,
    }),
  });
  const data = await telegramResponse.json().catch(() => null);
  if (!data || !data.ok || !data.result || !data.result.id) {
    return jsonError((data && data.description) || 'share prepare failed', 502);
  }

  return json(
    {
      ok: true,
      preparedMessageId: data.result.id,
      expiresAt: data.result.expiration_date || null,
    },
    200,
    { 'cache-control': 'no-store' },
  );
}
