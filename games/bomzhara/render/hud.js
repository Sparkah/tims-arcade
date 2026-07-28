// 2D HUD overlay (drawn in CSS px on the #hud canvas above the GL world): meters, белочка drunk
// vignette + double-vision, banners, the squirrel taunt, and the menu / death / win screens.
import { hud } from './context.js?v=20260704a';
import { player, view, state, squirrel, tapok, sprites } from '../state.js?v=20260704a';
import { UPGRADES, BOOZE } from '../config.js?v=20260704a';
import { clamp } from '../lib/math.js?v=20260704a';
import { T } from '../texts.js?v=20260704a';
import { audioDebug } from '../audio.js?v=20260704a';

export var hudRects = { play: null, retry: null, diff: [], pause: null, help: null, resume: null, sound: null, back: null, toMenu: null };
export var upRects = [];
export var bomzharaArtStatus = { loaded: false, error: false, src: '', deathLoaded: false, deathError: false, deathSrc: '', menuBgLoaded: false, menuBgError: false };
var SQUIRREL_LINES = T.squirrelLines;
var HORRORS = [
  { id: 'blackout', name: T.horrorBlackoutName, desc: T.horrorBlackoutDesc },
  { id: 'possessed', name: T.horrorPossessedName, desc: T.horrorPossessedDesc },
  { id: 'window', name: T.horrorWindowName, desc: T.horrorWindowDesc },
];
var bomzharaArt = null;
var bomzharaDeathArt = null;
var menuBgArt = null;

if (typeof Image !== 'undefined') {
  bomzharaArt = new Image();
  bomzharaArt.decoding = 'async';
  bomzharaArt.onload = function () { bomzharaArtStatus.loaded = true; };
  bomzharaArt.onerror = function () { bomzharaArtStatus.error = true; };
  bomzharaArtStatus.src = new URL('../assets/final/bomzhara_toast_builtin_b_painterly.png', import.meta.url).href + '?v=20260704a';
  bomzharaArt.src = bomzharaArtStatus.src;

  bomzharaDeathArt = new Image();
  bomzharaDeathArt.decoding = 'async';
  bomzharaDeathArt.onload = function () { bomzharaArtStatus.deathLoaded = true; };
  bomzharaDeathArt.onerror = function () { bomzharaArtStatus.deathError = true; };
  bomzharaArtStatus.deathSrc = new URL('../assets/final/bomzhara_death_broken_glass_painterly.png', import.meta.url).href + '?v=20260704a';
  bomzharaDeathArt.src = bomzharaArtStatus.deathSrc;

  menuBgArt = new Image();
  menuBgArt.decoding = 'async';
  menuBgArt.onload = function () { bomzharaArtStatus.menuBgLoaded = true; };
  menuBgArt.onerror = function () { bomzharaArtStatus.menuBgError = true; };
  menuBgArt.src = new URL('../assets/generated/v12_menu_backdrop/final/menu_backdrop_winter_window.png', import.meta.url).href + '?v=20260704a';
}

