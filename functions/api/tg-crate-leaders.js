import { json, jsonError, sameOriginOk } from '../_lib/response.js';
import { PRODUCTS_BY_GAME } from '../_lib/tgProducts.js';
import { verifyTelegramInitData } from '../_lib/telegramAuth.js';
import {
  creditTonBalance,
  ensureServerBlock,
  formatTon,
  getTelegramState,
  listTelegramPlayers,
  listTelegramStates,
  normalizeNanotons,
  supabaseIsConfigured,
  updateTelegramStateIfRev,
  upsertTelegramPlayer,
} from '../_lib/supabase.js';
import { crateWeekId as weekId, legacyEligibleFloor } from '../_lib/tgCrateEligibility.js';

const WEEKLY_REWARDS = [
  { min: 1, max: 1, crates: 10 },
  { min: 2, max: 2, crates: 8 },
  { min: 3, max: 3, crates: 6 },
  { min: 4, max: 10, crates: 3 },
  { min: 11, max: 20, crates: 2 },
  { min: 21, max: 100, crates: 1 },
];

const WEEKLY_TON_REWARDS = [
  { min: 1, max: 1, ton: '7.00', nanotons: '7000000000' },
  { min: 2, max: 2, ton: '5.00', nanotons: '5000000000' },
  { min: 3, max: 3, ton: '3.00', nanotons: '3000000000' },
];

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function previousWeekId() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 7);
  return weekId(d);
}

function rewardForRank(rank) {
  for (const row of WEEKLY_REWARDS) {
    if (rank >= row.min && rank <= row.max) return row.crates;
  }
  return 0;
}

function tonRewardForRank(rank) {
  for (const row of WEEKLY_TON_REWARDS) {
    if (rank >= row.min && rank <= row.max) return row;
  }
  return null;
}

function serverGacha(state) {
  return state && state.__server && typeof state.__server === 'object' && state.__server.gacha && typeof state.__server.gacha === 'object'
    ? state.__server.gacha
    : {};
}

function crateCountForWeek(state, week) {
  const stats = serverGacha(state);
  if (stats.weeklyCrateWeek === week) {
    let count = Number(stats.weeklyCratesOpened || 0);
    // Pre-eligible_v2 accounts stored daily/ad/caps cooldowns but 0 rank count; credit a floor until report migration bakes it in.
    count += legacyEligibleFloor(stats, week);
    return count;
  }
  if (stats.previousWeeklyCrateWeek === week) return Number(stats.previousWeeklyCratesOpened || 0);
  return 0;
}

function paidCrateCountForWeek(state, week) {
  const stats = serverGacha(state);
  if (stats.weeklyCrateWeek === week) {
    if (stats.weeklyPaidCratesOpened !== undefined) return Number(stats.weeklyPaidCratesOpened || 0);
    // Pre-eligible_v2 weeklyCratesOpened only advanced from real paid receipts.
    return Number(stats.weeklyCratesOpened || 0);
  }
  if (stats.previousWeeklyCrateWeek === week) {
    if (stats.previousWeeklyPaidCratesOpened !== undefined) return Number(stats.previousWeeklyPaidCratesOpened || 0);
    return Number(stats.previousWeeklyCratesOpened || 0);
  }
  return 0;
}

function publicName(player, fallbackId) {
  if (player && player.username) return `@${player.username}`;
  const first = player && player.first_name ? String(player.first_name).trim() : '';
  const last = player && player.last_name ? String(player.last_name).trim() : '';
  const full = `${first} ${last}`.trim();
  return full || `Player ${String(fallbackId || '').slice(-4)}`;
}

function profileUrl(player) {
  const username = player && String(player.username || '').trim();
  return /^[A-Za-z0-9_]{5,32}$/.test(username) ? `https://t.me/${username}` : null;
}

function buildPaidRankMap(rows, week) {
  return new Map(rows
    .map((row) => ({
      telegramUserId: String(row.telegram_user_id || ''),
      paidCratesOpened: Math.max(0, Math.floor(paidCrateCountForWeek(row.state, week))),
    }))
    .filter((row) => row.telegramUserId && row.paidCratesOpened > 0)
    .sort((a, b) => (b.paidCratesOpened - a.paidCratesOpened) || String(a.telegramUserId).localeCompare(String(b.telegramUserId)))
    .map((row, index) => [row.telegramUserId, { rank: index + 1, paidCratesOpened: row.paidCratesOpened }]));
}

