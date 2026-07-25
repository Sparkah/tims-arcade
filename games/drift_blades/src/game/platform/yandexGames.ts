import Phaser from 'phaser';

type YandexSDK = {
  features?: {
    LoadingAPI?: { ready(): void };
    GameplayAPI?: { start(): void; stop(): void };
  };
  environment?: { i18n?: { lang?: string } };
  on?(event: string, callback: () => void): void;
};

// CrazyGames SDK v3 shape (parallel branch — never a YaGames shim).
// Verified method names via Object.getOwnPropertyNames(window.CrazyGames.SDK.game).
type CrazyGamesSDK = {
  init(): Promise<void>;
  game: {
    loadingStart(): void;
    loadingStop(): void;
    gameplayStart(): void;
    gameplayStop(): void;
    addSettingsChangeListener?(key: string, cb: (k: string, v: unknown) => void): void;
  };
  ad: {
    requestAd(type: 'midgame' | 'rewarded', callbacks: {
      adStarted?: () => void;
      adFinished?: () => void;
      adError?: (e: unknown) => void;
    }): void;
  };
  user: {
    systemInfo?: { countryCode?: string };
  };
};

declare global {
  interface Window {
    YaGames?: { init(): Promise<YandexSDK> };
    ysdk?: YandexSDK;
    CrazyGames?: { SDK: CrazyGamesSDK };
    crazygamesSDK?: CrazyGamesSDK | null;
    __sdkDone?: boolean;
    __bootDone?: boolean;
    __phaserGame?: Phaser.Game;
    __trySignalReady?: () => void;
  }
}

window.__sdkDone = false;
window.__bootDone = false;
window.crazygamesSDK = null;

// Ad/pause audio hooks (Yandex 4.7): the game registers a pause/resume pair so
// SFX + music are silenced while an ad is open or the platform pauses us.
let onAdPause: (() => void) | null = null;
let onAdResume: (() => void) | null = null;

export function registerAdAudioHooks(pause: () => void, resume: () => void): void {
  onAdPause = pause;
  onAdResume = resume;
}

export function registerPhaserGame(game: Phaser.Game): void {
  window.__phaserGame = game;
}

export function signalPhaserBootReady(): void {
  window.__bootDone = true;
  window.__trySignalReady?.();
}

export function gameplayStart(): void {
  // CrazyGames parallel branch — literal path required for CG QA scanner.
  if (window.crazygamesSDK && window.crazygamesSDK.game) {
    try { window.crazygamesSDK.game.gameplayStart(); } catch (_) {}
  }
  window.ysdk?.features?.GameplayAPI?.start();
}

export function gameplayStop(): void {
  // CrazyGames parallel branch.
  if (window.crazygamesSDK && window.crazygamesSDK.game) {
    try { window.crazygamesSDK.game.gameplayStop(); } catch (_) {}
  }
  window.ysdk?.features?.GameplayAPI?.stop();
}

// Show a midgame interstitial ad (between runs, game-over, etc.).
// Falls through gracefully on Yandex, CrazyGames, or standalone.
export function showMidgameAd(onDone: () => void): void {
  if (window.crazygamesSDK && window.crazygamesSDK.ad) {
    try {
      window.crazygamesSDK.ad.requestAd('midgame', {
        adStarted: () => { onAdPause?.(); },
        adFinished: () => { onAdResume?.(); onDone(); },
        adError: () => { onAdResume?.(); onDone(); },
      });
      return;
    } catch (_) {}
  }
  if (window.ysdk) {
    try {
      (window.ysdk as unknown as { adv: { showFullscreenAdv(opts: object): void } })
        .adv.showFullscreenAdv({
          callbacks: {
            onOpen: () => { onAdPause?.(); },
            onClose: () => { onAdResume?.(); onDone(); },
            onError: () => { onAdResume?.(); onDone(); },
          },
        });
      return;
    } catch (_) {}
  }
  onDone();
}

export async function initYandexGames(): Promise<void> {
  window.__trySignalReady = () => {
    if (window.__sdkDone && window.__bootDone) {
      // Yandex loading-ready signal.
      window.ysdk?.features?.LoadingAPI?.ready();
      // CrazyGames loadingStop is called inside the CG branch below on init.
    }
  };

  window.setTimeout(() => {
    if (!window.__sdkDone) {
      window.__sdkDone = true;
      window.__trySignalReady?.();
    }
  }, 5000);

  try {
    if (window.YaGames) {
      // ── Yandex Games branch ──────────────────────────────────────────────
      const ysdk = await window.YaGames.init();
      window.ysdk = ysdk;
      void ysdk.environment?.i18n?.lang;

      ysdk.on?.('game_api_pause', () => {
        window.__phaserGame?.loop.sleep();
        gameplayStop();
        onAdPause?.();
      });

      ysdk.on?.('game_api_resume', () => {
        window.__phaserGame?.loop.wake();
        gameplayStart();
        onAdResume?.();
      });
    } else if (window.CrazyGames && window.CrazyGames.SDK &&
               typeof window.CrazyGames.SDK.init === 'function') {
      // ── CrazyGames SDK v3 parallel branch ────────────────────────────────
      // Fire loadingStart SYNCHRONOUSLY before init resolves (CG QA wants it).
      try { window.CrazyGames.SDK.game.loadingStart(); } catch (_) {}

      await window.CrazyGames.SDK.init();
      window.crazygamesSDK = window.CrazyGames.SDK;

      // Honour platform mute setting.
      try {
        window.crazygamesSDK.game.addSettingsChangeListener?.('muteAudio', (_k, v) => {
          if (v) { onAdPause?.(); } else { onAdResume?.(); }
        });
      } catch (_) {}

      // Signal loading complete — game loop starts after __trySignalReady.
      try { window.CrazyGames.SDK.game.loadingStop(); } catch (_) {}
    }
  } catch {
    // Local dev or SDK unavailable — continue without blocking the game.
  } finally {
    window.__sdkDone = true;
    window.__trySignalReady?.();
  }
}
