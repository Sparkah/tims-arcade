// Drift Blades MENU / hub. (Class name kept as TemplateGuideScene so the
// factory patch anchors still apply - it imports startLazyBgMusic + setFlowState
// and flips gs to 'MENU' when interactive.)
//
// The gallery is the only place a game opens on its menu. On platform builds
// window.__GF_AUTOSTART is set next to the SDK tag (rule #9) and this scene
// boots straight into a run instead of showing the hub.

import Phaser from 'phaser';
import { SceneKeys } from '../config/sceneKeys';
import { fadeInScene, startSceneWithFade } from './sceneTransitions';
import { startLazyBgMusic, setBgMusicMuted } from '../audio/lazyBgMusic';
import { setFlowState } from '../platform/gfBridge';
import {
  setCurrentScreen,
  registerReachProvider,
  registerMenuLauncher,
  type ReachPayload,
} from '../platform/gateHooks';
import { MetaStore } from '../save/MetaStore';
import { soundKit } from '../audio/SoundKit';
import { t } from '../i18n';
import { CARD_UNLOCKS, OFFERS, offersUnlocked, nextUnlock } from '../game/cards';

export class TemplateGuideScene extends Phaser.Scene {
  private transitioning = false;
  private meta!: MetaStore;
  private muteLabel?: Phaser.GameObjects.Text;
  private reachItems: ReachPayload['items'] = [];

  constructor() {
    super(SceneKeys.TemplateGuide);
  }

  create(): void {
    fadeInScene(this);
    this.transitioning = false;
    this.meta = new MetaStore();

    // Gate hook: _jumpLevel / _setupForScreenshot boot a run FROM the menu.
    // (GameScene registers force-over / screenshot-stage / restart once it runs.)
    registerMenuLauncher((toOver?: boolean) => this.launchRun(!!toOver));

    // Factory: menu interactive -> honest flow state + lazy music.
    setFlowState('MENU');
    startLazyBgMusic(this);
    // Restore mute pref.
    if (this.meta.value.muted) {
      this.sound.mute = true;
      setBgMusicMuted(true);
      soundKit.setMuted(true);
    }

    // Platform autostart (rule #9): skip the hub, boot a run immediately.
    const w = window as { __GF_AUTOSTART?: number; _silent?: boolean };
    if (w.__GF_AUTOSTART && !w._silent) {
      this.launchRun(false);
      return;
    }

    setCurrentScreen('menu');
    this.buildHub();
  }

