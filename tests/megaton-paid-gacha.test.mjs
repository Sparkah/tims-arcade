import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  MEGATON_GACHA_CATALOG,
  MEGATON_PAID_GACHA_CATALOG_VERSION,
  paidPurchaseAmountMatches,
  rollMegatonPaidProduct,
  secureRandomBelow,
} from '../functions/_lib/megatonPaidGacha.js';
import { onRequestPost } from '../functions/api/tg-paid-gacha.js';

const BOT_TOKEN = '123456:test-token';
const USER_ID = '777001';
const CHECKOUT_PROTOCOL = 'megaton-paid-gacha-v1';
const SUPABASE_URL = 'https://example.supabase.co';
const ENV = {
  TELEGRAM_GAMEBOT_TOKEN: BOT_TOKEN,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
  MEGATON_PAID_GACHA_CUTOVER_AT: '2026-08-01T00:00:00.000Z',
};

function randomSequence(values) {
  const queue = [...values];
  return (max) => {
    assert.ok(queue.length, 'deterministic random sequence exhausted');
    const value = queue.shift();
    assert.ok(Number.isInteger(value) && value >= 0 && value < max, `${value} must be below ${max}`);
    return value;
  };
}

function signedInitData(userId = USER_ID) {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: 'AAE-test-query',
    user: JSON.stringify({ id: Number(userId), first_name: 'Buyer', username: 'buyer' }),
  });
  const check = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  params.set('hash', createHmac('sha256', secret).update(check).digest('hex'));
  return params.toString();
}

function postRequest(body) {
  return new Request('https://game-factory.tech/api/tg-paid-gacha', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://game-factory.tech',
    },
    body: JSON.stringify({ checkoutProtocol: CHECKOUT_PROTOCOL, ...body }),
  });
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function paidPurchase(overrides = {}) {
  return {
    payload: `megaton:mgp1:arsenal_payload:${USER_ID}:1754046000000:nonce0001`,
    game: 'megaton',
    product_id: 'arsenal_payload',
    telegram_user_id: USER_ID,
    currency: 'XTR',
    total_amount: 25,
    telegram_payment_charge_id: 'stars-charge-paid-gacha',
    status: 'paid',
    paid_at: '2026-08-01T10:00:00.000Z',
    created_at: '2026-08-01T09:59:00.000Z',
    raw: { from: { id: Number(USER_ID) } },
    ...overrides,
  };
}

