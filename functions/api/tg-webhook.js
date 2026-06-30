import { safeEqual } from '../_lib/adminAuth.js';
import { json, jsonError } from '../_lib/response.js';
import { telegramBotProfile, telegramBotToken } from '../_lib/telegramAuth.js';
import { readTelegramBotConfig } from '../_lib/telegramBotConfig.js';
import {
  markTelegramBroadcastRecipientBlocked,
  optOutTelegramBroadcastRecipient,
  readTelegramBroadcastRecipients,
  recordTelegramBroadcastRecipient,
} from '../_lib/telegramBroadcastRecipients.js';
import {
  PRODUCTS_BY_GAME,
  getProduct,
  hasStarsPrice,
  parsePaymentPayload,
} from '../_lib/tgProducts.js';
import {
  recordTelegramPurchase,
  supabaseIsConfigured,
  upsertTelegramPlayer,
} from '../_lib/supabase.js';

const BASE = 'https://game-factory.tech';
const STARFALL_URL = `${BASE}/tg-starfall/`;
const MEGATON_URL = `${BASE}/tg-megaton/`;
const MAX_RELAY_RECIPIENTS = 5000;
const TG_LIBRARY_VERSION = '20260630-library-v2';

function backendSecret(env = {}) {
  return env.TG_BACKEND_SECRET || env.TELEGRAM_BACKEND_SECRET || '';
}

function cleanSlug(value) {
  const slug = String(value || '').trim().toLowerCase();
  return /^[a-z0-9_-]{1,80}$/.test(slug) ? slug : '';
}

function cleanChatId(value) {
  const raw = String(value || '').trim();
  if (/^@[A-Za-z0-9_]{5,64}$/.test(raw)) return raw;
  if (/^-100\d{5,32}$/.test(raw)) return raw;
  if (/^-?\d{5,32}$/.test(raw)) return raw;
  return '';
}

function botUsername(env, profile) {
  const raw = profile === 'test'
    ? env.TELEGRAM_GAMEBOT_TEST_USERNAME || env.TELEGRAM_TEST_BOT_USERNAME || env.TELEGRAM_GAMEBOT_USERNAME
    : env.TELEGRAM_GAMEBOT_USERNAME;
  return String(raw || (profile === 'test' ? 'gamesfactorytestbot' : 'gamesfactorybot')).replace(/^@/, '');
}

function tokenOrThrow(env, profile) {
  const token = telegramBotToken(env, profile);
  if (token) return token;
  const error = new Error(profile === 'test' ? 'telegram_test_bot_token_not_configured' : 'telegram_bot_token_not_configured');
  error.status = 503;
  throw error;
}

function esc(value) {
  return String(value || '').replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch]);
}

function trunc(value, max) {
  const text = String(value || '');
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '...' : text;
}

async function callBot(env, profile, method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${tokenOrThrow(env, profile)}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data || !data.ok) {
    const error = new Error((data && data.description) || `telegram_${method}_failed`);
    error.status = response.ok ? 502 : response.status;
    throw error;
  }
  return data.result;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
  return response.json();
}

function slugSet(value) {
  return new Set((Array.isArray(value) ? value : []).map(cleanSlug).filter(Boolean));
}

function rankMap(value) {
  const map = new Map();
  (Array.isArray(value) ? value : []).map(cleanSlug).filter(Boolean).forEach((slug, index) => {
    if (!map.has(slug)) map.set(slug, index);
  });
  return map;
}

function bySlug(games) {
  return new Map(games.map((game) => [game.slug, game]));
}

function orderedSelection(games, slugs) {
  const map = bySlug(games);
  return (Array.isArray(slugs) ? slugs : []).map(cleanSlug).map((slug) => map.get(slug)).filter(Boolean);
}

