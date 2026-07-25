// GameScene - the Drift Blades RUN. Swipe-to-choose upgrade picker that
// auto-resolves a combat tick after each pick. Draws its own HUD (no UIScene).
//
// Keeps the factory contract: fadeInScene(this) + setFlowState('PLAYING') first
// thing in create(); EventBus GameplayStarted/RunStateChanged so gfBridge mirrors
// state; gate hooks registered for _jumpLevel / screenshots / reachability.

import Phaser from 'phaser';
import { GameEvents } from '../config/gameEvents';
import { SceneKeys } from '../config/sceneKeys';
import { eventBus } from '../events/EventBus';
import { fadeInScene, startSceneWithFade } from './sceneTransitions';
import { setFlowState } from '../platform/gfBridge';
import { gameplayStart, gameplayStop } from '../platform/yandexGames';
import {
  registerMenuLauncher,
  registerScreenshotStager,
  registerForceOver,
  registerRestartActive,
  registerReachProvider,
  setCurrentScreen,
  reportRunVars,
  consumePendingStage,
  type ReachPayload,
} from '../platform/gateHooks';
import { RunEngine, type ResolveEvent } from '../game/RunEngine';
import { offersUnlocked, nextUnlock, TOTAL_STEPS } from '../game/cards';
import { MetaStore } from '../save/MetaStore';
import { SwipeCard } from '../ui/SwipeCard';
import { TutorialHand } from '../ui/TutorialHand';
import { soundKit } from '../audio/SoundKit';
import { t } from '../i18n';

interface GameSceneData {
  jumpToOver?: boolean;
}

export class GameScene extends Phaser.Scene {
  private engine!: RunEngine;
  private meta!: MetaStore;
  private card?: SwipeCard;
  private tutorial?: TutorialHand;

  // HUD refs
  private hpBar!: Phaser.GameObjects.Rectangle;
  private hpBarBg!: Phaser.GameObjects.Rectangle;
  private hpText!: Phaser.GameObjects.Text;
  private threatBar!: Phaser.GameObjects.Rectangle;
  private threatText!: Phaser.GameObjects.Text;
  private shardsText!: Phaser.GameObjects.Text;
  private stepText!: Phaser.GameObjects.Text;
  private chips: Record<string, Phaser.GameObjects.Text> = {};
  private gauntletBar!: Phaser.GameObjects.Rectangle;
  private gauntletText!: Phaser.GameObjects.Text;

  private cardCx = 0;
  private cardCy = 0;
  private cardW = 0;
  private cardH = 0;
  private hpBarW = 0;
  private threatBarW = 0;
  private gauntletBarW = 0;
  private runReach: ReachPayload['items'] = [];
  private overReach: ReachPayload['items'] = [];
  private finished = false;
  private transitioningOut = false;
  private lifetimeBefore = 0;

  constructor() {
    super(SceneKeys.Game);
  }

  create(data: GameSceneData): void {
    const { width, height } = this.scale;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.shutdown());

    fadeInScene(this);
    setFlowState('PLAYING');

    this.finished = false;
    this.transitioningOut = false;
    this.meta = new MetaStore();
    this.lifetimeBefore = this.meta.value.lifetimeShards;
    this.engine = new RunEngine(this.lifetimeBefore);

    this.drawBackground(width, height);
    this.buildHud();
    this.registerHooks();

    eventBus.emit(GameEvents.GameplayStarted, { scene: SceneKeys.Game });
    eventBus.emit(GameEvents.RunStateChanged, { phase: 'playing' });
    gameplayStart();
    setCurrentScreen('run');

    // Screenshot staging: the gate's _jumpLevel(1..98) pre-advances a few picks
    // so the captured frame is an evolved build (PLAYING), not step 0.
    const stage = consumePendingStage();
    if (stage > 0 && !data?.jumpToOver) {
      let n = 0;
      while (this.engine.snapshot.phase === 'playing' && n < stage && this.engine.snapshot.step < stage) {
        this.engine.choose(n % 2 === 0 ? 'right' : 'left');
        n += 1;
      }
      this.meta.markTutorialSeen(); // suppress the demo hand on a staged frame
    }

