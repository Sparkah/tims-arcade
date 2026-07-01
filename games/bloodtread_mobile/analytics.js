// GameAnalytics wrapper (NEW vs the sibling). Wraps the window.GameAnalytics global created by
// vendor/GameAnalytics.min.js (loaded by index.html BEFORE the module graph). gaCall() buffers the
// last 80 events onto window.__btAnalyticsEvents (harness reads them) and forwards to the SDK if present.
// All run telemetry (start / upgrade-pick / loss) is assembled from state + econ + player here.
import { ANALYTICS_ENABLED, GA_GAME_KEY, GA_SECRET_KEY, BUILD_TAG, DEBUG } from './flags.js?v=bm3';
import { rnd } from './lib/rng.js?v=bm3';
import { state, player, META, econ, enemies, upgradeCounts, WIN_SECONDS } from './state.js?v=bm3';
import { upgradeNames } from './data/upgrades.js?v=bm3';
import { currentWeaponTier } from './game/meta.js?v=bm3';
import { stats, saveStats } from './persistence.js?v=bm3';

// Minute milestones = the funnel stages. Each fires ONCE per run the first time state.t crosses it; the
// matching bit in state.milestonesFired latches it. Minute 20 is the Complete/win stage (the WIN event
// covers the GA "Complete" progression; the m20 design event still fires for symmetry).
var MILESTONE_MINUTES = [1, 3, 5, 10, 15, 20];

var SAVE_ANALYTICS_UID = 'bloodtread_rebuild_analytics_uid';
var analyticsInitialized = false;
var analyticsUserIdValue = '';
window.__btAnalyticsEvents = window.__btAnalyticsEvents || [];

export function analyticsSlug(s) {
  return String(s || 'none').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30) || 'none';
}

export function getAnalyticsUserId() {
  if (analyticsUserIdValue) return analyticsUserIdValue;
  var id = '';
  try {
    id = localStorage.getItem(SAVE_ANALYTICS_UID) || '';
    if (!id) {
      if (window.crypto && window.crypto.randomUUID) id = window.crypto.randomUUID();
      else id = 'bt_' + Date.now().toString(36) + '_' + ((Math.random() * 0xfffffff) | 0).toString(36);
      localStorage.setItem(SAVE_ANALYTICS_UID, id);
    }
  } catch (err) {
    id = 'bt_' + Date.now().toString(36) + '_' + ((Math.random() * 0xfffffff) | 0).toString(36);
  }
  analyticsUserIdValue = id;
  return id;
}

export function makeAnalyticsRunId() {
  return getAnalyticsUserId().slice(0, 12) + '_' + Date.now().toString(36) + '_' + ((rnd() * 0xffffff) | 0).toString(36);
}

function gaCall(cmd) {
  if (!ANALYTICS_ENABLED) return;
  var args = Array.prototype.slice.call(arguments, 1);
  window.__btAnalyticsEvents.push({ t: Date.now(), cmd: cmd, args: args });
  if (window.__btAnalyticsEvents.length > 80) window.__btAnalyticsEvents.shift();
  if (typeof window.GameAnalytics !== 'function') return;
  try {
    window.GameAnalytics.apply(null, [cmd].concat(args));
  } catch (err) {}
}

export function initAnalytics() {
  if (!ANALYTICS_ENABLED || analyticsInitialized) return;
  analyticsInitialized = true;
  getAnalyticsUserId();
  gaCall('configureBuild', 'bloodtread_' + analyticsSlug(BUILD_TAG).slice(0, 21));
  gaCall('configureUserId', analyticsUserIdValue);
  gaCall('configureAvailableResourceCurrencies', ['Blood']);
  gaCall('configureAvailableResourceItemTypes', ['Gameplay', 'Shop']);
  if (DEBUG) gaCall('setEnabledInfoLog', true);
  gaCall('initialize', GA_GAME_KEY, GA_SECRET_KEY);
}

function upgradeCountsSummary() {
  var parts = [];
  for (var i = 0; i < upgradeNames.length; i++) {
    if (upgradeCounts[i] > 0) parts.push(analyticsSlug(upgradeNames[i]) + '=' + upgradeCounts[i]);
  }
  return parts.length ? parts.join(',') : 'none';
}

function addUpgradeCountFields(fields) {
  for (var i = 0; i < upgradeNames.length; i++) {
    fields['upg_' + analyticsSlug(upgradeNames[i])] = upgradeCounts[i];
  }
  fields.upgrades = upgradeCountsSummary();
}

