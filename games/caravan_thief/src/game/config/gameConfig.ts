import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene';
import { PreloadScene } from '../scenes/PreloadScene';
import { TemplateGuideScene } from '../scenes/TemplateGuideScene';
import { GameScene } from '../scenes/GameScene';
import { UIScene } from '../scenes/UIScene';
import { SceneKeys } from './sceneKeys';

export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-root',
  backgroundColor: '#241436',
  // RESIZE: the canvas always fills the viewport (mobile-portrait-first +
  // Yandex 1.6.2.1 - never letterbox to thin bands). Scenes lay out against
  // this.scale.width/height and re-flow on the 'resize' event.
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.NO_CENTER,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
  },
  pixelArt: false,
  physics: {
    default: 'arcade',
    arcade: { debug: false },
  },
  scene: [BootScene, PreloadScene, TemplateGuideScene, GameScene, UIScene],
};
