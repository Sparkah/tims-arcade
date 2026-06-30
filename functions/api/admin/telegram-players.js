import { requireAdmin } from '../../_lib/adminAuth.js';
import { json, jsonError } from '../../_lib/response.js';
import { telegramBotProfile } from '../../_lib/telegramAuth.js';
import {
  isBroadcastRecipientActive,
  readTelegramBroadcastRecipients,
  telegramBroadcastRecipientStats,
} from '../../_lib/telegramBroadcastRecipients.js';
import {
  readTelegramGamePlayers,
  readTelegramPlayedGames,
  readTelegramPlayerProfile,
} from '../../_lib/telegramPlayHistory.js';

function noStore(response) {
  response.headers.set('cache-control', 'no-store');
  return response;
}

function cleanGameSlug(value) {
  const slug = String(value || '').trim().toLowerCase();
  return /^[a-z0-9_-]{1,80}$/.test(slug) ? slug : '';
}

function displayName(recipient, profile) {
  if (recipient && recipient.username) return `@${recipient.username}`;
  const parts = [recipient && recipient.first_name, recipient && recipient.last_name].filter(Boolean);
  if (parts.length) return parts.join(' ');
  if (profile && profile.username) return `@${profile.username}`;
  const profileParts = [profile && profile.first_name, profile && profile.last_name].filter(Boolean);
  if (profileParts.length) return profileParts.join(' ');
  return recipient && (recipient.telegramUserId || recipient.chatId) || 'unknown';
}

function playedMatch(played, gameSlug, gameRow) {
  if (!gameSlug) return null;
  return played.find((row) => row.slug === gameSlug) || (gameRow ? {
    slug: gameSlug,
    plays: gameRow.plays,
    firstPlayedAt: gameRow.firstPlayedAt,
    lastPlayedAt: gameRow.lastPlayedAt,
    botProfile: gameRow.botProfile,
  } : null);
}

async function publicPlayer(env, recipient, gameSlug, gameRowsByUser) {
  const userId = String(recipient.telegramUserId || recipient.chatId || '');
  const [played, profile] = await Promise.all([
    readTelegramPlayedGames(env, userId),
    readTelegramPlayerProfile(env, userId),
  ]);
  const gameRow = gameSlug ? gameRowsByUser.get(userId) || null : null;
  const selectedGame = playedMatch(played, gameSlug, gameRow);
  return {
    chatId: recipient.chatId,
    telegramUserId: userId,
    username: recipient.username || profile && profile.username || null,
    name: displayName(recipient, profile),
    botProfile: recipient.botProfile,
    languageCode: recipient.language_code || profile && profile.language_code || null,
    isPremium: Boolean(recipient.is_premium || profile && profile.is_premium),
    active: isBroadcastRecipientActive(recipient),
    blockedAt: recipient.blockedAt || null,
    optOutAt: recipient.optOutAt || null,
    firstSeenAt: recipient.firstSeenAt || null,
    lastSeenAt: recipient.lastSeenAt || null,
    sources: Array.isArray(recipient.sources) ? recipient.sources : [],
    playedCount: played.length,
    lastPlayedAt: played[0] && played[0].lastPlayedAt || null,
    selectedGame,
    played: played.slice(0, 12),
  };
}

export async function onRequestGet({ request, env }) {
  const guard = await requireAdmin(request, env);
  if (guard) return guard;
  if (!env || !env.VOTES) return noStore(jsonError('votes_binding_not_configured', 503));

  const url = new URL(request.url);
  const profile = telegramBotProfile(url.searchParams.get('botProfile'));
  const gameSlug = cleanGameSlug(url.searchParams.get('gameSlug'));
  const includeInactive = url.searchParams.get('includeInactive') === '1';
  const limit = Math.max(1, Math.min(parseInt(url.searchParams.get('limit') || '250', 10) || 250, 1000));

  try {
    const [recipientStats, allRecipients, gameRows] = await Promise.all([
      telegramBroadcastRecipientStats(env, profile),
      readTelegramBroadcastRecipients(env, profile, { includeInactive: true }),
      gameSlug ? readTelegramGamePlayers(env, gameSlug) : Promise.resolve([]),
    ]);
    const gameRowsByUser = new Map(gameRows.map((row) => [row.telegramUserId, row]));
    let segmentRecipients = gameSlug
      ? allRecipients.filter((recipient) => gameRowsByUser.has(String(recipient.telegramUserId || recipient.chatId || '')))
      : allRecipients;
    if (!includeInactive) segmentRecipients = segmentRecipients.filter(isBroadcastRecipientActive);

    segmentRecipients.sort((a, b) => {
      if (gameSlug) {
        const ar = gameRowsByUser.get(String(a.telegramUserId || a.chatId || ''));
        const br = gameRowsByUser.get(String(b.telegramUserId || b.chatId || ''));
        return String(br && br.lastPlayedAt || '').localeCompare(String(ar && ar.lastPlayedAt || ''));
      }
      return String(b.lastSeenAt || '').localeCompare(String(a.lastSeenAt || ''));
    });

    const limitedRecipients = segmentRecipients.slice(0, limit);
    const players = await Promise.all(limitedRecipients.map((recipient) =>
      publicPlayer(env, recipient, gameSlug, gameRowsByUser)));

    return noStore(json({
      ok: true,
      botProfile: profile,
      broadcastRecipients: recipientStats,
      segment: {
        type: gameSlug ? 'playedGame' : 'all',
        gameSlug,
        total: segmentRecipients.length,
        active: segmentRecipients.filter(isBroadcastRecipientActive).length,
        limited: segmentRecipients.length > limitedRecipients.length,
        limit,
      },
      players,
    }));
  } catch (error) {
    return noStore(jsonError(error.message || 'telegram_players_failed', error.status || 502));
  }
}
