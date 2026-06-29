import { json, jsonError, sameOriginOk } from '../_lib/response.js';
import { getProduct, hasTonPrice, PRODUCTS_BY_GAME } from '../_lib/tgProducts.js';
import { verifyTelegramInitData } from '../_lib/telegramAuth.js';
import {
  ensureServerBlock,
  formatTon,
  getTelegramState,
  normalizeNanotons,
  supabaseIsConfigured,
  updateTelegramStateIfRev,
  upsertTelegramPlayer,
} from '../_lib/supabase.js';

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function spendsFor(server) {
  return server.tonCreditSpends && typeof server.tonCreditSpends === 'object' ? server.tonCreditSpends : (server.tonCreditSpends = {});
}

function newPayload(game, productId, telegramUserId) {
  const nonce = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${game}:ton_credit:${productId}:${telegramUserId}:${nonce}`;
}

function trimSpendLedger(spends, max = 120) {
  const keys = Object.keys(spends);
  if (keys.length <= max) return;
  keys
    .sort((a, b) => String(spends[a]?.spentAt || '').localeCompare(String(spends[b]?.spentAt || '')))
    .slice(0, keys.length - max)
    .forEach((key) => { delete spends[key]; });
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

  const auth = await authenticate(body, env);
  if (auth.error) return auth.error;

  const action = String(body.action || 'balance');
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

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const stateRow = await getTelegramState(env, game, auth.user.id);
    const state = cloneJson(stateRow && stateRow.state);
    const server = ensureServerBlock(state);
    const balance = normalizeNanotons(server.tonCreditNanotons);
    if (balance < priceNanotons) {
      return json({
        ok: false,
        configured: true,
        game,
        status: 'insufficient_credit',
        creditTon: formatTon(balance),
        creditNanotons: balance.toString(),
        requiredTon: formatTon(priceNanotons),
        requiredNanotons: priceNanotons.toString(),
      }, 402, { 'cache-control': 'no-store' });
    }

    const payload = newPayload(game, productId, auth.user.id);
    const spends = spendsFor(server);
    const now = new Date().toISOString();
    const nextBalance = balance - priceNanotons;
    server.tonCreditNanotons = nextBalance.toString();
    server.tonCreditUpdatedAt = now;
    spends[payload] = {
      productId,
      nanotons: priceNanotons.toString(),
      spentAt: now,
    };
    trimSpendLedger(spends);

    const updated = stateRow && await updateTelegramStateIfRev(env, game, auth.user.id, stateRow.state_rev, state);
    if (updated) {
      return json({
        ok: true,
        configured: true,
        game,
        paid: true,
        source: 'ton_credit',
        productId,
        payload,
        creditTon: formatTon(nextBalance),
        creditNanotons: nextBalance.toString(),
        spentTon: formatTon(priceNanotons),
        spentNanotons: priceNanotons.toString(),
        inGameOnly: true,
      }, 200, { 'cache-control': 'no-store' });
    }
  }

  return jsonError('credit spend conflict, retry', 409);
}
