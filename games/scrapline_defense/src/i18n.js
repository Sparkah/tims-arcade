const STRINGS = {
  en: {
    title: "Scrapline Defense",
    loading: "Loading scrapyard...",
    loadError: "Balance data failed to load",
    hudCredits: "Credits {value}",
    hudScrap: "Scrap {value}",
    hudWave: "Wave {value}",
    hudCore: "Core {value}",
    hudCrates: "Crates {value}",
    hudBeam: "Beam {value}%",
    labelBench: "Assembly bench",
    labelBoss: "Boss",
    labelLocked: "Locked",
    labelCost: "{value} cr",
    labelTier: "T{tier}",
    buttonBuy: "Buy crate",
    buttonOpen: "Open crate",
    buttonStart: "Start wave",
    buttonClaim: "Claim chest",
    buttonAdChest: "Ad crate",
    buttonLang: "RU",
    statusReady: "Buy, open, place, merge, then start the wave.",
    statusNeedBot: "Place at least one bot on a pad first.",
    statusNoCredits: "Not enough credits.",
    statusBenchFull: "Bench is full.",
    statusNoCrates: "No unopened crates.",
    statusCrateBought: "Crate bought.",
    statusCrateOpened: "{name} joined the bench.",
    statusMerged: "Merged into {name}.",
    statusPadUnlocked: "Pad unlocked.",
    statusWaveStart: "Wave {wave} is moving through the scrap lanes.",
    statusBossStart: "Boss wave {wave}: heavy machine inbound.",
    statusWaveClear: "Wave clear: +{credits} credits.",
    statusBossDown: "Boss scrapped: +{scrap} scrap.",
    statusSectorGate: "New sector gate reached.",
    statusOfflineReward: "Offline return: +{credits} credits.",
    statusChestClaimed: "Supply chest: +{credits} credits and 1 crate.",
    statusAdOpening: "Opening ad for a bonus supply crate.",
    statusAdChestClaimed: "Ad reward: +{credits} credits and 1 crate.",
    statusAdUnavailable: "Ad unavailable. Try again later.",
    statusCoreHit: "Core hit.",
    statusWaveFailed: "Line breached. Repairs reset the wave.",
    botNames: [
      "Bolt Pup",
      "Rivet Runner",
      "Coil Mender",
      "Magnet Mule",
      "Torque Tank",
      "Plasma Press",
      "Foundry Drake",
      "Titan Welder"
    ],
    enemySkitter: "Skitter",
    enemyHauler: "Hauler",
    enemyDrone: "Drone",
    enemyCrusher: "Crusher"
  },
  ru: {
    title: "Оборона металлолинии",
    loading: "Загрузка свалки...",
    loadError: "Не удалось загрузить баланс",
    hudCredits: "Кредиты {value}",
    hudScrap: "Лом {value}",
    hudWave: "Волна {value}",
    hudCore: "Ядро {value}",
    hudCrates: "Ящики {value}",
    hudBeam: "Луч {value}%",
    labelBench: "Сборочный стол",
    labelBoss: "Босс",
    labelLocked: "Закрыто",
    labelCost: "{value} кр",
    labelTier: "У{tier}",
    buttonBuy: "Купить ящик",
    buttonOpen: "Открыть",
    buttonStart: "Пустить волну",
    buttonClaim: "Забрать сундук",
    buttonAdChest: "Реклама: ящик",
    buttonLang: "EN",
    statusReady: "Купи, открой, поставь, объедини и запускай волну.",
    statusNeedBot: "Сначала поставь бота на платформу.",
    statusNoCredits: "Не хватает кредитов.",
    statusBenchFull: "Сборочный стол заполнен.",
    statusNoCrates: "Нет закрытых ящиков.",
    statusCrateBought: "Ящик куплен.",
    statusCrateOpened: "{name} на сборочном столе.",
    statusMerged: "Объединение: {name}.",
    statusPadUnlocked: "Платформа открыта.",
    statusWaveStart: "Волна {wave} идет по линиям.",
    statusBossStart: "Волна босса {wave}: тяжелая машина на подходе.",
    statusWaveClear: "Волна пройдена: +{credits} кредитов.",
    statusBossDown: "Босс разобран: +{scrap} лома.",
    statusSectorGate: "Открыт новый сектор.",
    statusOfflineReward: "Возврат: +{credits} кредитов.",
    statusChestClaimed: "Сундук: +{credits} кредитов и 1 ящик.",
    statusAdOpening: "Открываем рекламу за ящик снабжения.",
    statusAdChestClaimed: "Награда за рекламу: +{credits} кредитов и 1 ящик.",
    statusAdUnavailable: "Реклама недоступна. Попробуй позже.",
    statusCoreHit: "Ядро повреждено.",
    statusWaveFailed: "Линия прорвана. Ремонт перезапустил волну.",
    botNames: [
      "Болт-пес",
      "Заклепочник",
      "Катушечник",
      "Магнитный мул",
      "Танк крутящего момента",
      "Плазменный пресс",
      "Литейный дракон",
      "Титан-сварщик"
    ],
    enemySkitter: "Бегунок",
    enemyHauler: "Тягач",
    enemyDrone: "Дрон",
    enemyCrusher: "Дробитель"
  }
};

export function normalizeLanguage(language) {
  const code = String(language || "en").slice(0, 2).toLowerCase();
  return code === "ru" ? "ru" : "en";
}

export function createI18n(language) {
  let current = normalizeLanguage(language);

  function t(key, params = {}) {
    const table = STRINGS[current] || STRINGS.en;
    const fallback = STRINGS.en[key] || key;
    const value = table[key] || fallback;
    return String(value).replace(/\{(\w+)\}/g, (_, name) => {
      return Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : "";
    });
  }

  function botName(tier, fallbackNames = []) {
    const index = Math.max(0, Math.min(7, Number(tier || 1) - 1));
    const table = STRINGS[current] || STRINGS.en;
    return table.botNames[index] || fallbackNames[index] || STRINGS.en.botNames[index];
  }

  return {
    t,
    botName,
    getLanguage() {
      return current;
    },
    setLanguage(languageCode) {
      current = normalizeLanguage(languageCode);
      return current;
    },
    toggleLanguage() {
      current = current === "en" ? "ru" : "en";
      return current;
    }
  };
}
