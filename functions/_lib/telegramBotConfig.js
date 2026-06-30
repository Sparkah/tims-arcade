import { telegramBotProfile } from './telegramAuth.js';

export const TELEGRAM_BOT_CONFIG_KEY = 'telegram:bot:config';

export const DEFAULT_TELEGRAM_BOT_CONFIG = {
  version: 1,
  updatedAt: '',
  start: {
    headline: 'Welcome to Game Factory',
    body: 'Start with Megaton, a Telegram-first game with rewarded ads and optional Stars boosts, or browse the free factory games.',
    showMegaton: true,
    showLibrary: true,
    gameSlugs: [],
    primaryAction: {
      type: 'megaton',
      slug: '',
      label: 'Play Megaton',
    },
  },
  top: {
    title: 'Hot right now',
    maxGames: 5,
    gameSlugs: [],
  },
  library: {
    mode: 'all',
    subtitle: 'New games built daily. Tap one to play.',
    includeSlugs: [],
    excludeSlugs: [],
    pinnedSlugs: [],
    maxGames: 180,
    hotLabel: 'Hot today',
    pinnedLabel: 'Featured',
  },
  composer: {
    chatId: '@gamefactorytech',
    botProfile: 'prod',
    text: '',
    buttonText: '',
    buttonUrl: '',
    photoUrl: '',
  },
  relay: {
    enabled: false,
    broadcastUsers: false,
    sourceChatId: '',
    targetChatIds: [],
  },
};

function cloneDefault() {
  return JSON.parse(JSON.stringify(DEFAULT_TELEGRAM_BOT_CONFIG));
}

function objectOrEmpty(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function cleanText(value, max, fallback = '', allowEmpty = false) {
  if (typeof value === 'undefined') return fallback;
  const text = String(value || '').replace(/\r\n/g, '\n').trim().slice(0, max);
  if (!allowEmpty && !text) return fallback;
  return text;
}

function cleanBool(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function cleanInt(value, fallback, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(Math.max(Math.floor(num), min), max);
}

function cleanSlug(value) {
  const slug = String(value || '').trim().toLowerCase();
  return /^[a-z0-9_-]{1,80}$/.test(slug) ? slug : '';
}

function cleanSlugArray(value, max = 80) {
  const out = [];
  const seen = new Set();
  if (!Array.isArray(value)) return out;
  for (const item of value) {
    const slug = cleanSlug(item);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
    if (out.length >= max) break;
  }
  return out;
}

function cleanHttpsUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function cleanChatId(value, fallback = '') {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  if (/^@[A-Za-z0-9_]{5,64}$/.test(raw)) return raw;
  if (/^-100\d{5,32}$/.test(raw)) return raw;
  if (/^-?\d{5,32}$/.test(raw)) return raw;
  return fallback;
}

function cleanChatArray(value, max = 12) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const item of value) {
    const chatId = cleanChatId(item);
    if (!chatId || seen.has(chatId)) continue;
    seen.add(chatId);
    out.push(chatId);
    if (out.length >= max) break;
  }
  return out;
}

function cleanPrimaryAction(raw, fallback) {
  const src = objectOrEmpty(raw);
  const type = ['megaton', 'library', 'game'].includes(src.type) ? src.type : fallback.type;
  const slug = cleanSlug(src.slug);
  const label = cleanText(src.label, 64, fallback.label);
  if (type === 'game' && !slug) return { ...fallback };
  return { type, slug, label };
}

export function normalizeTelegramBotConfig(raw) {
  const cfg = cloneDefault();
  const src = objectOrEmpty(raw);
  const start = objectOrEmpty(src.start);
  const top = objectOrEmpty(src.top);
  const library = objectOrEmpty(src.library);
  const composer = objectOrEmpty(src.composer);
  const relay = objectOrEmpty(src.relay);

  cfg.version = cleanInt(src.version, cfg.version, 1, 2147483647);
  cfg.updatedAt = cleanText(src.updatedAt, 40, cfg.updatedAt, true);

  cfg.start.headline = cleanText(start.headline, 120, cfg.start.headline);
  cfg.start.body = cleanText(start.body, 900, cfg.start.body, true);
  cfg.start.showMegaton = cleanBool(start.showMegaton, cfg.start.showMegaton);
  cfg.start.showLibrary = cleanBool(start.showLibrary, cfg.start.showLibrary);
  cfg.start.gameSlugs = cleanSlugArray(start.gameSlugs, 20);
  cfg.start.primaryAction = cleanPrimaryAction(start.primaryAction, cfg.start.primaryAction);

  cfg.top.title = cleanText(top.title, 80, cfg.top.title);
  cfg.top.maxGames = cleanInt(top.maxGames, cfg.top.maxGames, 1, 10);
  cfg.top.gameSlugs = cleanSlugArray(top.gameSlugs, 20);

  cfg.library.mode = library.mode === 'selected' ? 'selected' : 'all';
  cfg.library.subtitle = cleanText(library.subtitle, 180, cfg.library.subtitle, true);
  cfg.library.includeSlugs = cleanSlugArray(library.includeSlugs, 180);
  cfg.library.excludeSlugs = cleanSlugArray(library.excludeSlugs, 180);
  cfg.library.pinnedSlugs = cleanSlugArray(library.pinnedSlugs, 40);
  cfg.library.maxGames = cleanInt(library.maxGames, cfg.library.maxGames, 1, 240);
  cfg.library.hotLabel = cleanText(library.hotLabel, 40, cfg.library.hotLabel);
  cfg.library.pinnedLabel = cleanText(library.pinnedLabel, 40, cfg.library.pinnedLabel);

  cfg.composer.chatId = cleanChatId(composer.chatId, cfg.composer.chatId);
  cfg.composer.botProfile = telegramBotProfile(composer.botProfile);
  cfg.composer.text = cleanText(composer.text, 4096, '', true);
  cfg.composer.buttonText = cleanText(composer.buttonText, 64, '', true);
  cfg.composer.buttonUrl = cleanHttpsUrl(composer.buttonUrl);
  cfg.composer.photoUrl = cleanHttpsUrl(composer.photoUrl);

  cfg.relay.enabled = cleanBool(relay.enabled, cfg.relay.enabled);
  cfg.relay.broadcastUsers = cleanBool(relay.broadcastUsers, cfg.relay.broadcastUsers);
  cfg.relay.sourceChatId = cleanChatId(relay.sourceChatId, '');
  cfg.relay.targetChatIds = cleanChatArray(relay.targetChatIds, 12);

  return cfg;
}

export function publicTelegramBotConfig(config) {
  const cfg = normalizeTelegramBotConfig(config);
  return {
    version: cfg.version,
    updatedAt: cfg.updatedAt,
    start: cfg.start,
    top: cfg.top,
    library: cfg.library,
  };
}

export async function readTelegramBotConfig(env) {
  let stored = null;
  try {
    stored = await env.VOTES.get(TELEGRAM_BOT_CONFIG_KEY, 'json');
  } catch {
    stored = null;
  }
  return normalizeTelegramBotConfig(stored);
}

export async function writeTelegramBotConfig(env, raw) {
  const prev = await readTelegramBotConfig(env);
  const clean = normalizeTelegramBotConfig(raw);
  clean.version = Math.min(prev.version + 1, 2147483647);
  clean.updatedAt = new Date().toISOString();
  await env.VOTES.put(TELEGRAM_BOT_CONFIG_KEY, JSON.stringify(clean));
  return clean;
}
