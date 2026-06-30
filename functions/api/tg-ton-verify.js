import { json, jsonError, sameOriginOk } from '../_lib/response.js';
import { applyPurchaseGrant } from '../_lib/tgGrants.js';
import { findTonPayment, expectedTonMemo, productForTonOrder, publicTonPurchase } from '../_lib/tonPayments.js';
import { verifyTelegramInitData } from '../_lib/telegramAuth.js';
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

function rowCreatedMs(row) {
  const ms = Date.parse(row && row.created_at || '');
  return Number.isFinite(ms) ? ms : 0;
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
  const payload = String(body.payload || '');
  if (!game || !payload) return jsonError('missing ton order', 400);

  const auth = await verifyTelegramInitData(String(body.initData || ''), env.TELEGRAM_GAMEBOT_TOKEN);
  if (!auth.ok) return jsonError(auth.error, 401);

  await upsertTelegramPlayer(env, auth.user);

  const purchase = await getTelegramPurchase(env, game, auth.user.id, payload);
  if (!purchase) return jsonError('unknown ton order', 404);
  if (purchase.currency !== 'TON') return jsonError('not a ton order', 400);

  const product = productForTonOrder(game, purchase.product_id);
  if (!product) return jsonError('unknown ton product', 400);

  if (purchase.status === 'paid') {
    const grant = await applyPurchaseGrant(env, game, auth.user.id, purchase.product_id, payload);
    return json(
      {
        ok: true,
        paid: true,
        granted: Boolean(grant && grant.granted),
        productId: purchase.product_id,
        purchase: publicTonPurchase(purchase),
        grant,
        state: grant && grant.state || null,
        stateRev: grant && grant.stateRev || null,
        updatedAt: grant && grant.updatedAt || null,
      },
      200,
      { 'cache-control': 'no-store' },
    );
  }

  const memo =
    (purchase.raw && purchase.raw.memo) ||
    expectedTonMemo(game, payload, env);
  const recipient =
    (purchase.raw && purchase.raw.recipient) ||
    (env.MEGATON_TON_RECIPIENT || '');
  if (!memo || !recipient) return jsonError('ton order missing memo', 500);

  let payment = null;
  try {
    payment = await findTonPayment(env, {
      recipient,
      memo,
      nanotons: product.nanotons,
      createdMs: rowCreatedMs(purchase),
    });
  } catch (error) {
    console.warn('tg-ton-verify lookup failed', error && error.message);
    return json(
      { ok: true, paid: false, pending: true, lookupError: 'ton_lookup_failed' },
      200,
      { 'cache-control': 'no-store' },
    );
  }

  if (!payment) {
    return json(
      { ok: true, paid: false, pending: true },
      200,
      { 'cache-control': 'no-store' },
    );
  }

  const rows = await recordTelegramPurchase(env, {
    payload,
    game,
    product_id: purchase.product_id,
    telegram_user_id: auth.user.id,
    currency: 'TON',
    total_amount: product.nanotons,
    provider_payment_charge_id: payment.hash || payment.lt || null,
    status: 'paid',
    raw: {
      ...(purchase.raw || {}),
      source: 'tonapi_verify',
      memo,
      recipient,
      txHash: payment.hash,
      lt: payment.lt,
      utime: payment.utime,
      value: payment.value,
      walletAddress: body.walletAddress || null,
      boc: body.boc || null,
      tonapi: payment.raw,
    },
  });
  const saved = Array.isArray(rows) && rows.length ? rows[0] : null;
  const grant = await applyPurchaseGrant(env, game, auth.user.id, purchase.product_id, payload);

  return json(
    {
      ok: true,
      paid: true,
      granted: Boolean(grant && grant.granted),
      productId: purchase.product_id,
      txHash: payment.hash || null,
      purchase: publicTonPurchase(saved || purchase),
      grant,
      state: grant && grant.state || null,
      stateRev: grant && grant.stateRev || null,
      updatedAt: grant && grant.updatedAt || null,
    },
    200,
    { 'cache-control': 'no-store' },
  );
}
