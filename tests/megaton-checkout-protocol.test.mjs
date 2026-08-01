import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import {
  MEGATON_PAID_GACHA_CHECKOUT_PROTOCOL,
  parsePaymentPayload,
  purchaseHasMegatonPaidGachaLineage,
} from '../functions/_lib/tgProducts.js';
import { onRequestPost as invoicePost } from '../functions/api/tg-invoice.js';
import { onRequestPost as tonOrderPost } from '../functions/api/tg-ton-order.js';
import { onRequestPost as webhookPost } from '../functions/api/tg-webhook.js';

const BOT_TOKEN = '123456:checkout-protocol-test-token';
const USER_ID = '778813';
const ENV = {
  TELEGRAM_GAMEBOT_TOKEN: BOT_TOKEN,
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
  MEGATON_PAID_GACHA_CUTOVER_AT: '2026-08-01T00:00:00.000Z',
};
const WEBHOOK_SECRET = 'checkout-webhook-secret';
const LINEAGED_STARS_PAYLOAD = `megaton:mgp1:arsenal_payload:${USER_ID}:1754048000000:webhook-payment`;

function starsPayment(overrides = {}) {
  return {
    currency: 'XTR',
    total_amount: 25,
    invoice_payload: LINEAGED_STARS_PAYLOAD,
    telegram_payment_charge_id: 'telegram-stars-charge-checkout-test',
    provider_payment_charge_id: '',
    ...overrides,
  };
}

function webhookEnv(overrides = {}) {
  return {
    ...ENV,
    TG_BACKEND_SECRET: WEBHOOK_SECRET,
    ...overrides,
  };
}

function webhookRequest(update) {
  return request('/api/tg-webhook', update, {
    'x-telegram-bot-api-secret-token': WEBHOOK_SECRET,
  });
}

function signedInitData() {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: 'AAE-checkout-protocol-query',
    user: JSON.stringify({ id: Number(USER_ID), first_name: 'Checkout', username: 'buyer' }),
  });
  const check = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  params.set('hash', createHmac('sha256', secret).update(check).digest('hex'));
  return params.toString();
}

