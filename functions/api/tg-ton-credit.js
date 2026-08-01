import { json, jsonError, sameOriginOk } from '../_lib/response.js';
import { applyPurchaseGrant, isServerGrantable } from '../_lib/tgGrants.js';
import {
  paidGachaSpec,
  publicPaidGachaReceipt,
  redeemMegatonPaidGacha,
  rollMegatonPaidProduct,
} from '../_lib/megatonPaidGacha.js';
import {
  MEGATON_PAID_GACHA_CHECKOUT_PROTOCOL,
  PRODUCTS_BY_GAME,
  getProduct,
  hasMegatonPaidGachaCheckoutProtocol,
  hasTonPrice,
  megatonPaidGachaCutoverMs,
  purchaseHasMegatonPaidGachaLineage,
} from '../_lib/tgProducts.js';
import { verifyTelegramInitData } from '../_lib/telegramAuth.js';
import { validateVerifiedPurchase } from '../_lib/tgVerifiedPurchase.js';
import {
  formatTon,
  getTelegramState,
  normalizeNanotons,
  supabaseIsConfigured,
  supabaseRequest,
  upsertTelegramPlayer,
} from '../_lib/supabase.js';

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function balanceResponse(game, state) {
  const server = state && state.__server && typeof state.__server === 'object' ? state.__server : {};
  const creditNanotons = normalizeNanotons(server.tonCreditNanotons).toString();
  return {
    ok: true,
    configured: true,
    game,
    creditTon: formatTon(creditNanotons),
    creditNanotons,
    inGameOnly: true,
  };
}

async function authenticate(body, env) {
  const auth = await verifyTelegramInitData(String(body.initData || ''), env.TELEGRAM_GAMEBOT_TOKEN);
  if (!auth.ok) return { error: jsonError(`Telegram auth failed: ${auth.error}`, 401) };
  await upsertTelegramPlayer(env, auth.user);
  return { user: auth.user };
}

function errorDetail(error) {
  return `${error && error.message || ''} ${JSON.stringify(error && error.body || {})}`;
}

function migrationIsMissing(error) {
  return /spend_megaton_ton_credit|redeem_megaton_paid_gacha|telegram_megaton_paid/i.test(errorDetail(error))
    && /PGRST202|schema cache|does not exist|could not find/i.test(errorDetail(error));
}

function insufficientCredit(error) {
  const match = errorDetail(error).match(/insufficient_ton_credit:(\d+):(\d+)/i);
  return match ? { balance: BigInt(match[1]), required: BigInt(match[2]) } : null;
}

