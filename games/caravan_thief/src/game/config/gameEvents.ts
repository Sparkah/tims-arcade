export const GameEvents = {
  ScoreChanged: 'score-changed',
  StatusChanged: 'status-changed',
  BestScoreChanged: 'best-score-changed',
  RunStateChanged: 'run-state-changed',
  GameplayStarted: 'gameplay-started',
  GameplayStopped: 'gameplay-stopped',
} as const;

export type GameEvent = (typeof GameEvents)[keyof typeof GameEvents];

export type GameEventPayloads = {
  [GameEvents.ScoreChanged]: { score: number; bestScore: number };
  [GameEvents.StatusChanged]: { status: string };
  [GameEvents.BestScoreChanged]: { bestScore: number };
  [GameEvents.RunStateChanged]: { phase: 'ready' | 'playing' | 'won' | 'lost' };
  [GameEvents.GameplayStarted]: { scene: string };
  [GameEvents.GameplayStopped]: { scene: string };
};