function analyticsRunFields(reason) {
  var fields = {
    user_id: getAnalyticsUserId(),
    run_id: state.runId || '',
    reason: reason || '',
    build: BUILD_TAG,
    map: state.map,                     // which map this run is on (1 = original; 2+ = post-Continue, harder + reskinned)
    attempt: stats.attempts,            // lifetime attempt # this run belongs to (the funnel/retention key)
    max_minute_ever: stats.maxMinute,   // best minute reached across all prior runs
    max_level_ever: stats.maxLevel,     // best level reached across all prior runs
    has_won: stats.hasWon,              // 1 once the player has ever beaten 20:00
    time_s: Math.floor(state.t),
    minute: Math.floor(state.t / 60),
    level: player.level,                // monotonic within a run, so this IS the max level reached this run
    max_level: player.level,            // explicit alias for the death/win "max level reached" field
    kills: state.kills,
    blood: Math.floor(state.blood),
    hp: Math.round(player.hp),
    xp: Math.floor(player.xp),
    xp_next: player.xpNext,
    weapon: econ.equipWeapon,
    weapon_tier: currentWeaponTier(),
    weapon_tiers: econ.weaponMeta.cannon + '/' + econ.weaponMeta.flak + '/' + econ.weaponMeta.laser + '/' + econ.weaponMeta.missile,
    armor: META.armor,
    core: META.core,
    cannon: META.cannon,
    treads: META.treads,
    thirst_track: META.thirst,
    frenzy: META.frenzy,
    damage: Math.round(player.dmg * 10) / 10,
    fire_rate: Math.round(player.fireRate * 10) / 10,
    speed: Math.round(player.speed),
    crush: Math.round(player.crush),
    crush_dps: Math.round(player.crushDps),
    pickup_r: Math.round(player.pickR),
    barrels: player.barrels,
    thirst: player.thirst,
    lash_lvl: player.lashLvl,
    enemies: enemies.count
  };
  addUpgradeCountFields(fields);
  return fields;
}

// Roll the persisted bests up from the current run (called on every milestone + on death/win) and persist if
// anything advanced. Keeps maxMinute/maxLevel/hasWon live for the NEXT run's fields + the victory screen.
// Runs even for cheated runs (a "best minute/level reached" stat is still true even if the run isn't funnel-eligible).
function recordRunProgress(won) {
  var changed = false;
  var minute = Math.floor(state.t / 60);
  if (minute > stats.maxMinute) { stats.maxMinute = minute; changed = true; }
  if (player.level > stats.maxLevel) { stats.maxLevel = player.level; changed = true; }
  if (won && !stats.hasWon) { stats.hasWon = 1; changed = true; }
  if (changed) saveStats();
}

// Run start. CHEATED runs (skip-to-minute: boot ?min=N, cheat min-9 button, in-run `9` key -> state.runCheated)
// emit NOTHING - no attempt bump, no GA Start - so the funnel denominator + every downstream stage stays a clean
// from-zero population. attempts++ here is THE funnel denominator (only genuine fresh runs).
export function trackAnalyticsRunStart(startMinute) {
  if (!ANALYTICS_ENABLED || state.runCheated) return;
  stats.attempts++;
  saveStats();   // persist immediately so a tab-close mid-run can't lose the attempt
  var fields = analyticsRunFields('start');
  gaCall('addProgressionEvent', 'Start', 'survival_run', 'main', 'run');
  gaCall('addDesignEvent', 'Run:Start', startMinute || 0, fields);
}

// MINUTE-MILESTONE funnel: each PLAYING frame, emit a one-shot progression+design event the first time the
// run crosses 1/3/5/10/15/20 min. Drives GA's funnel + retention cohorts (Start -> m1 -> m5 -> ... -> m20).
export function trackAnalyticsMilestones() {
  if (!ANALYTICS_ENABLED || state.mode !== 'PLAYING' || state.runCheated) return;   // cheated runs emit no funnel stages
  var minute = state.t / 60;
  for (var i = 0; i < MILESTONE_MINUTES.length; i++) {
    var bit = 1 << i;
    if ((state.milestonesFired & bit) === 0 && minute >= MILESTONE_MINUTES[i]) {
      state.milestonesFired |= bit;
      var m = MILESTONE_MINUTES[i];
      recordRunProgress(false);
      var fields = analyticsRunFields('minute_' + m);
      fields.milestone_minute = m;
      gaCall('addProgressionEvent', 'Minute' + m, 'survival_run', 'main', 'run', m);
      gaCall('addDesignEvent', 'Run:Minute:m' + m, m, fields);
    }
  }
}

