import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import { onRequestPost } from '../functions/api/tg-ton-credit.js';

const BOT_TOKEN = '123456:ton-credit-test-token';
const USER_ID = '778812';
const REQUEST_ID = 'credit-request-0001';
const CHECKOUT_PROTOCOL = 'megaton-paid-gacha-v1';
const PAYLOAD = `megaton:ton_credit:mgp1:${USER_ID}:${REQUEST_ID}`;
const ENV = {
  TELEGRAM_GAMEBOT_TOKEN: BOT_TOKEN,
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
  MEGATON_PAID_GACHA_CUTOVER_AT: '2026-08-01T00:00:00.000Z',
};

function signedInitData() {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: 'AAE-ton-credit-query',
    user: JSON.stringify({ id: Number(USER_ID), first_name: 'Credit', username: 'buyer' }),
  });
  const check = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  params.set('hash', createHmac('sha256', secret).update(check).digest('hex'));
  return params.toString();
}

function postRequest(overrides = {}) {
  return new Request('https://game-factory.tech/api/tg-ton-credit', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://game-factory.tech',
    },
    body: JSON.stringify({
      action: 'spend',
      game: 'megaton',
      productId: 'arsenal_payload',
      requestId: REQUEST_ID,
      initData: signedInitData(),
      checkoutProtocol: CHECKOUT_PROTOCOL,
      ...overrides,
    }),
  });
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function spendRow(overrides = {}) {
  return {
    payload: PAYLOAD,
    game: 'megaton',
    product_id: 'arsenal_payload',
    telegram_user_id: USER_ID,
    currency: 'TON_CREDIT',
    total_amount: 200000000,
    telegram_payment_charge_id: null,
    provider_payment_charge_id: `ton-credit:mgp1:${USER_ID}:${REQUEST_ID}`,
    status: 'paid',
    raw: {
      source: 'ton_credit_spend',
      requestId: REQUEST_ID,
      checkoutProtocol: CHECKOUT_PROTOCOL,
      checkoutLineage: 'mgp1',
    },
    paid_at: '2026-08-01T10:00:00.000Z',
    created_at: '2026-08-01T10:00:00.000Z',
    player_state: { __server: { tonCreditNanotons: '800000000' } },
    state_rev: 22,
    credit_nanotons: 800000000,
    idempotent: false,
    ...overrides,
  };
}

function receiptRow(overrides = {}) {
  return {
    receipt_id: 'bbbbbbbb-2222-4333-8444-555555555555',
    product_id: 'arsenal_payload',
    purchase_currency: 'TON_CREDIT',
    purchase_total_amount: 200000000,
    purchase_paid_at: '2026-08-01T10:00:00.000Z',
    catalog_version: 'megaton-paid-gacha-v1-2026-08-01',
    rolls: [{
      index: 0,
      itemId: 'rare_sky_needle',
      name: 'Sky Needle',
      rarity: 'rare',
      boost: { kind: 'yield_mult', label: 'Blast yield', value: 0.014 },
      paidDuplicate: false,
      paidCopiesAfter: 1,
    }],
    roll_count: 1,
    created_at: '2026-08-01T10:00:01.000Z',
    idempotent: false,
    total_paid_rolls: 1,
    unique_paid_items: 1,
    duplicate_paid_rolls: 0,
    ...overrides,
  };
}

