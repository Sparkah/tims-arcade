import { jsonError, sameOriginOk } from '../_lib/response.js';

const PRODUCTS_BY_GAME = {
  starfall: {
    starter: {
      title: 'Starfall Sprint Starter Pack',
      description: '500 coins, 3 revives, and the mint comet trail.',
      amount: 25,
    },
    doubler: {
      title: 'Starfall Sprint Coin Doubler',
      description: 'Permanent double coin rewards inside Starfall Sprint.',
      amount: 75,
    },
    revives: {
      title: 'Starfall Sprint Revive Bundle',
      description: '8 revive tokens for Starfall Sprint.',
      amount: 35,
    },
    nova_skin: {
      title: 'Starfall Sprint Nova Skin Pack',
      description: 'Two premium catcher skins and 1200 coins.',
      amount: 99,
    },
  },
  megaton: {
    starter: {
      title: 'Megaton Starter Cache',
      description: '1500 caps, Yield level 2, and +1 Luck.',
      amount: 25,
    },
    caps_pack: {
      title: 'Megaton Caps Pack',
      description: '5000 caps for the next upgrade wall.',
      amount: 49,
    },
    warhead_tuning: {
      title: 'Megaton Warhead Tuning',
      description: '+4 Yield, +2 Luck, and 1200 caps.',
      amount: 75,
    },
    mirv_kit: {
      title: 'Megaton MIRV Kit',
      description: '+1 MIRV, +2 Penetrator, +2 Flares, and 1800 caps.',
      amount: 99,
    },
  },
};

export async function onRequestPost({ request, env }) {
  if (!sameOriginOk(request)) return jsonError('bad origin', 403);
  if (!env.TELEGRAM_GAMEBOT_TOKEN) return jsonError('telegram bot token not configured', 503);

  let body;
  try { body = await request.json(); }
  catch { return jsonError('bad json', 400); }

  const gameId = String(body.game || '').toLowerCase();
  if (!Object.hasOwn(PRODUCTS_BY_GAME, gameId)) return jsonError('bad game', 400);
  const products = PRODUCTS_BY_GAME[gameId];
  const productId = String(body.productId || '');
  if (!Object.hasOwn(products, productId)) return jsonError('bad product', 400);
  const product = products[productId];

  const initData = String(body.initData || '');
  const auth = await verifyTelegramInitData(initData, env.TELEGRAM_GAMEBOT_TOKEN);
  if (!auth.ok) return jsonError(auth.error, 401);

  const userId = auth.user && auth.user.id ? String(auth.user.id) : 'unknown';
  const nonce = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
  // Payload format is shared with @gamesfactorybot's payment recorder:
  // <gameId>:<productId>:<userId>:<timestamp>:<nonce>. The Mini App applies
  // delivery immediately after Telegram reports openInvoice() == 'paid'.
  const payload = [gameId, productId, userId, Date.now(), nonce].join(':');

  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_GAMEBOT_TOKEN}/createInvoiceLink`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: product.title,
      description: product.description,
      payload,
      provider_token: '',
      currency: 'XTR',
      prices: [{ label: product.title, amount: product.amount }],
    }),
  });
  const data = await res.json().catch(() => null);
  if (!data || !data.ok || !data.result) {
    return jsonError((data && data.description) || 'invoice failed', 502);
  }

  return Response.json({
    invoiceLink: data.result,
    productId,
    stars: product.amount,
  }, {
    headers: { 'cache-control': 'no-store' },
  });
}

async function verifyTelegramInitData(initData, botToken) {
  if (!initData) return { ok: false, error: 'open in telegram to buy' };
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return { ok: false, error: 'missing hash' };
  params.delete('hash');

  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate || Date.now() / 1000 - authDate > 2 * 24 * 60 * 60) {
    return { ok: false, error: 'telegram session expired' };
  }

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = await hmacBytes(new TextEncoder().encode('WebAppData'), botToken);
  const digest = await hmacHex(secret, dataCheckString);
  if (!safeEqualHex(digest, hash)) return { ok: false, error: 'bad telegram auth' };

  let user = null;
  try { user = JSON.parse(params.get('user') || 'null'); }
  catch { user = null; }
  return { ok: true, user };
}

async function hmacBytes(keyBytes, message) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)));
}

async function hmacHex(keyBytes, message) {
  const signed = await hmacBytes(keyBytes, message);
  return Array.from(signed).map(b => b.toString(16).padStart(2, '0')).join('');
}

function safeEqualHex(a, b) {
  if (!/^[a-f0-9]{64}$/i.test(String(a)) || !/^[a-f0-9]{64}$/i.test(String(b))) return false;
  let out = 0;
  for (let i = 0; i < 64; i++) out |= a.charCodeAt(i) ^ b.toLowerCase().charCodeAt(i);
  return out === 0;
}
