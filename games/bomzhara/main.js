// Boot + frame loop. Sizes the GL + HUD canvases to the viewport (DPR-aware), wires input, and runs
// a fixed-timestep accumulator (Bloodtread loop idiom): step update(STEP), then renderWorld + renderHud.
import { gl, glCanvas, hudCanvas } from './render/context.js?v=20260801a';
import { view, cam, state, sprites, tapok } from './state.js?v=20260801a';
import { STEP, MAX_STEPS } from './config.js?v=20260801a';
import { updateCameraMetrics } from './render/camera.js?v=20260801a';
import { update, startRun, arena, chooseUpgrade, mapColliders, mapSolids, mapEnemyHoles, mapTapokSpots, mapEnemyEntrances, mapCircleBlocked, reloadMapSolidDefs, mapSolidSource, eventTuning } from './update.js?v=20260801a';
import { renderWorld, playerAnimationDebug, enemyFacingDebug } from './render/world.js?v=20260801a';
import { renderHud, hudRects, upRects, bomzharaArtStatus, resetHelpPage, moveHelpPage, getHelpPage } from './render/hud.js?v=20260801a';
import { loadGameSprites, gameSpriteArtStatus } from './render/assets.js?v=20260801a';
import { initInput, onPress } from './input.js?v=20260801a';
import { player, bullets, enemies, parts, pickups, puddles, squirrel, input } from './state.js?v=20260801a';
import { unlockGameAudio, toggleGameAudioMuted, audioDebug, setWindLevel } from './audio.js?v=20260801a';
import { T, getLocale, setLocale } from './texts.js?v=20260801a';

var DIFF_STORE = 'bomzhara:difficulty';
try {
  var storedDiff = window.localStorage && window.localStorage.getItem(DIFF_STORE);
  if (storedDiff === 'easy' || storedDiff === 'medium' || storedDiff === 'hard') state.difficulty = storedDiff;
} catch (e) {}
function setDifficulty(d) {
  state.difficulty = d;
  try { window.localStorage && window.localStorage.setItem(DIFF_STORE, d); } catch (e) {}
}

// Mutation-capable diagnostics are available only to the local browser harness.
// The public build keeps the read-only render_game_to_text snapshot below, but
// exposes no start/upgrade/time/map controls through the console.
var localQaHost = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
if (localQaHost) window.__BZ = {
  state: state, player: player, bullets: bullets, enemies: enemies, parts: parts, pickups: pickups, puddles: puddles, tapok: tapok, squirrel: squirrel, input: input,
  start: function () { startRun(); },
  chooseUpgrade: function (i) { chooseUpgrade(i); },
  setDifficulty: setDifficulty,
  reloadMapSolids: function () { return reloadMapSolidDefs(); },
  mapColliders: function () { return mapColliders(arena()).map(function (r) { return { id: r.id, type: r.type, x0: Math.round(r.x0), y0: Math.round(r.y0), x1: Math.round(r.x1), y1: Math.round(r.y1) }; }); },
  mapSolids: function () { return mapSolids(arena()).map(function (r) { return { id: r.id, x0: Math.round(r.x0), y0: Math.round(r.y0), x1: Math.round(r.x1), y1: Math.round(r.y1) }; }); },
  mapEnemyHoles: function () { return mapEnemyHoles(arena()).map(function (r) { return { id: r.id, x0: Math.round(r.x0), y0: Math.round(r.y0), x1: Math.round(r.x1), y1: Math.round(r.y1) }; }); },
  mapTapokSpots: function () { return mapTapokSpots(arena()).map(function (r) { return { id: r.id, x0: Math.round(r.x0), y0: Math.round(r.y0), x1: Math.round(r.x1), y1: Math.round(r.y1) }; }); },
  mapEnemyEntrances: function () { return mapEnemyEntrances(arena()).map(function (r) { return { id: r.id, type: r.type, x0: Math.round(r.x0), y0: Math.round(r.y0), x1: Math.round(r.x1), y1: Math.round(r.y1) }; }); },
  mapCircleBlocked: function (x, y, r) { return mapCircleBlocked(x, y, r || 1, arena()); },
  toggleAudio: toggleGameAudioMuted,
  audio: audioDebug,
};

function tapokDebugState() {
  var dx = player.x - tapok.x, dy = player.y - tapok.y, rr = tapok.safeR + player.r * 0.35;
  return {
    active: !!tapok.active,
    armed: !!tapok.armed,
    protected: !!(tapok.active && tapok.armed && dx * dx + dy * dy <= rr * rr),
    x: Math.round(tapok.x),
    y: Math.round(tapok.y),
    timer: +tapok.timer.toFixed(1),
    spawnCd: +tapok.spawnCd.toFixed(1),
    popupT: +tapok.popupT.toFixed(1),
    boomT: +tapok.boomT.toFixed(1),
  };
}

