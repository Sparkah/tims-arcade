import Phaser from 'phaser';
import './style.css';
// Factory bridge: window.gs ('BOOT' until the menu is interactive) +
// window.__gfState() for the pipeline gates. Import it before the game
// config so the globals exist before any scene code runs. DO NOT REMOVE.
import './game/platform/gfBridge';
import { gameConfig } from './game/config/gameConfig';
import { initYandexGames, registerPhaserGame } from './game/platform/yandexGames';

declare global {
  interface Window {
    __phaserGame?: Phaser.Game;
  }
}

void initYandexGames();
const game = new Phaser.Game(gameConfig);
window.__phaserGame = game;
registerPhaserGame(game);
