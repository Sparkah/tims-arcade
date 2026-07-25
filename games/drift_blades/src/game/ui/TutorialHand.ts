// TutorialHand - an animated vector hand that performs the swipe gesture, so
// the player learns the control by SEEING it (Tim's tutorial UX rule: animated
// demo hand + a slim caption pill + light scrim). Shown on the FIRST run only;
// dismisses on the first real swipe. Re-openable via the in-run ? button.

import Phaser from 'phaser';
import { t } from '../i18n';

export class TutorialHand {
  private scene: Phaser.Scene;
  private layer: Phaser.GameObjects.Container;
  private hand!: Phaser.GameObjects.Container;
  private caption!: Phaser.GameObjects.Container;
  private scrim!: Phaser.GameObjects.Rectangle;
  private loop?: Phaser.Tweens.Tween;
  private alive = true;
  private cardX: number;
  private cardY: number;
  private span: number;

  constructor(scene: Phaser.Scene, cardX: number, cardY: number, span: number) {
    this.scene = scene;
    this.cardX = cardX;
    this.cardY = cardY;
    this.span = span;
    this.layer = scene.add.container(0, 0).setDepth(9000);
    this.build();
  }

  private build(): void {
    const { width, height } = this.scene.scale;
    this.scrim = this.scene.add.rectangle(width / 2, height / 2, width, height, 0x05070c, 0.42);
    this.layer.add(this.scrim);

    // Caption pill near the top of the card.
    this.caption = this.makeCaption(t('tutSwipe'), this.cardX, this.cardY - this.span * 0.5 - 70);
    this.layer.add(this.caption);

    // The hand.
    this.hand = this.makeHand();
    this.hand.setPosition(this.cardX, this.cardY + 40);
    this.layer.add(this.hand);

    this.startLoop();
  }

  private makeCaption(text: string, x: number, y: number): Phaser.GameObjects.Container {
    const c = this.scene.add.container(x, y);
    const label = this.scene.add
      .text(0, 0, text, {
        fontFamily: 'Trebuchet MS, Arial, sans-serif',
        fontSize: '19px',
        color: '#0c1017',
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: 320 },
      })
      .setOrigin(0.5);
    const padX = 22;
    const padY = 12;
    const pill = this.scene.add
      .rectangle(0, 0, label.width + padX * 2, label.height + padY * 2, 0xffd27a, 0.97)
      .setOrigin(0.5);
    pill.setStrokeStyle(2, 0xffffff, 0.8);
    c.add(pill);
    c.add(label);
    return c;
  }

  private makeHand(): Phaser.GameObjects.Container {
    const c = this.scene.add.container(0, 0);
    const g = this.scene.add.graphics();
    // Simple pointing-hand silhouette.
    g.fillStyle(0xfdfdfd, 1);
    g.lineStyle(2, 0x223047, 1);
    // palm
    g.fillRoundedRect(-16, 0, 32, 40, 12);
    g.strokeRoundedRect(-16, 0, 32, 40, 12);
    // index finger up
    g.fillRoundedRect(-6, -26, 12, 30, 6);
    g.strokeRoundedRect(-6, -26, 12, 30, 6);
    // little cuff
    g.fillStyle(0x53d6e6, 1);
    g.fillRoundedRect(-18, 36, 36, 10, 5);
    c.add(g);
    // tap-ring
    const ring = this.scene.add.circle(0, -22, 16, 0xffffff, 0).setStrokeStyle(3, 0x53d6e6, 0.9);
    c.add(ring);
    this.scene.tweens.add({
      targets: ring,
      scale: { from: 0.7, to: 1.4 },
      alpha: { from: 0.9, to: 0 },
      duration: 900,
      repeat: -1,
    });
    return c;
  }

  private startLoop(): void {
    // Sweep right of centre, back through centre to left, and repeat - showing
    // that BOTH directions are valid choices. A single tween across the full
    // span (left..right) with yoyo gives the back-and-forth without poking at
    // tween internals.
    const amp = this.span * 0.34;
    this.hand.x = this.cardX - amp;
    this.loop = this.scene.tweens.add({
      targets: this.hand,
      x: this.cardX + amp,
      duration: 1100,
      ease: 'Sine.easeInOut',
      yoyo: true,
      hold: 140,
      repeatDelay: 140,
      repeat: -1,
    });
  }

  dismiss(): void {
    if (!this.alive) return;
    this.alive = false;
    this.loop?.stop();
    this.scene.tweens.add({
      targets: this.layer,
      alpha: 0,
      duration: 220,
      onComplete: () => this.layer.destroy(),
    });
  }

  isAlive(): boolean {
    return this.alive;
  }
}