// WIN: survived to 20:00. Completes the GA funnel (Complete progression) + a Run:Win design event carrying
// time_to_win + attempt# + max level + full run fields. Latched by state.analyticsWinSent (fires once).
export function trackAnalyticsWin() {
  if (!ANALYTICS_ENABLED || state.analyticsWinSent) return;
  state.analyticsWinSent = true;
  recordRunProgress(true);      // "has won / best minute" is a true stat even on a cheated run; not a funnel event
  if (state.runCheated) return; // cheated run -> no Complete/Run:Win funnel emit (keeps the funnel a clean from-zero population)
  trackAnalyticsMilestones();   // make sure the m20 milestone fired before Complete (covers exact-frame races)
  var fields = analyticsRunFields('win');
  fields.time_to_win = Math.floor(state.t);
  fields.win_seconds = WIN_SECONDS;
  gaCall('addProgressionEvent', 'Complete', 'survival_run', 'main', 'run', Math.floor(state.t));
  gaCall('addDesignEvent', 'Run:Win', Math.floor(state.t), fields);
  if (state.blood > 0) gaCall('addResourceEvent', 'Source', 'Blood', Math.floor(state.blood), 'Gameplay', 'RunWin');
}

// MAP REACHED: fired ONCE per map (2..N) when the player taps CONTINUE into the next map, so GA can measure how
// far the map-progression ladder pulls players (how many reach map 2, map 3, ...). One-shot per session via the
// state.mapReachedFired bitmask (bit (map-2) = map). Excludes cheated runs to keep the progression population clean,
// same rule as the minute funnel. NOT a progression-funnel stage (the per-map 20:00 funnel is reused as-is) - a
// standalone design event that carries the full run fields (incl. map=N), measured alongside Start/Minute/Complete.
export function trackAnalyticsMapReached(map) {
  if (!ANALYTICS_ENABLED || state.runCheated || map < 2) return;
  var bit = 1 << (map - 2);
  if ((state.mapReachedFired & bit) !== 0) return;   // already counted this map this session
  state.mapReachedFired |= bit;
  var fields = analyticsRunFields('map_reached');
  fields.map_reached = map;
  gaCall('addDesignEvent', 'Run:MapReached:m' + map, map, fields);
}

// Victory-screen button taps (continue / register-interest / buy-coffee) as design events, carrying the win
// run context so GA can correlate post-win intent with how the run went.
export function trackAnalyticsVictoryButton(which) {
  if (!ANALYTICS_ENABLED) return;
  var fields = analyticsRunFields('victory_button');
  fields.button = analyticsSlug(which);
  gaCall('addDesignEvent', 'Victory:Click:' + analyticsSlug(which), 1, fields);
}

export function trackAnalyticsUpgradePick(u, slot) {
  if (!ANALYTICS_ENABLED || u < 0 || u >= upgradeNames.length) return;
  var fields = analyticsRunFields('upgrade_pick');
  fields.upgrade = analyticsSlug(upgradeNames[u]);
  fields.slot = slot + 1;
  fields.count_after_pick = upgradeCounts[u];
  gaCall('addDesignEvent', 'Upgrade:Pick:' + analyticsSlug(upgradeNames[u]), player.level, fields);
}

// debug-API observability over private analytics state (read by main.js __perfStats / render_game_to_text).
export function analyticsState() {
  return {
    enabled: ANALYTICS_ENABLED,
    initialized: analyticsInitialized,
    userId: analyticsUserIdValue,
    events: window.__btAnalyticsEvents.length,
    upgrades: upgradeCountsSummary(),
    map: state.map,
    winSent: state.analyticsWinSent,
    milestonesFired: state.milestonesFired,
    attempts: stats.attempts,
    maxMinute: stats.maxMinute,
    maxLevel: stats.maxLevel,
    hasWon: stats.hasWon
  };
}

export function trackAnalyticsLoss(reason) {
  if (!ANALYTICS_ENABLED || state.analyticsLossSent) return;
  state.analyticsLossSent = true;
  recordRunProgress(false);   // roll maxMinute/maxLevel up from this run before reading fields
  if (state.runCheated) return;   // cheated run -> no Fail funnel emit (keeps the funnel a clean from-zero population)
  var fields = analyticsRunFields(reason || 'lost');
  fields.minute_reached = Math.floor(state.t / 60);   // explicit drop-off minute (death carries attempt#/max-level via run fields)
  var minuteBucket = 'm' + Math.min(60, Math.floor(state.t / 60));
  gaCall('addProgressionEvent', 'Fail', 'survival_run', 'main', 'run', Math.floor(state.t));
  gaCall('addDesignEvent', 'Run:Fail', Math.floor(state.t), fields);
  gaCall('addDesignEvent', 'Run:FailMinute:' + minuteBucket, 1, fields);
  if (state.blood > 0) gaCall('addResourceEvent', 'Source', 'Blood', Math.floor(state.blood), 'Gameplay', 'RunEnd');
}
