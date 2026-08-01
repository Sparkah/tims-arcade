// WebGL world render: builds the GL instance buffer each frame (Bloodtread procedural pipeline) and
// draws it in one batch. Shapes: 0 disc, 1 box, 2 diamond, 3 ring (fat glow), 4 thin ring. Colors are 0..1.
import { gl, addInst, addLineInst, drawInstances, resetSpriteBatches, queueSpriteRot, flushSprites } from './context.js?v=20260801a';
import { screenLen } from './camera.js?v=20260801a';
import { player, bullets, enemies, parts, pickups, puddles, squirrel, tapok, view, state, sprites, cam } from '../state.js?v=20260801a';
import { TAU } from '../lib/math.js?v=20260801a';
import { arena, mapColliders, stairHorrorExit } from '../update.js?v=20260801a';

var PCOL = [[1,0.72,0.24],[0.85,0.12,0.12],[0.95,0.25,0.72],[1,1,1],[0.55,0.85,0.35],[1,0.34,0.08],[0.18,0.12,0.08]];
var ENEMY_SPRITES = ['enemy_beer_imp', 'enemy_wine_wretch', 'enemy_champagne_shard', 'enemy_cognac_brute'];
var ENEMY_SOURCE_FACE = [1, -1, 1, 1]; // wine source art faces left; positive width assumes right-facing art.
var DECOR_SPRITES = ['decor_crate', 'decor_rug', 'decor_bottles', 'decor_table'];
var PLAYER_IDLE_FRAMES = 8;
var PLAYER_IDLE_FPS = 4;
var PLAYER_WALK_FRAMES = 8;
var PLAYER_WALK_FPS = 7;
var PLAYER_ATTACK_FRAMES = 8;
var PLAYER_ATTACK_FPS = 12;
var PLAYER_ATTACK_SECONDS = 0.42;
var PLAYER_BLEND_SPEED = 8.5;
var PLAYER_SPRITE_SCALE = 1 / 1.5;
var PLAYER_ATTACK_FRAME_MAP = [0, 1, 2, 3, 3, 6, 7, 7];
var playerVisual = {
  anim: 'idle',
  prev: 'idle',
  blend: 1,
  face: 1,
  frame: 0,
  attackStart: -99,
  attackUntil: -99,
  lastAttackSeq: 0,
  lastRecoil: 0,
  lastT: 0,
};
var DECOR_SIZE = [
  [126, 116],
  [180, 126],
  [116, 104],
  [142, 124],
];

// scattered empty-bottle squalor on the floor (fractions of the arena; generated once)
var decor = null;
function ensureDecor() {
  if (decor) return;
  decor = [
    { fx: 0.10, fy: 0.80, kind: 2, rot: -0.45, s: 0.78 },
    { fx: 0.18, fy: 0.23, kind: 0, rot: -0.22, s: 0.70 },
    { fx: 0.86, fy: 0.23, kind: 0, rot: 0.30, s: 0.74 },
    { fx: 0.84, fy: 0.82, kind: 3, rot: -0.35, s: 0.78 },
    { fx: 0.50, fy: 0.68, kind: 1, rot: 0.04, s: 0.66 },
    { fx: 0.31, fy: 0.32, kind: 2, rot: 0.18, s: 0.46 },
    { fx: 0.72, fy: 0.34, kind: 2, rot: -0.12, s: 0.42 },
    { fx: 0.18, fy: 0.58, kind: 1, rot: 0.34, s: 0.38 },
  ];
}

function disc(n, x, y, R, r, g, b, a, p) { return addInst(n, x, y, R, R, 0, 0, r, g, b, a, p || 0); }
function box(n, x, y, hw, hh, ang, r, g, b, a) { return addInst(n, x, y, hw, hh, ang, 1, r, g, b, a, 0); }
function ring(n, x, y, R, r, g, b, a) { return addInst(n, x, y, R, R, 0, 3, r, g, b, a, 0); }
function thinRing(n, x, y, R, r, g, b, a) { return addInst(n, x, y, R, R, 0, 4, r, g, b, a, Math.max(9, R * 0.30)); }
function screenX(x) { return (x - cam.x) * view.cameraZoom + view.cssW * 0.5; }
function screenY(y) { return (y - cam.y) * view.cameraZoom + view.cssH * 0.5; }
function spriteWorld(key, x, y, w, h, angle, r, g, b, a) {
  var meta = sprites.meta[key];
  if (!meta || !sprites.textures[key]) return false;
  return queueSpriteRot(key, 0, 0, meta.w, meta.h, screenX(x), screenY(y), screenLen(w), screenLen(h), angle, r, g, b, a);
}
function spriteWorldFrame(key, frame, frames, x, y, w, h, angle, r, g, b, a) {
  var meta = sprites.meta[key];
  if (!meta || !sprites.textures[key]) return false;
  var fw = meta.w / frames;
  frame = Math.max(0, Math.min(frames - 1, frame | 0));
  return queueSpriteRot(key, fw * frame, 0, fw, meta.h, screenX(x), screenY(y), screenLen(w), screenLen(h), angle, r, g, b, a);
}
function spriteScreen(key, x, y, w, h, angle, r, g, b, a) {
  var meta = sprites.meta[key];
  if (!meta || !sprites.textures[key]) return false;
  return queueSpriteRot(key, 0, 0, meta.w, meta.h, x, y, w, h, angle, r, g, b, a);
}

function enemyFacing(i, x) {
  var vx = enemies.vx[i] || 0;
  if (Math.abs(vx) > 6) return vx < 0 ? -1 : 1;
  return player.x < x ? -1 : 1;
}

function enemySpriteFacing(i, x) {
  return enemyFacing(i, x) * (ENEMY_SOURCE_FACE[enemies.type[i]] || 1);
}

