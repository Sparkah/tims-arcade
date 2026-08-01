// BULLET HELL BOMZHARA - simulation step. The enemy is you: vodka is ammo AND sanity, blood is your last
// reserve, белочка spawns the ghosts. The bomzh loves VODKA only - every other drink is a demon. Roguelite
// level-ups between the killing. Your own bounced bottles are dangerous too.
import { state, player, bullets, enemies, parts, pickups, puddles, squirrel, tapok, cam, view, input, rememberHorror } from './state.js?v=20260801a';
import { BAL, ARENA_INSET, BOOZE, UPGRADES } from './config.js?v=20260801a';
import { clamp, len, rand, randInt, TAU } from './lib/math.js?v=20260801a';
import { addTrauma } from './render/camera.js?v=20260801a';
import { loadMapSolidDefs, hasStoredMapSolidDefs, loadEventTuning } from './map-colliders.js?v=20260801a';
import { T } from './texts.js?v=20260801a';
import { playSfx } from './audio.js?v=20260801a';

export function arena() {
  return {
    x0: ARENA_INSET.side, y0: ARENA_INSET.top,
    x1: view.cssW - ARENA_INSET.side, y1: view.cssH - ARENA_INSET.bottom,
    cx: view.cssW * 0.5, cy: (ARENA_INSET.top + (view.cssH - ARENA_INSET.bottom)) * 0.5,
  };
}

var mapSolidDefs = null;
var EVT = loadEventTuning(); // builder-tunable event timing (tapok/waves/wanderers/weird/белочка)
var mapColliderCache = [];
var mapSolidCache = [];
var mapEnemyHoleCache = [];
var mapEnemyEntranceCache = [];
var bottomDoorEntranceCache = null;
var playerMove = { x: 0, y: 0, hit: false, nx: 0, ny: 0 };
var enemyMove = { x: 0, y: 0, hit: false, nx: 0, ny: 0 };
var bulletResolve = { x: 0, y: 0, hit: false, nx: 0, ny: 0 };
var spawnResolve = { x: 0, y: 0, hit: false, nx: 0, ny: 0 };

function getMapSolidDefs() {
  if (!mapSolidDefs) mapSolidDefs = loadMapSolidDefs();
  return mapSolidDefs;
}

export function reloadMapSolidDefs() {
  mapSolidDefs = loadMapSolidDefs();
  EVT = loadEventTuning();
  mapColliderCache.length = 0;
  mapSolidCache.length = 0;
  mapEnemyHoleCache.length = 0;
  mapTapokSpotCache.length = 0;
  mapEnemyEntranceCache.length = 0;
  bottomDoorEntranceCache = null;
  return mapSolidDefs;
}

export function mapSolidSource() {
  return hasStoredMapSolidDefs() ? 'localStorage' : 'default';
}

export function eventTuning() {
  return EVT;
}

export function difficultyMul() {
  return state.difficulty === 'easy' ? 1 / 5 : (state.difficulty === 'hard' ? 1.5 : 1); // easy = a fifth of medium's monster flow
}

function fillMapRects(a, type, cache) {
  a = a || arena();
  var fw = a.x1 - a.x0, fh = a.y1 - a.y0;
  var defs = getMapSolidDefs();
  var n = 0;
  for (var i = 0; i < defs.length; i++) {
    var d = defs[i], kind = d.type === 'enemy-hole' || d.type === 'tapok-spot' ? d.type : 'solid';
    if (type && kind !== type) continue;
    var r = cache[n];
    if (!r) r = cache[n] = { id: d.id, type: kind, x0: 0, y0: 0, x1: 0, y1: 0, cx: 0, cy: 0, hw: 0, hh: 0 };
    r.id = d.id; r.type = kind;
    r.x0 = a.x0 + fw * d.x; r.y0 = a.y0 + fh * d.y;
    r.x1 = r.x0 + fw * d.w; r.y1 = r.y0 + fh * d.h;
    r.cx = (r.x0 + r.x1) * 0.5; r.cy = (r.y0 + r.y1) * 0.5;
    r.hw = (r.x1 - r.x0) * 0.5; r.hh = (r.y1 - r.y0) * 0.5;
    n++;
  }
  cache.length = n;
  return cache;
}

export function mapColliders(a) {
  return fillMapRects(a, '', mapColliderCache);
}

export function mapSolids(a) {
  return fillMapRects(a, 'solid', mapSolidCache);
}

export function mapEnemyHoles(a) {
  return fillMapRects(a, 'enemy-hole', mapEnemyHoleCache);
}

var mapTapokSpotCache = [];
export function mapTapokSpots(a) {
  return fillMapRects(a, 'tapok-spot', mapTapokSpotCache);
}

function bottomDoorEntrance(a) {
  a = a || arena();
  var fw = a.x1 - a.x0, fh = a.y1 - a.y0;
  var d = { id: 'enemy-door-bottom', type: 'enemy-door', x: 0.4407, y: 0.7702, w: 0.2125, h: 0.1837 };
  var r = bottomDoorEntranceCache;
  if (!r) r = bottomDoorEntranceCache = { id: d.id, type: d.type, x0: 0, y0: 0, x1: 0, y1: 0, cx: 0, cy: 0, hw: 0, hh: 0 };
  r.x0 = a.x0 + fw * d.x; r.y0 = a.y0 + fh * d.y;
  r.x1 = r.x0 + fw * d.w; r.y1 = r.y0 + fh * d.h;
  r.cx = (r.x0 + r.x1) * 0.5; r.cy = (r.y0 + r.y1) * 0.5;
  r.hw = (r.x1 - r.x0) * 0.5; r.hh = (r.y1 - r.y0) * 0.5;
  return r;
}

export function mapEnemyEntrances(a) {
  a = a || arena();
  var holes = mapEnemyHoles(a), n = 0;
  for (var i = 0; i < holes.length; i++) mapEnemyEntranceCache[n++] = holes[i];
  mapEnemyEntranceCache[n++] = bottomDoorEntrance(a);
  mapEnemyEntranceCache.length = n;
  return mapEnemyEntranceCache;
}

export function stairHorrorExit(a) {
  a = a || arena();
  var fw = a.x1 - a.x0, fh = a.y1 - a.y0;
  var colliders = mapColliders(a);
  var stair = null;
  for (var i = 0; i < colliders.length; i++) {
    if (colliders[i].id === 'right-stairwell') { stair = colliders[i]; break; }
  }
  var x0, y0, x1, y1;
  if (stair) {
    x0 = stair.x0 - fw * 0.055;
    y0 = stair.y0 + fh * 0.035;
    x1 = stair.x1 + fw * 0.050;
    y1 = stair.y1 + fh * 0.025;
  } else {
    x0 = a.x0 + fw * 0.670;
    y0 = a.y0 + fh * 0.330;
    x1 = a.x0 + fw * 0.865;
    y1 = a.y0 + fh * 0.600;
  }
  x0 = clamp(x0, a.x0, a.x1);
  y0 = clamp(y0, a.y0, a.y1);
  x1 = clamp(x1, a.x0, a.x1);
  y1 = clamp(y1, a.y0, a.y1);
  return { x0: x0, y0: y0, x1: x1, y1: y1, x: (x0 + x1) * 0.5, y: (y0 + y1) * 0.5, w: x1 - x0, h: y1 - y0 };
}

export function mapCircleBlocked(x, y, r, a) {
  var solids = mapSolids(a);
  for (var i = 0; i < solids.length; i++) {
    var s = solids[i];
    var cx = clamp(x, s.x0, s.x1), cy = clamp(y, s.y0, s.y1);
    var dx = x - cx, dy = y - cy;
    if (dx * dx + dy * dy < r * r) return true;
  }
  return false;
}

function circleOverlapsEnemyHole(x, y, r, a) {
  var holes = mapEnemyHoles(a);
  var pad = r * 0.85;
  for (var i = 0; i < holes.length; i++) {
    var h = holes[i];
    if (x >= h.x0 - pad && x <= h.x1 + pad && y >= h.y0 - pad && y <= h.y1 + pad) return true;
  }
  return false;
}

export function resolveCircleAgainstMap(x, y, r, a, out, allowEnemyHoles) {
  out = out || { x: 0, y: 0, hit: false, nx: 0, ny: 0 };
  out.x = x; out.y = y; out.hit = false; out.nx = 0; out.ny = 0;
  var solids = mapSolids(a);
  var holes = allowEnemyHoles ? null : mapEnemyHoles(a); // holes are walls for the player, doors for monsters
  var total = solids.length + (holes ? holes.length : 0);
  for (var i = 0; i < total; i++) {
    var s = i < solids.length ? solids[i] : holes[i - solids.length];
    if (allowEnemyHoles && circleOverlapsEnemyHole(out.x, out.y, r, a)) continue;
    var cx = clamp(out.x, s.x0, s.x1), cy = clamp(out.y, s.y0, s.y1);
    var dx = out.x - cx, dy = out.y - cy, d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    var nx = 0, ny = 0, push = 0;
    if (d2 > 0.0001) {
      var d = Math.sqrt(d2);
      nx = dx / d; ny = dy / d; push = r - d + 0.05;
    } else {
      var left = Math.abs(out.x - s.x0), right = Math.abs(s.x1 - out.x);
      var top = Math.abs(out.y - s.y0), bottom = Math.abs(s.y1 - out.y);
      var m = Math.min(left, right, top, bottom);
      if (m === left) { nx = -1; push = r + left + 0.05; }
      else if (m === right) { nx = 1; push = r + right + 0.05; }
      else if (m === top) { ny = -1; push = r + top + 0.05; }
      else { ny = 1; push = r + bottom + 0.05; }
    }
    out.x += nx * push; out.y += ny * push;
    out.nx += nx; out.ny += ny; out.hit = true;
  }
  if (out.hit) {
    var nl = Math.hypot(out.nx, out.ny);
    if (nl > 0.0001) { out.nx /= nl; out.ny /= nl; }
  }
  // sanity: a resolve can only ever nudge by ~r; teleported/deep-overlap inputs must not explode
  if (!isFinite(out.x) || !isFinite(out.y) || Math.abs(out.x - x) > r * 6 || Math.abs(out.y - y) > r * 6) {
    out.x = x; out.y = y;
  }
  return out;
}