async function withBackend(run, options = {}) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  let spendCalls = 0;
  let redeemCalls = 0;
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url: parsed, body, init });

    if (parsed.pathname.endsWith('/telegram_players')) {
      return jsonResponse([{ telegram_user_id: USER_ID }]);
    }
    if (parsed.pathname.endsWith('/rpc/spend_megaton_ton_credit')) {
      spendCalls += 1;
      if (options.insufficient) {
        return jsonResponse({ message: 'insufficient_ton_credit:100000000:200000000' }, 400);
      }
      const row = typeof options.spendRow === 'function'
        ? options.spendRow(spendCalls)
        : options.spendRow || spendRow({ idempotent: spendCalls > 1 });
      return jsonResponse([row]);
    }
    if (parsed.pathname.endsWith('/rpc/redeem_megaton_paid_gacha')) {
      redeemCalls += 1;
      const row = typeof options.receiptRow === 'function'
        ? options.receiptRow(redeemCalls)
        : options.receiptRow || receiptRow({ idempotent: redeemCalls > 1 });
      return jsonResponse([row]);
    }
    throw new Error(`Unexpected backend request: ${parsed.pathname}`);
  };

  try {
    return await run({ calls, spendCalls: () => spendCalls, redeemCalls: () => redeemCalls });
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('TON credit gacha spend returns a server receipt and resumes idempotently with one request id', async () => {
  await withBackend(async ({ calls, spendCalls, redeemCalls }) => {
    const first = await onRequestPost({ request: postRequest(), env: ENV });
    assert.equal(first.status, 200);
    const firstData = await first.json();
    assert.equal(firstData.productId, 'arsenal_payload');
    assert.equal(firstData.payload, PAYLOAD);
    assert.equal(firstData.requestId, REQUEST_ID);
    assert.deepEqual(firstData.state, { __server: { tonCreditNanotons: '800000000' } });
    assert.equal(firstData.stateRev, 22);
    assert.equal(firstData.serverGrantApplied, false);
    assert.equal(firstData.receipt.receiptId, 'bbbbbbbb-2222-4333-8444-555555555555');
    assert.equal(firstData.receipt.payment.currency, 'TON_CREDIT');
    assert.equal(firstData.creditNanotons, '800000000');
    assert.equal(firstData.idempotent, false);

    const retry = await onRequestPost({ request: postRequest(), env: ENV });
    assert.equal(retry.status, 200);
    const retryData = await retry.json();
    assert.equal(retryData.payload, firstData.payload);
    assert.equal(retryData.receipt.receiptId, firstData.receipt.receiptId);
    assert.equal(retryData.creditNanotons, firstData.creditNanotons);
    assert.equal(retryData.idempotent, true);
    assert.equal(retryData.receipt.idempotent, true);
    assert.equal(spendCalls(), 2);
    assert.equal(redeemCalls(), 2);

    const spends = calls.filter((call) => call.url.pathname.endsWith('/rpc/spend_megaton_ton_credit'));
    assert.deepEqual(spends.map((call) => call.body.p_request_id), [REQUEST_ID, REQUEST_ID]);
    assert.deepEqual(spends.map((call) => call.body.p_product_id), ['arsenal_payload', 'arsenal_payload']);
    assert.deepEqual(spends.map((call) => call.body.p_checkout_protocol), [CHECKOUT_PROTOCOL, CHECKOUT_PROTOCOL]);
    assert.deepEqual(spends.map((call) => call.body.p_cutover_at), [
      ENV.MEGATON_PAID_GACHA_CUTOVER_AT,
      ENV.MEGATON_PAID_GACHA_CUTOVER_AT,
    ]);
    const redemptions = calls.filter((call) => call.url.pathname.endsWith('/rpc/redeem_megaton_paid_gacha'));
    assert.deepEqual(redemptions.map((call) => call.body.p_cutover_at), [
      ENV.MEGATON_PAID_GACHA_CUTOVER_AT,
      ENV.MEGATON_PAID_GACHA_CUTOVER_AT,
    ]);
  });
});

test('TON credit paid gacha refuses an unmarked client before any debit', async () => {
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error('unmarked TON credit must not reach the database');
  };
  try {
    const response = await onRequestPost({
      request: postRequest({ checkoutProtocol: '' }),
      env: ENV,
    });
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /checkout protocol/i);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('TON credit spend reports insufficient balance without rolling or returning a fallback', async () => {
  await withBackend(async ({ redeemCalls }) => {
    const response = await onRequestPost({ request: postRequest(), env: ENV });
    assert.equal(response.status, 402);
    const data = await response.json();
    assert.equal(data.status, 'insufficient_credit');
    assert.equal(data.creditNanotons, '100000000');
    assert.equal(data.requiredNanotons, '200000000');
    assert.equal(Object.hasOwn(data, 'receipt'), false);
    assert.equal(redeemCalls(), 0);
  }, { insufficient: true });
});

test('TON credit purchase row is revalidated before the paid roll RPC', async () => {
  await withBackend(async ({ redeemCalls }) => {
    const response = await onRequestPost({ request: postRequest(), env: ENV });
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /purchase_owner_mismatch/);
    assert.equal(redeemCalls(), 0);
  }, { spendRow: spendRow({ telegram_user_id: '999004' }) });
});
