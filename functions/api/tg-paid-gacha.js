import { json, jsonError, sameOriginOk } from '../_lib/response.js';
import { applyPurchaseGrant } from '../_lib/tgGrants.js';
import { verifyTelegramInitDataFromEnv } from '../_lib/telegramAuth.js';
import {
  hasMegatonPaidGachaCheckoutProtocol,
  purchaseHasMegatonPaidGachaLineage,
} from '../_lib/tgProducts.js';
import { validateVerifiedPurchase } from '../_lib/tgVerifiedPurchase.js';
import {
  getTelegramPurchase,
  supabaseIsConfigured,
  upsertTelegramPlayer,
} from '../_lib/supabase.js';
import {
  getPaidMegatonInventorySnapshot,
  listPaidMegatonGachaPurchases,
  MEGATON_PAID_RECONCILE_LIMIT,
  paidGachaSpec,
  publicPaidGachaReceipt,
  redeemMegatonPaidGacha,
  rollMegatonPaidProduct,
} from '../_lib/megatonPaidGacha.js';

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function migrationIsMissing(error) {
  const detail = `${error && error.message || ''} ${JSON.stringify(error && error.body || {})}`;
  return /redeem_megaton_paid_gacha|list_unredeemed_megaton_paid_gacha|telegram_megaton_paid/i.test(detail)
    && /PGRST202|schema cache|does not exist|could not find/i.test(detail);
}

function paidGachaCutover(env) {
  const raw = String(env.MEGATON_PAID_GACHA_CUTOVER_AT || '').trim();
  const timestamp = Date.parse(raw);
  return raw && Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '';
}

function purchaseIsAfterCutover(purchase, cutoverAt) {
  const paidAt = Date.parse(String(purchase && purchase.paid_at || ''));
  const cutover = Date.parse(String(cutoverAt || ''));
  return Number.isFinite(paidAt) && Number.isFinite(cutover) && paidAt >= cutover;
}

function clientProposedReward(body) {
  return ['rolls', 'inventory', 'ownedSkins', 'skinCopies', 'gachaState']
    .some((key) => Object.hasOwn(body, key));
}

function inventoryHasUnexpectedInput(body) {
  const allowed = new Set(['action', 'game', 'initData', 'checkoutProtocol']);
  return Object.keys(body).some((key) => !allowed.has(key));
}

function validatePaidGachaPurchase(purchase, telegramUserId) {
  if (!purchase || purchase.status !== 'paid') return 'purchase_not_paid';
  const productId = String(purchase.product_id || '');
  if (!paidGachaSpec(productId)) return 'purchase_has_no_paid_roll';
  const validation = validateVerifiedPurchase(purchase, {
    game: 'megaton',
    productId,
    telegramUserId,
    payload: purchase.payload,
  });
  if (!validation.ok) return validation.error;
  return purchaseHasMegatonPaidGachaLineage(purchase)
    ? ''
    : 'purchase_has_no_server_checkout_lineage';
}

async function ensureStarterGrant(env, purchase) {
  if (String(purchase && purchase.product_id || '') !== 'starter') {
    return {
      serverGrantApplied: true,
      state: null,
      stateRev: null,
      updatedAt: null,
      grant: null,
    };
  }

  let grant;
  try {
    grant = await applyPurchaseGrant(
      env,
      'megaton',
      purchase.telegram_user_id,
      purchase.product_id,
      purchase.payload,
    );
  } catch (cause) {
    const error = new Error('Megaton starter grant failed before paid-gacha redemption');
    error.code = 'starter_grant_failed';
    error.cause = cause;
    throw error;
  }
  if (!grant || !grant.granted || !grant.state || typeof grant.state !== 'object') {
    const error = new Error('Megaton starter grant conflicted before paid-gacha redemption');
    error.code = 'starter_grant_conflict';
    error.grant = grant || null;
    throw error;
  }
  return {
    serverGrantApplied: true,
    state: grant.state,
    stateRev: grant.stateRev ?? null,
    updatedAt: grant.updatedAt || null,
    grant,
  };
}

