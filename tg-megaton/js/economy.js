export function createEconomy(options) {
  options = options || {};
  var LOCAL_BUILD = Boolean(options.localBuild);
  var AD_CRATE_COOLDOWN_MS = Number(options.adCrateCooldownMs || 60 * 60 * 1000);
  var WEEKLY_CRATE_REWARDS = [
    { label: 'Top 1', min: 1, max: 1, crates: 10, ton: '7.00', nanotons: '7000000000' },
    { label: 'Top 2', min: 2, max: 2, crates: 8, ton: '5.00', nanotons: '5000000000' },
    { label: 'Top 3', min: 3, max: 3, crates: 6, ton: '3.00', nanotons: '3000000000' },
    { label: 'Top 4-10', min: 4, max: 10, crates: 3 },
    { label: 'Top 11-20', min: 11, max: 20, crates: 2 },
    { label: 'Top 21-100', min: 21, max: 100, crates: 1 }
  ];
  var DROP_TABLES = {
    standard: { common: 0.68, rare: 0.23, epic: 0.07, legendary: 0.018, mythic: 0.002 },
    caps: { common: 0.62, rare: 0.27, epic: 0.08, legendary: 0.026, mythic: 0.004 },
    premium: { common: 0, rare: 0.78, epic: 0.16, legendary: 0.052, mythic: 0.008 },
    legendary_plus: { common: 0, rare: 0, epic: 0, legendary: 0.9, mythic: 0.1 },
    weekly: { common: 0, rare: 0.76, epic: 0.17, legendary: 0.06, mythic: 0.01 }
  };
  var DUPLICATE_SELL = { common: 0.5, rare: 1, epic: 1.5, legendary: 2, mythic: 3 };
  var MISSION_CONFIG = [
    {
      id: 'follow_main_channel',
      type: 'follow_link',
      title: 'Join Game Factory',
      desc: 'Open the Game Factory channel for Megaton drops, Bloodtread news, and launch rewards.',
      url: 'https://t.me/gamefactorytech',
      reward: { caps: 750, crates: 1, boxId: 'mission_reward' }
    },
    {
      id: 'share_game_friend',
      type: 'share_game',
      title: 'Share Megaton',
      desc: 'Send Megaton to a friend. First share gives a crate, then hourly shares give caps.',
      repeatable: true,
      cooldownMs: 60 * 60 * 1000,
      firstShareBox: true,
      repeatCapsFactor: 0.1,
      reward: { caps: 0, crates: 1, boxId: 'mission_reward' }
    }
  ];

  var PRODUCTS = {
    starter: {
      title: 'Starter Cache',
      desc: 'Caps, +1 Yield, +2 Extra Income, and 1 Premium Payload.',
      stars: 25,
      ton: '0.20'
    },
    caps_pack: {
      title: 'Caps Pack',
      desc: 'Caps bundle for the next upgrade wall.',
      stars: 49,
      ton: '0.40'
    },
    warhead_tuning: {
      title: 'Warhead Tuning',
      desc: '+4 Yield, +2 Extra Income, and 1200 caps.',
      stars: 75,
      ton: '0.60',
      hidden: true
    },
    mirv_kit: {
      title: 'MIRV Kit',
      desc: '+1 MIRV, +2 Penetrator, +2 Flares, and 1800 caps.',
      stars: 99,
      ton: '0.80',
      hidden: true
    },
    welcome_x8: {
      title: 'Reactor Overdrive',
      desc: 'Retired legacy offer. New purchases are disabled.',
      disabled: true,
      hidden: true,
      noAutoApply: true
    },
    arsenal_payload: {
      title: 'Premium Payload',
      desc: 'One paid Arsenal pull. Guaranteed rare+.',
      stars: 25,
      ton: '0.20',
      hidden: true,
      boxId: 'premium_1'
    },
    arsenal_payload_10: {
      title: 'Premium x10',
      desc: 'Ten paid Arsenal pulls with a rare+ guarantee.',
      stars: 199,
      ton: '1.60',
      hidden: true,
      boxId: 'premium_10'
    },
    arsenal_legendary_payload: {
      title: 'Legendary Payload',
      desc: 'One paid Arsenal pull. Guaranteed legendary+.',
      stars: 199,
      ton: '1.60',
      hidden: true,
      boxId: 'legendary_1'
    },
    god_power: {
      title: 'God Power',
      desc: 'Ad-free play, unlimited rockets, max perks, and a huge caps vault.',
      ton: '20.00',
      god: true
    }
  };
  var SHOP_PRODUCT_ORDER = ['starter', 'caps_pack', 'god_power'];
  var BOX_ART = {
    daily: 'daily_drop',
    ad: 'ad_crate',
    test: 'local_test_crate',
    caps: 'caps_crate',
    premium_1: 'premium_payload',
    premium_10: 'premium_x10',
    legendary_1: 'legendary_payload',
    mission_reward: 'mission_reward',
    weekly_reward: 'weekly_reward'
  };
  var PRODUCT_ART = {
    starter: 'starter_cache',
    caps_pack: 'caps_pack',
    god_power: 'god_power'
  };

  var BOXES = {
    daily: { title: 'Daily Drop', desc: 'Free payload crate resets each day.', button: 'Open', rolls: 1, daily: true, dropTable: 'standard' },
    ad: { title: 'Ad Crate', desc: 'Watch one rewarded ad for a payload crate every hour.', button: 'Watch Ad', rolls: 1, ad: true, cooldownMs: AD_CRATE_COOLDOWN_MS, dropTable: 'standard' },
    test: { title: 'Local Test Crate', desc: 'Localhost-only free crate for testing outside Telegram.', button: 'Open Free', rolls: 1, localOnly: true, dropTable: 'standard' },
    caps: { title: 'Caps Crate', desc: 'Spend caps for one arsenal collectible. Price doubles after each open.', button: '750 Caps', rolls: 1, caps: 750, dropTable: 'caps' },
    premium_1: { title: 'Premium Payload', desc: 'Paid pull with rare+ guarantee.', button: '25 Stars', rolls: 1, premium: true, guaranteeRare: true, paidProduct: 'arsenal_payload', stars: 25, dropTable: 'premium' },
    premium_10: { title: 'Premium x10', desc: 'Ten paid pulls with rare+ guarantee.', button: '199 Stars', rolls: 10, premium: true, guaranteeRare: true, paidProduct: 'arsenal_payload_10', stars: 199, dropTable: 'premium' },
    legendary_1: { title: 'Legendary Payload', desc: 'One paid pull guaranteed legendary+.', button: '199 Stars', rolls: 1, premium: true, legendaryPlus: true, paidProduct: 'arsenal_legendary_payload', stars: 199, dropTable: 'legendary_plus' },
    mission_reward: { title: 'Mission Crate', desc: 'Reward crate from a mission or first friend share.', button: 'Open', rolls: 1, hidden: true, reward: true, dropTable: 'standard' },
    weekly_reward: { title: 'Weekly Winner Crate', desc: 'Weekly leaderboard payout crate.', button: 'Claim', rolls: 1, hidden: true, reward: true, dropTable: 'weekly' }
  };

  function applyEconomyConfig() {
    var configs = [window.MEGATON_ECONOMY_CONFIG || {}];
    if (LOCAL_BUILD) {
      try {
        var raw = localStorage.getItem('megaton_economy_override');
        if (raw) configs.push(JSON.parse(raw));
      } catch (e) {}
    }
    configs.forEach(function (cfg) {
      if (!cfg || typeof cfg !== 'object') return;
      if (cfg.dropTables && typeof cfg.dropTables === 'object') {
        Object.keys(cfg.dropTables).forEach(function (name) {
          if (!cfg.dropTables[name] || typeof cfg.dropTables[name] !== 'object') return;
          DROP_TABLES[name] = Object.assign({}, DROP_TABLES[name] || {}, cfg.dropTables[name]);
        });
      }
      if (cfg.boxes && typeof cfg.boxes === 'object') {
        Object.keys(cfg.boxes).forEach(function (id) {
          if (!BOXES[id] || !cfg.boxes[id] || typeof cfg.boxes[id] !== 'object') return;
          BOXES[id] = Object.assign({}, BOXES[id], cfg.boxes[id]);
        });
      }
      if (Array.isArray(cfg.weeklyRewards) && cfg.weeklyRewards.length) {
        WEEKLY_CRATE_REWARDS = cfg.weeklyRewards.filter(function (row) {
          return row && Number(row.min) > 0 && Number(row.max) >= Number(row.min) && Number(row.crates) > 0;
        });
      }
      if (cfg.duplicateSell && typeof cfg.duplicateSell === 'object') {
        DUPLICATE_SELL = Object.assign({}, DUPLICATE_SELL, cfg.duplicateSell);
      }
      if (Array.isArray(cfg.missions) && cfg.missions.length) MISSION_CONFIG = cfg.missions;
    });
  }
  applyEconomyConfig();


  return {
    WEEKLY_CRATE_REWARDS: WEEKLY_CRATE_REWARDS,
    DROP_TABLES: DROP_TABLES,
    DUPLICATE_SELL: DUPLICATE_SELL,
    MISSION_CONFIG: MISSION_CONFIG,
    PRODUCTS: PRODUCTS,
    SHOP_PRODUCT_ORDER: SHOP_PRODUCT_ORDER,
    BOX_ART: BOX_ART,
    PRODUCT_ART: PRODUCT_ART,
    BOXES: BOXES
  };
}