export function enemyFacingDebug(i) {
  var logical = enemyFacing(i, enemies.x[i]);
  return {
    logical: logical,
    sprite: logical * (ENEMY_SOURCE_FACE[enemies.type[i]] || 1),
  };
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function holeRenderAngle(a, h) {
  var dTop = Math.abs(h.cy - a.y0), dRight = Math.abs(a.x1 - h.cx), dBottom = Math.abs(a.y1 - h.cy), dLeft = Math.abs(h.cx - a.x0);
  var side = 0, best = dTop;
  if (dRight < best) { side = 1; best = dRight; }
  if (dBottom < best) { side = 2; best = dBottom; }
  if (dLeft < best) side = 3;
  return side === 1 ? Math.PI * 0.5 : (side === 2 ? Math.PI : (side === 3 ? -Math.PI * 0.5 : 0));
}

function playerAnimConfig(name) {
  if (name === 'attack') return { key: 'player_attack', frames: PLAYER_ATTACK_FRAMES, fps: PLAYER_ATTACK_FPS, w: 6.25, h: 7.3, y: -1.05 };
  if (name === 'walk') return { key: 'player_walk', frames: PLAYER_WALK_FRAMES, fps: PLAYER_WALK_FPS, w: 5.55, h: 7.35, y: -1.18 };
  return { key: 'player_idle', frames: PLAYER_IDLE_FRAMES, fps: PLAYER_IDLE_FPS, w: 5.25, h: 7.35, y: -1.18 };
}

function playerAttackDuration() {
  return Math.max(0.08, player.attackMax || PLAYER_ATTACK_SECONDS);
}

function playerFrameFor(anim, t) {
  if (anim === 'attack') {
    var ap = clamp01((t - playerVisual.attackStart) / playerAttackDuration());
    var attackFrame = Math.min(PLAYER_ATTACK_FRAMES - 1, Math.floor(ap * PLAYER_ATTACK_FRAMES));
    return PLAYER_ATTACK_FRAME_MAP[attackFrame] || 0;
  }
  var cfg = playerAnimConfig(anim);
  return Math.floor(t * cfg.fps) % cfg.frames;
}

function playerAnimFps(anim) {
  if (anim === 'attack') return PLAYER_ATTACK_FRAMES / playerAttackDuration();
  return playerAnimConfig(anim).fps;
}

function updatePlayerVisual(moving) {
  var t = state.t;
  if (t + 0.1 < playerVisual.lastT) {
    playerVisual.anim = 'idle';
    playerVisual.prev = 'idle';
    playerVisual.blend = 1;
    playerVisual.attackStart = -99;
    playerVisual.attackUntil = -99;
    playerVisual.lastAttackSeq = player.attackSeq || 0;
    playerVisual.lastRecoil = 0;
  }
  var dt = Math.max(0, Math.min(0.05, t - playerVisual.lastT));
  playerVisual.lastT = t;

  var attackDuration = playerAttackDuration();
  if ((player.attackSeq || 0) !== playerVisual.lastAttackSeq) {
    playerVisual.lastAttackSeq = player.attackSeq || 0;
    playerVisual.attackStart = t - Math.max(0, attackDuration - (player.attackT || attackDuration));
    playerVisual.attackUntil = playerVisual.attackStart + attackDuration;
  } else if (player.attackT > 0) {
    playerVisual.attackStart = t - Math.max(0, attackDuration - player.attackT);
    playerVisual.attackUntil = playerVisual.attackStart + attackDuration;
  } else {
    var recoilSpike = player.recoil > 0.55 && player.recoil > playerVisual.lastRecoil + 0.35;
    if (recoilSpike) {
      playerVisual.attackStart = t;
      playerVisual.attackUntil = t + attackDuration;
    }
  }
  playerVisual.lastRecoil = player.recoil;

  var target = t < playerVisual.attackUntil ? 'attack' : (moving ? 'walk' : 'idle');
  if (Math.abs(player.vx) > 18) {
    playerVisual.face = player.vx < 0 ? -1 : 1;
  } else if (target === 'attack' && Math.abs(Math.cos(player.face)) > 0.18) {
    playerVisual.face = Math.cos(player.face) < 0 ? -1 : 1;
  }

  if (target !== playerVisual.anim) {
    playerVisual.prev = playerVisual.anim;
    playerVisual.anim = target;
    playerVisual.blend = 0;
  } else {
    playerVisual.blend = Math.min(1, playerVisual.blend + dt * PLAYER_BLEND_SPEED);
  }
  playerVisual.frame = playerFrameFor(playerVisual.anim, t);
}

function drawPlayerAnimSpriteTint(anim, frame, x, y, r, cr, cg, cb, alpha) {
  var cfg = playerAnimConfig(anim);
  var vr = r * PLAYER_SPRITE_SCALE;
  var bob = 0;
  if (anim === 'walk') bob = Math.sin(state.t * PLAYER_WALK_FPS * TAU) * 1.2 * PLAYER_SPRITE_SCALE;
  else if (anim === 'idle') bob = Math.sin(state.t * 3.4) * 0.45 * PLAYER_SPRITE_SCALE;
  else if (anim === 'attack') bob = -Math.sin(clamp01((state.t - playerVisual.attackStart) / playerAttackDuration()) * Math.PI) * 1.0 * PLAYER_SPRITE_SCALE;
  return spriteWorldFrame(cfg.key, frame, cfg.frames, x, y + vr * cfg.y + bob, vr * cfg.w * playerVisual.face, vr * cfg.h, 0, cr, cg, cb, alpha);
}

function drawPlayerAnimSprite(anim, frame, x, y, r, sick, alpha) {
  var cr = player.hurt > 0 ? 1.35 : 0.96 + sick * 0.08;
  var cg = player.bloodFire > 0 ? 0.82 : 0.96;
  var cb = player.bloodFire > 0 ? 0.82 : 0.92;
  return drawPlayerAnimSpriteTint(anim, frame, x, y, r, cr, cg, cb, alpha);
}

export function playerAnimationDebug() {
  return {
    idleLoaded: !!sprites.textures.player_idle,
    walkLoaded: !!sprites.textures.player_walk,
    attackLoaded: !!sprites.textures.player_attack,
    anim: playerVisual.anim,
    prev: playerVisual.prev,
    blend: +playerVisual.blend.toFixed(2),
    facing: playerVisual.face,
    frame: playerVisual.frame,
    fps: +playerAnimFps(playerVisual.anim).toFixed(1),
    attackDuration: +playerAttackDuration().toFixed(2),
  };
}

function addMapCollisionHints(n, a, mapDrawn) {
  var colliders = mapColliders(a);
  for (var i = 0; i < colliders.length; i++) {
    var s = colliders[i];
    if (s.type === 'tapok-spot') continue; // builder-only marker, invisible in game
    if (s.type === 'enemy-hole') {
      var pulse = 0.5 + 0.5 * Math.sin(state.t * 5.2 + i);
      var ang = holeRenderAngle(a, s);
      var mw = Math.max(s.hw * 2.45, 74), mh = Math.max(s.hh * 2.45, 74);
      n = disc(n, s.cx, s.cy, Math.max(mw, mh) * 0.52, 0.02, 0.004, 0.006, mapDrawn ? 0.24 + pulse * 0.06 : 0.42, 0);
      if (!spriteWorld('horror_monster_hole_marker', s.cx, s.cy + Math.sin(state.t * 2.8 + i) * 1.2, mw, mh, ang + Math.sin(state.t * 1.6 + i) * 0.015, 0.82, 0.86, 0.90, mapDrawn ? 0.62 + pulse * 0.11 : 0.86)) {
        n = box(n, s.cx, s.cy, s.hw, s.hh, 0, 0.025, 0.006, 0.004, mapDrawn ? 0.34 + pulse * 0.08 : 0.52);
        n = addLineInst(n, s.x0, s.cy, s.x1, s.cy, 4.2, 0.56, 0.02, 0.02, mapDrawn ? 0.32 : 0.50, 0);
      }
      continue;
    }
    var clutter = s.id === 'burn-barrel' || s.id === 'lit-table-clutter';
    var a0 = mapDrawn ? (clutter ? 0.08 : 0.12) : (clutter ? 0.15 : 0.22);
    n = box(n, s.cx, s.cy, s.hw, s.hh, 0, 0.015, 0.012, 0.010, a0);
    if (!clutter) {
      n = addLineInst(n, s.x0, s.y1, s.x1, s.y1, 2.2, 0.38, 0.26, 0.16, mapDrawn ? 0.18 : 0.32, 0);
    }
  }
  return n;
}

function addAnimationOverlays(n, exitX, exitY, exitW, exitH, fh, siren) {
  // Post-sprite pass: glow, fizz, snow, and hot cores must sit above the painterly PNGs.
  // Enemy bodies are sprite-only now; legacy procedural eyes/rings made colored primitive artifacts over the art.
  // (no damage ring behind enemies: hit feedback is the red blink ON the enemy sprite itself)

  for (var b = 0; b < bullets.count; b++) {
    var bx = bullets.x[b], by = bullets.y[b], br = bullets.r[b], kind = bullets.kind[b];
    var ba = Math.atan2(bullets.vy[b], bullets.vx[b]), vxu = Math.cos(ba), vyu = Math.sin(ba);
    var spinPulse = 0.5 + 0.5 * Math.sin(bullets.life[b] * 18 + b);
    n = addLineInst(n, bx - vxu * br * 3.0, by - vyu * br * 3.0, bx + vxu * br * 1.0, by + vyu * br * 1.0, br * 0.24, kind === 2 ? 1 : 0.95, kind === 2 ? 0.45 : 0.86, kind === 1 ? 0.42 : 0.72, 0.42 + spinPulse * 0.25, kind === 2 ? 0.8 : 0);
    if (kind === 2) {
      n = addInst(n, bx - vxu * br * 1.7, by - vyu * br * 1.7, br * (0.42 + spinPulse * 0.12), br * (0.82 + spinPulse * 0.24), ba + 1.55, 2, 1, 0.34, 0.04, 0.82, 0.8);
    } else if (bullets.bounce[b] > 0) {
      n = thinRing(n, bx, by, br * (1.85 + spinPulse * 0.32), 1, 0.86, 0.24, 0.30);
    }
  }

  for (var pd = 0; pd < puddles.count; pd++) {
    var life = puddles.max[pd] > 0 ? puddles.life[pd] / puddles.max[pd] : 0;
    var pr = puddles.r[pd], px = puddles.x[pd], py = puddles.y[pd];
    for (var fl = 0; fl < 5; fl++) {
      var fa = puddles.phase[pd] * (1.15 + fl * 0.07) + fl * 1.38;
      var fd = pr * (0.16 + ((fl * 29) % 53) / 100);
      var h = 12 + life * 11 + Math.sin(state.t * 9 + fl) * 4;
      n = addInst(n, px + Math.cos(fa) * fd, py + Math.sin(fa * 1.4) * fd - h * 0.42, 5.2, h, Math.sin(fa) * 0.35, 2, 1, 0.5 + life * 0.16, 0.06, (0.24 + life * 0.32), 0.8);
    }
    if ((state.tick + pd) % 4 === 0) {
      var sm = puddles.phase[pd] + pd;
      n = disc(n, px + Math.cos(sm) * pr * 0.35, py - pr * 0.32 + Math.sin(sm * 1.2) * pr * 0.16, pr * 0.12, 0.2, 0.16, 0.12, 0.16 * life, 0);
    }
  }

  if (state.weirdKind === 'window') {
    var wp = state.windowPulse || 0.35;
    for (var sn = 0; sn < 18; sn++) {
      var stt = (state.t * (0.7 + sn * 0.017) + sn * 0.119) % 1;
      var sx = exitX - exitW * 0.36 + ((sn * 41) % 100) / 100 * exitW * 0.72 + Math.sin(state.t * 4 + sn) * 8;
      var sy = exitY - exitH * 0.46 + stt * exitH * 1.08;
      n = disc(n, sx + state.windX * 85 * stt, sy + state.windY * 42 * stt, 1.8 + stt * 1.4, 0.8, 0.92, 1, 0.3 + wp * 0.34, 0);
    }
  }
  if (state.blackoutPulse > 0) {
    var bp = state.blackoutPulse;
    for (var bt = 0; bt < 5; bt++) {
      var bx0 = view.cssW * (bt / 4) + Math.sin(state.t * 0.9 + bt) * 42;
      var by0 = view.cssH * (0.14 + 0.18 * ((bt * 3) % 5));
      n = disc(n, bx0, by0, Math.min(view.cssW, view.cssH) * (0.09 + bp * 0.05), 0.02, 0, 0.04, 0.08 + bp * 0.12, 0);
    }
  }
  return n;
}

function addTapok(n) {
  if (tapok.boomT > 0) {
    // blast reads as a crisp expanding shockwave outline + brief hot core, not a colored blob
    var boom = 1 - tapok.boomT / 0.6;
    var br = tapok.blastR * (0.18 + boom * 0.92);
    n = thinRing(n, tapok.x, tapok.y, br, 1, 0.52, 0.10, 0.62 * (1 - boom));
    n = thinRing(n, tapok.x, tapok.y, br * 0.72, 1, 0.30, 0.06, 0.40 * (1 - boom));
    n = disc(n, tapok.x, tapok.y, br * 0.16, 1, 0.72, 0.30, 0.30 * (1 - boom), 0.8);
  }
  if (!tapok.active) return n;
  var x = tapok.x, y = tapok.y, pulse = 0.5 + 0.5 * Math.sin(state.t * 7.5 + tapok.pulse * 2);
  var armed = tapok.armed;
  if (armed) {
    // no monotone fill: the safe zone reads through the painterly salt circle (thin outline fallback)
    var frac = tapok.max > 0 ? clamp01(tapok.timer / tapok.max) : 0;
    var zoneDrawn = spriteWorld('tapok_zone_circle', x, y, tapok.safeR * 2.24, tapok.safeR * 2.24, Math.sin(state.t * 0.7) * 0.05, 1, 0.98, 0.92, 0.58 + pulse * 0.10);
    if (!zoneDrawn) n = thinRing(n, x, y, tapok.safeR, 0.86, 0.80, 0.62, 0.30 + pulse * 0.06);
    // countdown ring shrinks inward and heats gold -> red as the boom nears
    n = thinRing(n, x, y, tapok.safeR * (0.30 + frac * 0.70), 0.95, 0.35 + frac * 0.50, 0.25 + frac * 0.30, 0.28 + (1 - frac) * 0.24);
  }
  var ang = -0.42 + Math.sin(state.t * 2.1) * 0.025;
  n = disc(n, x + 5, y + tapok.r * 0.7, tapok.r * 1.18, 0, 0, 0, 0.26, 0);
  var shoeY = y + tapok.r * 0.08;
  var shoeW = tapok.r * 4.05;
  var shoeH = tapok.r * 1.48; // v15 black slide source aspect is 2.74:1
  var shoeAng = 0.01 + Math.sin(state.t * 2.1) * 0.012;
  var shoeDrawn = spriteWorld('tapok_old_sneaker', x, shoeY, shoeW, shoeH, shoeAng, 0.96, 0.92, 0.86, 0.96);
  if (shoeDrawn && armed) {
    spriteWorld('tapok_old_sneaker', x, shoeY, shoeW, shoeH, shoeAng, 1, 0.12, 0.08, 0.18 + pulse * 0.34);
  }
  if (shoeDrawn && !armed) {
    // beacon: golden blaze ON the sprite (two silhouette passes) + expanding thin ring pings; no filled shapes
    var blaze = 0.30 + pulse * 0.42;
    spriteWorld('tapok_old_sneaker', x, shoeY, shoeW, shoeH, shoeAng, 1.45, 1.18, 0.42, blaze);
    spriteWorld('tapok_old_sneaker', x, shoeY, shoeW * 1.07, shoeH * 1.07, shoeAng, 1.6, 1.35, 0.55, blaze * 0.35);
    var ping = (state.t % 1.4) / 1.4;
    n = thinRing(n, x, y, tapok.r * (1.2 + ping * 2.6), 1, 0.85, 0.32, (1 - ping) * 0.55);
  }
  if (!shoeDrawn) {
    var sr = armed ? 0.60 + pulse * 0.35 : 0.36;
    var sg = armed ? 0.12 : 0.25;
    var sb = armed ? 0.08 : 0.16;
    n = box(n, x, y, tapok.r * 0.90, tapok.r * 0.42, ang, sr, sg, sb, 0.98);
    n = box(n, x - tapok.r * 0.18, y - tapok.r * 0.10, tapok.r * 0.58, tapok.r * 0.33, ang, armed ? 0.78 + pulse * 0.20 : 0.56, armed ? 0.18 : 0.40, armed ? 0.10 : 0.23, 0.96);
    n = disc(n, x + Math.cos(ang) * tapok.r * 0.78, y + Math.sin(ang) * tapok.r * 0.78, tapok.r * 0.34, 0.72, 0.46, 0.18, 0.96, 0);
    n = disc(n, x - tapok.r * 0.74, y + tapok.r * 0.04, tapok.r * 0.20, 0.06, 0.04, 0.03, 0.92, 0);
  }
  return n;
}

export function renderWorld() {
  resetSpriteBatches();
  var bk = state.warp;                                  // белочка 0..1
  var siren = Math.max(state.sirenPulse || 0, state.ambulancePulse || 0);
  // the room sits in shadow; tints sicker/greener as you go mad
  gl.clearColor(0.05 + bk * 0.02, 0.04, 0.03 + bk * 0.04, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  if (state.mode === 'MENU') { return; }

  var a = arena(), n = 0, fw = a.x1 - a.x0, fh = a.y1 - a.y0;
  ensureDecor();
  var mapDrawn = spriteWorld('map_building', a.cx, a.cy, fw, fh, 0, 0.84 + bk * 0.03, 0.86, 0.88 + bk * 0.04, 1);
  var roomDrawn = mapDrawn;
  if (!roomDrawn) roomDrawn = spriteWorld('room_floor', a.cx, a.cy, fw, fh, 0, 0.9 + bk * 0.04, 0.88, 0.82 + bk * 0.03, 1);
  if (roomDrawn) {
    flushSprites();
    resetSpriteBatches();
  }

  // -- floor (grimy room) + floorboards --
  if (!roomDrawn) {
    n = box(n, a.cx, a.cy, fw * 0.5, fh * 0.5, 0, 0.13 + bk * 0.03, 0.11, 0.08, 1);
    for (var fb = 1; fb < 6; fb++) { var fy = a.y0 + fh * fb / 6; n = addLineInst(n, a.x0, fy, a.x1, fy, 1, 0, 0, 0, 0.18, 0); }
    n = disc(n, a.cx, a.cy - fh * 0.05, fw * 0.6, 0.5, 0.4, 0.18, 0.1, 0);
    var ew = 3, br = 0.18, bg2 = 0.14, bb = 0.10;
    n = addLineInst(n, a.x0, a.y0, a.x1, a.y0, ew, br, bg2, bb, 0.9, 0);
    n = addLineInst(n, a.x0, a.y1, a.x1, a.y1, ew, br, bg2, bb, 0.9, 0);
    n = addLineInst(n, a.x0, a.y0, a.x0, a.y1, ew, br, bg2, bb, 0.9, 0);
    n = addLineInst(n, a.x1, a.y0, a.x1, a.y1, ew, br, bg2, bb, 0.9, 0);
  } else {
    n = disc(n, a.cx, a.cy - fh * 0.04, fw * 0.42, 0.6, 0.42, 0.16, 0.045, 0);
  }
  n = addMapCollisionHints(n, a, mapDrawn);

  // -- the stairwell: the false way out, keeping the old open-window horror behaviour.
  var stair = stairHorrorExit(a);
  var winW = Math.max(stair.w * 1.10, Math.min(fw * 0.16, 128)), winH = Math.max(stair.h * 0.62, 78), winX = stair.x, winY = stair.y;
  n = disc(n, winX, winY + winH * 0.18, winW * (roomDrawn ? 0.72 : 1.05), 0.4, 0.55, 0.85, roomDrawn ? 0.050 : 0.11, 0);                 // light spilling onto floor
  if (!roomDrawn) {
    n = box(n, winX, winY, winW * 0.42, winH * 0.5, 0.08, 0.24, 0.30, 0.40, 0.72);
    for (var step = 0; step < 5; step++) {
      var yy = winY - winH * 0.35 + step * winH * 0.17;
      n = addLineInst(n, winX - winW * 0.35, yy, winX + winW * 0.34, yy + winH * 0.04, 2, 0.52, 0.62, 0.76, 0.82, 0);
    }
  }
  if (state.weirdKind === 'window') {
    var wp = state.windowPulse || 0.35;
    n = disc(n, winX, winY, winW * (0.90 + wp * 0.42), 0.48, 0.68, 1, 0.10 + wp * 0.12, 0); // cold light spill
    if (!spriteWorld('horror_open_window', winX, winY + Math.sin(state.t * 4.6) * 2, winW * (1.10 + wp * 0.12), winW * (1.04 + wp * 0.10), Math.PI * 0.5 + Math.sin(state.t * 2.1) * 0.035, 0.88, 0.96, 1, 0.60 + wp * 0.14)) {
      n = box(n, winX - winW * 0.22, winY, winW * 0.18, winH * 0.50, -0.18, 0.42, 0.62, 0.9, 0.76);
      n = box(n, winX + winW * 0.24, winY, winW * 0.18, winH * 0.50, 0.18, 0.42, 0.62, 0.9, 0.76);
    }
    for (var sn = 0; sn < 22; sn++) {
      var st = (state.t * (0.52 + sn * 0.013) + sn * 0.173) % 1;
      var sx0 = winX - winW * 0.36 + ((sn * 37) % 100) / 100 * winW * 0.78;
      var sy0 = winY - winH * 0.38 + st * winH * 1.12;
      var sx1 = sx0 + Math.sin(sn * 3.1) * 18 + state.windX * 70;
      var sy1 = sy0 + state.windY * 54 + wp * 18;
      n = addLineInst(n, sx0, sy0, sx1, sy1, 1.6, 0.78, 0.9, 1, 0.32 + wp * 0.25, 0);
    }
  }
  if (siren > 0) {
    // strobe light POOLS at the window it comes from + directional beams; no room-wide colour wash
    var redSide = Math.sin(state.t * 22) > 0;
    n = disc(n, winX + (redSide ? -winW * 0.3 : winW * 0.3), winY + winH * 0.4, winW * 1.7, redSide ? 0.95 : 0.12, 0.1, redSide ? 0.16 : 1, 0.12 + siren * 0.10, 0);
    n = addLineInst(n, winX - winW * 0.5, winY + winH * 0.5, a.x0 + fw * 0.08, a.y1, 5, redSide ? 1 : 0.18, 0.12, redSide ? 0.18 : 1, 0.18 * siren, 0);
    n = addLineInst(n, winX + winW * 0.5, winY + winH * 0.5, a.x1 - fw * 0.08, a.y1, 5, redSide ? 0.18 : 1, 0.12, redSide ? 1 : 0.18, 0.18 * siren, 0);
  }

  // -- generated room clutter: keeps the centre clear, makes edges feel like a place --
  for (var d = 0; d < decor.length; d++) {
    var dd = decor[d], dx = a.x0 + fw * dd.fx, dy = a.y0 + fh * dd.fy, size = DECOR_SIZE[dd.kind] || DECOR_SIZE[0];
    var dw = size[0] * dd.s, dh = size[1] * dd.s;
    var decorAlpha = mapDrawn ? 0.58 : 0.9;
    // decoration is sprite-only; a missing sprite draws nothing (no colored primitive stand-ins)
    spriteWorld(DECOR_SPRITES[dd.kind] || DECOR_SPRITES[0], dx, dy, dw, dh, dd.rot, 0.86, 0.82, 0.76, decorAlpha);
  }

  // -- burning vodka/glass puddles: a Bloodtread-style lingering mess, but readable as fire --
  for (var pd = 0; pd < puddles.count; pd++) {
    var plf = puddles.max[pd] > 0 ? puddles.life[pd] / puddles.max[pd] : 0;
    var pr = puddles.r[pd] * (0.82 + 0.1 * Math.sin(puddles.phase[pd] * 3.1));
    var px0 = puddles.x[pd], py0 = puddles.y[pd];
    n = disc(n, px0, py0, pr * 1.05, 0.42, 0.04, 0.02, 0.20 * plf + 0.08, 0); // dark scorch stain
    if (!sprites.textures.vfx_fire_puddle) {
      // colored fill/ring only when the painterly puddle sprite is unavailable
      n = disc(n, px0, py0, pr * 0.74, 1, 0.22, 0.04, 0.18 + 0.18 * plf, 0.8 * plf);
      n = ring(n, px0, py0, pr * (0.78 + 0.08 * Math.sin(puddles.phase[pd] * 2.2)), 1, 0.58, 0.12, 0.22 + plf * 0.2);
    }
    for (var flm = 0; flm < 6; flm++) {
      var fa = puddles.phase[pd] * (1.5 + flm * 0.08) + flm * 1.72;
      var fd = pr * (0.22 + ((flm * 23) % 47) / 100);
      var fx = px0 + Math.cos(fa) * fd;
      var fy = py0 + Math.sin(fa * 1.3) * fd;
      var fh = 9 + Math.sin(state.t * 8 + flm) * 3 + plf * 8;
      n = addInst(n, fx, fy - fh * 0.35, 4.5, fh, Math.sin(fa) * 0.24, 2, 1, 0.46 + plf * 0.18, 0.08, 0.35 * plf, 0.6);
    }
    spriteWorld('vfx_fire_puddle', px0, py0 + Math.sin(puddles.phase[pd] * 2.4) * 2, pr * (2.8 + 0.16 * Math.sin(state.t * 9 + pd)), pr * (2.1 + 0.22 * Math.cos(state.t * 7 + pd)), Math.sin(puddles.phase[pd] * 0.8) * 0.08, 1, 0.9 + 0.1 * plf, 0.82, 0.62 * plf);
  }

  // -- pickups: vodka bottle (amber) or закуска (green pickle, heals blood) --
  for (var i = 0; i < pickups.count; i++) {
    var bob = Math.sin(pickups.phase[i] * 3) * 2, px = pickups.x[i], py = pickups.y[i] + bob, R = pickups.r[i];
    if (pickups.kind[i] === 1) {
      // sprite-first: the old colored glow/body primitives only draw if the painterly sprite is missing
      if (!spriteWorld('pickup_zakuska_pickle', px, py, R * (4.0 + 0.18 * Math.sin(pickups.phase[i] * 2.2)), R * 3.15, 0.26 + Math.sin(pickups.phase[i] * 1.7) * 0.12, 1, 1, 1, 0.95)) {
        n = disc(n, px, py, R * 1.6, 0.5, 0.85, 0.35, 0.2, 0);                       // green glow
        n = addInst(n, px, py, R * 0.44, R * 0.92, 0.42, 0, 0.40, 0.64, 0.24, 1, 0); // pickle body (tilted ellipse)
        n = disc(n, px - R * 0.12, py - R * 0.28, R * 0.12, 0.72, 0.95, 0.5, 1, 0);  // bumps
        n = disc(n, px + R * 0.14, py + R * 0.18, R * 0.1, 0.72, 0.95, 0.5, 1, 0);
      }
    } else {
      if (!spriteWorld('proj_vodka_bottle', px, py, R * 4.2, R * 2.55, -0.72 + Math.sin(pickups.phase[i] * 1.8) * 0.18, 1, 1, 1, 0.92)) {
        n = disc(n, px, py, R * 1.5, 1, 0.72, 0.24, 0.18, 0);                        // amber glow
        n = box(n, px, py, R * 0.42, R * 0.8, 0, 0.95, 0.78, 0.4, 0.95);             // bottle body
        n = box(n, px, py - R * 0.9, R * 0.2, R * 0.35, 0, 0.8, 0.85, 0.7, 1);       // neck
      }
    }
  }

  // -- ambient hallucination: a brief apparition somewhere on the map (render-only, no gameplay) --
  if (state.vision.t > 0 && state.vision.max > 0) {
    var VISION_SPRITES = ['horror_pale_hallucination', 'horror_possessed_key', 'belochka_squirrel', 'horror_blackout_tendril', 'enemy_wine_wretch'];
    var vKey = VISION_SPRITES[state.vision.kind % VISION_SPRITES.length];
    var vFlick = 0.5 + 0.5 * Math.sin(state.t * 13 + state.vision.x);
    var vEnv = Math.min(1, (state.vision.max - state.vision.t) / 0.45, state.vision.t / 0.65);
    var vAlpha = vEnv * (0.26 + 0.14 * vFlick);
    var vSize = state.vision.kind === 3 ? 150 : 95;
    spriteWorld(vKey, state.vision.x + Math.sin(state.t * 1.7) * 4, state.vision.y + Math.sin(state.t * 2.3) * 3,
      vSize, vSize * 1.2, Math.sin(state.t * 0.9 + state.vision.y) * 0.06, 0.72, 0.84, 1, vAlpha);
  }

  n = addTapok(n);

  // -- particles --
  for (var p2 = 0; p2 < parts.count; p2++) {
    var c = PCOL[parts.col[p2]] || PCOL[3], lf = parts.life[p2] / parts.max[p2];
    n = disc(n, parts.x[p2], parts.y[p2], parts.r[p2] * (0.5 + lf), c[0], c[1], c[2], lf, 0);
  }

  // -- foes: your fears given form. REAL = чёрт (devil, will hurt you); HALLUCINATION = pale edge-figure --
  for (var e = 0; e < enemies.count; e++) {
    var ex = enemies.x[e], ey = enemies.y[e], er = enemies.r[e], ph = enemies.phase[e];
    if (enemies.real[e]) {
      var fl = enemies.hitT[e] > 0 ? 1 : 0, wob = Math.sin(ph * 6) * 1.5, ry = ey + wob;
      n = disc(n, ex, ey + er * 0.85, er * 1.05, 0, 0, 0, 0.24, 0);
      var sk = ENEMY_SPRITES[enemies.type[e]] || ENEMY_SPRITES[0];
      var stomp = enemies.type[e] === 3 ? Math.max(0, Math.sin(ph * 5.2 + enemies.seed[e])) * 0.09 : 0;
      var jitter = enemies.type[e] === 2 ? Math.sin(ph * 38 + enemies.seed[e]) * er * 0.08 : 0;
      var sw = er * (enemies.type[e] === 1 ? 4.6 : (enemies.type[e] === 2 ? 5.0 : (enemies.type[e] === 3 ? 5.2 : 4.7)));
      var sh = er * (enemies.type[e] === 1 ? 5.9 : (enemies.type[e] === 2 ? 6.4 : (enemies.type[e] === 3 ? 5.0 : 4.8)));
      var pulse = 1 + stomp + Math.sin(ph * (enemies.type[e] === 3 ? 4.2 : 8.0) + enemies.seed[e]) * 0.035;
      var tilt = Math.sin(ph * (enemies.type[e] === 2 ? 10.0 : 4.8) + enemies.seed[e]) * (enemies.type[e] === 3 ? 0.035 : 0.075);
      var face = enemySpriteFacing(e, ex);
      var sx = ex + jitter;
      var sy = ry - er * 0.15 - stomp * er * 0.3;
      var ww = sw * pulse * face;
      var hh = sh / Math.max(0.88, pulse * 0.98);
      var blink = fl ? (0.5 + 0.5 * Math.sin(state.t * 52 + enemies.seed[e])) : 0;
      spriteWorld(sk, sx, sy, ww, hh, tilt, 1, 1, 1, fl ? 0.48 : 0.98);
      if (fl) spriteWorld(sk, sx, sy, ww, hh, tilt, 0.62 + blink * 0.75, 0.01 + blink * 0.02, 0.008 + blink * 0.018, 0.72 + blink * 0.24);
      // siren promise "настоящие светятся": the glow lives ON the real body's sprite, not around it
      if (siren > 0 && !fl) spriteWorld(sk, sx, sy, ww, hh, tilt, 1.25, 1.25, 1.45, siren * (0.24 + 0.14 * Math.sin(state.t * 22)));
    } else {
      var fa = 0.16 + 0.22 * (0.5 + 0.5 * Math.sin(ph * 16 + enemies.seed[e]));
      var hface = enemyFacing(e, ex);
      n = disc(n, ex, ey + er * 1.05, er * 0.82, 0, 0, 0, 0.12 + fa * 0.3, 0);
      spriteWorld('horror_pale_hallucination', ex + Math.sin(ph * 1.7 + enemies.seed[e]) * er * 0.1, ey - er * 0.25 + Math.sin(ph * 2.2) * 3, er * 4.0 * hface, er * 5.8, Math.sin(ph * 1.3 + enemies.seed[e]) * 0.06, 0.86, 0.95, 1, fa + 0.18);
    }
  }

  // -- your shots (bounce off the walls) --
  for (var b = 0; b < bullets.count; b++) {
    var bx = bullets.x[b], by = bullets.y[b], br = bullets.r[b], blood = bullets.kind[b] === 1, fire = bullets.kind[b] === 2, bnc = bullets.bounce[b];
    var tx = bx - bullets.vx[b] * 0.014, ty = by - bullets.vy[b] * 0.014;
    var ba = Math.atan2(bullets.vy[b], bullets.vx[b]), vxu = Math.cos(ba), vyu = Math.sin(ba);
    var spin = ba + bullets.life[b] * (fire ? 5.0 : 8.5) * (b % 2 ? -1 : 1) + bnc * 0.42;
    var pkey = fire ? 'proj_fire_bottle' : 'proj_vodka_bottle';
    var bottleDrawn = spriteWorld(pkey, bx, by, br * (fire ? 9.0 : 7.4), br * (fire ? 4.7 : 3.9), spin, blood ? 1.22 : 1, blood ? 0.42 : 1, blood ? 0.42 : 1, 0.94);
    if (blood) {
      n = addLineInst(n, tx, ty, bx, by, br * 0.9, 0.9, 0.1, 0.15, 0.5, 0); // motion trail
      if (!bottleDrawn) n = disc(n, bx, by, br, 1, 0.2, 0.2, 1, bnc * 0.3);
    } else if (fire) {
      n = addLineInst(n, tx, ty, bx, by, br * 1.65, 1, 0.32, 0.04, 0.72, 0.8); // fire trail
      n = addInst(n, bx - vxu * br * 1.2, by - vyu * br * 1.2, br * 0.55, br * 0.2, ba, 2, 1, 0.25, 0.04, 0.8, 0.9); // flame lick
      if (!bottleDrawn) {
        n = box(n, bx, by, br * 1.55, br * 0.52, ba, 0.92, 0.46, 0.12, 0.95);
        n = box(n, bx + vxu * br * 1.35, by + vyu * br * 1.35, br * 0.44, br * 0.28, ba, 0.95, 0.88, 0.62, 0.95);
      }
      n = thinRing(n, bx, by, br * (2.05 + 0.25 * Math.sin(state.t * 18 + b)), 1, 0.58, 0.08, 0.60);
    } else {
      var seek = bnc && player.up.ricochetSeek > 0;
      n = addLineInst(n, tx, ty, bx, by, br * (seek ? 1.22 : 0.9), 1, seek ? 0.92 : 0.7, seek ? 0.76 : 0.25, seek ? 0.66 : 0.5, seek ? 0.35 : 0); // motion trail
      if (!bottleDrawn) {
        n = box(n, bx, by, br * 1.35, br * 0.44, ba, 0.95, bnc ? 0.92 : 0.78, bnc ? 0.62 : 0.33, 0.95);
        n = box(n, bx + vxu * br * 1.18, by + vyu * br * 1.18, br * 0.32, br * 0.23, ba, 0.82, 0.9, 0.72, 0.95);
      }
      if (seek) n = thinRing(n, bx, by, br * 2.1, 1, 0.9, 0.28, 0.42);
    }
    n = disc(n, bx, by, br * 0.32, 1, 1, 0.9, 0.9, 0);    // glint / hot core
  }

  // -- белочка the squirrel --
  if (squirrel.active) {
    var sx = squirrel.x, sy = squirrel.y;
    // generated ghost-squirrel sprite; the old white discs only draw if the sprite is missing
    if (!spriteWorld('belochka_squirrel', sx, sy - 12, 74, 74, Math.sin(state.t * 4.4) * 0.05, 1, 1, 1, 0.85 + Math.sin(state.t * 7) * 0.08)) {
      n = disc(n, sx, sy, 14, 0.95, 0.95, 1, 0.95, 0);            // body
      n = disc(n, sx, sy - 12, 9, 0.97, 0.97, 1, 1, 0);          // head
      n = disc(n, sx - 6, sy - 20, 4, 0.9, 0.9, 1, 1, 0);        // ears
      n = disc(n, sx + 6, sy - 20, 4, 0.9, 0.9, 1, 1, 0);
      n = disc(n, sx - 3, sy - 13, 1.8, 0.1, 0, 0.1, 1, 0);      // eyes
      n = disc(n, sx + 3, sy - 13, 1.8, 0.1, 0, 0.1, 1, 0);
      n = addLineInst(n, sx + 12, sy, sx + 26, sy - 14, 6, 0.95, 0.95, 1, 0.9, 0); // bushy tail
    }
  }

  // -- the bomzh (you) --
  if (state.mode !== 'MENU') {
    var x = player.x, y = player.y, r = player.r, sway = Math.sin(player.step) * 2;
    var vr = r * PLAYER_SPRITE_SCALE;
    var sick = state.warp;
    var moving = Math.hypot(player.vx, player.vy) > 24;
    var playerSpriteDrawn = false;
    updatePlayerVisual(moving);
    n = disc(n, x, y + vr * 0.8, vr * 1.05, 0, 0, 0, 0.3, 0);                          // shadow
    var deathPoseDrawn = false;
    if (state.mode === 'DYING') {
      // generated death poses: bend-and-spew, then collapsed (frame one is the live sprite itself)
      var dk = state.dyingMax > 0 ? 1 - state.dyingT / state.dyingMax : 1;
      var poseKey = dk < 0.12 ? '' : (dk < 0.6 ? 'player_death_vomit' : 'player_death_down');
      if (poseKey) {
        var dface = playerVisual.face < 0 ? -1 : 1;
        deathPoseDrawn = spriteWorld(poseKey, x + dface * vr * 0.3, y - vr * 0.9, vr * 5.4 * dface, vr * 5.0, 0, 1, 1, 1, 0.98);
        if (deathPoseDrawn) playerSpriteDrawn = true; // suppress the procedural fallback body
      }
    }
    if (!deathPoseDrawn && playerVisual.blend < 1 && playerVisual.prev !== playerVisual.anim) {
      playerSpriteDrawn = drawPlayerAnimSprite(playerVisual.prev, playerFrameFor(playerVisual.prev, state.t), x, y, r, sick, (1 - playerVisual.blend) * 0.58) || playerSpriteDrawn;
    }
    if (!deathPoseDrawn) playerSpriteDrawn = drawPlayerAnimSprite(playerVisual.anim, playerVisual.frame, x, y, r, sick, playerVisual.blend < 1 ? 0.5 + playerVisual.blend * 0.48 : 0.98) || playerSpriteDrawn;
    // state flashes live ON the sprite (clipped to its alpha), never as colored shapes around it;
    // during a crossfade both the previous and current frames get the tint at their blend weights
    var tintPlayer = function (cr, cg, cb, a2) {
      if (playerVisual.blend < 1 && playerVisual.prev !== playerVisual.anim) {
        drawPlayerAnimSpriteTint(playerVisual.prev, playerFrameFor(playerVisual.prev, state.t), x, y, r, cr, cg, cb, a2 * (1 - playerVisual.blend));
        drawPlayerAnimSpriteTint(playerVisual.anim, playerVisual.frame, x, y, r, cr, cg, cb, a2 * (0.5 + playerVisual.blend * 0.48));
      } else {
        drawPlayerAnimSpriteTint(playerVisual.anim, playerVisual.frame, x, y, r, cr, cg, cb, a2);
      }
    };
    if (playerSpriteDrawn && !deathPoseDrawn && player.hurt > 0) tintPlayer(1, 0.07, 0.05, Math.min(0.85, player.hurt * 0.9));
    if (playerSpriteDrawn && !deathPoseDrawn && player.drinkGlow > 0) tintPlayer(1, 0.74, 0.26, player.drinkGlow * 0.42);
    if (playerSpriteDrawn && !deathPoseDrawn && state.mode === 'DYING') tintPlayer(0.38, 0.95, 0.28, 0.42 + 0.18 * Math.sin(state.t * 16)); // green fallback if the pose art is missing
    if (!deathPoseDrawn && (player.shield > 0 || player.shieldFlash > 0)) {
      // похмельный щит = a reeking old mattress hauled in front of the body, feet on the ground
      var sf = Math.max(player.shield > 0 ? 0.35 : 0, player.shieldFlash);
      var shieldDrawn = spriteWorld('shield_mattress', x + vr * 0.2, y + vr * 0.7, vr * 3.4 * (1 + sf * 0.05), vr * 6.6 * (1 + sf * 0.03), Math.sin(state.t * 2.2) * 0.04, 0.95 + sf * 0.2, 0.95 + sf * 0.2, 0.9 + sf * 0.12, 0.88 + sf * 0.12);
      if (!shieldDrawn) n = thinRing(n, x, y, r * (1.62 + sf * 0.26), 0.75, 0.95, 1, 0.28 + sf * 0.42);
    }
    if (!playerSpriteDrawn) {
      var hurtMix = Math.min(1, player.hurt * 1.2); // fallback body reddens itself; no disc behind it
      n = box(n, x, y + vr * 0.2, vr * 0.78, vr * 0.92, 0, (0.32 + sick * 0.1) + hurtMix * 0.6, (0.34 - sick * 0.1) * (1 - hurtMix * 0.7), 0.22 * (1 - hurtMix * 0.7), 1); // grubby coat
      n = disc(n, x + sway * PLAYER_SPRITE_SCALE, y - vr * 0.7, vr * 0.5, 0.78 + hurtMix * 0.2, 0.62 * (1 - hurtMix * 0.6), 0.5 * (1 - hurtMix * 0.6), 1, 0);              // head
      n = disc(n, x + sway * PLAYER_SPRITE_SCALE - vr * 0.18, y - vr * 0.78, vr * 0.1, 0.05, 0, 0, 1, 0);       // eyes (beady)
      n = disc(n, x + sway * PLAYER_SPRITE_SCALE + vr * 0.18, y - vr * 0.78, vr * 0.1, 0.05, 0, 0, 1, 0);
      n = box(n, x - vr * 0.1, y - vr * 0.95, vr * 0.55, vr * 0.18, 0, 0.4, 0.3, 0.25, 1); // beard/cap shadow
      // the bottle in hand, pointed at the aim
      var hx = x + Math.cos(player.face) * vr * 0.9, hy = y + Math.sin(player.face) * vr * 0.9;
      n = box(n, hx, hy, vr * 0.16, vr * 0.42, player.face, player.bloodFire > 0 ? 0.85 : 0.95, player.bloodFire > 0 ? 0.15 : 0.78, player.bloodFire > 0 ? 0.15 : 0.4, 0.95);
    }
  }

  if (state.blackoutPulse > 0) {
    var bp = state.blackoutPulse;
    for (var bt = 0; bt < 3; bt++) {
      var ba2 = state.t * (0.35 + bt * 0.12) + bt * 2.1;
      var sideX = bt === 0 ? -40 : (bt === 1 ? view.cssW + 34 : view.cssW * 0.5 + Math.sin(ba2) * view.cssW * 0.34);
      var sideY = bt === 2 ? -24 : view.cssH * (0.32 + 0.3 * bt) + Math.cos(ba2 * 1.2) * 40;
      var bw = Math.min(360, view.cssW * 0.48) * (1 + bp * 0.25);
      var bh = Math.min(260, view.cssH * 0.44) * (0.85 + bp * 0.28);
      spriteScreen('horror_blackout_tendril', sideX, sideY, bw, bh, ba2 * 0.4 + bt * 0.8, 0.72, 0.48, 0.84, 0.28 + bp * 0.48);
    }
  }
  if (state.weirdKind === 'possessed') {
    var kp = 0.5 + 0.5 * Math.sin(state.t * 13);
    spriteWorld('horror_possessed_key', player.x + state.possessedX * 26, player.y - player.r * (2.3 + kp * 0.18) + state.possessedY * 20, 96 + kp * 12, 96 + kp * 12, Math.sin(state.t * 9) * 0.09, 1, 0.9 - kp * 0.18, 0.9 - kp * 0.18, 0.78 + kp * 0.18);
  }

  var overlayStart = n;
  n = addAnimationOverlays(n, winX, winY, winW, winH, fh, siren);
  drawInstances(0, overlayStart);
  flushSprites();
  drawInstances(overlayStart, n - overlayStart);
}
