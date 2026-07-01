// Boot + the window.__* debug/harness API ONLY - zero game logic lives here. Wires every hook the
// harness + Tim's tools call (__startRun/__skipMin/__perfStats/render_game_to_text/advanceTime/cheats/
// __triggerUnleash/__spawnMoteBurst/__debugDamagePlayer/__buyTrack/__equipWeapon/__chooseUpgrade/...),
// then runs the boot tail: bail if no WebGL, init input, kick sprite load, load HUD images + meta +
// analytics, reset to the start screen (or AUTO_START minute), and start the frame loop.
import { fmtTime, clampInt, TWO_PI } from './lib/math.js?v=bm2';
import { rnd } from './lib/rng.js?v=bm2';
import {
  DIAG, DEBUG, CHEATS_ENABLED, ANALYTICS_ENABLED, OLD_SPRITES, OLD_ENV, OLD_TANK, OLD_DEATH, TANK_LAYERS,
  GORE_FX, BREAK_ENV, VEIN_FX, LEECH_FX, COLLIDERS, LOGIC_ONLY, START_MIN, AUTO_START,
  TUNE_MODE, TUNE_SHEET_URL, WIPE_SAVE, UNLOCK_ALL, LOCAL_BUILD
} from './flags.js?v=bm2';
import { BALANCE_SHEET_URL, loadBalanceFromSheet, exportBalanceCSV, tuneStatus } from './balance.js?v=bm2';
import { STEP, MAX_MOTES } from './config.js?v=bm2';
import {
  enemies, bullets, ebullets, floats, motes, particles, decals, corpses, tracks,
  player, state, view, sprites, econ, META, laser, input, upgradePick, WIN_SECONDS, rects, tankDebris
} from './state.js?v=bm2';
import { upgradeNames } from './data/upgrades.js?v=bm2';
import { perf, loafLog } from './core/time.js?v=bm2';
import { isMuted, audioCtxState, bufferCount, toggleMute, musicEnabledState, musicPlaying } from './audio.js?v=bm2';
import { gl } from './render/context.js?v=bm2';
import { loadHudImages, loadOldSpriteAssets } from './assets.js?v=bm2';
import { renderWorld } from './render/world.js?v=bm2';
import { renderHud } from './render/hud.js?v=bm2';
import { weaponName, tankRageLevel } from './game/meta.js?v=bm2';
import { laserRangeWorld } from './render/camera.js?v=bm2';
import { loadMeta, loadStats } from './persistence.js?v=bm2';
import { tgHydrate } from './tg.js?v=bm2';   // Telegram Mini App adapter (cloud saves / Stars-TON grants / ad-free); self-gates on TG_MODE
import { initAnalytics, analyticsState, makeAnalyticsRunId } from './analytics.js?v=bm2';
import { currentLeechLevel } from './systems/shared.js?v=bm2';
import { grantDailyCache } from './systems/loot.js?v=bm2';
import { spawnMote } from './fx/particles.js?v=bm2';
import { triggerUnleash } from './systems/combat.js?v=bm2';
import { gainXp, startLevelUp, chooseUpgrade, buyTrack, buyOrEquipWeapon } from './systems/progress.js?v=bm2';
import { resetGame, startRun, skipToMinute, cheatMoney, cheatMaxAll, cheatUnlockAll } from './game/session.js?v=bm2';
import { update } from './update.js?v=bm2';
import { resize, initInput } from './input.js?v=bm2';
import { startLoop } from './core/loop.js?v=bm2';

