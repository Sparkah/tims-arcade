// MetaStore - the persistent retention layer for Drift Blades.
//
// Wraps the scaffold SaveManager (localStorage) with the meta state the game
// actually cares about: lifetime Shards (the unlock currency), best run, the
// set of explicitly-acknowledged unlocks, whether the tutorial has been seen,
// and the mute preference. Survives reloads.

import { SaveManager, type SaveData } from './SaveManager';

export interface MetaState {
  lifetimeShards: number;
  bestSteps: number;
  bestShards: number;
  runs: number;
  seenUnlocks: string[]; // offer ids the player has already been shown as "NEW"
  tutorialSeen: boolean;
  muted: boolean;
}

interface MetaBlob extends SaveData {
  meta?: MetaState;
}

const defaultMeta: MetaState = {
  lifetimeShards: 0,
  bestSteps: 0,
  bestShards: 0,
  runs: 0,
  seenUnlocks: [],
  tutorialSeen: false,
  muted: false,
};

export class MetaStore {
  private mgr = new SaveManager('drift_blades');
  private state: MetaState;
  private base: SaveData;

  constructor() {
    this.base = this.mgr.load();
    const blob = this.base as MetaBlob;
    this.state = { ...defaultMeta, ...(blob.meta ?? {}) };
    // bestScore mirrors lifetimeShards for the scaffold's score plumbing.
    if (typeof this.base.bestScore === 'number' && this.base.bestScore > this.state.lifetimeShards) {
      this.state.lifetimeShards = this.base.bestScore;
    }
  }

  get value(): MetaState {
    return { ...this.state, seenUnlocks: [...this.state.seenUnlocks] };
  }

  private persist(): void {
    const blob: MetaBlob = {
      ...this.base,
      bestScore: this.state.lifetimeShards,
      meta: this.state,
    };
    this.base = blob;
    this.mgr.save(blob);
  }

  /** Record the result of a finished run. Returns newly-unlocked offer ids. */
  recordRun(shardsEarned: number, steps: number, newlyUnlocked: string[]): void {
    this.state.lifetimeShards += shardsEarned;
    this.state.runs += 1;
    this.state.bestSteps = Math.max(this.state.bestSteps, steps);
    this.state.bestShards = Math.max(this.state.bestShards, shardsEarned);
    for (const id of newlyUnlocked) {
      if (!this.state.seenUnlocks.includes(id)) this.state.seenUnlocks.push(id);
    }
    this.persist();
  }

  markTutorialSeen(): void {
    if (!this.state.tutorialSeen) {
      this.state.tutorialSeen = true;
      this.persist();
    }
  }

  setMuted(muted: boolean): void {
    this.state.muted = muted;
    this.persist();
  }
}