    this.refreshHud(true);
    if (this.engine.snapshot.phase === 'playing') this.nextCard();

    // Tutorial on the very first run (not on a staged screenshot frame).
    if (!this.meta.value.tutorialSeen) {
      this.time.delayedCall(420, () => this.showTutorial());
    }

    // Gate: boot straight to a terminal state for retry-click checks.
    if (data?.jumpToOver) {
      this.time.delayedCall(60, () => this.forceGameOver());
    }
  }

  // ---- HUD ---------------------------------------------------------------

  private buildHud(): void {
    const { width } = this.scale;
    const cx = width / 2;
    const margin = 40;

    // Top: Gauntlet (enemy) HP bar + label.
    this.add
      .text(cx, 60, t('gauntlet'), {
        fontFamily: 'Trebuchet MS, Arial, sans-serif',
        fontSize: '22px',
        color: '#ff8a8f',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.gauntletBarW = width - margin * 2;
    this.add.rectangle(cx, 96, this.gauntletBarW, 22, 0x140c10, 1).setStrokeStyle(2, 0x5a2a2e, 0.9);
    this.gauntletBar = this.add.rectangle(margin, 96, this.gauntletBarW, 22, 0xff5a5f, 1).setOrigin(0, 0.5);
    this.gauntletText = this.add
      .text(cx, 96, '', { fontFamily: 'Trebuchet MS, Arial, sans-serif', fontSize: '14px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5);

    // Threat bar (small, under gauntlet).
    this.add.text(margin, 124, t('threat'), { fontFamily: 'Trebuchet MS, Arial, sans-serif', fontSize: '15px', color: '#ffb648' }).setOrigin(0, 0);
    this.threatBarW = width - margin * 2 - 90;
    this.add.rectangle(margin + 90, 134, this.threatBarW, 12, 0x141016, 1).setOrigin(0, 0.5).setStrokeStyle(1, 0x5a4a2a, 0.8);
    this.threatBar = this.add.rectangle(margin + 90, 134, 0, 12, 0xffb648, 1).setOrigin(0, 0.5);
    this.threatText = this.add
      .text(width - margin, 124, '', { fontFamily: 'Trebuchet MS, Arial, sans-serif', fontSize: '15px', color: '#ffb648' })
      .setOrigin(1, 0);

    // Shards + Step row.
    this.shardsText = this.add
      .text(margin, 168, '', { fontFamily: 'Trebuchet MS, Arial, sans-serif', fontSize: '20px', color: '#ffd27a', fontStyle: 'bold' })
      .setOrigin(0, 0);
    this.stepText = this.add
      .text(width - margin, 168, '', { fontFamily: 'Trebuchet MS, Arial, sans-serif', fontSize: '20px', color: '#9fd0ff', fontStyle: 'bold' })
      .setOrigin(1, 0);

    // Stat chips row.
    const chipY = 206;
    const chipKeys = ['edge', 'guard', 'venom', 'frost', 'crit'];
    const chipColors: Record<string, string> = {
      edge: '#ff8a8f',
      guard: '#7fc0ff',
      venom: '#9be87f',
      frost: '#86eaff',
      crit: '#ffd27a',
    };
    const chipW = (width - margin * 2) / chipKeys.length;
    chipKeys.forEach((k, i) => {
      const x = margin + chipW * i + chipW / 2;
      this.add.rectangle(x, chipY + 16, chipW - 8, 34, 0x131c2c, 0.9).setStrokeStyle(1, 0x2e486e, 0.7);
      this.chips[k] = this.add
        .text(x, chipY + 16, '', { fontFamily: 'Trebuchet MS, Arial, sans-serif', fontSize: '15px', color: chipColors[k], fontStyle: 'bold' })
        .setOrigin(0.5);
    });

    // Bottom: player HP bar.
    const { height } = this.scale;
    const hpY = height - 70;
    this.add.text(margin, hpY - 30, t('hp'), { fontFamily: 'Trebuchet MS, Arial, sans-serif', fontSize: '18px', color: '#7ee7c8', fontStyle: 'bold' }).setOrigin(0, 0);
    this.hpBarW = width - margin * 2;
    this.hpBarBg = this.add.rectangle(cx, hpY, this.hpBarW, 28, 0x0c1a16, 1).setStrokeStyle(2, 0x1f5a4a, 0.9);
    this.hpBar = this.add.rectangle(margin, hpY, this.hpBarW, 28, 0x2bbd91, 1).setOrigin(0, 0.5);
    this.hpText = this.add
      .text(cx, hpY, '', { fontFamily: 'Trebuchet MS, Arial, sans-serif', fontSize: '16px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5);

    // Abandon (back-to-menu) + help buttons (top corners area, pinned).
    this.buildTopButtons();

    // Card centre.
    this.cardW = Math.min(width - 64, 600);
    this.cardH = Math.min(this.scale.height * 0.46, 560);
    this.cardCx = cx;
    this.cardCy = this.scale.height * 0.5 + 6;
  }

  private buildTopButtons(): void {
    const { width } = this.scale;
    // Abandon -> back to menu (rule 1.15: every in-run screen reachable).
    const aw = 110;
    const ah = 40;
    const ax = 40 + aw / 2;
    const ay = 30;
    const abg = this.add.rectangle(ax, ay, aw, ah, 0x2a1c1c, 0.95).setStrokeStyle(1, 0x7a3a3a, 0.9).setInteractive({ useHandCursor: true });
    this.add.text(ax, ay, t('abandon'), { fontFamily: 'Trebuchet MS, Arial, sans-serif', fontSize: '16px', color: '#ff9a9a' }).setOrigin(0.5);
    abg.on('pointerup', () => this.backToMenu());
    this.runReach.push({ id: 'abandon', x: ax - aw / 2, y: ay - ah / 2, w: aw, h: ah, pinned: true });

    // Help (?) reopens the tutorial.
    const hx = width - 40 - 20;
    const hy = 30;
    const hbg = this.add.circle(hx, hy, 20, 0x141c2c, 0.95).setStrokeStyle(1, 0x2e486e, 0.9).setInteractive({ useHandCursor: true });
    this.add.text(hx, hy, '?', { fontFamily: 'Trebuchet MS, Arial, sans-serif', fontSize: '22px', color: '#9fd0ff', fontStyle: 'bold' }).setOrigin(0.5);
    hbg.on('pointerup', () => this.showTutorial());
    this.runReach.push({ id: 'help', x: hx - 20, y: hy - 20, w: 40, h: 40, pinned: true });
  }

  private refreshHud(immediate = false): void {
    const s = this.engine.snapshot;
    const st = s.stats;
    const margin = 40;

    const hpFrac = Phaser.Math.Clamp(st.hp / st.maxHp, 0, 1);
    const gFrac = Phaser.Math.Clamp(s.gauntletHp / s.gauntletMaxHp, 0, 1);
    const tFrac = Phaser.Math.Clamp(s.threat / 38, 0, 1);

    if (immediate) {
      this.hpBar.width = this.hpBarW * hpFrac;
      this.gauntletBar.width = this.gauntletBarW * gFrac;
      this.threatBar.width = this.threatBarW * tFrac;
    } else {
      this.tweens.add({ targets: this.hpBar, width: this.hpBarW * hpFrac, duration: 240, ease: 'Cubic.easeOut' });
      this.tweens.add({ targets: this.gauntletBar, width: this.gauntletBarW * gFrac, duration: 240, ease: 'Cubic.easeOut' });
      this.tweens.add({ targets: this.threatBar, width: this.threatBarW * tFrac, duration: 240 });
    }
    // HP bar colour shifts to red when low.
    this.hpBar.fillColor = hpFrac < 0.3 ? 0xff5a5f : hpFrac < 0.6 ? 0xffb648 : 0x2bbd91;
    void this.hpBarBg;
    void margin;

    this.hpText.setText(`${Math.ceil(st.hp)} / ${st.maxHp}`);
    this.gauntletText.setText(`${Math.ceil(s.gauntletHp)} / ${s.gauntletMaxHp}`);
    this.threatText.setText(`${Math.round(s.threat)}`);
    this.shardsText.setText(`${t('shards')}: ${s.shards}`);
    this.stepText.setText(`${t('step')} ${Math.min(s.step + 1, TOTAL_STEPS)} / ${TOTAL_STEPS}`);

    this.chips.edge.setText(`${t('edge')} ${Math.round(st.edge)}`);
    this.chips.guard.setText(`${t('guard')} ${Math.round(st.guard)}`);
    this.chips.venom.setText(`${t('venom')} ${st.venom}`);
    this.chips.frost.setText(`${t('frost')} ${st.frost}`);
    this.chips.crit.setText(`${t('crit')} ${Math.round(st.crit * 100)}%`);

    reportRunVars({ hp: Math.ceil(st.hp), step: s.step, edge: Math.round(st.edge), guard: Math.round(st.guard), threat: s.threat });
  }

  // ---- card flow ---------------------------------------------------------

  private nextCard(): void {
    const pair = this.engine.pair;
    if (!pair) return;
    this.card = new SwipeCard(
      this,
      this.cardCx,
      this.cardCy,
      this.cardW,
      this.cardH,
      pair,
      (side) => this.onChoose(side),
    );
    this.card.setDepth(50);
    // entrance pop
    this.card.setScale(0.9);
    this.card.setAlpha(0);
    this.tweens.add({ targets: this.card, scale: 1, alpha: 1, duration: 200, ease: 'Back.easeOut' });

    // Keyboard fallback (desktop + gates).
    this.input.keyboard?.once('keydown-LEFT', () => this.card?.commit('left'));
    this.input.keyboard?.once('keydown-RIGHT', () => this.card?.commit('right'));
  }

  private onChoose(side: 'left' | 'right'): void {
    this.card = undefined; // the SwipeCard destroys itself on commit
    if (this.tutorial?.isAlive()) {
      this.tutorial.dismiss();
      this.meta.markTutorialSeen();
    }
    soundKit.swipe(side);
    const ev = this.engine.choose(side);
    this.playResolve(ev);
    this.refreshHud();

    const snap = this.engine.snapshot;
    if (snap.phase !== 'playing') {
      this.time.delayedCall(560, () => this.endRun(snap.phase === 'won'));
    } else {
      this.time.delayedCall(250, () => this.nextCard());
    }
  }

  private playResolve(ev: ResolveEvent): void {
    soundKit.accept();
    // Damage dealt pop (toward gauntlet, top).
    if (ev.dealt > 0) {
      this.popNumber(this.cardCx + 120, 150, `-${ev.dealt}`, ev.crit ? '#ffd27a' : '#ff8a8f', ev.crit ? 30 : 22);
      if (ev.crit) {
        soundKit.crit();
        this.popToast(t('synCrit'), '#ffd27a');
      }
    }
    if (ev.shatter > 0) {
      soundKit.shatter();
      this.popToast(t('synShatter'), '#86eaff');
    }
    // Damage taken pop (toward player, bottom).
    if (ev.taken > 0) {
      soundKit.hit();
      this.popNumber(this.cardCx - 120, this.scale.height - 110, `-${ev.taken}`, '#ff5a5f', 24);
      this.cameras.main.shake(140, 0.006 + Math.min(0.01, ev.taken * 0.0008));
    } else {
      this.popNumber(this.cardCx - 120, this.scale.height - 110, '0', '#7ee7c8', 18);
    }
    // Shards pop.
    this.popNumber(80, 188, `+${ev.shardsGained}`, '#ffd27a', 18);
  }

  private popNumber(x: number, y: number, text: string, color: string, size: number): void {
    const txt = this.add
      .text(x, y, text, { fontFamily: 'Trebuchet MS, Arial, sans-serif', fontSize: `${size}px`, color, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(200);
    this.tweens.add({
      targets: txt,
      y: y - 46,
      alpha: 0,
      duration: 720,
      ease: 'Cubic.easeOut',
      onComplete: () => txt.destroy(),
    });
  }

  private popToast(text: string, color: string): void {
    const txt = this.add
      .text(this.cardCx, this.cardCy - this.cardH * 0.5 - 20, text, {
        fontFamily: 'Trebuchet MS, Arial, sans-serif',
        fontSize: '30px',
        color,
        fontStyle: 'bold',
        stroke: '#06121a',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(220)
      .setScale(0.6);
    this.tweens.add({ targets: txt, scale: 1.1, duration: 180, yoyo: true });
    this.tweens.add({ targets: txt, alpha: 0, delay: 420, duration: 320, onComplete: () => txt.destroy() });
  }

  // ---- run end -----------------------------------------------------------

  private endRun(won: boolean): void {
    if (this.finished) return;
    this.finished = true;
    const snap = this.engine.snapshot;
    const earned = this.engine.finalShards();
    const steps = snap.step;

    // Which cards newly unlock with this run's earnings?
    const before = offersUnlocked(this.lifetimeBefore).map((o) => o.id);
    const after = offersUnlocked(this.lifetimeBefore + earned).map((o) => o.id);
    const newlyUnlocked = after.filter((id) => !before.includes(id));

    this.meta.recordRun(earned, steps, newlyUnlocked);

    setFlowState(won ? 'WIN' : 'GAMEOVER');
    eventBus.emit(GameEvents.RunStateChanged, { phase: won ? 'won' : 'lost' });
    eventBus.emit(GameEvents.ScoreChanged, { score: this.meta.value.lifetimeShards, bestScore: this.meta.value.lifetimeShards });
    gameplayStop();

    if (won) soundKit.win();
    else soundKit.lose();
    if (newlyUnlocked.length > 0) this.time.delayedCall(700, () => soundKit.unlockChime());

    this.showSummary(won, earned, steps, newlyUnlocked);
  }

  private showSummary(won: boolean, earned: number, steps: number, newlyUnlocked: string[]): void {
    setCurrentScreen('over');
    const { width, height } = this.scale;
    const cx = width / 2;
    this.overReach = [];

    const scrim = this.add.rectangle(cx, height / 2, width, height, 0x05070c, 0.78).setDepth(300);
    void scrim;
    const panelW = Math.min(width - 64, 600);
    const panelH = 560;
    const panelY = height / 2;
    this.add.rectangle(cx, panelY, panelW, panelH, 0x121a28, 0.99).setStrokeStyle(3, won ? 0x2bbd91 : 0xff5a5f, 1).setDepth(301);

    this.add
      .text(cx, panelY - panelH / 2 + 56, won ? t('cleared') : t('fallen'), {
        fontFamily: 'Trebuchet MS, Arial, sans-serif',
        fontSize: '36px',
        color: won ? '#7ee7c8' : '#ff8a8f',
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: panelW - 60 },
      })
      .setOrigin(0.5)
      .setDepth(302);

    this.add
      .text(cx, panelY - panelH / 2 + 120, `${t('stepsSurvived')}: ${steps} / ${TOTAL_STEPS}`, {
        fontFamily: 'Trebuchet MS, Arial, sans-serif',
        fontSize: '22px',
        color: '#d8e2f8',
      })
      .setOrigin(0.5)
      .setDepth(302);

    this.add
      .text(cx, panelY - panelH / 2 + 162, `${t('shardsEarned')}: +${earned}`, {
        fontFamily: 'Trebuchet MS, Arial, sans-serif',
        fontSize: '26px',
        color: '#ffd27a',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(302);

    // Newly unlocked banner.
    let y = panelY - panelH / 2 + 220;
    if (newlyUnlocked.length > 0) {
      this.add
        .text(cx, y, t('unlocked'), { fontFamily: 'Trebuchet MS, Arial, sans-serif', fontSize: '20px', color: '#86eaff', fontStyle: 'bold' })
        .setOrigin(0.5)
        .setDepth(302);
      y += 34;
      for (const id of newlyUnlocked.slice(0, 3)) {
        this.add
          .text(cx, y, t(`cardName_${id}`), { fontFamily: 'Trebuchet MS, Arial, sans-serif', fontSize: '19px', color: '#ffffff' })
          .setOrigin(0.5)
          .setDepth(302);
        y += 30;
      }
      y += 6;
    }

    // Next-unlock progress (the hook).
    const life = this.meta.value.lifetimeShards;
    const nxt = nextUnlock(life);
    const barW = panelW - 100;
    const barX = cx - barW / 2;
    const barY = Math.max(y + 18, panelY + panelH / 2 - 150);
    if (nxt) {
      this.add
        .text(cx, barY - 26, `${t('nextUnlock')}: ${t(nxt.nameKey)}`, {
          fontFamily: 'Trebuchet MS, Arial, sans-serif',
          fontSize: '18px',
          color: '#7ee7c8',
        })
        .setOrigin(0.5)
        .setDepth(302);
      this.add.rectangle(cx, barY, barW, 18, 0x0c1320, 1).setStrokeStyle(1, 0x2e486e, 0.8).setDepth(302);
      const prevAt = this.prevUnlockAt(nxt.at);
      const frac = Phaser.Math.Clamp((life - prevAt) / Math.max(1, nxt.at - prevAt), 0, 1);
      this.add.rectangle(barX, barY, barW * frac, 18, 0x53d6e6, 1).setOrigin(0, 0.5).setDepth(303);
      this.add
        .text(cx, barY + 26, `${life} / ${nxt.at}`, { fontFamily: 'Trebuchet MS, Arial, sans-serif', fontSize: '15px', color: '#9fd0ff' })
        .setOrigin(0.5)
        .setDepth(302);
    } else {
      this.add
        .text(cx, barY, t('allUnlocked'), { fontFamily: 'Trebuchet MS, Arial, sans-serif', fontSize: '18px', color: '#7ee7c8' })
        .setOrigin(0.5)
        .setDepth(302);
    }

    // Buttons: PLAY AGAIN + Menu.
    const byBtn = panelY + panelH / 2 - 70;
    const againW = panelW - 180;
    const again = this.add.rectangle(cx - 70, byBtn, againW, 64, 0x2bbd91, 1).setStrokeStyle(2, 0x7ee7c8, 1).setDepth(302).setInteractive({ useHandCursor: true });
    this.add.text(cx - 70, byBtn, t('playAgain'), { fontFamily: 'Trebuchet MS, Arial, sans-serif', fontSize: '24px', color: '#06231a', fontStyle: 'bold' }).setOrigin(0.5).setDepth(303);
    again.on('pointerup', () => this.restartRun());
    this.overReach.push({ id: 'again', x: cx - 70 - againW / 2, y: byBtn - 32, w: againW, h: 64, pinned: true });

    const menuW = 120;
    const menuX = cx + panelW / 2 - 80;
    const menuBtn = this.add.rectangle(menuX, byBtn, menuW, 64, 0x1c2738, 1).setStrokeStyle(2, 0x2e486e, 1).setDepth(302).setInteractive({ useHandCursor: true });
    this.add.text(menuX, byBtn, t('backToMenu'), { fontFamily: 'Trebuchet MS, Arial, sans-serif', fontSize: '18px', color: '#9fd0ff' }).setOrigin(0.5).setDepth(303);
    menuBtn.on('pointerup', () => this.backToMenu());
    this.overReach.push({ id: 'menu', x: menuX - menuW / 2, y: byBtn - 32, w: menuW, h: 64, pinned: true });

    this.input.keyboard?.once('keydown-ENTER', () => this.restartRun());
    this.input.keyboard?.once('keydown-SPACE', () => this.restartRun());

    registerReachProvider('over', () => ({
      screen: 'over',
      viewportH: this.scale.height,
      viewportW: this.scale.width,
      screenH: this.scale.height,
      scrollMaxY: 0,
      items: this.overReach,
    }));
  }

  private prevUnlockAt(target: number): number {
    let prev = 0;
    for (const u of nextUnlockList()) {
      if (u >= target) break;
      prev = u;
    }
    return prev;
  }

  // ---- tutorial ----------------------------------------------------------

  private showTutorial(): void {
    // Never show on a finished/abandoned run or a staged screenshot frame - the
    // delayed demoNudge would fire on a destroyed card (scene undefined).
    if (this.finished || this.transitioningOut) return;
    if (!this.card || this.card.isCommitted()) return;
    if (this.tutorial?.isAlive()) return;
    this.tutorial = new TutorialHand(this, this.cardCx, this.cardCy, Math.min(this.cardW, this.cardH));
    this.card.demoNudge('right');
    this.time.delayedCall(1500, () => {
      if (this.finished || this.transitioningOut) return;
      if (this.card && !this.card.isCommitted()) this.card.demoNudge('left');
    });
  }

  // ---- transitions / gate hooks -----------------------------------------

  private restartRun(): void {
    if (this.transitioningOut) return;
    this.transitioningOut = true;
    // Phaser tears down in-flight tweens/timers on restart; don't killAll here
    // (a second pointerup mid-restart would hit an undefined tween manager).
    this.scene.restart({ jumpToOver: false });
  }

  private backToMenu(): void {
    if (this.transitioningOut) return;
    this.transitioningOut = true;
    startSceneWithFade(this, SceneKeys.TemplateGuide, { durationMs: 200 });
  }

  private forceGameOver(): void {
    if (this.finished) return;
    // Force a deterministic GAMEOVER terminal for the gate (the yandex-testing
    // state-cycle check needs a reliable menu-button screen, and a real loss is
    // the canonical one). This is a TEST HOOK, not gameplay: it ends the current
    // run as a loss outright rather than playing cards out - so it is independent
    // of the balance numbers (the old "choose left until terminal" was a coin-
    // flip that started landing on WIN once a balance pass made the game more
    // winnable, which the gate's MENU_LIKE list does not accept).
    this.card?.destroy();
    this.card = undefined;
    this.refreshHud(true);
    this.endRun(false);
  }

  private registerHooks(): void {
    // While a run is live, _jumpLevel re-targets the LIVE run: (toOver) forces a
    // terminal state; otherwise restart a fresh run. (The menu registers the
    // boot-from-menu launcher; GameScene overrides it for the in-run case.)
    registerMenuLauncher((toOver?: boolean) => {
      if (toOver) this.forceGameOver();
      else this.scene.restart({ jumpToOver: false });
    });
    registerForceOver(() => this.forceGameOver());
    registerScreenshotStager(() => this.stageForScreenshot());
    registerRestartActive(() => this.scene.restart({ jumpToOver: false }));
    registerReachProvider('run', () => ({
      screen: 'run',
      viewportH: this.scale.height,
      viewportW: this.scale.width,
      screenH: this.scale.height,
      scrollMaxY: 0,
      items: this.runReach,
    }));
  }

  /** Advance a few picks so screenshots show a dense, evolved build (PLAYING). */
  private stageForScreenshot(): void {
    if (this.finished) return;
    if (this.tutorial?.isAlive()) {
      this.tutorial.dismiss();
      this.meta.markTutorialSeen();
    }
    // Apply ~6 picks without ending the run.
    let n = 0;
    while (this.engine.snapshot.phase === 'playing' && n < 6 && this.engine.snapshot.step < 6) {
      this.engine.choose(n % 2 === 0 ? 'right' : 'left');
      n += 1;
    }
    if (this.engine.snapshot.phase === 'playing') {
      this.card?.destroy();
      this.card = undefined;
      this.refreshHud(true);
      this.nextCard();
    }
  }

  // ---- lifecycle ---------------------------------------------------------

  shutdown(): void {
    gameplayStop();
    // Phaser tears down this scene's tweens/timers on shutdown automatically;
    // calling this.tweens.killAll() here races that teardown (this.tweens can
    // already be undefined) and threw mid-restart.
  }

  private drawBackground(width: number, height: number): void {
    this.add.rectangle(width / 2, height / 2, width, height, 0x0b0f17);
    const g = this.add.graphics();
    g.lineStyle(1, 0x16212f, 0.4);
    for (let x = 0; x <= width; x += 56) g.lineBetween(x, 0, x, height);
    for (let y = 0; y <= height; y += 56) g.lineBetween(0, y, width, y);
    g.fillStyle(0xff5a5f, 0.04);
    g.fillCircle(width * 0.5, height * 0.16, 240);
    g.fillStyle(0x2bbd91, 0.04);
    g.fillCircle(width * 0.5, height * 0.86, 240);
  }
}

// Helper: the sorted unlock thresholds (kept out of the class for the
// prevUnlockAt lookup). Imported lazily to avoid a circular type.
import { CARD_UNLOCKS } from '../game/cards';
function nextUnlockList(): number[] {
  return CARD_UNLOCKS.map((u) => u.at);
}
