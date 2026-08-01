import { jsonError, sameOriginOk } from '../_lib/response.js';
import {
  MEGATON_PAID_GACHA_CHECKOUT_PROTOCOL,
  MEGATON_PAID_GACHA_LINEAGE,
  PRODUCTS_BY_GAME,
  getProduct,
  hasMegatonPaidGachaCheckoutProtocol,
  hasStarsPrice,
  isMegatonPaidGachaProduct,
  megatonPaidGachaCheckoutIsLive,
} from '../_lib/tgProducts.js';
import { verifyTelegramInitData } from '../_lib/telegramAuth.js';
import { assertMegatonPaidGachaStorageReady } from '../_lib/megatonPaidGacha.js';
import {
  recordTelegramPurchase,
  supabaseIsConfigured,
  upsertTelegramPlayer,
} from '../_lib/supabase.js';

async function persistPendingPurchase(env, auth, purchase) {
  await upsertTelegramPlayer(env, auth.user);
  const rows = await recordTelegramPurchase(env, purchase);
  const saved = Array.isArray(rows) && rows.length ? rows[0] : null;
  if (
    !saved
    || saved.payload !== purchase.payload
    || saved.game !== purchase.game
    || saved.product_id !== purchase.product_id
    || String(saved.telegram_user_id || '') !== String(purchase.telegram_user_id)
    || saved.currency !== 'XTR'
    || Number(saved.total_amount) !== Number(purchase.total_amount)
    || saved.status !== 'pending'
  ) {
    const error = new Error('Pending Stars purchase was not durably persisted');
    error.code = 'pending_purchase_not_persisted';
    throw error;
  }
  return saved;
}

export async function onRequestPost({ request, env }) {
  if (!sameOriginOk(request)) return jsonError('bad origin', 403);
  if (!env.TELEGRAM_GAMEBOT_TOKEN) return jsonError('telegram bot token not configured', 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('bad json', 400);
  }

  const gameId = String(body.game || '').toLowerCase();
  if (!Object.hasOwn(PRODUCTS_BY_GAME, gameId)) return jsonError('bad game', 400);

  const productId = String(body.productId || '');
  const product = getProduct(gameId, productId);
  if (!product) return jsonError('bad product', 400);
  if (!hasStarsPrice(product)) return jsonError('bad stars product', 400);
  const paidGachaCheckout = isMegatonPaidGachaProduct(gameId, productId);
  if (
    paidGachaCheckout
    && !hasMegatonPaidGachaCheckoutProtocol(body.checkoutProtocol)
  ) return jsonError('Megaton paid-gacha checkout protocol is required', 409);
  if (paidGachaCheckout && !megatonPaidGachaCheckoutIsLive(env)) {
    return jsonError('Megaton paid-gacha checkout is not live', 503);
  }
  if (paidGachaCheckout && !supabaseIsConfigured(env)) {
    return jsonError('Paid-gacha purchase storage is not configured', 503);
  }

  const initData = String(body.initData || '');
  const auth = await verifyTelegramInitData(initData, env.TELEGRAM_GAMEBOT_TOKEN);
  if (!auth.ok) return jsonError(auth.error, 401);

  const userId = String(auth.user.id);
  if (paidGachaCheckout) {
    try {
      await assertMegatonPaidGachaStorageReady(env, userId);
    } catch (error) {
      console.error('tg-invoice paid-gacha storage readiness failed', error && error.message);
      return jsonError('Paid-gacha purchase storage is not ready', 503);
    }
  }
  const nonce = crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now()) + Math.random().toString(16).slice(2);
  const payload = paidGachaCheckout
    ? [gameId, MEGATON_PAID_GACHA_LINEAGE, productId, userId, Date.now(), nonce].join(':')
    : [gameId, productId, userId, Date.now(), nonce].join(':');

  const pendingPurchase = {
    payload,
    game: gameId,
    product_id: productId,
    telegram_user_id: userId,
    currency: 'XTR',
    total_amount: product.amount,
    status: 'pending',
    raw: {
      source: 'createInvoiceLink',
      ...(paidGachaCheckout ? {
        checkoutProtocol: MEGATON_PAID_GACHA_CHECKOUT_PROTOCOL,
        checkoutLineage: MEGATON_PAID_GACHA_LINEAGE,
      } : {}),
    },
  };

  // A paid-gacha invoice must never become visible to the client unless its
  // pending row is already durable. Otherwise Telegram can charge successfully
  // while neither direct redemption nor reconciliation can find the purchase.
  if (paidGachaCheckout) {
    try {
      await persistPendingPurchase(env, auth, pendingPurchase);
    } catch (error) {
      console.error('tg-invoice paid-gacha pending purchase write failed', error && error.message);
      return jsonError('Paid-gacha purchase storage is unavailable', 503);
    }
  }

  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_GAMEBOT_TOKEN}/createInvoiceLink`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: product.title,
      description: product.description,
      payload,
      provider_token: '',
      currency: 'XTR',
      prices: [{ label: product.title, amount: product.amount }],
    }),
  });
  const data = await res.json().catch(() => null);
  if (!data || !data.ok || !data.result) {
    return jsonError((data && data.description) || 'invoice failed', 502);
  }

  if (!paidGachaCheckout && supabaseIsConfigured(env)) {
    try {
      await persistPendingPurchase(env, auth, pendingPurchase);
    } catch (error) {
      console.warn('tg-invoice pending purchase write failed', error && error.message);
    }
  }

  return Response.json(
    {
      invoiceLink: data.result,
      productId,
      stars: product.amount,
      payload,
      ...(paidGachaCheckout ? {
        checkoutProtocol: MEGATON_PAID_GACHA_CHECKOUT_PROTOCOL,
      } : {}),
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