async function withSupabaseMock(purchaseInput, run, options = {}) {
  const purchases = Array.isArray(purchaseInput)
    ? purchaseInput
    : purchaseInput ? [purchaseInput] : [];
  const calls = [];
  let stateRow = options.stateRow ? clone(options.stateRow) : null;
  let statePatchCount = 0;
  let redemptionAttempts = 0;
  const redeemed = new Set([
    ...(options.redeemedPayloads || []),
    ...Object.keys(options.existingReceipts || {}),
  ]);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url: parsed, init, body });

    if (parsed.pathname.endsWith('/telegram_players')) {
      return jsonResponse([{ telegram_user_id: USER_ID }]);
    }
    if (parsed.pathname.endsWith('/telegram_player_states')) {
      const method = String(init.method || 'GET').toUpperCase();
      if (method === 'GET') return jsonResponse(stateRow ? [clone(stateRow)] : []);
      if (method === 'POST') {
        if (stateRow) return jsonResponse([]);
        stateRow = clone(body[0]);
        return jsonResponse([clone(stateRow)]);
      }
      if (method === 'PATCH') {
        statePatchCount += 1;
        if (options.statePatchAlwaysConflict) return jsonResponse([]);
        const expectedRev = String(parsed.searchParams.get('state_rev') || '').replace(/^eq\./, '');
        if (!stateRow || String(stateRow.state_rev) !== expectedRev) return jsonResponse([]);
        stateRow = {
          ...stateRow,
          state: clone(body.state),
          state_rev: body.state_rev,
          updated_at: body.updated_at,
        };
        return jsonResponse([clone(stateRow)]);
      }
      throw new Error(`Unexpected state method: ${method}`);
    }
    if (parsed.pathname.endsWith('/telegram_megaton_paid_inventory')) {
      if (options.missingInventoryMigration) {
        return jsonResponse({
          code: 'PGRST205',
          message: "Could not find the table 'public.telegram_megaton_paid_inventory' in the schema cache",
        }, 404);
      }
      const ownerFilter = String(parsed.searchParams.get('telegram_user_id') || '');
      const owner = ownerFilter.startsWith('eq.') ? ownerFilter.slice(3) : '';
      const rows = (options.inventoryRows || [])
        .filter((row) => String(row.telegram_user_id || USER_ID) === owner)
        .map((row) => ({
          item_id: row.item_id,
          rarity: row.rarity,
          paid_copies: row.paid_copies,
        }));
      return jsonResponse(rows);
    }
    if (parsed.pathname.endsWith('/telegram_megaton_paid_inventory_stats')) {
      const ownerFilter = String(parsed.searchParams.get('telegram_user_id') || '');
      const owner = ownerFilter.startsWith('eq.') ? ownerFilter.slice(3) : '';
      const rows = (options.inventoryStatsRows || [])
        .filter((row) => String(row.telegram_user_id || USER_ID) === owner)
        .map((row) => ({
          total_paid_rolls: row.total_paid_rolls,
          unique_paid_items: row.unique_paid_items,
          duplicate_paid_rolls: row.duplicate_paid_rolls,
        }));
      return jsonResponse(rows);
    }
    if (parsed.pathname.endsWith('/telegram_purchases')) {
      const payloadFilter = parsed.searchParams.get('payload');
      return jsonResponse(payloadFilter && payloadFilter.startsWith('eq.')
        ? purchases.filter((purchase) => purchase.payload === payloadFilter.slice(3))
        : purchases);
    }
    if (parsed.pathname.endsWith('/rpc/list_unredeemed_megaton_paid_gacha')) {
      const cutover = Date.parse(String(body.p_cutover_at || ''));
      const limit = Math.max(1, Math.min(100, Number(body.p_limit) || 100));
      const rows = purchases
        .filter((purchase) => (
          purchase.game === 'megaton'
          && purchase.telegram_user_id === body.p_telegram_user_id
          && purchase.status === 'paid'
          && Number.isFinite(Date.parse(purchase.paid_at || ''))
          && Date.parse(purchase.paid_at) >= cutover
          && /(^megaton:mgp1:|^ton:megaton:mgp1:|^megaton:ton_credit:mgp1:)/.test(purchase.payload)
          && !redeemed.has(purchase.payload)
        ))
        .sort((a, b) => (
          String(a.paid_at).localeCompare(String(b.paid_at))
          || String(a.created_at).localeCompare(String(b.created_at))
          || String(a.payload).localeCompare(String(b.payload))
        ))
        .slice(0, limit);
      return jsonResponse(rows);
    }
    if (parsed.pathname.endsWith('/rpc/redeem_megaton_paid_gacha')) {
      redemptionAttempts += 1;
      if (redemptionAttempts <= Number(options.redeemFailures || 0)) {
        return jsonResponse({ message: 'temporary redemption failure' }, 500);
      }
      if (options.rpcResponse) return jsonResponse(options.rpcResponse);
      const purchase = purchases.find((row) => row.payload === body.p_purchase_payload);
      assert.ok(purchase, `mock purchase exists for ${body.p_purchase_payload}`);
      if (options.existingReceipts && options.existingReceipts[purchase.payload]) {
        return jsonResponse([options.existingReceipts[purchase.payload]]);
      }
      redeemed.add(purchase.payload);
      const rolls = body.p_rolls.map((roll, index) => ({
        ...roll,
        index,
        paidDuplicate: false,
        paidCopiesAfter: 1,
      }));
      return jsonResponse([{
        receipt_id: '11111111-2222-4333-8444-555555555555',
        product_id: purchase.product_id,
        purchase_currency: purchase.currency,
        purchase_total_amount: purchase.total_amount,
        purchase_paid_at: purchase.paid_at,
        catalog_version: body.p_catalog_version,
        rolls,
        roll_count: rolls.length,
        created_at: '2026-08-01T10:00:01.000Z',
        idempotent: Boolean(
          options.idempotent
          || options.idempotentPayloads && options.idempotentPayloads.has(purchase.payload)
        ),
        total_paid_rolls: rolls.length,
        unique_paid_items: rolls.length,
        duplicate_paid_rolls: 0,
      }]);
    }
    throw new Error(`Unexpected Supabase request: ${parsed.pathname}`);
  };

  try {
    return await run(calls, {
      getStateRow: () => stateRow && clone(stateRow),
      getStatePatchCount: () => statePatchCount,
      getRedemptionAttempts: () => redemptionAttempts,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('server catalog mirrors the live 100-item Megaton rarity shape', () => {
  assert.equal(MEGATON_GACHA_CATALOG.length, 100);
  assert.equal(new Set(MEGATON_GACHA_CATALOG.map((item) => item.id)).size, 100);
  const counts = Object.groupBy(MEGATON_GACHA_CATALOG, (item) => item.rarity);
  assert.deepEqual(
    Object.fromEntries(Object.entries(counts).map(([rarity, items]) => [rarity, items.length])),
    { common: 55, rare: 25, epic: 14, legendary: 5, mythic: 1 },
  );
  assert.equal(MEGATON_GACHA_CATALOG[0].id, 'common_rust_dart');
  assert.equal(MEGATON_GACHA_CATALOG.at(-1).id, 'mythic_last_button');
  assert.match(MEGATON_PAID_GACHA_CATALOG_VERSION, /^megaton-paid-gacha-v1-/);
});

test('server projection matches the canonical Games collectible IDs, rarities and boosts', async (t) => {
  const canonicalUrl = new URL(
    '../../Games/211_megaton/src/platforms/telegram/js/collectibles.js',
    import.meta.url,
  );
  try {
    await access(fileURLToPath(canonicalUrl));
  } catch {
    t.skip('canonical Games checkout is not present beside the standalone Gallery repository');
    return;
  }

  const { createCollectibleCatalog } = await import(canonicalUrl.href);
  const canonical = createCollectibleCatalog(['common', 'rare', 'epic', 'legendary', 'mythic'])
    .SKINS
    .map((item) => ({
      id: item.id,
      name: item.name,
      rarity: item.rarity,
      boost: item.boost,
    }));
  const server = MEGATON_GACHA_CATALOG.map((item) => ({
    id: item.id,
    name: item.name,
    rarity: item.rarity,
    boost: item.boost,
  }));
  assert.equal(canonical.length, 100);
  assert.deepEqual(server, canonical);
});

test('premium and legendary+ rarity boundaries match the paid client tables', () => {
  const premiumCases = [
    [0, 'rare'],
    [779999, 'rare'],
    [780000, 'epic'],
    [939999, 'epic'],
    [940000, 'legendary'],
    [991999, 'legendary'],
    [992000, 'mythic'],
    [999999, 'mythic'],
  ];
  for (const [ticket, expected] of premiumCases) {
    const [roll] = rollMegatonPaidProduct('arsenal_payload', randomSequence([ticket, 0]));
    assert.equal(roll.rarity, expected, `premium ticket ${ticket}`);
  }

  const legendary = rollMegatonPaidProduct(
    'arsenal_legendary_payload',
    randomSequence([899999, 0]),
  );
  const mythic = rollMegatonPaidProduct(
    'arsenal_legendary_payload',
    randomSequence([900000, 0]),
  );
  assert.equal(legendary[0].rarity, 'legendary');
  assert.equal(mythic[0].rarity, 'mythic');
  assert.equal(rollMegatonPaidProduct('arsenal_payload_10', () => 0).length, 10);
  assert.equal(rollMegatonPaidProduct('not-a-paid-roll'), null);
});

test('secure random selection rejection-samples instead of introducing modulo bias', () => {
  const words = [0xffffffff, 42];
  let calls = 0;
  const fakeCrypto = {
    getRandomValues(target) {
      target[0] = words[calls];
      calls += 1;
      return target;
    },
  };
  assert.equal(secureRandomBelow(10, fakeCrypto), 2);
  assert.equal(calls, 2);
  assert.throws(() => secureRandomBelow(0, fakeCrypto), /invalid_secure_random_bound/);
  assert.throws(() => secureRandomBelow(2, null), /secure_random_unavailable/);
});

test('paid purchase amount validation accepts exact Stars, TON, or TON-credit receipts only', () => {
  const product = { amount: 25, nanotons: '200000000' };
  assert.equal(paidPurchaseAmountMatches(
    { status: 'paid', currency: 'XTR', total_amount: '25' },
    product,
  ), true);
  assert.equal(paidPurchaseAmountMatches(
    { status: 'paid', currency: 'TON', total_amount: '200000000' },
    product,
  ), true);
  assert.equal(paidPurchaseAmountMatches(
    { status: 'paid', currency: 'TON_CREDIT', total_amount: '200000000' },
    product,
  ), true);
  assert.equal(paidPurchaseAmountMatches(
    { status: 'paid', currency: 'XTR', total_amount: 24 },
    product,
  ), false);
  assert.equal(paidPurchaseAmountMatches(
    { status: 'pending', currency: 'TON', total_amount: '200000000' },
    product,
  ), false);
});

test('authenticated endpoint derives reward server-side and returns a privacy-safe receipt', async () => {
  const purchase = paidPurchase();
  await withSupabaseMock(purchase, async (calls) => {
    const response = await onRequestPost({
      request: postRequest({
        action: 'redeem',
        game: 'megaton',
        initData: signedInitData(),
        payload: purchase.payload,
      }),
      env: ENV,
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const data = await response.json();
    assert.equal(data.ok, true);
    assert.equal(data.purchase.productId, 'arsenal_payload');
    assert.equal(data.receipt.rollCount, 1);
    assert.ok(
      ['rare', 'epic', 'legendary', 'mythic'].includes(data.receipt.rolls[0].rarity),
      'premium server roll is rare or better',
    );
    assert.equal(data.receipt.rolls[0].paidCopiesAfter, 1);
    assert.equal(data.receipt.payment.totalAmount, '25');

    const rpc = calls.find((call) => call.url.pathname.endsWith('/rpc/redeem_megaton_paid_gacha'));
    assert.ok(rpc, 'redemption RPC called');
    assert.deepEqual(Object.keys(rpc.body).sort(), [
      'p_catalog_version',
      'p_cutover_at',
      'p_product_id',
      'p_purchase_payload',
      'p_rolls',
      'p_telegram_user_id',
    ]);
    assert.equal(rpc.body.p_telegram_user_id, USER_ID);
    assert.equal(rpc.body.p_product_id, purchase.product_id);
    assert.equal(rpc.body.p_cutover_at, ENV.MEGATON_PAID_GACHA_CUTOVER_AT);
    assert.equal(rpc.body.p_rolls.length, 1);
    assert.ok(['rare', 'epic', 'legendary', 'mythic'].includes(rpc.body.p_rolls[0].rarity));

    assert.equal(Object.hasOwn(data.purchase, 'payload'), false);
    assert.equal(JSON.stringify(data).includes(USER_ID), false);
    assert.equal(JSON.stringify(data).includes(purchase.payload), false);
  });
});

test('endpoint refuses client-proposed rolls or inventory state', async () => {
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error('fetch must not be called');
  };
  try {
    for (const action of ['redeem', 'reconcile']) {
      const response = await onRequestPost({
        request: postRequest({
          action,
          game: 'megaton',
          initData: signedInitData(),
          payload: paidPurchase().payload,
          rolls: [{ itemId: 'mythic_last_button' }],
        }),
        env: ENV,
      });
      assert.equal(response.status, 400);
      assert.match((await response.json()).error, /Client reward state/);
    }
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('authenticated inventory action returns only the owner paid snapshot and aggregate stats', async () => {
  const otherUserId = '888002';
  await withSupabaseMock(null, async (calls) => {
    const response = await onRequestPost({
      request: postRequest({
        action: 'inventory',
        game: 'megaton',
        initData: signedInitData(),
      }),
      env: ENV,
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const data = await response.json();
    assert.deepEqual(data, {
      ok: true,
      game: 'megaton',
      action: 'inventory',
      snapshot: {
        catalogVersion: MEGATON_PAID_GACHA_CATALOG_VERSION,
        items: [
          { itemId: 'epic_splitter_pod', rarity: 'epic', paidCopies: 1 },
          { itemId: 'rare_sky_needle', rarity: 'rare', paidCopies: 2 },
        ],
        stats: {
          totalPaidRolls: 3,
          uniquePaidItems: 2,
          duplicatePaidRolls: 1,
        },
      },
    });

    const inventoryCall = calls.find((call) => (
      call.url.pathname.endsWith('/telegram_megaton_paid_inventory')
    ));
    assert.ok(inventoryCall, 'paid inventory table queried');
    assert.equal(inventoryCall.init.method, 'GET');
    assert.equal(inventoryCall.init.headers.authorization, `Bearer ${ENV.SUPABASE_SERVICE_ROLE_KEY}`);
    assert.equal(inventoryCall.url.searchParams.get('telegram_user_id'), `eq.${USER_ID}`);
    assert.equal(inventoryCall.url.searchParams.get('select'), 'item_id,rarity,paid_copies');
    assert.equal(inventoryCall.url.searchParams.get('order'), 'item_id.asc');
    assert.equal(inventoryCall.url.searchParams.get('limit'), '101');

    const statsCall = calls.find((call) => (
      call.url.pathname.endsWith('/telegram_megaton_paid_inventory_stats')
    ));
    assert.ok(statsCall, 'paid inventory stats table queried');
    assert.equal(statsCall.init.method, 'GET');
    assert.equal(statsCall.url.searchParams.get('telegram_user_id'), `eq.${USER_ID}`);
    assert.equal(statsCall.url.searchParams.get('limit'), '1');
    const serialized = JSON.stringify(data);
    assert.equal(serialized.includes(USER_ID), false);
    assert.equal(serialized.includes(otherUserId), false);
  }, {
    inventoryRows: [
      {
        telegram_user_id: USER_ID,
        item_id: 'epic_splitter_pod',
        rarity: 'epic',
        paid_copies: 1,
      },
      {
        telegram_user_id: USER_ID,
        item_id: 'rare_sky_needle',
        rarity: 'rare',
        paid_copies: 2,
      },
      {
        telegram_user_id: otherUserId,
        item_id: 'mythic_last_button',
        rarity: 'mythic',
        paid_copies: 99,
      },
    ],
    inventoryStatsRows: [
      {
        telegram_user_id: USER_ID,
        total_paid_rolls: 3,
        unique_paid_items: 2,
        duplicate_paid_rolls: 1,
      },
      {
        telegram_user_id: otherUserId,
        total_paid_rolls: 99,
        unique_paid_items: 1,
        duplicate_paid_rolls: 98,
      },
    ],
  });
});

test('inventory action returns a stable empty snapshot for a player with no paid rolls', async () => {
  await withSupabaseMock(null, async (calls) => {
    const response = await onRequestPost({
      request: postRequest({
        action: 'inventory',
        game: 'megaton',
        initData: signedInitData(),
      }),
      env: ENV,
    });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).snapshot, {
      catalogVersion: MEGATON_PAID_GACHA_CATALOG_VERSION,
      items: [],
      stats: {
        totalPaidRolls: 0,
        uniquePaidItems: 0,
        duplicatePaidRolls: 0,
      },
    });
    assert.equal(
      calls.filter((call) => /telegram_megaton_paid_inventory(?:_stats)?$/.test(call.url.pathname)).length,
      2,
    );
  });
});

test('inventory action rejects every client mutation field before authentication or storage access', async () => {
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error('fetch must not be called');
  };
  try {
    for (const proposedMutation of [
      { itemId: 'mythic_last_button' },
      { paidCopies: 999 },
      { inventory: [] },
      { stats: { totalPaidRolls: 999 } },
      { payload: paidPurchase().payload },
    ]) {
      const response = await onRequestPost({
        request: postRequest({
          action: 'inventory',
          game: 'megaton',
          initData: signedInitData(),
          ...proposedMutation,
        }),
        env: ENV,
      });
      assert.equal(response.status, 400);
      assert.match((await response.json()).error, /Client .*state|Client inventory mutation input/);
    }
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('inventory action maps a missing paid-gacha migration to the existing 503 contract', async () => {
  await withSupabaseMock(null, async () => {
    const response = await onRequestPost({
      request: postRequest({
        action: 'inventory',
        game: 'megaton',
        initData: signedInitData(),
      }),
      env: ENV,
    });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), {
      ok: false,
      error: 'megaton_paid_gacha_not_migrated',
    });
  }, { missingInventoryMigration: true });
});

test('inventory snapshot fails closed on malformed or over-limit database rows', async () => {
  for (const inventoryRows of [
    [{ item_id: 'rare_sky_needle', rarity: 'mythic', paid_copies: 1 }],
    Array.from({ length: 101 }, () => ({
      item_id: 'rare_sky_needle',
      rarity: 'rare',
      paid_copies: 1,
    })),
  ]) {
    await withSupabaseMock(null, async () => {
      const response = await onRequestPost({
        request: postRequest({
          action: 'inventory',
          game: 'megaton',
          initData: signedInitData(),
        }),
        env: ENV,
      });
      assert.equal(response.status, 500);
      assert.match((await response.json()).error, /Paid inventory lookup failed/);
    }, { inventoryRows });
  }
});

test('endpoint does not redeem pending or underpaid purchases', async () => {
  for (const purchase of [
    paidPurchase({ status: 'pending', paid_at: null }),
    paidPurchase({ total_amount: 24 }),
  ]) {
    await withSupabaseMock(purchase, async (calls) => {
      const response = await onRequestPost({
        request: postRequest({
          game: 'megaton',
          initData: signedInitData(),
          payload: purchase.payload,
        }),
        env: ENV,
      });
      assert.equal(response.status, 409);
      assert.equal(
        calls.some((call) => call.url.pathname.endsWith('/rpc/redeem_megaton_paid_gacha')),
        false,
      );
    });
  }
});

test('paid-gacha actions fail closed when the deployment cutover is missing', async () => {
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error('fetch must not be called without a cutover');
  };
  try {
    for (const action of ['reconcile', 'inventory']) {
      const response = await onRequestPost({
        request: postRequest({
          action,
          game: 'megaton',
          initData: signedInitData(),
        }),
        env: { ...ENV, MEGATON_PAID_GACHA_CUTOVER_AT: '' },
      });
      assert.equal(response.status, 503);
      assert.equal((await response.json()).error, 'megaton_paid_gacha_cutover_not_configured');
    }
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('paid-gacha redemption and reconciliation require the public checkout protocol', async () => {
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error('unmarked paid-gacha actions must not reach Supabase');
  };
  try {
    for (const action of ['redeem', 'reconcile']) {
      const response = await onRequestPost({
        request: postRequest({
          action,
          game: 'megaton',
          initData: signedInitData(),
          checkoutProtocol: '',
          ...(action === 'redeem' ? { payload: paidPurchase().payload } : {}),
        }),
        env: ENV,
      });
      assert.equal(response.status, 409);
      assert.match((await response.json()).error, /checkout protocol/i);
    }
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('direct redemption cannot bypass the legacy-purchase cutover', async () => {
  const legacy = paidPurchase({
    paid_at: '2026-08-01T09:00:00.000Z',
    created_at: '2026-08-01T08:59:00.000Z',
  });
  await withSupabaseMock(legacy, async (calls) => {
    const response = await onRequestPost({
      request: postRequest({
        action: 'redeem',
        game: 'megaton',
        initData: signedInitData(),
        payload: legacy.payload,
      }),
      env: { ...ENV, MEGATON_PAID_GACHA_CUTOVER_AT: '2026-08-01T09:30:00.000Z' },
    });
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /predates/);
    assert.equal(
      calls.some((call) => call.url.pathname.endsWith('/rpc/redeem_megaton_paid_gacha')),
      false,
    );
  });
});

test('direct redemption refuses an unlineaged legacy purchase even after cutover', async () => {
  const legacy = paidPurchase({
    payload: `megaton:arsenal_payload:${USER_ID}:1754048000000:legacy-after-cutover`,
    paid_at: '2026-08-01T10:15:00.000Z',
    created_at: '2026-08-01T10:14:00.000Z',
  });
  await withSupabaseMock(legacy, async (calls) => {
    const response = await onRequestPost({
      request: postRequest({
        action: 'redeem',
        game: 'megaton',
        initData: signedInitData(),
        payload: legacy.payload,
      }),
      env: { ...ENV, MEGATON_PAID_GACHA_CUTOVER_AT: '2026-08-01T09:30:00.000Z' },
    });
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /legacy client checkout/i);
    assert.equal(
      calls.some((call) => call.url.pathname.endsWith('/rpc/redeem_megaton_paid_gacha')),
      false,
    );
  });
});

test('reconcile excludes legacy client-fulfilled purchases before the explicit cutover', async () => {
  const legacy = paidPurchase({
    payload: `megaton:arsenal_payload:${USER_ID}:1754044000000:legacy-client-roll`,
    telegram_payment_charge_id: 'stars-charge-legacy-client-roll',
    paid_at: '2026-08-01T09:00:00.000Z',
    created_at: '2026-08-01T08:59:00.000Z',
  });
  const serverEra = paidPurchase({
    payload: `megaton:mgp1:arsenal_payload:${USER_ID}:1754047000000:server-era-roll`,
    telegram_payment_charge_id: 'stars-charge-server-era-roll',
    paid_at: '2026-08-01T10:00:00.000Z',
    created_at: '2026-08-01T09:59:00.000Z',
  });
  const legacyAfterCutover = paidPurchase({
    payload: `megaton:arsenal_payload:${USER_ID}:1754048000000:legacy-after-cutover`,
    telegram_payment_charge_id: 'stars-charge-legacy-after-cutover',
    paid_at: '2026-08-01T10:15:00.000Z',
    created_at: '2026-08-01T10:14:00.000Z',
  });
  const env = { ...ENV, MEGATON_PAID_GACHA_CUTOVER_AT: '2026-08-01T09:30:00.000Z' };
  await withSupabaseMock([legacy, serverEra, legacyAfterCutover], async (calls) => {
    const response = await onRequestPost({
      request: postRequest({
        action: 'reconcile',
        game: 'megaton',
        initData: signedInitData(),
      }),
      env,
    });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.scanned, 1);
    assert.equal(data.receipts.length, 1);
    assert.deepEqual(
      calls
        .filter((call) => call.url.pathname.endsWith('/rpc/redeem_megaton_paid_gacha'))
        .map((call) => call.body.p_purchase_payload),
      [serverEra.payload],
    );
  });
});

test('reconcile processes only unredeemed post-cutover purchases oldest-first', async () => {
  const historical = paidPurchase({
    payload: `megaton:mgp1:starter:${USER_ID}:1754045000000:oldreceipt`,
    product_id: 'starter',
    paid_at: '2026-08-01T09:00:00.000Z',
    created_at: '2026-08-01T08:59:00.000Z',
  });
  const alreadyRedeemed = paidPurchase({
    payload: `megaton:mgp1:arsenal_payload:${USER_ID}:1754046000000:newreceipt`,
    paid_at: '2026-08-01T10:00:00.000Z',
    created_at: '2026-08-01T09:59:00.000Z',
  });
  const existingReceipt = {
    receipt_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    product_id: alreadyRedeemed.product_id,
    purchase_currency: alreadyRedeemed.currency,
    purchase_total_amount: alreadyRedeemed.total_amount,
    purchase_paid_at: alreadyRedeemed.paid_at,
    catalog_version: MEGATON_PAID_GACHA_CATALOG_VERSION,
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
    idempotent: true,
    total_paid_rolls: 2,
    unique_paid_items: 2,
    duplicate_paid_rolls: 0,
  };

  await withSupabaseMock(
    [historical, alreadyRedeemed],
    async (calls) => {
      const response = await onRequestPost({
        request: postRequest({
          action: 'reconcile',
          game: 'megaton',
          initData: signedInitData(),
        }),
        env: ENV,
      });
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.ok, true);
      assert.equal(data.action, 'reconcile');
      assert.equal(data.order, 'oldest_first');
      assert.equal(data.cutoverAt, ENV.MEGATON_PAID_GACHA_CUTOVER_AT);
      assert.equal(data.scanned, 1);
      assert.equal(data.atQueryLimit, false);
      assert.equal(data.failures.length, 0);
      assert.equal(data.receipts.length, 1);
      assert.equal(data.receipts[0].productId, 'starter');
      assert.equal(data.receipts[0].idempotent, false);

      const listCall = calls.find((call) => (
        call.url.pathname.endsWith('/rpc/list_unredeemed_megaton_paid_gacha')
      ));
      assert.ok(listCall, 'bounded unredeemed-purchase RPC made');
      assert.equal(listCall.body.p_telegram_user_id, USER_ID);
      assert.equal(listCall.body.p_cutover_at, ENV.MEGATON_PAID_GACHA_CUTOVER_AT);
      assert.equal(listCall.body.p_limit, 100);

      const redemptionPayloads = calls
        .filter((call) => call.url.pathname.endsWith('/rpc/redeem_megaton_paid_gacha'))
        .map((call) => call.body.p_purchase_payload);
      assert.deepEqual(redemptionPayloads, [historical.payload]);
      const serialized = JSON.stringify(data);
      assert.equal(serialized.includes(USER_ID), false);
      assert.equal(serialized.includes(historical.payload), false);
      assert.equal(serialized.includes(alreadyRedeemed.payload), false);
    },
    { existingReceipts: { [alreadyRedeemed.payload]: existingReceipt } },
  );
});

test('unredeemed reconciliation advances past 100 purchases on the next request', async () => {
  const purchases = Array.from({ length: 101 }, (_, index) => {
    const paidAt = new Date(Date.parse('2026-08-01T10:00:00.000Z') + index * 1000).toISOString();
    return paidPurchase({
      payload: `megaton:mgp1:arsenal_payload:${USER_ID}:1754046${String(index).padStart(4, '0')}:batch-roll-${index}`,
      telegram_payment_charge_id: `stars-charge-batch-${index}`,
      paid_at: paidAt,
      created_at: paidAt,
    });
  });

  await withSupabaseMock(purchases, async (calls) => {
    const body = {
      action: 'reconcile',
      game: 'megaton',
      initData: signedInitData(),
    };
    const first = await onRequestPost({ request: postRequest(body), env: ENV });
    assert.equal(first.status, 200);
    const firstData = await first.json();
    assert.equal(firstData.scanned, 100);
    assert.equal(firstData.receipts.length, 100);
    assert.equal(firstData.atQueryLimit, true);

    const second = await onRequestPost({ request: postRequest(body), env: ENV });
    assert.equal(second.status, 200);
    const secondData = await second.json();
    assert.equal(secondData.scanned, 1);
    assert.equal(secondData.receipts.length, 1);
    assert.equal(secondData.atQueryLimit, false);

    assert.equal(
      calls.filter((call) => call.url.pathname.endsWith('/rpc/list_unredeemed_megaton_paid_gacha')).length,
      2,
    );
    assert.equal(
      calls.filter((call) => call.url.pathname.endsWith('/rpc/redeem_megaton_paid_gacha')).length,
      101,
    );
  });
});

test('starter reconciliation recovers its deterministic grant after a crash without double-granting', async () => {
  const starter = paidPurchase({
    payload: `megaton:mgp1:starter:${USER_ID}:1754049000000:starter-recovery`,
    product_id: 'starter',
    total_amount: 25,
    telegram_payment_charge_id: 'stars-charge-starter-recovery',
    paid_at: '2026-08-01T10:30:00.000Z',
    created_at: '2026-08-01T10:29:00.000Z',
  });
  const baseState = {
    money: 100,
    totalEarned: 500,
    best: 800,
    cityTier: 2,
    powerLvl: 3,
    luckLvl: 2,
    mirvLvl: 1,
    flareLvl: 0,
    penLvl: 0,
  };

  await withSupabaseMock(starter, async (calls, state) => {
    const reconcileBody = {
      action: 'reconcile',
      game: 'megaton',
      initData: signedInitData(),
    };

    // Simulate losing every local pending-payload record, then crashing after
    // the deterministic grant commits but before the receipt RPC commits.
    const first = await onRequestPost({ request: postRequest(reconcileBody), env: ENV });
    assert.equal(first.status, 200);
    const firstData = await first.json();
    assert.equal(firstData.receipts.length, 0);
    assert.equal(firstData.failures.length, 1);
    assert.equal(state.getStatePatchCount(), 1);
    const afterCrash = state.getStateRow().state;
    assert.equal(afterCrash.money, 2310);
    assert.equal(afterCrash.totalEarned, 2710);
    assert.equal(afterCrash.best, 2710);
    assert.equal(afterCrash.powerLvl, 4, 'starter +1 Yield is durable');
    assert.equal(afterCrash.luckLvl, 4, 'starter +2 Extra Income is durable');
    assert.equal(afterCrash.__server.entitlements.applied[starter.payload].productId, 'starter');

    const retry = await onRequestPost({ request: postRequest(reconcileBody), env: ENV });
    assert.equal(retry.status, 200);
    const retryData = await retry.json();
    assert.equal(retryData.failures.length, 0);
    assert.equal(retryData.receipts.length, 1);
    const receipt = retryData.receipts[0];
    assert.equal(receipt.productId, 'starter');
    assert.equal(receipt.serverGrantApplied, true);
    assert.equal(receipt.state.money, 2310);
    assert.equal(receipt.state.powerLvl, 4);
    assert.equal(receipt.state.luckLvl, 4);
    assert.ok(receipt.stateRev != null, 'authoritative revision is returned');
    assert.equal(state.getStatePatchCount(), 1, 'the retry does not grant starter twice');
    assert.equal(state.getRedemptionAttempts(), 2);

    const settled = await onRequestPost({ request: postRequest(reconcileBody), env: ENV });
    assert.equal(settled.status, 200);
    assert.equal((await settled.json()).scanned, 0);
    assert.equal(state.getStatePatchCount(), 1);
    assert.equal(
      calls.filter((call) => call.url.pathname.endsWith('/rpc/redeem_megaton_paid_gacha')).length,
      2,
    );
  }, {
    stateRow: {
      game: 'megaton',
      telegram_user_id: USER_ID,
      state: baseState,
      state_rev: 10,
      updated_at: '2026-08-01T10:29:00.000Z',
    },
    redeemFailures: 1,
  });
});

test('starter redemption fails closed before receipt creation when its grant conflicts', async () => {
  const starter = paidPurchase({
    payload: `megaton:mgp1:starter:${USER_ID}:1754049000000:starter-conflict`,
    product_id: 'starter',
    total_amount: 25,
    telegram_payment_charge_id: 'stars-charge-starter-conflict',
  });
  await withSupabaseMock(starter, async (calls, state) => {
    const response = await onRequestPost({
      request: postRequest({
        action: 'redeem',
        game: 'megaton',
        initData: signedInitData(),
        payload: starter.payload,
      }),
      env: ENV,
    });
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /starter grant conflict/i);
    assert.equal(state.getRedemptionAttempts(), 0);
    assert.equal(
      calls.some((call) => call.url.pathname.endsWith('/rpc/redeem_megaton_paid_gacha')),
      false,
    );
    assert.equal(state.getStateRow().state.money, 100);
  }, {
    stateRow: {
      game: 'megaton',
      telegram_user_id: USER_ID,
      state: { money: 100, powerLvl: 3, luckLvl: 2 },
      state_rev: 10,
      updated_at: '2026-08-01T10:29:00.000Z',
    },
    statePatchAlwaysConflict: true,
  });
});

test('SQL ledger enforces one immutable receipt and service-role redemption', async () => {
  const here = fileURLToPath(new URL('.', import.meta.url));
  const sql = await readFile(`${here}/../supabase/migrations/20260801000000_megaton_paid_gacha.sql`, 'utf8');
  assert.match(sql, /^\s*--[\s\S]*\bbegin;/i);
  assert.match(sql, /notify pgrst, 'reload schema';\s*\n\s*commit;\s*$/i);
  assert.match(sql, /purchase_payload text not null unique/i);
  assert.match(sql, /telegram_purchases_telegram_charge_unique_idx/i);
  assert.match(sql, /telegram_purchases_provider_charge_unique_idx/i);
  assert.match(sql, /for update;/i);
  assert.match(sql, /before update or delete/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /revoke all on function public\.redeem_megaton_paid_gacha\(text, text, text, text, timestamptz, jsonb\)[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.redeem_megaton_paid_gacha\(text, text, text, text, timestamptz, jsonb\)[\s\S]*to service_role/i);
  assert.match(sql, /paid_copies = inventory\.paid_copies \+ 1/i);
  assert.match(sql, /create or replace function public\.list_unredeemed_megaton_paid_gacha/i);
  assert.match(sql, /purchase\.paid_at >= p_cutover_at/i);
  assert.match(sql, /purchase\.payload ~[\s\S]*\^megaton:mgp1:/i);
  assert.match(sql, /purchase\.payload ~[\s\S]*\^ton:megaton:mgp1:/i);
  assert.match(sql, /purchase\.payload ~[\s\S]*\^megaton:ton_credit:mgp1:/i);
  assert.match(sql, /receipt\.purchase_payload is null/i);
  assert.match(sql, /create or replace function public\.spend_megaton_ton_credit/i);
  assert.match(sql, /p_checkout_protocol text,[\s\S]*p_cutover_at timestamptz/i);
  assert.match(sql, /v_purchase\.paid_at < p_cutover_at/i);
  assert.match(sql, /Megaton purchase has no server checkout lineage/i);
  assert.match(sql, /v_payload := 'megaton:ton_credit:mgp1:'/i);
  assert.match(sql, /for update;/i);
  assert.match(sql, /'TON_CREDIT'/i);
});