function moveCircleOnMap(x, y, dx, dy, r, a, out, allowEnemyHoles, allowOffscreen) {
  out = out || { x: 0, y: 0, hit: false, nx: 0, ny: 0 };
  var minX = allowOffscreen ? -r - 96 : a.x0 + r;
  var minY = allowOffscreen ? -r - 96 : a.y0 + r;
  var maxX = allowOffscreen ? view.cssW + r + 96 : a.x1 - r;
  var maxY = allowOffscreen ? view.cssH + r + 96 : a.y1 - r;
  out.x = x + dx; out.y = y; out.hit = false; out.nx = 0; out.ny = 0;
  resolveCircleAgainstMap(out.x, out.y, r, a, out, allowEnemyHoles);
  var hit = out.hit, nx = out.nx, ny = out.ny;
  out.x = clamp(out.x, minX, maxX);
  out.y = clamp(out.y + dy, minY, maxY);
  resolveCircleAgainstMap(out.x, out.y, r, a, out, allowEnemyHoles);
  hit = hit || out.hit; nx += out.nx; ny += out.ny;
  out.x = clamp(out.x, minX, maxX);
  out.y = clamp(out.y, minY, maxY);
  resolveCircleAgainstMap(out.x, out.y, r, a, out, allowEnemyHoles);
  out.hit = hit || out.hit; out.nx += nx; out.ny += ny;
  var nl = Math.hypot(out.nx, out.ny);
  if (nl > 0.0001) { out.nx /= nl; out.ny /= nl; }
  return out;
}

function bounceBulletFromNormal(i, nx, ny) {
  var dot = bullets.vx[i] * nx + bullets.vy[i] * ny;
  if (dot >= -0.001) return false;
  bullets.vx[i] -= 2 * dot * nx;
  bullets.vy[i] -= 2 * dot * ny;
  return true;
}

function stepBulletThroughWorld(i, dt, a, r) {
  var speed = Math.max(1, Math.hypot(bullets.vx[i], bullets.vy[i]));
  var steps = Math.max(1, Math.ceil(speed * dt / Math.max(2, r * 0.55)));
  var subDt = dt / steps;
  var hit = false;
  for (var s = 0; s < steps; s++) {
    bullets.x[i] += bullets.vx[i] * subDt;
    bullets.y[i] += bullets.vy[i] * subDt;
    var stepHit = false;
    if (bullets.x[i] < a.x0 + r) { bullets.x[i] = a.x0 + r; bullets.vx[i] = Math.abs(bullets.vx[i]); stepHit = true; }
    else if (bullets.x[i] > a.x1 - r) { bullets.x[i] = a.x1 - r; bullets.vx[i] = -Math.abs(bullets.vx[i]); stepHit = true; }
    if (bullets.y[i] < a.y0 + r) { bullets.y[i] = a.y0 + r; bullets.vy[i] = Math.abs(bullets.vy[i]); stepHit = true; }
    else if (bullets.y[i] > a.y1 - r) { bullets.y[i] = a.y1 - r; bullets.vy[i] = -Math.abs(bullets.vy[i]); stepHit = true; }
    resolveCircleAgainstMap(bullets.x[i], bullets.y[i], r, a, bulletResolve);
    if (bulletResolve.hit) {
      bullets.x[i] = bulletResolve.x; bullets.y[i] = bulletResolve.y;
      if (bounceBulletFromNormal(i, bulletResolve.nx, bulletResolve.ny)) stepHit = true;
    }
    hit = hit || stepHit;
    if (stepHit && bullets.kind[i] === 2) break;
  }
  return hit;
}

function applyMaxVodka() { player.maxVodka = BAL.maxVodka + player.up.vodkaMax; }

function tutorStored() { try { return localStorage.getItem('bomzhara:tutor_done') === '1'; } catch (e) { return true; } }
function markTutorDone() { try { localStorage.setItem('bomzhara:tutor_done', '1'); } catch (e) {} }

export function startRun() {
  reloadMapSolidDefs(); // pick up builder-saved colliders + event timings without a page reload
  var a = arena();
  player.up = { shots: 1, fireMul: 1, bounce: 0, dmgMul: 1, vodkaMax: 0, lifesteal: 0, speedMul: 1, pierce: false, ifrBonus: 0, steady: 1, molotov: 0, ricochetSeek: 0, shieldMax: 0, ambulance: 0, wisdom: 0, blessed: 0 };
  state.takenUpgrades = {};
  player.x = a.cx; player.y = a.cy; player.vx = player.vy = 0; player.face = 0;
  player.hp = player.maxHp = BAL.maxHp;
  applyMaxVodka(); player.vodka = BAL.startVodka;
  player.belochka = 0; player.fireCd = 0; player.recoil = 0; player.hurt = 0; player.iframe = 0;
  player.drinkGlow = 0; player.bloodFire = 0; player.shield = 0; player.shieldFlash = 0; player.shotSeq = 0; player.dead = false; player.step = 0;
  player.attackT = 0; player.attackMax = 0; player.attackSeq = 0;
  player.throwQueued = 0; player.throwT = 0; player.throwAim = 0; player.throwMiss = 0; player.throwKind = 0; player.throwShots = 0; player.throwSpread = 0; player.throwJit = 0; player.throwMolotov = 0;
  bullets.count = 0; enemies.count = 0; parts.count = 0; parts.cursor = 0; pickups.count = 0; puddles.count = 0; puddles.cursor = 0;
  squirrel.active = false; squirrel.talkT = 0;
  tapok.active = false; tapok.armed = false; tapok.x = 0; tapok.y = 0; tapok.r = BAL.tapokPickupR; tapok.safeR = BAL.tapokSafeRadius;
  tapok.blastR = BAL.tapokBlastRadius; tapok.timer = 0; tapok.max = EVT.tapokArmTime; tapok.spawnCd = EVT.tapokFirst; tapok.popupT = 0; tapok.boomT = 0; tapok.pulse = 0;
  state.score = 0; state.kills = 0; state.phantoms = 0; state.survived = 0;
  state.spawnCd = EVT.waveFirst; state.hallucCd = 4; state.shadowCd = 0.25; state.squirrelCd = EVT.squirrelFirst; state.wanderCd = EVT.wanderFirst;
  state.tutorStep = tutorStored() ? 4 : 0; state.tutorDist = 0; state.tutorT = 0;
  state.banner = ''; state.bannerT = 0; state.warp = 0; state.taughtBounce = false; state.taughtBlood = false; state.taughtMolotov = false; state.taughtTapok = false;
  state.weirdCd = EVT.weirdFirst; state.windowFired = false; state.possessedFired = false; state.weirdKind = ''; state.weirdT = 0; state.weirdMax = 0; state.weirdSeq = 0;
  state.sirenPulse = 0; state.blackoutPulse = 0; state.ambulancePulse = 0; state.possessedX = 0; state.possessedY = 0;
  state.windowPulse = 0; state.windX = 0; state.windY = 0; state.windowKillWarn = 0;
  state.xp = 0; state.xpNext = BAL.xpFirst; state.level = 1; state.upChoices = [];
  state.mode = 'PLAY'; state.t = 0;
}

// ---- particles ----
function addPart(x, y, vx, vy, r, life, col) {
  var i = parts.cursor;
  parts.x[i] = x; parts.y[i] = y; parts.vx[i] = vx; parts.vy[i] = vy;
  parts.r[i] = r; parts.life[i] = life; parts.max[i] = life; parts.col[i] = col;
  parts.cursor = (i + 1) % parts.x.length;
  if (parts.count < parts.x.length) parts.count++;
}
function burst(x, y, n, sp, r, col) { for (var i = 0; i < n; i++) { var a = rand(0, TAU), s = rand(0.3, 1) * sp; addPart(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.6, 1.2) * r, rand(0.3, 0.7), col); } }

function removePuddle(i) {
  var n = --puddles.count;
  if (i !== n) {
    puddles.x[i] = puddles.x[n]; puddles.y[i] = puddles.y[n]; puddles.r[i] = puddles.r[n];
    puddles.life[i] = puddles.life[n]; puddles.max[i] = puddles.max[n]; puddles.phase[i] = puddles.phase[n];
  }
}
function spawnPuddle(x, y, power) {
  var i;
  if (puddles.count < puddles.x.length) i = puddles.count++;
  else { i = puddles.cursor; puddles.cursor = (puddles.cursor + 1) % puddles.x.length; }
  var p = 1 + Math.max(0, power || 0) * 0.18;
  puddles.x[i] = x; puddles.y[i] = y; puddles.r[i] = BAL.molotovRadius * p;
  puddles.life[i] = puddles.max[i] = BAL.molotovLife * (0.9 + p * 0.12);
  puddles.phase[i] = rand(0, TAU);
  burst(x, y, 18 + (power || 0) * 4, 260, 4.5, 5);
  burst(x, y, 7, 120, 5.5, 6);
  addTrauma(0.34);
  if (!state.taughtMolotov) {
    state.taughtMolotov = true;
    state.banner = T.bannerFloorDrinks;
    state.bannerT = 2.7;
  }
}

function gainXp(v) {
  state.xp += v;
  if (state.mode === 'PLAY' && state.xp >= state.xpNext) levelUp();
}

// ---- enemies (the booze) ----
function chooseBooze() {
  var pool = [];
  for (var i = 0; i < BOOZE.length; i++) if (state.survived >= BOOZE[i].unlockT) pool.push(i);
  if (!pool.length) pool.push(0);
  return pool[(Math.random() * pool.length) | 0];
}

function holeSide(a, h) {
  var dTop = Math.abs(h.cy - a.y0);
  var dRight = Math.abs(a.x1 - h.cx);
  var dBottom = Math.abs(a.y1 - h.cy);
  var dLeft = Math.abs(h.cx - a.x0);
  var best = 0, bestD = dTop;
  if (dRight < bestD) { best = 1; bestD = dRight; }
  if (dBottom < bestD) { best = 2; bestD = dBottom; }
  if (dLeft < bestD) best = 3;
  return best;
}