function bar(x, y, w, h, frac, r, g, b, label, val) {
  var c = hud;
  c.fillStyle = 'rgba(255,255,255,0.10)'; rr(c, x, y, w, h, h / 2); c.fill();
  frac = clamp(frac, 0, 1);
  if (frac > 0) { c.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')'; rr(c, x, y, w * frac, h, h / 2); c.fill(); }
  c.fillStyle = '#fff'; c.font = 'bold 11px ui-monospace,monospace'; c.textAlign = 'left'; c.textBaseline = 'middle';
  c.fillText(label, x + 2, y - 9);
  if (val != null) { c.textAlign = 'right'; c.fillText(val, x + w - 2, y - 9); }
}
function rr(c, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

function drawImageCover(c, img, x, y, w, h) {
  var sw = img.naturalWidth || img.width, sh = img.naturalHeight || img.height;
  if (!sw || !sh) return;
  var srcRatio = sw / sh, dstRatio = w / h, sx = 0, sy = 0, ssw = sw, ssh = sh;
  if (srcRatio > dstRatio) { ssw = sh * dstRatio; sx = (sw - ssw) * 0.5; }
  else { ssh = sw / dstRatio; sy = (sh - ssh) * 0.5; }
  c.drawImage(img, sx, sy, ssw, ssh, x, y, w, h);
}

function drawBomzharaPortrait(W, H, mode) {
  var dead = mode === 'dead';
  var img = dead ? bomzharaDeathArt : bomzharaArt;
  if (!img || (dead ? !bomzharaArtStatus.deathLoaded : !bomzharaArtStatus.loaded)) return;
  var c = hud, wide = W >= 760 && H >= 440;
  var size = wide ? clamp(H * 0.38, 168, 250) : clamp(Math.min(W * 0.38, H * 0.23), 88, 150);
  var x = wide ? clamp(W / 2 - size - 260, 24, W - size - 24) : W / 2 - size / 2;
  var y = wide ? H / 2 - size / 2 - (mode === 'end' || dead ? 34 : 8) : 18;
  c.save();
  c.shadowColor = 'rgba(255,210,61,0.42)';
  c.shadowBlur = 22;
  c.fillStyle = 'rgba(15,10,7,0.78)';
  rr(c, x - 7, y - 7, size + 14, size + 14, 8); c.fill();
  c.shadowBlur = 0;
  rr(c, x, y, size, size, 6); c.clip();
  drawImageCover(c, img, x, y, size, size);
  c.restore();
  c.save();
  c.strokeStyle = 'rgba(255,210,61,0.62)';
  c.lineWidth = 2;
  rr(c, x, y, size, size, 6); c.stroke();
  c.restore();
}

function button(label, cx, cy, w, h, accent) {
  var c = hud, x = cx - w / 2, y = cy - h / 2;
  c.save(); c.shadowColor = accent; c.shadowBlur = 18; c.fillStyle = accent; rr(c, x, y, w, h, h / 2); c.fill(); c.restore();
  c.fillStyle = '#120a06'; c.font = 'bold 20px ui-monospace,monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(label, cx, cy + 1);
  return { x: x, y: y, w: w, h: h };
}

export function renderHud() {
  var c = hud, W = view.cssW, H = view.cssH;
  c.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  c.clearRect(0, 0, W, H);
  var warp = state.warp;

  // ---- peripheral dread: the single bulb lights the centre; the edges fall into a crawling dark ----
  if (state.mode !== 'MENU') {
    var vg = c.createRadialGradient(W / 2, H * 0.5, Math.min(W, H) * 0.22, W / 2, H * 0.5, Math.max(W, H) * 0.66);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(2,1,3,0.82)');
    c.fillStyle = vg; c.fillRect(0, 0, W, H);
    // "кажется, что кто-то постоянно рядом" - faint shapes drift at the very edge as белочка rises
    if (warp > 0.25 && state.mode === 'PLAY') {
      c.fillStyle = 'rgba(0,0,0,' + (0.45 * warp).toFixed(3) + ')';
      for (var pi = 0; pi < 3; pi++) {
        var pa = state.t * 0.25 + pi * 2.1;
        var pxv = W / 2 + Math.cos(pa) * W * 0.6, pyv = H / 2 + Math.sin(pa * 1.3) * H * 0.56;
        c.beginPath(); c.ellipse(pxv, pyv, 34, 58, 0, 0, Math.PI * 2); c.fill();
      }
    }
  }

  // Siren: no screen-space colour overlay at all (Tim: no colored backgrounds on actions).
  // The strobe reads through the world-space window light pool + beams + the glow on real enemy sprites.

  // Blackout blocks: crawling dark shapes hide the playfield, but the HUD is drawn after this.
  if (state.blackoutPulse > 0 && state.mode === 'PLAY') {
    var bp = state.blackoutPulse;
    c.fillStyle = 'rgba(0,0,0,' + (0.24 + bp * 0.32).toFixed(3) + ')';
    c.fillRect(0, 0, W, H);
    c.fillStyle = 'rgba(0,0,0,' + (0.46 + bp * 0.34).toFixed(3) + ')';
    for (var sh = 0; sh < 6; sh++) {
      var a = state.t * (0.42 + sh * 0.04) + sh * 1.7;
      var side = sh % 4;
      var sx = side === 0 ? -26 : (side === 1 ? W + 26 : W * (0.18 + 0.64 * ((Math.sin(a) + 1) * 0.5)));
      var sy = side === 2 ? -34 : (side === 3 ? H + 34 : H * (0.16 + 0.68 * ((Math.cos(a * 1.3) + 1) * 0.5)));
      c.beginPath();
      c.ellipse(sx, sy, 62 + 20 * Math.sin(a * 1.9), 150 + 30 * Math.cos(a), a, 0, Math.PI * 2);
      c.fill();
    }
    var hole = c.createRadialGradient(W / 2, H * 0.52, Math.min(W, H) * 0.12, W / 2, H * 0.52, Math.min(W, H) * 0.34);
    hole.addColorStop(0, 'rgba(255,255,255,' + (0.11 * bp).toFixed(3) + ')');
    hole.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = hole; c.fillRect(0, 0, W, H);
  }

  if (state.weirdKind === 'possessed' && state.mode === 'PLAY') drawPossessedKey(W, H);
  if (state.weirdKind === 'window' && state.mode === 'PLAY') drawWindSound(W, H);

  // ---- белочка drunk overlay (the world swims as you lose your mind) ----
  if (warp > 0.02 && state.mode === 'PLAY') {
    var pulse = 0.5 + 0.5 * Math.sin(state.t * 4);
    var g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.62);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(' + (40 + warp * 120) + ',0,' + (60 + warp * 80) + ',' + (0.35 * warp + 0.12 * warp * pulse).toFixed(3) + ')');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  }

  if (state.mode === 'PLAY' || state.mode === 'DYING' || state.mode === 'DEAD' || state.mode === 'WIN' || state.mode === 'UPGRADE' || state.mode === 'PAUSE' || state.mode === 'HELP') drawMeters(W, H, warp);
  if (state.mode === 'PLAY') drawTopButtons(W, H);

  // squirrel taunt
  if (squirrel.active && squirrel.talkT > 0 && state.mode === 'PLAY') {
    c.fillStyle = 'rgba(255,255,255,0.92)'; c.font = 'italic 13px ui-monospace,monospace'; c.textAlign = 'center'; c.textBaseline = 'bottom';
    c.fillText(SQUIRREL_LINES[squirrel.line], clamp(squirrel.x, 80, W - 80), squirrel.y - 30);
  }

  // banner
  if (state.bannerT > 0 && state.mode === 'PLAY') {
    c.globalAlpha = clamp(state.bannerT, 0, 1);
    c.fillStyle = '#ffd23d'; c.font = 'bold 16px ui-monospace,monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(state.banner, W / 2, state.warp > 0.3 ? 120 : 104);
    c.globalAlpha = 1;
  }
  if (tapok.popupT > 0 && state.mode === 'PLAY') drawTapokHint(W, H);
  if (state.mode === 'PLAY') drawTutorPill(W, H);

  if (state.mode === 'MENU') drawMenu(W, H);
  else if (state.mode === 'DEAD') drawEnd(W, H, false);
  else if (state.mode === 'WIN') drawEnd(W, H, true);
  else if (state.mode === 'UPGRADE') drawUpgrade(W, H);
  else if (state.mode === 'PAUSE') drawPause(W, H);
  else if (state.mode === 'HELP') drawHelp(W, H);
}

function squareButton(glyph, cx, cy, s, active) {
  var c = hud, x = cx - s / 2, y = cy - s / 2;
  c.fillStyle = active ? 'rgba(255,210,61,0.92)' : 'rgba(20,16,11,0.82)';
  rr(c, x, y, s, s, 8); c.fill();
  c.strokeStyle = 'rgba(255,210,61,0.55)'; c.lineWidth = 1.5;
  rr(c, x, y, s, s, 8); c.stroke();
  c.fillStyle = active ? '#120a06' : '#f0dfae';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  if (glyph === 'pause') {
    c.fillRect(cx - 6, cy - 8, 4, 16);
    c.fillRect(cx + 2, cy - 8, 4, 16);
  } else {
    c.font = 'bold 20px ui-monospace,monospace';
    c.fillText(glyph, cx, cy + 1);
  }
  return { x: x, y: y, w: s, h: s };
}

function drawTopButtons(W, H) {
  hudRects.pause = squareButton('pause', W - 66, 102, 38, false);
  hudRects.help = squareButton('?', W - 22 - 2, 102, 38, false);
}

function drawPause(W, H) {
  var c = hud;
  c.fillStyle = 'rgba(6,5,4,0.82)'; c.fillRect(0, 0, W, H);
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.save(); c.shadowColor = '#ffd23d'; c.shadowBlur = 20;
  c.fillStyle = '#ffd23d'; c.font = 'bold 34px ui-monospace,monospace';
  c.fillText(T.pauseTitle, W / 2, H * 0.18); c.restore();
  hudRects.resume = button(T.pauseResume, W / 2, H * 0.30, 260, 52, '#ffd23d');
  var muted = !!audioDebug().muted;
  hudRects.sound = button(muted ? T.pauseSoundOff : T.pauseSoundOn, W / 2, H * 0.40, 260, 46, muted ? '#8a7a58' : '#a6e08a');
  hudRects.toMenu = button(T.btnMenu, W / 2, H * 0.475, 200, 42, '#8a7a58');
  // upgrades taken this run
  c.fillStyle = '#e6d2b0'; c.font = 'bold 15px ui-monospace,monospace';
  c.fillText(T.pauseUpgradesTitle, W / 2, H * 0.565);
  var taken = [];
  var tk = state.takenUpgrades || {};
  for (var i = 0; i < UPGRADES.length; i++) {
    var n = tk[UPGRADES[i].id];
    if (n) taken.push(UPGRADES[i].ru + (n > 1 ? ' x' + n : ''));
  }
  c.font = '13px ui-monospace,monospace';
  if (!taken.length) {
    c.fillStyle = '#877';
    c.fillText(T.pauseNoUpgrades, W / 2, H * 0.61);
  } else {
    c.fillStyle = '#cbb89a';
    var perCol = Math.ceil(taken.length / 2);
    for (var t2 = 0; t2 < taken.length; t2++) {
      var col = t2 < perCol ? 0 : 1;
      var row = t2 % perCol;
      var tx = taken.length > perCol ? (col === 0 ? W / 2 - 130 : W / 2 + 130) : W / 2;
      c.fillText(taken[t2], tx, H * 0.61 + row * 22);
    }
  }
}

function iconFit(img, x, y, s) {
  var c = hud;
  if (!img || !(img.naturalWidth || img.width)) return;
  var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  var k = Math.min(s / w, s / h);
  c.drawImage(img, x + (s - w * k) / 2, y + (s - h * k) / 2, w * k, h * k);
}

function drawHelp(W, H) {
  var c = hud;
  c.fillStyle = 'rgba(5,4,3,0.94)'; c.fillRect(0, 0, W, H);
  var k = Math.max(0.62, Math.min(1, W / 1060, H / 780));
  c.save();
  c.translate(W / 2, 0); c.scale(k, k); c.translate(-530, 0);
  // virtual 1060-wide layout space
  c.textAlign = 'left'; c.textBaseline = 'middle';
  c.save(); c.shadowColor = '#ffd23d'; c.shadowBlur = 14;
  c.fillStyle = '#ffd23d'; c.font = 'bold 24px ui-monospace,monospace';
  c.fillText(T.helpTitle, 40, 42); c.restore();
  var y = 78;
  c.fillStyle = '#d8c8a8'; c.font = '13px ui-monospace,monospace';
  for (var h2 = 0; h2 < T.helpHowTo.length; h2++) { c.fillText(T.helpHowTo[h2], 40, y); y += 20; }
  // monsters (live hp from BOOZE)
  y += 14;
  c.fillStyle = '#f0c966'; c.font = 'bold 15px ui-monospace,monospace';
  c.fillText(T.helpMonstersTitle, 40, y); y += 14;
  var mrows = [
    ['enemy_beer_imp', BOOZE[0], T.helpMonsterBeer],
    ['enemy_wine_wretch', BOOZE[1], T.helpMonsterWine],
    ['enemy_champagne_shard', BOOZE[2], T.helpMonsterChamp],
    ['enemy_cognac_brute', BOOZE[3], T.helpMonsterCognac],
  ];
  for (var m = 0; m < mrows.length; m++) {
    iconFit(sprites.images[mrows[m][0]], 40, y + 2, 40);
    c.fillStyle = '#f3ead6'; c.font = 'bold 13px ui-monospace,monospace';
    c.fillText(mrows[m][1].ru.toUpperCase() + '  ' + T.helpHpPrefix + mrows[m][1].hp, 90, y + 14);
    c.fillStyle = '#b6a88d'; c.font = '12px ui-monospace,monospace';
    c.fillText(mrows[m][2], 90, y + 32);
    y += 48;
  }
  // items + events
  y += 12;
  c.fillStyle = '#f0c966'; c.font = 'bold 15px ui-monospace,monospace';
  c.fillText(T.helpItemsTitle, 40, y); y += 14;
  var irows = [
    ['proj_vodka_bottle', T.helpItemVodka],
    ['pickup_zakuska_pickle', T.helpItemZakuska],
    ['tapok_old_sneaker', T.helpItemTapok],
    ['horror_open_window', T.helpItemWindow],
    ['shield_mattress', T.helpItemMattress],
    ['belochka_squirrel', T.helpItemBelochka],
  ];
  for (var it = 0; it < irows.length; it++) {
    iconFit(sprites.images[irows[it][0]], 40, y + 2, 40);
    c.fillStyle = '#f3ead6'; c.font = 'bold 13px ui-monospace,monospace';
    c.fillText(irows[it][1].name, 90, y + 14);
    c.fillStyle = '#b6a88d'; c.font = '12px ui-monospace,monospace';
    c.fillText(irows[it][1].desc, 90, y + 32);
    y += 48;
  }
  // right column: upgrades
  var ry = 78;
  c.fillStyle = '#f0c966'; c.font = 'bold 15px ui-monospace,monospace';
  c.fillText(T.helpUpgradesTitle, 560, ry); ry += 22;
  for (var u = 0; u < UPGRADES.length; u++) {
    c.fillStyle = '#f3ead6'; c.font = 'bold 12px ui-monospace,monospace';
    c.fillText(UPGRADES[u].ru, 560, ry);
    c.fillStyle = '#b6a88d'; c.font = '12px ui-monospace,monospace';
    c.fillText(UPGRADES[u].de, 780, ry);
    ry += 26;
  }
  c.restore();
  hudRects.back = button(T.helpBack, W / 2, H - 44, 220, 46, '#ffd23d');
}

function drawMeters(W, H, warp) {
  var c = hud, m = 14, bw = (W - m * 2 - 10) * 0.5;
  // XP progress (thin line at the very top edge)
  var xf = state.xpNext > 0 ? state.xp / state.xpNext : 0;
  c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(0, 0, W, 3);
  c.fillStyle = '#ffd23d'; c.fillRect(0, 0, W * clamp(xf, 0, 1), 3);
  // VODKA = ammo AND sanity
  bar(m, 30, bw, 12, player.vodka / player.maxVodka, 240, 180, 60, T.barVodka, Math.ceil(player.vodka));
  // HP = blood (you fire it when the bottle's dry)
  bar(m + bw + 10, 30, bw, 12, player.hp / player.maxHp, 210, 40, 40, T.barBlood, Math.ceil(player.hp));
  // белочка = madness meter (fills toward 1 = you lose)
  bar(m, 58, W - m * 2, 8, player.belochka, 200, 40, 230, T.barBelochka, '');
  // score + clock
  c.fillStyle = '#cdb'; c.font = 'bold 12px ui-monospace,monospace'; c.textAlign = 'left'; c.textBaseline = 'top';
  c.fillText(T.hudLevelPrefix + state.level + '   ' + T.hudKillsPrefix + state.kills, m, 72);
  drawAbilityMarks(m, 91);
  c.textAlign = 'right';
  var left = Math.max(0, Math.ceil(state.goalTime - state.survived));
  c.fillStyle = left <= 10 ? '#ffd23d' : '#cdb';
  c.fillText(T.hudAmbulancePrefix + left + T.hudAmbulanceSuffix, W - m, 72);
}

function drawAbilityMarks(x, y) {
  var c = hud, n = 0;
  function mark(r, g, b, count, shape) {
    var cx = x + n * 30 + 8, cy = y;
    c.save();
    c.globalAlpha = 0.82;
    c.strokeStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
    c.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',0.18)';
    c.lineWidth = 2;
    c.beginPath();
    if (shape === 1) c.rect(cx - 6, cy - 6, 12, 12);
    else if (shape === 2) { c.moveTo(cx, cy - 8); c.lineTo(cx + 8, cy); c.lineTo(cx, cy + 8); c.lineTo(cx - 8, cy); c.closePath(); }
    else c.arc(cx, cy, 7, 0, Math.PI * 2);
    c.fill(); c.stroke();
    c.globalAlpha = 1;
    c.fillStyle = '#e8dcc8'; c.font = 'bold 10px ui-monospace,monospace'; c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText(String(count), cx + 10, cy + 1);
    c.restore();
    n++;
  }
  if (player.up.molotov > 0) mark(255, 94, 18, player.up.molotov, 2);
  if (player.up.ricochetSeek > 0) mark(255, 210, 61, player.up.ricochetSeek, 0);
  if (player.up.shieldMax > 0) mark(140, 220, 255, player.shield + '/' + player.up.shieldMax, 1);
  if (player.up.ambulance > 0) mark(255, 55, 90, player.up.ambulance, 0);
  if (player.up.wisdom > 0) mark(210, 150, 90, '+1', 1);
}

function drawTutorPill(W, H) {
  var text = null, alpha = 1, cont = false;
  if (state.tutorStep === 0) text = T.tutorMove;
  else if (state.tutorStep === 1) text = T.tutorStop;
  else if (state.tutorStep === 2) { text = T.tutorStop; cont = true; }
  else if (state.tutorStep === 3) { text = T.tutorDodge; alpha = Math.min(1, state.tutorT / 0.6); }
  if (!text) return;
  var c = hud;
  c.save();
  c.globalAlpha = alpha;
  c.font = 'bold 15px ui-monospace,monospace';
  var w = Math.min(W - 40, c.measureText(text).width + 46), h = 42;
  var x = W / 2 - w / 2, y = H - 118;
  var pulse = 0.5 + 0.5 * Math.sin(state.t * 4);
  c.shadowColor = 'rgba(255,210,61,' + (0.25 + pulse * 0.3).toFixed(2) + ')'; c.shadowBlur = 16;
  c.fillStyle = 'rgba(18,10,6,0.92)'; rr(c, x, y, w, h, 21); c.fill();
  c.shadowBlur = 0;
  c.strokeStyle = 'rgba(255,210,61,' + (0.55 + pulse * 0.25).toFixed(2) + ')'; c.lineWidth = 2;
  rr(c, x, y, w, h, 21); c.stroke();
  c.fillStyle = '#ffd23d'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(text, W / 2, y + h / 2 + 1);
  if (cont) {
    c.font = 'bold 13px ui-monospace,monospace';
    c.fillStyle = 'rgba(255,255,255,' + (0.45 + pulse * 0.5).toFixed(2) + ')';
    c.fillText(T.tutorContinue, W / 2, y + h + 24);
  }
  c.restore();
}

function drawTapokHint(W, H) {
  var c = hud, w = Math.min(380, W - 28), h = 68;
  var x = clamp(tapok.x - w / 2, 14, W - w - 14);
  var y = clamp(tapok.y - 126, 106, H - h - 18);
  var alpha = clamp(tapok.popupT, 0, 1);
  c.save();
  c.globalAlpha = alpha;
  c.shadowColor = 'rgba(255,80,20,0.42)'; c.shadowBlur = 18;
  c.fillStyle = 'rgba(18,10,6,0.90)'; rr(c, x, y, w, h, 8); c.fill();
  c.shadowBlur = 0;
  c.strokeStyle = 'rgba(255,210,61,0.72)'; c.lineWidth = 2; rr(c, x, y, w, h, 8); c.stroke();
  c.fillStyle = '#ffd23d'; c.font = 'bold 14px ui-monospace,monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(T.tapokHintTitle, x + w / 2, y + 22);
  c.fillStyle = '#e8dcc8'; c.font = '12px ui-monospace,monospace';
  c.fillText(T.tapokHintSub, x + w / 2, y + 46);
  c.restore();
}

function drawMenu(W, H) {
  var c = hud;
  if (menuBgArt && bomzharaArtStatus.menuBgLoaded) {
    // generated winter-squat backdrop replaces the old flat black screen
    drawImageCover(c, menuBgArt, 0, 0, W, H);
    c.fillStyle = 'rgba(6,5,4,0.44)'; c.fillRect(0, 0, W, H);
    var mg = c.createRadialGradient(W / 2, H * 0.46, Math.min(W, H) * 0.30, W / 2, H * 0.5, Math.max(W, H) * 0.72);
    mg.addColorStop(0, 'rgba(2,1,3,0)');
    mg.addColorStop(1, 'rgba(2,1,3,0.72)');
    c.fillStyle = mg; c.fillRect(0, 0, W, H);
  } else {
    c.fillStyle = 'rgba(6,5,4,0.7)'; c.fillRect(0, 0, W, H);
  }
  drawBomzharaPortrait(W, H, 'menu');
  var split = W >= 760 && H >= 440 && bomzharaArtStatus.loaded;
  var cx = split ? clamp(W / 2 + 130, W / 2, W - 260) : W / 2;
  var copyW = split ? Math.max(260, Math.min(500, W - cx - 32)) : W - 70;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.save(); c.shadowColor = 'rgba(200,40,230,0.6)'; c.shadowBlur = 24;
  c.fillStyle = '#fff'; c.font = 'bold 30px ui-monospace,monospace'; c.fillText(T.menuTitleTop, cx, H / 2 - 96);
  c.fillStyle = '#ffd23d'; c.font = 'bold 40px ui-monospace,monospace'; c.fillText(T.menuTitle, cx, H / 2 - 56);
  c.restore();
  c.fillStyle = '#b8a' ; c.font = '13px ui-monospace,monospace';
  wrap(c, T.menuCopy, cx, H / 2 - 18, copyW, 18);
  hudRects.play = button(T.menuPlay, cx, H / 2 + 56, 240, 56, '#ffd23d');
  // difficulty picker: easy = half monsters, hard = x1.5
  var diffs = [['easy', T.diffEasy], ['medium', T.diffMedium], ['hard', T.diffHard]];
  var dw = 96, dh = 34, gap = 10, total = diffs.length * dw + (diffs.length - 1) * gap;
  var dy = H / 2 + 110;
  hudRects.diff = [];
  for (var di = 0; di < diffs.length; di++) {
    var dx = cx - total / 2 + di * (dw + gap);
    var active = state.difficulty === diffs[di][0];
    c.save();
    if (active) { c.shadowColor = '#ffd23d'; c.shadowBlur = 12; }
    c.fillStyle = active ? '#ffd23d' : 'rgba(36,30,22,0.92)';
    rr(c, dx, dy - dh / 2, dw, dh, dh / 2); c.fill();
    c.restore();
    c.strokeStyle = active ? '#ffd23d' : 'rgba(255,210,61,0.35)';
    c.lineWidth = 1.5;
    rr(c, dx, dy - dh / 2, dw, dh, dh / 2); c.stroke();
    c.fillStyle = active ? '#120a06' : '#cbb89a';
    c.font = 'bold 13px ui-monospace,monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(diffs[di][1], dx + dw / 2, dy + 1);
    hudRects.diff.push({ x: dx, y: dy - dh / 2, w: dw, h: dh, id: diffs[di][0] });
  }
  if (state.best > 0) { c.fillStyle = '#776'; c.font = '12px ui-monospace,monospace'; c.fillText(T.menuBestPrefix + state.best, cx, H / 2 + 150); }
  drawHorrorList(W, H);
}

function drawEnd(W, H, win) {
  var c = hud;
  c.fillStyle = 'rgba(6,5,4,0.82)'; c.fillRect(0, 0, W, H);
  drawBomzharaPortrait(W, H, win ? 'end' : 'dead');
  c.textAlign = 'center'; c.textBaseline = 'middle';
  var split = W >= 760 && H >= 440 && (win ? bomzharaArtStatus.loaded : bomzharaArtStatus.deathLoaded);
  var cx = split ? clamp(W / 2 + 130, W / 2, W - 260) : W / 2;
  var copyW = split ? Math.max(260, Math.min(500, W - cx - 32)) : W - 70;
  var title, sub, col;
  if (win && state.endReason === 'sane') { title = T.endWinSaneTitle; sub = T.endWinSaneSub; col = '#7dffa6'; }
  else if (win) { title = T.endWinWreckTitle; sub = T.endWinWreckSub; col = '#ffd23d'; }
  else if (state.endReason === 'madness') { title = T.endMadnessTitle; sub = T.endMadnessSub; col = '#c828e6'; }
  else if (state.endReason === 'window') { title = T.endWindowTitle; sub = T.endWindowSub; col = '#9bc8ff'; }
  else { title = T.endBledTitle; sub = T.endBledSub; col = '#e64545'; }
  c.save(); c.shadowColor = col; c.shadowBlur = 22; c.fillStyle = col; c.font = 'bold 26px ui-monospace,monospace';
  c.fillText(title, cx, H / 2 - 70); c.restore();
  c.fillStyle = '#cbb'; c.font = '13px ui-monospace,monospace';
  wrap(c, sub, cx, H / 2 - 30, copyW, 18);
  c.fillStyle = '#cdb'; c.font = 'bold 14px ui-monospace,monospace';
  c.fillText(T.endStatsKillsPrefix + state.kills + '    ' + T.endStatsPhantomsPrefix + state.phantoms, cx, H / 2 + 6);
  hudRects.retry = button(T.endRetry, cx, H / 2 + 54, 250, 54, col);
  hudRects.toMenu = button(T.btnMenu, cx, H / 2 + 118, 190, 42, '#8a7a58');
}

function drawUpgrade(W, H) {
  var c = hud;
  c.fillStyle = 'rgba(6,5,4,0.92)'; c.fillRect(0, 0, W, H);
  c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  c.fillStyle = '#5dffa6'; c.font = 'bold 13px ui-monospace,monospace';
  c.fillText(T.upgradeLevelPrefix + state.level, W / 2, 116);
  c.save(); c.shadowColor = 'rgba(255,210,61,0.5)'; c.shadowBlur = 18;
  c.fillStyle = '#fff'; c.font = 'bold 26px ui-monospace,monospace';
  c.fillText(T.upgradeTitle, W / 2, 146); c.restore();
  upRects = [];
  var n = state.upChoices.length, top = 172, ch = Math.min((H - top - 24) / n - 10, 112), cw = Math.min(W - 40, 460), cx0 = W / 2 - cw / 2;
  for (var i = 0; i < n; i++) {
    var u = UPGRADES[state.upChoices[i]], y = top + i * (ch + 10);
    c.save(); c.shadowColor = '#ffd23d'; c.shadowBlur = 12;
    c.fillStyle = 'rgba(22,18,12,0.96)'; rr(c, cx0, y, cw, ch, 12); c.fill(); c.restore();
    c.lineWidth = 2; c.strokeStyle = '#ffd23d'; rr(c, cx0, y, cw, ch, 12); c.stroke();
    c.textAlign = 'left'; c.fillStyle = '#ffd23d'; c.font = 'bold 18px ui-monospace,monospace';
    c.fillText(u.ru, cx0 + 16, y + ch * 0.44);
    c.fillStyle = '#c8d2ee'; c.font = '13px ui-monospace,monospace';
    c.fillText(u.de, cx0 + 16, y + ch * 0.72);
    upRects.push({ x: cx0, y: y, w: cw, h: ch });
  }
  c.textAlign = 'left';
}

function wrap(c, text, cx, y, maxW, lh) {
  var words = text.split(' '), line = '', lines = [];
  c.textAlign = 'center'; c.textBaseline = 'middle';
  for (var i = 0; i < words.length; i++) { var t = line ? line + ' ' + words[i] : words[i]; if (c.measureText(t).width > maxW && line) { lines.push(line); line = words[i]; } else line = t; }
  if (line) lines.push(line);
  for (var j = 0; j < lines.length; j++) c.fillText(lines[j], cx, y + j * lh);
}

function drawPossessedKey(W, H) {
  var c = hud, x = W - 92, y = H * 0.5 - 42;
  var label = state.possessedX > 0 ? 'D' : (state.possessedX < 0 ? 'A' : (state.possessedY < 0 ? 'W' : 'S'));
  c.save();
  c.globalAlpha = 0.9;
  c.shadowColor = '#ffd23d'; c.shadowBlur = 16;
  c.fillStyle = 'rgba(22,18,8,0.82)'; rr(c, x, y, 68, 68, 10); c.fill();
  c.strokeStyle = '#ffd23d'; c.lineWidth = 3; rr(c, x, y, 68, 68, 10); c.stroke();
  c.fillStyle = '#ffd23d'; c.font = 'bold 38px ui-monospace,monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(label, x + 34, y + 36);
  c.strokeStyle = 'rgba(255,210,61,0.55)'; c.lineWidth = 2;
  for (var i = 0; i < 4; i++) {
    c.beginPath();
    c.moveTo(x + 34, y + 68);
    c.quadraticCurveTo(x + 18 + i * 12, y + 100 + Math.sin(state.t * 7 + i) * 10, x - 36 + i * 28, y + 136);
    c.stroke();
  }
  c.restore();
}

function drawWindSound(W, H) {
  var c = hud, p = state.windowPulse || 0.4;
  c.save();
  c.globalAlpha = 0.45 + p * 0.35;
  c.fillStyle = '#dcefff'; c.font = 'bold 18px ui-monospace,monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(T.windHowl, W * 0.74 + Math.sin(state.t * 4) * 18, 126 + Math.sin(state.t * 8) * 4);
  c.strokeStyle = 'rgba(220,240,255,0.45)'; c.lineWidth = 2;
  for (var i = 0; i < 5; i++) {
    var yy = 150 + i * 34 + Math.sin(state.t * 5 + i) * 12;
    c.beginPath();
    c.moveTo(W * 0.48, yy);
    c.bezierCurveTo(W * 0.58, yy - 22, W * 0.70, yy + 22, W * 0.92, yy - 10);
    c.stroke();
  }
  c.restore();
}

function drawHorrorList(W, H) {
  var c = hud, seen = [], i;
  for (i = 0; i < HORRORS.length; i++) if (state.horrorSeen[HORRORS[i].id]) seen.push(HORRORS[i]);
  if (!seen.length) return;
  var w = Math.min(560, W - 40), x = W / 2 - w / 2, y = Math.min(H - 122, H / 2 + 134);
  c.save();
  c.fillStyle = 'rgba(0,0,0,0.46)'; rr(c, x, y, w, 92, 8); c.fill();
  c.strokeStyle = 'rgba(255,210,61,0.32)'; c.lineWidth = 1; rr(c, x, y, w, 92, 8); c.stroke();
  c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  c.fillStyle = '#ffd23d'; c.font = 'bold 12px ui-monospace,monospace';
  c.fillText(T.horrorsTitle, x + 14, y + 21);
  for (i = 0; i < Math.min(seen.length, 3); i++) {
    var yy = y + 42 + i * 18;
    c.fillStyle = '#fff'; c.font = 'bold 12px ui-monospace,monospace'; c.fillText(seen[i].name, x + 14, yy);
    c.fillStyle = '#9ea8bb'; c.font = '11px ui-monospace,monospace'; c.fillText(seen[i].desc, x + 238, yy);
  }
  c.restore();
}
