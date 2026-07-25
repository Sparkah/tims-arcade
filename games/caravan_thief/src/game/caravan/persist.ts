// Persistent meta store for Caravan Thief. Namespaced localStorage, written
// only on events (never in a per-frame loop). Holds the bazaar wallet, upgrade
// levels, the collected-relic bitmask, best score, and the seen-tutorial flag.
import { DEFAULT_UPGRADES, RELIC_COUNT, type UpgradeId, type Upgrades } from './constants';

const NS = 'caravan_thief';

export type MetaSave = {
  wallet: number;
  best: number;
  upgrades: Upgrades;
  relics: boolean[]; // length RELIC_COUNT
  seenTutorial: boolean;
};

function key(k: string): string {
  return `${NS}:${k}`;
}

function safeGet(k: string): string | null {
  try {
    return localStorage.getItem(key(k));
  } catch {
    return null;
  }
}

function safeSet(k: string, v: string): void {
  try {
    localStorage.setItem(key(k), v);
  } catch {
    // storage disabled - run stays in-memory
  }
}

export function loadMeta(): MetaSave {
  const meta: MetaSave = {
    wallet: 0,
    best: 0,
    upgrades: { ...DEFAULT_UPGRADES },
    relics: new Array<boolean>(RELIC_COUNT).fill(false),
    seenTutorial: false,
  };
  const raw = safeGet('meta');
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<MetaSave>;
      if (typeof parsed.wallet === 'number') meta.wallet = Math.max(0, Math.floor(parsed.wallet));
      if (typeof parsed.best === 'number') meta.best = Math.max(0, Math.floor(parsed.best));
      if (parsed.upgrades) {
        for (const id of Object.keys(DEFAULT_UPGRADES) as UpgradeId[]) {
          const v = parsed.upgrades[id];
          if (typeof v === 'number') meta.upgrades[id] = Math.max(0, Math.floor(v));
        }
      }
      if (Array.isArray(parsed.relics)) {
        for (let i = 0; i < RELIC_COUNT; i += 1) meta.relics[i] = Boolean(parsed.relics[i]);
      }
      meta.seenTutorial = Boolean(parsed.seenTutorial);
    } catch {
      // corrupt - fall back to defaults
    }
  }
  return meta;
}

export function saveMeta(meta: MetaSave): void {
  safeSet('meta', JSON.stringify(meta));
}

export function relicsFound(meta: MetaSave): number {
  return meta.relics.reduce((n, r) => n + (r ? 1 : 0), 0);
}
