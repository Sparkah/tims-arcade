// RunEngine - the pure, rendering-free run-state machine for Drift Blades.
//
// Holds the player's evolving build, draws two-offer cards, applies the chosen
// offer, and resolves one combat/survival tick (with synergy + anti-synergy +
// trade-off maths). No Phaser, no DOM - a headless balance-sim (P2) drives this
// directly across many seeds and scripted strategies.

import { type Offer, type CardTag, offersUnlocked, TOTAL_STEPS } from './cards';
import { BAL } from './balance';

export type RunPhase = 'playing' | 'won' | 'lost';
export type Side = 'left' | 'right';

export interface ResolveEvent {
  dealt: number; // damage dealt to the gauntlet this tick
  crit: boolean; // did the player's strike crit
  venomDealt: number; // poison damage component
  shatter: number; // bonus from Venom+Frost synergy
  taken: number; // damage taken by the player this tick
  shardsGained: number; // shards earned this step
  cleared: boolean; // gauntlet HP hit 0 this tick
}

export interface RunStats {
  hp: number;
  maxHp: number;
  edge: number;
  guard: number;
  crit: number; // 0..1
  venom: number; // stacks
  frost: number; // stacks
  greed: number; // flat shard bonus per step
  edgeTax: number; // accumulated multiplicative tax (0..~0.6)
}

export interface RunSnapshot {
  phase: RunPhase;
  step: number; // 1-based current step (cards offered)
  totalSteps: number;
  stats: RunStats;
  threat: number; // gauntlet attack scaling
  gauntletHp: number;
  gauntletMaxHp: number;
  shards: number; // earned THIS run
  tagCounts: Record<CardTag, number>;
}

// Small deterministic PRNG (mulberry32) so runs are reproducible for the sim.
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// All tuning constants now come from balance.json via the BAL adapter (the
// externalized-data refactor, Balance-Sim P2). Logic is unchanged; only the
// numbers moved, so the sim can tune them without touching this file.
const BASE_STATS: RunStats = { ...BAL.baseStats };

// The PRIMARY win is OUTLASTING the threat ramp for all totalSteps - that is the
// build puzzle (defenses + HP + sustain vs an accelerating gauntlet). Felling
// the gauntlet outright is a RARE aggressive flex-clear, not the default path.
// Threat ramps and has an UNAVOIDABLE chip fraction that ignores Guard, so no
// single stat trivializes survival - Guard, Frost, Max-HP and heals all pull.
const GAUNTLET_MAX_HP = BAL.gauntlet.maxHp;
const THREAT_START = BAL.threat.start;
const THREAT_PER_STEP = BAL.threat.perStep;
const THREAT_ACCEL = BAL.threat.accel; // extra ramp per step (late steps bite harder)
const THREAT_CHIP = BAL.threat.chip; // share of each hit that bypasses Guard entirely
const C = BAL.combat;

const emptyTagCounts = (): Record<CardTag, number> => ({
  edge: 0,
  guard: 0,
  venom: 0,
  frost: 0,
  greed: 0,
  berserk: 0,
});

export class RunEngine {
  private rng: () => number;
  private pool: Offer[];
  private snap: RunSnapshot;
  private currentPair: [Offer, Offer] | null = null;

  constructor(lifetimeShards: number, seed: number = (Math.random() * 1e9) | 0) {
    this.rng = makeRng(seed);
    this.pool = offersUnlocked(lifetimeShards);
    const gMax = GAUNTLET_MAX_HP;
    this.snap = {
      phase: 'playing',
      step: 0,
      totalSteps: TOTAL_STEPS,
      stats: { ...BASE_STATS },
      threat: THREAT_START,
      gauntletHp: gMax,
      gauntletMaxHp: gMax,
      shards: 0,
      tagCounts: emptyTagCounts(),
    };
    this.drawPair();
  }

