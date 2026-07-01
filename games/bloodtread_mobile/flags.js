// URL-param flags + the shared query object. Boolean/string/mode toggles parsed once at boot.
// Numeric caps derived from the URL live in config.js (which imports qs from here).
import { clamp } from './lib/math.js?v=bm10';

export var qs = new URLSearchParams(location.search);

// PUBLIC/HOSTED build marker (Tim 2026-06-25): the deployed index.html sets window.__BT_PUBLIC=1 BEFORE main.js
// loads, so the BARE hosted URL (no query string) shows real art + drops straight into play - a shareable link
// that Just Works. It does NOT enable cheats (CHEATS_ENABLED stays gated on ?debug/?cheats), and the dev build
// (:8336, which never sets the flag) is unchanged. Equivalent to the old ?sprites&play, baked in for hosting.
export var PUBLIC_BUILD = typeof window !== 'undefined' && !!window.__BT_PUBLIC;

// LOCAL preview only: localhost / 127.0.0.1 / file://. ALL dev+cheat URL params (cheats, debug, storetest,
// unlockall, god, diag/min) are gated behind this so they work in Tim's local preview but are INERT on every
// public host (game-factory.tech, the Telegram wrapper, CrazyGames, Yandex) - no player can self-grant/cheat live.
export var LOCAL_BUILD = typeof location !== 'undefined' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname === '0.0.0.0' || location.hostname === '');

// TELEGRAM MINI APP mode: the tg-bloodtread/ wrapper loads the game iframe with ?tg=1. Gates the Telegram
// adapter (tg.js): cloud saves, Stars/TON product grants, ad-free. OFF everywhere else (standalone/CG/Yandex).
export var TG_MODE = qs.has('tg');

// Cheats / dev tools (the CHEATS menu, skip-to-minute, ?min boot, c/x grants) are gated behind this so the
// SHIPPED game has NO cheat menu (Tim). IMMUTABLE boot const (unlike DEBUG, which a keybind can toggle):
// add ?debug or ?cheats to re-enable them for testing. The window.__* test/harness hooks are separate.
export var CHEATS_ENABLED = (qs.has('debug') || qs.has('cheats')) && LOCAL_BUILD;
export var STORE_TEST = (qs.has('storetest') || qs.has('debug') || qs.has('cheats')) && !TG_MODE && LOCAL_BUILD;   // ?storetest grants STORE items LOCALLY for preview - LOCAL_BUILD only, so a player can NEVER append it to the live app and self-grant; real builds buy through window.__tg

export var DEBUG = qs.has('debug') && LOCAL_BUILD;   // dev perf overlay - LOCAL only (no debug panel on production)

// ?unlockall - Tim's "cheated all unlocked" convenience: unlocks the WHOLE game at boot (max forge + every
// weapon + every Gore Cache skin/relic + a stack of caches/shards). Local save only (no money, no server grant);
// handy for reviewing the full collection. Applied in main.js boot; also window.__unlockAll() in the console.
export var UNLOCK_ALL = qs.has('unlockall') && LOCAL_BUILD;
// DEBUG is toggled live by a keybind; importers can't reassign a binding, so mutate it here.
export function setDebug(v) { DEBUG = v; }
export var NO_HUD = qs.has('noui');
export var DIAG = LOCAL_BUILD ? (qs.get('diag') || '') : '';   // render/logic diag modes (+ the ?min jump they enable) are LOCAL-only
export var LOGIC_ONLY = DIAG === 'logic' || DIAG === 'updateonly';
export var RENDER_ONLY = DIAG === 'render' || DIAG === 'renderonly';
export var START_MIN = (CHEATS_ENABLED || RENDER_ONLY) ? clamp(parseFloat(qs.get('min') || (RENDER_ONLY ? '9' : '0')), 0, 60) : 0;   // ?min is a cheat -> 0 in the shipped game unless cheats/render-diag
export var AUTO_START = START_MIN > 0 || RENDER_ONLY || qs.has('play') || qs.has('autoplay') || PUBLIC_BUILD;
// Analytics OFF for any DEV/CHEAT session (Codex 2026-06-25): ?god/?tune/?cheats/?debug/?min/?diag let a run be
// trivialised or rebalanced, so those sessions must NOT pollute the public funnel/retention data. A normal public
// player (bare URL, PUBLIC_BUILD) keeps analytics ON; the test harness (which uses these flags) is excluded.
export var ANALYTICS_ENABLED = qs.get('analytics') !== '0'
  && !(qs.has('debug') || qs.has('cheats') || qs.has('god') || qs.has('nohurt') || qs.has('tune') || qs.has('min') || qs.get('diag'));
