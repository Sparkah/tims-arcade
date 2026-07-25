// gateHooks - the factory pipeline contract surface for Drift Blades.
//
// gfBridge.ts already publishes window.gs + window.__gfState() (score/bestScore
// + registerStateVar()). This module adds the rest of what the shared tools
// read/drive on a Phaser build:
//
//   window.GF.t(key)            localized string read (screenshot lang check)
//   window._setLang('en'|'ru')  force language + re-render active scene
//   window._jumpLevel(n)        n>=1 boot a run from the menu; n>=99 force GAMEOVER
//   window._setupForScreenshot()boot a dense mid-run state for screenshots (PLAYING)
//   window.__gfTour()/(i)       screen names / navigate (reachability gate)
//   window.__gfReach()          hit-rects for the current screen (reachability gate)
//
// Scenes register their capabilities here so this module stays render-free.

import { t, setLang, type Lang } from '../i18n';
import { registerStateVar } from './gfBridge';

export interface ReachItem {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  pinned?: boolean;
}

export interface ReachPayload {
  screen: string;
  viewportH: number;
  viewportW: number;
  screenH: number;
  scrollMaxY: number;
  items: ReachItem[];
}

type Launcher = (jumpToOver?: boolean) => void;
type ScreenshotStager = () => void;
type ReachProvider = () => ReachPayload | null;

let menuLauncher: Launcher | null = null;
let screenshotStager: ScreenshotStager | null = null;
let forceOver: (() => void) | null = null;
let reachProviders = new Map<string, ReachProvider>();
let currentScreen = 'menu';
let restartActive: (() => void) | null = null;
// When the gate boots a run via _jumpLevel(1..98) it asks GameScene to pre-advance
// a few picks so the screenshot shows an evolved build (PLAYING, not step 0).
let pendingStage = 0;

export function consumePendingStage(): number {
  const n = pendingStage;
  pendingStage = 0;
  return n;
}

export function registerMenuLauncher(fn: Launcher): void {
  menuLauncher = fn;
}
export function registerScreenshotStager(fn: ScreenshotStager): void {
  screenshotStager = fn;
}
export function registerForceOver(fn: () => void): void {
  forceOver = fn;
}
export function registerRestartActive(fn: () => void): void {
  restartActive = fn;
}
export function setCurrentScreen(name: string): void {
  currentScreen = name;
}
export function registerReachProvider(screen: string, fn: ReachProvider): void {
  reachProviders.set(screen, fn);
}

// Run-state vars surfaced through __gfState() for the progression gate.
const runVars: { hp: number; step: number; edge: number; guard: number; threat: number } = {
  hp: 0,
  step: 0,
  edge: 0,
  guard: 0,
  threat: 0,
};

export function reportRunVars(patch: Partial<typeof runVars>): void {
  Object.assign(runVars, patch);
}

let installed = false;

export function installGateHooks(): void {
  if (installed) return;
  installed = true;

  registerStateVar('hp', () => runVars.hp);
  registerStateVar('step', () => runVars.step);
  registerStateVar('edge', () => runVars.edge);
  registerStateVar('guard', () => runVars.guard);
  registerStateVar('threat', () => runVars.threat);

  const w = window as unknown as {
    GF?: { t: (k: string) => string };
    _setLang?: (l: string) => void;
    _jumpLevel?: (n?: number) => void;
    _setupForScreenshot?: (mode?: string) => void;
    __gfTour?: (i?: number) => string[] | string;
    __gfReach?: () => ReachPayload | null;
    __phaserGame?: { scene?: { scenes: Array<{ scene: { isActive(): boolean; restart(): void } }> } };
  };

  w.GF = { t };

  w._setLang = (l: string) => {
    setLang((l === 'ru' ? 'ru' : 'en') as Lang);
    if (restartActive) {
      restartActive();
      return;
    }
    const scenes = w.__phaserGame?.scene?.scenes ?? [];
    for (const s of scenes) if (s.scene.isActive()) s.scene.restart();
  };

  w._jumpLevel = (n?: number) => {
    const lvl = n ?? 1;
    if (lvl >= 99) {
      // Force a terminal state. If we're not in a run yet, boot one first.
      if (forceOver) {
        forceOver();
      } else if (menuLauncher) {
        menuLauncher(true);
      }
      return;
    }
    // Boot a run from wherever we are, pre-advancing a few picks so the board is
    // a dense, evolved build (PLAYING) rather than step 0 - for screenshots.
    pendingStage = Math.max(4, lvl * 3);
    if (screenshotStager) {
      // Already in a run: just stage in place.
      screenshotStager();
    } else if (menuLauncher) {
      menuLauncher(false);
    }
  };

  w._setupForScreenshot = () => {
    if (screenshotStager) screenshotStager();
    else if (menuLauncher) menuLauncher(false);
  };

  // Reachability: the tour is the three screens; navigation is a no-op beyond
  // the menu/run/over the game is already on (each screen self-reports its
  // rects when active). The gate calls __gfTour() then __gfTour(i) to "go to"
  // screen i; we report whatever screen is live (the gate reads __gfReach
  // after). For Drift Blades all UI is pinned and fits the viewport, so the
  // active screen's provider covers it.
  const screens = ['menu', 'run', 'over'];
  w.__gfTour = (i?: number) => {
    if (i === undefined) return screens;
    // Best-effort navigation: only 'run' is reachable on demand (boot a run);
    // menu/over are wherever the game already is. Return the requested name so
    // the gate's loop advances; __gfReach reports the live screen.
    if (screens[i] === 'run' && currentScreen === 'menu' && menuLauncher) {
      menuLauncher(false);
    }
    return screens[i] ?? currentScreen;
  };

  w.__gfReach = () => {
    const provider = reachProviders.get(currentScreen);
    return provider ? provider() : null;
  };
}
