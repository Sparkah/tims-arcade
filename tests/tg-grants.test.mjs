import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import {
  applyGrantToState,
  applyPurchaseGrant,
  isServerGrantable,
  isStorePending,
  megatonMaxUpgradeCost,
} from '../functions/_lib/tgGrants.js';
import { getProduct, hasStarsPrice } from '../functions/_lib/tgProducts.js';
import { onRequestPost as purchasePost } from '../functions/api/tg-purchase.js';
import { onRequestPost as statePost } from '../functions/api/tg-state.js';
import { onRequestPost as tonVerifyPost } from '../functions/api/tg-ton-verify.js';

const BOT_TOKEN = '123456:grant-test-token';
const USER_ID = '778811';
const CHECKOUT_PROTOCOL = 'megaton-paid-gacha-v1';
const ENV = {
  TELEGRAM_GAMEBOT_TOKEN: BOT_TOKEN,
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function signedInitData() {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: 'AAE-grant-query',
    user: JSON.stringify({ id: Number(USER_ID), first_name: 'Megaton', username: 'buyer' }),
  });
  const check = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  params.set('hash', createHmac('sha256', secret).update(check).digest('hex'));
  return params.toString();
}

function request(path, body, extraHeaders = {}) {
  return new Request(`https://game-factory.tech${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://game-factory.tech',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
}

async function withStateBackend(initialState, run, options = {}) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  let row = options.noInitialRow ? null : {
    game: 'megaton',
    telegram_user_id: USER_ID,
    state: clone(initialState || {}),
    state_rev: 10,
    updated_at: '2026-08-01T10:00:00.000Z',
  };
  let patchCount = 0;

  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    const method = String(init.method || 'GET').toUpperCase();
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url: parsed, method, body });

    if (parsed.pathname.endsWith('/telegram_players')) {
      return jsonResponse([{ telegram_user_id: USER_ID }]);
    }
    if (parsed.pathname.endsWith('/telegram_purchases')) {
      if (method === 'POST') {
        return jsonResponse([clone(options.savedPurchase || body[0])]);
      }
      return jsonResponse(options.purchase ? [clone(options.purchase)] : []);
    }
    if (parsed.hostname === 'tonapi.io') {
      return jsonResponse({ transactions: options.tonTransactions || [] });
    }
    if (!parsed.pathname.endsWith('/telegram_player_states')) {
      throw new Error(`Unexpected request: ${method} ${parsed.pathname}`);
    }

    if (method === 'GET') return jsonResponse(row ? [clone(row)] : []);
    if (method === 'POST') {
      const saved = clone(body[0]);
      row = { ...saved, updated_at: saved.updated_at || new Date().toISOString() };
      return jsonResponse([clone(row)]);
    }
    if (method === 'PATCH') {
      patchCount += 1;
      if (options.protectedGrantConflictOnce && patchCount === 1) {
        row = {
          ...row,
          state: {
            money: 5300,
            __server: {
              entitlements: {
                applied: { paid_payload: { productId: 'caps_pack' } },
              },
            },
          },
          state_rev: 11,
          updated_at: '2026-08-01T10:00:01.000Z',
        };
        return jsonResponse([]);
      }
      if (options.conflictOnce && patchCount === 1) {
        row = {
          ...row,
          state: { ...clone(row.state), concurrentPlayerField: 'preserved' },
          state_rev: 11,
          updated_at: '2026-08-01T10:00:01.000Z',
        };
        return jsonResponse([]);
      }
      const expectedRev = String(parsed.searchParams.get('state_rev') || '').replace(/^eq\./, '');
      if (!row || String(row.state_rev) !== expectedRev) return jsonResponse([]);
      row = {
        ...row,
        state: clone(body.state),
        state_rev: body.state_rev,
        updated_at: body.updated_at,
      };
      return jsonResponse([clone(row)]);
    }
    throw new Error(`Unexpected state method: ${method}`);
  };

  try {
    return await run({ calls, getRow: () => clone(row), getPatchCount: () => patchCount });
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('Megaton deterministic products are grantable while gacha and welcome_x8 never enter pending RNG', () => {
  for (const id of ['starter', 'caps_pack', 'warhead_tuning', 'mirv_kit', 'god_power']) {
    assert.equal(isServerGrantable('megaton', id), true, id);
  }
  for (const id of ['arsenal_payload', 'arsenal_payload_10', 'arsenal_legendary_payload', 'welcome_x8']) {
    assert.equal(isServerGrantable('megaton', id), false, id);
    assert.equal(isStorePending('megaton', id), false, id);
  }
});

test('disabled welcome_x8 remains in history but cannot create a new Stars invoice', () => {
  const product = getProduct('megaton', 'welcome_x8');
  assert.equal(product.disabled, true);
  assert.equal(product.amount, 10);
  assert.equal(hasStarsPrice(product), false);
});

test('Megaton dynamic upgrade wall and fixed product deltas mirror the wrapper', () => {
  const base = {
    money: 100,
    totalEarned: 500,
    best: 800,
    cityTier: 2,
    powerLvl: 3,
    luckLvl: 2,
    mirvLvl: 1,
    flareLvl: 0,
    penLvl: 0,
    unrelated: { nested: true },
    ownedSkins: ['rare_sky_needle'],
    __server: {
      tonCreditNanotons: '900000000',
      entitlements: { existingEntitlement: true },
    },
  };
  assert.equal(megatonMaxUpgradeCost(base), 473);

  const starter = clone(base);
  assert.equal(applyGrantToState('megaton', 'starter', starter), true);
  assert.equal(starter.money, 2310); // 100 + ceil(1500 + 473 * 1.5)
  assert.equal(starter.totalEarned, 2710);
  assert.equal(starter.best, 2710);
  assert.equal(starter.powerLvl, 4);
  assert.equal(starter.luckLvl, 4);

  const caps = clone(base);
  applyGrantToState('megaton', 'caps_pack', caps);
  assert.equal(caps.money, 7465); // 100 + 5000 + 473 * 5

  const tuning = clone(base);
  applyGrantToState('megaton', 'warhead_tuning', tuning);
  assert.equal(tuning.money, 1300);
  assert.equal(tuning.powerLvl, 7);
  assert.equal(tuning.luckLvl, 4);
  assert.equal(tuning.nukeAmmo.wide, 1);

  const mirv = clone(base);
  applyGrantToState('megaton', 'mirv_kit', mirv);
  assert.equal(mirv.money, 1900);
  assert.equal(mirv.mirvLvl, 2);
  assert.equal(mirv.penLvl, 2);
  assert.equal(mirv.flareLvl, 2);
  assert.equal(mirv.nukeAmmo.wide, 3);

  for (const state of [starter, caps, tuning, mirv]) {
    assert.equal(state.tutDone, true);
    assert.equal(state.upgDone, true);
    assert.equal(state.tutorialV, 3);
    assert.equal(state.tutStep, 13);
    assert.equal(state.tutDailyPending, false);
    assert.equal(state.tutorialGiftOpen, false);
    assert.deepEqual(state.unrelated, base.unrelated);
    assert.deepEqual(state.ownedSkins, base.ownedSkins);
    assert.equal(state.__server.tonCreditNanotons, '900000000');
    assert.equal(state.__server.entitlements.existingEntitlement, true);
  }
});

test('God Power preserves stronger player values and records a permanent server entitlement', () => {
  const state = {
    money: 40,
    totalEarned: 100,
    best: 200,
    powerLvl: 95,
    flareLvl: 1,
    penLvl: 2,
    mirvLvl: 0,
    __server: {
      tonCreditNanotons: '123',
      entitlements: { applied: { old: { productId: 'caps_pack' } } },
    },
    playerNote: 'keep me',
  };
  const wall = megatonMaxUpgradeCost(state);
  applyGrantToState('megaton', 'god_power', state);
  const caps = 250000 + Math.ceil(wall * 10);
  assert.equal(state.money, 40 + caps);
  assert.equal(state.totalEarned, 100 + caps);
  assert.equal(state.best, 100 + caps);
  assert.equal(state.powerLvl, 95);
  assert.equal(state.flareLvl, 12);
  assert.equal(state.penLvl, 18);
  assert.equal(state.mirvLvl, 5);
  assert.equal(state.infernoLvl, 10);
  assert.equal(state.toppleLvl, 12);
  assert.equal(state.meltdownLvl, 12);
  assert.equal(state.tidalLvl, 10);
  assert.equal(state.fireworksLvl, 10);
  assert.equal(state.eyeLvl, 1);
  assert.deepEqual(state.nukeOwned, ['std', 'wide', 'tsar']);
  assert.equal(state.nukeAmmo.wide, 999);
  assert.equal(state.nukeAmmo.tsar, 999);
  assert.equal(state.activeNuke, 'tsar');
  assert.equal(state.godPower, true);
  assert.equal(state.__server.entitlements.godPower, true);
  assert.deepEqual(state.__server.entitlements.applied.old, { productId: 'caps_pack' });
  assert.equal(state.__server.tonCreditNanotons, '123');
  assert.equal(state.playerNote, 'keep me');
});

test('purchase grant retries CAS conflicts, preserves concurrent state, and is idempotent by payload', async () => {
  const initial = {
    money: 25,
    totalEarned: 40,
    best: 100,
    powerLvl: 0,
    cityTier: 0,
    playerInventory: { tickets: 7 },
    __server: {
      tonCreditNanotons: '500000000',
      customServerField: { keep: true },
      entitlements: { priorFlag: true },
    },
  };
  await withStateBackend(initial, async ({ getRow, getPatchCount }) => {
    const first = await applyPurchaseGrant(
      ENV,
      'megaton',
      USER_ID,
      'caps_pack',
      'megaton:caps_pack:778811:1:grant',
    );
    assert.equal(first.granted, true);
    assert.equal(first.alreadyApplied, false);
    assert.equal(first.state.money, 5300); // 25 + 5000 + 55 * 5
    assert.equal(first.state.concurrentPlayerField, 'preserved');
    assert.deepEqual(first.state.playerInventory, { tickets: 7 });
    assert.equal(first.state.__server.tonCreditNanotons, '500000000');
    assert.deepEqual(first.state.__server.customServerField, { keep: true });
    assert.equal(first.state.__server.entitlements.priorFlag, true);
    assert.equal(getPatchCount(), 2);

    const retry = await applyPurchaseGrant(
      ENV,
      'megaton',
      USER_ID,
      'caps_pack',
      'megaton:caps_pack:778811:1:grant',
    );
    assert.equal(retry.granted, true);
    assert.equal(retry.alreadyApplied, true);
    assert.equal(retry.state.money, 5300);
    assert.equal(getPatchCount(), 2, 'idempotent retry performs no second write');
    const saved = getRow().state;
    assert.equal(saved.__server.entitlements.applied['megaton:caps_pack:778811:1:grant'].productId, 'caps_pack');
  }, { conflictOnce: true });
});

test('a first purchase seeds state before applying its CAS-protected grant', async () => {
  await withStateBackend({}, async ({ getRow, getPatchCount, calls }) => {
    const result = await applyPurchaseGrant(
      ENV,
      'megaton',
      USER_ID,
      'caps_pack',
      'megaton:caps_pack:first-state',
    );
    assert.equal(result.granted, true);
    assert.equal(result.alreadyApplied, false);
    assert.equal(result.state.money, 5275);
    assert.equal(getPatchCount(), 1);
    assert.equal(getRow().state.__server.entitlements.applied['megaton:caps_pack:first-state'].productId, 'caps_pack');
    const inserts = calls.filter((call) => call.method === 'POST' && call.url.pathname.endsWith('/telegram_player_states'));
    assert.equal(inserts.length, 1, 'the empty row is inserted once before the grant CAS');
  }, { noInitialRow: true });
});

test('Stars claim returns the authoritative Megaton state written by applyPurchaseGrant', async () => {
  const payload = `megaton:caps_pack:${USER_ID}:1754046000000:stars`;
  const purchase = {
    payload,
    game: 'megaton',
    product_id: 'caps_pack',
    telegram_user_id: USER_ID,
    currency: 'XTR',
    total_amount: 49,
    telegram_payment_charge_id: 'stars-charge-caps-pack',
    status: 'paid',
    paid_at: '2026-08-01T10:00:00.000Z',
    raw: { from: { id: Number(USER_ID) } },
  };
  await withStateBackend({ money: 10, totalEarned: 10, best: 10 }, async () => {
    const response = await purchasePost({
      request: request('/api/tg-purchase', {
        action: 'claim',
        game: 'megaton',
        initData: signedInitData(),
        payload,
      }),
      env: ENV,
    });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.paid, true);
    assert.equal(data.granted, true);
    assert.equal(data.state.money, 5285);
    assert.equal(data.grant.state.money, 5285);
    assert.equal(data.stateRev, data.grant.stateRev);
  }, { purchase });
});

test('legacy paid-gacha Stars settles without a server grant while mgp1 receives one', async () => {
  const purchaseFor = (payload) => ({
    payload,
    game: 'megaton',
    product_id: 'starter',
    telegram_user_id: USER_ID,
    currency: 'XTR',
    total_amount: 25,
    telegram_payment_charge_id: `stars-${payload.includes(':mgp1:') ? 'mgp1' : 'legacy'}-starter`,
    status: 'paid',
    paid_at: '2026-08-01T10:00:00.000Z',
    raw: { from: { id: Number(USER_ID) } },
  });

  const legacyPayload = `megaton:starter:${USER_ID}:1754046000000:legacy-stars`;
  await withStateBackend({ money: 10 }, async ({ getPatchCount }) => {
    const response = await purchasePost({
      request: request('/api/tg-purchase', {
        action: 'claim',
        game: 'megaton',
        initData: signedInitData(),
        payload: legacyPayload,
      }),
      env: ENV,
    });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.paid, true);
    assert.equal(data.granted, false);
    assert.equal(data.grant, null);
    assert.equal(data.legacySettlement, true);
    assert.equal(getPatchCount(), 0);
  }, { purchase: purchaseFor(legacyPayload) });

  const lineagedPayload = `megaton:mgp1:starter:${USER_ID}:1754046000000:lineaged-stars`;
  await withStateBackend({ money: 10 }, async ({ getPatchCount, getRow }) => {
    const response = await purchasePost({
      request: request('/api/tg-purchase', {
        action: 'claim',
        game: 'megaton',
        initData: signedInitData(),
        payload: lineagedPayload,
        checkoutProtocol: CHECKOUT_PROTOCOL,
      }),
      env: ENV,
    });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.paid, true);
    assert.equal(data.granted, true);
    assert.equal(data.legacySettlement, false);
    assert.equal(getPatchCount(), 1);
    assert.equal(
      getRow().state.__server.entitlements.applied[lineagedPayload].productId,
      'starter',
    );
  }, { purchase: purchaseFor(lineagedPayload) });
});

test('Stars deterministic claims reject underpaid, unsupported-currency, and wrong-owner rows', async () => {
  const payload = `megaton:caps_pack:${USER_ID}:1754046000000:invalid-stars`;
  const base = {
    payload,
    game: 'megaton',
    product_id: 'caps_pack',
    telegram_user_id: USER_ID,
    currency: 'XTR',
    total_amount: 49,
    telegram_payment_charge_id: 'stars-charge-invalid-cases',
    status: 'paid',
    paid_at: '2026-08-01T10:00:00.000Z',
    raw: { from: { id: Number(USER_ID) } },
  };
  const cases = [
    { name: 'underpaid', purchase: { ...base, total_amount: 48 }, error: /amount_mismatch/ },
    { name: 'wrong currency', purchase: { ...base, currency: 'USD' }, error: /currency_mismatch/ },
    {
      name: 'missing charge evidence',
      purchase: { ...base, telegram_payment_charge_id: null },
      error: /charge_missing/,
    },
    {
      name: 'wrong owner',
      purchase: { ...base, telegram_user_id: '999002' },
      error: /owner_mismatch/,
    },
    {
      name: 'wrong payer evidence',
      purchase: { ...base, raw: { from: { id: 999002 } } },
      error: /payer_mismatch/,
    },
  ];

  for (const scenario of cases) {
    await withStateBackend({ money: 10 }, async ({ getPatchCount }) => {
      const response = await purchasePost({
        request: request('/api/tg-purchase', {
          action: 'claim',
          game: 'megaton',
          initData: signedInitData(),
          payload,
        }),
        env: ENV,
      });
      assert.equal(response.status, 409, scenario.name);
      assert.match((await response.json()).error, scenario.error, scenario.name);
      assert.equal(getPatchCount(), 0, `${scenario.name} must not grant`);
    }, { purchase: scenario.purchase });
  }
});

test('trusted purchase recording rejects an invalid paid row before persistence or grant', async () => {
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error('invalid record must not reach persistence');
  };
  try {
    const payload = `megaton:caps_pack:${USER_ID}:1754046000000:record-underpaid`;
    const response = await purchasePost({
      request: request('/api/tg-purchase', {
        action: 'record',
        purchase: {
          payload,
          game: 'megaton',
          product_id: 'caps_pack',
          telegram_user_id: USER_ID,
          currency: 'XTR',
          total_amount: 48,
          telegram_payment_charge_id: 'stars-record-underpaid',
          status: 'paid',
          at: '2026-08-01T10:00:00.000Z',
          raw: { from: { id: Number(USER_ID) } },
        },
      }, { 'x-tg-backend-secret': 'record-secret' }),
      env: { ...ENV, TG_BACKEND_SECRET: 'record-secret' },
    });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /purchase_amount_mismatch/);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a lineaged gacha-only Stars claim remains paid without a deterministic grant', async () => {
  const payload = `megaton:mgp1:arsenal_payload:${USER_ID}:1754046000000:gacha-only`;
  const purchase = {
    payload,
    game: 'megaton',
    product_id: 'arsenal_payload',
    telegram_user_id: USER_ID,
    currency: 'XTR',
    total_amount: 25,
    telegram_payment_charge_id: 'stars-charge-gacha-only',
    status: 'paid',
    paid_at: '2026-08-01T10:00:00.000Z',
    raw: { from: { id: Number(USER_ID) } },
  };
  await withStateBackend({ money: 10 }, async ({ getPatchCount }) => {
    const response = await purchasePost({
      request: request('/api/tg-purchase', {
        action: 'claim',
        game: 'megaton',
        initData: signedInitData(),
        payload,
        checkoutProtocol: CHECKOUT_PROTOCOL,
      }),
      env: ENV,
    });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.paid, true);
    assert.equal(data.granted, false);
    assert.equal(data.grant.unsupported, true);
    assert.equal(getPatchCount(), 0);
  }, { purchase });
});

test('already-paid direct TON verification returns the authoritative Megaton state', async () => {
  const payload = 'ton:megaton:mirv_kit:existing-order';
  const purchase = {
    payload,
    game: 'megaton',
    product_id: 'mirv_kit',
    telegram_user_id: USER_ID,
    currency: 'TON',
    total_amount: 800000000,
    provider_payment_charge_id: 'ton-transaction-mirv-kit',
    status: 'paid',
    paid_at: '2026-08-01T10:00:00.000Z',
    created_at: '2026-08-01T09:59:00.000Z',
    raw: {},
  };
  await withStateBackend({ money: 10, totalEarned: 10, best: 10 }, async () => {
    const response = await tonVerifyPost({
      request: request('/api/tg-ton-verify', {
        game: 'megaton',
        initData: signedInitData(),
        payload,
      }),
      env: ENV,
    });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.paid, true);
    assert.equal(data.granted, true);
    assert.equal(data.state.money, 1810);
    assert.equal(data.state.mirvLvl, 1);
    assert.equal(data.state.penLvl, 2);
    assert.equal(data.state.flareLvl, 2);
    assert.equal(data.grant.state.money, data.state.money);
  }, { purchase });
});

test('legacy paid-gacha TON settles without a server grant while mgp1 receives one', async () => {
  const purchaseFor = (payload) => ({
    payload,
    game: 'megaton',
    product_id: 'starter',
    telegram_user_id: USER_ID,
    currency: 'TON',
    total_amount: 200000000,
    provider_payment_charge_id: `ton-${payload.includes(':mgp1:') ? 'mgp1' : 'legacy'}-starter`,
    status: 'paid',
    paid_at: '2026-08-01T10:00:00.000Z',
    created_at: '2026-08-01T09:59:00.000Z',
    raw: {},
  });

  const legacyPayload = 'ton:megaton:starter:legacy-ton-order';
  await withStateBackend({ money: 10 }, async ({ getPatchCount }) => {
    const response = await tonVerifyPost({
      request: request('/api/tg-ton-verify', {
        game: 'megaton',
        initData: signedInitData(),
        payload: legacyPayload,
      }),
      env: ENV,
    });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.paid, true);
    assert.equal(data.granted, false);
    assert.equal(data.grant, null);
    assert.equal(data.legacySettlement, true);
    assert.equal(getPatchCount(), 0);
  }, { purchase: purchaseFor(legacyPayload) });

  const lineagedPayload = 'ton:megaton:mgp1:starter:lineaged-ton-order';
  await withStateBackend({ money: 10 }, async ({ getPatchCount, getRow }) => {
    const unmarked = await tonVerifyPost({
      request: request('/api/tg-ton-verify', {
        game: 'megaton',
        initData: signedInitData(),
        payload: lineagedPayload,
      }),
      env: ENV,
    });
    assert.equal(unmarked.status, 409);
    assert.match((await unmarked.json()).error, /protocol does not match/i);
    assert.equal(getPatchCount(), 0);

    const response = await tonVerifyPost({
      request: request('/api/tg-ton-verify', {
        game: 'megaton',
        initData: signedInitData(),
        payload: lineagedPayload,
        checkoutProtocol: CHECKOUT_PROTOCOL,
      }),
      env: ENV,
    });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.paid, true);
    assert.equal(data.granted, true);
    assert.equal(data.legacySettlement, false);
    assert.equal(getPatchCount(), 1);
    assert.equal(
      getRow().state.__server.entitlements.applied[lineagedPayload].productId,
      'starter',
    );
  }, { purchase: purchaseFor(lineagedPayload) });
});

test('an already-open legacy TON order can settle without server fulfillment', async () => {
  const payload = 'ton:megaton:starter:already-open-legacy-order';
  const memo = `GF:${payload}`;
  const pending = {
    payload,
    game: 'megaton',
    product_id: 'starter',
    telegram_user_id: USER_ID,
    currency: 'TON',
    total_amount: 200000000,
    status: 'pending',
    paid_at: null,
    created_at: '2026-08-01T09:59:00.000Z',
    raw: { memo, recipient: 'test-ton-recipient' },
  };
  const savedPurchase = {
    ...pending,
    provider_payment_charge_id: 'legacy-ton-chain-hash',
    status: 'paid',
    paid_at: '2026-08-01T10:00:00.000Z',
  };
  const tonTransactions = [{
    hash: 'legacy-ton-chain-hash',
    lt: '223456789',
    utime: Math.floor(Date.parse('2026-08-01T10:00:00.000Z') / 1000),
    success: true,
    in_msg: {
      bounced: false,
      value: '200000000',
      message: memo,
      source: 'test-source',
      destination: 'test-ton-recipient',
    },
  }];

  await withStateBackend({ money: 10 }, async ({ getPatchCount }) => {
    const response = await tonVerifyPost({
      request: request('/api/tg-ton-verify', {
        game: 'megaton',
        initData: signedInitData(),
        payload,
      }),
      env: ENV,
    });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.paid, true);
    assert.equal(data.txHash, 'legacy-ton-chain-hash');
    assert.equal(data.granted, false);
    assert.equal(data.grant, null);
    assert.equal(data.legacySettlement, true);
    assert.equal(getPatchCount(), 0);
  }, { purchase: pending, savedPurchase, tonTransactions });
});

test('already-paid TON deterministic claims reject underpaid and wrong-owner rows before grant', async () => {
  const payload = 'ton:megaton:mirv_kit:invalid-existing-order';
  const base = {
    payload,
    game: 'megaton',
    product_id: 'mirv_kit',
    telegram_user_id: USER_ID,
    currency: 'TON',
    total_amount: 800000000,
    provider_payment_charge_id: 'ton-transaction-invalid-existing',
    status: 'paid',
    paid_at: '2026-08-01T10:00:00.000Z',
    created_at: '2026-08-01T09:59:00.000Z',
    raw: {},
  };
  for (const scenario of [
    { name: 'underpaid', purchase: { ...base, total_amount: 799999999 }, error: /amount_mismatch/ },
    { name: 'wrong owner', purchase: { ...base, telegram_user_id: '999003' }, error: /owner_mismatch/ },
  ]) {
    await withStateBackend({ money: 10 }, async ({ getPatchCount }) => {
      const response = await tonVerifyPost({
        request: request('/api/tg-ton-verify', {
          game: 'megaton',
          initData: signedInitData(),
          payload,
        }),
        env: ENV,
      });
      assert.equal(response.status, 409, scenario.name);
      assert.match((await response.json()).error, scenario.error, scenario.name);
      assert.equal(getPatchCount(), 0, `${scenario.name} must not grant`);
    }, { purchase: scenario.purchase });
  }
});

test('newly discovered TON payment validates the stored row before deterministic grant', async () => {
  const payload = 'ton:megaton:mirv_kit:new-order-tampered-save';
  const memo = `GF:${payload}`;
  const pending = {
    payload,
    game: 'megaton',
    product_id: 'mirv_kit',
    telegram_user_id: USER_ID,
    currency: 'TON',
    total_amount: 800000000,
    status: 'pending',
    paid_at: null,
    created_at: '2026-08-01T09:59:00.000Z',
    raw: { memo, recipient: 'test-ton-recipient' },
  };
  const savedPurchase = {
    ...pending,
    total_amount: 1,
    provider_payment_charge_id: 'ton-chain-hash',
    status: 'paid',
    paid_at: '2026-08-01T10:00:00.000Z',
  };
  const tonTransactions = [{
    hash: 'ton-chain-hash',
    lt: '123456789',
    utime: Math.floor(Date.parse('2026-08-01T10:00:00.000Z') / 1000),
    success: true,
    in_msg: {
      bounced: false,
      value: '800000000',
      message: memo,
      source: 'test-source',
      destination: 'test-ton-recipient',
    },
  }];

  await withStateBackend({ money: 10 }, async ({ getPatchCount }) => {
    const response = await tonVerifyPost({
      request: request('/api/tg-ton-verify', {
        game: 'megaton',
        initData: signedInitData(),
        payload,
      }),
      env: ENV,
    });
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /amount_mismatch/);
    assert.equal(getPatchCount(), 0, 'tampered stored row must not grant');
  }, { purchase: pending, savedPurchase, tonTransactions });
});

test('Megaton state saves derive God Power only from the preserved server entitlement', async () => {
  const initial = {
    money: 50,
    godPower: true,
    __server: {
      tonCreditNanotons: '44',
      entitlements: { godPower: true, applied: { paid: { productId: 'god_power' } } },
    },
  };
  await withStateBackend(initial, async ({ getRow }) => {
    const response = await statePost({
      request: request('/api/tg-state', {
        action: 'save',
        game: 'megaton',
        initData: signedInitData(),
        expectedStateRev: 10,
        state: {
          money: 75,
          godPower: false,
          __server: { entitlements: { godPower: false }, tonCreditNanotons: '0' },
        },
      }),
      env: ENV,
    });
    assert.equal(response.status, 200);
    const saved = getRow().state;
    assert.equal(saved.money, 75);
    assert.equal(saved.godPower, true);
    assert.equal(saved.__server.tonCreditNanotons, '44');
    assert.equal(saved.__server.entitlements.godPower, true);
  });
});

test('a stale Megaton save returns and preserves the newer authoritative purchase state', async () => {
  const authoritative = {
    money: 5300,
    powerLvl: 4,
    __server: {
      entitlements: {
        applied: { purchase_payload: { productId: 'caps_pack' } },
      },
    },
  };
  await withStateBackend(authoritative, async ({ getRow, getPatchCount }) => {
    const response = await statePost({
      request: request('/api/tg-state', {
        action: 'save',
        game: 'megaton',
        initData: signedInitData(),
        expectedStateRev: 9,
        state: { money: 20, powerLvl: 1 },
      }),
      env: ENV,
    });
    assert.equal(response.status, 409);
    const data = await response.json();
    assert.equal(data.error, 'state_revision_conflict');
    assert.equal(data.stateRev, 10);
    assert.deepEqual(data.state, authoritative);
    assert.equal(getPatchCount(), 0);
    assert.deepEqual(getRow().state, authoritative);
  });
});

test('legacy Megaton saves have a bounded compatibility window before the new client refreshes', async () => {
  const liveCutover = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  await withStateBackend({ money: 10, powerLvl: 1 }, async ({ getRow, getPatchCount }) => {
    const response = await statePost({
      request: request('/api/tg-state', {
        action: 'save',
        game: 'megaton',
        initData: signedInitData(),
        state: { money: 20, powerLvl: 2 },
      }),
      env: { ...ENV, MEGATON_PAID_GACHA_CUTOVER_AT: liveCutover },
    });
    assert.equal(response.status, 200);
    assert.equal(getPatchCount(), 1);
    assert.equal(getRow().state.money, 20);
  });
});

test('legacy compatibility never overwrites a protected purchase grant', async () => {
  const liveCutover = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const authoritative = {
    money: 5300,
    __server: {
      entitlements: {
        applied: { paid_payload: { productId: 'caps_pack' } },
      },
    },
  };
  await withStateBackend(authoritative, async ({ getRow, getPatchCount }) => {
    const response = await statePost({
      request: request('/api/tg-state', {
        action: 'save',
        game: 'megaton',
        initData: signedInitData(),
        state: { money: 10 },
      }),
      env: { ...ENV, MEGATON_PAID_GACHA_CUTOVER_AT: liveCutover },
    });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, 'state_revision_conflict');
    assert.equal(getPatchCount(), 0);
    assert.deepEqual(getRow().state, authoritative);
  });
});

test('a paid grant landing during a legacy save wins the CAS race', async () => {
  const liveCutover = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  await withStateBackend(
    { money: 10 },
    async ({ getRow, getPatchCount }) => {
      const response = await statePost({
        request: request('/api/tg-state', {
          action: 'save',
          game: 'megaton',
          initData: signedInitData(),
          state: { money: 20 },
        }),
        env: { ...ENV, MEGATON_PAID_GACHA_CUTOVER_AT: liveCutover },
      });

      assert.equal(response.status, 409);
      const data = await response.json();
      assert.equal(data.error, 'state_revision_conflict');
      assert.equal(data.stateRev, 11);
      assert.equal(data.state.money, 5300);
      assert.equal(getPatchCount(), 1);
      assert.equal(getRow().state.money, 5300);
      assert.equal(getRow().state.__server.entitlements.applied.paid_payload.productId, 'caps_pack');
    },
    { protectedGrantConflictOnce: true },
  );
});

test('versioned or expired revisionless saves must adopt the authoritative row', async () => {
  const scenarios = [
    {
      name: 'versioned client',
      env: { ...ENV, MEGATON_PAID_GACHA_CUTOVER_AT: new Date(Date.now() - 60 * 60 * 1000).toISOString() },
      extra: { stateProtocol: 'megaton-state-rev-v1' },
    },
    {
      name: 'expired legacy client',
      env: { ...ENV, MEGATON_PAID_GACHA_CUTOVER_AT: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() },
      extra: {},
    },
  ];
  for (const scenario of scenarios) {
    await withStateBackend({ money: 40 }, async ({ getPatchCount }) => {
      const response = await statePost({
        request: request('/api/tg-state', {
          action: 'save',
          game: 'megaton',
          initData: signedInitData(),
          state: { money: 5 },
          ...scenario.extra,
        }),
        env: scenario.env,
      });
      assert.equal(response.status, 409, scenario.name);
      const data = await response.json();
      assert.equal(data.stateRev, 10, scenario.name);
      assert.equal(data.state.money, 40, scenario.name);
      assert.equal(getPatchCount(), 0, scenario.name);
    });
  }
});

test('unknown state protocols and malformed revisions never enter legacy mode', async () => {
  const liveCutover = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const scenarios = [
    { stateProtocol: 'megaton-state-rev-v999' },
    { expectedStateRev: 'not-a-revision' },
    { expectedStateRev: -1 },
  ];
  for (const extra of scenarios) {
    await withStateBackend({ money: 40 }, async ({ getPatchCount }) => {
      const response = await statePost({
        request: request('/api/tg-state', {
          action: 'save',
          game: 'megaton',
          initData: signedInitData(),
          state: { money: 5 },
          ...extra,
        }),
        env: { ...ENV, MEGATON_PAID_GACHA_CUTOVER_AT: liveCutover },
      });
      assert.equal(response.status, 400);
      assert.equal(getPatchCount(), 0);
    });
  }
});