function insideGateForHole(a, h, side, r) {
  var clearance = Math.max(24, r * 1.55);
  var ix = side === 1 ? -1 : (side === 3 ? 1 : 0);
  var iy = side === 0 ? 1 : (side === 2 ? -1 : 0);
  var gateX = h.cx;
  var gateY = h.cy;
  if (side === 0) gateY = h.y1 + clearance;
  else if (side === 1) gateX = h.x0 - clearance;
  else if (side === 2) gateY = h.y0 - clearance;
  else gateX = h.x1 + clearance;

  gateX = clamp(gateX, a.x0 + r, a.x1 - r);
  gateY = clamp(gateY, a.y0 + r, a.y1 - r);
  for (var tries = 0; tries < 6; tries++) {
    if (!mapCircleBlocked(gateX, gateY, r * 0.86, a)) return { x: gateX, y: gateY };
    gateX = clamp(gateX + ix * (clearance * 0.55 + 8), a.x0 + r, a.x1 - r);
    gateY = clamp(gateY + iy * (clearance * 0.55 + 8), a.y0 + r, a.y1 - r);
  }
  resolveCircleAgainstMap(gateX, gateY, r * 0.86, a, spawnResolve, true);
  return { x: spawnResolve.x, y: spawnResolve.y };
}

function holeSpawnPos(a, h, side, r) {
  // spawn INSIDE the hole itself; the gate then walks the monster out into the room.
  // Inset never exceeds half the rect, so thin holes degrade to spawning at the centre.
  var ix = Math.min(r * 0.35, h.hw * 0.9), iy = Math.min(r * 0.35, h.hh * 0.9);
  var x = clamp(h.cx + rand(-1, 1) * Math.max(0, h.hw - ix), h.x0 + ix, h.x1 - ix);
  var y = clamp(h.cy + rand(-1, 1) * Math.max(0, h.hh - iy), h.y0 + iy, h.y1 - iy);
  var gate = insideGateForHole(a, h, side, r);
  return { x: x, y: y, gateX: gate.x, gateY: gate.y, holeX: h.cx, holeY: h.cy, side: side, id: h.id };
}

function chooseSpawnEntrance(a, biasTowardPlayer, r) {
  var holes = mapEnemyHoles(a); // waves emerge from the visible holes only
  if (!holes.length) return null;
  if (!biasTowardPlayer || Math.random() >= BAL.spawnPlayerSideChance) {
    return holes[(Math.random() * holes.length) | 0];
  }
  var best = 0, bestD = 1e12;
  for (var i = 0; i < holes.length; i++) {
    var h = holes[i], side = holeSide(a, h), gate = insideGateForHole(a, h, side, r);
    var dx = gate.x - player.x, dy = gate.y - player.y, d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = i; }
  }
  return holes[best];
}

function edgePosForSide(a, side, r) {
  r = r || BAL.foeR;
  if (side === 0) return { x: a.cx + rand(-80, 80), y: -r - 54, gateX: a.cx, gateY: a.y0 + 42, side: side, id: 'fallback-top' };
  if (side === 1) return { x: view.cssW + r + 54, y: a.cy + rand(-80, 80), gateX: a.x1 - 42, gateY: a.cy, side: side, id: 'fallback-right' };
  if (side === 2) return { x: a.cx + rand(-80, 80), y: view.cssH + r + 54, gateX: a.cx, gateY: a.y1 - 42, side: side, id: 'fallback-bottom' };
  return { x: -r - 54, y: a.cy + rand(-80, 80), gateX: a.x0 + 42, gateY: a.cy, side: side, id: 'fallback-left' };
}
function nearestPlayerEdge(a) {
  var d = [
    player.y - a.y0,
    a.x1 - player.x,
    a.y1 - player.y,
    player.x - a.x0
  ];
  var best = 0, tie = [0];
  for (var i = 1; i < 4; i++) {
    if (d[i] < d[best] - 0.001) { best = i; tie.length = 0; tie.push(i); }
    else if (Math.abs(d[i] - d[best]) <= 0.001) tie.push(i);
  }
  return tie[(Math.random() * tie.length) | 0];
}
function edgePos(a, biasTowardPlayer, r) {
  var hole = chooseSpawnEntrance(a, biasTowardPlayer, r || BAL.foeR);
  if (hole) return holeSpawnPos(a, hole, holeSide(a, hole), r || BAL.foeR);
  if (biasTowardPlayer) return null;
  var side = randInt(0, 3);
  if (biasTowardPlayer) {
    var target = nearestPlayerEdge(a);
    if (Math.random() < BAL.spawnPlayerSideChance) side = target;
    else { do { side = randInt(0, 3); } while (side === target); }
  }
  return edgePosForSide(a, side, r);
}
function spawnReal(type, atX, atY, scale) {
  if (enemies.count >= enemies.x.length) return;
  var bz = BOOZE[type], a = arena(); scale = scale || 1;
  var er = bz.r * scale * rand(0.92, 1.08);
  var pos = (atX === undefined) ? edgePos(a, true, er + 4) : { x: atX, y: atY };
  if (!pos) return;
  if (atX !== undefined && mapCircleBlocked(pos.x, pos.y, er * 0.88, a)) {
    resolveCircleAgainstMap(pos.x, pos.y, er * 0.88, a, spawnResolve, true);
    pos.x = spawnResolve.x; pos.y = spawnResolve.y;
  }
  var i = enemies.count++;
  enemies.x[i] = pos.x; enemies.y[i] = pos.y; enemies.vx[i] = 0; enemies.vy[i] = 0;
  enemies.real[i] = 1; enemies.type[i] = type;
  enemies.hp[i] = enemies.maxHp[i] = bz.hp * scale;
  enemies.r[i] = er;
  enemies.gateX[i] = pos.gateX || 0; enemies.gateY[i] = pos.gateY || 0; enemies.gateActive[i] = pos.gateX === undefined ? 0 : 1;
  enemies.wander[i] = 0;
  enemies.phase[i] = rand(0, TAU); enemies.seed[i] = rand(0, 100); enemies.hitT[i] = 0;
}
function spawnHalluc() {
  if (enemies.count >= enemies.x.length) return;
  var a = arena(), pos = edgePos(a, false, BAL.foeR), i = enemies.count++;
  enemies.x[i] = pos.x; enemies.y[i] = pos.y; enemies.vx[i] = 0; enemies.vy[i] = 0;
  enemies.real[i] = 0; enemies.type[i] = 0;
  enemies.hp[i] = enemies.maxHp[i] = 1; enemies.r[i] = BAL.foeR * rand(0.85, 1.2);
  enemies.gateX[i] = 0; enemies.gateY[i] = 0; enemies.gateActive[i] = 0; enemies.wander[i] = 0;
  enemies.phase[i] = rand(0, TAU); enemies.seed[i] = rand(0, 100); enemies.hitT[i] = 0;
}

