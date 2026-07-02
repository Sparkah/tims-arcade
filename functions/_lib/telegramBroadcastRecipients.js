import { telegramBotProfile } from './telegramAuth.js';

export const TG_BROADCAST_RECIPIENT_INDEX_PREFIX = 'tgbroadcast:index:';
export const TG_BROADCAST_RECIPIENT_PREFIX = 'tgbroadcast:recipient:';

const MAX_RECIPIENTS_PER_PROFILE = 10000;

function nowIso() {
  return new Date().toISOString();
}

function profileFrom(value) {
  return telegramBotProfile(value);
}

function cleanPrivateChatId(value) {
  const raw = String(value || '').trim();
  return /^\d{1,32}$/.test(raw) ? raw : '';
}

function cleanString(value, max) {
  const raw = String(value || '').trim();
  return raw ? raw.slice(0, max) : null;
}

function cleanSource(value) {
  const raw = String(value || '').trim().replace(/[^A-Za-z0-9_-]/g, '_');
  return raw ? raw.slice(0, 64) : 'unknown';
}

function recipientIndexKey(profile) {
  return TG_BROADCAST_RECIPIENT_INDEX_PREFIX + profileFrom(profile);
}

function recipientKey(profile, chatId) {
  return TG_BROADCAST_RECIPIENT_PREFIX + profileFrom(profile) + ':' + chatId;
}

async function readRecipientIndex(env, profile) {
  if (!env || !env.VOTES) return [];
  const rows = await env.VOTES.get(recipientIndexKey(profile), 'json').catch(() => null);
  if (!Array.isArray(rows)) return [];
  const out = [];
  const seen = new Set();
  for (const value of rows) {
    const chatId = cleanPrivateChatId(value);
    if (!chatId || seen.has(chatId)) continue;
    seen.add(chatId);
    out.push(chatId);
  }
  return out.slice(0, MAX_RECIPIENTS_PER_PROFILE);
}

async function writeRecipientIndex(env, profile, chatIds) {
  if (!env || !env.VOTES) return;
  await env.VOTES.put(recipientIndexKey(profile), JSON.stringify(chatIds.slice(0, MAX_RECIPIENTS_PER_PROFILE)));
}

function publicTelegramBroadcastUser(user) {
  return {
    id: cleanPrivateChatId(user && user.id),
    username: cleanString(user && user.username, 64),
    first_name: cleanString(user && user.first_name, 128),
    last_name: cleanString(user && user.last_name, 128),
    language_code: cleanString(user && user.language_code, 16),
    is_premium: Boolean(user && user.is_premium),
  };
}

function publicRecipient(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    chatId: String(row.chatId || ''),
    telegramUserId: String(row.telegramUserId || ''),
    username: row.username || null,
    first_name: row.first_name || null,
    last_name: row.last_name || null,
    language_code: row.language_code || null,
    is_premium: Boolean(row.is_premium),
    botProfile: profileFrom(row.botProfile),
    source: row.source || 'unknown',
    sources: Array.isArray(row.sources) ? row.sources : [],
    firstSeenAt: row.firstSeenAt || null,
    lastSeenAt: row.lastSeenAt || null,
    blockedAt: row.blockedAt || null,
    blockedReason: row.blockedReason || null,
    optOutAt: row.optOutAt || null,
    active: row.active !== false,
  };
}

export function isBroadcastRecipientActive(row) {
  return Boolean(row && row.active !== false && !row.blockedAt && !row.optOutAt);
}

export async function readTelegramBroadcastRecipient(env, profile, chatId) {
  if (!env || !env.VOTES) return null;
  const cleanProfile = profileFrom(profile);
  const cleanChatId = cleanPrivateChatId(chatId);
  if (!cleanChatId) return null;
  return publicRecipient(await env.VOTES.get(recipientKey(cleanProfile, cleanChatId), 'json').catch(() => null));
}

