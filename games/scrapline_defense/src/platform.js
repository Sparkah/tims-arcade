const RU_LANGS = new Set(["ru", "be", "kk", "uk", "uz"]);
const STORAGE_KEY_PREFIX = "scrapline_defense_";

let platformName = detectPlatform();
let yandexSdk = null;
let crazySdk = null;
let language = detectBrowserLanguage();
let initialized = false;
let gameplayActive = false;
let adInProgress = false;
const pauseCallbacks = new Set();
const resumeCallbacks = new Set();

function detectPlatform() {
  const flag = String(window.__SCRAPLINE_PLATFORM__ || "").toLowerCase();
  if (flag === "yandex" || flag === "crazygames") return flag;
  if (typeof window.YaGames !== "undefined") return "yandex";
  if (window.CrazyGames?.SDK) return "crazygames";
  return "standalone";
}

function normalizeLanguage(value) {
  const code = String(value || "en").slice(0, 2).toLowerCase();
  return RU_LANGS.has(code) ? "ru" : "en";
}

function detectBrowserLanguage() {
  try {
    return normalizeLanguage(navigator.languages?.[0] || navigator.language || "en");
  } catch (_) {
    return "en";
  }
}

function settle(callback, value) {
  if (typeof callback === "function") callback(value);
}

function pauseGame() {
  adInProgress = true;
  for (const callback of pauseCallbacks) callback();
}

function resumeGame() {
  adInProgress = false;
  for (const callback of resumeCallbacks) callback();
}

function callYandexReady() {
  try {
    yandexSdk?.features?.LoadingAPI?.ready?.();
  } catch (_) {}
}

function callYandexGameplayStart() {
  try {
    yandexSdk?.features?.GameplayAPI?.start?.();
  } catch (_) {}
}

function callYandexGameplayStop() {
  try {
    yandexSdk?.features?.GameplayAPI?.stop?.();
  } catch (_) {}
}

function callCrazyLoadingStart() {
  try {
    window.CrazyGames?.SDK?.game?.loadingStart?.();
  } catch (_) {}
}

function callCrazyLoadingStop() {
  try {
    crazySdk?.game?.loadingStop?.();
  } catch (_) {}
}

function callCrazyGameplayStart() {
  try {
    crazySdk?.game?.gameplayStart?.();
  } catch (_) {}
}

function callCrazyGameplayStop() {
  try {
    crazySdk?.game?.gameplayStop?.();
  } catch (_) {}
}

async function initYandex() {
  if (!window.YaGames?.init) return;
  yandexSdk = await window.YaGames.init();
  window.ysdk = yandexSdk;
  language = normalizeLanguage(yandexSdk?.environment?.i18n?.lang);
  try {
    yandexSdk.on?.("game_api_pause", () => {
      for (const callback of pauseCallbacks) callback();
    });
    yandexSdk.on?.("game_api_resume", () => {
      if (!adInProgress) {
        for (const callback of resumeCallbacks) callback();
      }
    });
  } catch (_) {}
}

async function initCrazyGames() {
  if (!window.CrazyGames?.SDK?.init) return;
  callCrazyLoadingStart();
  await window.CrazyGames.SDK.init();
  crazySdk = window.CrazyGames.SDK;
  const info = crazySdk.user?.systemInfo || {};
  language = normalizeLanguage(info.locale || info.countryCode || detectBrowserLanguage());
}

function yandexRewarded(onReward, onDone) {
  if (!yandexSdk?.adv?.showRewardedVideo) {
    settle(onDone, false);
    return;
  }
  let opened = false;
  let rewarded = false;
  let settled = false;
  let openTimer = null;
  let maxTimer = null;
  const complete = (success) => {
    if (settled) return;
    settled = true;
    if (openTimer) clearTimeout(openTimer);
    if (maxTimer) clearTimeout(maxTimer);
    resumeGame();
    if (success) settle(onReward, true);
    settle(onDone, Boolean(success));
  };
  openTimer = window.setTimeout(() => {
    if (!opened) complete(false);
  }, 4500);
  try {
    yandexSdk.adv.showRewardedVideo({
      callbacks: {
        onOpen() {
          opened = true;
          if (openTimer) clearTimeout(openTimer);
          maxTimer = window.setTimeout(() => complete(rewarded), 180000);
          pauseGame();
        },
        onRewarded() {
          rewarded = true;
        },
        onClose() {
          complete(rewarded);
        },
        onError() {
          complete(false);
        }
      }
    });
  } catch (_) {
    complete(false);
  }
}