function request(path, body, headers = {}) {
  return new Request(`https://game-factory.tech${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://game-factory.tech',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function withCheckoutBackend(run) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url: parsed, init, body });
    if (parsed.hostname === 'api.telegram.org') {
      return jsonResponse({ ok: true, result: 'https://t.me/$invoice-test' });
    }
    if (parsed.pathname.endsWith('/telegram_players')) {
      return jsonResponse([{ telegram_user_id: USER_ID }]);
    }
    if (parsed.pathname.endsWith('/telegram_purchases')) {
      return jsonResponse(body || []);
    }
    throw new Error(`Unexpected checkout request: ${parsed}`);
  };

  try {
    return await run(calls);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('Stars paid gacha requires checkoutProtocol and emits an mgp1 payload', async () => {
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error('unmarked Stars checkout must not make a network request');
  };
  try {
    const rejected = await invoicePost({
      request: request('/api/tg-invoice', {
        game: 'megaton',
        productId: 'arsenal_payload',
        initData: signedInitData(),
      }),
      env: ENV,
    });
    assert.equal(rejected.status, 409);
    assert.match((await rejected.json()).error, /checkout protocol/i);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }

  await withCheckoutBackend(async (calls) => {
    const response = await invoicePost({
      request: request('/api/tg-invoice', {
        game: 'megaton',
        productId: 'arsenal_payload',
        initData: signedInitData(),
        checkoutProtocol: MEGATON_PAID_GACHA_CHECKOUT_PROTOCOL,
      }),
      env: ENV,
    });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.checkoutProtocol, MEGATON_PAID_GACHA_CHECKOUT_PROTOCOL);
    assert.match(
      data.payload,
      new RegExp(`^megaton:mgp1:arsenal_payload:${USER_ID}:\\d{10,16}:[A-Za-z0-9_-]{8,128}$`),
    );
    assert.deepEqual(parsePaymentPayload(data.payload), {
      game: 'megaton',
      productId: 'arsenal_payload',
      telegramUserId: USER_ID,
      timestamp: data.payload.split(':')[4],
      nonce: data.payload.split(':')[5],
      checkoutProtocol: MEGATON_PAID_GACHA_CHECKOUT_PROTOCOL,
      lineage: 'mgp1',
    });
    assert.equal(purchaseHasMegatonPaidGachaLineage({
      payload: data.payload,
      game: 'megaton',
      product_id: 'arsenal_payload',
      telegram_user_id: USER_ID,
      currency: 'XTR',
    }), true);

    const telegram = calls.find((call) => call.url.hostname === 'api.telegram.org');
    assert.equal(telegram.body.payload, data.payload);
    const purchase = calls.find((call) => call.url.pathname.endsWith('/telegram_purchases'));
    assert.equal(purchase.body[0].raw.checkoutProtocol, MEGATON_PAID_GACHA_CHECKOUT_PROTOCOL);
    assert.equal(purchase.body[0].raw.checkoutLineage, 'mgp1');
  });
});

test('TON paid gacha requires checkoutProtocol and emits an mgp1 memo lineage', async () => {
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error('unmarked TON checkout must not make a network request');
  };
  try {
    const rejected = await tonOrderPost({
      request: request('/api/tg-ton-order', {
        game: 'megaton',
        productId: 'arsenal_payload',
        initData: signedInitData(),
      }),
      env: ENV,
    });
    assert.equal(rejected.status, 409);
    assert.match((await rejected.json()).error, /checkout protocol/i);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }

  await withCheckoutBackend(async (calls) => {
    const response = await tonOrderPost({
      request: request('/api/tg-ton-order', {
        game: 'megaton',
        productId: 'arsenal_payload',
        initData: signedInitData(),
        checkoutProtocol: MEGATON_PAID_GACHA_CHECKOUT_PROTOCOL,
      }),
      env: ENV,
    });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.checkoutProtocol, MEGATON_PAID_GACHA_CHECKOUT_PROTOCOL);
    assert.match(data.payload, /^ton:megaton:mgp1:arsenal_payload:[A-Za-z0-9_-]{8,128}$/);
    assert.equal(data.memo, `GF:${data.payload}`);
    assert.equal(purchaseHasMegatonPaidGachaLineage({
      payload: data.payload,
      game: 'megaton',
      product_id: 'arsenal_payload',
      telegram_user_id: USER_ID,
      currency: 'TON',
    }), true);

    const purchase = calls.find((call) => call.url.pathname.endsWith('/telegram_purchases'));
    assert.equal(purchase.body[0].raw.checkoutProtocol, MEGATON_PAID_GACHA_CHECKOUT_PROTOCOL);
    assert.equal(purchase.body[0].raw.checkoutLineage, 'mgp1');
  });
});

test('paid-gacha checkout creation stays closed before the configured cutover', async () => {
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error('pre-cutover checkout must not make a network request');
  };
  try {
    const response = await invoicePost({
      request: request('/api/tg-invoice', {
        game: 'megaton',
        productId: 'arsenal_payload',
        initData: signedInitData(),
        checkoutProtocol: MEGATON_PAID_GACHA_CHECKOUT_PROTOCOL,
      }),
      env: { ...ENV, MEGATON_PAID_GACHA_CUTOVER_AT: '2999-01-01T00:00:00.000Z' },
    });
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /not live/i);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Stars paid-gacha invoice is never exposed before its pending row is durable', async () => {
  const body = {
    game: 'megaton',
    productId: 'arsenal_payload',
    initData: signedInitData(),
    checkoutProtocol: MEGATON_PAID_GACHA_CHECKOUT_PROTOCOL,
  };

  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error('missing storage config must fail before network I/O');
  };
  try {
    const unconfigured = await invoicePost({
      request: request('/api/tg-invoice', body),
      env: {
        TELEGRAM_GAMEBOT_TOKEN: BOT_TOKEN,
        MEGATON_PAID_GACHA_CUTOVER_AT: ENV.MEGATON_PAID_GACHA_CUTOVER_AT,
      },
    });
    assert.equal(unconfigured.status, 503);
    assert.match((await unconfigured.json()).error, /storage is not configured/i);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }

  for (const persistenceResponse of [
    jsonResponse({ message: 'temporary storage failure' }, 500),
    jsonResponse([], 200),
  ]) {
    const calls = [];
    globalThis.fetch = async (url, init = {}) => {
      const parsed = new URL(String(url));
      const requestBody = init.body ? JSON.parse(init.body) : null;
      calls.push({ url: parsed, body: requestBody });
      if (parsed.pathname.endsWith('/telegram_players')) {
        return jsonResponse([{ telegram_user_id: USER_ID }]);
      }
      if (parsed.pathname.endsWith('/telegram_purchases')) return persistenceResponse.clone();
      if (parsed.hostname === 'api.telegram.org') {
        throw new Error('invoice link must not be created after a failed pending write');
      }
      throw new Error(`Unexpected request: ${parsed}`);
    };
    try {
      const response = await invoicePost({
        request: request('/api/tg-invoice', body),
        env: ENV,
      });
      assert.equal(response.status, 503);
      assert.match((await response.json()).error, /storage is unavailable/i);
      assert.equal(
        calls.some((call) => call.url.hostname === 'api.telegram.org'),
        false,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  }
});

test('bot /buy refuses fresh unlineaged Megaton paid-gacha invoices', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url: parsed, body });
    return jsonResponse({ ok: true, result: true });
  };
  try {
    const response = await webhookPost({
      request: request('/api/tg-webhook', {
        update_id: 1,
        message: {
          message_id: 1,
          chat: { id: Number(USER_ID), type: 'private' },
          from: { id: Number(USER_ID), first_name: 'Checkout' },
          text: '/buy starter',
        },
      }, { 'x-telegram-bot-api-secret-token': 'webhook-secret' }),
      env: {
        TELEGRAM_GAMEBOT_TOKEN: BOT_TOKEN,
        TG_BACKEND_SECRET: 'webhook-secret',
      },
    });
    assert.equal(response.status, 200);
    assert.equal(
      calls.some((call) => call.url.pathname.endsWith('/sendInvoice')),
      false,
    );
    const help = calls.find((call) => call.url.pathname.endsWith('/sendMessage'));
    assert.ok(help, 'the bot redirects the buyer to the safe shop help');
    assert.doesNotMatch(String(help.body.text || ''), /<code>starter<\/code>/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Telegram pre_checkout_query binds payer, XTR currency, and exact catalog amount', async () => {
  const originalFetch = globalThis.fetch;
  const answers = [];
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    const body = init.body ? JSON.parse(init.body) : null;
    if (!parsed.pathname.endsWith('/answerPreCheckoutQuery')) {
      throw new Error(`Unexpected pre-checkout request: ${parsed}`);
    }
    answers.push(body);
    return jsonResponse({ ok: true, result: true });
  };
  try {
    const queryFor = (payment, fromId = Number(USER_ID)) => ({
      update_id: answers.length + 10,
      pre_checkout_query: {
        id: `precheckout-${answers.length}`,
        from: { id: fromId, first_name: 'Checkout' },
        ...payment,
      },
    });

    const valid = await webhookPost({
      request: webhookRequest(queryFor(starsPayment())),
      env: webhookEnv(),
    });
    assert.equal(valid.status, 200);
    assert.equal(answers.at(-1).ok, true);

    for (const scenario of [
      queryFor(starsPayment(), 999999),
      queryFor(starsPayment({ currency: 'USD' })),
      queryFor(starsPayment({ total_amount: 24 })),
    ]) {
      const response = await webhookPost({
        request: webhookRequest(scenario),
        env: webhookEnv(),
      });
      assert.equal(response.status, 200);
      assert.equal(answers.at(-1).ok, false);
      assert.match(answers.at(-1).error_message, /no longer matches/i);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('successful_payment is validated again and recorded before acknowledgement', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url: parsed, body });
    if (parsed.pathname.endsWith('/telegram_players')) {
      return jsonResponse([{ telegram_user_id: USER_ID }]);
    }
    if (parsed.pathname.endsWith('/telegram_purchases')) return jsonResponse(body);
    if (parsed.pathname.endsWith('/sendMessage')) return jsonResponse({ ok: true, result: true });
    throw new Error(`Unexpected successful-payment request: ${parsed}`);
  };
  try {
    const response = await webhookPost({
      request: webhookRequest({
        update_id: 20,
        message: {
          message_id: 20,
          chat: { id: Number(USER_ID), type: 'private' },
          from: { id: Number(USER_ID), first_name: 'Checkout', username: 'buyer' },
          successful_payment: starsPayment(),
        },
      }),
      env: webhookEnv(),
    });
    assert.equal(response.status, 200);
    const purchaseIndex = calls.findIndex((call) => call.url.pathname.endsWith('/telegram_purchases'));
    const confirmationIndex = calls.findIndex((call) => call.url.pathname.endsWith('/sendMessage'));
    assert.ok(purchaseIndex >= 0, 'paid purchase row persisted');
    assert.ok(confirmationIndex > purchaseIndex, 'confirmation follows durable persistence');
    const paid = calls[purchaseIndex].body[0];
    assert.equal(paid.payload, LINEAGED_STARS_PAYLOAD);
    assert.equal(paid.telegram_user_id, USER_ID);
    assert.equal(paid.currency, 'XTR');
    assert.equal(paid.total_amount, 25);
    assert.equal(paid.status, 'paid');
    assert.equal(paid.telegram_payment_charge_id, 'telegram-stars-charge-checkout-test');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('successful_payment rejects mismatched payer, currency, or amount before storage', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error('invalid successful_payment must not reach storage or Telegram APIs');
  };
  try {
    const scenarios = [
      {
        fromId: 999999,
        payment: starsPayment(),
      },
      {
        fromId: Number(USER_ID),
        payment: starsPayment({ currency: 'USD' }),
      },
      {
        fromId: Number(USER_ID),
        payment: starsPayment({ total_amount: 24 }),
      },
    ];
    for (const [index, scenario] of scenarios.entries()) {
      const response = await webhookPost({
        request: webhookRequest({
          update_id: 30 + index,
          message: {
            message_id: 30 + index,
            chat: { id: scenario.fromId, type: 'private' },
            from: { id: scenario.fromId, first_name: 'Mismatch' },
            successful_payment: scenario.payment,
          },
        }),
        env: webhookEnv(),
      });
      assert.equal(response.status, 400);
      assert.match((await response.json()).error, /^successful_payment_/);
    }
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('transient successful_payment persistence failure is not acknowledged', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  let waitUntilCalls = 0;
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url: parsed, body });
    if (parsed.pathname.endsWith('/telegram_players')) {
      return jsonResponse([{ telegram_user_id: USER_ID }]);
    }
    if (parsed.pathname.endsWith('/telegram_purchases')) {
      return jsonResponse({ message: 'temporary database outage' }, 500);
    }
    if (parsed.pathname.endsWith('/sendMessage')) {
      throw new Error('confirmation must not be sent before persistence');
    }
    throw new Error(`Unexpected persistence-failure request: ${parsed}`);
  };
  try {
    const response = await webhookPost({
      request: webhookRequest({
        update_id: 40,
        message: {
          message_id: 40,
          chat: { id: Number(USER_ID), type: 'private' },
          from: { id: Number(USER_ID), first_name: 'Checkout' },
          successful_payment: starsPayment({
            telegram_payment_charge_id: 'telegram-stars-charge-transient-test',
          }),
        },
      }),
      env: webhookEnv(),
      waitUntil() {
        waitUntilCalls += 1;
      },
    });
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /payment_handling_failed/);
    assert.equal(waitUntilCalls, 0, 'payment handling bypasses background acknowledgement');
    assert.equal(
      calls.some((call) => call.url.pathname.endsWith('/telegram_purchases')),
      true,
    );
    assert.equal(
      calls.some((call) => call.url.pathname.endsWith('/sendMessage')),
      false,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
