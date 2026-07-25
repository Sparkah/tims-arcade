// SwipeCard - the tactile swipe-to-choose card. THE input of Drift Blades.
//
// Renders one card holding TWO offers (left + right). Pointer/touch drag tilts
// the card toward the drag direction and brightens that side's panel; releasing
// past a threshold (or a fast flick) commits that side. Below-threshold release
// snaps back to centre. Keyboard Left/Right also commit (desktop + gates).

import Phaser from 'phaser';
import type { Offer, CardTag } from '../game/cards';
import { t } from '../i18n';

const ARCHETYPE_TINT: Record<CardTag, number> = {
  edge: 0xff5a5f,
  guard: 0x4fa3ff,
  venom: 0x77dd55,
  frost: 0x66e0ff,
  greed: 0xffcc44,
  berserk: 0xff7a33,
};

const LEFT_ACCENT = 0xffb648; // amber
const RIGHT_ACCENT = 0x53d6e6; // cyan

export class SwipeCard extends Phaser.GameObjects.Container {
  private cardW: number;
  private cardH: number;
  private bg!: Phaser.GameObjects.Rectangle;
  private leftPanel!: Phaser.GameObjects.Rectangle;
  private rightPanel!: Phaser.GameObjects.Rectangle;
  private leftGlow!: Phaser.GameObjects.Rectangle;
  private rightGlow!: Phaser.GameObjects.Rectangle;
  private hitZone!: Phaser.GameObjects.Rectangle;
  private dragging = false;
  private dragStartX = 0;
  private homeX: number;
  private homeY: number;
  private committed = false;
  private threshold: number;
  private onCommit: (side: 'left' | 'right') => void;
  private onDragMoved: (dx: number) => void;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    w: number,
    h: number,
    pair: [Offer, Offer],
    onCommit: (side: 'left' | 'right') => void,
    onDragMoved: (dx: number) => void = () => undefined,
  ) {
    super(scene, x, y);
    this.cardW = w;
    this.cardH = h;
    this.homeX = x;
    this.homeY = y;
    this.threshold = w * 0.22;
    this.onCommit = onCommit;
    this.onDragMoved = onDragMoved;
    this.build(pair);
    scene.add.existing(this);
  }

  private build(pair: [Offer, Offer]): void {
    const w = this.cardW;
    const h = this.cardH;
    const r = 22;

    // Card shell.
    this.bg = this.scene.add.rectangle(0, 0, w, h, 0x1a2030, 1);
    this.bg.setStrokeStyle(3, 0x3a4b66, 1);
    this.add(this.bg);

    // Two halves, archetype-tinted.
    const halfW = w / 2 - 8;
    const [L, R] = pair;
    this.leftGlow = this.scene.add.rectangle(-w / 4, 0, halfW + 16, h - 16, LEFT_ACCENT, 0).setOrigin(0.5);
    this.rightGlow = this.scene.add.rectangle(w / 4, 0, halfW + 16, h - 16, RIGHT_ACCENT, 0).setOrigin(0.5);
    this.add(this.leftGlow);
    this.add(this.rightGlow);

    this.leftPanel = this.scene.add.rectangle(-w / 4, 0, halfW, h - 28, ARCHETYPE_TINT[L.archetype], 0.16).setOrigin(0.5);
    this.leftPanel.setStrokeStyle(2, ARCHETYPE_TINT[L.archetype], 0.6);
    this.rightPanel = this.scene.add.rectangle(w / 4, 0, halfW, h - 28, ARCHETYPE_TINT[R.archetype], 0.16).setOrigin(0.5);
    this.rightPanel.setStrokeStyle(2, ARCHETYPE_TINT[R.archetype], 0.6);
    this.add(this.leftPanel);
    this.add(this.rightPanel);

    // Centre divider.
    const divider = this.scene.add.rectangle(0, 0, 3, h - 40, 0x2a3450, 1);
    this.add(divider);

    this.addOfferText(L, -w / 4, LEFT_ACCENT);
    this.addOfferText(R, w / 4, RIGHT_ACCENT);

    // Side hint labels at the bottom.
    const lh = this.scene.add
      .text(-w / 4, h / 2 - 30, '< ' + t('swipeLeft'), {
        fontFamily: 'Trebuchet MS, Arial, sans-serif',
        fontSize: '16px',
        color: '#ffb648',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    const rh = this.scene.add
      .text(w / 4, h / 2 - 30, t('swipeRight') + ' >', {
        fontFamily: 'Trebuchet MS, Arial, sans-serif',
        fontSize: '16px',
        color: '#53d6e6',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.add(lh);
    this.add(rh);

    // Drag hit zone over the whole card.
    this.hitZone = this.scene.add.rectangle(0, 0, w, h, 0xffffff, 0.001).setOrigin(0.5);
    this.hitZone.setInteractive({ useHandCursor: true });
    this.add(this.hitZone);
    void r;
    this.wireDrag();
  }

  private addOfferText(o: Offer, cx: number, accent: number): void {
    const half = this.cardW / 2 - 24;
    // Archetype emblem drawn as a shape (no canvas emoji - Yandex hygiene).
    const emblem = this.makeEmblem(o.archetype, cx, -this.cardH / 2 + 46, 16);
    this.add(emblem);

    const name = this.scene.add
      .text(cx, -this.cardH / 2 + 96, t(o.nameKey), {
        fontFamily: 'Trebuchet MS, Arial, sans-serif',
        fontSize: '21px',
        color: '#ffffff',
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: half },
      })
      .setOrigin(0.5, 0);
    this.add(name);

    const desc = this.scene.add
      .text(cx, 4, t(o.descKey), {
        fontFamily: 'Trebuchet MS, Arial, sans-serif',
        fontSize: '18px',
        color: '#d8e2f8',
        align: 'center',
        lineSpacing: 6,
        wordWrap: { width: half },
      })
      .setOrigin(0.5);
    this.add(desc);
    void accent;
  }

  private makeEmblem(a: CardTag, cx: number, cy: number, rad: number): Phaser.GameObjects.Graphics {
    const color = ARCHETYPE_TINT[a];
    const g = this.scene.add.graphics();
    g.setPosition(cx, cy);
    g.lineStyle(3, color, 1);
    g.fillStyle(color, 0.9);
    switch (a) {
      case 'edge': {
        // upward blade (triangle + hilt)
        g.beginPath();
        g.moveTo(0, -rad);
        g.lineTo(rad * 0.5, rad);
        g.lineTo(-rad * 0.5, rad);
        g.closePath();
        g.fillPath();
        g.lineBetween(-rad * 0.8, rad * 0.4, rad * 0.8, rad * 0.4);
        break;
      }
      case 'guard': {
        // shield
        g.beginPath();
        g.moveTo(0, -rad);
        g.lineTo(rad, -rad * 0.4);
        g.lineTo(rad * 0.7, rad);
        g.lineTo(0, rad * 0.5);
        g.lineTo(-rad * 0.7, rad);
        g.lineTo(-rad, -rad * 0.4);
        g.closePath();
        g.fillPath();
        break;
      }
      case 'venom': {
        // droplet
        g.beginPath();
        g.moveTo(0, -rad);
        g.lineTo(rad * 0.8, rad * 0.4);
        g.arc(0, rad * 0.4, rad * 0.8, 0, Math.PI, false);
        g.lineTo(0, -rad);
        g.closePath();
        g.fillPath();
        break;
      }
      case 'frost': {
        // 6-spoke snowflake
        for (let i = 0; i < 6; i++) {
          const ang = (Math.PI / 3) * i;
          g.lineBetween(0, 0, Math.cos(ang) * rad, Math.sin(ang) * rad);
        }
        break;
      }
      case 'greed': {
        // diamond outline + dot
        g.beginPath();
        g.moveTo(0, -rad);
        g.lineTo(rad, 0);
        g.lineTo(0, rad);
        g.lineTo(-rad, 0);
        g.closePath();
        g.strokePath();
        g.fillCircle(0, 0, rad * 0.35);
        break;
      }
      case 'berserk': {
        // jagged star
        g.beginPath();
        for (let i = 0; i < 8; i++) {
          const ang = (Math.PI / 4) * i - Math.PI / 2;
          const rr = i % 2 === 0 ? rad : rad * 0.45;
          const px = Math.cos(ang) * rr;
          const py = Math.sin(ang) * rr;
          if (i === 0) g.moveTo(px, py);
          else g.lineTo(px, py);
        }
        g.closePath();
        g.fillPath();
        break;
      }
      default:
        g.fillCircle(0, 0, rad);
    }
    return g;
  }

  private wireDrag(): void {
    this.hitZone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.committed) return;
      this.dragging = true;
      this.dragStartX = p.x;
    });
    this.scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.dragging || this.committed) return;
      const dx = p.x - this.dragStartX;
      this.applyDrag(dx);
      this.onDragMoved(dx);
    });
    const release = (p: Phaser.Input.Pointer) => {
      if (!this.dragging || this.committed) return;
      this.dragging = false;
      const dx = p.x - this.dragStartX;
      this.endDrag(dx);
    };
    this.scene.input.on('pointerup', release);
    this.scene.input.on('pointerupoutside', release);
  }

  private applyDrag(dx: number): void {
    this.x = this.homeX + dx;
    this.rotation = Phaser.Math.Clamp(dx / (this.cardW * 1.6), -0.18, 0.18);
    const f = Phaser.Math.Clamp(Math.abs(dx) / this.threshold, 0, 1);
    if (dx < 0) {
      this.leftGlow.setAlpha(0.18 + f * 0.4);
      this.rightGlow.setAlpha(0);
    } else if (dx > 0) {
      this.rightGlow.setAlpha(0.18 + f * 0.4);
      this.leftGlow.setAlpha(0);
    } else {
      this.leftGlow.setAlpha(0);
      this.rightGlow.setAlpha(0);
    }
  }

  private endDrag(dx: number): void {
    if (Math.abs(dx) >= this.threshold) {
      this.commit(dx < 0 ? 'left' : 'right');
    } else {
      this.snapBack();
    }
  }

  private snapBack(): void {
    this.scene.tweens.add({
      targets: this,
      x: this.homeX,
      rotation: 0,
      duration: 180,
      ease: 'Back.easeOut',
    });
    this.scene.tweens.add({ targets: [this.leftGlow, this.rightGlow], alpha: 0, duration: 160 });
  }

  /** Programmatic commit (keyboard / gate). */
  commit(side: 'left' | 'right'): void {
    if (this.committed) return;
    this.committed = true;
    this.dragging = false;
    const dir = side === 'left' ? -1 : 1;
    const glow = side === 'left' ? this.leftGlow : this.rightGlow;
    glow.setAlpha(0.55);
    this.scene.tweens.add({
      targets: this,
      x: this.homeX + dir * this.cardW * 1.3,
      rotation: dir * 0.4,
      alpha: 0,
      duration: 230,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        this.onCommit(side);
        this.destroy();
      },
    });
  }

  /** Animate a demo nudge toward a side (tutorial hand), then snap back. */
  demoNudge(side: 'left' | 'right', amount = 0.7): void {
    // Guard against a destroyed card (scene torn down): a queued tutorial
    // callback could otherwise touch this.scene.tweens after destroy().
    if (this.committed || !this.scene || !this.active) return;
    const dir = side === 'left' ? -1 : 1;
    const dx = dir * this.threshold * amount;
    this.scene.tweens.add({
      targets: this,
      x: this.homeX + dx,
      rotation: dir * 0.1,
      duration: 320,
      yoyo: true,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        const cur = this.x - this.homeX;
        const f = Phaser.Math.Clamp(Math.abs(cur) / this.threshold, 0, 1);
        if (cur < 0) {
          this.leftGlow.setAlpha(0.18 + f * 0.3);
          this.rightGlow.setAlpha(0);
        } else {
          this.rightGlow.setAlpha(0.18 + f * 0.3);
          this.leftGlow.setAlpha(0);
        }
      },
      onComplete: () => {
        this.leftGlow.setAlpha(0);
        this.rightGlow.setAlpha(0);
      },
    });
  }

  isCommitted(): boolean {
    return this.committed;
  }
}