// -- ambient roamers: the snow outside the building is not empty --
var buildingBoundsCache = { x0: 0, y0: 0, x1: 0, y1: 0 };
function buildingBounds(a) {
  var s = mapSolids(a), b = buildingBoundsCache;
  b.x0 = a.x1; b.y0 = a.y1; b.x1 = a.x0; b.y1 = a.y0;
  for (var i = 0; i < s.length; i++) {
    if (s[i].x0 < b.x0) b.x0 = s[i].x0;
    if (s[i].y0 < b.y0) b.y0 = s[i].y0;
    if (s[i].x1 > b.x1) b.x1 = s[i].x1;
    if (s[i].y1 > b.y1) b.y1 = s[i].y1;
  }
  return b;
}
function randomOutsidePoint(a, r) {
  var b = buildingBounds(a);
  for (var tries = 0; tries < 16; tries++) {
    var x = rand(a.x0 + r, a.x1 - r);
    var y = rand(a.y0 + r, a.y1 - r);
    if (x > b.x0 - r && x < b.x1 + r && y > b.y0 - r && y < b.y1 + r) continue; // inside/near the building
    if (mapCircleBlocked(x, y, r, a)) continue;
    return { x: x, y: y };
  }
  return null;
}
function spawnWanderer() {
  if (enemies.count >= enemies.x.length) return false;
  var a = arena(), type = chooseBooze(), bz = BOOZE[type];
  var er = bz.r * rand(0.9, 1.05);
  var pos = randomOutsidePoint(a, er + 6);
  if (!pos) return false;
  var i = enemies.count++;
  enemies.x[i] = pos.x; enemies.y[i] = pos.y; enemies.vx[i] = 0; enemies.vy[i] = 0;
  enemies.real[i] = 1; enemies.type[i] = type;
  enemies.hp[i] = enemies.maxHp[i] = bz.hp;
  enemies.r[i] = er;
  enemies.wander[i] = 1; enemies.gateActive[i] = 0;
  var wp = randomOutsidePoint(a, er + 6) || pos;
  enemies.gateX[i] = wp.x; enemies.gateY[i] = wp.y; // wander waypoint reuses the gate slot
  enemies.phase[i] = rand(0, TAU); enemies.seed[i] = rand(0, 100); enemies.hitT[i] = 0;
  return true;
}
function pointVisibleForAttack(x, y, r, a) {
  if (x < a.x0 - r || x > a.x1 + r || y < a.y0 - r || y > a.y1 + r) return false;
  var dx = x - player.x, dy = y - player.y;
  var dist = Math.max(1, Math.hypot(dx, dy));
  var steps = Math.max(1, Math.ceil(dist / 18));
  for (var s = 1; s < steps; s++) {
    var t = s / steps;
    if (mapCircleBlocked(player.x + dx * t, player.y + dy * t, 4, a)) return false;
  }
  return true;
}
function spawnShadowHalluc() {
  if (enemies.count >= enemies.x.length) return false;
  var a = arena(), r = BAL.foeR * rand(0.7, 0.9);
  var x = player.x + 130, y = player.y;
  for (var tries = 0; tries < 12; tries++) {
    var ang = rand(0, TAU), dist = rand(105, 210);
    var tx = clamp(player.x + Math.cos(ang) * dist, a.x0 + 70, a.x1 - 70);
    var ty = clamp(player.y + Math.sin(ang) * dist, a.y0 + 70, a.y1 - 70);
    if (!mapCircleBlocked(tx, ty, r, a) && pointVisibleForAttack(tx, ty, r, a)) { x = tx; y = ty; break; }
  }
  var i = enemies.count++;
  enemies.x[i] = x; enemies.y[i] = y; enemies.vx[i] = 0; enemies.vy[i] = 0;
  enemies.real[i] = 0; enemies.type[i] = 0;
  enemies.hp[i] = enemies.maxHp[i] = 1; enemies.r[i] = r;
  enemies.gateX[i] = 0; enemies.gateY[i] = 0; enemies.gateActive[i] = 0; enemies.wander[i] = 0;
  enemies.phase[i] = rand(0, TAU); enemies.seed[i] = rand(0, 100); enemies.hitT[i] = 0;
  return true;
}
function tapokProtectsPlayer() {
  if (!tapok.active || !tapok.armed) return false;
  var dx = player.x - tapok.x, dy = player.y - tapok.y, rr = tapok.safeR + player.r * 0.35;
  return dx * dx + dy * dy <= rr * rr;
}
function spawnTapok() {
  if (tapok.active || tapok.boomT > 0) return false;
  var a = arena(), r = BAL.tapokPickupR;
  var x = a.cx, y = a.cy + 86;
  var spots = mapTapokSpots(a);
  var placed = false;
  if (spots.length) {
    // designer-placed spawn spots from the level builder win over random placement;
    // per-axis insets capped by the spot size so tiny spots degrade to their centre
    for (var st = 0; st < 18 && !placed; st++) {
      var spot = spots[(Math.random() * spots.length) | 0];
      var ix = Math.min(r * 0.4, spot.hw * 0.9), iy = Math.min(r * 0.4, spot.hh * 0.9);
      var sx = clamp(spot.cx + rand(-1, 1) * Math.max(0, spot.hw - ix), spot.x0 + ix, spot.x1 - ix);
      var sy = clamp(spot.cy + rand(-1, 1) * Math.max(0, spot.hh - iy), spot.y0 + iy, spot.y1 - iy);
      if (mapCircleBlocked(sx, sy, r * 0.85, a)) continue;
      x = sx; y = sy; placed = true;
    }
  }
  if (spots.length && !placed) return false; // edge spots only: retry in 2s rather than ever landing mid-room
  if (!placed) {
    // no spots defined at all: legacy near-player placement
    for (var tries = 0; tries < 18; tries++) {
      var ang = rand(0, TAU), dist = rand(95, 255);
      var tx = clamp(player.x + Math.cos(ang) * dist, a.x0 + r + 40, a.x1 - r - 40);
      var ty = clamp(player.y + Math.sin(ang) * dist, a.y0 + r + 40, a.y1 - r - 40);
      if (mapCircleBlocked(tx, ty, r * 0.85, a)) continue;
      if (!pointVisibleForAttack(tx, ty, r, a)) continue;
      x = tx; y = ty; break;
    }
  }
  tapok.active = true; tapok.armed = false;
  tapok.x = x; tapok.y = y; tapok.r = r; tapok.safeR = BAL.tapokSafeRadius; tapok.blastR = BAL.tapokBlastRadius;
  tapok.timer = EVT.tapokArmTime; tapok.max = EVT.tapokArmTime; tapok.popupT = state.taughtTapok ? 2.6 : 5.4; tapok.pulse = 0;
  state.taughtTapok = true;
  state.banner = T.bannerTapokSpawn;
  state.bannerT = 1.5;
  return true;
}
function explodeTapok() {
  if (!tapok.active) return;
  var a = arena();
  var x = tapok.x, y = tapok.y, blast = tapok.blastR;
  tapok.active = false; tapok.armed = false; tapok.timer = 0; tapok.popupT = 0; tapok.boomT = 0.6;
  tapok.spawnCd = EVT.tapokEveryMin > 0 ? EVT.tapokEveryMin + Math.random() * EVT.tapokEveryRand : 1e9; // everyMin 0 = single tapok per run
  playSfx('bottleImpact', 1.22);
  burst(x, y, 34, 520, 6, 5);
  burst(x, y, 18, 260, 4.6, 6);
  addTrauma(0.85);
  for (var i = enemies.count - 1; i >= 0; i--) {
    var dx = enemies.x[i] - x, dy = enemies.y[i] - y, d = Math.max(1, Math.hypot(dx, dy));
    var reach = blast + enemies.r[i];
    if (d > reach) continue;
    var fall = 1 - d / reach;
    var nx = dx / d, ny = dy / d;
    enemies.hp[i] -= BAL.tapokBlastDamage * (0.45 + fall * 0.75);
    enemies.hitT[i] = Math.max(enemies.hitT[i], 0.22);
    moveCircleOnMap(enemies.x[i], enemies.y[i], nx * BAL.tapokBlastPush * fall * 0.18, ny * BAL.tapokBlastPush * fall * 0.18, enemies.r[i] * 0.86, a, enemyMove, true, true);
    enemies.x[i] = enemyMove.x; enemies.y[i] = enemyMove.y;
    enemies.vx[i] += nx * BAL.tapokBlastPush * fall;
    enemies.vy[i] += ny * BAL.tapokBlastPush * fall;
    if (enemies.hp[i] <= 0) killFoe(i);
  }
  state.banner = T.bannerTapokBoom;
  state.bannerT = 1.7;
}
function keepEnemyOutOfTapok(i, a, oldX, oldY, dt) {
  if (!tapok.active || !tapok.armed) return;
  var dx = enemies.x[i] - tapok.x, dy = enemies.y[i] - tapok.y, d = Math.max(0.001, Math.hypot(dx, dy));
  var min = tapok.safeR + enemies.r[i] * 0.86;
  if (d >= min) return;
  var nx = dx / d, ny = dy / d;
  if (d < 2) { nx = Math.cos(enemies.seed[i]); ny = Math.sin(enemies.seed[i]); }
  enemies.x[i] = tapok.x + nx * min;
  enemies.y[i] = tapok.y + ny * min;
  resolveCircleAgainstMap(enemies.x[i], enemies.y[i], enemies.r[i] * 0.86, a, enemyMove, true);
  enemies.x[i] = enemyMove.x; enemies.y[i] = enemyMove.y;
  enemies.vx[i] = (enemies.x[i] - oldX) / Math.max(0.001, dt);
  enemies.vy[i] = (enemies.y[i] - oldY) / Math.max(0.001, dt);
  enemies.hitT[i] = Math.max(enemies.hitT[i], 0.06);
}
function updateTapok(dt, a) {
  if (tapok.boomT > 0) tapok.boomT = Math.max(0, tapok.boomT - dt);
  if (tapok.popupT > 0) tapok.popupT = Math.max(0, tapok.popupT - dt);
  if (!tapok.active) {
    tapok.spawnCd -= dt;
    if (tapok.spawnCd <= 0) {
      if (!spawnTapok()) tapok.spawnCd = 2.0;
    }
    return;
  }
  tapok.pulse += dt;
  var dx = player.x - tapok.x, dy = player.y - tapok.y, armR = tapok.r + player.r * 0.8;
  if (!tapok.armed && dx * dx + dy * dy <= armR * armR) {
    tapok.armed = true;
    tapok.timer = EVT.tapokArmTime;
    tapok.popupT = Math.max(tapok.popupT, 2.8);
    state.banner = T.bannerTapokArmed;
    state.bannerT = 2.3;
    addTrauma(0.18);
  }
  if (tapok.armed) {
    tapok.timer -= dt;
    if (tapok.timer <= 0) explodeTapok();
  }
}
function removeFoe(i) { var n = --enemies.count; if (i !== n) { for (var k in enemies) { var arr = enemies[k]; if (arr && arr.length) arr[i] = arr[n]; } } }

function dropPickup(x, y, kind) {
  if (pickups.count >= pickups.x.length) return;
  var p = pickups.count++;
  pickups.x[p] = x; pickups.y[p] = y; pickups.vy[p] = -0.6; pickups.r[p] = kind === 1 ? 12 : 13;
  pickups.phase[p] = rand(0, TAU); pickups.kind[p] = kind;
}

function killFoe(i) {
  var x = enemies.x[i], y = enemies.y[i], real = enemies.real[i], type = enemies.type[i], full = enemies.maxHp[i];
  if (real) {
    var bz = BOOZE[type];
    burst(x, y, 12, 180, 5, 1);
    state.kills++; state.score += 10;
    player.belochka = clamp(player.belochka - BAL.belochkaKillCalm, 0, 1);   // killing the demon steadies you
    if (player.up.lifesteal > 0) player.hp = Math.min(player.maxHp, player.hp + player.up.lifesteal * BAL.lifestealHeal);
    var roll = Math.random();
    if (roll < BAL.zakuskaDropChance) dropPickup(x, y, 1);
    else if (roll < BAL.zakuskaDropChance + BAL.vodkaDropChance) dropPickup(x, y, 0);
    // champagne fizzes into smaller ones (only full-size splits, no infinite chain)
    // shards chase (an aggroed/killed wanderer's children are already angry; they can enter via the holes)
    if (bz.split && full >= bz.hp * 0.9) {
      for (var s = 0; s < bz.split; s++) spawnReal(type, x, y, 0.55);
    }
    addTrauma(0.2);
    gainXp(bz.xp);
  } else {
    burst(x, y, 10, 140, 4, 2);
    state.phantoms++;
    player.belochka = clamp(player.belochka + BAL.belochkaPerPhantom, 0, 1);  // you shot a ghost -> losing it
  }
  removeFoe(i);
}

