export const PRODUCTS_BY_GAME = Object.freeze({
  starfall: Object.freeze({
    starter: Object.freeze({
      title: 'Starfall Sprint Starter Pack',
      description: '500 coins, 3 revives, and the mint comet trail.',
      amount: 25,
      deliver: 'coins_500_revives_3_mint_trail',
    }),
    doubler: Object.freeze({
      title: 'Starfall Sprint Coin Doubler',
      description: 'Permanent double coin rewards inside Starfall Sprint.',
      amount: 75,
      deliver: 'coin_doubler_permanent',
    }),
    revives: Object.freeze({
      title: 'Starfall Sprint Revive Bundle',
      description: '8 revive tokens for Starfall Sprint.',
      amount: 35,
      deliver: 'revives_8',
    }),
    nova_skin: Object.freeze({
      title: 'Starfall Sprint Nova Skin Pack',
      description: 'Two premium catcher skins and 1200 coins.',
      amount: 99,
      deliver: 'skins_2_coins_1200',
    }),
  }),
  bloodtread: Object.freeze({
    starter: Object.freeze({
      title: 'Bloodtread War Chest',
      description: '2,000 blood plus a Tread tier to start fast.',
      amount: 25,
      ton: '0.20',
      nanotons: '200000000',
      deliver: 'blood_2000_treads_1',
    }),
    blood_cache: Object.freeze({
      title: 'Blood Cache',
      description: '6,000 blood for the next upgrade wall.',
      amount: 49,
      ton: '0.40',
      nanotons: '400000000',
      deliver: 'blood_6000',
    }),
    hull_kit: Object.freeze({
      title: 'Reinforced Hull Kit',
      description: '+2 Armor, +2 Blood-Core, and 2,000 blood.',
      amount: 75,
      ton: '0.60',
      nanotons: '600000000',
      deliver: 'armor_2_core_2_blood_2000',
    }),
    arsenal: Object.freeze({
      title: 'Arsenal Overhaul',
      description: '+2 Cannon, +1 Frenzy, and 2,500 blood.',
      amount: 99,
      ton: '0.80',
      nanotons: '800000000',
      deliver: 'cannon_2_frenzy_1_blood_2500',
    }),
    ad_free: Object.freeze({
      title: 'Remove Ads',
      description: 'Skip the rewarded-ad revive prompt - revive instantly, forever.',
      amount: 150,
      ton: '1.20',
      nanotons: '1200000000',
      deliver: 'ad_free',
    }),
    bloodgod: Object.freeze({
      title: 'Bloodgod Pact',
      description: 'Ad-free play, every tread tier maxed, and 250,000 blood.',
      amount: null,
      ton: '20.00',
      nanotons: '20000000000',
      deliver: 'god_power_ad_free_max_treads',
    }),
  }),
  megaton: Object.freeze({
    starter: Object.freeze({
      title: 'Megaton Starter Cache',
      description: '1,500 caps plus +2 Yield and +1 Luck.',
      amount: 25,
      ton: '0.20',
      nanotons: '200000000',
      deliver: 'caps_1500_yield_2_luck_1',
    }),
    caps_pack: Object.freeze({
      title: 'Megaton Caps Pack',
      description: '5000 caps for the next upgrade wall.',
      amount: 49,
      ton: '0.40',
      nanotons: '400000000',
      deliver: 'caps_5000',
    }),
    warhead_tuning: Object.freeze({
      title: 'Megaton Warhead Tuning',
      description: '+4 Yield, +2 Luck, and 1200 caps.',
      amount: 75,
      ton: '0.60',
      nanotons: '600000000',
      deliver: 'yield_4_luck_2_caps_1200',
    }),
    mirv_kit: Object.freeze({
      title: 'Megaton MIRV Kit',
      description: '+1 MIRV, +2 Penetrator, +2 Flares, and 1800 caps.',
      amount: 99,
      ton: '0.80',
      nanotons: '800000000',
      deliver: 'mirv_1_pen_2_flares_2_caps_1800',
    }),
    welcome_x8: Object.freeze({
      title: 'Megaton Reactor Overdrive',
      description: 'Multiply this welcome-back reactor payout by 8.',
      amount: 10,
      deliver: 'welcome_reactor_x8',
    }),
    early_beta: Object.freeze({
      title: 'Megaton Early Beta',
      description: 'Reserve the next-map early beta pass.',
      amount: 1000,
      ton: '8.00',
      nanotons: '8000000000',
      deliver: 'early_beta_interest',
    }),
    god_power: Object.freeze({
      title: 'Megaton God Power',
      description: 'Ad-free play, unlimited rockets, maxed warhead perks, and 250,000 caps.',
      amount: null,
      ton: '20.00',
      nanotons: '20000000000',
      deliver: 'god_power_ad_free_unlimited_rockets',
    }),
  }),
});

export const TON_CONFIG_BY_GAME = Object.freeze({
  bloodtread: Object.freeze({
    recipient: 'UQCAFJyUz0GmYZmtiDz21WXGzOfWPQaBI6T5fPjIjhBn_i6Q',
    network: '-239',
    memoPrefix: 'GF',
  }),
  megaton: Object.freeze({
    recipient: 'UQCAFJyUz0GmYZmtiDz21WXGzOfWPQaBI6T5fPjIjhBn_i6Q',
    network: '-239',
    memoPrefix: 'GF',
  }),
});

export function getProduct(gameId, productId) {
  const gameProducts = PRODUCTS_BY_GAME[gameId];
  if (!gameProducts) return null;
  return gameProducts[productId] || null;
}

export function getTonConfig(gameId, env = {}) {
  const config = TON_CONFIG_BY_GAME[gameId];
  if (!config) return null;
  return {
    ...config,
    recipient: env.MEGATON_TON_RECIPIENT || config.recipient,
  };
}

export function hasStarsPrice(product) {
  return Boolean(product && Number.isFinite(Number(product.amount)) && Number(product.amount) > 0);
}

export function hasTonPrice(product) {
  return Boolean(product && product.ton && product.nanotons && BigInt(String(product.nanotons)) > 0n);
}

export function publicProduct(productId, product) {
  return {
    id: productId,
    title: product.title,
    description: product.description,
    amount: product.amount,
    ton: product.ton || null,
    nanotons: product.nanotons || null,
    deliver: product.deliver,
  };
}

export function parsePaymentPayload(payload) {
  const parts = String(payload || '').split(':');
  if (parts.length < 5) return null;

  const [game, productId, telegramUserId, timestamp, nonce] = parts;
  if (!game || !productId || !telegramUserId || !timestamp || !nonce) return null;

  return {
    game,
    productId,
    telegramUserId,
    timestamp,
    nonce,
  };
}
