import { json, jsonError, sameOriginOk } from '../_lib/response.js';
import { getProduct, PRODUCTS_BY_GAME } from '../_lib/tgProducts.js';
import { verifyTelegramInitData } from '../_lib/telegramAuth.js';
import {
  getTelegramPurchase,
  getTelegramState,
  supabaseIsConfigured,
  upsertTelegramPlayer,
  upsertTelegramState,
} from '../_lib/supabase.js';

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function weekId(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
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
  gacha.previousWeeklyCrateWeek = gacha.weeklyCrateWeek || '';
  gacha.previousWeeklyCratesOpened = Math.max(0, Math.floor(Number(gacha.weeklyCratesOpened || 0)));
  gacha.weeklyCrateWeek = week;
  gacha.weeklyCratesOpened = 0;
}

function reportKey(body) {
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

async function validateReport(body, env, auth, gacha) {
  const source = String(body.source || '').toLowerCase();
  const now = Date.now();

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
    gacha.capsCrateLastAt = now;
    return { count: 1 };
  }

  if (source === 'paid') {
    const productId = String(body.productId || '');
    const payload = String(body.payload || '');
    const product = getProduct('megaton', productId);
    if (!product || !isPaidCrateProduct(productId) || !payload) return { error: jsonError('bad paid crate report', 400) };
    const purchase = await getTelegramPurchase(env, 'megaton', auth.user.id, payload);
    if (!purchase || purchase.status !== 'paid' || purchase.product_id !== productId) {
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
    return { count: 1 };
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

  const stateRow = await getTelegramState(env, game, auth.user.id);
  const state = cloneJson(stateRow && stateRow.state);
  const gacha = serverGachaFor(state);
  const week = weekId();
  rotateWeek(gacha, week);

  const validated = await validateReport(body, env, auth, gacha);
  if (validated.error) return validated.error;

  const count = Math.max(1, Math.min(10, Math.floor(Number(validated.count || 1))));
  gacha.weeklyCratesOpened = Math.max(0, Math.floor(Number(gacha.weeklyCratesOpened || 0))) + count;
  gacha.boxesOpened = Math.max(0, Math.floor(Number(gacha.boxesOpened || 0))) + count;
  gacha.updatedAt = new Date().toISOString();

  await upsertTelegramState(env, game, auth.user.id, state);
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