  get snapshot(): RunSnapshot {
    return {
      ...this.snap,
      stats: { ...this.snap.stats },
      tagCounts: { ...this.snap.tagCounts },
    };
  }

  get pair(): [Offer, Offer] | null {
    return this.currentPair;
  }

  /** Draw two contrasting offers for the next card. */
  private drawPair(): void {
    if (this.snap.phase !== 'playing') {
      this.currentPair = null;
      return;
    }
    const pool = this.pool;
    const a = pool[(this.rng() * pool.length) | 0];
    // Prefer a second offer of a DIFFERENT archetype so each choice is a real
    // fork; fall back to any non-identical offer in tiny pools.
    let b = a;
    for (let tries = 0; tries < 12; tries++) {
      const cand = pool[(this.rng() * pool.length) | 0];
      if (cand.id !== a.id && cand.archetype !== a.archetype) {
        b = cand;
        break;
      }
      if (cand.id !== a.id) b = cand; // keep a non-identical fallback
    }
    if (b.id === a.id && pool.length > 1) {
      b = pool[(pool.indexOf(a) + 1) % pool.length];
    }
    // Randomize which side each lands on.
    this.currentPair = this.rng() < 0.5 ? [a, b] : [b, a];
  }

  /** Effective offensive stats after Greed tax + Berserk/Greed anti-synergies. */
  private effective(): { edge: number; guard: number } {
    const s = this.snap.stats;
    const tc = this.snap.tagCounts;
    // Greed taxes Edge (forced trade-off, accumulated).
    const taxedEdge = s.edge * (1 - Math.min(C.greedTaxMax, s.edgeTax));
    // Greed in-run payoff: a small flat Edge per Greed stack the tax does NOT
    // eat (default 0 = original pure-meta Greed). Lets the search make Greed a
    // modest in-run lane instead of pure downside without shard-scaling it.
    const greedEdge = s.greed * (C.greedInRunEdgePerStack ?? 0);
    // Berserk lowers effective Guard per berserk card taken (anti-synergy).
    const berserkPenalty = tc.berserk * C.berserkGuardPerCard;
    const guard = Math.max(0, s.guard - berserkPenalty);
    return { edge: Math.max(0, taxedEdge + greedEdge), guard };
  }

  /**
   * Take the offer on the given side. Applies its stat package, then resolves
   * one combat tick. Returns the resolve event for juicing the view.
   */
  choose(side: Side): ResolveEvent {
    if (this.snap.phase !== 'playing' || !this.currentPair) {
      return { dealt: 0, crit: false, venomDealt: 0, shatter: 0, taken: 0, shardsGained: 0, cleared: false };
    }
    const offer = side === 'left' ? this.currentPair[0] : this.currentPair[1];
    this.applyOffer(offer);
    const ev = this.resolve();
    this.snap.step += 1;

    if (this.snap.gauntletHp <= 0) {
      this.snap.phase = 'won';
      this.snap.gauntletHp = 0;
    } else if (this.snap.stats.hp <= 0) {
      this.snap.phase = 'lost';
      this.snap.stats.hp = 0;
    } else if (this.snap.step >= this.snap.totalSteps) {
      // Survived all steps without felling the gauntlet = still a clear (you
      // outlasted it). Reaching the wall alive is a WIN.
      this.snap.phase = 'won';
    }

    if (this.snap.phase === 'playing') {
      this.drawPair();
    } else {
      this.currentPair = null;
    }
    return ev;
  }

  private applyOffer(o: Offer): void {
    const s = this.snap.stats;
    s.edge += o.edge ?? 0;
    s.guard += o.guard ?? 0;
    s.maxHp += o.maxHp ?? 0;
    s.crit = Math.min(C.critCap, s.crit + (o.crit ?? 0));
    s.venom += o.venom ?? 0;
    s.frost += o.frost ?? 0;
    s.greed += o.greed ?? 0;
    s.edgeTax = Math.min(C.greedTaxMax, s.edgeTax + (o.edgeTaxPct ?? 0));
    s.edge = Math.max(0, s.edge);
    s.guard = Math.max(0, s.guard);
    s.maxHp = Math.max(6, s.maxHp);
    if (o.heal) s.hp = Math.min(s.maxHp, s.hp + o.heal);
    s.hp = Math.min(s.hp, s.maxHp);
    for (const tag of o.tags) this.snap.tagCounts[tag] += 1;
  }

