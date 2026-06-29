import { json, jsonError, sameOriginOk } from '../_lib/response.js';
import { getProduct, PRODUCTS_BY_GAME } from '../_lib/tgProducts.js';
import { verifyTelegramInitData } from '../_lib/telegramAuth.js';
import {
  getTelegramPurchase,
  getTelegramState,
  supabaseIsConfigured,
  updateTelegramStateIfRev,
  upsertTelegramPlayer,
  upsertTelegramState,
} from '../_lib/supabase.js';
import { crateWeekId as weekId, migrateLegacyEligibleCount } from '../_lib/tgCrateEligibility.js';

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function dayId(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function serverGachaFor(state) {
  const root = state.__server && typeof state.__server === 'object' ? state.__server : (state.__server = {});
  return root.gacha && typeof root.gacha === 'object' ? root.gacha : (root.gacha = {});
}

function rotateWeek(gacha, week) {
  if (gacha.weeklyCrateWeek === week) return;
  const paidSnapshot = gacha.weeklyPaidCratesOpened !== undefined ? gacha.weeklyPaidCratesOpened : gacha.weeklyCratesOpened;
  gacha.previousWeeklyCrateWeek = gacha.weeklyCrateWeek || '';
  gacha.previousWeeklyCratesOpened = Math.max(0, Math.floor(Number(gacha.weeklyCratesOpened || 0)));
  gacha.previousWeeklyPaidCratesOpened = Math.max(0, Math.floor(Number(paidSnapshot || 0)));
  gacha.weeklyCrateWeek = week;
  gacha.weeklyCratesOpened = 0;
  gacha.weeklyPaidCratesOpened = 0;
  gacha.weeklyCountVersion = 'eligible_v2';
}

function migratePaidReceiptCount(gacha) {
  if (gacha.weeklyPaidCratesOpened !== undefined) return;
  // Before eligible_v2, weeklyCratesOpened only advanced from real paid receipts.
  gacha.weeklyPaidCratesOpened = Math.max(0, Math.floor(Number(gacha.weeklyCratesOpened || 0)));
}

function reportKey(body) {
  if (String(body.source || '').toLowerCase() === 'paid') {
    return [
      'paid',
      String(body.productId || ''),
      String(body.payload || ''),
    ].join(':').slice(0, 240);
  }
  return [
    String(body.source || ''),
    String(body.productId || ''),
    String(body.payload || ''),
    String(body.crateId || ''),
  ].join(':').slice(0, 240);
}

function isPaidCrateProduct(productId) {
  return productId === 'arsenal_payload' || productId === 'arsenal_payload_10' || productId === 'arsenal_legendary_payload' || productId === 'starter';
}

function paidCrateCount(productId) {
  if (productId === 'arsenal_payload_10') return 10;
  return isPaidCrateProduct(productId) ? 1 : 0;
}

function tonCreditSpendFor(state, productId, payload) {
  const server = state && state.__server && typeof state.__server === 'object' ? state.__server : null;
  const spends = server && server.tonCreditSpends && typeof server.tonCreditSpends === 'object' ? server.tonCreditSpends : null;
  const spend = spends && spends[String(payload || '')];
  return spend && spend.productId === productId && spend.nanotons ? spend : null;
}

async function validateReport(body, env, auth, state, gacha) {
  const source = String(body.source || '').toLowerCase();
  const now = Date.now();

  // Only server-bounded crate opens can move the reward leaderboard. Reward TON-credit spends
  // apply items but never recycle into the next weekly payout rank.
  if (source === 'daily') {
    const today = dayId();
    if (gacha.dailyCrateDay === today) return { error: jsonError('daily crate already reported', 409) };
    gacha.dailyCrateDay = today;
    return { count: 1 };
  }

  if (source === 'ad') {
    const last = Number(gacha.adCrateLastAt || 0);
    if (last && now - last < 60 * 60 * 1000) return { error: jsonError('ad crate cooldown', 429) };
    gacha.adCrateLastAt = now;
    return { count: 1 };
  }

  if (source === 'caps') {
    const last = Number(gacha.capsCrateLastAt || 0);
    if (last && now - last < 2500) return { error: jsonError('crate report cooldown', 429) };
    const today = dayId();
    if (gacha.capsCrateDay !== today) {
      gacha.capsCrateDay = today;
      gacha.capsCrateDayCount = 0;
    }
    const todayCount = Math.max(0, Math.floor(Number(gacha.capsCrateDayCount || 0)));
    gacha.capsCrateLastAt = now;
    if (todayCount >= 3) return { count: 0 };
    gacha.capsCrateDayCount = todayCount + 1;
    return { count: 1 };
  }

  if (source === 'paid') {
    const productId = String(body.productId || '');
    const payload = String(body.payload || '');
    const product = getProduct('megaton', productId);
    if (!product || !isPaidCrateProduct(productId) || !payload) return { error: jsonError('bad paid crate report', 400) };
    const purchase = await getTelegramPurchase(env, 'megaton', auth.user.id, payload);
    const paidReceipt = purchase && purchase.status === 'paid' && purchase.product_id === productId;
    const creditSpend = tonCreditSpendFor(state, productId, payload);
    if (!paidReceipt && !creditSpend) {
      return { error: jsonError('paid receipt not found', 402) };
    }
    const counted = gacha.countedReports && typeof gacha.countedReports === 'object' ? gacha.countedReports : (gacha.countedReports = {});
    const key = reportKey(body);
    if (counted[key]) return { error: jsonError('paid crate already reported', 409) };
    counted[key] = new Date().toISOString();
    const keys = Object.keys(counted);
    if (keys.length > 160) {
      keys.sort((a, b) => String(counted[a]).localeCompare(String(counted[b])));
      keys.slice(0, keys.length - 160).forEach((oldKey) => { delete counted[oldKey]; });
    }
    // TON-credit spends apply the item, but cannot recycle weekly reward credit into the next payout rank.
    const count = paidReceipt ? paidCrateCount(productId) : 0;
    return { count, paidCount: count };
  }

  return { error: jsonError('unsupported crate report', 400) };
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

  const auth = await verifyTelegramInitData(String(body.initData || ''), env.TELEGRAM_GAMEBOT_TOKEN);
  if (!auth.ok) return jsonError(`Telegram auth failed: ${auth.error}`, 401);
  await upsertTelegramPlayer(env, auth.user);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const stateRow = await getTelegramState(env, game, auth.user.id);
    const state = cloneJson(stateRow && stateRow.state);
    const gacha = serverGachaFor(state);
    const week = weekId();
    rotateWeek(gacha, week);
    migratePaidReceiptCount(gacha);
    migrateLegacyEligibleCount(gacha, week);

    const validated = await validateReport(body, env, auth, state, gacha);
    if (validated.error) return validated.error;

    const count = Math.max(0, Math.min(10, Math.floor(Number(validated.count || 0))));
    const paidCount = Math.max(0, Math.min(10, Math.floor(Number(validated.paidCount || 0))));
    gacha.weeklyCratesOpened = Math.max(0, Math.floor(Number(gacha.weeklyCratesOpened || 0))) + count;
    gacha.weeklyPaidCratesOpened = Math.max(0, Math.floor(Number(gacha.weeklyPaidCratesOpened || 0))) + paidCount;
    gacha.boxesOpened = Math.max(0, Math.floor(Number(gacha.boxesOpened || 0))) + count;
    gacha.updatedAt = new Date().toISOString();

    const saved = stateRow
      ? await updateTelegramStateIfRev(env, game, auth.user.id, stateRow.state_rev, state)
      : await upsertTelegramState(env, game, auth.user.id, state);
    if (saved) {
      return json(
        {
          ok: true,
          configured: true,
          game,
          week,
          weeklyCratesOpened: gacha.weeklyCratesOpened,
        },
        200,
        { 'cache-control': 'no-store' },
      );
    }
  }

  return jsonError('crate report conflict, retry', 409);
}