export var GA_GAME_KEY = '10e10fa34d16c989228a8e78031ed693';
export var GA_SECRET_KEY = '2228ecb3e2c3fda88accf513769a75b5052e2402';
export var BUILD_TAG = (qs.get('v') || 'local').slice(0, 48);
export var OLD_SPRITES = qs.has('sprites') || qs.has('oldsprites') || PUBLIC_BUILD;
export var OLD_ENV = OLD_SPRITES && qs.get('oldenv') !== '0';
export var OLD_TANK = OLD_SPRITES && qs.get('oldtank') !== '0';
export var OLD_DEATH = OLD_SPRITES && qs.get('death') !== '0';
export var TANK_LAYERS = OLD_TANK && qs.get('tanklayers') !== '0';   // baseline default (matches :8334). CORRECTED 2026-06-24: the LAYERED chassis IS what renders - lp_ layers load from art_refs/parts/layer_*.png (NOT sprites/lp_*, which is why a sprites/-path check 404s and misled an earlier note), so under ?sprites the layered path is taken (perfStats tankSprites=4). The SIMPLE 32x32 tank_body+tank_turret branch below is a dead fallback (only if lp_ are ever absent). That layered chassis (grey hull + gold C-arc turret) IS the wanted/original look; the 2026-06-23 160x160 simple-tank swap was the reverted mistake.
export var GORE_FX = qs.get('gore') !== '0';
export var BREAK_ENV = OLD_ENV && qs.get('breakenv') !== '0';
export var VEIN_FX = qs.get('veins') !== '0';
export var LEECH_FX = qs.get('leeches') !== '0';
export var COLLIDERS = qs.get('colliders') !== '0';   // default ON (opt-out ?colliders=0): enemy<->enemy spatial-hash separation so a horde spreads into a crowd instead of stacking on one point (Tim 2026-06-28)
export var GOD = (qs.has('god') || qs.has('nohurt')) && LOCAL_BUILD;
export var SPRITE_LOD = qs.get('spritelod') !== '0';
export var TOUCH_DEVICE = (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
export var ZOOM_OVERRIDE = qs.has('zoom') ? clamp(parseFloat(qs.get('zoom') || '1'), 0.55, 1.2) : 0;
export var JOYSTICK_ALLOWED = qs.get('joystick') !== '0' && qs.get('joy') !== '0';

// TUNE MODE: ?tune fetches a published Google Sheet CSV at boot and overrides matching BALANCE knobs BEFORE
// the first run (live retuning without a redeploy). Production (no ?tune) bakes the defaults in balance.js.
// ?sheet=<url> overrides balance.js BALANCE_SHEET_URL for this load. See BALANCE.md + balance.js.
export var TUNE_MODE = qs.has('tune');
export var TUNE_SHEET_URL = qs.get('sheet') || '';

// ?wipe clears the saved progress (localStorage) on load, then the game boots normally from a FRESH base - so
// Tim can feel the new 2.0s start without an old maxed meta save skewing it. This is a legitimate progress
// RESET, NOT a cheat, so it is deliberately NOT gated behind CHEATS_ENABLED. Applied in main.js BEFORE
// loadMeta/loadStats/resetGame (see the boot tail) so nothing reads stale saved tiers.
export var WIPE_SAVE = qs.has('wipe');