  /** One combat/survival tick. */
  private resolve(): ResolveEvent {
    const s = this.snap.stats;
    const { edge, guard } = this.effective();

    // Player strike: edge, possible crit (critMult).
    const crit = this.rng() < s.crit;
    let dealt = edge * (crit ? C.critMult : 1);
    // Venom: poison ticks each step for venom stacks.
    const venomDealt = s.venom;
    // Synergy: Venom + Frost both at/above their thresholds -> Shatter bonus.
    // Defaults (1/1) reproduce the original "venom>0 && frost>0" auto-on rule;
    // raising them makes assembling Shatter a deliberate build, not an accident.
    const minV = C.shatterMinVenom ?? 1;
    const minF = C.shatterMinFrost ?? 1;
    const shatter = s.venom >= minV && s.frost >= minF ? Math.ceil((s.venom + s.frost) * C.shatterFactor) : 0;
    dealt += venomDealt + shatter;
    dealt = Math.round(dealt);
    this.snap.gauntletHp = Math.max(0, this.snap.gauntletHp - dealt);

    // Berserk lifesteal (default 0 = off): a capped, once-per-step heal off BASE
    // (pre-crit) edge that DECAYS as the threat ramps, so Berserk is a high-risk
    // early glass-cannon with a little sustain - never a scaling defensive engine
    // (no crit/shatter scaling, no overkill proc; clamped to maxHp below).
    const berserkCards = this.snap.tagCounts.berserk;
    const lsPer = C.berserkLifestealPerCard ?? 0;
    if (berserkCards > 0 && lsPer > 0) {
      const decay = Math.max(0, 1 - (C.berserkLifestealThreatDecay ?? 0) * this.snap.step);
      let leech = berserkCards * lsPer * (edge > 0 ? 1 : 0) * decay;
      const cap = C.berserkLifestealCap ?? 0;
      if (cap > 0) leech = Math.min(leech, cap);
      if (leech > 0) s.hp = Math.min(s.maxHp, s.hp + leech);
    }

    // Gauntlet strike: threat rises each step (HP is a real constraint, so
    // Guard/Frost/HP cards matter). Frost reduces incoming damage; Guard
    // mitigates flatly - but a THREAT_CHIP fraction always lands (so stacking
    // pure Guard can't fully negate the ramp = no single dominant tank line).
    this.snap.threat += THREAT_PER_STEP + this.snap.step * THREAT_ACCEL;
    const frostReduce = Math.min(C.frostReduceMax, s.frost * C.frostReducePerStack);
    const incoming = this.snap.threat * (1 - frostReduce);
    const chip = incoming * THREAT_CHIP;
    const mitigatable = incoming * (1 - THREAT_CHIP);
    let taken = chip + Math.max(0, mitigatable - guard);
    taken = Math.max(0, Math.round(taken));
    s.hp = Math.max(0, s.hp - taken);

    // Shards: base per step + greed bonus + a small bonus for hard hits.
    const shardsGained = C.shardsBasePerStep + s.greed + (crit ? C.shardsCritBonus : 0);
    this.snap.shards += shardsGained;

    return {
      dealt,
      crit,
      venomDealt,
      shatter,
      taken,
      shardsGained,
      cleared: this.snap.gauntletHp <= 0,
    };
  }

  /** Shards banked at run end (steps survived already accrued; clear bonus here). */
  finalShards(): number {
    const clearBonus = this.snap.phase === 'won' ? BAL.gauntlet.clearBonusShards : 0;
    return this.snap.shards + clearBonus;
  }
}