function receiptWithFulfillment(receipt, fulfillment) {
  // The client needs the authoritative gameplay fields to recover a starter
  // grant after losing its local pending payload. The server-only idempotency
  // ledger is deliberately omitted: its keys contain checkout payloads (and
  // therefore Telegram user ids) and the state API will preserve that ledger
  // independently on later client saves.
  const state = fulfillment && fulfillment.state
    ? JSON.parse(JSON.stringify(fulfillment.state))
    : null;
  if (
    state
    && state.__server
    && state.__server.entitlements
    && typeof state.__server.entitlements === 'object'
  ) {
    delete state.__server.entitlements.applied;
  }
  return {
    ...receipt,
    serverGrantApplied: Boolean(fulfillment && fulfillment.serverGrantApplied),
    state,
    stateRev: fulfillment && fulfillment.stateRev != null ? fulfillment.stateRev : null,
    updatedAt: fulfillment && fulfillment.updatedAt || null,
  };
}

async function redeemPurchase(env, purchase, cutoverAt) {
  // The starter includes both deterministic upgrades/caps and one paid roll.
  // Persist its idempotent deterministic grant first, so a crash can leave at
  // worst an unredeemed purchase that reconciliation safely resumes. A receipt
  // must never become terminal while the starter grant is missing.
  const fulfillment = await ensureStarterGrant(env, purchase);
  const proposedRolls = rollMegatonPaidProduct(purchase.product_id);
  const row = await redeemMegatonPaidGacha(env, purchase, proposedRolls, cutoverAt);
  const receipt = publicPaidGachaReceipt(row);
  if (!receipt) {
    const error = new Error('Paid roll receipt was not returned');
    error.code = 'receipt_not_returned';
    throw error;
  }
  return receiptWithFulfillment(receipt, fulfillment);
}

async function reconcilePurchases(env, telegramUserId, cutoverAt) {
  const purchases = await listPaidMegatonGachaPurchases(
    env,
    telegramUserId,
    cutoverAt,
    MEGATON_PAID_RECONCILE_LIMIT,
  );
  const receipts = [];
  const failures = [];

  // Keep this sequential. The database makes each payload idempotent, while
  // oldest-first processing makes paid-copy and duplicate counters deterministic.
  for (let index = 0; index < purchases.length; index += 1) {
    const purchase = purchases[index];
    const validationError = validatePaidGachaPurchase(purchase, telegramUserId);
    if (validationError) {
      failures.push({
        purchaseIndex: index,
        productId: String(purchase && purchase.product_id || ''),
        paidAt: purchase && purchase.paid_at || null,
        error: validationError,
      });
      continue;
    }

    try {
      receipts.push(await redeemPurchase(env, purchase, cutoverAt));
    } catch (error) {
      if (migrationIsMissing(error)) throw error;
      console.error('Megaton paid gacha reconciliation item failed', error && error.message || error);
      failures.push({
        purchaseIndex: index,
        productId: String(purchase.product_id || ''),
        paidAt: purchase.paid_at || null,
        error: error && [
          'receipt_not_returned',
          'starter_grant_failed',
          'starter_grant_conflict',
        ].includes(error.code)
          ? error.code
          : 'redemption_failed',
      });
    }
  }

  return { purchases, receipts, failures };
}