async function getGames() {
  const [manifest, trending, hidden] = await Promise.all([
    fetchJson(`${BASE}/games.json`),
    fetchJson(`${BASE}/api/trending`).catch(() => null),
    fetchJson(`${BASE}/api/hidden`).catch(() => null),
  ]);
  const scores = (trending && trending.games) || {};
  const hiddenSet = slugSet((hidden && hidden.hidden) || []);
  return (Array.isArray(manifest) ? manifest : [])
    .filter((game) => game && !game.external && game.published !== false && cleanSlug(game.slug) && !hiddenSet.has(game.slug))
    .map((game) => ({ ...game, _score: scores[game.slug] && scores[game.slug].score || 0 }))
    .sort((a, b) => (b._score - a._score) || ((b.num || 0) - (a.num || 0)));
}

function curateLibrary(games, config) {
  const library = config.library || {};
  let selected = games.slice();
  if (library.mode === 'selected' && Array.isArray(library.includeSlugs) && library.includeSlugs.length) {
    selected = orderedSelection(games, library.includeSlugs);
  } else {
    const excluded = slugSet(library.excludeSlugs);
    selected = selected.filter((game) => !excluded.has(game.slug));
  }
  const pinned = rankMap(library.pinnedSlugs);
  selected.sort((a, b) => {
    const ap = pinned.has(a.slug) ? pinned.get(a.slug) : 9999;
    const bp = pinned.has(b.slug) ? pinned.get(b.slug) : 9999;
    if (ap !== bp) return ap - bp;
    return (b._score - a._score) || ((b.num || 0) - (a.num || 0));
  });
  return selected.slice(0, Math.max(1, Math.min(Number(library.maxGames) || 180, 240)));
}

function playButton(game, isPrivate, profile, env, label) {
  const text = label || `Play ${game.title || game.slug}`;
  if (isPrivate) return { text, web_app: { url: telegramLibraryUrl(game.slug) } };
  return { text, url: `https://t.me/${botUsername(env, profile)}?start=g_${game.slug}` };
}

function allGamesButton(isPrivate, profile, env, count) {
  const text = `All ${count} games`;
  if (isPrivate) return { text, web_app: { url: telegramLibraryUrl() } };
  return { text, url: `https://t.me/${botUsername(env, profile)}` };
}

function telegramLibraryUrl(slug = '') {
  const params = new URLSearchParams({ v: TG_LIBRARY_VERSION });
  if (slug) params.set('game', slug);
  return `${BASE}/tg/?${params.toString()}`;
}

function megatonButton(isPrivate, profile, env, label = 'Play Megaton') {
  if (isPrivate) return { text: label, web_app: { url: MEGATON_URL } };
  return { text: label, url: `https://t.me/${botUsername(env, profile)}?start=megaton` };
}

function starfallButton(isPrivate, profile, env, label = 'Play Starfall Sprint') {
  if (isPrivate) return { text: label, web_app: { url: STARFALL_URL } };
  return { text: label, url: `https://t.me/${botUsername(env, profile)}?start=starfall` };
}

function termsButton(gameId) {
  const url = gameId === 'starfall' ? STARFALL_URL : MEGATON_URL;
  return { text: 'Terms', url: `${url}terms.html` };
}

async function sendStartWelcome(env, profile, chatId, isPrivate) {
  const [config, games] = await Promise.all([readTelegramBotConfig(env), getGames()]);
  const library = curateLibrary(games, config);
  const startGames = orderedSelection(games, config.start && config.start.gameSlugs);
  const body = [
    `<b>${esc(config.start.headline)}</b>`,
    config.start.body ? esc(config.start.body) : '',
  ].filter(Boolean);
  if (startGames.length) {
    body.push('<b>Featured games</b>\n' + startGames.map((game, index) =>
      `${index + 1}. <b>${esc(game.title)}</b> - ${esc(trunc(game.hook, 76))}`).join('\n'));
  }
  body.push('/megaton - play the Telegram game\n/games - today\'s best picks\n/random - surprise me');

  const keyboard = [];
  const seen = new Set();
  const add = (key, button) => {
    if (seen.has(key)) return;
    seen.add(key);
    keyboard.push([button]);
  };
  const primary = config.start && config.start.primaryAction || {};
  if (primary.type === 'library') add('library', allGamesButton(isPrivate, profile, env, library.length));
  else if (primary.type === 'game') {
    const game = bySlug(games).get(primary.slug);
    if (game) add(`game:${game.slug}`, playButton(game, isPrivate, profile, env, primary.label || `Play ${game.title}`));
  } else add('megaton', megatonButton(isPrivate, profile, env, primary.label || 'Play Megaton'));
  if (config.start.showMegaton) add('megaton', megatonButton(isPrivate, profile, env));
  for (const game of startGames) add(`game:${game.slug}`, playButton(game, isPrivate, profile, env, `Play ${game.title}`));
  if (config.start.showLibrary || !keyboard.length) add('library', allGamesButton(isPrivate, profile, env, library.length));

  await callBot(env, profile, 'sendMessage', {
    chat_id: chatId,
    text: body.join('\n\n'),
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: keyboard },
  });
}

