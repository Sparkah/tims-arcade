import { createEconomy } from "./economy.js";
import { createCollectibleCatalog } from "./collectibles.js";
import { createPersistence } from "./persistence.js";
import { createPayments } from "./payments.js";
import { installTelegramAdapter } from "./platform-adapter.js";
import {
  mergePaidGachaReceipt,
  mergePaidInventorySnapshot,
  sellableDuplicateCount,
  validatePaidGachaReceipt,
  validatePaidInventorySnapshot
} from "./paid-inventory.js";

(function () {
  'use strict';
  var GAME_ID = 'megaton';
  var SAVE_KEY = 'megaton_v5';
  var tg = window.Telegram && window.Telegram.WebApp;
  var HAS_TG = Boolean(tg && tg.initData);
  var LOCAL_BUILD = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|::1)$/.test(location.hostname);
  var PUBLIC_WEB_BUILD = !HAS_TG && !LOCAL_BUILD;
  var TELEGRAM_APP_URL = 'https://t.me/gamesfactorybot/megaton';
  var SUPPORT_URL = 'https://t.me/plutomanf';
  var GAMEANALYTICS_GAME_KEY = '28543ab05121fd7f4572508b5ff9c915';
  var GAMEANALYTICS_SECRET_KEY = '9f9f5cff08cda74e139d8f335322b5b90196c6c9';
  var GAMEANALYTICS_BUILD = 'megaton-telegram-2026-08-03';
  var API_TIMEOUT_MS = 8000;
  var gameAnalyticsStarted = false;
  var externalScriptLoads = {};
  var game = document.getElementById('game');
  var skinsScreen = document.getElementById('skinsScreen');
  var shopList = document.getElementById('shopList');
  var boxGrid = document.getElementById('boxGrid');
  var revealTray = document.getElementById('revealTray');
  var skinGrid = document.getElementById('skinGrid');
  var skinFilters = document.getElementById('skinFilters');
  var leaderList = document.getElementById('leaderList');
  var missionList = document.getElementById('missionList');
  var localTestPanel = document.getElementById('localTestPanel');
  var tonCreditBar = document.getElementById('tonCreditBar');
  var equippedArt = document.getElementById('equippedArt');
  var equippedLabel = document.getElementById('equippedLabel');
  var skinTitle = document.getElementById('skinTitle');
  var skinLede = document.getElementById('skinLede');
  var closeSkinsBtn = document.getElementById('closeSkinsBtn');
  var shopCloseGuide = document.getElementById('shopCloseGuide');
  var toastEl = document.getElementById('toast');
  var toastTimer = 0;
  var gameStarted = false;
  var authoritativeStateGuardUntil = 0;
  var tonConnectUI = null;
  var tonCreditNanotons = '0';
  var tonCreditLoaded = false;
  var adBusy = false;
  var leaderFetchKey = '';
  var skinTab = 'boxes';
  var shopCloseGuidePending = false;
  var skinFilter = 'all';
  var SKIN_RARITIES = ['common', 'rare', 'epic', 'legendary', 'mythic'];
  var AD_CRATE_COOLDOWN_MS = 60 * 60 * 1000;
  var economy = createEconomy({ localBuild: LOCAL_BUILD, adCrateCooldownMs: AD_CRATE_COOLDOWN_MS });
  var WEEKLY_CRATE_REWARDS = economy.WEEKLY_CRATE_REWARDS;
  var DROP_TABLES = economy.DROP_TABLES;
  var DUPLICATE_SELL = economy.DUPLICATE_SELL;
  var MISSION_CONFIG = economy.MISSION_CONFIG;
  var PRODUCTS = economy.PRODUCTS;
  var SHOP_PRODUCT_ORDER = economy.SHOP_PRODUCT_ORDER;
  var BOX_ART = economy.BOX_ART;
  var PRODUCT_ART = economy.PRODUCT_ART;
  var BOXES = economy.BOXES;

  function loadExternalScript(key, src, configure) {
    if (!src) return Promise.resolve(false);
    if (externalScriptLoads[key]) return externalScriptLoads[key];
    externalScriptLoads[key] = new Promise(function (resolve) {
      var tag = document.createElement('script');
      tag.async = true;
      tag.src = src;
      tag.dataset.megatonSdk = key;
      if (typeof configure === 'function') configure(tag);
      tag.onload = function () { resolve(true); };
      tag.onerror = function () { resolve(false); };
      document.head.appendChild(tag);
    });
    return externalScriptLoads[key];
  }

  var UI_TEXT = {
    en: {
      fab_missions: 'MISSIONS', fab_shop: 'SHOP',
      tab_boxes: 'Shop', tab_missions: 'Missions', tab_collection: 'Collection', tab_leaders: 'Leaders',
      panel_boxes_title: 'Shop', panel_boxes_lede: 'Open payload boxes, buy boosts, and equip one visual bonus.',
      panel_missions_title: 'Missions', panel_missions_lede: 'Complete Telegram missions and collect reward crates in the Shop.',
      panel_collection_title: 'Collection', panel_collection_lede: 'Equip payload visuals, share pulls, and sell duplicate copies.',
      panel_leaders_title: 'Leaders', panel_leaders_lede: 'Weekly eligible crate rankings. Top 3 paid crate ranks also earn TON credit for in-game spending.',
      no_payload: 'No payload equipped', fine_copy: 'Digital items are optional. Reward TON is in-game credit only; withdrawals are not enabled.', terms: 'Terms', reset: 'Reset', close: 'Close',
      caps: 'Caps', caps_lower: 'caps', stars: 'Stars', ton: 'TON', open: 'Open', open_free: 'Open Free', watch_ad: 'Watch Ad', claim: 'Claim', claimed: 'Claimed', start: 'Start', locked: 'Locked', tomorrow: 'Tomorrow', ready: 'Ready', ready_in: 'Ready in {time}', pending: 'Pending: {count}.', credit: 'Credit', use_ton_credit: 'Use credit', ton_credit: '{ton} TON credit', ton_credit_balance: 'TON credit: {ton} TON', ton_credit_note: 'Spend reward TON inside Megaton. Withdrawals are not enabled.',
      roll: 'roll', rolls: 'rolls', crate: 'crate', crates: 'crates', box: 'box', boxes: 'boxes', reward: 'Reward', mythic: 'mythic', legendary_plus_only: 'legendary+ only', rare_plus_only: 'rare+ only', opens_double_price: 'opens double price',
      equipped: 'Equipped', equip: 'Equip', share: 'Share', sell: 'Sell', sell_for: 'Sell for {caps} caps', unknown_payload: 'Unknown Payload', locked_card: 'Locked', preparing_share: 'Preparing share...',
      all: 'All', rarity_common: 'Common', rarity_rare: 'Rare', rarity_epic: 'Epic', rarity_legendary: 'Legendary', rarity_mythic: 'Mythic',
      boost_caps_mult: 'Caps gain', boost_yield_mult: 'Blast yield', boost_cost_disc: 'Upgrade discount', boost_crit_bonus: 'Extra income', boost_offline_mult: 'Reactor gain', boost_nuke_cost_disc: 'Nuke discount', boost_daily_mult: 'Daily ration', boost_ship_bonus: 'Ship bonus',
      mission_follow_main_channel_title: 'Join Game Factory', mission_follow_main_channel_desc: 'Open the Game Factory channel for Megaton drops, Bloodtread news, and launch rewards.',
      mission_share_game_friend_title: 'Share Megaton', mission_share_game_friend_desc: 'Send Megaton to a friend. First share gives a crate, then hourly shares give caps.',
      first_share_reward: 'First share: 1 crate in Shop.', hourly_share_reward: 'Hourly share: +{caps} caps.', reward_prefix: 'Reward: {reward}', share_for_box: 'Share for Box', share_for_caps: 'Share for Caps',
      product_starter_title: 'Starter Cache', product_starter_desc: '{caps} caps, +1 Yield, +2 Extra Income, and 1 Premium Payload.',
      product_caps_pack_title: 'Caps Pack', product_caps_pack_desc: '{caps} caps.',
      product_god_power_title: 'God Power', product_god_power_desc: 'Ad-free play, unlimited rockets, max perks, and {caps} caps.',
      product_warhead_tuning_title: 'Warhead Tuning', product_mirv_kit_title: 'MIRV Kit', product_welcome_x8_title: 'Reactor Overdrive', product_arsenal_payload_title: 'Premium Payload', product_arsenal_payload_10_title: 'Premium x10', product_arsenal_legendary_payload_title: 'Legendary Payload',
      box_daily_title: 'Daily Drop', box_daily_desc: 'Free payload crate resets each day.', box_ad_title: 'Ad Crate', box_ad_desc: 'Watch one rewarded ad for a payload crate every hour.', box_test_title: 'Local Test Crate', box_test_desc: 'Localhost-only free crate for testing outside Telegram.', box_caps_title: 'Caps Crate', box_caps_desc: 'Spend caps for one arsenal collectible. Price doubles after each open.', box_premium_1_title: 'Premium Payload', box_premium_1_desc: 'Paid pull with rare+ guarantee.', box_premium_10_title: 'Premium x10', box_premium_10_desc: 'Ten paid pulls with rare+ guarantee.', box_legendary_1_title: 'Legendary Payload', box_legendary_1_desc: 'One paid pull guaranteed legendary+.', box_mission_reward_title: 'Mission Crate', box_mission_reward_desc: 'Reward crate from a mission or first friend share.', box_weekly_reward_title: 'Weekly Winner Crate', box_weekly_reward_desc: 'Weekly leaderboard payout crate.',
      leader_previous_week: 'Previous week', leader_previous_desc: 'Claim rank payout if you finished top 100. Top 3 paid crate ranks also get TON credit.', leader_no_opens: 'No opens yet', leader_no_opens_desc: 'Open daily, ad, caps, or paid crates to enter this weekly board.', profile: 'Profile', player: 'Player {rank}', crates_opened: '{count} eligible crates', weekly_payout: 'Weekly payout', this_week: 'This week', leaderboard_crates: '{count} eligible crates · {week}', payload_count: 'Payload Count', rare_shelf: 'Rare Shelf', collected: '{owned}/100 collected · {opened} boxes', legendary_owned: '{count} legendary+ owned', you: 'YOU', weekly: 'WEEKLY', all_time: 'All-time', rare_plus: 'Rare+',
      local_tester_title: 'Local crate tester', local_tester_desc: 'Localhost-only controls for crates, duplicates, cooldowns, weekly payouts, and caps.', local_free_premium: 'Free Premium', local_free_x10: 'Free x10', local_free_legendary: 'Free Legendary', local_reward_crate: 'Reward Crate', local_share_friend: 'Share Friend', local_ready_share: 'Ready Share', local_force_duplicate: 'Force Duplicate', local_ready_ad: 'Ready Ad', local_ad_reward: 'Ad Reward', local_caps: '+50k Caps', local_rank: 'Rank #{rank}',
      toast_reward_crate_added: 'Reward crate added to Shop{suffix}.', toast_friend_crate: 'Friend share sent. Reward crate added to Shop.', toast_friend_cooldown: 'Friend share reward ready in {time}.', toast_friend_caps: 'Friend share sent: +{caps} caps.', toast_mission_crate: 'Mission crate added to Shop.', toast_mission_opened: 'Mission opened. Claim when done.', toast_claim_tg: 'Open Megaton in Telegram to claim mission rewards.', toast_mission_claimed: 'Mission claimed: {reward}', toast_mission_already: 'Mission already claimed.', toast_local_duplicate: 'Local duplicate: {name} x{count}', toast_ad_ready: 'Ad crate is ready.', toast_no_rank_reward: 'No reward for rank #{rank}', toast_rank_payout: 'Rank #{rank} weekly payout: {reward}.', toast_local_reward: 'Local reward crate added to Shop.', toast_share_ready: 'Friend share cooldown ready.', toast_share_first: 'Send the first friend share first.', toast_caps_added: '+{caps} caps.', toast_equipped: 'Equipped: {name}', toast_no_duplicate: 'No duplicate copy to sell.', toast_sold_copy: 'Sold {name} copy for {caps} caps.', toast_collect_tg: 'Open Megaton in Telegram to collect crates.', toast_local_only: 'Local test crate only works on localhost.', toast_buy_stars_tg: 'Open Megaton in Telegram to buy with Stars.', toast_ad_ready_in: 'Ad crate ready in {time}.', toast_watch_ad_first: 'Watch the rewarded ad first.', toast_daily_done: 'Daily box already opened.', toast_need_caps: 'Need {caps} caps.', toast_opened: 'Opened: {box}{equipped}', toast_opened_equipped: ' · Equipped {name}', toast_no_reward_waiting: 'No reward crate waiting.', toast_watch_full_ad: 'Watch the full ad to unlock the crate.', toast_demo_reset: 'Arsenal demo reset.', toast_purchase_applied: 'Purchase applied: {title}', toast_product_paid: '{title} paid', toast_invoice_cancelled: 'Invoice cancelled', toast_invoice_status: 'Invoice status: {status}', toast_payment_setup_failed: 'Payment setup failed: {error}', toast_ton_checkout: 'Opening Megaton in Telegram for TON checkout.', toast_ton_connecting: 'Connecting TON wallet...', toast_ton_confirm: 'Confirm {ton} TON in your wallet.', toast_ton_waiting: 'Waiting for TON confirmation...', toast_ton_applied: 'TON purchase applied: {title}', toast_ton_pending: 'TON sent. Reward will unlock when the chain indexer catches up.', toast_ton_cancelled: 'TON transaction cancelled.', toast_ton_wallet_missing: 'TON wallet was not connected.', toast_ton_failed: 'TON checkout failed: {error}', toast_ton_unsupported: 'TON checkout is not enabled for this item yet.', toast_stars_checkout: 'Opening Megaton in Telegram for Stars checkout.', toast_stars_invoice: 'Opening Telegram Stars invoice...', toast_receipt_pending: 'Payment confirmed. Receipt sync is still catching up.', toast_credit_spent: 'TON credit spent: {title}. Balance: {ton} TON.', toast_credit_insufficient: 'Not enough TON credit. Balance: {ton} TON.', toast_credit_failed: 'TON credit spend failed.', toast_credit_balance_failed: 'TON credit balance failed.', toast_weekly_none: 'No weekly payout available.', toast_weekly_already: 'Weekly payout already claimed.', toast_weekly_claimed: 'Weekly payout claimed: {reward}.', toast_weekly_failed: 'Weekly payout check failed.', toast_ad_not_ready: 'Ad not ready. Try again in a moment.'
    },
    ru: {
      fab_missions: 'МИССИИ', fab_shop: 'МАГАЗИН',
      tab_boxes: 'Магазин', tab_missions: 'Миссии', tab_collection: 'Коллекция', tab_leaders: 'Лидеры',
      panel_boxes_title: 'Магазин', panel_boxes_lede: 'Открывайте ящики, покупайте бусты и выбирайте один визуальный бонус.',
      panel_missions_title: 'Миссии', panel_missions_lede: 'Выполняйте Telegram-миссии и забирайте ящики в магазине.',
      panel_collection_title: 'Коллекция', panel_collection_lede: 'Выбирайте внешний вид, делитесь находками и продавайте дубликаты.',
      panel_leaders_title: 'Лидеры', panel_leaders_lede: 'Недельный рейтинг зачётных ящиков. Топ-3 по платным ящикам также получают TON-кредит для трат в игре.',
      no_payload: 'Скин не выбран', fine_copy: 'Цифровые предметы необязательны. Наградный TON - это игровой кредит; вывод пока не включён.', terms: 'Условия', reset: 'Сброс', close: 'Закрыть',
      caps: 'Крышки', caps_lower: 'крышек', stars: 'Stars', ton: 'TON', open: 'Открыть', open_free: 'Открыть бесплатно', watch_ad: 'Смотреть рекламу', claim: 'Забрать', claimed: 'Получено', start: 'Начать', locked: 'Закрыто', tomorrow: 'Завтра', ready: 'Готово', ready_in: 'Через {time}', pending: 'Ждёт: {count}.', credit: 'Кредит', use_ton_credit: 'Кредит', ton_credit: '{ton} TON-кредит', ton_credit_balance: 'TON-кредит: {ton} TON', ton_credit_note: 'Тратьте наградный TON внутри Megaton. Вывод пока не включён.',
      roll: 'ролл', rolls: 'роллов', crate: 'ящик', crates: 'ящиков', box: 'ящик', boxes: 'ящиков', reward: 'Награда', mythic: 'мифик', legendary_plus_only: 'только легендарный+', rare_plus_only: 'только редкий+', opens_double_price: 'цена удваивается',
      equipped: 'Выбран', equip: 'Выбрать', share: 'Поделиться', sell: 'Продать', sell_for: 'Продать за {caps} крышек', unknown_payload: 'Неизвестный скин', locked_card: 'Закрыто', preparing_share: 'Готовим отправку...',
      all: 'Все', rarity_common: 'Обычный', rarity_rare: 'Редкий', rarity_epic: 'Эпик', rarity_legendary: 'Легенда', rarity_mythic: 'Мифик',
      boost_caps_mult: 'доход крышек', boost_yield_mult: 'мощность взрыва', boost_cost_disc: 'скидка улучшений', boost_crit_bonus: 'доп. доход', boost_offline_mult: 'доход реактора', boost_nuke_cost_disc: 'скидка бомб', boost_daily_mult: 'дневной паёк', boost_ship_bonus: 'бонус кораблей',
      mission_follow_main_channel_title: 'Вступить в Game Factory', mission_follow_main_channel_desc: 'Откройте канал Game Factory с дропами Megaton, новостями Bloodtread и стартовыми наградами.',
      mission_share_game_friend_title: 'Поделиться Megaton', mission_share_game_friend_desc: 'Отправьте Megaton другу. Первый шер даёт ящик, затем раз в час даёт крышки.',
      first_share_reward: 'Первый шер: 1 ящик в магазине.', hourly_share_reward: 'Раз в час: +{caps} крышек.', reward_prefix: 'Награда: {reward}', share_for_box: 'Шер за ящик', share_for_caps: 'Шер за крышки',
      product_starter_title: 'Стартовый набор', product_starter_desc: '{caps} крышек, +1 Мощность, +2 Доп. доход и 1 премиум ящик.',
      product_caps_pack_title: 'Пак крышек', product_caps_pack_desc: '{caps} крышек.',
      product_god_power_title: 'God Power', product_god_power_desc: 'Без рекламы, бесконечные ракеты, максимум перков и {caps} крышек.',
      product_warhead_tuning_title: 'Тюнинг боеголовки', product_mirv_kit_title: 'Набор MIRV', product_welcome_x8_title: 'Разгон реактора', product_arsenal_payload_title: 'Премиум ящик', product_arsenal_payload_10_title: 'Премиум x10', product_arsenal_legendary_payload_title: 'Легендарный ящик',
      box_daily_title: 'Дневной дроп', box_daily_desc: 'Бесплатный ящик раз в день.', box_ad_title: 'Рекламный ящик', box_ad_desc: 'Смотрите рекламу и получайте ящик раз в час.', box_test_title: 'Локальный тестовый ящик', box_test_desc: 'Бесплатный ящик только на localhost для тестов вне Telegram.', box_caps_title: 'Ящик за крышки', box_caps_desc: 'Потратьте крышки на один предмет арсенала. Цена удваивается после каждого открытия.', box_premium_1_title: 'Премиум ящик', box_premium_1_desc: 'Платный ролл с гарантией редкий+.', box_premium_10_title: 'Премиум x10', box_premium_10_desc: 'Десять платных роллов с гарантией редкий+.', box_legendary_1_title: 'Легендарный ящик', box_legendary_1_desc: 'Один платный ролл с гарантией легендарный+.', box_mission_reward_title: 'Ящик за миссию', box_mission_reward_desc: 'Ящик-награда за миссию или первый шер другу.', box_weekly_reward_title: 'Ящик победителя недели', box_weekly_reward_desc: 'Недельная награда рейтинга.',
      leader_previous_week: 'Прошлая неделя', leader_previous_desc: 'Забрать награду, если вы попали в топ-100. Топ-3 по платным ящикам также получает TON-кредит.', leader_no_opens: 'Открытий пока нет', leader_no_opens_desc: 'Открывайте дневные, рекламные, ящики за крышки или платные ящики для рейтинга.', profile: 'Профиль', player: 'Игрок {rank}', crates_opened: '{count} зачётных ящиков', weekly_payout: 'Недельная награда', this_week: 'Эта неделя', leaderboard_crates: '{count} зачётных ящиков · {week}', payload_count: 'Коллекция', rare_shelf: 'Редкая полка', collected: '{owned}/100 собрано · {opened} ящиков', legendary_owned: '{count} легендарных+ собрано', you: 'ВЫ', weekly: 'НЕДЕЛЯ', all_time: 'Всего', rare_plus: 'Редкий+',
      local_tester_title: 'Локальный тест ящиков', local_tester_desc: 'Инструменты localhost для ящиков, дубликатов, кулдаунов, недельных наград и крышек.', local_free_premium: 'Бесплатный премиум', local_free_x10: 'Бесплатный x10', local_free_legendary: 'Бесплатный легендарный', local_reward_crate: 'Ящик-награда', local_share_friend: 'Шер другу', local_ready_share: 'Сброс шера', local_force_duplicate: 'Дубликат', local_ready_ad: 'Сброс рекламы', local_ad_reward: 'Реклама OK', local_caps: '+50k крышек', local_rank: 'Ранг #{rank}',
      toast_reward_crate_added: 'Ящик добавлен в магазин{suffix}.', toast_friend_crate: 'Шер отправлен. Ящик добавлен в магазин.', toast_friend_cooldown: 'Награда за шер будет через {time}.', toast_friend_caps: 'Шер отправлен: +{caps} крышек.', toast_mission_crate: 'Ящик за миссию добавлен в магазин.', toast_mission_opened: 'Миссия открыта. Заберите после выполнения.', toast_claim_tg: 'Откройте Megaton в Telegram, чтобы забрать награду.', toast_mission_claimed: 'Миссия получена: {reward}', toast_mission_already: 'Миссия уже получена.', toast_local_duplicate: 'Локальный дубликат: {name} x{count}', toast_ad_ready: 'Рекламный ящик готов.', toast_no_rank_reward: 'Нет награды за ранг #{rank}', toast_rank_payout: 'Недельная награда ранга #{rank}: {reward}.', toast_local_reward: 'Локальный ящик добавлен в магазин.', toast_share_ready: 'Кулдаун шера готов.', toast_share_first: 'Сначала отправьте первый шер другу.', toast_caps_added: '+{caps} крышек.', toast_equipped: 'Выбран: {name}', toast_no_duplicate: 'Нет дубликата для продажи.', toast_sold_copy: 'Продан дубликат {name} за {caps} крышек.', toast_collect_tg: 'Откройте Megaton в Telegram, чтобы забрать ящики.', toast_local_only: 'Локальный тестовый ящик работает только на localhost.', toast_buy_stars_tg: 'Откройте Megaton в Telegram, чтобы купить за Stars.', toast_ad_ready_in: 'Рекламный ящик через {time}.', toast_watch_ad_first: 'Сначала посмотрите рекламу.', toast_daily_done: 'Дневной ящик уже открыт.', toast_need_caps: 'Нужно {caps} крышек.', toast_opened: 'Открыто: {box}{equipped}', toast_opened_equipped: ' · выбран {name}', toast_no_reward_waiting: 'Нет ящика-награды.', toast_watch_full_ad: 'Досмотрите рекламу, чтобы открыть ящик.', toast_demo_reset: 'Демо арсенала сброшено.', toast_purchase_applied: 'Покупка применена: {title}', toast_product_paid: '{title} оплачен', toast_invoice_cancelled: 'Инвойс отменён', toast_invoice_status: 'Статус инвойса: {status}', toast_payment_setup_failed: 'Ошибка оплаты: {error}', toast_ton_checkout: 'Открываем Megaton в Telegram для TON-оплаты.', toast_ton_connecting: 'Подключаем TON-кошелёк...', toast_ton_confirm: 'Подтвердите {ton} TON в кошельке.', toast_ton_waiting: 'Ждём подтверждение TON...', toast_ton_applied: 'TON-покупка применена: {title}', toast_ton_pending: 'TON отправлен. Награда откроется после индексации транзакции.', toast_ton_cancelled: 'TON-транзакция отменена.', toast_ton_wallet_missing: 'TON-кошелёк не подключён.', toast_ton_failed: 'Ошибка TON-оплаты: {error}', toast_ton_unsupported: 'TON-оплата для этого предмета пока недоступна.', toast_stars_checkout: 'Открываем Megaton в Telegram для Stars-оплаты.', toast_stars_invoice: 'Открываем инвойс Telegram Stars...', toast_receipt_pending: 'Оплата подтверждена. Чек ещё синхронизируется.', toast_credit_spent: 'TON-кредит потрачен: {title}. Осталось: {ton} TON.', toast_credit_insufficient: 'Недостаточно TON-кредита. Баланс: {ton} TON.', toast_credit_failed: 'Не удалось потратить TON-кредит.', toast_credit_balance_failed: 'Не удалось загрузить TON-кредит.', toast_weekly_none: 'Недельной награды нет.', toast_weekly_already: 'Недельная награда уже получена.', toast_weekly_claimed: 'Недельная награда получена: {reward}.', toast_weekly_failed: 'Не удалось проверить недельную награду.', toast_ad_not_ready: 'Реклама не готова. Попробуйте чуть позже.'
    }
  };
  function telegramLanguage() {
    try {
      var code = tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.language_code;
      return String(code || '').toLowerCase().indexOf('ru') === 0 ? 'ru' : 'en';
    } catch (e) {
      return 'en';
    }
  }
  function currentLanguage() {
    try {
      var stored = localStorage.getItem('megaton_lang');
      if (stored === 'ru' || stored === 'en') return stored;
    } catch (e) {}
    return telegramLanguage();
  }
  function uiText(key, vars) {
    var lang = currentLanguage();
    var dict = UI_TEXT[lang] || UI_TEXT.en;
    var out = dict[key] != null ? dict[key] : (UI_TEXT.en[key] != null ? UI_TEXT.en[key] : '');
    if (!out) return '';
    vars = vars || {};
    return String(out).replace(/\{([a-zA-Z0-9_]+)\}/g, function (_, name) {
      return vars[name] != null ? String(vars[name]) : '';
    });
  }
  function uiFallback(key, fallback, vars) { return uiText(key, vars) || fallback || ''; }
  function localizeShell() {
    try { document.documentElement.lang = currentLanguage(); } catch (e) {}
    var map = [
      ['missionsBtn', 'fab_missions'],
      ['shopBtn', 'fab_shop'],
      ['demoResetSkinsBtn', 'reset'],
      ['closeSkinsBtn', 'close'],
      ['fineCopy', 'fine_copy'],
      ['termsLink', 'terms']
    ];
    map.forEach(function (row) {
      var el = document.getElementById(row[0]);
      if (el) el.textContent = uiText(row[1]);
    });
    document.querySelectorAll('[data-skin-tab]').forEach(function (btn) {
      btn.textContent = uiText('tab_' + btn.getAttribute('data-skin-tab'));
    });
    var resetBtn = document.getElementById('demoResetSkinsBtn');
    if (resetBtn) {
      if (LOCAL_BUILD) resetBtn.hidden = false;
      else resetBtn.remove();
    }
    var footer = document.querySelector('.skin-footer');
    if (footer) footer.classList.toggle('single', !LOCAL_BUILD);
  }
  function applyTelegramLanguageDefault() {
    try {
      if (localStorage.getItem('megaton_lang_manual') === '1') return;
      localStorage.setItem('megaton_lang', telegramLanguage());
    } catch (e) {}
  }
  function gaHostOk() {
    try {
      var h = location.hostname;
      return h === 'game-factory.tech' || h === 'www.game-factory.tech';
    } catch (e) {
      return false;
    }
  }
  function tgUser() {
    try { return tg && tg.initDataUnsafe && tg.initDataUnsafe.user || null; } catch (e) { return null; }
  }
  function cleanSourceTag(raw) {
    return String(raw || '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64);
  }
  function startMeta() {
    var startParam = '';
    try {
      var unsafe = tg && tg.initDataUnsafe || {};
      startParam = cleanSourceTag(unsafe.start_param || new URLSearchParams(location.search).get('startapp') || new URLSearchParams(location.search).get('source') || '');
    } catch (e) {}
    return {
      source: startParam || (HAS_TG ? 'telegram' : 'web'),
      startParam: startParam
    };
  }
  function startSource() {
    return startMeta().source;
  }
  function gaUserId() {
    var user = tgUser();
    if (user && user.id != null) return String(user.id);
    try {
      var id = localStorage.getItem('megaton_ga_uid');
      if (!id) {
        id = 'web_' + (window.crypto && crypto.randomUUID ? crypto.randomUUID() : (Date.now() + '_' + Math.random().toString(36).slice(2)));
        localStorage.setItem('megaton_ga_uid', id);
      }
      return id;
    } catch (e) {
      return 'web_' + Date.now();
    }
  }
  function gaInstallQueue() {
    if (typeof window.GameAnalytics === 'function') return;
    window.GameAnalytics = function () { (window.GameAnalytics.q = window.GameAnalytics.q || []).push(arguments); };
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://download.gameanalytics.com/js/GameAnalytics-4.4.6.min.js';
    var first = document.getElementsByTagName('script')[0];
    first.parentNode.insertBefore(s, first);
  }
  function initGameAnalytics() {
    if (gameAnalyticsStarted || !gaHostOk()) return false;
    gameAnalyticsStarted = true;
    gaInstallQueue();
    var source = startSource();
    var lang = currentLanguage();
    try {
      var sourceDim = source || (HAS_TG ? 'telegram' : 'web');
      var sourceDims = ['telegram', 'gamefactory', 'web', 'unknown'];
      if (sourceDims.indexOf(sourceDim) < 0) sourceDims.push(sourceDim);
      window.GameAnalytics('configureAvailableCustomDimensions01', sourceDims);
      window.GameAnalytics('configureAvailableCustomDimensions02', ['en', 'ru', 'other']);
      window.GameAnalytics('configureBuild', GAMEANALYTICS_BUILD);
      window.GameAnalytics('configureUserId', gaUserId());
      window.GameAnalytics('setCustomDimension01', sourceDim);
      window.GameAnalytics('setCustomDimension02', lang === 'ru' ? 'ru' : lang === 'en' ? 'en' : 'other');
      window.GameAnalytics('initialize', GAMEANALYTICS_GAME_KEY, GAMEANALYTICS_SECRET_KEY);
    } catch (e) {}
    return true;
  }
  function gaLevelName(payload) {
    var lvl = Math.max(1, Math.floor(Number(payload && payload.level) || 1));
    return 'level_' + String(lvl).padStart(3, '0');
  }
  function gaProgression(status, payload) {
    initGameAnalytics();
    if (!gameAnalyticsStarted || typeof window.GameAnalytics !== 'function') return;
    payload = payload || {};
    var gaStatus = status === 'complete' ? 'Complete' : status === 'fail' ? 'Fail' : 'Start';
    var lvl = gaLevelName(payload);
    var zone = String(payload.zone || 'campaign').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 32) || 'campaign';
    try {
      window.GameAnalytics('addProgressionEvent', gaStatus, 'campaign', zone, lvl);
      if (payload.destroyedPct != null) {
        window.GameAnalytics('addDesignEvent', 'megaton:progression:' + gaStatus.toLowerCase() + ':' + lvl, Math.max(0, Math.min(100, Number(payload.destroyedPct) || 0)));
      }
      if (payload.maxTier != null) {
        window.GameAnalytics('addDesignEvent', 'megaton:max_level', Math.max(1, Number(payload.maxTier) + 1 || 1));
      }
    } catch (e) {}
  }
  function gaDesign(name, value) {
    initGameAnalytics();
    if (!gameAnalyticsStarted || typeof window.GameAnalytics !== 'function') return;
    try {
      var id = ('megaton:' + String(name || 'unknown')).replace(/[^A-Za-z0-9:_-]/g, '_');
      id = id.split(':').slice(0, 5).map(function (part) { return part.slice(0, 32) || 'x'; }).join(':');
      if (value != null && isFinite(Number(value))) window.GameAnalytics('addDesignEvent', id, Number(value));
      else window.GameAnalytics('addDesignEvent', id);
    } catch (e) {}
  }
  window.__megatonAnalytics = {
    progression: gaProgression,
    design: gaDesign,
    state: function (payload) {
      initGameAnalytics();
      if (!gameAnalyticsStarted || typeof window.GameAnalytics !== 'function') return;
      try {
        window.GameAnalytics('addDesignEvent', 'megaton:current_level', Math.max(1, Number(payload && payload.level) || 1));
      } catch (e) {}
    }
  };
  var catalog = createCollectibleCatalog(SKIN_RARITIES);
  var SKINS = catalog.SKINS;
  var SKINS_BY_ID = catalog.SKINS_BY_ID;
  var RARITY_COLORS = catalog.RARITY_COLORS;
  var safeAssetKey = catalog.safeAssetKey;
  var cloneSkinCatalogEntry = catalog.cloneSkinCatalogEntry;

  function dayNum() {
    var n = new Date();
    return Math.floor((n.getTime() - n.getTimezoneOffset() * 60000) / 86400000);
  }
  function fmtPct(v) {
    return (Math.round(Number(v || 0) * 1000) / 10).toFixed(1) + '%';
  }
  function fmtCaps(n) {
    n = Math.max(0, Math.ceil(Number(n || 0)));
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function weekId(date) {
    var d = date ? new Date(date) : new Date();
    var day = d.getUTCDay() || 7;
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    d.setUTCDate(d.getUTCDate() + 4 - day);
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    var week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return d.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
  }
  function currentWeekId() {
    return weekId(new Date());
  }
  function ensureWeeklyStats(st) {
    var stats = st.gachaStats || (st.gachaStats = {});
    var wk = currentWeekId();
    if (stats.weeklyCrateWeek !== wk) {
      if (stats.weeklyCrateWeek) {
        stats.previousWeeklyCrateWeek = stats.weeklyCrateWeek;
        stats.previousWeeklyCratesOpened = Number(stats.weeklyCratesOpened || 0);
      }
      stats.weeklyCrateWeek = wk;
      stats.weeklyCratesOpened = 0;
    }
    return stats;
  }
  function formatCooldown(ms) {
    ms = Math.max(0, Math.ceil(Number(ms || 0)));
    if (!ms) return uiText('ready');
    var mins = Math.ceil(ms / 60000);
    if (mins < 60) return mins + 'm';
    var hrs = Math.floor(mins / 60);
    var rem = mins % 60;
    return hrs + 'h' + (rem ? ' ' + rem + 'm' : '');
  }
  function adCrateRemainingMs(st) {
    var last = Number(st && st.gachaStats && st.gachaStats.adCrateLastAt || 0);
    var cooldown = Number(BOXES.ad && BOXES.ad.cooldownMs || AD_CRATE_COOLDOWN_MS);
    return Math.max(0, cooldown - (Date.now() - last));
  }
  function skinCopyCount(st, id) {
    return Math.max(0, Math.floor(Number(st && st.skinCopies && st.skinCopies[id] || 0)));
  }
  function setSkinCopyCount(st, id, count) {
    st.skinCopies = st.skinCopies || {};
    count = Math.max(0, Math.floor(Number(count || 0)));
    if (count > 0) st.skinCopies[id] = count;
    else delete st.skinCopies[id];
  }
  function duplicateSellMultiplier(rarity) {
    return Number(DUPLICATE_SELL[rarity] || DUPLICATE_SELL.common || 0.5);
  }
  function duplicateSellValue(skin) {
    var wall = localMaxUpgradeCost(readLocalState() || {});
    return Math.max(1, Math.round(wall * duplicateSellMultiplier(skin && skin.rarity)));
  }
  function recordCrateOpen(st, opts) {
    opts = opts || {};
    var stats = ensureWeeklyStats(st);
    stats.boxesOpened = Math.max(0, Number(stats.boxesOpened || 0)) + 1;
    if (opts.countLeaderboard !== false) stats.weeklyCratesOpened = Math.max(0, Number(stats.weeklyCratesOpened || 0)) + 1;
  }
  function pendingRewardBoxes(st) {
    var stats = st.gachaStats || (st.gachaStats = {});
    return stats.pendingRewardBoxes && typeof stats.pendingRewardBoxes === 'object' ? stats.pendingRewardBoxes : (stats.pendingRewardBoxes = {});
  }
  function pendingRewardBoxCount(st, id) {
    return Math.max(0, Math.floor(Number(pendingRewardBoxes(st)[id] || 0)));
  }
  function addPendingRewardBox(st, id, count) {
    id = id || 'mission_reward';
    count = Math.max(0, Math.floor(Number(count || 0)));
    if (!count) return 0;
    var pending = pendingRewardBoxes(st);
    pending[id] = Math.max(0, Math.floor(Number(pending[id] || 0))) + count;
    return pending[id];
  }
  function consumePendingRewardBox(st, id) {
    var pending = pendingRewardBoxes(st);
    var count = Math.max(0, Math.floor(Number(pending[id] || 0)));
    if (count <= 0) return false;
    if (count === 1) delete pending[id];
    else pending[id] = count - 1;
    return true;
  }
  function queueRewardCrate(boxId, count, toastText, switchToShop) {
    var st = readGachaState();
    var total = addPendingRewardBox(st, boxId || 'mission_reward', count || 1);
    writeGachaState(st);
    queueSave(120);
    toast(toastText || uiText('toast_reward_crate_added', { suffix: total > 1 ? ' x' + total : '' }), 1800);
    if (switchToShop && !skinsScreen.hidden) setSkinTab('boxes');
    else renderSkins();
    return total;
  }
  function shareMissionState(st) {
    var stats = st.gachaStats || (st.gachaStats = {});
    return stats.friendShare && typeof stats.friendShare === 'object' ? stats.friendShare : (stats.friendShare = { firstBoxAt: 0, lastRewardAt: 0, count: 0 });
  }
  function missionById(id) {
    for (var i = 0; i < MISSION_CONFIG.length; i += 1) {
      if (MISSION_CONFIG[i] && MISSION_CONFIG[i].id === id) return MISSION_CONFIG[i];
    }
    return null;
  }
  function shareRewardCaps(mission) {
    var factor = Number(mission && mission.repeatCapsFactor || 0.1);
    if (!(factor > 0)) factor = 0.1;
    return Math.max(1, Math.round(localMaxUpgradeCost(readLocalState() || {}) * factor));
  }
  function shareRewardRemainingMs(st, mission) {
    var rec = shareMissionState(st || readGachaState());
    if (!rec.firstBoxAt) return 0;
    var cooldown = Number(mission && mission.cooldownMs || 60 * 60 * 1000);
    return Math.max(0, cooldown - (Date.now() - Number(rec.lastRewardAt || 0)));
  }
  function grantFriendShareReward(payload) {
    var mission = missionById('share_game_friend') || {};
    var st = readGachaState();
    var rec = shareMissionState(st);
    rec.count = Math.max(0, Math.floor(Number(rec.count || 0))) + 1;
    rec.payload = payload || rec.payload || {};
    var now = Date.now();
    if (!rec.firstBoxAt) {
      var firstReward = mission.reward || {};
      var firstCrates = mission.firstShareBox === false ? 0 : Math.max(1, Math.floor(Number(firstReward.crates || 1)));
      var firstBoxId = firstReward.boxId || 'mission_reward';
      rec.firstBoxAt = now;
      rec.lastRewardAt = now;
      if (firstCrates) addPendingRewardBox(st, firstBoxId, firstCrates);
      var mrec = missionRecord(st, 'share_game_friend');
      mrec.progressAt = mrec.progressAt || now;
      mrec.claimedAt = mrec.claimedAt || now;
      mrec.payload = payload || mrec.payload || {};
      writeGachaState(st);
      queueSave(120);
      toast(uiText('toast_friend_crate'), 1900);
      renderSkins();
      return { type: 'crate', boxId: firstBoxId, count: firstCrates };
    }
    var wait = shareRewardRemainingMs(st, mission);
    if (wait > 0) {
      writeGachaState(st);
      toast(uiText('toast_friend_cooldown', { time: formatCooldown(wait) }), 1700);
      renderSkins();
      return { type: 'cooldown', waitMs: wait };
    }
    var caps = shareRewardCaps(mission);
    rec.lastRewardAt = now;
    writeGachaState(st);
    addCapsToSaveAndGame(caps);
    toast(uiText('toast_friend_caps', { caps: fmtCaps(caps) }), 1700);
    renderSkins();
    return { type: 'caps', caps: caps };
  }
  function reportCrateOpenToServer(id, box, opts) {
    if (!HAS_TG || !box || opts.countLeaderboard === false || opts.localTest) return;
    var source = box.daily ? 'daily' : box.ad ? 'ad' : box.caps ? 'caps' : box.paidProduct ? 'paid' : 'free';
    apiPost('/api/tg-crate-report', {
      game: GAME_ID,
      initData: tg.initData,
      crateId: id,
      source: source,
      productId: opts.productId || box.paidProduct || null,
      payload: opts.purchasePayload || opts.payload || null
    }, true).then(function () {
      leaderFetchKey = '';
    }).catch(function () {});
  }
  function weeklyRewardForRank(rank) {
    rank = Math.max(1, Math.floor(Number(rank || 0)));
    for (var i = 0; i < WEEKLY_CRATE_REWARDS.length; i += 1) {
      var row = WEEKLY_CRATE_REWARDS[i];
      if (rank >= row.min && rank <= row.max) return row.crates;
    }
    return 0;
  }
  function weeklyTonNanotonsForRank(rank) {
    rank = Math.max(1, Math.floor(Number(rank || 0)));
    for (var i = 0; i < WEEKLY_CRATE_REWARDS.length; i += 1) {
      var row = WEEKLY_CRATE_REWARDS[i];
      if (rank >= row.min && rank <= row.max) return normalizeNanotons(row.nanotons || (Number(row.ton || 0) * 1000000000));
    }
    return '0';
  }
  function baseGachaState() {
    return {
      ownedSkins: [],
      skinCopies: {},
      equippedSkin: '',
      skinBoosts: {},
      gachaStats: {
        boxesOpened: 0,
        dailyLastDay: -1,
        duplicates: 0,
        shards: 0,
        paidPreview: 0,
        capsCrateOpens: 0,
        adCrateLastAt: 0,
        adCrateOpens: 0,
        localTestOpens: 0,
        pendingRewardBoxes: {},
        friendShare: { firstBoxAt: 0, lastRewardAt: 0, count: 0 },
        weeklyCrateWeek: currentWeekId(),
        weeklyCratesOpened: 0,
        previousWeeklyCrateWeek: '',
        previousWeeklyCratesOpened: 0,
        weeklyRewardWeek: '',
        weeklyRewardCrates: 0,
        missions: {},
        paidReceiptIds: {},
        paidSkinCopies: {}
      }
    };
  }
  function normalizeGachaState(save) {
    var st = baseGachaState();
    save = save || {};
    st.ownedSkins = Array.isArray(save.ownedSkins) ? save.ownedSkins.filter(function (id) { return SKINS_BY_ID[id]; }) : [];
    if (save.skinCopies && typeof save.skinCopies === 'object') {
      Object.keys(save.skinCopies).forEach(function (id) {
        var count = Math.floor(Number(save.skinCopies[id] || 0));
        if (SKINS_BY_ID[id] && count > 0) {
          st.skinCopies[id] = count;
          if (st.ownedSkins.indexOf(id) < 0) st.ownedSkins.push(id);
        }
      });
    }
    st.ownedSkins.forEach(function (id) {
      if (!skinCopyCount(st, id)) st.skinCopies[id] = 1;
    });
    st.equippedSkin = SKINS_BY_ID[save.equippedSkin] ? save.equippedSkin : (st.ownedSkins[0] || '');
    st.skinBoosts = save.skinBoosts && typeof save.skinBoosts === 'object' ? save.skinBoosts : {};
    st.gachaStats = Object.assign(st.gachaStats, save.gachaStats && typeof save.gachaStats === 'object' ? save.gachaStats : {});
    if (!st.gachaStats.paidReceiptIds || typeof st.gachaStats.paidReceiptIds !== 'object' || Array.isArray(st.gachaStats.paidReceiptIds)) {
      st.gachaStats.paidReceiptIds = {};
    }
    if (!st.gachaStats.paidSkinCopies || typeof st.gachaStats.paidSkinCopies !== 'object' || Array.isArray(st.gachaStats.paidSkinCopies)) {
      st.gachaStats.paidSkinCopies = {};
    }
    ensureWeeklyStats(st);
    return st;
  }
  function readGachaState() {
    return normalizeGachaState(readLocalState() || {});
  }
  function writeGachaState(st, baseSave) {
    var save = baseSave && typeof baseSave === 'object' ? baseSave : (readLocalState() || {});
    save.ownedSkins = st.ownedSkins.slice();
    save.skinCopies = Object.assign({}, st.skinCopies || {});
    save.equippedSkin = st.equippedSkin || '';
    save.skinBoosts = st.skinBoosts || {};
    save.gachaStats = st.gachaStats || {};
    writeLocalState(save);
    syncEquippedSkinToGame(st);
    return save;
  }
  function currentSkin(st) {
    st = st || readGachaState();
    return SKINS_BY_ID[st.equippedSkin] || null;
  }
  function capsCrateOpenCount(st) {
    st = st || readGachaState();
    return Math.max(0, Math.floor(Number(st.gachaStats && st.gachaStats.capsCrateOpens || 0)));
  }
  function capsCratePrice(st) {
    return Math.max(1, Math.round(BOXES.caps.caps * Math.pow(2, capsCrateOpenCount(st))));
  }
  function syncEquippedSkinToGame(st) {
    var skin = currentSkin(st);
    try {
      var cw = game.contentWindow;
      if (cw && typeof cw.__gfEquipSkin === 'function') cw.__gfEquipSkin(skin, st || baseGachaState(), { noSave: true });
    } catch (e) {}
  }
  function telegramStartParam(value) {
    value = String(value || 'gamefactory').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64);
    return value || 'gamefactory';
  }
  function telegramGameUrl(source) {
    return TELEGRAM_APP_URL + '?startapp=' + encodeURIComponent(telegramStartParam(source || 'gamefactory'));
  }
  function openTelegramGame(source) {
    var url = telegramGameUrl(source || 'gamefactory');
    try {
      if (tg && typeof tg.openTelegramLink === 'function') tg.openTelegramLink(url);
      else window.open(url, '_blank', 'noopener');
    } catch (e) {
      window.location.href = url;
    }
    return url;
  }
  function openSupportFeedback() {
    try {
      if (tg && typeof tg.openTelegramLink === 'function') tg.openTelegramLink(SUPPORT_URL);
      else if (tg && typeof tg.openLink === 'function') tg.openLink(SUPPORT_URL);
      else window.open(SUPPORT_URL, '_blank', 'noopener');
    } catch (e) {
      window.location.href = SUPPORT_URL;
    }
    return SUPPORT_URL;
  }
  function shareTextForSkin(skin) {
    return currentLanguage() === 'ru'
      ? 'Я выбил ' + (skin ? skin.name : 'скин') + ' в Megaton. Открой ящик и попробуй собрать арсенал круче.'
      : 'I pulled ' + (skin ? skin.name : 'a payload') + ' in Megaton. Open a crate and try to beat my arsenal.';
  }
  function shareUrlForSkin(skin) {
    return telegramGameUrl(skin && skin.id ? 'skin_' + skin.id : 'gamefactory');
  }
  function shareGifUrlForSkin(skin) {
    if (!skin || !skin.id) return '';
    return new URL('./game/assets/gacha/anim_gifs/' + safeAssetKey(skin.id) + '.gif', location.href).href;
  }
  function openTelegramShare(url, text) {
    var shareUrl = 'https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(text || '');
    try {
      if (tg && typeof tg.openTelegramLink === 'function') tg.openTelegramLink(shareUrl);
      else window.open(shareUrl, '_blank', 'noopener');
    } catch (e) {
      window.open(shareUrl, '_blank', 'noopener');
    }
  }
  function finishSharedSkin(skin) {
    grantFriendShareReward({ sharedSkin: skin.id });
  }
  function fallbackShareSkin(skin) {
    openTelegramShare(shareUrlForSkin(skin), shareTextForSkin(skin));
    finishSharedSkin(skin);
  }
  async function shareSkinViaWebShare(skin) {
    if (!navigator.share || !navigator.canShare) return false;
    var gifUrl = shareGifUrlForSkin(skin);
    if (!gifUrl) return false;
    try {
      var res = await fetch(gifUrl, { cache: 'force-cache' });
      if (!res.ok) return false;
      var blob = await res.blob();
      var file = new File([blob], safeAssetKey(skin.id) + '.gif', { type: blob.type || 'image/gif' });
      var payload = { files: [file], title: 'Megaton', text: shareTextForSkin(skin), url: shareUrlForSkin(skin) };
      if (!navigator.canShare(payload)) return false;
      await navigator.share(payload);
      finishSharedSkin(skin);
      return true;
    } catch (e) {
      return false;
    }
  }
  async function shareSkinViaTelegramPrepared(skin) {
    if (!HAS_TG || !tg || typeof tg.shareMessage !== 'function') return false;
    try {
      var data = await apiPost('/api/tg-share-skin', {
        game: GAME_ID,
        initData: tg.initData,
        skinId: skin.id,
        skinName: skin.name,
        text: shareTextForSkin(skin)
      });
      if (!data || !data.preparedMessageId) return false;
      return await new Promise(function (resolve) {
        try {
          tg.shareMessage(data.preparedMessageId, function (sent) {
            if (sent) finishSharedSkin(skin);
            resolve(Boolean(sent));
          });
        } catch (e) {
          resolve(false);
        }
      });
    } catch (e) {
      return false;
    }
  }
  async function shareSkin(skin) {
    if (!skin) return;
    toast(uiText('preparing_share'), 1200);
    if (await shareSkinViaTelegramPrepared(skin)) return;
    if (await shareSkinViaWebShare(skin)) return;
    fallbackShareSkin(skin);
  }
  function skinArtNode(skin, compact) {
    skin = skin || SKINS[0];
    var visual = skin.visual || {};
    var art = document.createElement('div');
    art.className = [
      'skin-art',
      visual.body || skin.silhouette || 'capsule',
      visual.style || skin.style || '',
      skin.family || '',
      compact ? 'compact' : ''
    ].filter(Boolean).join(' ');
    art.style.setProperty('--skin', skin.color);
    art.style.setProperty('--primary', visual.primary || skin.color);
    art.style.setProperty('--secondary', visual.secondary || skin.secondary || '#fff4b8');
    art.style.setProperty('--accent', visual.accent || skin.accent);
    art.style.setProperty('--blast', visual.blast || '#ff8a3b');
    var iconId = skin.assetId || skin.id;
    var animId = safeAssetKey(skin.id || iconId);
    if (iconId) {
      art.classList.add('has-icon');
      var img = document.createElement('img');
      img.className = 'skin-icon';
      var fallbackSrc = './game/assets/gacha/icons_alpha/' + safeAssetKey(iconId).replace(/_[0-9]{3}$/, '') + '.png';
      img.src = compact ? fallbackSrc : './game/assets/gacha/anim_gifs/' + animId + '.gif';
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.onerror = function () {
        if (img.src.indexOf('/anim_gifs/') >= 0) {
          art.classList.remove('has-anim');
          img.src = fallbackSrc;
          return;
        }
        art.classList.remove('has-icon');
        art.innerHTML = '<span class="trail"></span><span class="payload"><span class="core"></span></span><span class="cameo"></span><span class="burst"></span>';
      };
      img.onload = function () {
        if (img.src.indexOf('/anim_gifs/') >= 0) art.classList.add('has-anim');
      };
      art.appendChild(img);
    } else {
      art.innerHTML = '<span class="trail"></span><span class="payload"><span class="core"></span></span><span class="cameo"></span><span class="burst"></span>';
    }
    return art;
  }
  function renderSkinCard(skin, st, opts) {
    opts = opts || {};
    var owned = st.ownedSkins.indexOf(skin.id) >= 0;
    var copies = skinCopyCount(st, skin.id);
    var sellableCopies = sellableDuplicateCount(st, skin.id);
    var visible = owned || opts.forceName || opts.reveal;
    var card = document.createElement('div');
    card.className = 'skin-card' + (owned || opts.reveal ? '' : ' locked') + (st.equippedSkin === skin.id ? ' equipped' : '') + (opts.reveal ? ' reveal' : '');
    card.style.setProperty('--skin', RARITY_COLORS[skin.rarity]);
    card.appendChild(skinArtNode(skin, true));
    if (copies > 1 || (opts.reveal && copies > 0)) {
      var badge = document.createElement('span');
      badge.className = 'copy-badge';
      badge.textContent = 'x' + Math.max(1, copies);
      card.appendChild(badge);
    }
    var chip = document.createElement('span');
    chip.className = 'rarity';
    chip.textContent = rarityLabel(skin.rarity);
    card.appendChild(chip);
    var h = document.createElement('h3');
    h.textContent = visible ? skin.name : uiText('unknown_payload');
    card.appendChild(h);
    var p = document.createElement('p');
    p.textContent = visible ? skin.family + ' · ' + boostLabel(skin.boost.kind) + ' +' + fmtPct(skin.boost.value) + (sellableCopies > 0 ? ' · ' + uiText('sell').toLowerCase() + ' +' + fmtCaps(duplicateSellValue(skin)) : '') : uiText('locked_card');
    card.appendChild(p);
    if (owned && !opts.reveal) {
      var actions = document.createElement('div');
      actions.className = 'card-actions two' + (sellableCopies > 0 ? ' has-sell' : '');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'equip-btn primary';
      btn.textContent = st.equippedSkin === skin.id ? uiText('equipped') : uiText('equip');
      btn.disabled = st.equippedSkin === skin.id;
      btn.addEventListener('click', function () { equipSkin(skin.id); });
      actions.appendChild(btn);
      var share = document.createElement('button');
      share.type = 'button';
      share.className = 'equip-btn share';
      share.textContent = uiText('share');
      share.addEventListener('click', function () { shareSkin(skin); });
      actions.appendChild(share);
      if (sellableCopies > 0) {
        var sell = document.createElement('button');
        sell.type = 'button';
        sell.className = 'equip-btn sell';
        sell.textContent = uiText('sell');
        sell.title = uiText('sell_for', { caps: fmtCaps(duplicateSellValue(skin)) });
        sell.addEventListener('click', function () { sellDuplicateSkin(skin.id); });
        actions.appendChild(sell);
      }
      card.appendChild(actions);
    }
    return card;
  }
  function pickRarityFromTable(tableName) {
    var table = DROP_TABLES[tableName] || DROP_TABLES.standard;
    var r = Math.random();
    var acc = 0;
    for (var i = 0; i < SKIN_RARITIES.length; i += 1) {
      var rarity = SKIN_RARITIES[i];
      acc += Number(table[rarity] || 0);
      if (r <= acc) return rarity;
    }
    return table.common ? 'common' : 'rare';
  }
  function pickSkin(box, index, gotRare) {
    var rarity = pickRarityFromTable(box.dropTable || (box.guaranteeRare ? 'premium' : 'standard'));
    var pool = SKINS.filter(function (s) { return s.rarity === rarity; });
    return pool[Math.floor(Math.random() * pool.length)] || SKINS[0];
  }

  if (tg) {
    try {
      tg.ready();
      tg.expand();
      if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();
      if (tg.setHeaderColor) tg.setHeaderColor('#031009');
      if (tg.setBackgroundColor) tg.setBackgroundColor('#031009');
    } catch (e) {}
  }

  function toast(msg, ms) {
    clearTimeout(toastTimer);
    toastEl.textContent = msg;
    toastEl.hidden = false;
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, ms || 2600);
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  var persistence = createPersistence({
    saveKey: SAVE_KEY,
    gameId: GAME_ID,
    telegram: tg,
    hasTelegram: HAS_TG,
    timeoutMs: API_TIMEOUT_MS,
    getStartMeta: startMeta,
    onAuthoritativeConflict: guardAndReloadAuthoritativeState
  });
  var apiPost = persistence.apiPost;
  var readLocalState = persistence.readLocalState;
  var writeLocalState = persistence.writeLocalState;
  var adoptAuthoritativeState = persistence.adoptAuthoritativeState;
  var loadRemoteState = persistence.loadRemoteState;
  var saveRemoteState = persistence.saveRemoteState;
  var queueSave = persistence.queueSave;

  function tonPriceFor(id) {
    var catalog = window.MEGATON_TON_PRICES || {};
    var configured = catalog[id];
    if (configured && configured.ton && configured.nanotons) return configured;
    var product = PRODUCTS[id];
    return product && product.ton ? { ton: product.ton, nanotons: '' } : null;
  }

  function tonPriceNanotonsFor(id) {
    var price = tonPriceFor(id);
    if (!price) return '0';
    if (price.nanotons) return normalizeNanotons(price.nanotons);
    return normalizeNanotons(Math.round(Number(price.ton || 0) * 1000000000));
  }

  function updateTonCreditFrom(data) {
    if (data && data.creditNanotons != null) {
      tonCreditNanotons = normalizeNanotons(data.creditNanotons);
      tonCreditLoaded = true;
      renderTonCreditBar();
      if (!skinsScreen.hidden) renderSkins();
    }
  }

  function renderTonCreditBar() {
    if (!tonCreditBar) return;
    if (!HAS_TG) {
      tonCreditBar.hidden = true;
      return;
    }
    tonCreditBar.hidden = false;
    tonCreditBar.textContent = '';
    var title = document.createElement('strong');
    var note = document.createElement('span');
    title.textContent = uiText('ton_credit_balance', { ton: tonFromNanotons(tonCreditNanotons) });
    note.textContent = uiText('ton_credit_note');
    tonCreditBar.appendChild(title);
    tonCreditBar.appendChild(note);
  }

  function refreshTonCreditBalance(force) {
    if (!HAS_TG) return Promise.resolve(null);
    if (tonCreditLoaded && !force) {
      renderTonCreditBar();
      return Promise.resolve({ creditNanotons: tonCreditNanotons });
    }
    return apiPost('/api/tg-ton-credit', {
      action: 'balance',
      game: GAME_ID,
      initData: tg.initData
    }, false, 3500).then(function (data) {
      updateTonCreditFrom(data);
      return data;
    }).catch(function () {
      toast(uiText('toast_credit_balance_failed'), 1400);
      return null;
    });
  }

  function hasEnoughTonCredit(id) {
    return Number(tonCreditNanotons || 0) >= Number(tonPriceNanotonsFor(id) || 0);
  }

  function setBuyBusy(btn, busy) {
    if (!btn) return;
    btn.disabled = Boolean(busy);
    btn.setAttribute('aria-busy', busy ? 'true' : 'false');
  }

  function boostLabel(kind) {
    return uiFallback('boost_' + kind, kind);
  }

  function rarityLabel(rarity) {
    return uiFallback('rarity_' + rarity, rarity ? rarity.charAt(0).toUpperCase() + rarity.slice(1) : '');
  }

  function missionTitle(mission) {
    return uiFallback('mission_' + mission.id + '_title', mission.title || mission.id);
  }

  function missionDesc(mission) {
    return uiFallback('mission_' + mission.id + '_desc', mission.desc || '');
  }

  function productTitle(id, product) {
    return uiFallback('product_' + id + '_title', product && product.title || id);
  }

  function boxTitle(id, box) {
    return uiFallback('box_' + id + '_title', box && box.title || id);
  }

  function boxDesc(id, box) {
    return uiFallback('box_' + id + '_desc', box && box.desc || '');
  }

  function capsText(amount) {
    return fmtCaps(amount) + ' ' + uiText('caps_lower');
  }

  function crateText(count) {
    count = Math.max(0, Math.floor(Number(count || 0)));
    return count + ' ' + uiText(count === 1 ? 'crate' : 'crates');
  }

  function normalizeNanotons(value) {
    var n = Math.max(0, Math.floor(Number(value || 0)));
    return Number.isFinite(n) ? String(n) : '0';
  }

  function tonFromNanotons(value) {
    var n = Math.max(0, Math.floor(Number(value || 0)));
    if (!Number.isFinite(n) || !n) return '0';
    var whole = Math.floor(n / 1000000000);
    var frac = String(n % 1000000000).padStart(9, '0').replace(/0+$/, '');
    return frac ? whole + '.' + frac : String(whole);
  }

  function tonCreditText(nanotons) {
    return uiText('ton_credit', { ton: tonFromNanotons(nanotons) });
  }

  function rewardSummary(crates, nanotons) {
    var parts = [];
    crates = Math.max(0, Math.floor(Number(crates || 0)));
    nanotons = normalizeNanotons(nanotons);
    if (crates) parts.push(crateText(crates));
    if (Number(nanotons) > 0) parts.push(tonCreditText(nanotons));
    return parts.join(' + ') || uiText('reward');
  }

  function rollText(count) {
    count = Math.max(0, Math.floor(Number(count || 0)));
    return count + ' ' + uiText(count === 1 ? 'roll' : 'rolls');
  }

  function productCapsTotal(id) {
    var save = readLocalState() || {};
    var wall = localMaxUpgradeCost(save);
    if (id === 'starter') return 1500 + Math.ceil(wall * 1.5);
    if (id === 'caps_pack') return 5000 + Math.ceil(wall * 5);
    if (id === 'god_power') return 250000 + Math.ceil(wall * 10);
    return 0;
  }

  function productDescription(id, product) {
    if (id === 'starter') return uiText('product_starter_desc', { caps: fmtCaps(productCapsTotal(id)) });
    if (id === 'caps_pack') return uiText('product_caps_pack_desc', { caps: fmtCaps(productCapsTotal(id)) });
    if (id === 'god_power') return uiText('product_god_power_desc', { caps: fmtCaps(productCapsTotal(id)) });
    return product.desc;
  }

  function renderShop() {
    shopList.textContent = '';
    SHOP_PRODUCT_ORDER.forEach(function (id) {
      var p = PRODUCTS[id];
      if (!p || p.hidden) return;
      var ton = tonPriceFor(id);
      var item = document.createElement('div');
      var art = document.createElement('div');
      var artImg = document.createElement('img');
      var copy = document.createElement('div');
      var title = document.createElement('h3');
      var desc = document.createElement('p');
      var actions = document.createElement('div');

      item.className = 'shop-item' + (p.god ? ' god' : '');
      art.className = 'shop-product-art';
      artImg.src = './game/assets/gacha/ui/products/' + (PRODUCT_ART[id] || id) + '.png';
      artImg.alt = '';
      artImg.loading = 'lazy';
      artImg.decoding = 'async';
      artImg.onerror = function () { art.textContent = ''; };
      art.appendChild(artImg);
      title.textContent = productTitle(id, p);
      desc.textContent = productDescription(id, p);
      actions.className = 'buy-row';

      if (p.stars) {
        var starsBtn = document.createElement('button');
        starsBtn.className = 'buy';
        starsBtn.type = 'button';
        starsBtn.textContent = p.stars + ' ' + uiText('stars');
        starsBtn.addEventListener('click', function () {
          setBuyBusy(starsBtn, true);
          buyProduct(id, 'XTR').finally(function () { setBuyBusy(starsBtn, false); });
        });
        actions.appendChild(starsBtn);
      }

      if (ton) {
        if (HAS_TG) {
          var creditBtn = document.createElement('button');
          creditBtn.className = 'buy credit';
          creditBtn.type = 'button';
          creditBtn.textContent = uiText('use_ton_credit');
          creditBtn.disabled = !hasEnoughTonCredit(id);
          creditBtn.title = uiText('ton_credit_balance', { ton: tonFromNanotons(tonCreditNanotons) });
          creditBtn.addEventListener('click', function () {
            setBuyBusy(creditBtn, true);
            buyProduct(id, 'TON_CREDIT').finally(function () { setBuyBusy(creditBtn, false); });
          });
          actions.appendChild(creditBtn);
        }
        var tonBtn = document.createElement('button');
        tonBtn.className = 'buy ton';
        tonBtn.type = 'button';
        tonBtn.textContent = ton.ton + ' TON';
        tonBtn.addEventListener('click', function () {
          setBuyBusy(tonBtn, true);
          buyProduct(id, 'TON').finally(function () { setBuyBusy(tonBtn, false); });
        });
        actions.appendChild(tonBtn);
      }

      copy.appendChild(title);
      copy.appendChild(desc);
      item.appendChild(art);
      item.appendChild(copy);
      item.appendChild(actions);
      shopList.appendChild(item);
    });
  }

  function missionRecord(st, id) {
    var stats = st.gachaStats || (st.gachaStats = {});
    var missions = stats.missions && typeof stats.missions === 'object' ? stats.missions : (stats.missions = {});
    return missions[id] && typeof missions[id] === 'object' ? missions[id] : (missions[id] = {});
  }

  function rewardText(reward) {
    reward = reward || {};
    var parts = [];
    if (reward.caps) parts.push(capsText(reward.caps));
    if (reward.crates) parts.push(crateText(reward.crates));
    return parts.join(' + ') || uiText('reward');
  }
  function missionRewardText(mission, st) {
    if (mission && mission.type === 'share_game') {
      var share = shareMissionState(st || readGachaState());
      if (!share.firstBoxAt) return uiText('first_share_reward');
      return uiText('hourly_share_reward', { caps: fmtCaps(shareRewardCaps(mission)) });
    }
    return rewardText(mission && mission.reward);
  }

  function addCapsToSaveAndGame(amount) {
    amount = Math.max(0, Math.ceil(Number(amount || 0)));
    if (!amount) return 0;
    var appliedInGame = false;
    try {
      var cw = game.contentWindow;
      if (cw && typeof cw.__gfAddCaps === 'function') {
        cw.__gfAddCaps(amount);
        appliedInGame = true;
      }
    } catch (e) {}
    if (!appliedInGame) {
      var save = readLocalState() || {};
      addLocalCaps(save, amount);
      writeLocalState(save);
    }
    queueSave(120);
    return amount;
  }

  function grantMissionReward(mission, switchToShop) {
    var reward = mission && mission.reward || {};
    if (reward.caps) addCapsToSaveAndGame(reward.caps);
    var crates = Math.max(0, Math.floor(Number(reward.crates || 0)));
    if (crates) queueRewardCrate(reward.boxId || 'mission_reward', crates, uiText('toast_mission_crate'), switchToShop);
  }

  function markMissionProgress(id, payload) {
    var st = readGachaState();
    var rec = missionRecord(st, id);
    rec.progressAt = rec.progressAt || Date.now();
    rec.payload = payload || rec.payload || {};
    writeGachaState(st);
    if (!skinsScreen.hidden && skinTab === 'boxes') renderSkins();
  }

  function openMission(mission) {
    if (!mission) return;
    if (mission.type === 'follow_link' && mission.url) {
      try {
        if (tg && typeof tg.openTelegramLink === 'function' && /^https:\/\/t\.me\//.test(mission.url)) tg.openTelegramLink(mission.url);
        else window.open(mission.url, '_blank', 'noopener');
      } catch (e) {
        window.open(mission.url, '_blank', 'noopener');
      }
      markMissionProgress(mission.id, { opened: mission.url });
      toast(uiText('toast_mission_opened'), 1600);
      return;
    }
    if (mission.type === 'share_game') {
      openTelegramShare(telegramGameUrl('gamefactory'), currentLanguage() === 'ru' ? 'Megaton уже доступен. Сбрось боеголовку, открывай ящики и собирай арсенал.' : 'Megaton is live. Drop one warhead, open crates, and build an arsenal.');
      grantFriendShareReward({ shared: true, source: 'mission' });
    }
  }

  function claimMission(mission) {
    if (!mission) return;
    if (mission.type === 'share_game') {
      openMission(mission);
      return;
    }
    var st = readGachaState();
    var rec = missionRecord(st, mission.id);
    if (rec.claimedAt) {
      toast(uiText('toast_mission_already'), 1400);
      return;
    }
    if (!rec.progressAt) {
      openMission(mission);
      return;
    }
    if (PUBLIC_WEB_BUILD) {
      openTelegramGame('gamefactory');
      toast(uiText('toast_claim_tg'), 1800);
      return;
    }
    rec.claimedAt = Date.now();
    writeGachaState(st);
    gaDesign('mission:claim:' + (mission.id || 'unknown'));
    grantMissionReward(mission, true);
    toast(uiText('toast_mission_claimed', { reward: rewardText(mission.reward) }), 1800);
    renderSkins();
  }

  function renderMissions(st) {
    if (!missionList) return;
    missionList.textContent = '';
    MISSION_CONFIG.forEach(function (mission) {
      if (!mission || mission.disabled) return;
      var rec = missionRecord(st, mission.id);
      var card = document.createElement('div');
      var h = document.createElement('h3');
      var p = document.createElement('p');
      var actions = document.createElement('div');
      var openBtn = document.createElement('button');
      var claimBtn = document.createElement('button');
      var shareWait = mission.type === 'share_game' ? shareRewardRemainingMs(st, mission) : 0;
      var shareState = mission.type === 'share_game' ? shareMissionState(st) : null;
      card.className = 'mission-card';
      h.textContent = missionTitle(mission);
      p.textContent = missionDesc(mission) + ' ' + uiText('reward_prefix', { reward: missionRewardText(mission, st) });
      actions.className = 'mission-actions';
      openBtn.type = 'button';
      openBtn.textContent = mission.type === 'share_game'
        ? (shareWait > 0 ? uiText('ready_in', { time: formatCooldown(shareWait) }) : (shareState && shareState.firstBoxAt ? uiText('share_for_caps') : uiText('share_for_box')))
        : uiText('open');
      openBtn.disabled = shareWait > 0;
      openBtn.addEventListener('click', function () { openMission(mission); });
      claimBtn.type = 'button';
      claimBtn.textContent = rec.claimedAt ? uiText('claimed') : rec.progressAt ? uiText('claim') : uiText('start');
      claimBtn.className = rec.claimedAt ? 'claimed' : '';
      claimBtn.disabled = Boolean(rec.claimedAt);
      claimBtn.addEventListener('click', function () { claimMission(mission); });
      actions.appendChild(openBtn);
      if (mission.type !== 'share_game') actions.appendChild(claimBtn);
      card.appendChild(h);
      card.appendChild(p);
      card.appendChild(actions);
      missionList.appendChild(card);
    });
  }

  function grantLocalDuplicate() {
    var st = readGachaState();
    var skin = currentSkin(st) || SKINS_BY_ID[st.ownedSkins[0]] || SKINS[0];
    grantSkin(skin, st, { autoEquip: true });
    recordCrateOpen(st, { source: 'local_duplicate' });
    writeGachaState(st);
    revealPulledSkins([skin], st);
    toast(uiText('toast_local_duplicate', { name: skin.name, count: skinCopyCount(st, skin.id) }), 1600);
    renderSkins();
    return skin.id;
  }

  function readyAdCrate() {
    var st = readGachaState();
    st.gachaStats.adCrateLastAt = 0;
    writeGachaState(st);
    toast(uiText('toast_ad_ready'), 1200);
    renderSkins();
  }

  function claimWeeklyReward(rank) {
    var crates = weeklyRewardForRank(rank);
    var tonNano = weeklyTonNanotonsForRank(rank);
    if (!crates && Number(tonNano) <= 0) {
      toast(uiText('toast_no_rank_reward', { rank: rank }), 1400);
      return 0;
    }
    for (var i = 0; i < crates; i += 1) {
      grantSkinBox('weekly_reward', {
        autoEquip: true,
        reward: true,
        localTest: true,
        countLeaderboard: false,
        productId: 'weekly_rank_' + rank
      });
    }
    var st = readGachaState();
    st.gachaStats.weeklyRewardWeek = currentWeekId();
    st.gachaStats.weeklyRewardCrates = Number(st.gachaStats.weeklyRewardCrates || 0) + crates;
    writeGachaState(st);
    tonCreditNanotons = normalizeNanotons(Number(tonCreditNanotons || 0) + Number(tonNano || 0));
    tonCreditLoaded = true;
    toast(uiText('toast_rank_payout', { rank: rank, reward: rewardSummary(crates, tonNano) }), 1800);
    renderSkins();
    return crates;
  }

  function renderLocalTestPanel(st) {
    if (!localTestPanel) return;
    if (!LOCAL_BUILD) {
      localTestPanel.hidden = true;
      return;
    }
    localTestPanel.hidden = false;
    localTestPanel.textContent = '';
    var h = document.createElement('h3');
    var p = document.createElement('p');
    var actions = document.createElement('div');
    h.textContent = uiText('local_tester_title');
    p.textContent = uiText('local_tester_desc');
    actions.className = 'test-actions';
    [
      [uiText('local_free_premium'), function () { grantSkinBox('premium_1', { autoEquip: true, paid: true, localTest: true, productId: 'local_premium' }); }],
      [uiText('local_free_x10'), function () { grantSkinBox('premium_10', { autoEquip: true, paid: true, localTest: true, productId: 'local_premium_10' }); }],
      [uiText('local_free_legendary'), function () { grantSkinBox('legendary_1', { autoEquip: true, paid: true, localTest: true, productId: 'local_legendary' }); }],
      [uiText('local_reward_crate'), function () { queueRewardCrate('mission_reward', 1, uiText('toast_local_reward'), true); }],
      [uiText('local_share_friend'), function () { grantFriendShareReward({ localTest: true }); }],
      [uiText('local_ready_share'), function () {
        var st = readGachaState();
        var shareState = shareMissionState(st);
        if (shareState.firstBoxAt) {
          shareState.lastRewardAt = Date.now() - 60 * 60 * 1000 - 1000;
          writeGachaState(st);
          toast(uiText('toast_share_ready'), 1200);
          renderSkins();
        } else {
          toast(uiText('toast_share_first'), 1200);
        }
      }],
      [uiText('local_force_duplicate'), grantLocalDuplicate],
      [uiText('local_ready_ad'), readyAdCrate],
      [uiText('local_ad_reward'), function () { grantSkinBox('ad', { autoEquip: true, adRewarded: true, localTest: true }); }],
      [uiText('local_caps'), function () { addCapsToSaveAndGame(50000); toast(uiText('toast_caps_added', { caps: '50,000' }), 1200); renderSkins(); }],
      [uiText('local_rank', { rank: 1 }), function () { claimWeeklyReward(1); }],
      [uiText('local_rank', { rank: 2 }), function () { claimWeeklyReward(2); }],
      [uiText('local_rank', { rank: 3 }), function () { claimWeeklyReward(3); }],
      [uiText('local_rank', { rank: 10 }), function () { claimWeeklyReward(10); }],
      [uiText('local_rank', { rank: 20 }), function () { claimWeeklyReward(20); }],
      [uiText('local_rank', { rank: 100 }), function () { claimWeeklyReward(100); }]
    ].forEach(function (row) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = row[0];
      btn.addEventListener('click', row[1]);
      actions.appendChild(btn);
    });
    localTestPanel.appendChild(h);
    localTestPanel.appendChild(p);
    localTestPanel.appendChild(actions);
  }

  function setShopCloseGuide(on) {
    shopCloseGuidePending = !!on;
    if (closeSkinsBtn && (!shopCloseGuide || !shopCloseGuide.isConnected)) {
      shopCloseGuide = document.getElementById('shopCloseGuide');
      if (!shopCloseGuide) {
        shopCloseGuide = document.createElement('span');
        shopCloseGuide.className = 'shop-close-guide';
        shopCloseGuide.id = 'shopCloseGuide';
        shopCloseGuide.setAttribute('aria-hidden', 'true');
      }
      closeSkinsBtn.appendChild(shopCloseGuide);
    }
    if (shopCloseGuide) shopCloseGuide.hidden = !shopCloseGuidePending;
    if (closeSkinsBtn) closeSkinsBtn.classList.toggle('tutorial-target', shopCloseGuidePending);
  }

  function openShop(tab, opts) {
    localizeShell();
    gaDesign('shop:open:' + (tab || 'boxes'));
    skinsScreen.hidden = false;
    setSkinTab(tab || 'boxes');
    setShopCloseGuide(!!(opts && opts.tutorialClose));
    if (HAS_TG) {
      refreshTonCreditBalance(false);
    }
  }

  function openMissions() {
    localizeShell();
    gaDesign('missions:open');
    setSkinTab('missions');
    skinsScreen.hidden = false;
  }

  function closeShop() {
    setShopCloseGuide(false);
    skinsScreen.hidden = true;
  }

  function setSkinTab(tab) {
    localizeShell();
    skinTab = tab || 'boxes';
    document.querySelectorAll('[data-skin-tab]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-skin-tab') === skinTab);
    });
    if (skinTitle) skinTitle.textContent = uiText('panel_' + skinTab + '_title');
    if (skinLede) skinLede.textContent = uiText('panel_' + skinTab + '_lede');
    document.getElementById('skinBoxesView').hidden = skinTab !== 'boxes';
    document.getElementById('skinMissionsView').hidden = skinTab !== 'missions';
    document.getElementById('skinCollectionView').hidden = skinTab !== 'collection';
    document.getElementById('skinLeadersView').hidden = skinTab !== 'leaders';
    renderSkins();
  }

  function renderEquipped(st) {
    var skin = currentSkin(st);
    equippedArt.textContent = '';
    equippedArt.appendChild(skinArtNode(skin || SKINS[0]));
    if (skin) {
      equippedLabel.textContent = skin.name + '  ·  ' + boostLabel(skin.boost.kind) + ' +' + fmtPct(skin.boost.value);
    } else {
      equippedLabel.textContent = uiText('no_payload');
    }
  }

  function renderBoxes(st) {
    boxGrid.textContent = '';
    Object.keys(BOXES).forEach(function (id) {
      var box = BOXES[id];
      var pendingCount = box.reward ? pendingRewardBoxCount(st, id) : 0;
      if (PUBLIC_WEB_BUILD && (box.daily || box.ad || box.reward)) return;
      if (box.hidden && pendingCount <= 0) return;
      if (box.localOnly && !LOCAL_BUILD) return;
      var card = document.createElement('div');
      var disabled = box.daily && st.gachaStats.dailyLastDay === dayNum();
      var adWait = box.ad ? adCrateRemainingMs(st) : 0;
      if (adWait > 0) disabled = true;
      var capsPrice = box.caps ? capsCratePrice(st) : 0;
      card.className = 'box-card ' + id + (box.premium ? ' premium' : '');
      var art = document.createElement('div');
      var img = document.createElement('img');
      art.className = 'box-art';
      img.src = './game/assets/gacha/ui/boxes/' + (BOX_ART[id] || id) + '.png';
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.onload = function () { card.classList.add('has-art'); };
      img.onerror = function () { card.classList.remove('has-art'); art.remove(); };
      art.appendChild(img);
      var h = document.createElement('h3');
      h.textContent = boxTitle(id, box);
      var p = document.createElement('p');
      p.textContent = boxDesc(id, box) + (pendingCount > 0 ? ' ' + uiText('pending', { count: pendingCount }) : '');
      var meta = document.createElement('p');
      meta.className = 'box-meta';
      var odds = DROP_TABLES[box.dropTable || 'standard'] || DROP_TABLES.standard;
      meta.textContent = rollText(box.rolls)
        + (box.legendaryPlus ? ' · ' + uiText('legendary_plus_only') : box.paidProduct ? ' · ' + uiText('rare_plus_only') : box.caps ? ' · ' + uiText('opens_double_price') : '')
        + ' · ' + Math.round(Number(odds.mythic || 0) * 1000) / 10 + '% ' + uiText('mythic');
      card.appendChild(art);
      card.appendChild(h);
      card.appendChild(p);
      card.appendChild(meta);
      if (box.paidProduct) {
        var row = document.createElement('div');
        var starsBtn = document.createElement('button');
        var ton = tonPriceFor(box.paidProduct);
        row.className = 'box-buy-row';
        starsBtn.type = 'button';
        starsBtn.className = 'box-open stars';
        starsBtn.textContent = box.stars + ' ' + uiText('stars');
        starsBtn.addEventListener('click', function () {
          setBuyBusy(starsBtn, true);
          buyProduct(box.paidProduct, 'XTR').finally(function () { setBuyBusy(starsBtn, false); });
        });
        row.appendChild(starsBtn);
        if (ton) {
          if (HAS_TG) {
            var creditBtn = document.createElement('button');
            creditBtn.type = 'button';
            creditBtn.className = 'box-open credit';
            creditBtn.textContent = uiText('credit');
            creditBtn.disabled = !hasEnoughTonCredit(box.paidProduct);
            creditBtn.title = uiText('ton_credit_balance', { ton: tonFromNanotons(tonCreditNanotons) });
            creditBtn.addEventListener('click', function () {
              setBuyBusy(creditBtn, true);
              buyProduct(box.paidProduct, 'TON_CREDIT').finally(function () { setBuyBusy(creditBtn, false); });
            });
            row.appendChild(creditBtn);
          }
          var tonBtn = document.createElement('button');
          tonBtn.type = 'button';
          tonBtn.className = 'box-open ton';
          tonBtn.textContent = ton.ton + ' TON';
          tonBtn.addEventListener('click', function () {
            setBuyBusy(tonBtn, true);
            buyProduct(box.paidProduct, 'TON').finally(function () { setBuyBusy(tonBtn, false); });
          });
          row.appendChild(tonBtn);
        }
        card.appendChild(row);
      } else {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'box-open';
        btn.textContent = disabled ? (box.daily ? uiText('tomorrow') : box.ad ? uiText('ready_in', { time: formatCooldown(adWait) }) : uiText('locked')) : pendingCount > 0 ? (uiText('open') + (pendingCount > 1 ? ' x' + pendingCount : '')) : box.caps ? fmtCaps(capsPrice) + ' ' + uiText('caps') : uiFallback('box_' + id + '_button', box.ad ? uiText('watch_ad') : box.localOnly ? uiText('open_free') : uiText('open'));
        btn.disabled = disabled;
        btn.addEventListener('click', function () { openSkinBox(id); });
        card.appendChild(btn);
      }
      boxGrid.appendChild(card);
    });
  }

  function renderFilters() {
    var labels = ['all'].concat(SKIN_RARITIES);
    skinFilters.textContent = '';
    labels.forEach(function (id) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'filter-btn' + (skinFilter === id ? ' active' : '');
      btn.textContent = id === 'all' ? uiText('all') : rarityLabel(id);
      btn.addEventListener('click', function () { skinFilter = id; renderSkins(); });
      skinFilters.appendChild(btn);
    });
  }

  function renderCollection(st) {
    renderFilters();
    skinGrid.textContent = '';
    SKINS.slice().sort(function (a, b) {
      function rank(s) {
        if (st.equippedSkin === s.id) return 0;
        if (st.ownedSkins.indexOf(s.id) >= 0) return 1;
        return 2;
      }
      var ra = rank(a), rb = rank(b);
      if (ra !== rb) return ra - rb;
      return SKIN_RARITIES.indexOf(b.rarity) - SKIN_RARITIES.indexOf(a.rarity);
    }).forEach(function (skin) {
      if (skinFilter !== 'all' && skin.rarity !== skinFilter) return;
      skinGrid.appendChild(renderSkinCard(skin, st));
    });
  }

  function appendWeeklyClaimButton() {
    if (!HAS_TG) return;
    var row = document.createElement('div');
    var btn = document.createElement('button');
    row.className = 'leader-row';
      row.innerHTML = '<div class="leader-rank">R</div><div><strong></strong><span></span></div>';
      row.children[1].children[0].textContent = uiText('leader_previous_week');
      row.children[1].children[1].textContent = uiText('leader_previous_desc');
    btn.type = 'button';
    btn.className = 'box-open';
    btn.textContent = uiText('claim');
    btn.style.marginTop = '0';
    btn.addEventListener('click', function () {
      setBuyBusy(btn, true);
      apiPost('/api/tg-crate-leaders', {
        action: 'claim_weekly',
        game: GAME_ID,
        initData: tg.initData
      }).then(function (data) {
        var crates = Math.max(0, Math.floor(Number(data && data.rewardCrates || 0)));
        var tonNano = normalizeNanotons(data && data.rewardTonNanotons || 0);
        updateTonCreditFrom(data);
        if (!crates && Number(tonNano) <= 0) {
          toast(data && data.alreadyClaimed ? uiText('toast_weekly_already') : uiText('toast_weekly_none'), 1800);
          return;
        }
        for (var i = 0; i < crates; i += 1) {
          grantSkinBox('weekly_reward', {
            autoEquip: true,
            reward: true,
            countLeaderboard: false,
            productId: 'server_weekly_' + (data.week || 'previous')
          });
        }
        toast(uiText('toast_weekly_claimed', { reward: rewardSummary(crates, tonNano) }), 2200);
      }).catch(function () {
        toast(uiText('toast_weekly_failed'), 1600);
      }).finally(function () {
        setBuyBusy(btn, false);
      });
    });
    row.appendChild(btn);
    leaderList.appendChild(row);
  }

  function renderRemoteLeaders(data) {
    if (skinTab !== 'leaders' || !data || !Array.isArray(data.leaders)) return;
    leaderList.textContent = '';
    var leaders = data.leaders.slice(0, 100);
    if (!leaders.length) {
      var empty = document.createElement('div');
      empty.className = 'leader-row';
      empty.innerHTML = '<div class="leader-rank">#</div><div><strong></strong><span></span></div><strong></strong>';
      empty.children[1].children[0].textContent = uiText('leader_no_opens');
      empty.children[1].children[1].textContent = uiText('leader_no_opens_desc');
      empty.children[2].textContent = data.week || currentWeekId();
      leaderList.appendChild(empty);
    }
    leaders.forEach(function (row) {
      var el = document.createElement('div');
      el.className = 'leader-row';
      el.innerHTML = '<div class="leader-rank"></div><div><strong></strong><span></span></div><strong></strong>';
      el.children[0].textContent = '#' + row.rank;
      el.children[1].children[0].textContent = row.displayName || uiText('player', { rank: row.rank });
      var meta = el.children[1].children[1];
      meta.textContent = uiText('crates_opened', { count: row.cratesOpened });
      if (row.profileUrl) {
        var profile = document.createElement('a');
        profile.className = 'profile-link';
        profile.href = row.profileUrl;
        profile.target = '_blank';
        profile.rel = 'noopener';
        profile.textContent = uiText('profile');
        meta.appendChild(document.createTextNode(' · '));
        meta.appendChild(profile);
      }
      el.children[2].textContent = (row.rewardCrates || Number(row.rewardTonNanotons || 0) > 0)
        ? rewardSummary(row.rewardCrates, row.rewardTonNanotons)
        : '-';
      leaderList.appendChild(el);
    });
    appendWeeklyClaimButton();
  }

  function fetchRemoteLeaders() {
    if (!HAS_TG) return;
    var key = currentWeekId() + ':' + skinTab;
    if (leaderFetchKey === key) return;
    leaderFetchKey = key;
    apiPost('/api/tg-crate-leaders', {
      action: 'leaders',
      game: GAME_ID,
      initData: tg.initData,
      week: currentWeekId(),
      limit: 100
    }).then(renderRemoteLeaders).catch(function () {});
  }

  function renderLeaders(st) {
    ensureWeeklyStats(st);
    var opened = Number(st.gachaStats.boxesOpened || 0);
    var weeklyOpened = Number(st.gachaStats.weeklyCratesOpened || 0);
    var owned = st.ownedSkins.length;
    var legendary = st.ownedSkins.filter(function (id) { var s = SKINS_BY_ID[id]; return s && (s.rarity === 'legendary' || s.rarity === 'mythic'); }).length;
    var rows = [
      ['#?', uiText('this_week'), uiText('leaderboard_crates', { count: weeklyOpened, week: st.gachaStats.weeklyCrateWeek || currentWeekId() })],
      ['#1', uiText('weekly_payout'), rewardSummary(weeklyRewardForRank(1), weeklyTonNanotonsForRank(1))],
      ['#2', uiText('weekly_payout'), rewardSummary(weeklyRewardForRank(2), weeklyTonNanotonsForRank(2))],
      ['#3', uiText('weekly_payout'), rewardSummary(weeklyRewardForRank(3), weeklyTonNanotonsForRank(3))],
      ['#4-10', uiText('weekly_payout'), rewardSummary(weeklyRewardForRank(4), weeklyTonNanotonsForRank(4))],
      ['#11-20', uiText('weekly_payout'), rewardSummary(weeklyRewardForRank(11), weeklyTonNanotonsForRank(11))],
      ['#21-100', uiText('weekly_payout'), rewardSummary(weeklyRewardForRank(21), weeklyTonNanotonsForRank(21))],
      [uiText('all_time'), uiText('payload_count'), uiText('collected', { owned: owned, opened: opened })],
      [uiText('rare_plus'), uiText('rare_shelf'), uiText('legendary_owned', { count: legendary })]
    ];
    leaderList.textContent = '';
    rows.forEach(function (row) {
      var el = document.createElement('div');
      el.className = 'leader-row';
      el.innerHTML = '<div class="leader-rank"></div><div><strong></strong><span></span></div><strong></strong>';
      el.children[0].textContent = row[0];
      el.children[1].children[0].textContent = row[1];
      el.children[1].children[1].textContent = row[2];
      el.children[2].textContent = row[0] === '#?' ? uiText('you') : uiText('weekly');
      leaderList.appendChild(el);
    });
    appendWeeklyClaimButton();
    fetchRemoteLeaders();
  }

  function renderSkins() {
    var st = readGachaState();
    renderTonCreditBar();
    renderEquipped(st);
    renderBoxes(st);
    if (skinTab === 'boxes') {
      renderShop();
      renderLocalTestPanel(st);
    }
    if (skinTab === 'missions') renderMissions(st);
    if (skinTab === 'collection') renderCollection(st);
    if (skinTab === 'leaders') renderLeaders(st);
  }

  function openSkins() {
    openShop();
  }

  function closeSkins() {
    closeShop();
  }

  function equipSkin(id) {
    var st = readGachaState();
    if (st.ownedSkins.indexOf(id) < 0 || !SKINS_BY_ID[id]) return;
    var skin = SKINS_BY_ID[id];
    equipGrantedSkin(st, skin);
    writeGachaState(st);
    toast(uiText('toast_equipped', { name: skin.name }), 1600);
    renderSkins();
  }

  function sellDuplicateSkin(id) {
    var st = readGachaState();
    var skin = SKINS_BY_ID[id];
    var copies = skinCopyCount(st, id);
    if (!skin || sellableDuplicateCount(st, id) < 1) {
      toast(uiText('toast_no_duplicate'), 1400);
      return false;
    }
    var value = duplicateSellValue(skin);
    setSkinCopyCount(st, id, copies - 1);
    writeGachaState(st);
    addCapsToSaveAndGame(value);
    toast(uiText('toast_sold_copy', { name: skin.name, caps: fmtCaps(value) }), 1800);
    renderSkins();
    return true;
  }

  function equipGrantedSkin(st, skin) {
    if (!st || !skin || !skin.id) return;
    st.equippedSkin = skin.id;
    st.skinBoosts = {};
    st.skinBoosts[skin.boost.kind] = skin.boost.value;
  }

  function rarityScore(skin) {
    var index = SKIN_RARITIES.indexOf(skin && skin.rarity);
    return index < 0 ? -1 : index;
  }

  function bestPulledSkin(pulled) {
    var best = null;
    (pulled || []).forEach(function (skin) {
      if (!best || rarityScore(skin) >= rarityScore(best)) best = skin;
    });
    return best;
  }

  function grantSkin(skin, st, opts) {
    opts = opts || {};
    var owned = st.ownedSkins.indexOf(skin.id) >= 0;
    var prevCopies = skinCopyCount(st, skin.id);
    if (!owned) st.ownedSkins.push(skin.id);
    setSkinCopyCount(st, skin.id, prevCopies + 1);
    if (owned || prevCopies > 0) {
      st.gachaStats.duplicates += 1;
      st.gachaStats.shards += skin.rarity === 'common' ? 6 : skin.rarity === 'rare' ? 12 : skin.rarity === 'epic' ? 28 : skin.rarity === 'legendary' ? 70 : 160;
    }
    if (opts.autoEquip || !st.equippedSkin) equipGrantedSkin(st, skin);
    return owned;
  }

  function revealPulledSkins(pulled, st) {
    revealTray.textContent = '';
    pulled.forEach(function (skin, i) {
      setTimeout(function () {
        var card = renderSkinCard(skin, st, { reveal: true, forceName: true });
        revealTray.appendChild(card);
        if (i === pulled.length - 1 && card.scrollIntoView) card.scrollIntoView({ block: 'nearest' });
      }, i * 70);
    });
  }

  function grantSkinBox(id, opts) {
    opts = opts || {};
    var box = BOXES[id];
    if (!box) return null;
    gaDesign('gacha:open:' + id);
    if (PUBLIC_WEB_BUILD && (box.daily || box.ad || box.reward || box.localOnly)) {
      openTelegramGame('gamefactory');
      toast(uiText('toast_collect_tg'), 1800);
      return null;
    }
    if (box.localOnly && !LOCAL_BUILD) {
      toast(uiText('toast_local_only'));
      return null;
    }
    if (box.paidProduct && !opts.paid) {
      toast(uiText('toast_buy_stars_tg'));
      return null;
    }
    var st = readGachaState();
    var chargedSave = null;
    if (box.ad) {
      var wait = adCrateRemainingMs(st);
      if (wait > 0 && !opts.localTest) {
        toast(uiText('toast_ad_ready_in', { time: formatCooldown(wait) }), 1600);
        return null;
      }
      if (!opts.adRewarded && !opts.localTest) {
        toast(uiText('toast_watch_ad_first'), 1600);
        return null;
      }
      st.gachaStats.adCrateLastAt = Date.now();
      st.gachaStats.adCrateOpens = Number(st.gachaStats.adCrateOpens || 0) + 1;
    }
    if (box.daily) {
      if (st.gachaStats.dailyLastDay === dayNum()) { toast(uiText('toast_daily_done'), 1600); return null; }
      st.gachaStats.dailyLastDay = dayNum();
    }
    if (box.caps) {
      var save = readLocalState() || {};
      var money = Number(save.money || 0);
      var capsPrice = capsCratePrice(st);
      if (money < capsPrice) { toast(uiText('toast_need_caps', { caps: fmtCaps(capsPrice) }), 1600); return null; }
      var spentInGame = false;
      try {
        var cw = game.contentWindow;
        if (cw && typeof cw.__gfSpendCaps === 'function') spentInGame = !!cw.__gfSpendCaps(capsPrice);
      } catch (e) {}
      if (!spentInGame) {
        save.money = money - capsPrice;
        chargedSave = save;
      }
      st.gachaStats.capsCrateOpens = capsCrateOpenCount(st) + 1;
    }
    if (box.localOnly) st.gachaStats.localTestOpens = Number(st.gachaStats.localTestOpens || 0) + 1;
    var gotRare = false;
    var pulled = [];
    for (var i = 0; i < box.rolls; i += 1) {
      var skin = pickSkin(box, i, gotRare);
      if (skin.rarity !== 'common') gotRare = true;
      grantSkin(skin, st);
      pulled.push(skin);
    }
    var equipped = opts.autoEquip === false ? null : bestPulledSkin(pulled);
    if (equipped) equipGrantedSkin(st, equipped);
    recordCrateOpen(st, opts);
    if (opts.productId) st.gachaStats.lastPaidProduct = opts.productId;
    writeGachaState(st, chargedSave);
    revealPulledSkins(pulled, st);
    reportCrateOpenToServer(id, box, opts);
    queueSave(120);
    toast(uiText('toast_opened', { box: boxTitle(id, box), equipped: equipped ? uiText('toast_opened_equipped', { name: equipped.name }) : '' }), 2000);
    renderSkins();
    return {
      box: id,
      pulled: pulled.map(function (skin) { return skin.id; }),
      equipped: equipped ? equipped.id : st.equippedSkin
    };
  }

  function applyPaidGachaReceipt(productId, receipt, payload) {
    var verifiedRolls = validatePaidGachaReceipt(receipt, productId, SKINS_BY_ID);
    if (!verifiedRolls) return null;

    var st = readGachaState();
    var merged = mergePaidGachaReceipt(st, receipt, verifiedRolls);
    if (!merged) return null;
    var firstLocalApply = merged.firstLocalApply;
    var pulled = merged.pulled;

    var equipped = null;
    if (firstLocalApply) {
      equipped = bestPulledSkin(pulled);
      if (equipped) equipGrantedSkin(st, equipped);
      recordCrateOpen(st, { countLeaderboard: true });
      st.gachaStats.lastPaidProduct = productId;
    }
    writeGachaState(st);

    var product = PRODUCTS[productId] || {};
    var boxId = product.boxId || (productId === 'starter' ? 'premium_1' : '');
    if (firstLocalApply && payload && BOXES[boxId]) {
      reportCrateOpenToServer(boxId, BOXES[boxId], {
        paid: true,
        productId: productId,
        purchasePayload: payload
      });
    }
    if (firstLocalApply) {
      revealPulledSkins(pulled, st);
      queueSave(120);
      toast(uiText('toast_opened', {
        box: boxTitle(boxId, BOXES[boxId] || { title: productTitle(productId, product) }),
        equipped: equipped ? uiText('toast_opened_equipped', { name: equipped.name }) : ''
      }), 2000);
    }
    renderSkins();
    return 'gacha';
  }

  function applyPaidInventorySnapshot(snapshot) {
    var verifiedItems = validatePaidInventorySnapshot(snapshot, SKINS_BY_ID);
    if (!verifiedItems) return false;
    var st = readGachaState();
    var merged = mergePaidInventorySnapshot(st, verifiedItems);
    if (!merged) return false;
    if (merged.addedCopies > 0) {
      if (!st.equippedSkin) {
        var restored = bestPulledSkin(merged.restoredItems);
        if (restored) equipGrantedSkin(st, restored);
      }
      writeGachaState(st);
      queueSave(120);
      renderSkins();
    }
    return true;
  }

  function openSkinBox(id) {
    var box = BOXES[id];
    if (!box) return null;
    if (PUBLIC_WEB_BUILD && (box.daily || box.ad || box.reward || box.localOnly)) {
      openTelegramGame('gamefactory');
      toast(uiText('toast_collect_tg'), 1800);
      return null;
    }
    if (box.reward) {
      var st = readGachaState();
      if (!consumePendingRewardBox(st, id)) {
        toast(uiText('toast_no_reward_waiting'), 1400);
        return null;
      }
      writeGachaState(st);
      return grantSkinBox(id, { autoEquip: true, reward: true, pendingReward: true, countLeaderboard: false, productId: 'reward_' + id });
    }
    if (box.paidProduct) return buyProduct(box.paidProduct, 'XTR');
    if (box.ad) {
      var st = readGachaState();
      var wait = adCrateRemainingMs(st);
      if (wait > 0) {
        toast(uiText('toast_ad_ready_in', { time: formatCooldown(wait) }), 1600);
        return null;
      }
      return showAd('rewarded').then(function (result) {
        if (result && result.rewarded) return grantSkinBox(id, { autoEquip: true, adRewarded: true });
        toast(uiText('toast_watch_full_ad'), 1800);
        return null;
      });
    }
    return grantSkinBox(id, { autoEquip: true });
  }

  function resetSkinDemo() {
    var save = readLocalState() || {};
    delete save.ownedSkins;
    delete save.skinCopies;
    delete save.equippedSkin;
    delete save.skinBoosts;
    delete save.gachaStats;
    writeLocalState(save);
    revealTray.textContent = '';
    syncEquippedSkinToGame(baseGachaState());
    renderSkins();
    toast(uiText('toast_demo_reset'), 1400);
  }

  async function getTonConnectUI() {
    if (tonConnectUI) return tonConnectUI;
    if (!window.TON_CONNECT_UI || !window.TON_CONNECT_UI.TonConnectUI) {
      await loadExternalScript('tonconnect', window.MEGATON_TON_CONNECT_SDK_SRC);
    }
    for (var i = 0; i < 45; i += 1) {
      if (window.TON_CONNECT_UI && window.TON_CONNECT_UI.TonConnectUI) {
        break;
      }
      await sleep(100);
    }
    if (!window.TON_CONNECT_UI || !window.TON_CONNECT_UI.TonConnectUI) {
      throw new Error('tonconnect_unavailable');
    }
    tonConnectUI = new window.TON_CONNECT_UI.TonConnectUI({
      manifestUrl: window.MEGATON_TON_MANIFEST_URL || 'https://game-factory.tech/tg-megaton/tonconnect-manifest.json',
      buttonRootId: 'tonConnectButton',
      actionsConfiguration: {
        returnStrategy: 'back',
        twaReturnUrl: telegramGameUrl('gamefactory')
      },
      uiPreferences: {
        theme: window.TON_CONNECT_UI.THEME && window.TON_CONNECT_UI.THEME.DARK
      }
    });
    return tonConnectUI;
  }

  async function waitForTonWallet(ui) {
    if (ui.account) return ui.account;
    try { ui.openModal(); } catch (e) {}
    for (var i = 0; i < 180; i += 1) {
      if (ui.account) return ui.account;
      await sleep(500);
    }
    throw new Error('wallet_not_connected');
  }

  function applyAuthoritativePurchaseState(state, stateRev) {
    var adopted = adoptAuthoritativeState(state, stateRev);
    if (adopted) authoritativeStateGuardUntil = Date.now() + 2500;
    return adopted;
  }

  var payments = createPayments({
    gameId: GAME_ID,
    hasTelegram: HAS_TG,
    telegram: tg,
    analytics: gaDesign,
    products: PRODUCTS,
    pendingTonKey: 'megaton_ton_pending',
    pendingTonCreditKey: 'megaton_ton_credit_pending',
    pendingPaidGachaKey: 'megaton_paid_gacha_pending',
    apiPost: apiPost,
    sleep: sleep,
    toast: toast,
    uiText: uiText,
    productTitle: productTitle,
    openTelegramGame: openTelegramGame,
    tonPriceFor: tonPriceFor,
    getTonConnectUI: getTonConnectUI,
    waitForTonWallet: waitForTonWallet,
    applyProduct: applyProduct,
    saveRemoteState: saveRemoteState,
    updateTonCreditFrom: updateTonCreditFrom,
    tonFromNanotons: tonFromNanotons,
    getTonCreditNanotons: function () { return tonCreditNanotons; },
    closeShop: closeShop,
    requiresPaidGacha: function (id) {
      return id === 'starter' || Boolean(PRODUCTS[id] && PRODUCTS[id].boxId);
    },
    requiresServerGrant: function (id) {
      return ['starter', 'caps_pack', 'warhead_tuning', 'mirv_kit', 'god_power'].indexOf(id) >= 0;
    },
    applyAuthoritativeState: applyAuthoritativePurchaseState,
    applyPaidInventorySnapshot: applyPaidInventorySnapshot,
    onAuthoritativeStateApplied: reloadGameFromSavedState
  });
  var buyProduct = payments.buyProduct;
  var resumePendingTonPurchase = payments.resumePendingTonPurchase;
  var resumePendingTonCreditPurchase = payments.resumePendingTonCreditPurchase;
  var resumePendingPaidGacha = payments.resumePendingPaidGacha;
  var reconcilePaidGacha = payments.reconcilePaidGacha;
  var syncPaidInventory = payments.syncPaidInventory;

  function localUpgradeLevel(save, id) {
    return Number(save[id === 'yield' ? 'powerLvl' : id === 'flares' ? 'flareLvl' : id === 'pen' ? 'penLvl' : id === 'mirv' ? 'mirvLvl' : id === 'shock' ? 'shockLvl' : id === 'emp' ? 'empLvl' : id === 'orbital' ? 'orbitalLvl' : id === 'cluster' ? 'clusterLvl' : id === 'firestorm' ? 'firestormLvl' : id === 'chain' ? 'chainLvl' : id === 'glass' ? 'glassLvl' : id === 'seismic' ? 'seismicLvl' : id === 'inferno' ? 'infernoLvl' : id === 'topple' ? 'toppleLvl' : id === 'meltdown' ? 'meltdownLvl' : id === 'tidal' ? 'tidalLvl' : id === 'fireworks' ? 'fireworksLvl' : id === 'eye' ? 'eyeLvl' : 'luckLvl'] || 0);
  }

  function localUpgradeCost(save, id) {
    var base = id === 'yield' ? 55 : id === 'flares' ? 70 : id === 'pen' ? 90 : id === 'mirv' ? 210 : id === 'shock' ? 150 : id === 'emp' ? 120 : id === 'orbital' ? 190 : id === 'cluster' ? 140 : id === 'firestorm' ? 130 : id === 'chain' ? 160 : id === 'glass' ? 130 : id === 'seismic' ? 180 : id === 'inferno' ? 170 : id === 'topple' ? 200 : id === 'meltdown' ? 190 : id === 'tidal' ? 160 : id === 'fireworks' ? 150 : id === 'eye' ? 250 : 100;
    return Math.max(1, Math.round(base * Math.pow(id === 'mirv' || id === 'orbital' ? 2.25 : 1.33, localUpgradeLevel(save, id))));
  }

  function localMaxUpgradeCost(save) {
    var ids = ['yield'];
    if (Number(save.cityTier || 0) >= 1) ids.push('luck');
    ['flares', 'pen', 'mirv', 'shock', 'emp', 'orbital', 'cluster', 'firestorm', 'chain', 'glass', 'seismic', 'inferno', 'topple', 'meltdown', 'tidal', 'fireworks', 'eye'].forEach(function (id) {
      if (localUpgradeLevel(save, id) > 0) ids.push(id);
    });
    var mx = 0;
    ids.forEach(function (id) { mx = Math.max(mx, localUpgradeCost(save, id)); });
    return Math.max(40, mx);
  }

  function addLocalCaps(save, amount) {
    var caps = Math.ceil(amount);
    save.money = Number(save.money || 0) + caps;
    save.totalEarned = Number(save.totalEarned || 0) + caps;
    save.best = Math.max(Number(save.best || 0), Number(save.totalEarned || 0));
  }

  function reloadGameFromSavedState() {
    setTimeout(function () {
      try { game.contentWindow.location.reload(); } catch (e) {}
    }, 160);
  }

  function guardAndReloadAuthoritativeState() {
    // The running iframe still holds the stale snapshot that just conflicted.
    // Reject all of its writes until its load event confirms a fresh instance.
    authoritativeStateGuardUntil = Number.POSITIVE_INFINITY;
    reloadGameFromSavedState();
  }

  function applyProduct(id, receipt) {
    receipt = receipt || {};
    var product = PRODUCTS[id];
    if (receipt.paidGachaReceipt) {
      var paidGacha = applyPaidGachaReceipt(id, receipt.paidGachaReceipt, receipt.payload || '');
      if (!paidGacha) return null;
      if (receipt.serverGrantApplied || (product && product.boxId)) {
        if (receipt.serverGrantApplied && receipt.source !== 'RECONCILE') reloadGameFromSavedState();
        return paidGacha;
      }
    }
    if (receipt.serverGrantApplied) {
      if (receipt.source !== 'RECONCILE') reloadGameFromSavedState();
      return 'server';
    }
    // Paid products fail closed. The wrapper can mirror an immutable server
    // roll receipt or reload a server-granted state; it never creates a paid
    // collectible, upgrade, or currency delta from browser-only data.
    return null;
  }

	  function waitForAdSdk(predicate, ms) {
	    var started = Date.now();
	    return new Promise(function (resolve) {
	      (function tick() {
	        var value = null;
	        try { value = predicate(); } catch (e) { value = null; }
	        if (value) { resolve(value); return; }
	        if (Date.now() - started >= ms) { resolve(null); return; }
	        setTimeout(tick, 120);
	      })();
	    });
	  }

	  function monetagShowFn() {
	    var zone = window.MEGATON_MONETAG_ZONE_ID;
	    var fn = zone && window['show_' + zone];
	    return typeof fn === 'function' ? fn : null;
	  }

	  function showMonetagAd(type) {
	    var fn = monetagShowFn();
	    if (!fn) return null;
	    if (type === 'rewarded') return fn();
	    return fn({
	      type: 'inApp',
	      requestVar: 'megaton_midgame',
	      inAppSettings: window.MEGATON_MONETAG_INAPP_SETTINGS || {
	        frequency: 1,
	        capping: 0.0834,
	        interval: 300,
	        timeout: 5,
	        everyPage: false
	      }
	    });
	  }

	  function showAd(type, cb) {
	    type = type === 'rewarded' ? 'rewarded' : 'interstitial';
	    if (adBusy) {
	      var busy = { shown: false, rewarded: false, reason: 'busy' };
	      if (cb) cb(false, busy);
	      return Promise.resolve(busy);
	    }
	    adBusy = true;
	    var settled = false;
	    var done = function (result) {
	      if (settled) return result || { shown: false, rewarded: false };
	      settled = true;
	      adBusy = false;
	      result = result || { shown: false, rewarded: false };
	      var ok = Boolean(result.rewarded || result.shown);
	      gaDesign('ad:' + type + ':' + (result.network || 'none') + ':' + (result.rewarded ? 'rewarded' : result.shown ? 'shown' : (result.reason || 'fail')));
	      if (!ok) toast(uiText('toast_ad_not_ready'), 1600);
	      if (cb) cb(ok, result);
	      return result;
	    };
	    var fallbackToMonetag = function () {
	      var zone = window.MEGATON_MONETAG_ZONE_ID;
	      return loadExternalScript('monetag', window.MEGATON_MONETAG_SDK_SRC, function (tag) {
	        tag.dataset.zone = zone;
	        tag.dataset.sdk = 'show_' + zone;
	      }).then(function () { return waitForAdSdk(monetagShowFn, 3500); }).then(function (fn) {
	        if (!fn) return done({ shown: false, rewarded: false, reason: 'sdk_missing' });
	        var res;
	        try { res = showMonetagAd(type); } catch (e) { return done({ shown: false, rewarded: false, reason: 'monetag_throw' }); }
	        return Promise.resolve(res)
	          .then(function () { return done({ shown: true, rewarded: type === 'rewarded', network: 'monetag' }); })
	          .catch(function () { return done({ shown: false, rewarded: false, network: 'monetag', reason: 'closed_or_no_fill' }); });
	      });
	    };
	    var promise;
	    if (type === 'rewarded') {
	      promise = loadExternalScript('adsgram', window.MEGATON_ADSGRAM_SDK_SRC).then(function () {
	        return waitForAdSdk(function () {
	          return window.MEGATON_ADSGRAM_BLOCK_ID && window.Adsgram && typeof window.Adsgram.init === 'function' ? window.Adsgram : null;
	        }, 3500);
	      }).then(function (adsgramApi) {
	        if (!adsgramApi) return fallbackToMonetag();
	        try {
	          var adsgram = window.__megatonAdsgram || (window.__megatonAdsgram = adsgramApi.init({ blockId: window.MEGATON_ADSGRAM_BLOCK_ID }));
	          return Promise.resolve(adsgram.show())
	            .then(function () { return done({ shown: true, rewarded: true, network: 'adsgram' }); })
	            .catch(fallbackToMonetag);
	        } catch (e) {
	          return fallbackToMonetag();
	        }
	      });
	    } else {
	      promise = fallbackToMonetag();
	    }
	    setTimeout(function () { done({ shown: false, rewarded: false, reason: 'timeout' }); }, 32000);
	    return promise.then(done).catch(function () { return done({ shown: false, rewarded: false, reason: 'error' }); });
	  }

  var platform = installTelegramAdapter({
    game: game,
    buyProduct: buyProduct,
    showAd: showAd,
    writeLocalState: writeLocalState,
    readLocalState: readLocalState,
    queueSave: queueSave,
    loadRemoteState: loadRemoteState,
    openSupport: openSupportFeedback,
    products: PRODUCTS,
    syncEquippedSkin: syncEquippedSkinToGame,
    readGachaState: readGachaState,
    canAcceptGameState: function () { return Date.now() >= authoritativeStateGuardUntil; }
  });
  var attachGameAdapter = platform.attachGameAdapter;

  if (LOCAL_BUILD) {
    window.__megatonLocalTest = {
      state: readGachaState,
      openBox: function (id) {
        var box = BOXES[id];
        return grantSkinBox(id, {
          autoEquip: true,
          paid: Boolean(box && box.paidProduct),
          adRewarded: Boolean(box && box.ad),
          localTest: true,
          productId: 'local_' + id
        });
      },
      forceDuplicate: grantLocalDuplicate,
      readyAd: readyAdCrate,
      claimWeeklyRank: claimWeeklyReward,
      addCaps: function (n) { return addCapsToSaveAndGame(n || 50000); },
      shareFriend: function () { return grantFriendShareReward({ localTest: true }); },
      readyFriendShare: function () {
        var st = readGachaState();
        var rec = shareMissionState(st);
        if (rec.firstBoxAt) rec.lastRewardAt = Date.now() - 60 * 60 * 1000 - 1000;
        writeGachaState(st);
        renderSkins();
        return rec;
      },
      queueRewardBox: function (id, count) {
        return queueRewardCrate(id || 'mission_reward', count || 1, 'Local reward crate added to Shop.', true);
      },
      sellDuplicate: sellDuplicateSkin,
      claimMission: function (id) {
        var mission = MISSION_CONFIG.filter(function (m) { return m.id === id; })[0];
        if (mission) {
          markMissionProgress(id, { localTest: true });
          claimMission(mission);
        }
      },
      dropTables: JSON.parse(JSON.stringify(DROP_TABLES)),
      missions: JSON.parse(JSON.stringify(MISSION_CONFIG))
    };
  }

  function startGame() {
    if (gameStarted) return;
    gameStarted = true;
    applyTelegramLanguageDefault();
    localizeShell();
    var gameSrc = game.getAttribute('data-src') || './game/index.html?tg=1';
    try {
      var lang = currentLanguage();
      if (lang) gameSrc += (gameSrc.indexOf('?') >= 0 ? '&' : '?') + 'lang=' + encodeURIComponent(lang);
    } catch (e) {}
    game.src = gameSrc;
  }

  async function boot() {
    await loadRemoteState();
    startGame();
    reconcilePaidGacha().then(syncPaidInventory, syncPaidInventory);
    resumePendingTonPurchase();
    resumePendingTonCreditPurchase();
    resumePendingPaidGacha();
    if (HAS_TG) {
      setInterval(function () { saveRemoteState('interval'); }, 15000);
      setInterval(resumePendingTonPurchase, 30000);
      setInterval(resumePendingTonCreditPurchase, 30000);
      setInterval(resumePendingPaidGacha, 30000);
    }
  }

  document.getElementById('shopBtn').addEventListener('click', function () { openShop('boxes'); });
  document.getElementById('missionsBtn').addEventListener('click', openMissions);
  document.getElementById('closeSkinsBtn').addEventListener('click', closeSkins);
  var resetBtn = document.getElementById('demoResetSkinsBtn');
  if (resetBtn && LOCAL_BUILD) resetBtn.addEventListener('click', resetSkinDemo);
  else if (resetBtn) resetBtn.remove();
  document.querySelectorAll('[data-skin-tab]').forEach(function (btn) {
    btn.addEventListener('click', function () { setSkinTab(btn.getAttribute('data-skin-tab')); });
  });
	  window.addEventListener('message', function (event) {
	    var data = event && event.data || {};
	    if (data.type === 'megaton_language') {
	      localizeShell();
	      if (!skinsScreen.hidden) renderSkins();
	    }
	    if (data.type === 'megaton_open_shop') {
	      openShop(data.tab || 'boxes', { tutorialClose: !!data.tutorialClose });
	    }
	    if (data.type === 'megaton_support') {
	      openSupportFeedback();
	    }
	  });
  window.addEventListener('storage', function (event) {
    if (event && event.key === 'megaton_lang') {
      localizeShell();
      if (!skinsScreen.hidden) renderSkins();
    }
  });
  game.addEventListener('load', function () {
    attachGameAdapter();
    authoritativeStateGuardUntil = 0;
  });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') saveRemoteState('hidden', true);
  });
  window.addEventListener('pagehide', function () { saveRemoteState('pagehide', true); });

  window.render_game_to_text = function () {
    try {
      var cw = game.contentWindow;
      if (cw && typeof cw.render_game_to_text === 'function') return cw.render_game_to_text();
    } catch (e) {}
    return JSON.stringify({ game: 'Megaton', screen: skinsScreen.hidden ? 'game' : 'shop', telegram: HAS_TG });
  };

	  window.__megatonOpenMissions = openMissions;
	  window.__megatonOpenShop = function (tab, opts) { openShop(tab || 'boxes', opts || null); };
	  window.__megatonSkinById = function (id) { return cloneSkinCatalogEntry(SKINS_BY_ID[String(id || '')]); };

  window.advanceTime = function (ms) {
    try {
      var cw = game.contentWindow;
      if (cw && typeof cw.advanceTime === 'function') return cw.advanceTime(ms);
    } catch (e) {}
    return window.render_game_to_text();
  };

  localizeShell();
  boot();
})();
