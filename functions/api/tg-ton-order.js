import { json, jsonError, sameOriginOk } from '../_lib/response.js';
import { PRODUCTS_BY_GAME } from '../_lib/tgProducts.js';
import { buildTonOrder } from '../_lib/tonPayments.js';
import { checkUserRate } from '../_lib/rateLimit.js';
import { verifyTelegramInitData } from '../_lib/telegramAuth.js';
import {
  recordTelegramPurchase,
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

export async function onRequestPost({ request, env }) {
  if (!sameOriginOk(request)) return jsonError('Forbidden', 403);
  if (!env.TELEGRAM_GAMEBOT_TOKEN) return jsonError('telegram bot token not configured', 503);
  if (!supabaseIsConfigured(env)) {
    return json({ ok: false, configured: false, error: 'supabase_not_configured' }, 503);
  }

  const body = await readBody(request);
  if (!body || typeof body !== 'object') return jsonError('Invalid JSON body', 400);

  const game = String(body.game || '').toLowerCase();
  if (!Object.hasOwn(PRODUCTS_BY_GAME, game)) return jsonError('bad game', 400);

  const productId = String(body.productId || '');
  const order = buildTonOrder(game, productId, env);
  if (!order) return jsonError('bad ton product', 400);

  const auth = await verifyTelegramInitData(String(body.initData || ''), env.TELEGRAM_GAMEBOT_TOKEN);
  if (!auth.ok) return jsonError(auth.error, 401);

  // Rate limit AFTER auth (verified user, IP fallback), BEFORE the Supabase writes below.
  const rlId = auth.user && auth.user.id
    ? `u:${auth.user.id}`
    : `ip:${request.headers.get('cf-connecting-ip') || 'unknown'}`;
  if (!await checkUserRate(env, 'tg-ton-order', rlId, { perSec: 3, perMin: 20 })) {
    return jsonError('rate limit', 429);
  }

  await upsertTelegramPlayer(env, auth.user);
  await recordTelegramPurchase(env, {
    payload: order.payload,
    game,
    product_id: productId,
    telegram_user_id: auth.user.id,
    currency: 'TON',
    total_amount: order.nanotons,
    status: 'pending',
    raw: {
      source: 'tonconnect_order',
      memo: order.memo,
      recipient: order.recipient,
      network: order.network,
      ton: order.ton,
      validUntil: order.validUntil,
    },
  });

  return json(
    {
      ok: true,
      game,
      productId,
      title: order.title,
      recipient: order.recipient,
      network: order.network,
      ton: order.ton,
      nanotons: order.nanotons,
      payload: order.payload,
      memo: order.memo,
      payloadBoc: order.payloadBoc,
      validUntil: order.validUntil,
    },
    200,
    { 'cache-control': 'no-store' },
  );
}
