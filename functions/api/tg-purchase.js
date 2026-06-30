import { json, jsonError, sameOriginOk } from '../_lib/response.js';
import { getProduct, parsePaymentPayload } from '../_lib/tgProducts.js';
import { applyPurchaseGrant } from '../_lib/tgGrants.js';
import { verifyTelegramInitDataFromEnv } from '../_lib/telegramAuth.js';
import {
  getTelegramPurchase,
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

function safeEqual(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
}

function publicPurchase(row) {
  if (!row) return null;
  return {
    payload: row.payload,
    productId: row.product_id,
    currency: row.currency,
    totalAmount: row.total_amount,
    status: row.status,
    paidAt: row.paid_at,
  };
}

async function recordFromBot(request, env, body) {
  const secret = env.TG_BACKEND_SECRET || env.TELEGRAM_BACKEND_SECRET;
  if (!secret) return jsonError('Backend secret is not configured', 503);
  if (!safeEqual(request.headers.get('x-tg-backend-secret'), secret)) {
    return jsonError('Forbidden', 403);
  }

  const purchase = body.purchase || {};
  const parsed = parsePaymentPayload(purchase.payload);
  if (!parsed) return jsonError('Invalid payment payload', 400);

  const product = getProduct(parsed.game, parsed.productId);
  if (!product) return jsonError('Unknown product', 400);

  if (String(purchase.telegram_user_id || purchase.telegramUserId || parsed.telegramUserId) !== parsed.telegramUserId) {
    return jsonError('Payload user mismatch', 400);
  }

  const rawFrom = (purchase.raw && purchase.raw.from) || purchase.from || {};
  await upsertTelegramPlayer(env, {
    id: parsed.telegramUserId,
    username: rawFrom.username || null,
    first_name: rawFrom.first_name || null,
    last_name: rawFrom.last_name || null,
    language_code: rawFrom.language_code || null,
    is_premium: rawFrom.is_premium || false,
  });

  await recordTelegramPurchase(env, {
    payload: purchase.payload,
    game: parsed.game,
    product_id: parsed.productId,
    telegram_user_id: parsed.telegramUserId,
    currency: purchase.currency || 'XTR',
    total_amount: Number(purchase.total_amount || purchase.totalAmount || product.amount),
    telegram_payment_charge_id: purchase.telegram_payment_charge_id || purchase.telegramPaymentChargeId || null,
    provider_payment_charge_id: purchase.provider_payment_charge_id || purchase.providerPaymentChargeId || null,
    status: purchase.status || 'paid',
    raw: purchase.raw || purchase,
  });

  const status = purchase.status || 'paid';
  const grant = status === 'paid'
    ? await applyPurchaseGrant(env, parsed.game, parsed.telegramUserId, parsed.productId, purchase.payload)
    : null;

  return json({ ok: true, grant });
}

async function claimFromClient(body, env) {
  // Accept BOTH bot tokens (prod + test) via verifyTelegramInitDataFromEnv so a purchase claim works whichever
  // bot launched the mini app; the receipt row is keyed by user+payload regardless of bot.
  const auth = await verifyTelegramInitDataFromEnv(body.initData, env);
  if (!auth.ok) return jsonError(`Telegram auth failed: ${auth.error}`, 401);

  const parsed = parsePaymentPayload(body.payload);
  if (!parsed) return jsonError('Invalid payment payload', 400);
  if (parsed.telegramUserId !== auth.user.id) return jsonError('Payload user mismatch', 403);
  if (String(body.game || '') !== parsed.game) return jsonError('Payload game mismatch', 400);

  await upsertTelegramPlayer(env, auth.user);

  const purchase = await getTelegramPurchase(env, parsed.game, auth.user.id, body.payload);
  const paid = Boolean(purchase && purchase.status === 'paid');

  const grant = paid
    ? await applyPurchaseGrant(env, parsed.game, auth.user.id, parsed.productId, body.payload)
    : null;

  return json(
    {
      ok: true,
      paid,
      granted: Boolean(grant && grant.granted),
      productId: parsed.productId,
      purchase: publicPurchase(purchase),
      grant,
      state: grant && grant.state || null,
      stateRev: grant && grant.stateRev || null,
      updatedAt: grant && grant.updatedAt || null,
    },
    200,
    { 'cache-control': 'no-store' },
  );
}

export async function onRequestPost({ request, env }) {
  if (!sameOriginOk(request)) return jsonError('Forbidden', 403);

  if (!supabaseIsConfigured(env)) {
    return json({ ok: false, configured: false, error: 'supabase_not_configured' }, 503);
  }

  const body = await readBody(request);
  if (!body || typeof body !== 'object') return jsonError('Invalid JSON body', 400);

  const action = body.action || 'claim';
  if (action === 'record') return recordFromBot(request, env, body);
  if (action === 'claim') return claimFromClient(body, env);

  return jsonError('Unknown action', 400);
}
