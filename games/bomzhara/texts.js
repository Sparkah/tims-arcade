// All player-facing copy lives here. English is the default; Russian is an
// explicit player choice stored locally on this device.

var LANGUAGE_STORE = 'bomzhara:language';

export var TEXTS = {
  en: {
    pageTitle: 'Bullet Hell Bomzhara',
    fallbackWebGL: 'WebGL2 required.',

    // main menu
    menuTitleTop: 'BULLET HELL',
    menuTitle: 'BOMZHARA',
    menuCopy: 'your blood is half vodka. survive until the ambulance. save one swig, or the squirrel takes you.',
    menuPlay: 'POUR IT',
    diffEasy: 'EASY',
    diffMedium: 'NORMAL',
    diffHard: 'HARD',
    menuBestPrefix: 'body count record: ',

    // meters and HUD
    barVodka: 'VODKA',
    barBlood: 'BLOOD',
    barBelochka: 'SQUIRREL',
    hudLevelPrefix: 'LV.',
    hudKillsPrefix: 'BODIES: ',
    hudAmbulancePrefix: 'AMBULANCE: ',
    hudAmbulanceSuffix: 's',

    // upgrade screen
    upgradeLevelPrefix: 'LEVEL ',
    upgradeTitle: 'HAIR OF THE DOG',

    // endings
    endWinSaneTitle: 'MADE IT TO THE AMBULANCE',
    endWinSaneSub: 'lights at the window. you saved yourself a swig, and they can still put you back together.',
    endWinWreckTitle: 'AMBULANCE ARRIVED',
    endWinWreckSub: 'the filth is dead, and so is the bottle. the paramedic stares in silence.',
    endMadnessTitle: 'THE SQUIRREL WON',
    endMadnessSub: 'you drank your sanity dry. now you are one.',
    endWindowTitle: 'FELL INTO THE BASEMENT',
    endWindowSub: 'the wind sounded like a voice. the ambulance came too late.',
    endBledTitle: 'DID NOT MAKE IT',
    endBledSub: 'the blood ran out before the vodka. it happens.',
    endStatsKillsPrefix: 'BODIES: ',
    endStatsPhantomsPrefix: 'GHOSTS: ',
    endRetry: 'ONE MORE',
    btnMenu: 'MENU',

    // booby-trapped slipper
    tapokHintTitle: 'BOOBY-TRAPPED SLIPPER',
    tapokHintSub: 'stand on it: 10s invulnerable, then it blows',
    bannerTapokSpawn: 'a booby-trapped slipper.',
    bannerTapokArmed: 'stay on the slipper. ten seconds.',
    bannerTapokBoom: 'the slipper went BOOM.',

    // event banners
    bannerAmbulanceHears: 'the ambulance heard you. so did they.',
    bannerSiren: 'the siren is close. real enemies glow.',
    bannerBlackout: 'the darkness crawls into your eyes.',
    bannerPossessedPrefix: 'your finger is holding ',
    bannerWindow: 'the basement stairs are calling. stay inside.',
    bannerSquirrel: 'the squirrel is here.',
    bannerFloorDrinks: 'the bottle broke. the floor drinks too.',
    bannerShieldBroke: 'shield broken',

    // first-run tutorial
    tutorMove: 'WASD / ARROWS - MOVE',
    tutorStop: 'STOP MOVING TO THROW BOTTLES',
    tutorDodge: 'NOW DODGE YOUR OWN BOUNCING BOTTLES',
    tutorContinue: 'PRESS TO CONTINUE',

    // teaching moments
    teachBlood: 'the vodka is gone. there is still some in your blood.',
    teachBounce: 'ricochet',

    // pickups
    toastZakuska: '+SNACK',
    toastVodka: '+VODKA',

    // squirrel taunts
    squirrelLines: [
      'do not give me the last drop...',
      'you and I are one, brother.',
      'one more?',
      'I am here forever.',
    ],

    // survived horrors
    horrorsTitle: 'HORRORS SURVIVED',
    horrorBlackoutName: 'DARKNESS',
    horrorBlackoutDesc: 'the room edges crawl inward',
    horrorPossessedName: 'POSSESSED KEY',
    horrorPossessedDesc: 'one direction holds itself',
    horrorWindowName: 'BASEMENT STAIRS',
    horrorWindowDesc: 'the snow calls you down',

    // wind at the open stairs
    windHowl: 'come down, brother',

    // pause/settings
    pauseTitle: 'PAUSED',
    pauseResume: 'CONTINUE',
    pauseSoundOn: 'SOUND: ON',
    pauseSoundOff: 'SOUND: OFF',
    pauseUpgradesTitle: 'TAKEN THIS RUN',
    pauseNoUpgrades: 'nothing yet',

    // help
    helpTitle: 'HOW THIS WORKS',
    helpBack: 'BACK',
    helpHowTo: [
      'survive until the ambulance - timer at the top right.',
      'vodka = ammo and sanity. bomzhara throws bottles automatically.',
      'blood = life. monsters and your own ricochets drain it.',
      'below half vodka, the squirrel grows stronger. a full meter means madness.',
      'the basement opens at 30 seconds. the slipper drops at 60.',
    ],
    helpMonstersTitle: 'FILTH',
    helpHpPrefix: 'hp ',
    helpMonsterBeer: 'beer - common rabble that comes in crowds',
    helpMonsterWine: 'wine - fat and hard to kill',
    helpMonsterChamp: 'champagne - fast, bursts into smaller fiends',
    helpMonsterCognac: 'cognac - a tank that hits hardest',
    helpItemsTitle: 'ITEMS AND EVENTS',
    helpItemVodka: { name: 'VODKA', desc: '+36 vodka. keep the bottle above half.' },
    helpItemZakuska: { name: 'SNACK', desc: '+2 blood and a little more sober.' },
    helpItemTapok: { name: 'SLIPPER (60s)', desc: 'stand on it: 10s invulnerable, then a blast hits everything nearby.' },
    helpItemWindow: { name: 'STAIRS (30s)', desc: 'the basement calls. step outside and it is over.' },
    helpItemMattress: { name: 'MATTRESS', desc: 'upgrade shield: silently absorbs one hit.' },
    helpItemBelochka: { name: 'SQUIRREL', desc: 'immortal. comes when vodka is low, leaves when it returns.' },
    helpUpgradesTitle: 'UPGRADES',

    booze: {
      beer: 'beer',
      wine: 'wine',
      champ: 'champagne',
      cognac: 'cognac',
    },

    upgrades: {
      shots: { name: 'DOUBLE POUR', desc: '+1 bottle stream' },
      fireRate: { name: 'NEVER SOBER', desc: 'throw faster' },
      ricochet: { name: 'RICOCHET', desc: '+20% damage after a wall' },
      damage: { name: 'STRONGER STUFF', desc: '+30% damage' },
      vodkaMax: { name: 'FOR THE ROAD', desc: '+40 max vodka' },
      lifesteal: { name: 'HAIR OF THE DOG', desc: '+blood for every kill' },
      speed: { name: 'SOBER STEP', desc: '+18% movement speed' },
      pierce: { name: 'PENETRATION', desc: 'bottles punch through enemies' },
      crossed: { name: 'CROSS YOURSELF', desc: 'gain +5 current and max blood' },
      steady: { name: 'CLEAR EYES', desc: 'less hand shake' },
      molotov: { name: 'BOTTLE WITH A WICK', desc: 'every Nth shot burns everyone' },
      seek: { name: 'DRUNK RICOCHET', desc: 'after a wall, the bottle seeks a target' },
      shield: { name: 'HANGOVER SHIELD', desc: 'vodka charges the piss-soaked mattress shield' },
      ambulance: { name: 'AMBULANCE HEARS YOU', desc: '-6s, but the noise calls an enemy wave' },
      wisdom: { name: 'BEARD OF WISDOM', desc: '+1 choice at future level-ups' },
    },
  },

  ru: {
    pageTitle: 'Булетхел Бомжара',
    fallbackWebGL: 'Требуется WebGL2.',

    menuTitleTop: 'БУЛЕТХЕЛ',
    menuTitle: 'БОМЖАРА',
    menuCopy: 'твоя кровь - наполовину водка. продержись до скорой, но оставь глоток себе. Иначе белочка не пощадит.',
    menuPlay: 'НАЛИВАЙ',
    diffEasy: 'ЛЕГКО',
    diffMedium: 'СРЕДНЕ',
    diffHard: 'ЖЁСТКО',
    menuBestPrefix: 'рекорд трупов: ',

    barVodka: 'ВОДКА',
    barBlood: 'КРОВЬ',
    barBelochka: 'БЕЛОЧКА',
    hudLevelPrefix: 'УР.',
    hudKillsPrefix: 'ТРУПОВ: ',
    hudAmbulancePrefix: 'ДО СКОРОЙ: ',
    hudAmbulanceSuffix: 'с',

    upgradeLevelPrefix: 'УРОВЕНЬ ',
    upgradeTitle: 'ОПОХМЕЛИСЬ',

    endWinSaneTitle: 'ДОЖИЛ ДО СКОРОЙ',
    endWinSaneSub: 'мигалки в окне. ты оставил себе глоток, и тебя ещё можно собрать.',
    endWinWreckTitle: 'СКОРАЯ ПРИЕХАЛА',
    endWinWreckSub: 'нечисть мертва, бутылка тоже. фельдшер смотрит молча.',
    endMadnessTitle: 'БЕЛОЧКА ПОБЕДИЛА',
    endMadnessSub: 'ты выпил рассудок до дна. теперь вы с ней - одно.',
    endWindowTitle: 'УПАЛ В ПОДВАЛ',
    endWindowSub: 'ветер был как голос. скорая приехала уже зря.',
    endBledTitle: 'НЕ ДОЖИЛ',
    endBledSub: 'кровь кончилась раньше водки. так тоже бывает.',
    endStatsKillsPrefix: 'ТРУПОВ: ',
    endStatsPhantomsPrefix: 'ПРИЗРАКОВ: ',
    endRetry: 'ЕЩЁ ПО ОДНОЙ',
    btnMenu: 'В МЕНЮ',

    tapokHintTitle: 'ЗАМИНИРОВАННЫЙ ТАПОК',
    tapokHintSub: 'встань на него: 10с неуязвим, потом он взорвёт врагов',
    bannerTapokSpawn: 'заминированный тапок.',
    bannerTapokArmed: 'стой на тапке. десять секунд.',
    bannerTapokBoom: 'тапок сказал БУМ.',

    bannerAmbulanceHears: 'скорая услышала. и не только она.',
    bannerSiren: 'сирена близко. настоящие светятся.',
    bannerBlackout: 'темнота лезет в глаза.',
    bannerPossessedPrefix: 'палец сам держит ',
    bannerWindow: 'лестница зовёт наружу. не выходи.',
    bannerSquirrel: 'белочка пришла.',
    bannerFloorDrinks: 'бутылка разбилась. пол тоже пьёт.',
    bannerShieldBroke: 'щит разбился',

    tutorMove: 'WASD / СТРЕЛКИ - ДВИГАЙСЯ',
    tutorStop: 'СТОЙ НА МЕСТЕ: БОМЖАРА КИДАЕТ БУТЫЛКИ ТОЛЬКО СТОЯ',
    tutorDodge: 'НО УВОРАЧИВАЙСЯ ОТ СВОИХ ЖЕ БУТЫЛОК',
    tutorContinue: 'НАЖМИ, ЧТОБЫ ПРОДОЛЖИТЬ',

    teachBlood: 'водка кончилась. но в крови ещё найдётся.',
    teachBounce: 'отскок',

    toastZakuska: '+ЗАКУСКА',
    toastVodka: '+ВОДКА',

    squirrelLines: [
      'не отдавай мне последнюю...',
      'мы с тобой одно, браток.',
      'ещё по одной?',
      'я тут навсегда.',
    ],

    horrorsTitle: 'ПЕРЕЖИТЫЕ УЖАСЫ',
    horrorBlackoutName: 'ТЕМНОТА',
    horrorBlackoutDesc: 'края комнаты лезут внутрь',
    horrorPossessedName: 'ЗАЛИПШАЯ КЛАВИША',
    horrorPossessedDesc: 'одна сторона держится сама',
    horrorWindowName: 'ЛЕСТНИЦА НАРУЖУ',
    horrorWindowDesc: 'снег зовёт вниз',

    windHowl: 'заходи брат',

    pauseTitle: 'ПАУЗА',
    pauseResume: 'ПРОДОЛЖИТЬ',
    pauseSoundOn: 'ЗВУК: ВКЛ',
    pauseSoundOff: 'ЗВУК: ВЫКЛ',
    pauseUpgradesTitle: 'ВЗЯТО В ЭТОМ ЗАБЕГЕ',
    pauseNoUpgrades: 'пока ничего',

    helpTitle: 'КАК ЭТО РАБОТАЕТ',
    helpBack: 'НАЗАД',
    helpHowTo: [
      'доживи до скорой - таймер сверху справа.',
      'водка = патроны и рассудок. бомжара бросает бутылки сам.',
      'кровь = жизнь. уходит от касаний нечисти и своих рикошетов.',
      'меньше половины водки - белочка крепнет. полная шкала = жёсткие глюки.',
      'подвал открывается на 30-й секунде. тапок падает на 60-й.',
    ],
    helpMonstersTitle: 'НЕЧИСТЬ',
    helpHpPrefix: 'хп ',
    helpMonsterBeer: 'пиво - рядовая шпана, идёт толпой',
    helpMonsterWine: 'вино - жирное и живучее',
    helpMonsterChamp: 'шампанское - быстрое, лопается на мелких',
    helpMonsterCognac: 'коньяк - танк, бьёт больнее всех',
    helpItemsTitle: 'ПРЕДМЕТЫ И СОБЫТИЯ',
    helpItemVodka: { name: 'ВОДКА', desc: '+36 водки. держи бутылку выше половины.' },
    helpItemZakuska: { name: 'ЗАКУСКА', desc: '+2 крови и чуть трезвее.' },
    helpItemTapok: { name: 'ТАПОК (60с)', desc: 'встань на него: 10с неуязвим, потом взрыв по всем вокруг.' },
    helpItemWindow: { name: 'ЛЕСТНИЦА (30с)', desc: 'дыра в подвале манит. шагнёшь - конец.' },
    helpItemMattress: { name: 'МАТРАС', desc: 'апгрейд-щит: молча держит один удар.' },
    helpItemBelochka: { name: 'БЕЛОЧКА', desc: 'бессмертна. приходит, когда водки мало, уходит с водкой.' },
    helpUpgradesTitle: 'АПГРЕЙДЫ',

    booze: {
      beer: 'пиво',
      wine: 'вино',
      champ: 'шампанское',
      cognac: 'коньяк',
    },

    upgrades: {
      shots: { name: 'ДВОЙНОЙ РАЗЛИВ', desc: '+1 струя' },
      fireRate: { name: 'НЕ ПРОСЫХАЕТ', desc: 'льёшь быстрее' },
      ricochet: { name: 'РИКОШЕТ', desc: '+20% урона после стены' },
      damage: { name: 'КРЕПЧЕ', desc: '+30% урона' },
      vodkaMax: { name: 'НА ГРУДЬ', desc: '+40 макс. водки' },
      lifesteal: { name: 'ОПОХМЕЛ', desc: '+кровь за каждого' },
      speed: { name: 'ТРЕЗВЫЙ ШАГ', desc: '+18% к скорости' },
      pierce: { name: 'ПРОБОЙ', desc: 'пули бьют насквозь' },
      crossed: { name: 'ПЕРЕКРЕСТИТЬСЯ', desc: 'получить +5 к здоровью' },
      steady: { name: 'ЯСНЫЙ ВЗГЛЯД', desc: 'руки трясёт меньше' },
      molotov: { name: 'БУТЫЛКА С ФИТИЛЁМ', desc: 'каждый N-й выстрел жжёт всех' },
      seek: { name: 'ПЬЯНЫЙ РИКОШЕТ', desc: 'после стены пуля ищет цель' },
      shield: { name: 'ПОХМЕЛЬНЫЙ ЩИТ', desc: 'водка заряжает обоссанный матрас-щит' },
      ambulance: { name: 'СКОРАЯ СЛЫШИТ', desc: '-6с, но шум зовёт волну врагов' },
      wisdom: { name: 'БОРОДА МУДРОСТИ', desc: '+1 выбор на будущих уровнях' },
    },
  },
};

var locale = 'en';
try {
  var storedLocale = window.localStorage && window.localStorage.getItem(LANGUAGE_STORE);
  if (storedLocale === 'ru' || storedLocale === 'en') locale = storedLocale;
} catch (e) {}

export var T = TEXTS[locale];

function syncDocumentLanguage() {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = locale;
  document.title = T.pageTitle;
  var fallback = document.getElementById('fallback');
  if (fallback) fallback.textContent = T.fallbackWebGL;
}

export function getLocale() {
  return locale;
}

export function setLocale(nextLocale) {
  locale = nextLocale === 'ru' ? 'ru' : 'en';
  T = TEXTS[locale];
  try { window.localStorage && window.localStorage.setItem(LANGUAGE_STORE, locale); } catch (e) {}
  syncDocumentLanguage();
  return locale;
}

syncDocumentLanguage();