  private buildHub(): void {
    const { width, height } = this.scale;
    this.reachItems = [];
    this.drawBackground(width, height);

    const cx = width / 2;

    // Title.
    this.add
      .text(cx, 150, t('title'), {
        fontFamily: 'Trebuchet MS, Arial, sans-serif',
        fontSize: '60px',
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#0a1422',
        strokeThickness: 8,
        shadow: { offsetX: 0, offsetY: 4, color: '#000000', blur: 10, fill: true },
      })
      .setOrigin(0.5);

    // Decorative crossed blades under the title.
    this.drawCrossedBlades(cx, 250, 64);

    this.add
      .text(cx, 320, t('tagline'), {
        fontFamily: 'Trebuchet MS, Arial, sans-serif',
        fontSize: '22px',
        color: '#9fd0ff',
        align: 'center',
        wordWrap: { width: width - 120 },
      })
      .setOrigin(0.5);

    // Meta panel: Shards, best, unlock progress.
    const m = this.meta.value;
    const unlockedCount = offersUnlocked(m.lifetimeShards).length;
    const panelY = 430;
    const panelW = width - 120;
    const panel = this.add.rectangle(cx, panelY, panelW, 230, 0x141c2c, 0.95).setOrigin(0.5);
    panel.setStrokeStyle(2, 0x2e486e, 0.9);

    this.add
      .text(cx, panelY - 88, `${t('shards')}: ${m.lifetimeShards}`, {
        fontFamily: 'Trebuchet MS, Arial, sans-serif',
        fontSize: '28px',
        color: '#ffd27a',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.add
      .text(cx, panelY - 50, `${t('hubUnlocks')}: ${unlockedCount} / ${OFFERS.length}`, {
        fontFamily: 'Trebuchet MS, Arial, sans-serif',
        fontSize: '20px',
        color: '#d8e2f8',
      })
      .setOrigin(0.5);

    // Next-unlock progress bar (the reason to return).
    const nxt = nextUnlock(m.lifetimeShards);
    const barW = panelW - 80;
    const barX = cx - barW / 2;
    const barY = panelY + 6;
    this.add.rectangle(cx, barY, barW, 18, 0x0c1320, 1).setOrigin(0.5).setStrokeStyle(1, 0x2e486e, 0.8);
    if (nxt) {
      const prevAt = this.prevThreshold(nxt.at);
      const frac = Phaser.Math.Clamp((m.lifetimeShards - prevAt) / Math.max(1, nxt.at - prevAt), 0, 1);
      this.add.rectangle(barX, barY, barW * frac, 18, 0x53d6e6, 1).setOrigin(0, 0.5);
      this.add
        .text(cx, barY + 34, `${t('nextUnlock')}: ${t(nxt.nameKey)}  (${m.lifetimeShards}/${nxt.at})`, {
          fontFamily: 'Trebuchet MS, Arial, sans-serif',
          fontSize: '17px',
          color: '#7ee7c8',
          align: 'center',
        })
        .setOrigin(0.5);
    } else {
      this.add.rectangle(barX, barY, barW, 18, 0x53d6e6, 1).setOrigin(0, 0.5);
      this.add
        .text(cx, barY + 34, t('allUnlocked'), {
          fontFamily: 'Trebuchet MS, Arial, sans-serif',
          fontSize: '17px',
          color: '#7ee7c8',
        })
        .setOrigin(0.5);
    }

    // PLAY button (big, thumb-reachable).
    const btnY = height - 230;
    const btnW = Math.min(width - 140, 420);
    const btnH = 96;
    const playBtn = this.add.rectangle(cx, btnY, btnW, btnH, 0x2bbd91, 1).setOrigin(0.5);
    playBtn.setStrokeStyle(3, 0x7ee7c8, 1);
    playBtn.setInteractive({ useHandCursor: true });
    this.add
      .text(cx, btnY, t('play'), {
        fontFamily: 'Trebuchet MS, Arial, sans-serif',
        fontSize: '40px',
        color: '#06231a',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.tweens.add({ targets: playBtn, scaleX: 1.03, scaleY: 1.05, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.easeInOut' });
    playBtn.on('pointerup', () => this.launchRun(false));
    this.registerReach('play', cx, btnY, btnW, btnH);

    // Tip.
    this.add
      .text(cx, height - 120, t('hubTip'), {
        fontFamily: 'Trebuchet MS, Arial, sans-serif',
        fontSize: '16px',
        color: '#8fa2c4',
        align: 'center',
        wordWrap: { width: width - 120 },
      })
      .setOrigin(0.5);

    // Mute toggle (top-right).
    this.buildMuteToggle();

    this.input.keyboard?.once('keydown-ENTER', () => this.launchRun(false));
    this.input.keyboard?.once('keydown-SPACE', () => this.launchRun(false));

    registerReachProvider('menu', () => ({
      screen: 'menu',
      viewportH: this.scale.height,
      viewportW: this.scale.width,
      screenH: this.scale.height,
      scrollMaxY: 0,
      items: this.reachItems,
    }));
  }

  private prevThreshold(target: number): number {
    let prev = 0;
    for (const u of CARD_UNLOCKS) {
      if (u.at >= target) break;
      prev = u.at;
    }
    return prev;
  }

  private buildMuteToggle(): void {
    const { width } = this.scale;
    const x = width - 56;
    const y = 56;
    const bg = this.add.circle(x, y, 30, 0x141c2c, 0.95).setStrokeStyle(2, 0x2e486e, 0.9).setInteractive({ useHandCursor: true });
    this.muteLabel = this.add
      .text(x, y, this.sound.mute ? 'OFF' : 'ON', {
        fontFamily: 'Trebuchet MS, Arial, sans-serif',
        fontSize: '16px',
        color: '#9fd0ff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    const toggle = () => {
      const next = !this.sound.mute;
      this.sound.mute = next;
      setBgMusicMuted(next);
      soundKit.setMuted(next);
      this.meta.setMuted(next);
      this.muteLabel?.setText(next ? 'OFF' : 'ON');
    };
    bg.on('pointerup', toggle);
    this.muteLabel.setInteractive({ useHandCursor: true }).on('pointerup', toggle);
    this.registerReach('mute', x, y, 60, 60);
  }

  private registerReach(id: string, cx: number, cy: number, w: number, h: number): void {
    this.reachItems.push({ id, x: cx - w / 2, y: cy - h / 2, w, h, pinned: true });
  }

  private launchRun(toOver: boolean): void {
    if (this.transitioning) return;
    this.transitioning = true;
    soundKit.unlock();
    startSceneWithFade(this, SceneKeys.Game, { durationMs: 220, data: { jumpToOver: toOver } });
  }

  private drawCrossedBlades(cx: number, cy: number, len: number): void {
    const g = this.add.graphics();
    g.lineStyle(5, 0x9fd0ff, 0.9);
    g.lineBetween(cx - len, cy + len * 0.4, cx + len, cy - len * 0.4);
    g.lineBetween(cx + len, cy + len * 0.4, cx - len, cy - len * 0.4);
    g.fillStyle(0xffd27a, 1);
    g.fillCircle(cx, cy, 6);
  }

  private drawBackground(width: number, height: number): void {
    this.add.rectangle(width / 2, height / 2, width, height, 0x0b0f17);
    const g = this.add.graphics();
    g.lineStyle(1, 0x1b2740, 0.35);
    for (let x = 0; x <= width; x += 56) g.lineBetween(x, 0, x, height);
    for (let y = 0; y <= height; y += 56) g.lineBetween(0, y, width, y);
    g.fillStyle(0x4fa3ff, 0.05);
    g.fillCircle(width * 0.2, height * 0.18, 260);
    g.fillStyle(0xff5a5f, 0.045);
    g.fillCircle(width * 0.82, height * 0.78, 300);
  }
}