// ---- roguelite level-up ----
var REPEATABLE_UPGRADES = { shots: true, fireRate: true }; // everything else is once per run
function pickUpgrades() {
  var avail = [];
  for (var i = 0; i < UPGRADES.length; i++) {
    var id = UPGRADES[i].id;
    if (!REPEATABLE_UPGRADES[id] && state.takenUpgrades && state.takenUpgrades[id]) continue;
    avail.push(i);
  }
  state.upChoices = []; var guard = 0, want = Math.min(avail.length, 3 + Math.min(1, player.up.wisdom || 0));
  while (state.upChoices.length < want && guard++ < 100) { var k = avail[(Math.random() * avail.length) | 0]; if (state.upChoices.indexOf(k) < 0) state.upChoices.push(k); }
}
function levelUp() {
  state.level++; state.xp -= state.xpNext; if (state.xp < 0) state.xp = 0;
  state.xpNext = Math.ceil(state.xpNext * BAL.xpGrow) + 2;
  pickUpgrades();
  if (!state.upChoices.length) return; // every upgrade taken: keep playing, no empty picker
  state.mode = 'UPGRADE';
}
export function chooseUpgrade(i) {
  var k = state.upChoices[i]; if (k == null) return;
  var shieldBefore = player.up.shieldMax;
  var ambulanceBefore = player.up.ambulance;
  var blessedBefore = player.up.blessed || 0;
  UPGRADES[k].fn(player.up);
  if (!state.takenUpgrades) state.takenUpgrades = {};
  state.takenUpgrades[UPGRADES[k].id] = (state.takenUpgrades[UPGRADES[k].id] || 0) + 1;
  if ((player.up.blessed || 0) > blessedBefore) {
    // перекреститься: +5 to both current and max blood (10 -> 15 on the spot)
    player.maxHp += 5;
    player.hp += 5;
  }
  applyMaxVodka();
  if (player.up.shieldMax > shieldBefore) {
    player.shield = Math.min(player.up.shieldMax, player.shield + 1);
    player.shieldFlash = 1;
  }
  if (player.up.ambulance > ambulanceBefore) {
    state.survived = Math.min(state.goalTime - 1, state.survived + BAL.ambulanceSkip);
    state.spawnCd = Math.min(state.spawnCd, 0.08);
    state.ambulancePulse = 1;
    var kick = Math.max(1, Math.round((BAL.ambulanceSpawnKick + player.up.ambulance) * difficultyMul()));
    for (var w = 0; w < kick; w++) spawnReal(chooseBooze());
    state.banner = T.bannerAmbulanceHears;
    state.bannerT = 3.0;
    addTrauma(0.6);
  }
  player.vodka = clamp(player.vodka + 15, 0, player.maxVodka);   // a swig as a reward
  state.mode = 'PLAY';
}

// ---- weird visual events with gameplay teeth ----
function startWeird(kind) {
  state.weirdKind = kind;
  state.weirdT = kind === 'siren' ? 4.7 : (kind === 'possessed' ? 5.2 : (kind === 'window' ? 6.4 : 5.6));
  state.weirdMax = state.weirdT;
  state.weirdSeq++;
  if (kind === 'siren') {
    state.possessedX = 0; state.possessedY = 0;
    player.belochka = clamp(player.belochka - 0.08, 0, 1);
    state.banner = T.bannerSiren;
    state.bannerT = 2.5;
    addTrauma(0.28);
  } else if (kind === 'blackout') {
    state.possessedX = 0; state.possessedY = 0;
    rememberHorror('blackout');
    state.banner = T.bannerBlackout;
    state.bannerT = 2.4;
    addTrauma(0.42);
  } else if (kind === 'possessed') {
    rememberHorror('possessed');
    var dirs = [[1,0],[-1,0],[0,-1],[0,1]], d = dirs[randInt(0, dirs.length - 1)];
    state.possessedX = d[0]; state.possessedY = d[1];
    state.banner = T.bannerPossessedPrefix + (d[0] > 0 ? 'D.' : (d[0] < 0 ? 'A.' : (d[1] < 0 ? 'W.' : 'S.')));
    state.bannerT = 2.6;
    addTrauma(0.36);
  } else if (kind === 'window') {
    state.possessedX = 0; state.possessedY = 0;
    rememberHorror('window');
    state.windX = 0.72; state.windY = rand(-0.12, 0.12);
    state.banner = T.bannerWindow;
    state.bannerT = 3.0;
    addTrauma(0.5);
  }
}

function updateWeird(dt) {
  state.sirenPulse = 0; state.blackoutPulse = 0; state.windowPulse = 0;
  if (!state.windowFired && state.survived >= EVT.windowAt) {
    // scripted one-shot: the window opens at the exact scheduled second, preempting any running event
    state.windowFired = true;
    state.weirdKind = ''; state.weirdT = 0; state.weirdMax = 0;
    state.possessedX = 0; state.possessedY = 0; state.windX = 0; state.windY = 0;
    startWeird('window');
  }
  if (state.weirdKind) {
    state.weirdT -= dt;
    var phase = state.weirdMax > 0 ? clamp(state.weirdT / state.weirdMax, 0, 1) : 0;
    var throb = 0.55 + 0.45 * Math.sin(state.t * (state.weirdKind === 'siren' ? 18 : (state.weirdKind === 'window' ? 11 : 7)));
    if (state.weirdKind === 'siren') {
      state.sirenPulse = phase * throb;
      player.belochka = clamp(player.belochka - 0.012 * dt, 0, 1);
    } else if (state.weirdKind === 'blackout') {
      state.blackoutPulse = (0.3 + 0.7 * phase) * throb;
      player.belochka = clamp(player.belochka + 0.006 * dt, 0, 1);
    } else if (state.weirdKind === 'possessed') {
      player.belochka = clamp(player.belochka + 0.01 * dt, 0, 1);
    } else if (state.weirdKind === 'window') {
      state.windowPulse = (0.35 + 0.65 * phase) * throb;
      state.windowKillWarn = Math.max(0, state.windowKillWarn - dt * 2.5);
      player.belochka = clamp(player.belochka + 0.004 * dt, 0, 1);
    }
    if (state.weirdT <= 0) {
      state.weirdKind = ''; state.weirdT = 0; state.weirdMax = 0;
      state.possessedX = 0; state.possessedY = 0; state.windowPulse = 0; state.windX = 0; state.windY = 0;
      state.weirdCd = EVT.weirdEveryMin + Math.random() * EVT.weirdEveryRand;
    }
    return;
  }
  if (!state.possessedFired && state.survived >= EVT.possessedAt) {
    state.possessedFired = true;
    startWeird('possessed'); // scripted one-shot; waits for a free slot (the window keeps its exact-second preempt)
    return;
  }
  state.weirdCd -= dt;
  if (state.weirdCd <= 0) {
    var cycle = ['siren', 'blackout'];
    var next = player.belochka > 0.62 ? 'siren' : cycle[state.weirdSeq % cycle.length];
    startWeird(next);
  }
}

