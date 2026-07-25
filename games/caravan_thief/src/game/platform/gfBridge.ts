// Factory bridge - Tim's pipeline contract. The gates (post-build-tester,
// yandex-testing, take_screenshots, webapp_gate) read these globals:
//
//   window.gs         'BOOT' until the menu scene is interactive, then
//                     'MENU' | 'PLAYING' | 'GAMEOVER' | 'WIN'. Honest boot
//                     state: a gate that clicks PLAY during preload must see
//                     BOOT, never a false MENU.
//   window.__gfState  () => ({ gs, score, bestScore, ...registered vars }).
//                     score/bestScore mirror the EventBus automatically;
//                     register every DESIGN.md progression var (wave, level,
//                     hp, ...) with registerStateVar().
//
// Keep this module imported from src/main.ts. Call setFlowState() from any
// scene you add or replace.
import { GameEvents } from '../config/gameEvents';
import { eventBus } from '../events/EventBus';

export type FlowState = 'BOOT' | 'MENU' | 'PLAYING' | 'GAMEOVER' | 'WIN';

type StateGetter = () => unknown;

declare global {
  interface Window {
    gs?: string;
    __gfState?: () => Record<string, unknown>;
  }
}

let flowState: FlowState = 'BOOT';
let score = 0;
let bestScore = 0;
const extraVars = new Map<string, StateGetter>();

export function setFlowState(state: FlowState): void {
  flowState = state;
  window.gs = state;
}

export function getFlowState(): FlowState {
  return flowState;
}

export function registerStateVar(name: string, getter: StateGetter): void {
  extraVars.set(name, getter);
}

function snapshot(): Record<string, unknown> {
  const out: Record<string, unknown> = { gs: flowState, score, bestScore };
  for (const [name, getter] of extraVars) {
    try {
      out[name] = getter();
    } catch {
      out[name] = undefined;
    }
  }
  return out;
}

window.gs = flowState;
window.__gfState = snapshot;

// Mirror the template events so the progression gate sees real numbers with
// zero per-game wiring. Scenes that bypass the EventBus must call
// setFlowState()/registerStateVar() directly.
eventBus.on(GameEvents.ScoreChanged, (payload) => {
  score = payload.score;
  bestScore = payload.bestScore;
});
eventBus.on(GameEvents.BestScoreChanged, (payload) => {
  bestScore = payload.bestScore;
});
eventBus.on(GameEvents.GameplayStarted, () => {
  setFlowState('PLAYING');
});
eventBus.on(GameEvents.GameplayStopped, () => {
  if (flowState === 'PLAYING') {
    setFlowState('MENU');
  }
});
eventBus.on(GameEvents.RunStateChanged, (payload) => {
  if (payload.phase === 'won') {
    setFlowState('WIN');
  } else if (payload.phase === 'lost') {
    setFlowState('GAMEOVER');
  } else if (payload.phase === 'playing') {
    setFlowState('PLAYING');
  }
});
