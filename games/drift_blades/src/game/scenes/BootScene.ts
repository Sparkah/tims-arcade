import Phaser from 'phaser';
import { SceneKeys } from '../config/sceneKeys';
import { signalPhaserBootReady } from '../platform/yandexGames';

export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Boot);
  }

  create(): void {
    signalPhaserBootReady();
    this.scene.start(SceneKeys.Preload);
  }
}
