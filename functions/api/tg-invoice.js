import { jsonError, sameOriginOk } from '../_lib/response.js';
import { getProduct, hasStarsPrice, PRODUCTS_BY_GAME } from '../_lib/tgProducts.js';
import { verifyTelegramInitData } from '../_lib/telegramAuth.js';
import {
  recordTelegramPurchase,
  supabaseIsConfigured,
  upsertTelegramPlayer,
} from '../_lib/supabase.js';

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

  const initData = String(body.initData || '');
  const auth = await verifyTelegramInitData(initData, env.TELEGRAM_GAMEBOT_TOKEN);
  if (!auth.ok) return jsonError(auth.error, 401);

  const userId = String(auth.user.id);
  const nonce = crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now()) + Math.random().toString(16).slice(2);
  const payload = [gameId, productId, userId, Date.now(), nonce].join(':');

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

  if (supabaseIsConfigured(env)) {
    try {
      await upsertTelegramPlayer(env, auth.user);
      await recordTelegramPurchase(env, {
        payload,
        game: gameId,
        product_id: productId,
        telegram_user_id: userId,
        currency: 'XTR',
        total_amount: product.amount,
        status: 'pending',
        raw: { source: 'createInvoiceLink' },
      });
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
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
