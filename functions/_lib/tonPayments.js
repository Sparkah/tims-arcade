import { getProduct, getTonConfig, hasTonPrice } from './tgProducts.js';

const TON_COMMENT_OP_BYTES = [0, 0, 0, 0];
const MAX_COMMENT_BYTES = 123;

function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  if (typeof btoa === 'function') return btoa(binary);
  return Buffer.from(bytes).toString('base64');
}

export function textCommentBocBase64(comment) {
  const textBytes = new TextEncoder().encode(String(comment || ''));
  if (textBytes.length > MAX_COMMENT_BYTES) {
    const error = new Error('TON comment is too long');
    error.code = 'ton_comment_too_long';
    throw error;
  }

  const payload = new Uint8Array(TON_COMMENT_OP_BYTES.length + textBytes.length);
  payload.set(TON_COMMENT_OP_BYTES, 0);
  payload.set(textBytes, TON_COMMENT_OP_BYTES.length);

  const cellSize = 2 + payload.length;
  if (cellSize > 255) {
    const error = new Error('TON comment cell is too large');
    error.code = 'ton_comment_cell_too_large';
    throw error;
  }

  const bytes = new Uint8Array(11 + cellSize);
  let i = 0;
  bytes.set([0xb5, 0xee, 0x9c, 0x72], i); i += 4;
  bytes[i] = 0x01; i += 1; // no index, no CRC, 1-byte counters.
  bytes[i] = 0x01; i += 1; // offset byte width.
  bytes[i] = 0x01; i += 1; // cells count.
  bytes[i] = 0x01; i += 1; // root count.
  bytes[i] = 0x00; i += 1; // absent count.
  bytes[i] = cellSize; i += 1;
  bytes[i] = 0x00; i += 1; // root cell index.
  bytes[i] = 0x00; i += 1; // ordinary cell, no refs.
  bytes[i] = payload.length * 2; i += 1; // full-byte data bit length.
  bytes.set(payload, i);

  return bytesToBase64(bytes);
}

export function createTonOrderPayload(game, productId) {
  const nonce = crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now()) + Math.random().toString(16).slice(2);
  return ['ton', game, productId, nonce].join(':');
}

export function buildTonOrder(game, productId, env = {}) {
  const product = getProduct(game, productId);
  const config = getTonConfig(game, env);
  if (!product || !config || !hasTonPrice(product)) return null;

  const payload = createTonOrderPayload(game, productId);
  const memo = `${config.memoPrefix}:${payload}`;
  const validUntil = Math.floor(Date.now() / 1000) + 10 * 60;
  return {
    game,
    productId,
    title: product.title,
    recipient: config.recipient,
    network: config.network,
    ton: product.ton,
    nanotons: String(product.nanotons),
    payload,
    memo,
    payloadBoc: textCommentBocBase64(memo),
    validUntil,
  };
}

export function productForTonOrder(game, productId) {
  const product = getProduct(game, productId);
  if (!product || !hasTonPrice(product)) return null;
  return product;
}

export function expectedTonMemo(game, payload, env = {}) {
  const config = getTonConfig(game, env);
  return config ? `${config.memoPrefix}:${payload}` : null;
}

export function toBigIntAmount(value) {
  try {
    if (value === undefined || value === null || value === '') return 0n;
    return BigInt(String(value));
  } catch {
    return 0n;
  }
}

export function publicTonPurchase(row) {
  if (!row) return null;
  return {
    payload: row.payload,
    productId: row.product_id,
    currency: row.currency,
    totalAmount: row.total_amount,
    status: row.status,
    paidAt: row.paid_at,
  };
}

function tonapiComment(tx) {
  const msg = tx && tx.in_msg;
  if (!msg) return '';
  return String(
    (msg.decoded_body && (msg.decoded_body.text || msg.decoded_body.comment)) ||
    (msg.message_content && msg.message_content.decoded && msg.message_content.decoded.comment) ||
    msg.message ||
    '',
  );
}

function tonapiInboundValue(tx) {
  return toBigIntAmount(tx && tx.in_msg && tx.in_msg.value);
}

function txHash(tx) {
  return String((tx && (tx.hash || tx.transaction_id && tx.transaction_id.hash)) || '');
}

export async function findTonPayment(env, order) {
  const expected = toBigIntAmount(order.nanotons);
  const createdMs = Number.isFinite(order.createdMs) ? order.createdMs : 0;
  const earliestUtime = createdMs ? Math.floor((createdMs - 2 * 60 * 1000) / 1000) : 0;

  // The recipient is Tim's SHARED TON wallet across several Mini Apps, so a
  // legit payment can be pushed past the newest 50 txs before verify runs,
  // which would leave a buyer paid with no goods. TonAPI's blockchain
  // transactions endpoint has no memo/comment filter, so we page backwards
  // through history via before_lt (results come newest-first), scanning up to
  // MAX_TXS. We stop early the moment we match, or once a page's oldest tx
  // already predates the acceptance window — older pages cannot hold a payment
  // that was made after the order was created. Every match condition below is
  // unchanged from the single-page version; this only widens the search window.
  const PAGE_LIMIT = 50;
  const MAX_TXS = 250;
  let beforeLt = '';
  let scanned = 0;

  while (scanned < MAX_TXS) {
    const url = new URL(`https://tonapi.io/v2/blockchain/accounts/${encodeURIComponent(order.recipient)}/transactions`);
    url.searchParams.set('limit', String(PAGE_LIMIT));
    if (beforeLt) url.searchParams.set('before_lt', beforeLt);

    const response = await fetch(url.toString(), {
      headers: {
        accept: 'application/json',
        ...(env.TONAPI_KEY ? { authorization: `Bearer ${env.TONAPI_KEY}` } : {}),
      },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data) {
      const error = new Error(`TONAPI request failed: ${response.status}`);
      error.status = response.status;
      error.body = data;
      throw error;
    }

    const txs = Array.isArray(data.transactions) ? data.transactions : [];
    if (!txs.length) break;

    for (const tx of txs) {
      scanned += 1;
      if (!tx || !tx.in_msg) continue;
      if (tx.success === false) continue;
      if (tx.in_msg.bounced) continue;
      if (earliestUtime && Number(tx.utime || 0) < earliestUtime) continue;
      if (tonapiInboundValue(tx) < expected) continue;
      if (tonapiComment(tx) !== order.memo) continue;

      return {
        hash: txHash(tx),
        lt: String(tx.lt || ''),
        utime: Number(tx.utime || 0),
        source: tx.in_msg.source || null,
        destination: tx.in_msg.destination || null,
        value: String(tx.in_msg.value || ''),
        comment: tonapiComment(tx),
        raw: tx,
      };
    }

    // Page to the next (older) slice. Stop when history is exhausted (a short
    // page or no lt to page from) or the oldest tx already predates the window.
    const oldest = txs[txs.length - 1];
    const oldestLt = oldest && oldest.lt ? String(oldest.lt) : '';
    if (!oldestLt || oldestLt === beforeLt || txs.length < PAGE_LIMIT) break;
    if (earliestUtime && Number(oldest.utime || 0) < earliestUtime) break;
    beforeLt = oldestLt;
  }

  return null;
}