function yandexInterstitial(onDone) {
  if (!yandexSdk?.adv?.showFullscreenAdv) {
    settle(onDone, false);
    return;
  }
  let opened = false;
  let settled = false;
  let openTimer = null;
  const complete = (shown) => {
    if (settled) return;
    settled = true;
    if (openTimer) clearTimeout(openTimer);
    resumeGame();
    settle(onDone, Boolean(shown));
  };
  openTimer = window.setTimeout(() => {
    if (!opened) complete(false);
  }, 4500);
  try {
    yandexSdk.adv.showFullscreenAdv({
      callbacks: {
        onOpen() {
          opened = true;
          if (openTimer) clearTimeout(openTimer);
          pauseGame();
        },
        onClose(wasShown) {
          complete(wasShown);
        },
        onError() {
          complete(false);
        }
      }
    });
  } catch (_) {
    complete(false);
  }
}

function crazyAd(type, onReward, onDone) {
  if (!crazySdk?.ad?.requestAd) {
    settle(onDone, false);
    return;
  }
  try {
    crazySdk.ad.requestAd(type, {
      adStarted() {
        pauseGame();
      },
      adFinished() {
        resumeGame();
        if (type === "rewarded") settle(onReward, true);
        settle(onDone, true);
      },
      adError() {
        resumeGame();
        settle(onDone, false);
      }
    });
  } catch (_) {
    resumeGame();
    settle(onDone, false);
  }
}

async function yandexGetData(key) {
  try {
    const player = await Promise.race([
      yandexSdk?.getPlayer?.({ signed: false }),
      new Promise((resolve) => window.setTimeout(() => resolve(null), 4000))
    ]);
    if (!player?.getData) return null;
    const data = await player.getData([key]).catch(() => null);
    return data?.[key] || null;
  } catch (_) {
    return null;
  }
}

async function yandexSetData(key, value) {
  try {
    const player = await Promise.race([
      yandexSdk?.getPlayer?.({ signed: false }),
      new Promise((resolve) => window.setTimeout(() => resolve(null), 4000))
    ]);
    if (player?.setData) await player.setData({ [key]: value }, false).catch(() => {});
  } catch (_) {}
}

export const platform = {
  get name() {
    return platformName;
  },

  async init() {
    if (initialized) return;
    initialized = true;
    platformName = detectPlatform();
    try {
      if (platformName === "yandex") {
        await initYandex();
      } else if (platformName === "crazygames") {
        await initCrazyGames();
      }
    } catch (_) {
      platformName = "standalone";
      language = detectBrowserLanguage();
    }
  },

  loadingReady() {
    if (platformName === "yandex") callYandexReady();
    if (platformName === "crazygames") callCrazyLoadingStop();
  },

  gameplayStart() {
    if (gameplayActive) return;
    gameplayActive = true;
    if (platformName === "yandex") callYandexGameplayStart();
    if (platformName === "crazygames") callCrazyGameplayStart();
  },

  gameplayStop() {
    if (!gameplayActive) return;
    gameplayActive = false;
    if (platformName === "yandex") callYandexGameplayStop();
    if (platformName === "crazygames") callCrazyGameplayStop();
  },

  pauseAudio() {
    for (const callback of pauseCallbacks) callback();
  },

  resumeAudio() {
    if (adInProgress) return;
    for (const callback of resumeCallbacks) callback();
  },

  onPause(callback) {
    if (typeof callback === "function") pauseCallbacks.add(callback);
  },

  onResume(callback) {
    if (typeof callback === "function") resumeCallbacks.add(callback);
  },

  async showInterstitialAd(onDone) {
    this.gameplayStop();
    if (platformName === "yandex") {
      yandexInterstitial(onDone);
      return;
    }
    if (platformName === "crazygames") {
      crazyAd("midgame", null, onDone);
      return;
    }
    settle(onDone, false);
  },

  async showRewardedAd(onReward, onDone) {
    this.gameplayStop();
    if (platformName === "yandex") {
      yandexRewarded(onReward, onDone);
      return;
    }
    if (platformName === "crazygames") {
      crazyAd("rewarded", onReward, onDone);
      return;
    }
    settle(onReward, true);
    settle(onDone, true);
  },

  async loadData(key) {
    const fullKey = STORAGE_KEY_PREFIX + key;
    if (platformName === "crazygames" && crazySdk?.data?.getItem) {
      return crazySdk.data.getItem(fullKey).catch(() => null);
    }
    if (platformName === "yandex" && yandexSdk) {
      return yandexGetData(fullKey);
    }
    return null;
  },

  async saveData(key, value) {
    const fullKey = STORAGE_KEY_PREFIX + key;
    if (platformName === "crazygames" && crazySdk?.data?.setItem) {
      await crazySdk.data.setItem(fullKey, value).catch(() => {});
    } else if (platformName === "yandex" && yandexSdk) {
      await yandexSetData(fullKey, value);
    }
  },

  getLanguage() {
    return language;
  }
};