export async function onRequestPost({ request, env }) {
  if (!sameOriginOk(request)) return jsonError('Forbidden', 403);
  if (!supabaseIsConfigured(env)) {
    return json({ ok: false, configured: false, error: 'supabase_not_configured' }, 503);
  }

  const body = await readBody(request);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonError('Invalid JSON body', 400);
  }
  const action = String(body.action || 'redeem');
  if (action !== 'redeem' && action !== 'reconcile' && action !== 'inventory') {
    return jsonError('Unknown action', 400);
  }
  if (String(body.game || '').toLowerCase() !== 'megaton') return jsonError('Invalid game', 400);
  if (clientProposedReward(body)) return jsonError('Client reward state is not accepted', 400);
  if (action === 'inventory' && inventoryHasUnexpectedInput(body)) {
    return jsonError('Client inventory mutation input is not accepted', 400);
  }

  const cutoverAt = paidGachaCutover(env);
  if (!cutoverAt) {
    return json(
      { ok: false, error: 'megaton_paid_gacha_cutover_not_configured' },
      503,
      { 'cache-control': 'no-store' },
    );
  }
  if (
    action !== 'inventory'
    && !hasMegatonPaidGachaCheckoutProtocol(body.checkoutProtocol)
  ) return jsonError('Megaton paid-gacha checkout protocol is required', 409);

  const auth = await verifyTelegramInitDataFromEnv(String(body.initData || ''), env);
  if (!auth.ok) return jsonError(`Telegram auth failed: ${auth.error}`, 401);

  await upsertTelegramPlayer(env, auth.user);

  if (action === 'inventory') {
    let snapshot;
    try {
      snapshot = await getPaidMegatonInventorySnapshot(env, auth.user.id);
    } catch (error) {
      if (migrationIsMissing(error)) {
        return json(
          { ok: false, error: 'megaton_paid_gacha_not_migrated' },
          503,
          { 'cache-control': 'no-store' },
        );
      }
      console.error('Megaton paid inventory lookup failed', error && error.message || error);
      return jsonError('Paid inventory lookup failed', 500);
    }

    return json(
      {
        ok: true,
        game: 'megaton',
        action: 'inventory',
        snapshot,
      },
      200,
      { 'cache-control': 'no-store' },
    );
  }

  if (action === 'reconcile') {
    let result;
    try {
      result = await reconcilePurchases(env, auth.user.id, cutoverAt);
    } catch (error) {
      if (migrationIsMissing(error)) {
        return json(
          { ok: false, error: 'megaton_paid_gacha_not_migrated' },
          503,
          { 'cache-control': 'no-store' },
        );
      }
      console.error('Megaton paid gacha reconciliation failed', error && error.message || error);
      return jsonError('Paid purchase reconciliation failed', 500);
    }

    return json(
      {
        ok: true,
        game: 'megaton',
        action: 'reconcile',
        order: 'oldest_first',
        cutoverAt,
        scanned: result.purchases.length,
        atQueryLimit: result.purchases.length === MEGATON_PAID_RECONCILE_LIMIT,
        receipts: result.receipts,
        failures: result.failures,
      },
      200,
      { 'cache-control': 'no-store' },
    );
  }

  const payload = String(body.payload || '');
  if (!payload || payload.length > 512) return jsonError('Invalid purchase payload', 400);

  const purchase = await getTelegramPurchase(env, 'megaton', auth.user.id, payload);
  if (!purchase) return jsonError('Purchase not found', 404);
  const validationError = validatePaidGachaPurchase(purchase, auth.user.id);
  if (validationError === 'purchase_not_paid') {
    return json(
      { ok: false, paid: false, error: 'purchase_not_paid' },
      409,
      { 'cache-control': 'no-store' },
    );
  }
  if (validationError === 'purchase_has_no_paid_roll') {
    return jsonError('Purchase has no paid Megaton roll', 422);
  }
  if (validationError === 'purchase_has_no_server_checkout_lineage') {
    return jsonError('Purchase was created by the legacy client checkout', 409);
  }
  if (validationError) {
    return jsonError(`Paid purchase verification failed: ${validationError}`, 409);
  }
  if (!purchaseIsAfterCutover(purchase, cutoverAt)) {
    return jsonError('Purchase predates the paid-gacha cutover', 409);
  }

  const productId = String(purchase.product_id || '');

  // The caller supplies only the verified purchase payload. Both the outcome and
  // paid inventory mutation originate on the server; retries return the first
  // receipt committed for that payload.
  let receipt;
  try {
    receipt = await redeemPurchase(env, purchase, cutoverAt);
  } catch (error) {
    if (migrationIsMissing(error)) {
      return json(
        { ok: false, error: 'megaton_paid_gacha_not_migrated' },
        503,
        { 'cache-control': 'no-store' },
      );
    }
    if (error && error.code === 'starter_grant_conflict') {
      return jsonError('Paid starter grant conflict; retry redemption', 409);
    }
    console.error('Megaton paid gacha redemption failed', error && error.message || error);
    return jsonError('Paid roll redemption failed', 500);
  }

  return json(
    {
      ok: true,
      game: 'megaton',
      purchase: {
        productId,
        currency: purchase.currency,
        paidAt: purchase.paid_at,
      },
      receipt,
      serverGrantApplied: Boolean(receipt.serverGrantApplied),
      state: receipt.state || null,
      stateRev: receipt.stateRev ?? null,
      updatedAt: receipt.updatedAt || null,
    },
    200,
    { 'cache-control': 'no-store' },
  );
}