(function () {
  'use strict';

  if (!gl) {
    return;
  }

  // DEV/CHEAT + harness-control hooks, gated behind CHEATS_ENABLED (Tim 2026-06-25 public-build hardening): the
  // PUBLIC build exposes NONE of these (no console skip-to-minute / free money / force-levelup / etc.), so a
  // player can't trivialise the game from devtools. The read-only reporters (__perfStats, render_game_to_text)
  // stay ungated below. Test harnesses load with ?cheats/?debug (CHEATS_ENABLED) so they keep these hooks.
  if (CHEATS_ENABLED) {
    window.__skipMin = skipToMinute;
    window.__startRun = startRun;
    window.__openMenu = function () { resetGame(false, 0); };
    window.__cheatMoney = cheatMoney;
    window.__cheatMaxAll = cheatMaxAll;
    window.__toggleMute = toggleMute;
    window.__triggerUnleash = triggerUnleash;
    window.__buyTrack = buyTrack;
    window.__equipWeapon = buyOrEquipWeapon;
    window.__chooseUpgrade = chooseUpgrade;
    window.__startLevelUp = startLevelUp;
    window.__addXp = gainXp;
    // Debug: jump straight to the VICTORY screen. Ensures a live run, jams the clock just past the 20:00 win
    // threshold, then steps the sim once so the NORMAL update() win path fires (exercising the real milestone +
    // Run:Win analytics, not a shortcut). No-op if already on the win screen.
    window.__win = function () {
      if (state.mode === 'WIN') return window.__perfStats();
      if (state.mode !== 'PLAYING' || player.dead) startRun(0);
      state.t = WIN_SECONDS;
      update(STEP);
      return window.__perfStats();
    };
  }
  if (DEBUG) {
    window.__debugDamagePlayer = function (amount) {
      if (state.mode !== 'PLAYING') return window.__perfStats();
      player.hp -= amount == null ? player.maxHp + 1 : amount;
      update(STEP);
      return window.__perfStats();
    };
    // raw sim sample for the verify harness: proves the dying-state freeze (px/py/hp/level/enemy-positions
    // shouldn't advance once dead) + the ebullet cursor fix (distinct bolt slots). Read-only snapshot.
    // victory-screen hit-rects (read by the win-verify harness to tap CONTINUE/REGISTER INTEREST/BUY COFFEE
    // by real coordinate - rects is otherwise module-private). Only meaningful while state.mode==='WIN'.
    window.__winRects = function () {
      return { win_continue: rects.win_continue, win_interest: rects.win_interest, win_coffee: rects.win_coffee };
    };
    window.__reviveRect = function () { return rects.revive; };   // the RESURRECT button hit-rect (for the resurrect test harness)
    window.__uiRects = function () { return { play: rects.play, resume: rects.resume, quit: rects.quit, cheat: rects.cheat }; };   // menu/pause hit-rects (for the UI test harness)
    // Balance-probe read: a sample of live enemy {type, hp} so the curve probe can confirm spawn HP follows
    // the linear-per-minute model objectively (not just echo the formula). Read-only; DEBUG-gated like the rest.
    window.__debugEnemyHp = function (n) {
      n = n == null ? 12 : n;
      var arr = [];
      for (var i = 0; i < Math.min(enemies.count, n); i++) arr.push({ type: enemies.type[i], hp: +enemies.hp[i].toFixed(1) });
      return { count: enemies.count, t: +state.t.toFixed(1), sample: arr };
    };
    // Firing-range probe read: the distance (world units) from the tank to the NEAREST live enemy + the live
    // bullet count, so the verify harness can confirm the turret HOLDS fire when the nearest enemy is beyond
    // BALANCE.weapon.range and FIRES once one is inside it. Read-only; DEBUG-gated like the rest.
    window.__debugNearest = function () {
      var best = Infinity;
      for (var i = 0; i < enemies.count; i++) {
        var dx = enemies.x[i] - player.x, dy = enemies.y[i] - player.y;
        var d2 = dx * dx + dy * dy;
        if (d2 < best) best = d2;
      }
      return { count: enemies.count, nearestDist: enemies.count ? +Math.sqrt(best).toFixed(1) : null, bullets: bullets.count, t: +state.t.toFixed(2) };
    };
    window.__debugSample = function () {
      var ex = [];
      for (var i = 0; i < Math.min(enemies.count, 5); i++) ex.push([Math.round(enemies.x[i]), Math.round(enemies.y[i])]);
      var eb = [];
      for (var b = 0; b < Math.min(ebullets.count, 8); b++) eb.push([Math.round(ebullets.x[b]), Math.round(ebullets.y[b])]);
      var types = {};   // alive-enemy type histogram (confirms a single-type dev wave / which types are live)
      for (var ti = 0; ti < enemies.count; ti++) { var ty = enemies.type[ti]; types[ty] = (types[ty] || 0) + 1; }
      return {
        mode: state.mode, t: +state.t.toFixed(3), tick: state.tick, dead: player.dead, deathT: +state.deathT.toFixed(3),
        px: +player.x.toFixed(2), py: +player.y.toFixed(2), hp: +player.hp.toFixed(2), level: player.level,
        enemies: enemies.count, e5: ex, ebullets: ebullets.count, eb8: eb, cursor: ebullets.cursor, types: types
      };
    };
    // Hit-rect centre of a given enemy type's DEV-WAVE picker cell (rects.waveCells), so a harness can drive the
    // wave picker headlessly (the cheats screen must be open so drawDevCheats has populated rects.waveCells).
    window.__waveCell = function (type) {
      var wc = rects.waveCells;
      if (!wc) return null;
      for (var i = 0; i < wc.length; i++) if (wc[i].type === type) return { x: wc[i].x + wc[i].w / 2, y: wc[i].y + wc[i].h / 2 };
      return null;
    };
  }
  // Dump the CURRENT BALANCE as `key,value,description` CSV so Tim can seed the Google Sheet from the live
  // defaults (paste -> File>Share>Publish to web>CSV -> put the URL in balance.js BALANCE_SHEET_URL or ?sheet=).
  // Logs it (easy copy) AND returns the string. See BALANCE.md.
  window.__exportBalanceCSV = function () {
    var csv = exportBalanceCSV();
    if (DEBUG) { try { console.log(csv); } catch (e) {} }   // DEBUG-only log (CLAUDE.md: no console output in shipped code); always RETURNS the CSV
    return csv;
  };
  // Gated (Codex 2026-06-25): spawns free blood-motes (an upgrade-currency advantage), so the PUBLIC build must
  // not expose it. The resurrect-mote test harness loads with ?cheats/?debug, so it keeps the hook.
  if (CHEATS_ENABLED) {
    window.__spawnMoteBurst = function (count, ox, oy, value) {
      count = clampInt(count == null ? 40 : count, 1, MAX_MOTES);
      ox = ox == null ? 220 : ox;
      oy = oy == null ? 0 : oy;
      value = value == null ? 2 : value;
      for (var i = 0; i < count; i++) {
        var a = rnd() * TWO_PI;
        var r = Math.sqrt(rnd()) * 46;
        spawnMote(player.x + ox + Math.cos(a) * r, player.y + oy + Math.sin(a) * r, value + (i % 5 === 0 ? 3 : 0));
      }
    };
  }
  window.__perfStats = function () {
    var picks = state.mode === 'LEVELUP'
      ? [upgradeNames[upgradePick[0]], upgradeNames[upgradePick[1]], upgradeNames[upgradePick[2]]]
      : [];
    return {
      t: state.t, fps: perf.fps, frameMs: perf.frameMs, updateMs: perf.updateMs,
      renderMs: perf.renderMs, hudMs: perf.hudMs, worstMs: perf.worstMs,
      updateAvg: perf.updateAvg, renderAvg: perf.renderAvg,
      updateWorst: perf.updateWorst, renderWorst: perf.renderWorst,
      rafGap: perf.rafGap, loafs: perf.loafs, loafWorst: perf.loafWorst,
      enemies: enemies.count, bullets: bullets.count, ebullets: ebullets.count, floats: floats.count,
      dead: player.dead, deathT: state.deathT, map: state.map, level: player.level,
      revivePhase: state.revivePhase, reviveT: +state.reviveT.toFixed(2), assembleT: +state.assembleT.toFixed(2), reviveAvailable: state.reviveAvailable,
      motes: motes.count, moteInst: perf.moteInst, moteMerges: perf.moteMerges,
      particles: particles.count, decals: decals.count, instances: perf.instances,
      creatureDetails: perf.creatureDetails,
      oldSprites: OLD_SPRITES, spriteReady: sprites.ready, spriteLoaded: sprites.loaded,
      spritePending: sprites.pending, spriteDraws: perf.spriteDraws,
      spriteAnimated: perf.spriteAnimated, spriteStatic: perf.spriteStatic,
      spriteCulled: perf.spriteCulled, oldEnv: OLD_ENV, oldTank: OLD_TANK,
      oldDeath: OLD_DEATH, envSprites: perf.envSprites, corpseSprites: perf.corpseSprites,
      corpses: corpses.count, tankSprites: perf.tankSprites, tracks: tracks.count,
      tankLayers: TANK_LAYERS,
      tankDebris: { active: tankDebris.active, z: +tankDebris.z.toFixed(1), exploded: tankDebris.exploded, x: +tankDebris.x.toFixed(0), y: +tankDebris.y.toFixed(0), t: +tankDebris.t.toFixed(2) },
      tankTiers: {
        armor: econ.tankArmor, core: econ.tankCore, cannon: econ.tankCannon,
        treads: econ.tankTreads, thirst: econ.tankThirst, frenzy: econ.tankFrenzy
      },
      colliders: COLLIDERS, colliderMs: perf.colliderMs,
      cameraZoom: view.cameraZoom, viewWorldW: view.viewWorldW, viewWorldH: view.viewWorldH, shake: view.shake,
      useJoystick: input.useJoystick, joystickActive: input.joyActive,
      colliderPairs: perf.colliderPairs, colliderContacts: perf.colliderContacts,
      colliderSkipped: perf.colliderSkipped, colliderPush: perf.colliderPush,
      veinsEnabled: VEIN_FX, leechesEnabled: LEECH_FX,
      veins: perf.veins, veinInst: perf.veinInst,
      leechLevel: currentLeechLevel(), leeches: perf.leeches,
      leechInst: perf.leechInst, leechMs: perf.leechMs, tankFeelInst: perf.tankFeelInst,
      tankVeinInst: perf.tankVeinInst, tankBeat: +state.tankBeat.toFixed(2), tankBeatRate: +state.tankBeatRate.toFixed(2),
      goreEnabled: GORE_FX, gorePieces: perf.gorePieces, goreInst: perf.goreInst,
      splats: perf.splats, splatInst: perf.splatInst, goreMs: perf.goreMs,
      booms: perf.booms, boomInst: perf.boomInst,
      bubbles: perf.bubbles, bubbleInst: perf.bubbleInst,
      breakEnv: BREAK_ENV, envRocks: perf.envRocks,
      envContacts: perf.envContacts, envEnemyContacts: perf.envEnemyContacts, envBroken: perf.envBroken,
      economy: {
        damage: player.dmg, fireRate: player.fireRate, speed: player.speed,
        crush: player.crush, crushDps: player.crushDps, pickR: player.pickR,
        barrels: player.barrels, thirst: player.thirst, rangedHeal: player.rangedHeal,
        lashLvl: player.lashLvl, regen: player.regen, frenzyMul: player.frenzyMul,
        meter: player.meter, unleash: player.unleash, healGlow: player.healGlow, rage: tankRageLevel()
      },
      meta: {
        armor: META.armor, core: META.core, cannon: META.cannon,
        treads: META.treads, thirst: META.thirst, frenzy: META.frenzy
      },
      bank: econ.totalBank,
      bestTime: econ.bestTime,
      weapon: econ.equipWeapon,
      laserRange: laserRangeWorld(),
      laserActive: laser.t > 0,
      laserBeamLength: Math.sqrt((laser.x1 - laser.x0) * (laser.x1 - laser.x0) + (laser.y1 - laser.y0) * (laser.y1 - laser.y0)),
      weaponMeta: {
        cannon: econ.weaponMeta.cannon,
        flak: econ.weaponMeta.flak,
        laser: econ.weaponMeta.laser,
        missile: econ.weaponMeta.missile
      },
      ownedWeapons: econ.ownedWeapons,
      analytics: {
        enabled: ANALYTICS_ENABLED,
        initialized: analyticsState().initialized,
        userId: analyticsState().userId,
        runId: state.runId,
        events: window.__btAnalyticsEvents.length,
        lossSent: state.analyticsLossSent,
        winSent: state.analyticsWinSent,
        milestonesFired: state.milestonesFired,
        cheated: state.runCheated,
        attempts: analyticsState().attempts,
        maxMinute: analyticsState().maxMinute,
        maxLevel: analyticsState().maxLevel,
        hasWon: analyticsState().hasWon,
        upgrades: analyticsState().upgrades
      },
      audio: {
        muted: isMuted(),
        music: musicEnabledState(),
        musicPlaying: musicPlaying(),
        context: audioCtxState() || "none",
        samples: bufferCount()
      },
      mode: state.mode, paused: state.paused, diag: DIAG, level: player.level, xp: player.xp,
      xpNext: player.xpNext, upgrades: picks,
      tune: TUNE_MODE ? tuneStatus : ''   // ?tune sheet-override status ('' off / 'loading' / 'ok N keys' / 'fail: ... (defaults)') - VISIBLE so a fetch failure is never silent
    };
  };
  window.__loafs = function () { return loafLog.slice(); };
  window.render_game_to_text = function () {
    return [
      'Bloodtread ECS rebuild',
      'mode=' + state.mode + (state.paused ? ' paused' : '') + ' time=' + fmtTime(state.t) + ' enemies=' + enemies.count + ' bullets=' + bullets.count + ' motes=' + motes.count + '/' + perf.moteInst + ' merges=' + perf.moteMerges + ' particles=' + particles.count,
      'bank=' + Math.floor(econ.totalBank) + ' best=' + fmtTime(econ.bestTime) + ' weapon=' + weaponName(econ.equipWeapon) + ' laserRange=' + Math.round(laserRangeWorld()) + ' laserBeam=' + Math.round(Math.sqrt((laser.x1 - laser.x0) * (laser.x1 - laser.x0) + (laser.y1 - laser.y0) * (laser.y1 - laser.y0))) + ' owned=' + Object.keys(econ.ownedWeapons).join(','),
      'audio=' + (isMuted() ? 'muted' : (audioCtxState() || 'locked')) + ' music=' + (musicEnabledState() ? (musicPlaying() ? 'playing' : 'ready') : 'off') + ' samples=' + bufferCount(),
      'analytics=' + (ANALYTICS_ENABLED ? 'on' : 'off') + ' initialized=' + analyticsState().initialized + ' events=' + window.__btAnalyticsEvents.length + ' loss=' + state.analyticsLossSent + ' win=' + state.analyticsWinSent + ' milestones=' + state.milestonesFired + ' cheated=' + state.runCheated + ' attempts=' + analyticsState().attempts + ' maxMin=' + analyticsState().maxMinute + ' maxLvl=' + analyticsState().maxLevel + ' won=' + analyticsState().hasWon + ' upgrades=' + analyticsState().upgrades,
      'meta armor=' + META.armor + ' core=' + META.core + ' cannon=' + META.cannon + ' treads=' + META.treads + ' thirst=' + META.thirst + ' frenzy=' + META.frenzy + ' weaponTiers=' + econ.weaponMeta.cannon + '/' + econ.weaponMeta.flak + '/' + econ.weaponMeta.laser + '/' + econ.weaponMeta.missile,
      state.mode === 'LEVELUP' ? 'upgrades=1:' + upgradeNames[upgradePick[0]] + ' 2:' + upgradeNames[upgradePick[1]] + ' 3:' + upgradeNames[upgradePick[2]] : 'level=' + player.level + ' xp=' + Math.floor(player.xp) + '/' + player.xpNext,
      'fps=' + perf.fps.toFixed(1) + ' frame=' + perf.frameMs.toFixed(2) + ' update=' + perf.updateMs.toFixed(2) + ' render=' + perf.renderMs.toFixed(2) + ' detail=' + perf.creatureDetails,
      'camera zoom=' + view.cameraZoom.toFixed(2) + ' world=' + Math.round(view.viewWorldW) + 'x' + Math.round(view.viewWorldH) + ' joystick=' + (input.useJoystick ? (input.joyActive ? 'active' : 'ready') : 'off') + (TUNE_MODE ? ' tune=' + (tuneStatus || 'pending') : ''),
      'sprites=' + (OLD_SPRITES ? (sprites.ready ? 'old' : 'loading') : 'off') + ' draws=' + perf.spriteDraws + ' anim=' + perf.spriteAnimated + ' static=' + perf.spriteStatic,
      'oldenv=' + perf.envSprites + ' corpses=' + corpses.count + '/' + perf.corpseSprites + ' tank=' + perf.tankSprites,
      'tanktiers a=' + econ.tankArmor + ' c=' + econ.tankCannon + ' tr=' + econ.tankTreads + ' core=' + econ.tankCore + ' th=' + econ.tankThirst + ' fr=' + econ.tankFrenzy,
      'economy dmg=' + player.dmg.toFixed(1) + ' fire=' + player.fireRate.toFixed(1) + ' barrels=' + player.barrels + ' thirst=' + player.thirst + ' lash=' + player.lashLvl + ' pick=' + Math.round(player.pickR),
      'bloodletting meter=' + Math.round(player.meter) + ' unleash=' + player.unleash.toFixed(2) + ' flash=' + player.unleashFlash.toFixed(2) + ' rage=' + tankRageLevel().toFixed(2) + ' healGlow=' + player.healGlow.toFixed(2),
      'ebullets=' + ebullets.count + ' floats=' + floats.count + ' dead=' + player.dead + ' deathT=' + state.deathT.toFixed(2),
      'veins=' + perf.veins + '/' + perf.veinInst + ' leeches=' + perf.leeches + '/' + perf.leechInst + ' tankfx=' + perf.tankFeelInst + ' lvl=' + currentLeechLevel() + ' ms=' + perf.leechMs.toFixed(2),
      'gore=' + (GORE_FX ? 'on' : 'off') + ' pieces=' + perf.gorePieces + '/' + perf.goreInst + ' splats=' + perf.splats + '/' + perf.splatInst + ' ms=' + perf.goreMs.toFixed(2),
      'fx booms=' + perf.booms + '/' + perf.boomInst + ' bubbles=' + perf.bubbles + '/' + perf.bubbleInst + ' rocks=' + (BREAK_ENV ? 'on' : 'off') + ' visible=' + perf.envRocks + ' contact=' + perf.envContacts + ' enemyContact=' + perf.envEnemyContacts + ' broken=' + perf.envBroken,
      'colliders=' + (COLLIDERS ? 'on' : 'off') + ' ms=' + perf.colliderMs.toFixed(2) + ' pairs=' + perf.colliderPairs + ' contact=' + perf.colliderContacts,
      'loaf=' + perf.loafs + ' worst=' + perf.loafWorst.toFixed(1)
    ].join('\n');
  };
  window.advanceTime = function (ms) {
    var steps = Math.max(1, Math.round(ms / 1000 / STEP));
    for (var i = 0; i < steps; i++) update(STEP);
    if (!LOGIC_ONLY) renderWorld();
    renderHud();
    return window.__perfStats();
  };

  // boot tail (was the IIFE end + the mid-body `if (OLD_SPRITES) loadOldSpriteAssets()` lifted to here):
  resize();
  initInput();
  if (OLD_SPRITES) loadOldSpriteAssets();
  loadHudImages();
  // ?wipe: clear saved progress BEFORE loadMeta/loadStats so the run starts from a FRESH base (no old maxed
  // meta skewing the new 2.0s balance). Removes every bloodtread_rebuild_* key (meta/bank/best/stats/interest).
  // A legit progress reset, NOT a cheat (so it's ungated). Wrapped in try/catch - a storage failure must not
  // block boot. Analytics UID (a separate ga_* key in analytics.js) is intentionally left so cohorts persist.
  if (WIPE_SAVE) {
    try {
      var toRemove = [];
      for (var wi = 0; wi < localStorage.length; wi++) {
        var wk = localStorage.key(wi);
        if (wk && wk.indexOf('bloodtread_rebuild_') === 0) toRemove.push(wk);
      }
      for (var wj = 0; wj < toRemove.length; wj++) localStorage.removeItem(toRemove[wj]);
    } catch (e) {}
  }
  loadMeta();
  loadStats();
  tgHydrate();   // Telegram mode only: overlay the player's cloud save (merge-max) + drain queued product grants
  grantDailyCache();   // GORE CACHE: once-per-day free cache + login streak (after the cloud save is hydrated so it acts on merged state)
  if (UNLOCK_ALL) cheatUnlockAll();   // ?unlockall - Tim's "cheated all unlocked" review build (local save only)
  if (LOCAL_BUILD) window.__unlockAll = function () { cheatUnlockAll(); return 'ALL UNLOCKED - open the vault / forge'; };   // console convenience - LOCAL_BUILD only, never exposed on production
  initAnalytics();

  // resetGame seeds every player stat from BALANCE, so in ?tune mode the published-sheet overrides MUST land
  // FIRST. finishBoot is the post-override tail (reset to the start screen + start the loop); it runs straight
  // away in production, or after the CSV fetch resolves in ?tune mode. The fetch NEVER throws (it resolves with
  // the defaults intact on any failure - see balance.js), and finishBoot runs in BOTH the .then and .catch so a
  // bad sheet can't leave the game un-booted. Until the loop starts, nothing reads BALANCE, so the wait is safe.
  function finishBoot() {
    resetGame(AUTO_START, START_MIN);
    startLoop();
  }
  if (TUNE_MODE) {
    var sheetUrl = TUNE_SHEET_URL || BALANCE_SHEET_URL;
    loadBalanceFromSheet(sheetUrl).then(finishBoot, finishBoot);
  } else {
    finishBoot();
  }
})();