async function sendTopGames(env, profile, chatId, isPrivate) {
  const [config, games] = await Promise.all([readTelegramBotConfig(env), getGames()]);
  const library = curateLibrary(games, config);
  const top = [];
  const seen = new Set();
  for (const game of orderedSelection(games, config.top && config.top.gameSlugs)) {
    top.push(game);
    seen.add(game.slug);
    if (top.length >= config.top.maxGames) break;
  }
  for (const game of library) {
    if (seen.has(game.slug)) continue;
    top.push(game);
    if (top.length >= config.top.maxGames) break;
  }
  if (!top.length) return sendStartWelcome(env, profile, chatId, isPrivate);
  const text = `<b>${esc(config.top.title || 'Hot right now')}</b>\n\n` + top.map((game, index) =>
    `${index + 1}. <b>${esc(game.title)}</b> - ${esc(trunc(game.hook, 80))}`).join('\n');
  await callBot(env, profile, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        ...top.map((game, index) => [playButton(game, isPrivate, profile, env, `${index + 1}. ${game.title}`)]),
        [allGamesButton(isPrivate, profile, env, library.length)],
      ],
    },
  });
}

async function sendGameCard(env, profile, chatId, game, isPrivate, header = '') {
  const games = await getGames();
  const library = curateLibrary(games, await readTelegramBotConfig(env));
  const caption = `${header ? `${header}\n\n` : ''}<b>${esc(game.title)}</b>\n${esc(trunc(game.hook, 180))}`;
  await callBot(env, profile, 'sendMessage', {
    chat_id: chatId,
    text: caption,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [playButton(game, isPrivate, profile, env, 'Play')],
        [allGamesButton(isPrivate, profile, env, library.length)],
      ],
    },
  });
}

async function sendMegaton(env, profile, chatId, isPrivate) {
  await callBot(env, profile, 'sendMessage', {
    chat_id: chatId,
    text: '<b>Megaton</b>\nDrop one warhead, level the city, tune your nuke, and use Telegram Stars for optional caps and upgrades.',
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[megatonButton(isPrivate, profile, env)]] },
  });
}

async function sendStarfall(env, profile, chatId, isPrivate) {
  const games = await getGames();
  const library = curateLibrary(games, await readTelegramBotConfig(env));
  await callBot(env, profile, 'sendMessage', {
    chat_id: chatId,
    text: '<b>Starfall Sprint</b>\nCatch falling stars, dodge meteors, upgrade your catcher, and use Telegram Stars for optional boosts.',
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [starfallButton(isPrivate, profile, env)],
        [allGamesButton(isPrivate, profile, env, library.length)],
        [termsButton('starfall')],
      ],
    },
  });
}

function starsProducts(gameId) {
  const products = PRODUCTS_BY_GAME[gameId] || PRODUCTS_BY_GAME.megaton || {};
  return Object.entries(products).filter(([, product]) => hasStarsPrice(product));
}

function productLines(gameId) {
  return starsProducts(gameId).map(([id, product]) => {
    const title = String(product.title || id)
      .replace(/^Megaton\s+/, '')
      .replace(/^Starfall Sprint\s+/, '');
    return `<code>${esc(id)}</code> - <b>${esc(title)}</b>, ${Number(product.amount)} Stars`;
  }).join('\n');
}