// ---- firing ----
function spawnBullet(ang, kind) {
  if (bullets.count >= bullets.x.length) return;
  var b = bullets.count++;
  bullets.x[b] = player.x + Math.cos(ang) * (player.r + 4);
  bullets.y[b] = player.y + Math.sin(ang) * (player.r + 4);
  bullets.px[b] = player.x; bullets.py[b] = player.y; // sweep starts at the body: point-blank overlaps can't be skipped
  bullets.vx[b] = Math.cos(ang) * BAL.bulletSpeed; bullets.vy[b] = Math.sin(ang) * BAL.bulletSpeed;
  bullets.life[b] = 0; bullets.r[b] = BAL.bulletR; bullets.bounce[b] = 0; bullets.kind[b] = kind;
}
function enemyVisibleForAttack(i, a) {
  var r = enemies.r[i] || BAL.foeR;
  if (enemies.gateActive[i]) return false;
  return pointVisibleForAttack(enemies.x[i], enemies.y[i], r, a); // wanderers count too once line of sight is clear
}
function nearestTarget() {
  var a = arena();
  var best = -1, bd = 1e9;
  for (var i = 0; i < enemies.count; i++) {
    if (!enemyVisibleForAttack(i, a)) continue;
    var dx = enemies.x[i] - player.x, dy = enemies.y[i] - player.y, d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
function attackInterval(kind) {
  return (BAL.fireInterval / player.up.fireMul) * (kind === 1 ? 1 / BAL.bloodFireRate : 1);
}
function attackVisualDuration(kind) {
  return clamp(attackInterval(kind) * 0.9, 0.12, kind === 1 ? 0.74 : 0.48);
}
function queueThrow(aim, miss, kind, shots, spread, molotovShot, jit, visualDuration) {
  player.throwQueued = 1;
  player.throwT = visualDuration * 0.9;
  player.throwAim = aim + miss;
  player.throwMiss = miss;
  player.throwKind = kind;
  player.throwShots = shots;
  player.throwSpread = spread;
  player.throwJit = jit;
  player.throwMolotov = molotovShot ? 1 : 0;
}
function releaseQueuedThrow() {
  if (!player.throwQueued) return;
  // re-aim at the CURRENT target: the windup takes ~0.4s and close enemies move a huge angle in
  // that time - releasing on the stale queued angle is why point-blank shots felt like they missed
  var live = nearestTarget();
  if (live >= 0) {
    player.throwAim = Math.atan2(enemies.y[live] - player.y, enemies.x[live] - player.x) + (player.throwMiss || 0);
    player.face = player.throwAim;
  }
  var shots = Math.max(1, player.throwShots | 0);
  playSfx('throw', player.throwMolotov ? 1.1 : 0.9);
  for (var k = 0; k < shots; k++) {
    var frac = shots === 1 ? 0 : (k / (shots - 1) - 0.5);
    var shotKind = (player.throwMolotov && k === ((shots - 1) * 0.5 | 0)) ? 2 : player.throwKind;
    spawnBullet(player.throwAim + frac * player.throwSpread * (shots - 1) + rand(-1, 1) * player.throwJit, shotKind);
  }
  addPart(player.x + Math.cos(player.throwAim) * player.r, player.y + Math.sin(player.throwAim) * player.r, Math.cos(player.throwAim) * 60, Math.sin(player.throwAim) * 60, 3, 0.18, player.throwKind === 1 ? 1 : 0);
  player.throwQueued = 0;
  player.throwT = 0;
}
function updateQueuedThrow(dt) {
  if (player.attackT > 0) {
    player.attackT = Math.max(0, player.attackT - dt);
    player.recoil = player.attackMax > 0 ? player.attackT / player.attackMax : 0;
  } else if (player.recoil > 0) {
    player.recoil = Math.max(0, player.recoil - dt * 5);
  }
  if (!player.throwQueued) return;
  player.throwT -= dt;
  if (player.throwT <= 0) releaseQueuedThrow();
}
function fire() {
  if (player.throwQueued || player.attackT > 0) return false;
  var bx = nearestTarget();
  if (bx < 0) { player.fireCd = 0.12; return false; }
  var aim = Math.atan2(enemies.y[bx] - player.y, enemies.x[bx] - player.x);
  var steady = player.up.steady;
  var jit = (BAL.aimJitterBase + player.belochka * BAL.aimJitterBelochka) * steady;
  var miss = Math.random() < BAL.aimMissChance * steady ? rand(-1, 1) * BAL.aimMissAngle * steady : 0;
  var throwAim = aim + miss;
  player.face = throwAim;

  var kind;
  if (player.vodka >= BAL.vodkaPerShot) { player.vodka -= BAL.vodkaPerShot; kind = 0; }
  else if (player.hp - BAL.bloodPerShot >= BAL.bloodReserve) {   // never fire the shot that would kill you
    player.hp -= BAL.bloodPerShot; kind = 1; player.bloodFire = 1; player.belochka = clamp(player.belochka + 0.004, 0, 1);
    if (!state.taughtBlood) { state.taughtBlood = true; state.banner = T.teachBlood; state.bannerT = 2.8; }
  }
  else { player.belochka = clamp(player.belochka + 0.02, 0, 1); player.fireCd = 0.4; return false; }

  var shots = kind === 1 ? 1 : player.up.shots, spread = 9 * Math.PI / 180;
  var molotovShot = false;
  if (kind === 0 && player.up.molotov > 0) {
    player.shotSeq++;
    var every = Math.max(3, BAL.molotovEvery - (player.up.molotov - 1) * 2);
    molotovShot = player.shotSeq % every === 0;
  }
  var visualDuration = attackVisualDuration(kind);
  queueThrow(aim, miss, kind, shots, spread, molotovShot, jit, visualDuration);
  player.recoil = 1;
  player.attackMax = visualDuration;
  player.attackT = visualDuration;
  player.attackSeq++;
  player.fireCd = Math.max(attackInterval(kind), visualDuration);
  return true;
}

function removeBullet(i) { var n = --bullets.count; if (i !== n) { bullets.x[i] = bullets.x[n]; bullets.y[i] = bullets.y[n]; bullets.px[i] = bullets.px[n]; bullets.py[i] = bullets.py[n]; bullets.vx[i] = bullets.vx[n]; bullets.vy[i] = bullets.vy[n]; bullets.life[i] = bullets.life[n]; bullets.r[i] = bullets.r[n]; bullets.bounce[i] = bullets.bounce[n]; bullets.kind[i] = bullets.kind[n]; } }

function nearestRealEnemy(x, y) {
  var best = -1, bd = 1e12;
  for (var i = 0; i < enemies.count; i++) {
    if (!enemies.real[i]) continue;
    if (enemies.wander[i]) continue; // ricochet seek must not pull shots into the walls after outside roamers
    var dx = enemies.x[i] - x, dy = enemies.y[i] - y, d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

function bendRicochet(i, dt) {
  if (player.up.ricochetSeek <= 0 || bullets.bounce[i] <= 0) return;
  var j = nearestRealEnemy(bullets.x[i], bullets.y[i]);
  if (j < 0) return;
  var dx = enemies.x[j] - bullets.x[i], dy = enemies.y[j] - bullets.y[i];
  var d = Math.max(1, Math.hypot(dx, dy));
  var sp = Math.max(1, Math.hypot(bullets.vx[i], bullets.vy[i]));
  var pull = Math.min(0.22, BAL.ricochetSeek * player.up.ricochetSeek * dt);
  var vx = bullets.vx[i] / sp * (1 - pull) + dx / d * pull;
  var vy = bullets.vy[i] / sp * (1 - pull) + dy / d * pull;
  var nd = Math.max(0.001, Math.hypot(vx, vy));
  bullets.vx[i] = vx / nd * sp;
  bullets.vy[i] = vy / nd * sp;
  if ((state.tick + i) % 5 === 0) addPart(bullets.x[i], bullets.y[i], -bullets.vx[i] * 0.018, -bullets.vy[i] * 0.018, 2.6, 0.18, 0);
}

function segPointDist2(ax, ay, bx, by, cx, cy) {
  var abx = bx - ax, aby = by - ay;
  var t = ((cx - ax) * abx + (cy - ay) * aby) / (abx * abx + aby * aby || 1);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  var dx = ax + abx * t - cx, dy = ay + aby * t - cy;
  return dx * dx + dy * dy;
}
function updateBullets(dt) {
  var a = arena(), dmg = BAL.dmg * player.up.dmgMul, pierce = player.up.pierce;
  for (var i = bullets.count - 1; i >= 0; i--) {
    bendRicochet(i, dt);
    bullets.life[i] += dt;
    var r = bullets.r[i], hit = stepBulletThroughWorld(i, dt, a, r);
    if (hit) {
      playSfx('bottleImpact', bullets.kind[i] === 2 ? 0.8 : 0.55);
      if (bullets.bounce[i] < 255) bullets.bounce[i]++;
      addPart(bullets.x[i], bullets.y[i], 0, 0, 3, 0.2, bullets.kind[i] === 1 ? 1 : 0);
      if (!state.taughtBounce) { state.taughtBounce = true; state.banner = T.teachBounce; state.bannerT = 2.6; }
      if (bullets.kind[i] === 2) { spawnPuddle(bullets.x[i], bullets.y[i], player.up.molotov); removeBullet(i); continue; }
    }
    var gone = false;
    for (var j = enemies.count - 1; j >= 0; j--) {
      // swept over this frame's path (px,py -> x,y): a fast bottle can't skip an enemy standing
      // inside the player, where the muzzle already starts past its centre
      var rr = r + enemies.r[j];
      if (segPointDist2(bullets.px[i], bullets.py[i], bullets.x[i], bullets.y[i], enemies.x[j], enemies.y[j]) <= rr * rr) {
        if (!enemies.real[j]) { playSfx('enemyHit', 0.35); killFoe(j); removeBullet(i); gone = true; break; }   // popping a ghost wastes the shot
        var hitDmg = bullets.bounce[i] ? dmg * (1 + player.up.bounce * 0.2) : dmg;
        if (bullets.kind[i] === 2) {
          playSfx('enemyHit', 0.55);
          spawnPuddle(bullets.x[i], bullets.y[i], player.up.molotov);
          enemies.hitT[j] = 0.16; enemies.hp[j] -= hitDmg * 0.65; aggroWanderer(j);
          if (enemies.hp[j] <= 0) killFoe(j);
          removeBullet(i); gone = true; break;
        }
        if (pierce) {
          if (enemies.hitT[j] > 0) continue;                                          // one hit per pass-through
          playSfx('enemyHit', 0.45);
          enemies.hitT[j] = 0.12; enemies.hp[j] -= hitDmg; burst(bullets.x[i], bullets.y[i], 3, 70, 3, 1); aggroWanderer(j);
          if (enemies.hp[j] <= 0) killFoe(j);
        } else {
          playSfx('enemyHit', 0.5);
          enemies.hitT[j] = 0.12; enemies.hp[j] -= hitDmg; burst(bullets.x[i], bullets.y[i], 4, 90, 3, 1); aggroWanderer(j);
          if (enemies.hp[j] <= 0) killFoe(j);
          removeBullet(i); gone = true; break;
        }
      }
    }
    if (gone) continue;
    if (i >= bullets.count) continue;
    bullets.px[i] = bullets.x[i]; bullets.py[i] = bullets.y[i]; // next frame sweeps from here
    // your OWN sloshed bottle can clip you after a bounce; it can kill if you keep ignoring it.
    if (bullets.bounce[i] >= 1 && player.hurt <= 0) {
      var pdx = bullets.x[i] - player.x, pdy = bullets.y[i] - player.y, pr = r + player.r * 0.82;
      if (pdx * pdx + pdy * pdy <= pr * pr) {
        if (tapokProtectsPlayer()) {
          playSfx('bottleImpact', 0.62);
          burst(bullets.x[i], bullets.y[i], 5, 120, 2.8, 5);
          removeBullet(i); continue;
        } else {
          playSfx('playerHurt', 0.75);
          player.hp -= BAL.selfGraze; player.hurt = 0.5 + player.up.ifrBonus;
          player.belochka = clamp(player.belochka + 0.015, 0, 1);
          burst(player.x, player.y, 8, 130, 3, 1); addTrauma(0.3); removeBullet(i); continue;
        }
      }
    }
  }
}

function updatePuddles(dt) {
  if (!puddles.count) return;
  for (var p = puddles.count - 1; p >= 0; p--) {
    puddles.life[p] -= dt;
    puddles.phase[p] += dt * 2.2;
    if (puddles.life[p] <= 0) { removePuddle(p); continue; }
    var px = puddles.x[p], py = puddles.y[p], rr = puddles.r[p];
    var dmg = BAL.molotovDps * (1 + Math.max(0, player.up.molotov - 1) * 0.25) * dt;
    for (var e = enemies.count - 1; e >= 0; e--) {
      if (!enemies.real[e]) continue;
      var dx = enemies.x[e] - px, dy = enemies.y[e] - py, er = rr + enemies.r[e] * 0.35;
      if (dx * dx + dy * dy <= er * er) {
        enemies.hitT[e] = Math.max(enemies.hitT[e], 0.08);
        enemies.hp[e] -= dmg;
        if ((state.tick + e + p) % 9 === 0) addPart(enemies.x[e], enemies.y[e], rand(-16, 16), rand(-60, -8), 2.4, 0.24, 5);
        if (enemies.hp[e] <= 0) killFoe(e);
      }
    }
    var pdx = player.x - px, pdy = player.y - py, pr = rr * 0.72 + player.r;
    if (pdx * pdx + pdy * pdy <= pr * pr && !tapokProtectsPlayer()) {
      player.hp -= BAL.molotovSelfGraze * dt;
      player.belochka = clamp(player.belochka + 0.018 * dt, 0, 1);
      if ((state.tick + p) % 11 === 0) addPart(player.x, player.y, rand(-18, 18), rand(-40, -6), 2.2, 0.18, 5);
    }
  }
}

function aggroWanderer(i) {
  if (!enemies.wander[i]) return;
  enemies.wander[i] = 0;
  var a = arena();
  if (pointVisibleForAttack(enemies.x[i], enemies.y[i], enemies.r[i], a)) return; // clear sight: chase directly
  var holes = mapEnemyHoles(a);
  if (!holes.length) return;
  var best = 0, bd = 1e12;
  for (var h = 0; h < holes.length; h++) {
    var dx = holes[h].cx - enemies.x[i], dy = holes[h].cy - enemies.y[i], d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = h; }
  }
  var gate = insideGateForHole(a, holes[best], holeSide(a, holes[best]), enemies.r[i]);
  enemies.gateX[i] = gate.x; enemies.gateY[i] = gate.y; enemies.gateActive[i] = 1;
}

function enemyGateReached(i) {
  if (!enemies.gateActive[i]) return true;
  var dx = enemies.gateX[i] - enemies.x[i], dy = enemies.gateY[i] - enemies.y[i];
  var reach = Math.max(18, enemies.r[i] * 1.15);
  return dx * dx + dy * dy <= reach * reach;
}

function updateFoes(dt) {
  var a = arena();
  for (var i = enemies.count - 1; i >= 0; i--) {
    enemies.phase[i] += dt;
    if (enemies.hitT[i] > 0) enemies.hitT[i] -= dt;
    if (enemies.real[i]) {
      var bz = BOOZE[enemies.type[i]];
      var oldX = enemies.x[i], oldY = enemies.y[i];
      var tx, ty, spMul = 1;
      if (enemies.wander[i]) {
        var adx = player.x - enemies.x[i], ady = player.y - enemies.y[i];
        if (adx * adx + ady * ady < 160 * 160) aggroWanderer(i); // player came too close: the roamer wakes up
      }
      if (enemies.wander[i]) {
        // aimless outside roamer: drifts between random waypoints, never toward the player
        var wdx = enemies.gateX[i] - enemies.x[i], wdy = enemies.gateY[i] - enemies.y[i];
        if (wdx * wdx + wdy * wdy < Math.max(196, enemies.r[i] * enemies.r[i])) {
          var nw = randomOutsidePoint(a, enemies.r[i] + 6);
          if (nw) { enemies.gateX[i] = nw.x; enemies.gateY[i] = nw.y; }
        }
        tx = enemies.gateX[i]; ty = enemies.gateY[i];
        spMul = BAL.wanderSpeedMul * (0.75 + 0.25 * Math.sin(enemies.phase[i] * 0.6 + enemies.seed[i]));
      } else {
        if (enemyGateReached(i)) enemies.gateActive[i] = 0;
        tx = enemies.gateActive[i] ? enemies.gateX[i] : player.x;
        ty = enemies.gateActive[i] ? enemies.gateY[i] : player.y;
      }
      var dx = tx - enemies.x[i], dy = ty - enemies.y[i], d = Math.max(1, Math.hypot(dx, dy));
      var sirenDrag = state.weirdKind === 'siren' ? 0.82 : 1;
      var stepX = dx / d * bz.sp * spMul * sirenDrag * dt, stepY = dy / d * bz.sp * spMul * sirenDrag * dt;
      moveCircleOnMap(enemies.x[i], enemies.y[i], stepX, stepY, enemies.r[i] * 0.86, a, enemyMove, !enemies.wander[i], true);
      enemies.x[i] = enemyMove.x; enemies.y[i] = enemyMove.y;
      if (!enemies.wander[i] && enemyGateReached(i)) enemies.gateActive[i] = 0;
      enemies.vx[i] = (enemies.x[i] - oldX) / Math.max(0.001, dt);
      enemies.vy[i] = (enemies.y[i] - oldY) / Math.max(0.001, dt);
      if (enemies.wander[i] && (state.tick + i) % 45 === 0 && Math.abs(enemies.vx[i]) + Math.abs(enemies.vy[i]) < 6) {
        var unstick = randomOutsidePoint(a, enemies.r[i] + 6); // wedged against a wall: pick a fresh waypoint
        if (unstick) { enemies.gateX[i] = unstick.x; enemies.gateY[i] = unstick.y; }
      }
      keepEnemyOutOfTapok(i, a, oldX, oldY, dt);
      dx = player.x - enemies.x[i]; dy = player.y - enemies.y[i]; d = Math.max(1, Math.hypot(dx, dy));
      var rr = enemies.r[i] + player.r;
      if (dx * dx + dy * dy <= rr * rr && player.hurt <= 0) {
        if (tapokProtectsPlayer()) {
          keepEnemyOutOfTapok(i, a, oldX, oldY, dt);
          continue;
        }
        if (player.shield > 0) {
          playSfx('bottleImpact', 1.05);
          player.shield--;
          player.shieldFlash = 1;
          player.hurt = 0.34 + player.up.ifrBonus;
          moveCircleOnMap(enemies.x[i], enemies.y[i], -dx / d * BAL.shieldBlastPush * 0.12, -dy / d * BAL.shieldBlastPush * 0.12, enemies.r[i] * 0.86, a, enemyMove, true, true);
          enemies.x[i] = enemyMove.x; enemies.y[i] = enemyMove.y;
          enemies.vx[i] = (enemies.x[i] - oldX) / Math.max(0.001, dt);
          enemies.vy[i] = (enemies.y[i] - oldY) / Math.max(0.001, dt);
          enemies.hp[i] -= BAL.shieldBlastDmg * (1 + Math.max(0, player.up.shieldMax - 1) * 0.2);
          burst(player.x, player.y, 24, 300, 4.2, 0);
          burst(player.x, player.y, 10, 210, 5, 3);
          addTrauma(0.7);
          state.banner = T.bannerShieldBroke;
          state.bannerT = 1.7;
          if (enemies.hp[i] <= 0) killFoe(i);
          continue;
        }
        playSfx('playerHurt', 1);
        player.hp -= bz.touch; player.hurt = 0.6 + player.up.ifrBonus; addTrauma(0.35);   // enemy touch = the ONLY death
        var kx = -dx / d, ky = -dy / d; player.vx += kx * 220; player.vy += ky * 220; burst(player.x, player.y, 8, 150, 3, 1);
      }
    } else {
      var s = enemies.seed[i];
      var hx0 = enemies.x[i], hy0 = enemies.y[i];
      enemies.x[i] += Math.cos(enemies.phase[i] * 1.3 + s) * 26 * dt + (player.x - enemies.x[i]) * 0.18 * dt;
      enemies.y[i] += Math.sin(enemies.phase[i] * 1.1 + s) * 26 * dt + (player.y - enemies.y[i]) * 0.18 * dt;
      enemies.vx[i] = (enemies.x[i] - hx0) / Math.max(0.001, dt);
      enemies.vy[i] = (enemies.y[i] - hy0) / Math.max(0.001, dt);
      enemies.hp[i] -= dt * (state.weirdKind === 'siren' ? 0.28 : 0.06);
      if (enemies.hp[i] <= 0) removeFoe(i);
    }
  }
}

function updatePickups(dt) {
  for (var i = pickups.count - 1; i >= 0; i--) {
    pickups.phase[i] += dt; pickups.y[i] += pickups.vy[i]; pickups.vy[i] *= 0.94;
    var dx = pickups.x[i] - player.x, dy = pickups.y[i] - player.y, rr = pickups.r[i] + player.r;
    if (dx * dx + dy * dy <= rr * rr) {
      playSfx('pickup', pickups.kind[i] === 1 ? 0.85 : 1);
      if (pickups.kind[i] === 1) {                        // закуска: heal a bit of blood + sober up a touch
        player.hp = Math.min(player.maxHp, player.hp + BAL.healBlood);
        player.belochka = clamp(player.belochka - BAL.zakuskaCalm, 0, 1);
        player.drinkGlow = 1; burst(pickups.x[i], pickups.y[i], 10, 120, 3, 4);
        gainXp(BAL.zakuskaPickupXp);
        state.banner = T.toastZakuska; state.bannerT = 0.7;
      } else {                                            // vodka: ammo + sanity
        player.vodka = clamp(player.vodka + BAL.drinkRestoresVodka, 0, player.maxVodka);
        player.drinkGlow = 1; burst(pickups.x[i], pickups.y[i], 10, 120, 3, 0);
        gainXp(BAL.vodkaPickupXp);
        state.banner = T.toastVodka; state.bannerT = 0.7;
      }
      var n = --pickups.count; if (i !== n) { pickups.x[i] = pickups.x[n]; pickups.y[i] = pickups.y[n]; pickups.vy[i] = pickups.vy[n]; pickups.r[i] = pickups.r[n]; pickups.phase[i] = pickups.phase[n]; pickups.kind[i] = pickups.kind[n]; }
    }
  }
}

function updateParts(dt) {
  for (var i = parts.count - 1; i >= 0; i--) {
    parts.life[i] -= dt;
    if (parts.life[i] <= 0) { var n = --parts.count; if (i !== n) { parts.x[i] = parts.x[n]; parts.y[i] = parts.y[n]; parts.vx[i] = parts.vx[n]; parts.vy[i] = parts.vy[n]; parts.r[i] = parts.r[n]; parts.life[i] = parts.life[n]; parts.max[i] = parts.max[n]; parts.col[i] = parts.col[n]; } continue; }
    parts.x[i] += parts.vx[i] * dt; parts.y[i] += parts.vy[i] * dt; parts.vx[i] *= 0.92; parts.vy[i] *= 0.92;
  }
}

function updateSquirrel(dt) {
  var sq = squirrel; if (!sq.active) return;
  sq.t += dt; sq.talkT -= dt; var a = arena();
  sq.x += sq.vx * dt; sq.y += sq.vy * dt;
  if (sq.x < a.x0 + 18 || sq.x > a.x1 - 18) { sq.vx *= -1; sq.x = clamp(sq.x, a.x0 + 18, a.x1 - 18); }
  if (sq.y < a.y0 + 18 || sq.y > a.y1 - 18) { sq.vy *= -1; sq.y = clamp(sq.y, a.y0 + 18, a.y1 - 18); }
  if (sq.t > 7) sq.active = false;
}

function startDying() {
  if (state.mode !== 'PLAY') return;
  state.mode = 'DYING';
  state.dyingT = state.dyingMax = 1.6;
  playSfx('deathSplat', 1.1); // Tim: шлёп plays on the PLAYER's death
  addTrauma(0.5);
}

function updateDying(dt) {
  state.dyingT -= dt;
  var k = 1 - state.dyingT / state.dyingMax;
  // green vomit stream: arcs out of the mouth, splats near the feet
  var dir = Math.cos(player.face) < 0 ? -1 : 1;
  for (var v = 0; v < 3; v++) {
    addPart(player.x + dir * player.r * 0.4, player.y - player.r * 0.6,
      dir * rand(40, 150) + rand(-20, 20), rand(-40, 30) + k * 120,
      rand(1.6, 3.4), rand(0.4, 0.9), 4);
  }
  if ((state.tick % 4) === 0) addPart(player.x + dir * rand(10, 42), player.y + player.r * 0.8, rand(-14, 14), rand(-8, 4), rand(2, 4.2), rand(0.6, 1.2), 4);
  updateParts(dt);
  if (view.shake < 0.25) addTrauma(0.12);
  if (state.dyingT <= 0) enterEnd('bled');
}

function enterEnd(reason) {
  state.endReason = reason; player.dead = (reason === 'bled' || reason === 'window');
  state.mode = (reason === 'sane' || reason === 'wreck') ? 'WIN' : 'DEAD';
  if (state.score > state.best) state.best = state.score;
  addTrauma(1);
}

function checkWindowDeath(a) {
  if (state.weirdKind !== 'window') return false;
  var exit = stairHorrorExit(a);
  var pad = player.r * 0.45;
  if (player.x >= exit.x0 - pad && player.x <= exit.x1 + pad && player.y >= exit.y0 - pad && player.y <= exit.y1 + pad) {
    state.windowKillWarn = 1;
    player.hp = 0;
    enterEnd('window');
    return true;
  }
  return false;
}

export function update(dt) {
  state.t += dt; state.tick++;
  state.warp += (player.belochka - state.warp) * Math.min(1, dt * 3);
  if (state.mode === 'DYING') { updateDying(dt); if (view.shake > 0) view.shake = Math.max(0, view.shake - dt * 1.6); return; }
  if (state.mode !== 'PLAY') { if (view.shake > 0) view.shake = Math.max(0, view.shake - dt * 1.6); return; }

  var a = arena();
  var tutoring = state.tutorStep < 4;
  if (!tutoring) updateWeird(dt);
  // movement
  var mx = input.moveX, my = input.moveY, spd = BAL.moveSpeed * player.up.speedMul;
  if (state.tutorStep === 1 || state.tutorStep === 2) { mx = 0; my = 0; } // tutorial: forced stand through the read-gate
  if (state.weirdKind === 'possessed') { mx += state.possessedX; my += state.possessedY; var ml = Math.hypot(mx, my); if (ml > 1) { mx /= ml; my /= ml; } }
  if (state.weirdKind === 'blackout') spd *= 0.76;
  if (state.weirdKind === 'window') {
    var exit = stairHorrorExit(a), wx = exit.x - player.x, wy = exit.y - player.y, wl = Math.max(1, Math.hypot(wx, wy));
    state.windX = wx / wl; state.windY = wy / wl;
    var pull = 118 + (state.windowPulse || 0.35) * 58;
    player.vx += state.windX * pull * dt;
    player.vy += state.windY * pull * 0.86 * dt;
  }
  player.vx += (mx * spd - player.vx) * Math.min(1, dt * 13);
  player.vy += (my * spd - player.vy) * Math.min(1, dt * 13);
  var wantX = player.x + player.vx * dt, wantY = player.y + player.vy * dt;
  moveCircleOnMap(player.x, player.y, player.vx * dt, player.vy * dt, player.r, a, playerMove);
  player.x = playerMove.x; player.y = playerMove.y;
  if (playerMove.hit) {
    if (Math.abs(player.x - wantX) > 0.4) player.vx *= 0.18;
    if (Math.abs(player.y - wantY) > 0.4) player.vy *= 0.18;
  }
  if (checkWindowDeath(a)) return;
  if (!tutoring) updateTapok(dt, a);
  if (mx || my) player.step += dt * 9;
  if (player.iframe > 0) player.iframe -= dt;
  if (player.hurt > 0) player.hurt -= dt;
  var gateFrozen = state.tutorStep === 2; // read-gate: full sim freeze so the bounced bottle can't hit the locked player
  if (!gateFrozen) updateQueuedThrow(dt);
  if (player.drinkGlow > 0) player.drinkGlow = Math.max(0, player.drinkGlow - dt * 1.5);
  if (player.bloodFire > 0) player.bloodFire = Math.max(0, player.bloodFire - dt * 3);
  if (player.shieldFlash > 0) player.shieldFlash = Math.max(0, player.shieldFlash - dt * 2.8);
  if (state.ambulancePulse > 0) state.ambulancePulse = Math.max(0, state.ambulancePulse - dt * 1.4);

  if (!gateFrozen) player.fireCd -= dt;
  var attackingBlockedByMotion = Math.hypot(mx, my) > 0.08 || Math.hypot(player.vx, player.vy) > 28;
  if (player.fireCd <= 0 && !gateFrozen) {
    if (!attackingBlockedByMotion) fire();
    else player.fireCd = Math.min(0.12, BAL.fireInterval / Math.max(1, player.up.fireMul));
  }

  // белочка tracks vodka/sanity: above the danger line it recedes, below it climbs (faster the emptier)
  var vfrac = player.vodka / player.maxVodka, dl = BAL.belochkaDanger;
  if (vfrac >= dl) player.belochka -= BAL.belochkaCalm * dt * ((vfrac - dl) / (1 - dl));
  else player.belochka += BAL.belochkaLowVodka * dt * ((dl - vfrac) / dl);
  player.belochka = clamp(player.belochka, 0, 1);

  if (!gateFrozen) updateBullets(dt);
  updatePuddles(dt);
  if (!gateFrozen) updateFoes(dt);
  updatePickups(dt);
  updateParts(dt);
  updateSquirrel(dt);

  // "this is fine" easter egg when your own fire fills the room
  var armed = 0; for (var bi = 0; bi < bullets.count; bi++) if (bullets.bounce[bi] >= 1) armed++;

  // spawns ramp up over time
  if (!tutoring) state.spawnCd -= dt;
  state.shadowCd -= dt;
  if (!tutoring && state.spawnCd <= BAL.shadowHallucWaveLead && state.shadowCd <= 0 && enemies.count < 3) {
    if (spawnShadowHalluc()) {
      state.shadowCd = BAL.shadowHallucEveryMin + Math.random() * BAL.shadowHallucEveryRand;
      state.spawnCd = Math.max(state.spawnCd, BAL.shadowHallucWaveLead);
    }
  }
  if (state.spawnCd <= 0) {
    // difficulty scales the spawn RATE only (interval divided); scaling count too would compound to ~3x
    var cnt = 1 + (state.survived > BAL.multiSpawnAt ? 1 : 0) + (state.survived > BAL.multiSpawnAt * 2 ? 1 : 0);
    for (var sp = 0; sp < cnt; sp++) spawnReal(chooseBooze());
    state.spawnCd = Math.max(EVT.waveEveryMin, EVT.waveEvery0 - state.survived * BAL.spawnRamp) / difficultyMul();
  }
  if (player.belochka > 0.12) {
    state.hallucCd -= dt;
    if (state.hallucCd <= 0) { var nh = 1 + (player.belochka * 3 | 0); for (var h = 0; h < nh; h++) spawnHalluc(); state.hallucCd = BAL.hallucEvery / (0.4 + player.belochka * 2.2); }
  }
  // first-run tutorial (world frozen until done): move -> stand & kill the ghost -> dodge warning
  if (state.tutorStep === 0) {
    state.tutorDist += Math.hypot(player.vx, player.vy) * dt;
    if (state.tutorDist > 90) {
      state.tutorStep = 1;
      state.tutorT = 12; // failsafe: never soft-lock the stand step
      if (!spawnShadowHalluc()) { state.tutorStep = 2; state.tutorT = 2.6; }
    }
  } else if (state.tutorStep === 1) {
    state.tutorT -= dt;
    if (enemies.count === 0 || state.tutorT <= 0) state.tutorStep = 2; // held until the player clicks (main.js advances)
  } else if (state.tutorStep === 3) {
    state.tutorT -= dt;
    if (state.tutorT <= 0) { state.tutorStep = 4; markTutorDone(); }
  }

  // ambient hallucination visuals: brief harmless apparitions somewhere on the map
  if (state.vision.t > 0) state.vision.t -= dt;
  if (!tutoring) state.visionCd -= dt;
  if (state.visionCd <= 0) {
    var va = arena();
    state.vision.kind = randInt(0, 4);
    state.vision.x = rand(va.x0 + 40, va.x1 - 40);
    state.vision.y = rand(va.y0 + 40, va.y1 - 40);
    state.vision.t = state.vision.max = rand(1.7, 3.2);
    state.visionCd = (7 + Math.random() * 9) * (1 - player.belochka * 0.55); // madder = more visions
  }
  if (!tutoring) state.wanderCd -= dt;
  if (state.wanderCd <= 0 && !tutoring) {
    var roaming = 0;
    for (var wi = 0; wi < enemies.count; wi++) if (enemies.wander[wi] && enemies.real[wi]) roaming++;
    if (roaming < EVT.wanderMax) spawnWanderer();
    state.wanderCd = EVT.wanderEveryMin + Math.random() * EVT.wanderEveryRand;
  }
  if (!tutoring) state.squirrelCd -= dt;
  if (!squirrel.active && player.belochka > 0.45 && state.squirrelCd <= 0) {
    squirrel.active = true; squirrel.t = 0; squirrel.talkT = 3; squirrel.line = randInt(0, 3);
    squirrel.x = a.x0 + 24; squirrel.y = a.y0 + 24; squirrel.vx = 150; squirrel.vy = 110;
    state.squirrelCd = EVT.squirrelEvery; state.banner = T.bannerSquirrel; state.bannerT = 2.2;
  }

  if (state.bannerT > 0) state.bannerT -= dt;
  if (view.shake > 0) view.shake = Math.max(0, view.shake - dt * 1.6);
  cam.x = a.cx + (view.shake > 0 ? view.shake * view.shake * 16 * Math.sin(state.t * 49) : 0);
  cam.y = a.cy + (view.shake > 0 ? view.shake * view.shake * 16 * Math.cos(state.t * 41) : 0);

  // win / lose. Blood can run out from enemy contact, bounced self-shots, fire, or the stairwell pull.
  if (!tutoring) state.survived += dt;
  if (player.hp <= 0) { player.hp = 0; startDying(); }
  else if (state.survived >= state.goalTime) enterEnd(player.vodka >= 25 ? 'sane' : 'wreck');
}
