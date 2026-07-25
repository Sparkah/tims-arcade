export type RunPhase = 'ready' | 'playing' | 'won' | 'lost';

export type GameStateSnapshot = {
  phase: RunPhase;
  score: number;
  bestScore: number;
  elapsedMs: number;
};

export type ScoreUpdate = {
  score: number;
  bestScore: number;
  bestChanged: boolean;
};

export class GameState {
  private snapshot: GameStateSnapshot;

  constructor(bestScore = 0) {
    this.snapshot = {
      phase: 'ready',
      score: 0,
      bestScore,
      elapsedMs: 0,
    };
  }

  get value(): GameStateSnapshot {
    return { ...this.snapshot };
  }

  start(): GameStateSnapshot {
    this.snapshot = {
      ...this.snapshot,
      phase: 'playing',
      score: 0,
      elapsedMs: 0,
    };

    return this.value;
  }

  update(deltaMs: number): void {
    if (this.snapshot.phase === 'playing') {
      this.snapshot.elapsedMs += deltaMs;
    }
  }

  addScore(amount: number): ScoreUpdate {
    this.snapshot.score += amount;

    const previousBest = this.snapshot.bestScore;
    this.snapshot.bestScore = Math.max(this.snapshot.bestScore, this.snapshot.score);

    return {
      score: this.snapshot.score,
      bestScore: this.snapshot.bestScore,
      bestChanged: this.snapshot.bestScore !== previousBest,
    };
  }

  finish(phase: Extract<RunPhase, 'won' | 'lost'>): GameStateSnapshot {
    this.snapshot.phase = phase;
    return this.value;
  }

  stop(): GameStateSnapshot {
    this.snapshot.phase = 'ready';
    return this.value;
  }
}