async function sendBuyHelp(env, profile, chatId, gameId = 'megaton', isPrivate = true) {
  const cleanGame = gameId === 'starfall' ? 'starfall' : 'megaton';
  const title = cleanGame === 'starfall' ? 'Starfall Sprint Stars shop' : 'Megaton Stars shop';
  const openButton = cleanGame === 'starfall'
    ? starfallButton(isPrivate, profile, env, 'Open Starfall Sprint')
    : megatonButton(isPrivate, profile, env, 'Open Megaton');
  const examples = cleanGame === 'starfall'
    ? '<code>/buy starfall starter</code>, <code>/buy starfall doubler</code>, <code>/buy starfall revives</code>, or <code>/buy starfall nova_skin</code>'
    : '<code>/buy starter</code>, <code>/buy caps_pack</code>, <code>/buy warhead_tuning</code>, or <code>/buy mirv_kit</code>';
  await callBot(env, profile, 'sendMessage', {
    chat_id: chatId,
    parse_mode: 'HTML',
    text: `<b>${esc(title)}</b>\n\n${productLines(cleanGame)}\n\nBuy in the Mini App, or send ${examples}.`,
    reply_markup: { inline_keyboard: [[openButton], [termsButton(cleanGame)]] },
  });
}

async function sendInvoice(env, profile, chatId, productId, userId, gameId = 'megaton') {
  const cleanGame = gameId === 'starfall' ? 'starfall' : 'megaton';
  const product = getProduct(cleanGame, productId);
  if (!hasStarsPrice(product)) return sendBuyHelp(env, profile, chatId, cleanGame, true);
  const payload = [
    cleanGame,
    productId,
    String(userId || chatId || 'chat'),
    String(Date.now()),
    crypto.randomUUID().replace(/-/g, '').slice(0, 24),
  ].join(':');
  await callBot(env, profile, 'sendInvoice', {
    chat_id: chatId,
    title: product.title,
    description: product.description,
    payload,
    provider_token: '',
    currency: 'XTR',
    prices: [{ label: product.title, amount: Number(product.amount) }],
    reply_markup: { inline_keyboard: [[termsButton(cleanGame)]] },
  });
}

function paymentRecordFromMessage(msg) {
  const payment = msg && msg.successful_payment;
  if (!payment) return null;
  const parsed = parsePaymentPayload(payment.invoice_payload);
  const from = msg.from || {};
  return {
    parsed,
    record: {
      at: new Date().toISOString(),
      chat_id: msg.chat && msg.chat.id,
      from: {
        id: from.id,
        username: from.username || null,
        first_name: from.first_name || null,
        last_name: from.last_name || null,
        language_code: from.language_code || null,
        is_premium: Boolean(from.is_premium),
      },
      game: parsed && parsed.game,
      product_id: parsed && parsed.productId,
      telegram_user_id: (parsed && parsed.telegramUserId) || (from.id && String(from.id)),
      payload: payment.invoice_payload,
      currency: payment.currency,
      total_amount: payment.total_amount,
      telegram_payment_charge_id: payment.telegram_payment_charge_id,
      provider_payment_charge_id: payment.provider_payment_charge_id,
      status: 'paid',
      raw: {
        successful_payment: payment,
        from: msg.from || null,
        chat: msg.chat || null,
      },
    },
  };
}

