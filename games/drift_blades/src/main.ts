import Phaser from 'phaser';
import './style.css';
// Factory bridge: window.gs ('BOOT' until the menu is interactive) +
// window.__gfState() for the pipeline gates. Import it before the game
// config so the globals exist before any scene code runs. DO NOT REMOVE.
import './game/platform/gfBridge';
import { gameConfig } from './game/config/gameConfig';
import { initYandexGames, registerPhaserGame, registerAdAudioHooks } from './game/platform/yandexGames';
import { detectLang, t } from './game/i18n';
import { installGateHooks } from './game/platform/gateHooks';
import { soundKit } from './game/audio/SoundKit';
import { setBgMusicMuted } from './game/audio/lazyBgMusic';

declare global {
  interface Window {
    __phaserGame?: Phaser.Game;
  }
}

detectLang();
// Pipeline contract surface: GF.t / _setLang / _jumpLevel / _setupForScreenshot
// / __gfTour / __gfReach + run-state vars for __gfState().
installGateHooks();

// Visually-hidden localized text: a DOM probe / screen reader can read the
// active language + the tutorial copy even though canvas text is opaque to it.
const a11y = document.createElement('div');
a11y.setAttribute('aria-hidden', 'false');
a11y.style.cssText = 'position:absolute;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;';
a11y.textContent = `${t('title')}. ${t('tutGoal')} ${t('tutControls')} ${t('play')}. ${t('shards')}.`;
document.body.appendChild(a11y);

// Silence SFX + music while an ad/platform pause is active (Yandex 4.7).
registerAdAudioHooks(
  () => {
    soundKit.setMuted(true);
    setBgMusicMuted(true);
  },
  () => {
    // Only un-silence if the player has not muted manually.
    const game = window.__phaserGame;
    const userMuted = game ? game.sound.mute : false;
    if (!userMuted) {
      soundKit.setMuted(false);
      setBgMusicMuted(false);
    }
  },
);

void initYandexGames();
const game = new Phaser.Game(gameConfig);
window.__phaserGame = game;
registerPhaserGame(game);

// Give the canvas id="c" so the stack-agnostic gate's click sweeps (which look
// for #c, the vanilla-template canvas id) target it on this Phaser build.
game.events.once('ready', () => {
  if (game.canvas) game.canvas.id = 'c';
});