function buildLeaderboard(rows, week, limit = 100, playersById = new Map(), viewerId = '', paidRankById = new Map()) {
  return rows
    .map((row) => ({
      telegramUserId: String(row.telegram_user_id || ''),
      cratesOpened: Math.max(0, Math.floor(crateCountForWeek(row.state, week))),
      updatedAt: row.updated_at || null,
    }))
    .filter((row) => row.telegramUserId && row.cratesOpened > 0)
    .sort((a, b) => (b.cratesOpened - a.cratesOpened) || String(a.telegramUserId).localeCompare(String(b.telegramUserId)))
    .slice(0, Math.max(1, Math.min(100, Number(limit) || 100)))
    .map((row, index) => {
      const paidRank = paidRankById.get(row.telegramUserId) || null;
      const paidTon = paidRank ? tonRewardForRank(paidRank.rank) : null;
      return {
        rank: index + 1,
        telegramUserId: row.telegramUserId,
        displayName: publicName(playersById.get(row.telegramUserId), row.telegramUserId),
        profileUrl: profileUrl(playersById.get(row.telegramUserId)),
        cratesOpened: row.cratesOpened,
        paidCratesOpened: paidRank ? paidRank.paidCratesOpened : 0,
        paidRank: paidRank ? paidRank.rank : null,
        rewardCrates: rewardForRank(index + 1),
        rewardTon: paidTon ? paidTon.ton : null,
        rewardTonNanotons: paidTon ? paidTon.nanotons : '0',
        updatedAt: row.updatedAt,
        isMe: row.telegramUserId === String(viewerId || ''),
      };
    });
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
  if (!Object.hasOwn(PRODUCTS_BY_GAME, game)) return jsonError('bad game', 400);

  const action = String(body.action || 'leaders');
  const week = action === 'claim_weekly' ? previousWeekId() : String(body.week || weekId());
  const auth = await authenticate(body, env);
  if (auth.error) return auth.error;

  const rows = await listTelegramStates(env, game, 5000);
  const playerRows = await listTelegramPlayers(env, rows.map((row) => row.telegram_user_id));
  const playersById = new Map(playerRows.map((player) => [String(player.telegram_user_id), player]));
  const paidRankById = buildPaidRankMap(rows, week);
  const leaders = buildLeaderboard(rows, week, body.limit || 100, playersById, auth.user.id, paidRankById);

  if (action === 'leaders') {
    return json({ ok: true, configured: true, game, week, leaders }, 200, { 'cache-control': 'no-store' });
  }

  if (action !== 'claim_weekly') return jsonError('Unknown action', 400);

  const mine = leaders.find((row) => row.telegramUserId === String(auth.user.id));
  const paidMine = paidRankById.get(String(auth.user.id)) || null;
  const rewardCrates = mine ? rewardForRank(mine.rank) : 0;
  const rewardTon = paidMine ? tonRewardForRank(paidMine.rank) : null;
  const rewardTonNanotons = rewardTon ? rewardTon.nanotons : '0';
  if (!rewardCrates && !normalizeNanotons(rewardTonNanotons)) {
    return json({ ok: true, configured: true, game, week, rank: mine ? mine.rank : null, rewardCrates: 0, rewardTon: null, rewardTonNanotons: '0', claimed: false }, 200, { 'cache-control': 'no-store' });
  }

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const stateRow = await getTelegramState(env, game, auth.user.id);
    const state = stateRow && stateRow.state && typeof stateRow.state === 'object' ? JSON.parse(JSON.stringify(stateRow.state)) : {};
    const server = ensureServerBlock(state);
    const stats = server.gacha && typeof server.gacha === 'object' ? server.gacha : (server.gacha = {});
    const claims = stats.weeklyClaims && typeof stats.weeklyClaims === 'object' ? stats.weeklyClaims : (stats.weeklyClaims = {});
    if (claims[week]) {
      return json({
        ok: true,
        configured: true,
        game,
        week,
        rank: mine ? mine.rank : null,
        paidRank: paidMine ? paidMine.rank : null,
        rewardCrates: 0,
        rewardTon: null,
        rewardTonNanotons: '0',
        creditTon: formatTon(server.tonCreditNanotons),
        creditNanotons: String(server.tonCreditNanotons || '0'),
        alreadyClaimed: true,
      }, 200, { 'cache-control': 'no-store' });
    }
    const creditNanotons = creditTonBalance(server, rewardTonNanotons);
    claims[week] = {
      rank: mine ? mine.rank : null,
      paidRank: paidMine ? paidMine.rank : null,
      crates: rewardCrates,
      ton: rewardTon ? rewardTon.ton : null,
      tonNanotons: rewardTonNanotons,
      claimedAt: new Date().toISOString(),
    };
    const updated = stateRow && await updateTelegramStateIfRev(env, game, auth.user.id, stateRow.state_rev, state);
    if (updated) {
      return json({
        ok: true,
        configured: true,
        game,
        week,
        rank: mine ? mine.rank : null,
        paidRank: paidMine ? paidMine.rank : null,
        rewardCrates,
        rewardTon: rewardTon ? rewardTon.ton : null,
        rewardTonNanotons,
        creditTon: formatTon(creditNanotons),
        creditNanotons,
        claimed: true,
      }, 200, { 'cache-control': 'no-store' });
    }
  }

  return jsonError('weekly claim conflict, retry', 409);
}