async function onSuccessfulPayment(env, profile, msg) {
  const saved = paymentRecordFromMessage(msg);
  const parsed = saved && saved.parsed;
  const product = parsed && getProduct(parsed.game, parsed.productId);
  let synced = false;
  if (parsed && product && supabaseIsConfigured(env)) {
    try {
      await upsertTelegramPlayer(env, {
        id: parsed.telegramUserId,
        username: msg.from && msg.from.username || null,
        first_name: msg.from && msg.from.first_name || null,
        last_name: msg.from && msg.from.last_name || null,
        language_code: msg.from && msg.from.language_code || null,
        is_premium: Boolean(msg.from && msg.from.is_premium),
      });
      await recordTelegramPurchase(env, saved.record);
      synced = true;
    } catch (error) {
      console.error('tg-webhook purchase sync failed', error && error.message || error);
    }
  }
  const game = parsed && parsed.game === 'starfall' ? 'starfall' : 'megaton';
  const returnButton = game === 'starfall'
    ? starfallButton(true, profile, env, 'Return to Starfall Sprint')
    : megatonButton(true, profile, env, 'Return to Megaton');
  const text = synced
    ? `<b>Payment received.</b>\n\n${esc(product ? product.title : 'Item')} is recorded. If the Mini App is still open, it should apply the item automatically after the invoice closes.\n\nIf anything looks wrong, send <code>/paysupport</code> with the purchase time.`
    : '<b>Payment received.</b>\n\nThe payment reached the bot, but the backend receipt was not recorded. Send <code>/paysupport</code> with the purchase time so I can fix it.';
  await callBot(env, profile, 'sendMessage', {
    chat_id: msg.chat.id,
    parse_mode: 'HTML',
    text,
    reply_markup: { inline_keyboard: [[returnButton], [termsButton(game)]] },
  });
}

async function onPreCheckoutQuery(env, profile, query) {
  const parsed = parsePaymentPayload(query.invoice_payload);
  const product = parsed && getProduct(parsed.game, parsed.productId);
  await callBot(env, profile, 'answerPreCheckoutQuery', {
    pre_checkout_query_id: query.id,
    ok: Boolean(parsed && hasStarsPrice(product)),
    error_message: parsed && hasStarsPrice(product) ? undefined : 'Unknown game item.',
  });
}

async function recordSupport(env, profile, msg, kind, body) {
  if (!env || !env.VOTES) return;
  const id = crypto.randomUUID();
  const key = `telegram:support:${profile}:${Date.now()}:${id}`;
  await env.VOTES.put(key, JSON.stringify({
    at: new Date().toISOString(),
    kind,
    botProfile: profile,
    chat: msg.chat || null,
    from: msg.from || null,
    text: String(body || '').slice(0, 2000),
  }), { expirationTtl: 60 * 60 * 24 * 180 });
}

async function registerPrivateUser(env, profile, msg, source, reactivate = false) {
  if (!msg || !msg.chat || msg.chat.type !== 'private' || !msg.from) return;
  await recordTelegramBroadcastRecipient(env, {
    botProfile: profile,
    chat: msg.chat,
    chatId: msg.chat.id,
    user: msg.from,
    source,
    reactivate,
  });
}

