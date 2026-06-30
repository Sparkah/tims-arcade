export const TG_PLAYER_PLAYED_PREFIX = 'tgplayed:';
export const TG_GAME_PLAYERS_PREFIX = 'tggameplayers:';
export const TG_PLAYER_PROFILE_PREFIX = 'tgplayer:';

const MAX_PLAYER_GAMES = 100;
const MAX_GAME_PLAYERS = 2000;

function nowIso() {
  return new Date().toISOString();
}

function cleanUserId(value) {
  const raw = String(value || '').trim();
  return /^\d{1,32}$/.test(raw) ? raw : '';
}

function cleanSlug(value) {
  const slug = String(value || '').trim().toLowerCase();
  return /^[a-z0-9_-]{1,80}$/.test(slug) ? slug : '';
}

export function publicTelegramUser(user) {
  return {
    id: String(user && user.id || ''),
    username: user && user.username ? String(user.username).slice(0, 64) : null,
    first_name: user && user.first_name ? String(user.first_name).slice(0, 128) : null,
    last_name: user && user.last_name ? String(user.last_name).slice(0, 128) : null,
    language_code: user && user.language_code ? String(user.language_code).slice(0, 16) : null,
    is_premium: Boolean(user && user.is_premium),
  };
}

export async function recordTelegramGamePlay(env, user, slug, profile = 'prod') {
  const userId = String(user && user.id || '');
  if (!env || !userId || !slug) return [];

  const at = nowIso();
  const profileRow = {
    ...publicTelegramUser(user),
    botProfile: profile === 'test' ? 'test' : 'prod',
    updatedAt: at,
  };
  await env.VOTES.put(TG_PLAYER_PROFILE_PREFIX + userId, JSON.stringify(profileRow));

  const playerKey = TG_PLAYER_PLAYED_PREFIX + userId;
  const current = await env.VOTES.get(playerKey, 'json').catch(() => null);
  const list = Array.isArray(current) ? current : [];
  const existing = list.find((row) => row && row.slug === slug);
  if (existing) {
    existing.plays = Math.max(1, Number(existing.plays || 0) + 1);
    existing.lastPlayedAt = at;
    existing.botProfile = profileRow.botProfile;
  } else {
    list.unshift({
      slug,
      plays: 1,
      firstPlayedAt: at,
      lastPlayedAt: at,
      botProfile: profileRow.botProfile,
    });
  }
  list.sort((a, b) => String(b.lastPlayedAt || '').localeCompare(String(a.lastPlayedAt || '')));
  const playerList = list.slice(0, MAX_PLAYER_GAMES);
  await env.VOTES.put(playerKey, JSON.stringify(playerList));

  const gameKey = TG_GAME_PLAYERS_PREFIX + slug;
  const gameCurrent = await env.VOTES.get(gameKey, 'json').catch(() => null);
  const gameList = Array.isArray(gameCurrent) ? gameCurrent : [];
  const gameExisting = gameList.find((row) => row && String(row.telegramUserId || '') === userId);
  if (gameExisting) {
    gameExisting.plays = Math.max(1, Number(gameExisting.plays || 0) + 1);
    gameExisting.lastPlayedAt = at;
    gameExisting.botProfile = profileRow.botProfile;
  } else {
    gameList.unshift({
      telegramUserId: userId,
      username: profileRow.username,
      plays: 1,
      firstPlayedAt: at,
      lastPlayedAt: at,
      botProfile: profileRow.botProfile,
    });
  }
  gameList.sort((a, b) => String(b.lastPlayedAt || '').localeCompare(String(a.lastPlayedAt || '')));
  await env.VOTES.put(gameKey, JSON.stringify(gameList.slice(0, MAX_GAME_PLAYERS)));

  return playerList;
}

export async function readTelegramPlayedGames(env, userId) {
  const id = cleanUserId(userId);
  if (!env || !id) return [];
  const rows = await env.VOTES.get(TG_PLAYER_PLAYED_PREFIX + id, 'json').catch(() => null);
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      slug: cleanSlug(row && row.slug),
      plays: Math.max(1, Number(row && row.plays) || 1),
      firstPlayedAt: row && row.firstPlayedAt || null,
      lastPlayedAt: row && row.lastPlayedAt || null,
      botProfile: row && row.botProfile === 'test' ? 'test' : 'prod',
    }))
    .filter((row) => row.slug);
}

export async function readTelegramGamePlayers(env, slug) {
  const clean = cleanSlug(slug);
  if (!env || !clean) return [];
  const rows = await env.VOTES.get(TG_GAME_PLAYERS_PREFIX + clean, 'json').catch(() => null);
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      telegramUserId: cleanUserId(row && row.telegramUserId),
      username: row && row.username ? String(row.username).slice(0, 64) : null,
      plays: Math.max(1, Number(row && row.plays) || 1),
      firstPlayedAt: row && row.firstPlayedAt || null,
      lastPlayedAt: row && row.lastPlayedAt || null,
      botProfile: row && row.botProfile === 'test' ? 'test' : 'prod',
    }))
    .filter((row) => row.telegramUserId);
}

export async function readTelegramPlayerProfile(env, userId) {
  const id = cleanUserId(userId);
  if (!env || !id) return null;
  const row = await env.VOTES.get(TG_PLAYER_PROFILE_PREFIX + id, 'json').catch(() => null);
  if (!row || typeof row !== 'object') return null;
  return {
    ...publicTelegramUser(row),
    botProfile: row.botProfile === 'test' ? 'test' : 'prod',
    updatedAt: row.updatedAt || null,
  };
}
