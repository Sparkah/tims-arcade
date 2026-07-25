// Caravan Thief i18n. EN + RU both required (Yandex 8.2.3). Language resolves
// from ?lang= (test hook) -> Yandex SDK i18n -> navigator.language -> en.

type Lang = 'en' | 'ru';
type Dict = Record<string, string>;

const EN: Dict = {
  title: 'Caravan Thief',
  tagline: 'Slip between the dunes. Rob the moving caravan. Vanish with the gold.',
  play: 'Rob the Caravan',
  bazaar: 'Bazaar',
  back_heist: 'Back to the heist',
  again: 'Again',
  close: 'Close',
  mute: 'Mute',
  unmute: 'Unmute',
  // HUD
  hud_alert: 'Alertness',
  hud_bag: 'Bag',
  hud_exfil: 'Exfil',
  hud_smoke: 'Smoke',
  hud_score: 'Loot',
  hud_wallet: 'Coins',
  hud_best: 'Best',
  hud_spotted: 'SPOTTED!',
  hud_caught: 'Caught!',
  hud_locked: 'Locked - needs lockpicks',
  hud_bagfull: 'Bag full - Exfil to bank',
  // caravan tiers
  tier_spice: 'Spice Caravan',
  tier_silk: 'Silk Caravan',
  tier_gold: 'Gold Caravan',
  tier_royal: 'Royal Treasury',
  tier_label: 'Tier',
  // gameover
  go_title: 'Caught in the torchlight!',
  go_banked: 'Banked this run',
  go_added: 'added to your coin purse',
  go_relic: 'You lifted a relic!',
  // bazaar / upgrades
  bz_title: 'Desert Bazaar',
  bz_wallet: 'Coins',
  bz_museum: 'Relic Museum',
  bz_relics: 'Relics found',
  bz_buy: 'Buy',
  bz_max: 'Max',
  bz_owned: 'Owned',
  bz_cant: 'Not enough coins',
  up_boots: 'Soft Boots',
  up_boots_d: 'Guards notice you more slowly.',
  up_bag: 'Bigger Bag',
  up_bag_d: 'Carry more loot before you must exfil.',
  up_smoke: 'Smoke Pouch',
  up_smoke_d: 'Start each heist with a one-tap smoke escape.',
  up_lockpick: 'Lockpicks',
  up_lockpick_d: 'Crack armored strongbox wagons for big loot.',
  up_camel: 'Swift Camel',
  up_camel_d: 'Dash faster between cover.',
  lvl: 'Lv',
  // tutorial (?)
  tut_goal: 'Goal: rob the moving caravan wagon by wagon and bank as much loot as you can.',
  tut_controls: 'Controls: tap a dune to slip into cover. Hold a wagon beside you to loot it.',
  tut_win: 'Endless: push for a high score - each caravan tier is richer than the last.',
  tut_lose: 'Lose: a guard catches you while spotted. Stay out of the sweeping torchlight.',
  tut_tip: 'Tip: every wagon you loot raises alertness. Tap EXFIL to bank your bag before it gets too hot.',
  // live coach (action-gated)
  coach_loot: 'Hold the glowing wagon to loot it',
  coach_dash: 'Tap a dune to slip into cover',
  coach_cone: 'Dodge the sweeping torchlight - it spots you',
  coach_exfil: 'Tap EXFIL any time to bank your loot',
  coach_done: "You're a thief now. Push your luck!",
};