async function handleMessage(env, profile, msg) {
  const chat = msg.chat || {};
  const isPrivate = chat.type === 'private';
  if (msg.successful_payment) {
    if (isPrivate) await registerPrivateUser(env, profile, msg, 'successful_payment');
    return onSuccessfulPayment(env, profile, msg);
  }
  const text = String(msg.text || '').trim();
  if (!text) return;
  const match = text.match(/^\/(\w+)(?:@(\w+))?(?:\s+(.*))?$/s);
  if (!match) {
    if (isPrivate) {
      await registerPrivateUser(env, profile, msg, 'bot_message');
      await callBot(env, profile, 'sendMessage', { chat_id: chat.id, text: 'Try /games, /random, or /megaton.' });
    }
    return;
  }
  const [, rawCmd, mention, arg = ''] = match;
  const cmd = rawCmd.toLowerCase();
  if (mention && mention.toLowerCase() !== botUsername(env, profile).toLowerCase()) return;

  if (cmd === 'stop' || cmd === 'unsubscribe') {
    await optOutTelegramBroadcastRecipient(env, profile, chat.id, 'user_stop');
    await callBot(env, profile, 'sendMessage', { chat_id: chat.id, text: 'Broadcast updates stopped. You can still use /games, /random, and /megaton any time.' });
    return;
  }

  if (isPrivate) await registerPrivateUser(env, profile, msg, cmd === 'start' ? 'bot_start' : 'bot_message', cmd === 'start');

  if (cmd === 'start') {
    const startArg = String(arg || '').trim();
    if (startArg === 'megaton') return sendMegaton(env, profile, chat.id, isPrivate);
    if (startArg === 'starfall') return sendStarfall(env, profile, chat.id, isPrivate);
    if (/^g_[\w-]+$/.test(startArg)) {
      const game = (await getGames()).find((item) => item.slug === startArg.slice(2));
      if (game) return sendGameCard(env, profile, chat.id, game, isPrivate, 'Here you go:');
    }
    return sendStartWelcome(env, profile, chat.id, isPrivate);
  }
  if (cmd === 'games' || cmd === 'top') return sendTopGames(env, profile, chat.id, isPrivate);
  if (cmd === 'megaton' || cmd === 'play') return sendMegaton(env, profile, chat.id, isPrivate);
  if (cmd === 'starfall') return sendStarfall(env, profile, chat.id, isPrivate);
  if (cmd === 'random') {
    const config = await readTelegramBotConfig(env);
    const games = curateLibrary(await getGames(), config);
    const game = games[Math.floor(Math.random() * games.length)];
    return game ? sendGameCard(env, profile, chat.id, game, isPrivate, 'Random pick:') : sendMegaton(env, profile, chat.id, isPrivate);
  }
  if (cmd === 'shop') return sendBuyHelp(env, profile, chat.id, String(arg || '').trim().toLowerCase() === 'starfall' ? 'starfall' : 'megaton', isPrivate);
  if (cmd === 'buy') {
    if (!isPrivate) {
      await callBot(env, profile, 'sendMessage', {
        chat_id: chat.id,
        text: 'Please open the bot in DM to buy Telegram Stars items.',
        reply_markup: { inline_keyboard: [[megatonButton(false, profile, env, 'Open Megaton')]] },
      });
      return;
    }
    const bits = String(arg || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    const gameId = bits[0] === 'starfall' ? bits.shift() : 'megaton';
    const productId = bits[0] || '';
    if (!productId) return sendBuyHelp(env, profile, chat.id, gameId, true);
    return sendInvoice(env, profile, chat.id, productId, msg.from && msg.from.id, gameId);
  }
  if (cmd === 'terms') {
    await callBot(env, profile, 'sendMessage', {
      chat_id: chat.id,
      parse_mode: 'HTML',
      text: `<b>Megaton purchase terms</b>\n\nOptional digital items use Telegram Stars. Items are delivered inside the Mini App after Telegram reports a paid invoice. Digital items are normally final once delivered, except where applicable law or Telegram policy requires otherwise.\n\nTerms page: ${MEGATON_URL}terms.html`,
      reply_markup: { inline_keyboard: [[termsButton('megaton')], [megatonButton(isPrivate, profile, env)]] },
    });
    return;
  }
  if (cmd === 'support' || cmd === 'paysupport') {
    const body = String(arg || '').trim();
    if (!body) {
      await callBot(env, profile, 'sendMessage', {
        chat_id: chat.id,
        parse_mode: 'HTML',
        text: cmd === 'paysupport'
          ? 'Send <code>/paysupport</code> followed by the purchase problem and approximate time. Example: <code>/paysupport Starter Pack paid but not visible, 21:40</code>.'
          : 'Send <code>/support</code> followed by the issue. Example: <code>/support Megaton freezes after the result screen</code>.',
      });
      return;
    }
    await recordSupport(env, profile, msg, cmd, body);
    await callBot(env, profile, 'sendMessage', {
      chat_id: chat.id,
      text: cmd === 'paysupport'
        ? 'Payment support request recorded. Keep this chat available for follow-up.'
        : 'Support request recorded. Keep this chat available for follow-up.',
    });
    return;
  }
  if (cmd === 'help') {
    await callBot(env, profile, 'sendMessage', {
      chat_id: chat.id,
      text: '/megaton - Telegram-first game\n/games - best games right now\n/random - a random game\n/shop - Stars item list\n/terms - purchase terms\n/support - game support\n/paysupport - payment support\n/stop - stop broadcast updates',
    });
    return;
  }
  if (cmd === 'id' || cmd === 'chatid') {
    await callBot(env, profile, 'sendMessage', {
      chat_id: chat.id,
      parse_mode: 'HTML',
      text: `<b>Chat id</b>\n<code>${esc(chat.id)}</code>`,
    });
  }
}

function relaySourceMatches(chat, sourceChatId) {
  const source = String(sourceChatId || '').trim();
  if (!source || !chat) return false;
  if (source.startsWith('@')) return chat.username && source.toLowerCase() === `@${chat.username}`.toLowerCase();
  return String(chat.id) === source;
}

function isRecipientInactiveError(error) {
  const message = String(error && error.message || '');
  return error && (
    error.status === 403 ||
    /bot was blocked|user is deactivated|can't initiate conversation/i.test(message)
  );
}

async function copyChannelPostToUsers(env, profile, msg) {
  const recipients = await readTelegramBroadcastRecipients(env, profile);
  const selected = recipients.slice(0, MAX_RELAY_RECIPIENTS);
  for (const recipient of selected) {
    try {
      await callBot(env, profile, 'copyMessage', {
        chat_id: recipient.chatId,
        from_chat_id: msg.chat.id,
        message_id: msg.message_id,
      });
    } catch (error) {
      if (isRecipientInactiveError(error)) {
        await markTelegramBroadcastRecipientBlocked(env, profile, recipient.chatId, error.message);
      }
    }
  }
}

async function handleChannelPost(env, profile, msg) {
  const config = await readTelegramBotConfig(env);
  const relay = config.relay || {};
  if (!relay.enabled || !relay.sourceChatId || !relaySourceMatches(msg.chat, relay.sourceChatId)) return;
  if (relay.broadcastUsers) await copyChannelPostToUsers(env, profile, msg);
  for (const target of Array.isArray(relay.targetChatIds) ? relay.targetChatIds : []) {
    const chatId = cleanChatId(target);
    if (!chatId || String(chatId) === String(msg.chat.id)) continue;
    await callBot(env, profile, 'copyMessage', {
      chat_id: chatId,
      from_chat_id: msg.chat.id,
      message_id: msg.message_id,
    });
  }
}

async function handleMyChatMember(env, profile, update) {
  const chat = update.chat || {};
  const status = update.new_chat_member && update.new_chat_member.status;
  const wasOut = ['left', 'kicked'].includes(update.old_chat_member && update.old_chat_member.status);
  if (!['group', 'supergroup'].includes(chat.type) || !['member', 'administrator'].includes(status) || !wasOut) return;
  await callBot(env, profile, 'sendMessage', {
    chat_id: chat.id,
    text: '<b>Game Factory</b>\nType /megaton for the Telegram game or /games for the best factory games.',
    parse_mode: 'HTML',
  });
  await sendTopGames(env, profile, chat.id, false);
}

async function handleUpdate(env, profile, update) {
  if (update.message) await handleMessage(env, profile, update.message);
  else if (update.channel_post) await handleChannelPost(env, profile, update.channel_post);
  else if (update.my_chat_member) await handleMyChatMember(env, profile, update.my_chat_member);
  else if (update.pre_checkout_query) await onPreCheckoutQuery(env, profile, update.pre_checkout_query);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const configured = backendSecret(env);
  if (!configured) return jsonError('backend_secret_not_configured', 503);
  const supplied = request.headers.get('x-telegram-bot-api-secret-token') || '';
  if (!supplied || !safeEqual(supplied, configured)) return jsonError('forbidden', 403);

  const profile = telegramBotProfile(new URL(request.url).searchParams.get('profile'));
  let update;
  try {
    update = await request.json();
  } catch {
    return jsonError('bad_json', 400);
  }
  const task = handleUpdate(env, profile, update).catch((error) => {
    console.error('tg-webhook handler failed', error && error.message || error);
  });
  if (context.waitUntil) context.waitUntil(task);
  else await task;
  return json({ ok: true }, 200, { 'cache-control': 'no-store' });
}

export async function onRequestGet() {
  return json({ ok: true, endpoint: 'tg-webhook' }, 200, { 'cache-control': 'no-store' });
}
