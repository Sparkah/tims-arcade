import { json, jsonError, sameOriginOk } from '../_lib/response.js';
import {
  MEGATON_PAID_GACHA_CHECKOUT_PROTOCOL,
  MEGATON_PAID_GACHA_LINEAGE,
  PRODUCTS_BY_GAME,
  hasMegatonPaidGachaCheckoutProtocol,
  isMegatonPaidGachaProduct,
  megatonPaidGachaCheckoutIsLive,
} from '../_lib/tgProducts.js';
import { buildTonOrder } from '../_lib/tonPayments.js';
import { verifyTelegramInitData } from '../_lib/telegramAuth.js';
import { assertMegatonPaidGachaStorageReady } from '../_lib/megatonPaidGacha.js';
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
  const paidGachaCheckout = isMegatonPaidGachaProduct(game, productId);
  if (
    paidGachaCheckout
    && !hasMegatonPaidGachaCheckoutProtocol(body.checkoutProtocol)
  ) return jsonError('Megaton paid-gacha checkout protocol is required', 409);
  if (paidGachaCheckout && !megatonPaidGachaCheckoutIsLive(env)) {
    return jsonError('Megaton paid-gacha checkout is not live', 503);
  }

  const order = buildTonOrder(game, productId, env, body.checkoutProtocol);
  if (!order) return jsonError('bad ton product', 400);

  const auth = await verifyTelegramInitData(String(body.initData || ''), env.TELEGRAM_GAMEBOT_TOKEN);
  if (!auth.ok) return jsonError(auth.error, 401);

  if (paidGachaCheckout) {
    try {
      await assertMegatonPaidGachaStorageReady(env, auth.user.id);
    } catch (error) {
      console.error('tg-ton-order paid-gacha storage readiness failed', error && error.message);
      return jsonError('Paid-gacha purchase storage is not ready', 503);
    }
  }

  const pendingPurchase = {
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
      ...(paidGachaCheckout ? {
        checkoutProtocol: MEGATON_PAID_GACHA_CHECKOUT_PROTOCOL,
        checkoutLineage: MEGATON_PAID_GACHA_LINEAGE,
      } : {}),
    },
  };

  let saved;
  try {
    await upsertTelegramPlayer(env, auth.user);
    const rows = await recordTelegramPurchase(env, pendingPurchase);
    saved = Array.isArray(rows) && rows.length ? rows[0] : null;
  } catch (error) {
    console.error('tg-ton-order pending purchase write failed', error && error.message);
    return jsonError('TON purchase storage is unavailable', 503);
  }
  if (
    !saved
    || saved.payload !== pendingPurchase.payload
    || saved.game !== pendingPurchase.game
    || saved.product_id !== pendingPurchase.product_id
    || String(saved.telegram_user_id || '') !== String(pendingPurchase.telegram_user_id)
    || saved.currency !== 'TON'
    || String(saved.total_amount || '') !== String(pendingPurchase.total_amount)
    || saved.status !== 'pending'
  ) {
    return jsonError('TON purchase storage is unavailable', 503);
  }

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
      ...(paidGachaCheckout ? {
        checkoutProtocol: MEGATON_PAID_GACHA_CHECKOUT_PROTOCOL,
      } : {}),
    },
    200,
    { 'cache-control': 'no-store' },
  );
}