window.render_game_to_text = function () {
  var visibleEnemies = [];
  for (var i = 0; i < Math.min(enemies.count, 8); i++) {
    var vx = enemies.vx[i];
    var facing = enemyFacingDebug(i);
    visibleEnemies.push({ x: Math.round(enemies.x[i]), y: Math.round(enemies.y[i]), vx: Math.round(vx), facing: facing.logical, spriteFacing: facing.sprite, gate: !!enemies.gateActive[i], gateX: Math.round(enemies.gateX[i]), gateY: Math.round(enemies.gateY[i]), real: !!enemies.real[i], wander: !!enemies.wander[i], type: enemies.type[i] });
  }
  return JSON.stringify({
    coords: 'origin top-left, +x right, +y down, CSS pixels',
    mode: state.mode,
    endReason: state.endReason,
    language: getLocale(),
    ui: { menuPlay: T.menuPlay, pauseTitle: T.pauseTitle, helpTitle: T.helpTitle, vodkaLabel: T.barVodka, helpPage: getHelpPage() },
    difficulty: state.difficulty,
    timeLeft: Math.max(0, Math.ceil(state.goalTime - state.survived)),
    objective: 'survive until ambulance arrives',
    art: { bomzharaLoaded: bomzharaArtStatus.loaded, bomzharaError: bomzharaArtStatus.error, bomzharaDeathLoaded: bomzharaArtStatus.deathLoaded, bomzharaDeathError: bomzharaArtStatus.deathError, menuBgLoaded: bomzharaArtStatus.menuBgLoaded, menuBgError: bomzharaArtStatus.menuBgError, spritesLoaded: gameSpriteArtStatus.loaded, spritesPending: gameSpriteArtStatus.pending, spritesError: gameSpriteArtStatus.error },
    audio: audioDebug(),
    events: eventTuning(),
    map: { buildingLoaded: !!sprites.textures.map_building, source: mapSolidSource(), collisionRects: mapColliders(arena()).length, solidRects: mapSolids(arena()).length, enemyHoles: mapEnemyHoles(arena()).length, enemyEntrances: mapEnemyEntrances(arena()).length, tapokSpots: mapTapokSpots(arena()).length, playerBlocked: mapCircleBlocked(player.x, player.y, player.r, arena()) },
    animation: { spriteOverlays: true, projectileSpin: true, enemySpriteFacing: true, legacyEnemyShapes: false, fizzSnowFire: true },
    weird: { kind: state.weirdKind, t: +state.weirdT.toFixed(2), siren: +state.sirenPulse.toFixed(2), blackout: +state.blackoutPulse.toFixed(2), window: +state.windowPulse.toFixed(2), possessed: [state.possessedX, state.possessedY] },
    horrorSeen: state.horrorSeen,
    tutorial: { step: state.tutorStep, timer: +state.tutorT.toFixed(2) },
    input: { moveX: +input.moveX.toFixed(2), moveY: +input.moveY.toFixed(2) },
    player: { x: Math.round(player.x), y: Math.round(player.y), hp: +player.hp.toFixed(1), vodka: +player.vodka.toFixed(1), belochka: +player.belochka.toFixed(2) },
    playerAnimation: playerAnimationDebug(),
    firing: { fireCd: +player.fireCd.toFixed(2), attackT: +player.attackT.toFixed(2), attackMax: +player.attackMax.toFixed(2), throwQueued: !!player.throwQueued, throwT: +player.throwT.toFixed(2), fireMul: +player.up.fireMul.toFixed(2), steady: +player.up.steady.toFixed(2), recoil: +player.recoil.toFixed(2) },
    abilities: { molotov: player.up.molotov, ricochetSeek: player.up.ricochetSeek, shield: player.shield, shieldMax: player.up.shieldMax, ambulance: player.up.ambulance, wisdom: player.up.wisdom, tapok: tapokDebugState() },
    bullets: bullets.count,
    enemies: enemies.count,
    wanderers: (function () { var wn = 0; for (var wi = 0; wi < enemies.count; wi++) if (enemies.wander[wi] && enemies.real[wi]) wn++; return wn; })(),
    puddles: puddles.count,
    visibleEnemies: visibleEnemies,
    kills: state.kills,
    phantoms: state.phantoms,
    xp: +state.xp.toFixed(2),
    xpNext: +state.xpNext.toFixed(2),
    level: state.level,
  });
};

function inRect(r, x, y) { return r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }

function resize() {
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var w = window.innerWidth, h = window.innerHeight;
  view.cssW = w; view.cssH = h; view.dpr = dpr;
  glCanvas.width = Math.round(w * dpr); glCanvas.height = Math.round(h * dpr);
  glCanvas.style.width = w + 'px'; glCanvas.style.height = h + 'px';
  hudCanvas.width = Math.round(w * dpr); hudCanvas.height = Math.round(h * dpr);
  hudCanvas.style.width = w + 'px'; hudCanvas.style.height = h + 'px';
  if (gl) gl.viewport(0, 0, glCanvas.width, glCanvas.height);
  updateCameraMetrics();
  var a = arena(); cam.x = a.cx; cam.y = a.cy;
}

