import Phaser from 'phaser';
import { GameEvents } from '../config/gameEvents';
import { SceneKeys } from '../config/sceneKeys';
import { eventBus } from '../events/EventBus';

type UIData = {
  title: string;
  status: string;
  score: number;
  bestScore: number;
  phase: 'ready' | 'playing' | 'won' | 'lost';
};

export class UIScene extends Phaser.Scene {
  private statusText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private bestScoreText!: Phaser.GameObjects.Text;
  private phaseText!: Phaser.GameObjects.Text;

  constructor() {
    super(SceneKeys.UI);
  }

  create(data: UIData): void {
    this.add
      .text(24, 20, data.title, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '22px',
        color: '#ffffff',
      })
      .setScrollFactor(0);

    this.statusText = this.add
      .text(24, 50, data.status, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '16px',
        color: '#9fb2d8',
      })
      .setScrollFactor(0);

    this.scoreText = this.add
      .text(24, 78, `Score: ${data.score}`, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '16px',
        color: '#7ee7c8',
      })
      .setScrollFactor(0);

    this.bestScoreText = this.add
      .text(24, 106, `Best: ${data.bestScore}`, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '16px',
        color: '#ffc857',
      })
      .setScrollFactor(0);

    this.phaseText = this.add
      .text(24, 134, `State: ${data.phase}`, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '16px',
        color: '#c4d3f1',
      })
      .setScrollFactor(0);

    eventBus.on(GameEvents.ScoreChanged, this.handleScoreChanged, this);
    eventBus.on(GameEvents.BestScoreChanged, this.handleBestScoreChanged, this);
    eventBus.on(GameEvents.RunStateChanged, this.handleRunStateChanged, this);
    eventBus.on(GameEvents.StatusChanged, this.handleStatusChanged, this);
    eventBus.on(GameEvents.GameplayStopped, this.handleGameplayStopped, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.removeEventListeners());
  }

  private handleScoreChanged(payload: { score: number; bestScore: number }): void {
    this.scoreText.setText(`Score: ${payload.score}`);
    this.bestScoreText.setText(`Best: ${payload.bestScore}`);
  }

  private handleBestScoreChanged(payload: { bestScore: number }): void {
    this.bestScoreText.setText(`Best: ${payload.bestScore}`);
  }

  private handleRunStateChanged(payload: { phase: 'ready' | 'playing' | 'won' | 'lost' }): void {
    this.phaseText.setText(`State: ${payload.phase}`);
  }

  private handleStatusChanged(payload: { status: string }): void {
    this.statusText.setText(payload.status);
  }

  private handleGameplayStopped(): void {
    this.removeEventListeners();
  }

  private removeEventListeners(): void {
    eventBus.off(GameEvents.ScoreChanged, this.handleScoreChanged, this);
    eventBus.off(GameEvents.BestScoreChanged, this.handleBestScoreChanged, this);
    eventBus.off(GameEvents.RunStateChanged, this.handleRunStateChanged, this);
    eventBus.off(GameEvents.StatusChanged, this.handleStatusChanged, this);
    eventBus.off(GameEvents.GameplayStopped, this.handleGameplayStopped, this);
  }
}
