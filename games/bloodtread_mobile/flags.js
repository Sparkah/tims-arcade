// URL-param flags + the shared query object. Boolean/string/mode toggles parsed once at boot.
// Numeric caps derived from the URL live in config.js (which imports qs from here).
import { clamp } from './lib/math.js';

export var qs = new URLSearchParams(location.search);

// PUBLIC/HOSTED build marker (Tim 2026-06-25): the deployed index.html sets window.__BT_PUBLIC=1 BEFORE main.js
// loads, so the BARE hosted URL (no query string) shows real art + drops straight into play - a shareable link
// that Just Works. It does NOT enable cheats (CHEATS_ENABLED stays gated on ?debug/?cheats), and the dev build
// (:8336, which never sets the flag) is unchanged. Equivalent to the old ?sprites&play, baked in for hosting.
export var PUBLIC_BUILD = typeof window !== 'undefined' && !!window.__BT_PUBLIC;

// Cheats / dev tools (the CHEATS menu, skip-to-minute, ?min boot, c/x grants) are gated behind this so the
// SHIPPED game has NO cheat menu (Tim). IMMUTABLE boot const (unlike DEBUG, which a keybind can toggle):
// add ?debug or ?cheats to re-enable them for testing. The window.__* test/harness hooks are separate.
export var CHEATS_ENABLED = qs.has('debug') || qs.has('cheats');

export var DEBUG = qs.has('debug');
// DEBUG is toggled live by a keybind; importers can't reassign a binding, so mutate it here.
export function setDebug(v) { DEBUG = v; }
export var NO_HUD = qs.has('noui');
export var DIAG = qs.get('diag') || '';
export var LOGIC_ONLY = DIAG === 'logic' || DIAG === 'updateonly';
export var RENDER_ONLY = DIAG === 'render' || DIAG === 'renderonly';
export var START_MIN = (CHEATS_ENABLED || RENDER_ONLY) ? clamp(parseFloat(qs.get('min') || (RENDER_ONLY ? '9' : '0')), 0, 60) : 0;   // ?min is a cheat -> 0 in the shipped game unless cheats/render-diag
export var AUTO_START = START_MIN > 0 || RENDER_ONLY || qs.has('play') || qs.has('autoplay') || PUBLIC_BUILD;
export var ANALYTICS_ENABLED = qs.get('analytics') !== '0';
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
export var COLLIDERS = qs.has('colliders') && qs.get('colliders') !== '0';
export var GOD = qs.has('god') || qs.has('nohurt');
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