async function spendTonCredit(
  env,
  telegramUserId,
  productId,
  requestId,
  checkoutProtocol,
  cutoverAt,
) {
  const rows = await supabaseRequest(env, 'rpc/spend_megaton_ton_credit', {
    method: 'POST',
    headers: { prefer: 'return=representation' },
    body: JSON.stringify({
      p_telegram_user_id: String(telegramUserId),
      p_product_id: productId,
      p_request_id: requestId,
      p_checkout_protocol: checkoutProtocol,
      p_cutover_at: cutoverAt,
    }),
  });
  return Array.isArray(rows) && rows.length ? rows[0] : null;
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
  if (!Object.hasOwn(PRODUCTS_BY_GAME, game) || game !== 'megaton') return jsonError('bad game', 400);

  const requestedAction = String(body.action || 'balance');
  if (requestedAction === 'spend') {
    const requestedProductId = String(body.productId || '');
    if (
      paidGachaSpec(requestedProductId)
      && !hasMegatonPaidGachaCheckoutProtocol(body.checkoutProtocol)
    ) return jsonError('Megaton paid-gacha checkout protocol is required', 409);
  }

  const auth = await authenticate(body, env);
  if (auth.error) return auth.error;

  const action = requestedAction;
  if (action === 'balance') {
    const stateRow = await getTelegramState(env, game, auth.user.id);
    return json(balanceResponse(game, stateRow && stateRow.state), 200, { 'cache-control': 'no-store' });
  }

  if (action !== 'spend') return jsonError('Unknown action', 400);

  const productId = String(body.productId || '');
  const product = getProduct(game, productId);
  if (!product || !hasTonPrice(product)) return jsonError('bad TON product', 400);
  const priceNanotons = normalizeNanotons(product.nanotons);
  if (!priceNanotons) return jsonError('bad TON product price', 400);
  const hasPaidRoll = Boolean(paidGachaSpec(productId));
  const hasDeterministicGrant = isServerGrantable(game, productId);
  if (!hasPaidRoll && !hasDeterministicGrant) {
    return jsonError('TON credit product is not server-fulfillable', 422);
  }
  if (
    hasPaidRoll
    && !hasMegatonPaidGachaCheckoutProtocol(body.checkoutProtocol)
  ) return jsonError('Megaton paid-gacha checkout protocol is required', 409);

  const requestId = String(body.requestId || '');
  if (!/^[A-Za-z0-9_-]{8,96}$/.test(requestId)) {
    return jsonError('Invalid TON credit request id', 400);
  }
  const cutover = hasPaidRoll ? megatonPaidGachaCutoverMs(env) : NaN;
  if (hasPaidRoll && (!Number.isFinite(cutover) || Date.now() < cutover)) {
    return json(
      { ok: false, error: 'megaton_paid_gacha_cutover_not_configured' },
      503,
      { 'cache-control': 'no-store' },
    );
  }

  let spend;
  try {
    spend = await spendTonCredit(
      env,
      auth.user.id,
      productId,
      requestId,
      hasPaidRoll ? MEGATON_PAID_GACHA_CHECKOUT_PROTOCOL : '',
      hasPaidRoll ? new Date(cutover).toISOString() : null,
    );
  } catch (error) {
    const insufficient = insufficientCredit(error);
    if (insufficient) {
      return json({
        ok: false,
        configured: true,
        game,
        status: 'insufficient_credit',
        creditTon: formatTon(insufficient.balance),
        creditNanotons: insufficient.balance.toString(),
        requiredTon: formatTon(insufficient.required),
        requiredNanotons: insufficient.required.toString(),
      }, 402, { 'cache-control': 'no-store' });
    }
    if (migrationIsMissing(error)) {
      return json(
        { ok: false, error: 'megaton_paid_gacha_not_migrated' },
        503,
        { 'cache-control': 'no-store' },
      );
    }
    if (/ton_credit_request_conflict/i.test(errorDetail(error))) {
      return jsonError('TON credit request id conflicts with an existing spend', 409);
    }
    console.error('Megaton TON credit spend failed', error && error.message || error);
    return jsonError('TON credit spend failed', 500);
  }

  const validation = validateVerifiedPurchase(spend, {
    game,
    productId,
    telegramUserId: auth.user.id,
    payload: spend && spend.payload,
  });
  if (!validation.ok) {
    return jsonError(`TON credit purchase verification failed: ${validation.error}`, 409);
  }
  if (hasPaidRoll && !purchaseHasMegatonPaidGachaLineage(spend)) {
    return jsonError('TON credit purchase has invalid Megaton paid-gacha lineage', 409);
  }
  if (hasPaidRoll && Date.parse(spend.paid_at) < cutover) {
    return jsonError('TON credit purchase predates the paid-gacha cutover', 409);
  }

  let grant = null;
  if (hasDeterministicGrant) {
    grant = await applyPurchaseGrant(env, game, auth.user.id, productId, spend.payload);
    if (!grant || !grant.granted) {
      return jsonError('TON credit grant conflict, retry the same request id', 409);
    }
  }

  let receipt = null;
  if (hasPaidRoll) {
    try {
      receipt = publicPaidGachaReceipt(await redeemMegatonPaidGacha(
        env,
        spend,
        rollMegatonPaidProduct(productId),
        new Date(cutover).toISOString(),
      ));
    } catch (error) {
      if (migrationIsMissing(error)) {
        return json(
          { ok: false, error: 'megaton_paid_gacha_not_migrated' },
          503,
          { 'cache-control': 'no-store' },
        );
      }
      console.error('Megaton TON credit paid-gacha redemption failed', error && error.message || error);
      return jsonError('TON credit paid roll failed; retry the same request id', 500);
    }
    if (!receipt) return jsonError('TON credit paid roll receipt was not returned', 500);
  }

  const creditNanotons = String(spend.credit_nanotons ?? '0');
  const state = grant && grant.state || spend.player_state || null;
  const stateRev = grant && grant.stateRev != null
    ? grant.stateRev
    : (spend.state_rev ?? null);
  return json({
    ok: true,
    configured: true,
    game,
    paid: true,
    source: 'TON_CREDIT',
    productId,
    payload: spend.payload,
    requestId,
    state,
    stateRev,
    serverGrantApplied: Boolean(grant && grant.granted),
    grant,
    receipt,
    idempotent: Boolean(spend.idempotent),
    creditTon: formatTon(creditNanotons),
    creditNanotons,
    spentTon: formatTon(priceNanotons),
    spentNanotons: priceNanotons.toString(),
    inGameOnly: true,
  }, 200, { 'cache-control': 'no-store' });
}
