import Phaser from 'phaser';
import { loadAssetManifest } from '../assets/assetManifest';
import { SceneKeys } from '../config/sceneKeys';
import { startSceneWithFade } from './sceneTransitions';

export class PreloadScene extends Phaser.Scene {
  private progressBar!: Phaser.GameObjects.Rectangle;

  constructor() {
    super(SceneKeys.Preload);
  }

  preload(): void {
    const { width, height } = this.scale;

    this.add.rectangle(width / 2, height / 2, 420, 18, 0x1d2a3f, 1);
    this.progressBar = this.add.rectangle(width / 2 - 210, height / 2, 0, 18, 0x7ee7c8, 1).setOrigin(0, 0.5);

    this.add
      .text(width / 2, height / 2 - 44, 'Loading assets', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '20px',
        color: '#d8e2f8',
      })
      .setOrigin(0.5);

    this.load.on(Phaser.Loader.Events.PROGRESS, (progress: number) => {
      this.progressBar.width = 420 * progress;
    });

    loadAssetManifest(this);
    // Factory rule: NEVER load music here. A multi-MB track on this barrier
    // makes the whole game non-interactive while it downloads
    // (gallery-perf-diagnosis-2026-06-11). Background music loads lazily
    // from the menu scene via startLazyBgMusic() - src/game/audio/lazyBgMusic.ts.
  }

  create(): void {
    this.progressBar.width = 420;
    startSceneWithFade(this, SceneKeys.TemplateGuide, {
      durationMs: 220,
      loadingText: 'Starting',
    });
  }
}