const RU: Dict = {
  title: 'Вор Караванов',
  tagline: 'Крадитесь меж барханов. Обчистите караван на ходу. Исчезните с золотом.',
  play: 'Ограбить караван',
  bazaar: 'Базар',
  back_heist: 'Назад к делу',
  again: 'Ещё раз',
  close: 'Закрыть',
  mute: 'Звук выкл',
  unmute: 'Звук вкл',
  hud_alert: 'Тревога',
  hud_bag: 'Сумка',
  hud_exfil: 'Уход',
  hud_smoke: 'Дым',
  hud_score: 'Добыча',
  hud_wallet: 'Монеты',
  hud_best: 'Рекорд',
  hud_spotted: 'ЗАМЕЧЕН!',
  hud_caught: 'Пойман!',
  hud_locked: 'Заперто - нужна отмычка',
  hud_bagfull: 'Сумка полна - уходите',
  tier_spice: 'Караван специй',
  tier_silk: 'Караван шёлка',
  tier_gold: 'Золотой караван',
  tier_royal: 'Царская казна',
  tier_label: 'Ступень',
  go_title: 'Пойман в свете факелов!',
  go_banked: 'В банке за заход',
  go_added: 'добавлено в кошель',
  go_relic: 'Вы добыли реликвию!',
  bz_title: 'Пустынный базар',
  bz_wallet: 'Монеты',
  bz_museum: 'Музей реликвий',
  bz_relics: 'Реликвий найдено',
  bz_buy: 'Купить',
  bz_max: 'Макс',
  bz_owned: 'Есть',
  bz_cant: 'Мало монет',
  up_boots: 'Мягкие сапоги',
  up_boots_d: 'Стража замечает вас медленнее.',
  up_bag: 'Большая сумка',
  up_bag_d: 'Несите больше добычи до ухода.',
  up_smoke: 'Дымовой мешок',
  up_smoke_d: 'Начинайте заход с дымовым уходом в одно касание.',
  up_lockpick: 'Отмычки',
  up_lockpick_d: 'Вскрывайте бронированные сундуки ради крупной добычи.',
  up_camel: 'Быстрый верблюд',
  up_camel_d: 'Быстрее перебегайте меж укрытий.',
  lvl: 'Ур',
  tut_goal: 'Цель: обчищайте караван на ходу, вагон за вагоном, и складывайте как можно больше добычи.',
  tut_controls: 'Управление: нажмите бархан, чтобы укрыться. Держите вагон рядом, чтобы обчистить его.',
  tut_win: 'Бесконечно: бейте рекорд - каждая ступень каравана богаче прежней.',
  tut_lose: 'Поражение: стражник ловит вас, когда вы замечены. Держитесь вне света факелов.',
  tut_tip: 'Совет: каждый вагон повышает тревогу. Жмите УХОД, чтобы спрятать добычу, пока не стало горячо.',
  coach_loot: 'Держите светящийся вагон, чтобы обчистить его',
  coach_dash: 'Нажмите бархан, чтобы укрыться',
  coach_cone: 'Уклоняйтесь от света факелов - он вас выдаёт',
  coach_exfil: 'Жмите УХОД в любой миг, чтобы спрятать добычу',
  coach_done: 'Теперь вы вор. Испытайте удачу!',
};

let current: Lang = 'en';

function resolveLang(): Lang {
  try {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('lang');
    if (q && q.toLowerCase().startsWith('ru')) return 'ru';
    if (q && q.toLowerCase().startsWith('en')) return 'en';
    const ysdkLang = window.ysdk?.environment?.i18n?.lang;
    if (typeof ysdkLang === 'string' && ysdkLang.toLowerCase().startsWith('ru')) return 'ru';
    const nav = (navigator.language || '').toLowerCase();
    if (nav.startsWith('ru')) return 'ru';
  } catch {
    // default en
  }
  return 'en';
}

current = resolveLang();

export function setLang(lang: Lang): void {
  current = lang === 'ru' ? 'ru' : 'en';
}

export function getLang(): Lang {
  return current;
}

export function t(key: string): string {
  const dict = current === 'ru' ? RU : EN;
  return dict[key] ?? EN[key] ?? key;
}

declare global {
  interface Window {
    _setLang?: (lang: string) => void;
    _getI18N?: () => Record<string, string>;
  }
}
window._setLang = (lang: string) => setLang(lang === 'ru' ? 'ru' : 'en');
window._getI18N = () => (current === 'ru' ? RU : EN);
