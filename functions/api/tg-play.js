import { json, jsonError, sameOriginOk } from '../_lib/response.js';
import { isValidSlug } from '../_lib/validate.js';
import { verifyTelegramInitDataFromEnv } from '../_lib/telegramAuth.js';
import { recordTelegramBroadcastRecipient } from '../_lib/telegramBroadcastRecipients.js';
import { recordTelegramGamePlay } from '../_lib/telegramPlayHistory.js';

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function onRequestPost({ request, env }) {
  if (!sameOriginOk(request)) return jsonError('Forbidden', 403);
  const body = await readBody(request);
  if (!body || typeof body !== 'object') return jsonError('Invalid JSON body', 400);

  const slug = String(body.slug || '').trim();
  if (!isValidSlug(slug)) return jsonError('bad slug', 400);

  const auth = await verifyTelegramInitDataFromEnv(String(body.initData || ''), env);
  if (!auth.ok) {
    return jsonError(
      auth.error === 'missing_bot_token' ? 'telegram bot token not configured' : `Telegram auth failed: ${auth.error}`,
      auth.error === 'missing_bot_token' ? 503 : 401,
    );
  }

  const [played] = await Promise.all([
    recordTelegramGamePlay(env, auth.user, slug, auth.botProfile),
    recordTelegramBroadcastRecipient(env, {
      botProfile: auth.botProfile,
      chatId: auth.user.id,
      user: auth.user,
      source: 'miniapp_play',
    }),
  ]);
  return json({ ok: true, userId: auth.user.id, played }, 200, { 'cache-control': 'no-store' });
}
