import Phaser from 'phaser';
import { SceneKeys } from '../config/sceneKeys';
import { fadeInScene, startSceneWithFade } from './sceneTransitions';
import { startLazyBgMusic, setBgMusicMuted, isBgMusicMuted } from '../audio/lazyBgMusic';
import { setFlowState } from '../platform/gfBridge';
import { t } from '../caravan/i18n';
import { initSfx, sfx } from '../caravan/sfx';
import { COLORS } from '../caravan/constants';

declare global {
  interface Window {
    __GF_AUTOSTART?: number | boolean;
    _silent?: boolean;
    __ctPendingSetup?: { fn: 'shot' | 'jump'; n: number } | null;
    _setupForScreenshot?: (n?: number) => void;
    _jumpLevel?: (n: number) => void;
  }
}

// Caravan Thief menu. On the gallery the game opens here; platform builds set
// window.__GF_AUTOSTART and drop straight into PLAYING (the in-game coach is the
// tutorial). The menu stays reachable via the in-run pause/bazaar hub.
export class TemplateGuideScene extends Phaser.Scene {
  private transitioning = false;
  private demoT = 0;
  private demoG?: Phaser.GameObjects.Graphics;

  constructor() {
    super(SceneKeys.TemplateGuide);
  }

  create(): void {
    const { width, height } = this.scale;
    fadeInScene(this);
    this.transitioning = false;
    initSfx(this);

    if (window.__GF_AUTOSTART) {
      setFlowState('PLAYING');
      startLazyBgMusic(this);
      this.startGame(true);
      return;
    }

    this.drawBackground(width, height);
    const cx = width / 2;
    const narrow = width < 560;

    const titleSize = Math.min(66, Math.floor(width / 8.2));
    const titleY = Math.max(90, height * 0.16);
    this.add
      .text(cx, titleY, t('title'), {
        fontFamily: 'Trebuchet MS, Verdana, Arial, sans-serif',
        fontSize: `${titleSize}px`,
        color: '#ffe9b0',
        fontStyle: 'bold',
        stroke: '#2a1406',
        strokeThickness: 8,
        shadow: { offsetX: 0, offsetY: 4, color: '#000000', blur: 10, fill: true },
        align: 'center',
      })
      .setOrigin(0.5);

    this.add
      .text(cx, titleY + titleSize * 0.72 + 14, t('tagline'), {
        fontFamily: 'Trebuchet MS, Verdana, Arial, sans-serif',
        fontSize: narrow ? '17px' : '21px',
        color: '#e8c9a0',
        align: 'center',
        wordWrap: { width: width - 70 },
      })
      .setOrigin(0.5);

    // living art: a wagon sliding down a little road with a sweeping torch
    this.demoG = this.add.graphics();
    this.time.addEvent({ delay: 16, loop: true, callback: () => this.renderDemo(width, height * 0.46) });

    // how-to lines ABOVE the play button
    this.add
      .text(cx, height * 0.62, `${t('tut_goal')}\n${t('tut_controls')}`, {
        fontFamily: 'Trebuchet MS, Verdana, Arial, sans-serif',
        fontSize: narrow ? '15px' : '17px',
        color: '#d8c6ae',
        align: 'center',
        lineSpacing: 6,
        wordWrap: { width: Math.min(width - 60, 640) },
      })
      .setOrigin(0.5, 0);

    // mute toggle (corner)
    const muteG = this.add.graphics();
    const drawMute = (): void => {
      muteG.clear();
      muteG.fillStyle(0x16202e, 1);
      muteG.fillCircle(width - 40, 40, 20);
      muteG.lineStyle(2, 0x33485f, 1);
      muteG.strokeCircle(width - 40, 40, 20);
      muteG.fillStyle(0xd8e2f8, 1);
      muteG.fillRect(width - 48, 36, 5, 8);
      muteG.fillTriangle(width - 43, 36, width - 37, 31, width - 37, 49);
      if (isBgMusicMuted()) {
        muteG.lineStyle(3, COLORS.danger, 1);
        muteG.lineBetween(width - 34, 33, width - 28, 47);
      }
    };
    drawMute();
    const muteZone = this.add.circle(width - 40, 40, 24).setInteractive({ useHandCursor: true });
    muteZone.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      setBgMusicMuted(!isBgMusicMuted());
      this.sound.mute = isBgMusicMuted();
      drawMute();
    });

    // PLAY button LAST (hygiene: drawn on top, no copy over it)
    const bw = Math.min(320, width - 70);
    const bh = 70;
    const bx = cx - bw / 2;
    const by = height * 0.78;
    const playG = this.add.graphics();
    playG.fillStyle(COLORS.coin, 1);
    playG.fillRoundedRect(bx, by, bw, bh, 16);
    playG.lineStyle(3, 0xb8860b, 1);
    playG.strokeRoundedRect(bx, by, bw, bh, 16);
    const playText = this.add
      .text(cx, by + bh / 2, t('play'), {
        fontFamily: 'Trebuchet MS, Verdana, Arial, sans-serif',
        fontSize: '26px',
        color: '#3a1e06',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.tweens.add({ targets: playText, scale: { from: 1, to: 1.05 }, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.easeInOut' });
    const playZone = this.add.zone(bx, by, bw, bh).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    playZone.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      sfx('tap');
      this.startGame(false);
    });
    this.input.keyboard?.once('keydown-ENTER', () => this.startGame(false));
    this.input.keyboard?.once('keydown-SPACE', () => this.startGame(false));

    window._setupForScreenshot = (n = 3) => {
      window.__ctPendingSetup = { fn: 'shot', n };
      this.startGame(true);
    };
    window._jumpLevel = (n: number) => {
      window.__ctPendingSetup = { fn: 'jump', n };
      this.startGame(true);
    };

    setFlowState('MENU');
    startLazyBgMusic(this);
  }

  private renderDemo(width: number, y: number): void {
    const g = this.demoG;
    if (!g) return;
    g.clear();
    const cx = width / 2;
    const half = Math.min(150, width / 2 - 50);
    // road
    g.fillStyle(COLORS.road, 1);
    g.fillRect(cx - 30, y - half, 60, half * 2);
    // wagon sliding down
    this.demoT = (this.demoT + 0.006) % 1;
    const wy = y - half + half * 2 * this.demoT;
    g.fillStyle(0x000000, 0.2);
    g.fillRoundedRect(cx - 26, wy - 16 + 5, 52, 34, 6);
    g.fillStyle(COLORS.wagonWood, 1);
    g.fillRoundedRect(cx - 26, wy - 16, 52, 34, 6);
    g.fillStyle(COLORS.coin, 1);
    g.fillTriangle(cx - 16, wy + 10, cx, wy - 10, cx + 16, wy + 10);
    // thief in cover to the left
    g.fillStyle(COLORS.cover, 1);
    g.fillEllipse(cx - 78, y, 54, 32);
    g.fillStyle(COLORS.thiefBody, 1);
    g.fillCircle(cx - 78, y - 4, 13);
    g.fillStyle(COLORS.thiefScarf, 1);
    g.fillRoundedRect(cx - 86, y - 4, 16, 6, 3);
    // sweeping torch cone from the right
    const facing = Math.PI + Math.sin(this.demoT * Math.PI * 4) * 0.5;
    const gx = cx + 92;
    const gy = y - 30;
    g.fillStyle(COLORS.cone, 0.18);
    g.beginPath();
    g.moveTo(gx, gy);
    for (let i = 0; i <= 12; i += 1) {
      const a = facing - 0.4 + (0.8 * i) / 12;
      g.lineTo(gx + Math.cos(a) * 150, gy + Math.sin(a) * 150);
    }
    g.closePath();
    g.fillPath();
    g.fillStyle(COLORS.guard, 1);
    g.fillCircle(gx, gy, 12);
    g.fillStyle(COLORS.torch, 0.8);
    g.fillCircle(gx, gy - 14, 6);
  }

  private startGame(silent: boolean): void {
    if (this.transitioning) return;
    this.transitioning = true;
    if (silent) {
      this.scene.start(SceneKeys.Game);
      return;
    }
    startSceneWithFade(this, SceneKeys.Game, { durationMs: 240 });
  }

  private drawBackground(width: number, height: number): void {
    const g = this.add.graphics();
    const top = COLORS.duskTop;
    const bot = COLORS.duskBottom;
    const bands = 14;
    for (let i = 0; i < bands; i += 1) {
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.IntegerToColor(top),
        Phaser.Display.Color.IntegerToColor(bot),
        bands - 1,
        i,
      );
      g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1);
      g.fillRect(0, (height / bands) * i, width, height / bands + 1);
    }
    g.fillStyle(0x8a4a30, 0.5);
    g.fillEllipse(width * 0.25, height * 0.34, width * 1.1, 150);
    g.fillStyle(0x6a3320, 0.5);
    g.fillEllipse(width * 0.8, height * 0.42, width * 0.9, 120);
    // moon
    g.fillStyle(0xf5e7c0, 0.9);
    g.fillCircle(width * 0.78, height * 0.12, 26);
  }
}