export async function recordTelegramBroadcastRecipient(env, input = {}) {
  if (!env || !env.VOTES) return null;
  const profile = profileFrom(input.botProfile);
  const chat = input.chat && typeof input.chat === 'object' ? input.chat : {};
  if (chat.type && chat.type !== 'private') return null;

  const user = publicTelegramBroadcastUser(input.user || {});
  const chatId = cleanPrivateChatId(input.chatId || chat.id || user.id);
  const userId = cleanPrivateChatId(user.id);
  if (!chatId || !userId || chatId !== userId) return null;

  const key = recipientKey(profile, chatId);
  const existing = await env.VOTES.get(key, 'json').catch(() => null);
  const previous = publicRecipient(existing) || {};
  const at = nowIso();
  const source = cleanSource(input.source);
  const sources = Array.from(new Set([...(previous.sources || []), source])).slice(0, 20);
  const clearOptOut = Boolean(input.reactivate);

  const optOutAt = clearOptOut ? null : previous.optOutAt || null;
  const row = {
    ...previous,
    ...user,
    chatId,
    telegramUserId: userId,
    botProfile: profile,
    source,
    sources,
    firstSeenAt: previous.firstSeenAt || at,
    lastSeenAt: at,
    blockedAt: null,
    blockedReason: null,
    optOutAt,
    active: !optOutAt,
  };

  // Throttle 2026-07-02: skip the row rewrite when this recipient was already
  // recorded earlier today and nothing material changed (no reactivation, no new
  // source, not previously blocked). Fires on every mini-app open; the row only
  // loses an intra-day lastSeenAt bump. The index write below stays gated to new
  // chatIds. Cuts the tg-open KV write cost during broadcasts.
  const seenToday = existing && String(previous.lastSeenAt || '').slice(0, 10) === at.slice(0, 10);
  const newSource = source && !(previous.sources || []).includes(source);
  if (!existing || clearOptOut || newSource || previous.blockedAt || !seenToday) {
    await env.VOTES.put(key, JSON.stringify(row));
  }

  const index = await readRecipientIndex(env, profile);
  if (!index.includes(chatId)) {
    index.unshift(chatId);
    await writeRecipientIndex(env, profile, index);
  }

  return row;
}

export async function optOutTelegramBroadcastRecipient(env, profile, chatId, reason = 'user_stop') {
  if (!env || !env.VOTES) return null;
  const cleanProfile = profileFrom(profile);
  const cleanChatId = cleanPrivateChatId(chatId);
  if (!cleanChatId) return null;
  const key = recipientKey(cleanProfile, cleanChatId);
  const existing = await env.VOTES.get(key, 'json').catch(() => null);
  const previous = publicRecipient(existing) || {
    chatId: cleanChatId,
    telegramUserId: cleanChatId,
    botProfile: cleanProfile,
    sources: [],
    firstSeenAt: nowIso(),
  };
  const at = nowIso();
  const row = {
    ...previous,
    botProfile: cleanProfile,
    chatId: cleanChatId,
    telegramUserId: cleanChatId,
    optOutAt: at,
    optOutReason: cleanSource(reason),
    active: false,
    lastSeenAt: at,
  };
  await env.VOTES.put(key, JSON.stringify(row));
  return row;
}

export async function markTelegramBroadcastRecipientBlocked(env, profile, chatId, reason = 'blocked') {
  if (!env || !env.VOTES) return null;
  const cleanProfile = profileFrom(profile);
  const cleanChatId = cleanPrivateChatId(chatId);
  if (!cleanChatId) return null;
  const key = recipientKey(cleanProfile, cleanChatId);
  const existing = await env.VOTES.get(key, 'json').catch(() => null);
  const previous = publicRecipient(existing) || {
    chatId: cleanChatId,
    telegramUserId: cleanChatId,
    botProfile: cleanProfile,
    sources: [],
    firstSeenAt: nowIso(),
  };
  const at = nowIso();
  const row = {
    ...previous,
    botProfile: cleanProfile,
    chatId: cleanChatId,
    telegramUserId: cleanChatId,
    blockedAt: at,
    blockedReason: String(reason || 'blocked').slice(0, 220),
    active: false,
    lastSeenAt: at,
  };
  await env.VOTES.put(key, JSON.stringify(row));
  return row;
}

export async function readTelegramBroadcastRecipients(env, profile, options = {}) {
  const cleanProfile = profileFrom(profile);
  const index = await readRecipientIndex(env, cleanProfile);
  const rows = [];
  for (const chatId of index) {
    const row = publicRecipient(await env.VOTES.get(recipientKey(cleanProfile, chatId), 'json').catch(() => null));
    if (!row) continue;
    if (!options.includeInactive && !isBroadcastRecipientActive(row)) continue;
    rows.push(row);
  }
  rows.sort((a, b) => String(b.lastSeenAt || '').localeCompare(String(a.lastSeenAt || '')));
  return rows;
}

export async function telegramBroadcastRecipientStats(env, profile) {
  const rows = await readTelegramBroadcastRecipients(env, profile, { includeInactive: true });
  return rows.reduce((stats, row) => {
    stats.total += 1;
    if (isBroadcastRecipientActive(row)) stats.active += 1;
    if (row.blockedAt) stats.blocked += 1;
    if (row.optOutAt) stats.optedOut += 1;
    return stats;
  }, {
    botProfile: profileFrom(profile),
    total: 0,
    active: 0,
    blocked: 0,
    optedOut: 0,
  });
}