function press(x, y, isKey) {
  unlockGameAudio();
  if (isKey) {
    if (state.mode === 'MENU' || state.mode === 'DEAD' || state.mode === 'WIN') { startRun(); return true; }
    if (state.mode === 'UPGRADE') { chooseUpgrade(0); return true; }
    if (state.mode === 'PAUSE') { state.mode = 'PLAY'; return true; }
    if (state.mode === 'HELP') { state.mode = state.helpFrom === 'PAUSE' ? 'PAUSE' : 'PLAY'; return true; }
    return false;
  }
  if (state.mode === 'MENU' || state.mode === 'PAUSE') {
    for (var li = 0; li < hudRects.languages.length; li++) {
      if (inRect(hudRects.languages[li], x, y)) { setLocale(hudRects.languages[li].id); return true; }
    }
  }
  if (state.mode === 'MENU') {
    for (var di = 0; di < hudRects.diff.length; di++) {
      if (inRect(hudRects.diff[di], x, y)) { setDifficulty(hudRects.diff[di].id); return true; }
    }
  }
  if (state.mode === 'PLAY') {
    if (state.tutorStep === 2) { state.tutorStep = 3; state.tutorT = 2.6; return true; } // tutorial read-gate: any tap continues
    if (inRect(hudRects.pause, x, y)) { state.mode = 'PAUSE'; return true; }
    if (inRect(hudRects.help, x, y)) { state.helpFrom = 'PLAY'; resetHelpPage(); state.mode = 'HELP'; return true; }
  } else if (state.mode === 'PAUSE') {
    if (inRect(hudRects.resume, x, y)) { state.mode = 'PLAY'; return true; }
    if (inRect(hudRects.sound, x, y)) { toggleGameAudioMuted(); return true; }
    if (inRect(hudRects.toMenu, x, y)) { state.mode = 'MENU'; return true; }
    return true; // swallow stray taps so the joystick never grabs them under the overlay
  } else if (state.mode === 'HELP') {
    if (inRect(hudRects.helpPrev, x, y)) { moveHelpPage(-1); return true; }
    if (inRect(hudRects.helpNext, x, y)) { moveHelpPage(1); return true; }
    if (inRect(hudRects.back, x, y)) { state.mode = state.helpFrom === 'PAUSE' ? 'PAUSE' : 'PLAY'; return true; }
    return true;
  }
  if (state.mode === 'MENU' && inRect(hudRects.play, x, y)) { startRun(); return true; }
  if ((state.mode === 'DEAD' || state.mode === 'WIN') && inRect(hudRects.retry, x, y)) { startRun(); return true; }
  if ((state.mode === 'DEAD' || state.mode === 'WIN') && inRect(hudRects.toMenu, x, y)) { state.mode = 'MENU'; return true; }
  if (state.mode === 'UPGRADE') { for (var i = 0; i < upRects.length; i++) if (inRect(upRects[i], x, y)) { chooseUpgrade(i); return true; } return true; }
  return false;
}

var last = 0, acc = 0;
function stepFrame(dt) {
  update(dt);
}

if (localQaHost) window.advanceTime = function (ms) {
  var steps = Math.max(1, Math.round(ms / (1000 / 60)));
  for (var i = 0; i < steps; i++) update(STEP);
  renderWorld();
  renderHud();
};

function frame(now) {
  var gap = (now - last) / 1000; last = now;
  if (gap > 0.25) gap = 0.0167;
  acc += gap; var steps = 0;
  while (acc >= STEP && steps < MAX_STEPS) { stepFrame(STEP); acc -= STEP; steps++; }
  renderWorld();
  renderHud();
  updateWindAudio();
  requestAnimationFrame(frame);
}

// Ambient wind now lives in audio.js on the shared AudioContext + masterGain,
// so mute, tab-hide and ad pauses cover it like every other sound. It used to
// build its OWN context wired straight to destination, which meant muting the
// game left the wind audible, and its per-frame resume() defeated any suspend.
function updateWindAudio() {
  var target = (state.mode === 'PLAY' && state.weirdKind === 'window')
    ? 0.045 + (state.windowPulse || 0.2) * 0.075
    : 0;
  setWindLevel(target);
}

function boot() {
  if (!gl) return;                 // context.js already showed the WebGL2 fallback
  loadGameSprites();
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', function () { setTimeout(resize, 80); });
  initInput();
  onPress(press);
  window.addEventListener('keydown', function (e) {
    if (e.code !== 'KeyP') return;
    if (state.mode === 'PLAY') state.mode = 'PAUSE';
    else if (state.mode === 'PAUSE') state.mode = 'PLAY';
  });
  window.addEventListener('keydown', function (e) {
    if (e.code === 'KeyM' && !e.repeat) toggleGameAudioMuted();
  });
  state.mode = 'MENU';
  last = performance.now();
  requestAnimationFrame(frame);
}

boot();
