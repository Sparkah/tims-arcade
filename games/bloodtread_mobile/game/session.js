// Run/session lifecycle + cheats: resetGame (full pool + player + state reset, applies meta, optional
// skip-to-minute), startRun, skipToMinute (fast-forward spawn + level boost), boostForMinute, and the
// cheat helpers. Orchestrates across player/leech/environment/enemies/progress/analytics/persistence.
import {
  enemies, bullets, ebullets, floats, motes, particles, decals, gore, splats, booms, bubbles, corpses, tracks, veins,
  player, state, econ, META, input, seenType, ui, upgradeCounts, laser, view, tankDebris
} from '../state.js?v=bm5';
import { AUTO_START, START_MIN } from '../flags.js?v=bm5';
import { MAX_ENEMIES } from '../config.js?v=bm5';
import { MAXTIER, upgradeNames } from '../data/upgrades.js?v=bm5';
import { WEAPONS } from '../data/weapons.js?v=bm5';
import { SKINS, RELICS, CONSUMABLES, RELIC_SLOTS } from '../data/loot.js?v=bm5';
import { T_UNLOCK } from '../data/enemies.js?v=bm5';
import { playTone } from '../audio.js?v=bm5';
import { saveMeta } from '../persistence.js?v=bm5';
import { resetPerfTiming } from '../core/time.js?v=bm5';
import { makeAnalyticsRunId, trackAnalyticsRunStart, trackAnalyticsMapReached } from '../analytics.js?v=bm5';
import { applyMetaToPlayer, syncTankTiersFromMeta, recomputeWeaponStats } from '../systems/player.js?v=bm5';
import { applyUpgradeId, nextXpForLevel } from '../systems/progress.js?v=bm5';
import { consumeRunStartItems } from '../systems/loot.js?v=bm5';
import { spawnEnemy } from '../systems/enemies.js?v=bm5';
import { resetLeeches } from '../systems/leech.js?v=bm5';
import { resetEnvironmentState } from '../systems/environment.js?v=bm5';
import { desiredEnemies } from '../systems/shared.js?v=bm5';
import { endJoystick } from '../input.js?v=bm5';

  export function cheatMoney() {
    econ.totalBank += 50000;
    saveMeta();
    playTone(620, 0.08, 0.04);
  }

  export function cheatMaxAll() {
    for (var k in META) META[k] = MAXTIER;
    for (var i = 0; i < WEAPONS.length; i++) econ.ownedWeapons[WEAPONS[i].id] = 1;
    for (var wmi = 0; wmi < WEAPONS.length; wmi++) econ.weaponMeta[WEAPONS[wmi].id] = MAXTIER;
    econ.totalBank = 999999;
    econ.equipWeapon = 'missile';
    saveMeta();
    syncTankTiersFromMeta();
    playTone(760, 0.12, 0.045);
  }

  // ALL UNLOCKED (Tim's "cheated all unlocked"): max forge + every weapon + the WHOLE Gore Cache collection
  // (every skin + every relic owned, a stack of caches/shards/consumables). Reachable via `?unlockall` at boot
  // (game/main.js) or window.__unlockAll() in the console. Local save only - no real money, no server grant.
  export function cheatUnlockAll() {
    cheatMaxAll();
    econ.caches = 50;
    econ.shards = 9999;
    econ.pity = 0;
    for (var s = 0; s < SKINS.length; s++) econ.ownedSkins[SKINS[s].id] = 1;
    for (var r = 0; r < RELICS.length; r++) econ.ownedRelics[RELICS[r].id] = 1;
    // equip a relic loadout + a non-default skin so the unlocked state is visible immediately
    econ.equipRelics = RELICS.slice(0, RELIC_SLOTS).map(function (rl) { return rl.id; });
    if (SKINS.length > 1) econ.equipSkin = SKINS[SKINS.length - 1].id;
    if (!econ.consumables) econ.consumables = {};
    for (var c = 0; c < CONSUMABLES.length; c++) econ.consumables[CONSUMABLES[c].id] = 9;
    saveMeta();
    syncTankTiersFromMeta();
    playTone(940, 0.16, 0.05);
  }

  export function cheatReset() {
    for (var k in META) META[k] = 0;
    for (var wmi = 0; wmi < WEAPONS.length; wmi++) econ.weaponMeta[WEAPONS[wmi].id] = 0;
    econ.ownedWeapons = { cannon: 1 };
    econ.equipWeapon = 'cannon';
    econ.totalBank = 0;
    econ.bestTime = 0;
    econ.selectedTrack = 'armor';
    saveMeta();
    syncTankTiersFromMeta();
    playTone(140, 0.08, 0.035);
  }

  // mapOverride: optional. Defaults to map 1 (a genuine fresh run). continueToNextMap passes the next map so the
  // reset run lands ON that map and its Run:Start analytics (fired at the tail) carries the correct map number.
  // inheritCheated: optional. When true, the reset run starts with runCheated=true (set BEFORE the tail Run:Start
  // emit) so a CONTINUE off a CHEATED win keeps the cheated lineage -> the new run emits NO funnel events. Without
  // it, resetGame clears runCheated (genuine fresh run), which would launder a cheated win into a clean map-2 run.
  export function resetGame(startPlaying, startMinute, mapOverride, inheritCheated) {
    endJoystick();
    input.pointerDown = false;
    input.pointerId = -1;
    if (startPlaying == null) startPlaying = AUTO_START;
    if (startMinute == null) startMinute = startPlaying ? START_MIN : 0;
    // These literals are immediately overwritten by applyMetaToPlayer() below (which seeds every stat from
    // BALANCE + the permanent meta tiers); they're kept as sane fallbacks in case the call order ever changes.
    player.x = 0; player.y = 0; player.vx = 0; player.vy = 0; player.hull = 0; player.turret = 0;
    player.r = 25; player.hp = 42; player.maxHp = 42; player.xp = 0; player.xpNext = 5; player.level = 1;
    player.speed = 205; player.crush = 9; player.crushDps = 48; player.dmg = 4; player.fireRate = 0.5;
    player.baseInterval = 2.0; player.baseDmg = 4; player.asBonus = 0; player.dmgBonus = 0;
    player.pickR = 135; player.thirst = 0; player.rangedHeal = false; player.barrels = 1; player.lashLvl = 0;
    player.regen = 0; player.frenzyMul = 1; player.meter = 0; player.unleash = 0; player.unleashFlash = 0; player.recoil = 0; player.hurt = 0;
    player.healGlow = 0; player.dead = false;
    applyMetaToPlayer();
    if (startPlaying) consumeRunStartItems(player);   // GORE CACHE one-shot consumables (overcharge/platelayer) apply ONLY when a real run starts
    player.xpNext = nextXpForLevel(player.level);   // XP to L2 from the BALANCE curve (= startXpNext); applyMetaToPlayer doesn't set xpNext
    state.mode = startPlaying ? 'PLAYING' : 'MENU'; state.t = 0; state.tick = 1; state.tankBeat = 0; state.tankBeatRate = 2.4; state.kills = 0; state.blood = 0;
    state.spawnCredit = 0; state.fireCd = 0; state.banner = ''; state.bannerT = 0; state.gameOverT = 0; state.deathT = 0; state.runBanked = false; state.paused = false;
    state.revivePhase = 'none'; state.reviveT = 0; state.assembleT = 0; state.reviveAvailable = true;   // Tim 2026-06-24: ONE resurrect PER BATTLE - re-arm reviveAvailable on every fresh run / map-continue (was session-scoped = once-EVER). The resurrect-CONTINUE (finishResurrect) does NOT call resetGame, so the revive stays consumed for the rest of THAT battle.
    state.analyticsLossSent = false;
    state.analyticsWinSent = false;
    state.milestonesFired = 0;
    state.map = (mapOverride && mapOverride > 1) ? (mapOverride | 0) : 1;   // map 1 for a genuine fresh run; the next map for CONTINUE
    state.mapReachedFired = 0;  // clear the per-map "reached" one-shot bitmask for the new session
    state.runCheated = !!inheritCheated;   // genuine fresh run by default; CONTINUE off a cheated win inherits cheated; skipToMinute (below) also flips it true
    state.forceType = -1;                  // clear any DEV enemy-wave override so a fresh run is the normal mixed spawn
    state.runId = startPlaying ? makeAnalyticsRunId() : '';
    upgradeCounts.fill(0);
    enemies.count = 0; bullets.count = 0; ebullets.count = 0; floats.count = 0; floats.healAccum = 0; motes.count = 0; particles.count = 0; decals.count = 0; corpses.count = 0; tracks.count = 0; veins.count = 0; gore.count = 0; splats.count = 0; booms.count = 0; bubbles.count = 0;
    ebullets.cursor = 0; decals.cursor = 0; particles.cursor = 0; corpses.cursor = 0; tracks.cursor = 0; veins.cursor = 0; gore.cursor = 0; splats.cursor = 0; booms.cursor = 0; bubbles.cursor = 0; tracks.acc = 0; veins.acc = 0; veins.unleashAcc = 0;
    laser.t = 0;
    laser.burstT = 0;
    laser.burstMax = 0;
    tankDebris.active = false; tankDebris.exploded = false;   // clear any in-flight death turret so a fresh run / map-continue starts clean
    view.shake = 0;   // clear any residual camera-shake trauma so a fresh run / map-continue starts steady
    syncTankTiersFromMeta();
    resetLeeches();
    resetEnvironmentState();
    seenType.fill(0);
    if (startPlaying && startMinute > 0) skipToMinute(startMinute);
    else resetPerfTiming();
    if (startPlaying) trackAnalyticsRunStart(startMinute || 0);
  }

  export function startRun(minute) {
    resetGame(true, minute || 0);
  }

  // Victory-screen CONTINUE: advance to the next map. Reuses the proven loop verbatim - a FRESH run (clock 0,
  // enemies cleared, 20:00 re-armed, full pool/player/state reset via resetGame) that lands ON the next map.
  // Higher map = harder spawns (systems/shared.js desiredEnemies + systems/enemies.js chooseType read state.map)
  // + a shifted ground palette (render/world.js mapGroundTint). Carries the player's META/economy untouched
  // (resetGame re-applies it), so map progression is "same tank, harder world". CHEATED-LINEAGE GATE: capture the
  // outgoing run's runCheated BEFORE resetGame clears it, and inherit it into the new run, so a CONTINUE off a
  // cheated (skip-to-minute) win keeps the cheated lineage - BOTH the map-N Run:Start AND Run:MapReached are then
  // suppressed (they early-return on runCheated), keeping the funnel a clean from-zero population.
  export function continueToNextMap() {
    var next = state.map + 1;
    var wasCheated = state.runCheated;
    resetGame(true, 0, next, wasCheated);   // fresh run on the next map; inherits cheated lineage so its Run:Start is suppressed when cheated
    trackAnalyticsMapReached(next);         // also early-returns on runCheated -> no MapReached for a cheated lineage
  }

  export function skipToMinute(min) {
    state.runCheated = true;   // a skip-to-minute jump (boot ?min=N, cheat min-9 button, or the in-run `9` key) pollutes the funnel -> exclude this run from ALL GA funnel events
    state.mode = 'PLAYING';
    state.paused = false;
    ui.upgradeHover = -1;
    boostForMinute(min);
    state.t = min * 60;
    for (var st = 0; st < seenType.length; st++) if (T_UNLOCK[st] <= min) seenType[st] = 1;
    state.spawnCredit = 0;
    var target = desiredEnemies();
    var guard = 0;
    while (enemies.count < target && guard++ < MAX_ENEMIES + 100) spawnEnemy();
    state.banner = 'MIN ' + min;
    state.bannerT = 1.2;
    resetPerfTiming();
  }

  // Cheat-only (skip-to-minute): fast-forward the build so a jumped-to minute looks roughly like a player who
  // earned it. Applies a batch of real level-up picks (which feed the additive dmgBonus/asBonus pools via
  // applyUpgradeId), then nudges the remaining stats. Damage/fire-rate are DERIVED now, so boost their additive
  // pools (dmgBonus/asBonus) and re-derive - NEVER multiply player.dmg/fireRate directly (recomputeWeaponStats
  // would overwrite it on the next pick/seed). asBonus is clamped to the cap inside recomputeWeaponStats.
  export function boostForMinute(min) {
    var targetLevel = 1 + Math.floor(min * 4.2);
    while (player.level < targetLevel) {
      applyUpgradeId((player.level - 1) % upgradeNames.length);
      player.level++;
    }
    player.maxHp += min * 16;
    player.hp = player.maxHp;
    player.crush += min * 1.8;
    player.crushDps *= 1 + min * 0.08;
    player.dmgBonus += min * 0.055;       // was player.dmg *= 1+min*0.055 (now additive into the dmg pool)
    player.asBonus += min * 0.035;        // was player.fireRate *= 1+min*0.035 (now additive into the AS pool)
    recomputeWeaponStats();               // re-derive dmg/fireRate from the boosted pools (clamps asBonus)
    player.pickR += min * 7;
    player.xp = 0;
    player.xpNext = nextXpForLevel(player.level);
    player.meter = 100;
  }
