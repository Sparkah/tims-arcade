import Phaser from 'phaser';

type YandexSDK = {
  features?: {
    LoadingAPI?: { ready(): void };
    GameplayAPI?: { start(): void; stop(): void };
  };
  environment?: { i18n?: { lang?: string } };
  on?(event: string, callback: () => void): void;
};

declare global {
  interface Window {
    YaGames?: { init(): Promise<YandexSDK> };
    ysdk?: YandexSDK;
    __sdkDone?: boolean;
    __bootDone?: boolean;
    __phaserGame?: Phaser.Game;
    __trySignalReady?: () => void;
  }
}

window.__sdkDone = false;
window.__bootDone = false;

export function registerPhaserGame(game: Phaser.Game): void {
  window.__phaserGame = game;
}

export function signalPhaserBootReady(): void {
  window.__bootDone = true;
  window.__trySignalReady?.();
}

export function gameplayStart(): void {
  window.ysdk?.features?.GameplayAPI?.start();
}

export function gameplayStop(): void {
  window.ysdk?.features?.GameplayAPI?.stop();
}

export async function initYandexGames(): Promise<void> {
  window.__trySignalReady = () => {
    if (window.__sdkDone && window.__bootDone) {
      window.ysdk?.features?.LoadingAPI?.ready();
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
      const ysdk = await window.YaGames.init();
      window.ysdk = ysdk;
      void ysdk.environment?.i18n?.lang;

      ysdk.on?.('game_api_pause', () => {
        window.__phaserGame?.loop.sleep();
        gameplayStop();
      });

      ysdk.on?.('game_api_resume', () => {
        window.__phaserGame?.loop.wake();
        gameplayStart();
      });
    }
  } catch {
    // Local dev or SDK unavailable. Continue without blocking the game.
  } finally {
    window.__sdkDone = true;
    window.__trySignalReady?.();
  }
}
