import { STRINGS } from './modules/strings.js';
import { createLanguageController } from './modules/language.js';
import {
  BAL, PALETTE, FARPAL, THEMES, PB, DISTRICT_KEYS, NUKES,
  EXPLOSION_ASSET_SPECS, MUSHROOM_SOURCE_SPECS,
  districtPalette, districtFarPalette, districtColor, districtAccent,
} from './modules/game-data.js';
import {
  safeAssetId, cleanAssetId, hexColor, mixHex, rgba,
  darken, mixRgb, formatCompact,
} from './modules/game-utils.js';
import { createCollectibleAssets } from './modules/collectible-assets.js';
import { createRenderer } from './modules/render.js';
import { createSaveStore, migrateTutorialStep } from './modules/persistence.js';
import { installHookSurface } from './modules/hook-surface.js';

var PLATFORM = window.MegatonPlatform || {};
var ALLOW_TEST_HOOKS = typeof PLATFORM.allowsTestHooks === 'function' && PLATFORM.allowsTestHooks();
var saveStore = createSaveStore({ storage: localStorage, platform: PLATFORM });
var HOOKS = Object.create(null);

var SPRITE_NAMES = [];
var CFG = { tuning: { payout_mult: 1, cost_mult: 1 }, events: {}, daily: { seed: 0 }, motd: { en: '', ru: '' }, version: 0 };
var T = function (k) { return GF.t(k); };
var tutorialGiftChestImg = new Image();
tutorialGiftChestImg.src = 'assets/gacha/ui/boxes/premium_payload.png';
var language = createLanguageController({ game: GF, platform: PLATFORM, storage: localStorage, locationRef: location });
var setLanguage = language.set;
var initLanguage = language.initialize;
var cityTheme = '';
var dpal = districtPalette;
var dfar = districtFarPalette;
var dcol = districtColor;
var dacc = districtAccent;
var fmt = formatCompact;
var mix = mixRgb;


// ── PERSISTENT STATE ───────────────────────────────────────────────────────
var money = 0, dispMoney = 0, totalEarned = 0, best = 0, cityTier = 0, powerLvl = 0, flareLvl = 0, penLvl = 0, mirvLvl = 0, shockLvl = 0, luckLvl = 0, empLvl = 0, orbitalLvl = 0, clusterLvl = 0, firestormLvl = 0, chainLvl = 0, glassLvl = 0, seismicLvl = 0, infernoLvl = 0, toppleLvl = 0, meltdownLvl = 0, tidalLvl = 0, fireworksLvl = 0, eyeLvl = 0, maxTier = 0, tutDone = false, starterGiven = false, upgDone = false, citiesRazed = 0, godPower = false;
var lastSeen = 0, dailyStreak = 0, lastClaimDay = -1, welcomeCaps = 0, welcomeMs = 0, welcomeBuying = false;   // reactor (offline caps) + daily ration (login streak)
var ownedSkins = [], skinCopies = {}, equippedSkin = null, skinBoosts = {}, gachaStats = {};   // local skin collection prototype; server authority comes later
var setBoosts = {}, capsDealAvailable = false, lastOfferDay = -1;   // collection set bonuses + result-screen daily-deal chip (wrapper-fed)
function setBoost(kind) { var v = setBoosts && Number(setBoosts[kind] || 0); return isFinite(v) ? Math.max(0, v) : 0; }
function skinBoost(kind) { if (equippedSkin && equippedSkin.id && !equippedSkin.boost && (!skinBoosts || skinBoosts[kind] == null)) rehydrateEquippedSkin(); var v = skinBoosts && Number(skinBoosts[kind] || 0); return isFinite(v) ? Math.max(0, v) : 0; }
function extraIncomeBonus() { return Math.min(0.85, luckLvl * 0.07 + skinBoost('crit_bonus')); }   // old luckLvl save field now means EXTRA INCOME
function criticalPayoutChance() { return Math.min(0.28, 0.06 + luckLvl * 0.015 + skinBoost('crit_bonus')); }
function criticalPayoutMult() { return Math.min(0.65, 0.35 + luckLvl * 0.03); }
function payoutBoost(extraKind) { return 1 + skinBoost('caps_mult') + setBoost('caps_mult') + extraIncomeBonus() + (extraKind ? skinBoost(extraKind) : 0); }
function skinBoostLabel() { return equippedSkin && equippedSkin.boost ? (equippedSkin.name + '  +' + Math.round(Number(equippedSkin.boost.value || 0) * 1000) / 10 + '% ' + equippedSkin.boost.label) : ''; }
function uiFont(px, weight) { return (weight || '800') + ' ' + Math.round(px) + 'px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'; }
function uiCorners(c, x, y, w, h, S, col) {
  var l = Math.min(13 * S, w * 0.14, h * 0.3);
  c.save(); c.strokeStyle = col || PB.rule; c.lineWidth = Math.max(1, 1.05 * S); c.beginPath();
  c.moveTo(x, y + l); c.lineTo(x, y); c.lineTo(x + l, y);
  c.moveTo(x + w - l, y); c.lineTo(x + w, y); c.lineTo(x + w, y + l);
  c.moveTo(x + w, y + h - l); c.lineTo(x + w, y + h); c.lineTo(x + w - l, y + h);
  c.moveTo(x + l, y + h); c.lineTo(x, y + h); c.lineTo(x, y + h - l);
  c.stroke(); c.restore();
}
function uiPanel(c, x, y, w, h, r, fill, stroke) {
  var S = GF.S;
  GF.rr(c, x, y, w, h, r == null ? 4 * S : r);
  c.fillStyle = fill || 'rgba(38,34,22,0.94)'; c.fill();
  c.lineWidth = Math.max(1, 1.05 * S); c.strokeStyle = stroke || PB.rule; c.stroke();
  c.save(); c.globalAlpha = 0.24; c.strokeStyle = PB.paper; c.lineWidth = Math.max(1, 0.75 * S); c.beginPath(); c.moveTo(x + 8 * S, y + 5 * S); c.lineTo(x + w - 8 * S, y + 5 * S); c.stroke(); c.restore();
  uiCorners(c, x + 2 * S, y + 2 * S, w - 4 * S, h - 4 * S, S, stroke || PB.rule);
}
function uiOctPath(c, x, y, r) {
  var cut = r * 0.34;
  c.beginPath();
  c.moveTo(x - r + cut, y - r); c.lineTo(x + r - cut, y - r); c.lineTo(x + r, y - r + cut); c.lineTo(x + r, y + r - cut);
  c.lineTo(x + r - cut, y + r); c.lineTo(x - r + cut, y + r); c.lineTo(x - r, y + r - cut); c.lineTo(x - r, y - r + cut); c.closePath();
}
function skinVisual() { if (equippedSkin && equippedSkin.id && !equippedSkin.visual) rehydrateEquippedSkin(); return equippedSkin && equippedSkin.visual && typeof equippedSkin.visual === 'object' ? equippedSkin.visual : {}; }
var collectibleAssets = createCollectibleAssets({
  ImageCtor: Image,
  getClock: function () { return bgT; },
  getSkin: function () { return { equipped: equippedSkin, visual: skinVisual() }; },
  palette: PB
});
var collectibleIcon = collectibleAssets.icon;
var collectibleFrame = collectibleAssets.frame;
var collectiblePalette = collectibleAssets.colors;
// ── GAMEANALYTICS LEVEL PROGRESSION ────────────────────────────────────────
function lfSend(name, level) {
  var lvl = Math.max(1, Math.floor(Number(level) || 1));
  gaProgression(name, lvl);
}
function lfLevel() { return Math.max(1, cityTier + 1); }
function lfStart() { lfSend('start', lfLevel()); }
function lfFinish(win) { lfSend(win ? 'complete' : 'fail', lfLevel()); }
function gaProgression(name, level) {
  if (window._silent) return;
  var payload = {
    level: Math.max(1, Math.floor(Number(level) || lfLevel())),
    cityTier: cityTier,
    maxTier: maxTier,
    zone: zoneName || 'campaign',
    levelName: levelName || '',
    money: Math.round(money),
    score: Math.round(totalEarned),
    destroyedPct: Math.round(destroyedW / Math.max(1, totalW) * 100)
  };
  try { if (typeof PLATFORM.analyticsProgression === 'function') PLATFORM.analyticsProgression(name, payload); } catch (e) {}
}

// ── RUN STATE ──────────────────────────────────────────────────────────────
var gs = 'AIM';                  // AIM | BLAST | RESULT
var GRID = 13, ORIGIN = { x: 0, y: 0 }, fit = 1;
var buildings = [], walls = [], batteries = [], interceptors = [], vehicles = [], hasWalls = false, failStreak = 0, lastIntercept = 0, cityReinforced = false, chunks = [], craters = [], waves = [], mushrooms = [], smoke = [], dust = [], fires = [], impactPulses = [], warhead = null;
var totalW = 1, destroyedW = 0, dropEarned = 0, weakpointHits = 0, lastWeakpointHits = 0, weakpointEffectDepth = 0, aim = { ci: 6, cj: 6 };
var waterFrom = 999, waterTo = 999, ships = [], zoom = 1, baseFit = 1, zoneName = '', levelName = '';   // coastal: mainland | OCEAN (waterFrom..waterTo) | far shore + camera pull-back
var WATER = null, hasWater = false, BUILTIN = {};   // per-cell ocean mask + the shipped campaign levels (levels.json)
var DISTMAP = null;   // per-cell district id for the ground tint (0=downtown, 1=station, 2=airport, 3=ghetto, 4=chinatown) on cumulative maps
var DKEYS = DISTRICT_KEYS;
var planes = [], planeT = 4, hasAirport = false;   // aircraft cross the sky ONLY on levels with an airport ('P'); the blast knocks them down for bonus CAPS
var hasStation = false, hasGhetto = false, hasChinatown = false;   // which DISTRICTS the current (possibly cumulative) map contains -> drives per-district perks (the city grows: station, then airport, then ghetto, then chinatown fan out on the sides)
var hasMall = false, hasMountain = false, hasRefinery = false, hasZombie = false;   // later districts: malls (glass storm), mountain base (seismic), oil refinery (inferno), quarantine zone (wandering zombies)
var hasSkyscraper = false, hasPowerplant = false, hasPort = false, hasPark = false, hasCathedral = false;   // newest districts: skyscrapers (topple), power plant (meltdown), port (tidal), park (fireworks), cathedral (visual variety)
var zombies = [], zombieT = 2;   // QUARANTINE: a shambling crowd that WANDERS the zone as MOVING bonus targets (same role as planes), vaporized by the blast for caps
var fireballs = [], orbitals = [], faults = [], meltZones = [], fireworkBursts = [], blastSeq = 0, lastBlastProfile = null;   // procedural profiles make each blast differ
var explosionAssets = [];
var mushroomSourceAssets = [];
var mushroomTintCanvas = null, mushroomTintCtx = null;
// Perf governor: when real frame times stay bad the low-fx budget latches on
// for the session, so weak phones AND weak desktops drop to the cheap path.
var perfLowFx = false, _perfWin = [], _perfHot = 0, _perfLast = 0, _perfBadWins = 0;
function perfSample(frameMs) {
  if (perfLowFx || !(frameMs > 0) || frameMs > 500) return;   // ignore tab-hidden gaps
  _perfWin.push(frameMs);
  if (frameMs > 33.4) _perfHot += 1;
  if (_perfWin.length < 90) return;
  var sum = 0;
  for (var i = 0; i < _perfWin.length; i++) sum += _perfWin[i];
  var bad = sum / _perfWin.length > 24 || _perfHot >= 12;
  _perfBadWins = bad ? _perfBadWins + 1 : 0;
  if (_perfBadWins >= 2) perfLowFx = true;   // two consecutive bad windows = sustained, not a GC blip
  _perfWin.length = 0; _perfHot = 0;
}
function mobileFx() {
  if (perfLowFx) return true;
  var coarse = false;
  try { coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches); } catch (e) {}
  return GF.W <= 520 || (coarse && GF.H > GF.W * 1.15);
}
function fxScale() { return mobileFx() ? 0.42 : 1; }
function fxCount(n, min) { return Math.max(min || 1, Math.round(n * fxScale())); }
function fxCap(desktop, mobile) { return mobileFx() ? mobile : desktop; }
function fxLife(v) { return mobileFx() ? v * 0.72 : v; }
function fxRand(seed) { var x = Math.sin(seed) * 43758.5453123; return x - Math.floor(x); }
function fxNoise(seed, t) {
  t = Math.max(0, t || 0);
  var i = Math.floor(t), f = t - i;
  f = f * f * (3 - 2 * f);
  var a = fxRand(seed + i * 127.1), b = fxRand(seed + (i + 1) * 127.1);
  return (a + (b - a) * f) * 2 - 1;
}
function fxChaos(seed, t) {
  return fxNoise(seed, t) * 0.62 + fxNoise(seed + 43.7, t * 2.17 + 5.3) * 0.27 + fxNoise(seed + 91.2, t * 4.11 + 1.7) * 0.11;
}
function strokeBrokenEllipse(c, x, y, rx, ry, rot, seed, count, spanBase) {
  for (var n = 0; n < count; n++) {
    var a = fxRand(seed + n * 31.7) * Math.PI * 2;
    var span = spanBase * (0.55 + fxRand(seed + n * 47.3 + 5) * 0.9);
    var rr = 0.82 + fxRand(seed + n * 59.9 + 11) * 0.28;
    c.beginPath();
    c.ellipse(x, y, rx * rr, ry * (0.9 + fxRand(seed + n * 67.1 + 17) * 0.24), rot + (fxRand(seed + n * 71.5 + 23) - 0.5) * 0.22, a, a + span);
    c.stroke();
  }
}
function prepareExplosionAsset(img, type) {
  var side = type === 'smoke' ? 160 : 192;
  var cn = document.createElement('canvas'), cc = cn.getContext('2d');
  cn.width = cn.height = side;
  var sc = Math.min(side / img.naturalWidth, side / img.naturalHeight) * 0.94;
  var w = img.naturalWidth * sc, h = img.naturalHeight * sc;
  cc.drawImage(img, (side - w) / 2, (side - h) / 2, w, h);
  return cn;
}
function prepareMushroomSourceAsset(img, spec) {
  var side = 224;
  var cn = document.createElement('canvas'), cc = cn.getContext('2d');
  var mask = document.createElement('canvas'), mc = mask.getContext('2d');
  cn.width = cn.height = mask.width = mask.height = side;
  var sc = Math.min(side / img.naturalWidth, side / img.naturalHeight) * 0.96;
  var w = img.naturalWidth * sc, h = img.naturalHeight * sc, ox = (side - w) / 2, oy = (side - h) / 2;
  cc.drawImage(img, ox, oy, w, h);
  var pixels = cc.getImageData(0, 0, side, side);
  var d = pixels.data, isPhoto = spec.file.indexOf('mushroomcloud2') >= 0;
  for (var p = 0; p < d.length; p += 4) {
    var a = d[p + 3], lum = d[p] * 0.299 + d[p + 1] * 0.587 + d[p + 2] * 0.114;
    var keep = a;
    if (isPhoto) keep = a * Math.max(0, Math.min(1, (lum - 16) / 142));
    else if (a > 245 && lum < 8) keep = 0;
    d[p] = 255; d[p + 1] = 255; d[p + 2] = 255; d[p + 3] = Math.max(0, Math.min(255, keep));
  }
  mc.putImageData(pixels, 0, 0);
  var pts = [], md = pixels.data;
  for (var yy = 0; yy < side; yy += 3) for (var xx = 0; xx < side; xx += 3) {
    var pi = (yy * side + xx) * 4, pa = md[pi + 3];
    if (pa > 18) pts.push({ x: xx / side - 0.5, y: yy / side - 0.5, a: pa / 255 });
  }
  return { canvas: cn, mask: mask, side: side, points: pts };
}
function loadExplosionAssets() {
  explosionAssets = EXPLOSION_ASSET_SPECS.map(function (spec, idx) {
    var item = { type: spec.type, file: spec.file, ready: false, canvas: null, idx: idx };
    var img = new Image(), done = false;
    img.decoding = 'async';
    function finish() { if (done || !img.naturalWidth) return; done = true; item.canvas = prepareExplosionAsset(img, spec.type); item.ready = true; }
    img.onload = finish;
    img.src = 'fx/free_explosion_candidates/' + spec.file;
    if (img.decode) img.decode().then(finish).catch(function () {});
    return item;
  });
  mushroomSourceAssets = MUSHROOM_SOURCE_SPECS.map(function (spec, idx) {
    var item = { file: spec.file, weight: spec.weight || 1, ready: false, canvas: null, mask: null, side: 0, points: [], idx: idx };
    var img = new Image(), done = false;
    img.decoding = 'async';
    function finish() {
      if (done || !img.naturalWidth) return;
      done = true;
      var asset = prepareMushroomSourceAsset(img, spec);
      item.canvas = asset.canvas; item.mask = asset.mask; item.side = asset.side; item.points = asset.points || []; item.ready = true;
    }
    img.onload = finish;
    img.src = 'fx/nuke_mushroom_candidates/' + spec.file;
    if (img.decode) img.decode().then(finish).catch(function () {});
    return item;
  });
}
function explosionAsset(type, offset) {
  var found = [];
  for (var i = 0; i < explosionAssets.length; i++) if (explosionAssets[i].ready && explosionAssets[i].type === type) found.push(explosionAssets[i]);
  if (!found.length) return null;
  return found[((offset || 0) % found.length + found.length) % found.length];
}
function mushroomSourceAsset(offset) {
  var found = [];
  for (var i = 0; i < mushroomSourceAssets.length; i++) if (mushroomSourceAssets[i].ready) {
    var weight = Math.max(1, mushroomSourceAssets[i].weight || 1);
    for (var w = 0; w < weight; w++) found.push(mushroomSourceAssets[i]);
  }
  if (!found.length) return null;
  return found[((offset || 0) % found.length + found.length) % found.length];
}
function drawExplosionAsset(c, type, offset, x, y, w, h, rot, alpha, op) {
  var asset = explosionAsset(type, offset);
  if (!asset || !asset.canvas || alpha <= 0) return;
  c.save();
  c.globalAlpha = alpha;
  if (op) c.globalCompositeOperation = op;
  c.translate(x, y);
  c.rotate(rot || 0);
  c.drawImage(asset.canvas, -w / 2, -h / 2, w, h);
  c.restore();
}
function drawMushroomSourceLayer(c, asset, x, y, w, h, progress, seed, alpha, colors, opts) {
  if (!asset || !asset.ready || !asset.mask || alpha <= 0 || w <= 0 || h <= 0) return;
  opts = opts || {};
  if (!mushroomTintCanvas) { mushroomTintCanvas = document.createElement('canvas'); mushroomTintCtx = mushroomTintCanvas.getContext('2d'); }
  var side = asset.side || 224, tc = mushroomTintCtx;
  if (mushroomTintCanvas.width !== side) { mushroomTintCanvas.width = side; mushroomTintCanvas.height = side; }
  tc.clearRect(0, 0, side, side);
  var smokeCol = hexColor(colors.smoke, '#2c2926'), heat = hexColor(colors.heat, '#ff8a3b'), core = hexColor(colors.core, '#fff4b8');
  var grad = tc.createLinearGradient(0, 0, 0, side);
  grad.addColorStop(0, rgba(mixHex(smokeCol, core, 0.22), 0.88));
  grad.addColorStop(0.35, rgba(mixHex(smokeCol, heat, 0.28), 0.9));
  grad.addColorStop(0.62, rgba(mixHex(heat, smokeCol, 0.25), 0.86));
  grad.addColorStop(1, rgba(smokeCol, 0.76));
  tc.fillStyle = grad;
  tc.fillRect(0, 0, side, side);
  var flecks = opts.hot ? 18 : 26;
  for (var f = 0; f < flecks; f++) {
    var fr = fxRand(seed + f * 19.31 + progress * 31.7), fx = side * fxRand(seed + f * 41.7 + 3), fy = side * fxRand(seed + f * 53.9 + 11);
    var rr = side * (0.018 + fxRand(seed + f * 67.1 + 5) * 0.04);
    tc.globalAlpha = opts.hot ? 0.14 + fr * 0.28 : 0.06 + fr * 0.13;
    tc.fillStyle = opts.hot ? (fr > 0.45 ? core : heat) : (fr > 0.55 ? mixHex(smokeCol, '#0d0b0a', 0.55) : mixHex(smokeCol, heat, 0.12));
    tc.beginPath();
    tc.ellipse(fx + fxChaos(seed + f * 81.3, progress * (2.3 + fr)) * side * 0.026, fy - progress * side * 0.04 + fxChaos(seed + f * 91.7 + 9, progress * (1.8 + fr)) * side * 0.015, rr * (1.2 + fr), rr * (0.45 + fr * 0.9), fr * Math.PI, 0, Math.PI * 2);
    tc.fill();
  }
  tc.globalAlpha = 1;
  tc.globalCompositeOperation = 'destination-in';
  tc.drawImage(asset.mask, 0, 0);
  tc.globalCompositeOperation = 'source-over';

  var cropA = opts.cropA == null ? 0 : Math.max(0, Math.min(1, opts.cropA));
  var cropB = opts.cropB == null ? 1 : Math.max(cropA + 0.01, Math.min(1, opts.cropB));
  var slices = opts.slices || (mobileFx() ? 13 : 24), reveal = opts.reveal == null ? Math.max(0, Math.min(1, progress * 1.24 + 0.08)) : opts.reveal;
  var chaos = opts.chaos || 0, chaosT = opts.chaosT == null ? progress : opts.chaosT;
  c.save();
  c.globalAlpha = alpha;
  if (opts.op) c.globalCompositeOperation = opts.op;
  c.translate(x, y);
  c.scale(opts.flip || 1, 1);
  if (opts.rot) c.rotate(opts.rot);
  for (var s = 0; s < slices; s++) {
    var local0 = s / slices, local1 = (s + 1) / slices;
    if (local0 < 1 - reveal) continue;
    var sv = cropA + local0 * (cropB - cropA), sh = (cropB - cropA) / slices;
    var slop = Math.max(0, Math.min(1.4, chaosT - fxRand(seed + s * 61.2 + 8) * 0.32));
    var wave = fxChaos(seed + s * 29.7 + sv * 101.3, progress * (1.4 + sv * 1.8)) * 0.06 + (fxRand(seed + s * 23.7) - 0.5) * 0.026;
    var ripple = 1 + wave * (0.7 + progress * 0.8), dw = w * ripple * (1 - Math.abs(local0 - 0.38) * 0.05);
    var dh = h / slices + 1.2, dy = -h / 2 + local0 * h - progress * h * (0.035 + local0 * 0.045);
    var drift = fxChaos(seed + s * 37.4 + sv * 211.2, progress * (1.7 + sv)) * w * (opts.warp || 0.035) * progress + (opts.lean || 0) * w * (0.16 - sv * 0.08);
    drift += fxChaos(seed + s * 61.6 + 19, chaosT * (1.2 + sv * 1.6)) * w * chaos * slop;
    dy += fxChaos(seed + s * 73.9 + 41, chaosT * (0.9 + sv * 1.3)) * h * chaos * slop * 0.28;
    c.drawImage(mushroomTintCanvas, 0, Math.floor(sv * side), side, Math.max(1, Math.ceil(sh * side)), drift - dw / 2, dy, dw, dh);
  }
  c.restore();
}
function drawMushroomSourcePuffs(c, asset, x, y, w, h, progress, seed, alpha, colors, opts) {
  if (!asset || !asset.ready || !asset.points || !asset.points.length || alpha <= 0 || w <= 0 || h <= 0) return;
  opts = opts || {};
  var smokeCol = hexColor(colors.smoke, '#2c2926'), heat = hexColor(colors.heat, '#ff8a3b'), core = hexColor(colors.core, '#fff4b8');
  var cheap = mobileFx();
  var count = opts.count || (mobileFx() ? 58 : 128), reveal = opts.reveal == null ? Math.max(0, Math.min(1, progress * 1.2 + 0.1)) : opts.reveal;
  var cropA = opts.cropA == null ? 0 : Math.max(0, Math.min(1, opts.cropA));
  var cropB = opts.cropB == null ? 1 : Math.max(cropA + 0.01, Math.min(1, opts.cropB));
  var puffChaos = opts.chaos == null ? (cheap ? 0.035 : 0.07) : opts.chaos, puffChaosT = opts.chaosT == null ? progress : opts.chaosT, steady = !!opts.steady;
  c.save();
  if (opts.op) c.globalCompositeOperation = opts.op;
  for (var i = 0; i < count; i++) {
    var n1 = fxRand(seed + i * 13.71 + 5), n2 = fxRand(seed + i * 17.91 + 9), n3 = fxRand(seed + i * 29.13 + 15), n4 = fxRand(seed + i * 31.77 + 21), n5 = fxRand(seed + i * 37.43 + 2);
    var pt;
    if (steady) {
      pt = asset.points[Math.floor(fxRand(seed + i * 47.23) * asset.points.length)];
    } else {
      var morphT = puffChaosT * (opts.hot ? 4.6 : 3.4) + n4 * 1.7, morphI = Math.floor(morphT), morphF = morphT - morphI;
      morphF = morphF * morphF * (3 - 2 * morphF);
      var pt0 = asset.points[Math.floor(fxRand(seed + i * 47.23 + morphI * 193.7) * asset.points.length)];
      var pt1 = asset.points[Math.floor(fxRand(seed + i * 47.23 + (morphI + 1) * 193.7) * asset.points.length)];
      pt = { x: pt0.x + (pt1.x - pt0.x) * morphF, y: pt0.y + (pt1.y - pt0.y) * morphF, a: pt0.a + (pt1.a - pt0.a) * morphF };
    }
    var v = pt.y + 0.5;
    if (v < cropA || v > cropB || v < 1 - reveal) continue;
    var localT = steady ? Math.max(0, Math.min(1.2, puffChaosT * (0.62 + n4 * 0.78) - n5 * 0.18)) : Math.max(0, Math.min(1.35, puffChaosT - n4 * 0.36));
    var localU = Math.min(1, localT), localE = localU * localU * (3 - 2 * localU);
    var grow = steady ? (0.86 + localE * (0.19 + n3 * 0.13)) : (0.72 + progress * 0.38);
    var wind = steady ? ((n1 - 0.5) * (opts.warp || 0.035) * 0.16) : fxChaos(seed + i * 41.9 + v * 307, puffChaosT * (1.5 + n1 * 1.2)) * (opts.warp || 0.035);
    var px = x + pt.x * w * grow + wind * w * (0.5 + n1) + (opts.lean || 0) * w * (0.14 - v * 0.08);
    var py = y + (pt.y + 0.02) * h * (0.82 + progress * 0.18) - progress * h * (0.025 + v * 0.04) + (n2 - 0.5) * h * 0.018;
    var flutter = 0;
    if (steady) {
      px += pt.x * w * localE * (0.06 + n2 * 0.055);
      py += (pt.y - 0.02) * h * localE * (0.032 + n1 * 0.032) - h * localE * (0.018 + v * 0.018);
    } else {
      var loose = puffChaos * (0.32 + n3) * (0.35 + localT);
      flutter = fxChaos(seed + i * 53.31 + 2, localT * (1.8 + n1 * 2.6) + n4 * 8);
      px += (flutter * loose + fxChaos(seed + i * 67.13 + 9, localT * (2.9 + n2 * 1.8) + n5 * 5) * puffChaos * 0.38) * w * (cheap ? 0.58 : 1);
      py += (fxChaos(seed + i * 71.79 + 13, localT * (1.4 + n2 * 2.2) + n4 * 6) * loose * 0.55 - localT * puffChaos * (0.15 + v * 0.12)) * h * (cheap ? 0.64 : 1);
    }
    var rr = (opts.hot ? 0.018 : 0.026) * Math.max(w, h) * (0.62 + n3 * 1.25) * (0.75 + pt.a * 0.55);
    rr *= steady ? (1 + localE * (0.16 + n2 * 0.16)) : (1 + localT * puffChaos * (0.75 + n2) + Math.abs(flutter) * puffChaos * 0.35);
    var a = alpha * (0.28 + pt.a * 0.72) * (0.55 + n1 * 0.45);
    if (a <= 0.003) continue;
    var col = opts.hot ? (n2 > 0.45 ? mixHex(core, heat, 0.25) : heat) : (v < 0.45 ? mixHex(smokeCol, heat, 0.14 + n2 * 0.12) : smokeCol);
    if (cheap) {
      c.globalAlpha = Math.min(0.55, a * 0.9);
      c.fillStyle = col;
    } else {
      var g = c.createRadialGradient(px - rr * 0.18, py - rr * 0.2, 1, px, py, rr);
      g.addColorStop(0, rgba(opts.hot ? core : mixHex(col, core, 0.12), Math.min(0.92, a * 1.25)));
      g.addColorStop(0.52, rgba(col, a * 0.58));
      g.addColorStop(1, rgba(smokeCol, 0));
      c.globalAlpha = 1;
      c.fillStyle = g;
    }
    c.beginPath();
    c.ellipse(px, py, rr * (1.15 + n1 * 0.75), rr * (0.55 + n2 * 0.65), (n1 - 0.5) * 1.2 + (opts.rot || 0), 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}
function explosionProfile(ci, cj, effR, pal) {
  var seed = (++blastSeq * 971) + cityTier * 131 + powerLvl * 37 + Math.round((ci + 1) * 53 + (cj + 1) * 89 + effR * 41);
  var n = 0;
  function r(a, b) { n++; return a + (b - a) * fxRand(seed + n * 17.37); }
  var cool = pal.impact === 'cool_ring' || pal.style === 'cool';
  var heatBase = cool ? '#7fd4ff' : (r(0, 1) > 0.58 ? '#ffb02e' : '#ff6a3b');
  var heat = mixHex(hexColor(pal.blast, '#ff8a3b'), heatBase, r(0.18, 0.55));
  return {
    seed: seed,
    heat: heat,
    core: mixHex(hexColor(pal.secondary, '#fff4b8'), '#ffffff', r(0.15, 0.45)),
    smoke: r(0, 1) > 0.55 ? '#332c28' : '#242322',
    fireImg: Math.floor(r(0, 4)) % 4,
    fireSc: r(0.82, 1.32),
    fireRot: r(-0.18, 0.18),
    fireLife: r(0.92, 1.22),
    plumeSc: r(0.88, 1.24),
    lift: r(0.82, 1.22),
    lean: r(-0.22, 0.22),
    stem: r(0.82, 1.22),
    cap: r(0.86, 1.18),
    capSquash: r(0.76, 1.2),
    twist: r(-0.9, 0.9),
    billows: Math.round(r(mobileFx() ? 7 : 18, mobileFx() ? 11 : 30)),
    stemBlobs: Math.round(r(mobileFx() ? 3 : 7, mobileFx() ? 5 : 12)),
    frontLines: Math.round(r(mobileFx() ? 9 : 18, mobileFx() ? 15 : 30)),
    ringRot: r(-0.16, 0.16),
    ringSx: r(0.88, 1.18),
    ringSy: r(0.86, 1.14),
    shockLines: Math.round(r(1, mobileFx() ? 3 : 5)),
    smokeCols: 0,
    secondary: Math.round(r(mobileFx() ? 0 : 1, mobileFx() ? 2 : 4)),
    dustN: Math.round(r(mobileFx() ? 5 : 11, mobileFx() ? 9 : 18)),
    smokeFlecks: Math.round(r(mobileFx() ? 4 : 10, mobileFx() ? 7 : 18)),
    hotFlecks: 0,
    assetFire: Math.floor(r(0, 6)) % 6,
    assetFlash: Math.floor(r(0, 2)) % 2,
    assetSmoke: Math.floor(r(0, 2)) % 2,
    mushroomMask: Math.floor(r(0, 14)) % 14,
    mushroomMask2: Math.floor(r(0, 14)) % 14,
    maskWarp: r(0.022, 0.07),
    maskAlpha: r(0.15, 0.31),
    maskFlip: r(0, 1) > 0.5 ? -1 : 1,
    maskRot: r(-0.08, 0.08),
    maskHot: r(0.08, 0.22)
  };
}
function blastProfileDebug(prof) {
  if (!prof) return null;
  return { seed: prof.seed, heat: prof.heat, smoke: prof.smoke, fireImg: prof.fireImg, fireSc: Math.round(prof.fireSc * 100) / 100, fireLife: Math.round(prof.fireLife * 100) / 100, plumeSc: Math.round(prof.plumeSc * 100) / 100, lift: Math.round(prof.lift * 100) / 100, lean: Math.round(prof.lean * 100) / 100, stem: Math.round(prof.stem * 100) / 100, cap: Math.round(prof.cap * 100) / 100, capSquash: Math.round(prof.capSquash * 100) / 100, twist: Math.round(prof.twist * 100) / 100, billows: prof.billows, stemBlobs: prof.stemBlobs, frontLines: prof.frontLines, ringSx: Math.round(prof.ringSx * 100) / 100, ringSy: Math.round(prof.ringSy * 100) / 100, shockLines: prof.shockLines, smokeCols: prof.smokeCols, secondary: prof.secondary, dustN: prof.dustN, smokeFlecks: prof.smokeFlecks, hotFlecks: prof.hotFlecks, assetFire: prof.assetFire, assetFlash: prof.assetFlash, assetSmoke: prof.assetSmoke, mushroomMask: prof.mushroomMask, mushroomMask2: prof.mushroomMask2, maskWarp: Math.round(prof.maskWarp * 1000) / 1000, maskAlpha: Math.round(prof.maskAlpha * 100) / 100, maskFlip: prof.maskFlip, maskRot: Math.round(prof.maskRot * 100) / 100, maskHot: Math.round(prof.maskHot * 100) / 100 };
}
function fxBurst(x, y, opts, min) {
  opts = Object.assign({}, opts || {});
  opts.count = fxCount(Number(opts.count || 1), min || 1);
  if (mobileFx()) {
    if (opts.life) opts.life *= 0.72;
    if (opts.speed) opts.speed *= 0.9;
    if (opts.gravity) opts.gravity *= 0.92;
  }
  GF.juice.particles.burst(x, y, opts);
}
function pushImpactPulse(x, y, effR, pal, main, prof) {
  impactPulses.push({ x: x, y: y, r: effR, t: 0, life: mobileFx() ? 0.42 : 0.58, color: prof && prof.heat || pal.blast, accent: pal.accent, main: !!main, rot: prof && prof.ringRot || 0, sx: prof && prof.ringSx || 1, sy: prof && prof.ringSy || 1, lines: prof && prof.shockLines || 1 });
  while (impactPulses.length > fxCap(10, 4)) impactPulses.shift();
}
function isWaterCell(i, j) { return !!(WATER && i >= 0 && j >= 0 && i < GRID && j < GRID && WATER[j * GRID + i]); }
var resultPct = 0, resultWin = false, lastPayout = 0, lastCritBonus = 0, pendingDbl = false, _pendingAd = false, lastShipsSunk = 0, lastShipsTotal = 0, lastFarRazed = 0, lastFarTotal = 0;
var helpOpen = false, loadoutOpen = false, devOpen = false, restartConfirm = 0, coachStep = 0, bgT = 0, flashWhite = 0, settleT = 0, fireSpreadT = 0, infoOpen = null, statsOpen = false, settingsOpen = false, welcomeOpen = false, dailyOpen = false, cityView = false, viewZoom = 1;
var TUTORIAL_VERSION = 3, TUT_DONE_STEP = 13;
var tutStep = 0, tutAutoT = 0, tutorialDailyClaimed = false, tutorialGiftOpen = false, tutorialGiftClaimed = false, tutDailyPending = false;   // v3: 0 nuke, 1 Yield, 2 nuke, 3 fail city2, 4 Daily, 5 MIRV, 6 nuke, 7 fail city3, 8 gift, 9 nuke, 10 fail city4, 11 Yield, 12 nuke, 13 done
function tutorialActive() { return tutStep < TUT_DONE_STEP; }
function tutorialFailStrikeStep() { return tutStep === 0 || tutStep === 3 || tutStep === 7 || tutStep === 10; }
function tutorialWinStrikeStep() { return tutStep === 2 || tutStep === 6 || tutStep === 9 || tutStep === 12; }
function tutorialWinIndex() { return tutStep === 2 ? 0 : tutStep === 6 ? 1 : tutStep === 9 ? 2 : tutStep === 12 ? 3 : -1; }
function tutorialFailYieldScale() { return tutStep === 0 ? 0.88 : tutStep === 3 ? 0.92 : tutStep === 7 ? 0.94 : tutStep === 10 ? 0.95 : 1; }
function tutorialSupportCount() { return tutorialWinStrikeStep() ? Math.max(0, Math.min(2, tutorialWinIndex() - 1)) : 0; }
function earlySecondStrikeAssist() { return !tutorialActive() && cityTier <= 4 && failStreak > 0; }
function earlySupportActive() { return earlySecondStrikeAssist(); }
function earlySupportCount() {
  return earlySecondStrikeAssist() ? Math.min(2, 1 + Math.floor(cityTier / 3)) : 0;
}
function earlySupportRadius(baseR) {
  return baseR * 0.42;
}
function supportImpactCount() {
  return tutorialSupportCount() || earlySupportCount();
}
function supportImpactRadius(baseR) {
  return baseR * (tutorialActive() ? 0.38 : 0.42);
}
function earlySupportTarget(index, count, ci, cj) {
  var span = Math.max(1, GRID - 1);
  var pts = [
    [0.30, 0.30], [0.70, 0.70], [0.70, 0.30], [0.30, 0.70],
    [0.50, 0.18], [0.50, 0.82], [0.18, 0.50], [0.82, 0.50]
  ];
  var p = pts[index % pts.length], wob = fxRand(cityTier * 701 + index * 97 + count * 13) - 0.5;
  return {
    ci: GF.clamp(Math.round(p[0] * span + wob * 0.8), 0, GRID - 1),
    cj: GF.clamp(Math.round(p[1] * span - wob * 0.8), 0, GRID - 1)
  };
}

function powerCells() { return (BAL.BASE_CELLS + powerLvl * BAL.CELLS_PER_LVL) * (1 + skinBoost('yield_mult') + setBoost('yield_mult')); }
function wipePct() { return cityTier <= 1 ? 0.88 : cityTier <= 4 ? 0.86 : 0.85 + 0.10 * lateF(); }   // shared Itch curve; Telegram shop boosts can still help clear it
function lateF() { return GF.clamp((cityTier - 9) / 9, 0, 1); }   // shared Itch curve for late district abilities
function aprob(lvl, mx) { var f = GF.clamp(lvl / mx, 0, 1); return 0.04 + 0.96 * Math.pow(f, 2.4 + 3.6 * lateF()); }
function am(lvl, mx) { var f = GF.clamp(lvl / mx, 0, 1); return 0.08 + 0.92 * Math.pow(f, 2.0 + 3.0 * lateF()); }
function upCost() { return Math.round(BAL.UP_COST_BASE * Math.pow(BAL.UP_COST_K, powerLvl) * (CFG.tuning ? CFG.tuning.cost_mult : 1)); }
function progCostMult() { return 1 + Math.pow(Math.max(0, cityTier - 3), 1.5) * 2.5; }   // shared Itch late-game non-yield cost inflation
// ── NUKE LOADOUT (offense tree that counters the city's defenses) ──────────
function atkList() {   // perks only appear when the city actually HAS the thing they counter (so it makes sense, not noise)
  var fort = walls.length > 0, far = false;
  for (var bi = 0; bi < buildings.length; bi++) { var bb = buildings[bi]; if (bb.reinforced) fort = true; if (bb.far) far = true; if (fort && far) break; }
  var list = ['yield'];                                        // YIELD always (the core "bigger nuclear area")
  if (cityTier >= 1) list.push('luck');                        // EXTRA INCOME from level 2 on (internal id kept for save compatibility)
  if (fort) list.push('pen');                                  // PENETRATOR only with walls/bunkers to crack
  if (batteries.length > 0) list.push('flares');               // FLARES only when the city has interceptors to decoy
  // themed perks gate on DISTRICT PRESENCE, so as the city grows they ACCUMULATE (a level-7 map = downtown+station+airport offers emp+orbital+cluster together)
  if (hasStation && batteries.length > 0) list.push('emp');    // EMP: present once the station's comms hubs are on the map (fries them so they can't intercept)
  if (hasStation) list.push('orbital');                        // ORBITAL STRIKE: present once the station district exists (a kinetic rod cracks its reactor core)
  if (hasAirport) list.push('cluster');                        // CLUSTER: present once the airport's flat tarmac exists (bomblets blanket it)
  if (hasGhetto) list.push('firestorm');                       // FIRESTORM: present once the dense ghetto exists (fire spreads block to block)
  if (hasChinatown) list.push('chain');                        // CHAIN: present once Chinatown's packed shophouses exist (they detonate down the row)
  if (hasMall) list.push('glass');                             // GLASS STORM: present once the mall's glass atriums exist (shrapnel ring across the retail sprawl)
  if (hasMountain) list.push('seismic');                       // SEISMIC: present once the mountain base exists (a fault-line shock topples structures in its path)
  if (hasRefinery) list.push('inferno');                       // INFERNO: present once the refinery's fuel tanks exist (they chain-detonate into a fireball)
  if (hasSkyscraper) list.push('topple');                      // TOPPLE: present once skyscrapers exist (tall towers domino-collapse onto neighbours)
  if (hasPowerplant) list.push('meltdown');                    // MELTDOWN: present once the nuclear plant exists (creeping radiation bloom)
  if (hasPort) list.push('tidal');                             // TIDAL: present once the port exists (harbour surge floods inland)
  if (hasPark) list.push('fireworks');                         // FIREWORKS: present once the amusement park exists (aerial shell bursts)
  if ((tutorialActive() && tutStep >= 5) || mirvLvl > 0 || cityTier >= 5 || totalW >= 70 || far || hasWater) list.push('mirv');      // MIRV stays visible once taught/bought; small inland cities must not hide a paid upgrade
  if (hasWater) list.push('shock');                            // SHOCKWAVE only with water + ships
  if (cityTier >= 4 && eyeLvl === 0) list.push('eye');          // OVERSEE EYE: one-time scout unlock; Telegram uses the existing city-view eye control
  return list;
}
var ATK = ['yield', 'flares', 'pen', 'mirv'];
function atkLvl(id) { return id === 'yield' ? powerLvl : id === 'flares' ? flareLvl : id === 'pen' ? penLvl : id === 'mirv' ? mirvLvl : id === 'shock' ? shockLvl : id === 'emp' ? empLvl : id === 'orbital' ? orbitalLvl : id === 'cluster' ? clusterLvl : id === 'firestorm' ? firestormLvl : id === 'chain' ? chainLvl : id === 'glass' ? glassLvl : id === 'seismic' ? seismicLvl : id === 'inferno' ? infernoLvl : id === 'topple' ? toppleLvl : id === 'meltdown' ? meltdownLvl : id === 'tidal' ? tidalLvl : id === 'fireworks' ? fireworksLvl : id === 'eye' ? eyeLvl : luckLvl; }
function atkMax(id) { return id === 'yield' ? 80 : id === 'flares' ? 12 : id === 'pen' ? 18 : id === 'mirv' ? 5 : id === 'shock' ? 10 : id === 'emp' ? 8 : id === 'orbital' ? 8 : id === 'cluster' ? 10 : id === 'firestorm' ? 12 : id === 'chain' ? 10 : id === 'glass' ? 10 : id === 'seismic' ? 9 : id === 'inferno' ? 10 : id === 'topple' ? 12 : id === 'meltdown' ? 12 : id === 'tidal' ? 10 : id === 'fireworks' ? 10 : id === 'eye' ? 1 : 18; }
function atkCost(id) {
  var base = id === 'yield' ? BAL.UP_COST_BASE : id === 'flares' ? 70 : id === 'pen' ? 90 : id === 'mirv' ? 210 : id === 'shock' ? 150 : id === 'emp' ? 120 : id === 'orbital' ? 190 : id === 'cluster' ? 140 : id === 'firestorm' ? 130 : id === 'chain' ? 160 : id === 'glass' ? 130 : id === 'seismic' ? 180 : id === 'inferno' ? 170 : id === 'topple' ? 200 : id === 'meltdown' ? 190 : id === 'tidal' ? 160 : id === 'fireworks' ? 150 : id === 'eye' ? 250 : 100;
  var discount = Math.min(0.35, skinBoost('cost_disc'));
  return Math.max(1, Math.round(base * Math.pow(id === 'mirv' || id === 'orbital' ? 2.25 : BAL.UP_COST_K, atkLvl(id)) * (CFG.tuning ? CFG.tuning.cost_mult : 1) * (id === 'yield' ? 1 : progCostMult()) * (1 - discount)));
}
function maxUpgradeCost() { var mx = 0, l = atkList(); for (var i = 0; i < l.length; i++) if (atkLvl(l[i]) < atkMax(l[i])) mx = Math.max(mx, atkCost(l[i])); return Math.max(40, mx); }   // cost of the priciest currently-available buyable upgrade (drives the daily ration)
function buyAtk(id) { if (atkLvl(id) >= atkMax(id)) return; var c = atkCost(id); if (money < c) { GF.juice.floatText(GF.cx, GF.H * 0.5, 'NEED ' + fmt(c) + ' ' + T('caps'), { color: PB.red, size: 16 }); return; }
  money -= c; if (id === 'yield') powerLvl++; else if (id === 'flares') flareLvl++; else if (id === 'pen') penLvl++; else if (id === 'mirv') mirvLvl++; else if (id === 'shock') shockLvl++; else if (id === 'emp') empLvl++; else if (id === 'orbital') orbitalLvl++; else if (id === 'cluster') clusterLvl++; else if (id === 'firestorm') firestormLvl++; else if (id === 'chain') chainLvl++; else if (id === 'glass') glassLvl++; else if (id === 'seismic') seismicLvl++; else if (id === 'inferno') infernoLvl++; else if (id === 'topple') toppleLvl++; else if (id === 'meltdown') meltdownLvl++; else if (id === 'tidal') tidalLvl++; else if (id === 'fireworks') fireworksLvl++; else if (id === 'eye') eyeLvl++; else luckLvl++;
  if (tutStep === 1 && id === 'yield') { tutStep = 2; tutDone = false; }
  if (tutStep === 11 && id === 'yield') { tutStep = 12; tutDone = false; }
  if (tutStep === 5 && id === 'mirv') { tutStep = 6; tutDone = false; }
  beep('upgrade'); upgDone = true; GF.juice.particles.burst(GF.cx, GF.H * 0.6, { count: 14, colors: ['#54ff96', '#1ec873', '#9bffc0'], speed: 160, life: 0.6 }); saveMeta(); GF.saveRun(); }
function openSupportFeedback() {
  try { if (typeof PLATFORM.openSupport === 'function') PLATFORM.openSupport(); } catch (e) {}
  GF.juice.floatText(GF.cx, GF.H * 0.58, T('support_open'), { color: PB.warn, size: 15, rise: 42 });
}

function TW() { return BAL.TW * GF.S * fit; } function TH() { return BAL.TH * GF.S * fit; } function BH() { return BAL.BH * GF.S * fit; }
function isoX(i, j) { return ORIGIN.x + (i - j) * (TW() / 2); }   // grid-corner -> screen
function isoY(i, j) { return ORIGIN.y + (i + j) * (TH() / 2); }
function screenToCell(sx, sy) { var a = (sx - ORIGIN.x) / (TW() / 2), b = (sy - ORIGIN.y) / (TH() / 2); return { i: (a + b) / 2, j: (b - a) / 2 }; }

// ── AUTHORED LEVELS (designed in the level builder, shared via localStorage) ──
function builtinTierKeys(minTier) {
  var out = [], src = BUILTIN || {};
  for (var k in src) { var n = parseInt(k, 10); if (!isNaN(n) && (!minTier || n >= minTier) && src[k] && src[k].data && src[k].data.length) out.push(n); }
  out.sort(function (a, b) { return a - b; });
  return out;
}
function endlessAuthoredLevel(tier) {
  var keys = builtinTierKeys(0);
  if (!keys.length) return null;
  var max = keys[keys.length - 1];
  if (tier <= max) return null;
  var pool = builtinTierKeys(Math.max(6, max - 4));
  if (!pool.length) return null;
  var srcTier = pool[(tier - max - 1) % pool.length], src = BUILTIN[srcTier];
  return { name: (src.name || 'MEGALOPOLIS') + ' +' + (tier - max), cols: src.cols, rows: src.rows, data: src.data.slice(), theme: src.theme || '' };
}
function loadAuthoredLevel(tier) {
  try { var raw = localStorage.getItem('megaton_levels'); if (raw) { var all = JSON.parse(raw); var L = all && all[tier]; if (L && L.data && L.data.length) return L; } } catch (e) {}   // local edits override
  var BL = BUILTIN && BUILTIN[tier]; if (BL && BL.data && BL.data.length) return BL;   // shipped campaign level
  var EL = endlessAuthoredLevel(tier); if (EL) return EL;   // late progression keeps authored districts/perks instead of falling back to generic green cities
  return null;
}
function buildFromLevel(L, tier) {   // codes: . empty | 1-9 building height | B bunker | W wall | A battery | ~ water | S ship | D big ship | o far-shore | P airport
  cityView = false; viewZoom = 1; infoOpen = null;
  cityTier = tier; cityTheme = L.theme || '';   // a SINGLE-theme level (0-5 style) still tints everything; cumulative maps leave theme '' and colour per-district
  hasStation = false; hasGhetto = false; hasChinatown = false; hasMall = false; hasMountain = false; hasRefinery = false; hasZombie = false; hasSkyscraper = false; hasPowerplant = false; hasPort = false; hasPark = false; hasCathedral = false;   // recomputed below from the building codes actually present (see the per-code branches)
  var rows = L.data, R0 = rows.length, C0 = 0; for (var r = 0; r < R0; r++) C0 = Math.max(C0, rows[r].length);
  GRID = Math.max(C0, R0, 8);
  buildings = []; walls = []; batteries = []; interceptors = []; vehicles = []; ships = []; planes = []; zombies = []; hasAirport = false; chunks = []; craters = []; waves = []; mushrooms = []; smoke = []; dust = []; fires = []; impactPulses = []; fireballs = []; orbitals = []; faults = []; meltZones = []; fireworkBursts = []; warhead = null;
  WATER = new Uint8Array(GRID * GRID); hasWater = false; waterFrom = 999; waterTo = 999;
  totalW = 0; var si = 0, sj = 0, sn = 0;
  for (var j = 0; j < R0; j++) { var row = rows[j]; for (var i = 0; i < row.length; i++) {
    var ch = row[i]; if (ch === '.' || ch === ' ') continue;
    if (ch === '~' || ch === 'S' || ch === 'D') { WATER[j * GRID + i] = 1; hasWater = true; if (j < waterFrom) waterFrom = j; if (j + 1 > (waterTo === 999 ? 0 : waterTo)) waterTo = j + 1;
      if (ch === 'S' || ch === 'D') ships.push({ ci: i, cj: j, big: ch === 'D', bob: ((i * 7 + j * 13) % 6), tilt: 0, ox: 0, oy: 0, vx: 0, vy: 0, sink: 0, state: 'afloat', touched: false }); continue; }
    var b = { i: i, j: j, fw: 1, fd: 1, state: 'intact', collapse: 1, lean: 0, tdx: 0, tdy: 0, touched: false, w: 1, ci: i, cj: j, roof: 0, antenna: false, far: false, tank: false, reinforced: false, lit: ((i * 7 + j * 13) % 10) / 10 };
    // WALL/BATTERY/BUNKER tint to the LOCAL district (so a wall in the station reads metal, a wall downtown reads green). Walls inherit the nearest non-down district via the level theme fallback, else downtown.
    var dW = cityTheme || 'down';   // levels 0-5 (no per-district codes) still respect their single theme; cumulative maps use the per-building district below
    if (ch === 'W') { b.h = 2.6; b.col = darken(dcol(dW, i, j), -0.3); b.wall = true; b.lit = -1; b.dist = dW; buildings.push(b); walls.push(b); continue; }
    if (ch === 'A') { b.h = 1.9; b.col = dpal(dW)[3]; b.battery = true; b.lit = -1; b.dist = dW; buildings.push(b); batteries.push(b); continue; }
    if (ch === 'B') { b.h = 4; b.col = dpal(dW)[1]; b.reinforced = true; b.dist = dW; totalW += 1; buildings.push(b); si += i; sj += j; sn++; continue; }
    if (ch === 'o') { b.h = 1 + ((i + j) % 3); var fp = dfar(dW); b.col = fp[(i * 3 + j) % fp.length]; b.far = true; b.tank = ((i + j) % 2) === 0; b.dist = dW; buildings.push(b); continue; }
    if (ch === 'P') { b.h = 0.6; b.col = '#2e4339'; b.airport = true; b.lit = -1; b.dist = 'airport'; hasAirport = true; buildings.push(b); continue; }   // airport tarmac -> spawns flyover planes
    if (ch === 'M') { b.h = 1.5 + ((i * 5 + j * 3) % 4) * 0.6; b.col = dcol('station', i, j); b.module = true; b.dist = 'station'; hasStation = true; b.lit = ((i * 7 + j * 13) % 10) / 10; totalW += 1; buildings.push(b); si += i; sj += j; sn++; continue; }   // station metallic module
    if (ch === 'Y') { b.h = 0.55; b.col = dpal('station')[2]; b.solar = true; b.dist = 'station'; hasStation = true; b.lit = -1; b.dir = ((i + j) % 2); totalW += 1; buildings.push(b); si += i; sj += j; sn++; continue; }   // solar-panel wing
    if (ch === 'H') { b.h = 1.7; b.col = dpal('station')[3]; b.battery = true; b.hub = true; b.dist = 'station'; hasStation = true; b.lit = -1; buildings.push(b); batteries.push(b); continue; }   // comms hub/dish = station system (interceptor battery)
    if (ch === 'R') { b.h = 4.4; b.col = dpal('station')[1]; b.reactor = true; b.reinforced = true; b.dist = 'station'; hasStation = true; b.lit = ((i * 3 + j) % 8) / 8; totalW += 1; buildings.push(b); si += i; sj += j; sn++; continue; }   // reactor core (tall, hardened)
    if (ch === 'T') { b.h = 4.6; b.col = dpal('airport')[1]; b.tower = true; b.dist = 'airport'; hasAirport = true; b.lit = -1; totalW += 1; buildings.push(b); si += i; sj += j; sn++; continue; }   // control tower (tall, slim, glass cab)
    if (ch === 'G') { b.h = 1.0; b.col = dpal('airport')[0]; b.terminal = true; b.dist = 'airport'; hasAirport = true; b.lit = ((i * 7 + j) % 10) / 10; totalW += 1; buildings.push(b); si += i; sj += j; sn++; continue; }   // terminal / gate concourse (wide, low)
    if (ch === 'K') { b.h = 0.7; b.col = dpal('airport')[4]; b.parked = true; b.dist = 'airport'; hasAirport = true; b.lit = -1; b.dir = ((i + j) % 2) ? 1 : -1; totalW += 1; buildings.push(b); si += i; sj += j; sn++; continue; }   // parked aircraft on the apron
    if (ch === 'E') { b.h = 2 + ((i * 5 + j * 3) % 3); b.col = dcol('ghetto', i, j); b.tenement = true; b.dist = 'ghetto'; hasGhetto = true; b.lit = ((i * 7 + j * 13) % 10) / 10; b.graf = ((i * 3 + j) % 4); totalW += 1; buildings.push(b); si += i; sj += j; sn++; continue; }   // GHETTO tenement: dense block + fire escape + graffiti
    if (ch === 'L') { b.h = 2.4 + ((i + j) % 3) * 0.7; b.col = dcol('chinatown', i, j); b.pagoda = true; b.dist = 'chinatown'; hasChinatown = true; b.lit = ((i * 7 + j) % 10) / 10; totalW += 1; buildings.push(b); si += i; sj += j; sn++; continue; }   // CHINATOWN pagoda: tiered roof + lanterns
    if (ch === 'N') { b.h = 2.2; b.col = dpal('chinatown')[3]; b.gate = true; b.dist = 'chinatown'; hasChinatown = true; b.lit = -1; totalW += 1; buildings.push(b); si += i; sj += j; sn++; continue; }   // CHINATOWN paifang gate / archway
    if (ch === 'V') { b.h = 1.2; b.col = dcol('chinatown', i, j); b.shop = true; b.dist = 'chinatown'; hasChinatown = true; b.lit = ((i + j) % 10) / 10; totalW += 1; buildings.push(b); si += i; sj += j; sn++; continue; }   // CHINATOWN shophouse: vertical sign + lanterns
    // SHOPPING / MALLS
    if (ch === 'C') { b.h = 1.1; b.fw = 1; b.fd = 1; b.col = dcol('mall', i, j); b.bigbox = true; b.dist = 'mall'; hasMall = true; b.lit = ((i * 7 + j) % 10) / 10; totalW += 1; buildings.push(b); si += i; sj += j; sn++; continue; }   // big-box mall (wide, low)
    if (ch === 'J') { b.h = 2.0; b.col = dpal('mall')[2]; b.atrium = true; b.glass = true; b.dist = 'mall'; hasMall = true; b.lit = ((i + j) % 10) / 10; totalW += 1; buildings.push(b); si += i; sj += j; sn++; continue; }   // glass atrium (shatters into the GLASS STORM ring)
    if (ch === 'Q') { b.h = 0.2; b.col = dpal('mall')[3]; b.parking = true; b.noCount = true; b.dist = 'mall'; hasMall = true; b.lit = -1; buildings.push(b); continue; }   // flat parking lot (scenery, not counted)
    // QUARANTINE ZONE (zombies)
    if (ch === 'Z') { b.h = 2.0 + ((i + j) % 2); b.col = dcol('quarantine', i, j); b.infected = true; b.dist = 'quarantine'; hasZombie = true; b.lit = ((i * 5 + j) % 10) / 10; totalW += 1; buildings.push(b); si += i; sj += j; sn++; continue; }   // infected block
    if (ch === 'X') { b.h = 0.8; b.col = dpal('quarantine')[2]; b.tent = true; b.dist = 'quarantine'; hasZombie = true; b.lit = -1; totalW += 1; buildings.push(b); si += i; sj += j; sn++; continue; }   // biohazard tent
    if (ch === 'F') { b.h = 1.3; b.col = darken(dpal('quarantine')[3], -0.2); b.fence = true; b.noCount = true; b.wall = true; b.dist = 'quarantine'; hasZombie = true; b.lit = -1; buildings.push(b); walls.push(b); continue; }   // quarantine fence (blocks like a wall, not counted)
    if (ch === 'U') { b.h = 0.4; b.col = dpal('quarantine')[4]; b.wreck = true; b.noCount = true; b.dist = 'quarantine'; hasZombie = true; b.lit = -1; b.dir = ((i + j) % 2) ? 1 : -1; buildings.push(b); continue; }   // overturned car (scenery)
    // MOUNTAIN MILITARY BASE
    if (ch === 'I') { b.h = 3.5 + ((i * 3 + j) % 3); b.col = dcol('mountain', i, j); b.peak = true; b.reinforced = true; b.dist = 'mountain'; hasMountain = true; b.lit = -1; totalW += 1; buildings.push(b); si += i; sj += j; sn++; continue; }   // rocky peak / hardened ridge
    if (ch === 'm') { b.h = 2.6; b.col = dpal('mountain')[1]; b.silo = true; b.reinforced = true; b.dist = 'mountain'; hasMountain = true; b.lit = ((i + j) % 8) / 8; totalW += 1; buildings.push(b); si += i; sj += j; sn++; continue; }   // missile silo (hardened, high-value)
    if (ch === 'r') { b.h = 2.2; b.col = dpal('mountain')[2]; b.radar = true; b.battery = true; b.dist = 'mountain'; hasMountain = true; b.lit = -1; buildings.push(b); batteries.push(b); continue; }   // radar dome + AA (acts as an interceptor battery)
    // OIL REFINERY / FUEL DEPOT
    if (ch === 'O') { b.h = 1.6; b.col = dcol('refinery', i, j); b.tank = true; b.fueltank = true; b.dist = 'refinery'; hasRefinery = true; b.lit = -1; totalW += 1; buildings.push(b); si += i; sj += j; sn++; continue; }   // fuel storage tank (chain-detonates with INFERNO)
    if (ch === 't') { b.h = 4.0; b.col = dpal('refinery')[1]; b.distill = true; b.dist = 'refinery'; hasRefinery = true; b.lit = ((i * 3 + j) % 8) / 8; totalW += 1; buildings.push(b); si += i; sj += j; sn++; continue; }   // distillation tower (tall, slim)
    if (ch === 'f') { b.h = 3.2; b.col = dpal('refinery')[3]; b.flarestack = true; b.noCount = true; b.dist = 'refinery'; hasRefinery = true; b.lit = -1; buildings.push(b); continue; }   // flare stack (tall thin, burning tip; scenery)
    if (ch === 'p') { b.h = 0.5; b.col = dpal('refinery')[5]; b.pipeline = true; b.noCount = true; b.dist = 'refinery'; hasRefinery = true; b.lit = -1; buildings.push(b); continue; }   // pipeline run (low; scenery)
    // SKYSCRAPERS (financial district)
    if (ch === 's') { b.h = 6.5 + ((i * 5 + j * 3) % 4); b.col = dcol('skyscraper', i, j); b.tower = true; b.glass = true; b.skytower = true; b.dist = 'skyscraper'; hasSkyscraper = true; b.lit = ((i * 7 + j * 13) % 10) / 10; totalW += 1; buildings.push(b); si += i; sj += j; sn++; continue; }   // super-tall glass tower (TOPPLE dominoes these)
    if (ch === 'b') { b.h = 3.0 + ((i + j) % 3); b.col = dpal('skyscraper')[2]; b.office = true; b.glass = true; b.dist = 'skyscraper'; hasSkyscraper = true; b.lit = ((i + j) % 10) / 10; totalW += 1; buildings.push(b); si += i; sj += j; sn++; continue; }   // mid-rise office block
    // NUCLEAR POWER PLANT
    if (ch === 'c') { b.h = 3.4; b.col = dcol('powerplant', i, j); b.cooling = true; b.fw = 1; b.fd = 1; b.dist = 'powerplant'; hasPowerplant = true; b.lit = -1; totalW += 1; buildings.push(b); si += i; sj += j; sn++; continue; }   // cooling tower
    if (ch === 'd') { b.h = 2.0; b.col = dpal('powerplant')[1]; b.dome = true; b.reactor2 = true; b.dist = 'powerplant'; hasPowerplant = true; b.lit = -1; totalW += 1; buildings.push(b); si += i; sj += j; sn++; continue; }   // reactor dome
    // PORT / SHIPYARD
    if (ch === 'g') { b.h = 4.2; b.col = dpal('port')[2]; b.crane = true; b.dist = 'port'; hasPort = true; b.lit = -1; totalW += 1; buildings.push(b); si += i; sj += j; sn++; continue; }   // gantry crane
    if (ch === 'n') { b.h = 1.4; b.col = dcol('port', i, j); b.container = true; b.dist = 'port'; hasPort = true; b.lit = ((i * 3 + j) % 10) / 10; totalW += 1; buildings.push(b); si += i; sj += j; sn++; continue; }   // container stack
    if (ch === 'q') { b.h = 0.3; b.col = dpal('port')[3]; b.quay = true; b.noCount = true; b.dist = 'port'; hasPort = true; b.lit = -1; buildings.push(b); continue; }   // quay/dock edge
    // AMUSEMENT PARK
    if (ch === 'w') { b.h = 3.0; b.col = dpal('park')[2]; b.ferris = true; b.dist = 'park'; hasPark = true; b.lit = -1; totalW += 1; buildings.push(b); si += i; sj += j; sn++; continue; }   // ferris wheel
    if (ch === 'a') { b.h = 1.8; b.col = dcol('park', i, j); b.coaster = true; b.dist = 'park'; hasPark = true; b.lit = -1; totalW += 1; buildings.push(b); si += i; sj += j; sn++; continue; }   // coaster loop
    if (ch === 'e') { b.h = 1.5; b.col = dpal('park')[0]; b.tent = true; b.bigtop = true; b.dist = 'park'; hasPark = true; b.lit = -1; totalW += 1; buildings.push(b); si += i; sj += j; sn++; continue; }   // big-top tent
    // CATHEDRAL / OLD TOWN
    if (ch === 'h') { b.h = 5.5 + ((i + j) % 2); b.col = dcol('cathedral', i, j); b.spire = true; b.dist = 'cathedral'; hasCathedral = true; b.lit = -1; totalW += 1; buildings.push(b); si += i; sj += j; sn++; continue; }   // cathedral spire
    if (ch === 'l') { b.h = 4.0; b.col = dpal('cathedral')[1]; b.clock = true; b.dist = 'cathedral'; hasCathedral = true; b.lit = -1; totalW += 1; buildings.push(b); si += i; sj += j; sn++; continue; }   // clock tower
    if (ch === 'v') { b.h = 1.6 + ((i + j) % 2) * 0.5; b.col = dcol('cathedral', i, j); b.oldhouse = true; b.dist = 'cathedral'; hasCathedral = true; b.lit = ((i * 5 + j) % 10) / 10; totalW += 1; buildings.push(b); si += i; sj += j; sn++; continue; }   // old-town stone townhouse
    var h = (ch >= '1' && ch <= '9') ? parseInt(ch, 10) : 3; b.h = h; b.col = dcol(cityTheme || 'down', i, j); b.dist = cityTheme || 'down'; b.roof = (i + j) % 3; b.antenna = h >= 6 && ((i + j) % 2 === 0); totalW += 1; buildings.push(b); si += i; sj += j; sn++;   // plain digits = downtown (green), unless the whole level is themed
  } }
  if (waterFrom === 999) hasWater = false;
  // per-cell district map for the GROUND tint: stamp each building's footprint, then dilate 1 cell so the deck/tarmac/paving reads under + around each district
  DISTMAP = new Uint8Array(GRID * GRID);
  for (var bi3 = 0; bi3 < buildings.length; bi3++) { var bd3 = buildings[bi3], di3 = DKEYS.indexOf(bd3.dist || 'down'); if (di3 > 0) DISTMAP[bd3.j * GRID + bd3.i] = di3; }
  var DM2 = new Uint8Array(DISTMAP);
  for (var dj = 0; dj < GRID; dj++) for (var di = 0; di < GRID; di++) { if (DISTMAP[dj * GRID + di]) continue; var best = 0;
    for (var nn = 0; nn < 4 && !best; nn++) { var ni = di + [1, -1, 0, 0][nn], nj = dj + [0, 0, 1, -1][nn]; if (ni >= 0 && nj >= 0 && ni < GRID && nj < GRID) best = DISTMAP[nj * GRID + ni]; }
    DM2[dj * GRID + di] = best; }
  DISTMAP = DM2;
  zoneName = hasWater ? (tier >= 4 ? 'OFFSHORE' : 'COASTAL') : 'INLAND'; levelName = L.name || '';
  buildings.sort(function (a, b) { return (a.i + a.j) - (b.i + b.j); });
  normalizeShipsToVisibleWater();
  spawnVehicles(tier);
  totalW = totalW || 1; destroyedW = 0; dropEarned = 0; weakpointHits = 0; lastWeakpointHits = 0; weakpointEffectDepth = 0;
  aim = sn ? { ci: Math.round(si / sn), cj: Math.round(sj / sn) } : { ci: (GRID - 1) / 2, cj: (GRID - 1) / 2 };
  gs = 'AIM';
}

function markBuildingCells() {
  var occ = new Uint8Array(GRID * GRID);
  for (var b = 0; b < buildings.length; b++) {
    var bb = buildings[b], fw = Math.max(1, bb.fw || 1), fd = Math.max(1, bb.fd || 1);
    for (var a = bb.i; a < bb.i + fw; a++) for (var d = bb.j; d < bb.j + fd; d++) if (a >= 0 && d >= 0 && a < GRID && d < GRID) occ[d * GRID + a] = 1;
  }
  return occ;
}
function occAt(occ, i, j) { return i >= 0 && j >= 0 && i < GRID && j < GRID && occ[j * GRID + i]; }
function waterAt(i, j) {
  if (i < 0 || j < 0 || i >= GRID || j >= GRID) return false;
  return !!(WATER && WATER.length ? WATER[j * GRID + i] : (j >= waterFrom && j < waterTo));
}
function clearForegroundGap(occ, i, j, reach) {
  for (var d = 1; d <= reach; d++) {
    if (occAt(occ, i + d, j) || occAt(occ, i, j + d) || occAt(occ, i + d, j + d)) return false;
    if (d > 1 && (occAt(occ, i + d, j + 1) || occAt(occ, i + 1, j + d))) return false;
  }
  return true;
}
function vehicleFrontSlot(i, j, occ) {
  if (occAt(occ, i, j) || waterAt(i, j)) return false;
  var buildingBehind = occAt(occ, i - 1, j) || occAt(occ, i, j - 1) || occAt(occ, i - 1, j - 1);
  return buildingBehind && clearForegroundGap(occ, i, j, 3);
}
function visibleShipSlot(i, j, occ) {
  if (!waterAt(i, j)) return false;
  return clearForegroundGap(occ, i, j, 3);
}
function visibleShipSlots(occ) {
  var slots = [];
  for (var j = 0; j < GRID; j++) for (var i = 0; i < GRID; i++) {
    if (!visibleShipSlot(i, j, occ)) continue;
    var shore = (occAt(occ, i - 1, j) || occAt(occ, i, j - 1) || occAt(occ, i - 1, j - 1) || occAt(occ, i + 1, j - 1)) ? 1 : 0;
    slots.push({ i: i, j: j, shore: shore, rank: (i + j) * 100 + shore * 40 + fxRand(cityTier * 1103 + i * 43 + j * 59) });
  }
  slots.sort(function (a, b) { return b.rank - a.rank; });
  return slots;
}
function normalizeShipsToVisibleWater() {
  if (!hasWater || !ships.length) return;
  var slots = visibleShipSlots(markBuildingCells());
  if (!slots.length) return;
  ships.length = Math.min(ships.length, slots.length);
  for (var s = 0; s < ships.length && s < slots.length; s++) {
    ships[s].ci = slots[s].i;
    ships[s].cj = slots[s].j;
  }
}

function spawnVehicles(tier) {
  vehicles = [];
  if (tier < 2) return;
  var occ = markBuildingCells();
  var slots = [];
  for (var j = 0; j < GRID; j++) for (var i = 0; i < GRID; i++) {
    if (!vehicleFrontSlot(i, j, occ)) continue;
    if (((i + j * 2 + tier) % 3) !== 0 && !(i % 5 === 4 || j % 5 === 4)) continue;
    slots.push({ i: i, j: j, rank: (i + j) * 100 + fxRand(tier * 1013 + i * 37 + j * 71) });
  }
  slots.sort(function (a, b) { return b.rank - a.rank; });
  var n = Math.min(slots.length, 2 + Math.min(4, Math.floor(tier / 2)));
  for (var k = 0; k < n; k++) {
    var s = slots[k], fuel = (k === 0 || fxRand(tier * 199 + k * 53) > 0.72);
    vehicles.push({ ci: s.i + 0.5, cj: s.j + 0.5, dir: (s.i + s.j + k) % 2 ? 1 : -1, type: fuel ? 'fuel' : ((k + tier) % 3 === 0 ? 'bus' : 'car'), state: 'intact', touched: false, seed: tier * 503 + k * 97 + s.i * 13 + s.j * 29 });
  }
  vehicles.sort(function (a, b) { return (a.ci + a.cj) - (b.ci + b.cj); });
}

// ── CITY (rebuilt full every attempt; multi-cell buildings + rooftops) ──────
function newCity(tier) {
  cityView = false; viewZoom = 1; infoOpen = null;
  var _AL = loadAuthoredLevel(tier); if (_AL) { buildFromLevel(_AL, tier); return; }   // use the authored layout for this tier if one exists
  cityTier = tier; GRID = Math.min(12 + tier * 2, 26); levelName = ''; cityTheme = ''; hasStation = false; hasGhetto = false; hasChinatown = false; hasMall = false; hasMountain = false; hasRefinery = false; hasZombie = false; hasSkyscraper = false; hasPowerplant = false; hasPort = false; hasPark = false; hasCathedral = false; DISTMAP = null;   // bigger cities each tier; procedural cities are always the default green downtown (no special districts)
  buildings = []; walls = []; batteries = []; interceptors = []; vehicles = []; ships = []; planes = []; zombies = []; hasAirport = false; chunks = []; craters = []; waves = []; mushrooms = []; smoke = []; dust = []; fires = []; impactPulses = []; fireballs = []; orbitals = []; faults = []; meltZones = []; fireworkBursts = []; warhead = null;
  hasWalls = tier >= 1;
  var bandW = tier >= 1 ? Math.min(2 + tier, 6) : 0, farW = tier >= 1 ? Math.min(2 + ((tier / 2) | 0), 5) : 0;
  waterTo = bandW ? GRID - farW : 999; waterFrom = bandW ? waterTo - bandW : 999;   // mainland | OCEAN band | far shore (more land + other buildings)
  zoneName = tier >= 4 ? 'OFFSHORE' : tier >= 1 ? 'COASTAL' : 'INLAND';
  var occ = new Uint8Array(GRID * GRID), cx = (GRID - 1) / 2, cy = bandW ? (waterFrom - 1) / 2 : (GRID - 1) / 2;   // downtown sits on the mainland, behind the bay
  function street(i, j) { return (i % 5 === 4) || (j % 5 === 4); }
  function isWater(i, j) { return j >= waterFrom && j < waterTo; }
  function isFar(i, j) { return j >= waterTo; }
  WATER = new Uint8Array(GRID * GRID); hasWater = bandW > 0; if (hasWater) for (var wii = 0; wii < GRID; wii++) for (var wjj = waterFrom; wjj < waterTo; wjj++) WATER[wjj * GRID + wii] = 1;
  function fits(i, j, w, d) { if (i + w > GRID || j + d > GRID) return false; for (var a = i; a < i + w; a++) for (var b = j; b < j + d; b++) { if (street(a, b) || occ[b * GRID + a]) return false; } return true; }
  // defensive blast-wall rings around the downtown core (only on bigger cities)
  var r1 = Math.round(GRID * 0.28);
  function gate(i, j) { return Math.abs(i - cx) <= 0.6 || Math.abs(j - cy) <= 0.6; }   // leave openings on the axes
  function wallRing(i, j) { if (tier < 1) return false; var ch = Math.round(Math.max(Math.abs(i - cx), Math.abs(j - cy))); return ch === r1 && !gate(i, j); }   // one defensive ring around downtown
  totalW = 0;
  for (var i = 0; i < GRID; i++) for (var j = 0; j < GRID; j++) {
    if (isWater(i, j) || street(i, j) || occ[j * GRID + i]) continue;
    if (wallRing(i, j)) {   // a tough blast wall that shields what's behind it
      occ[j * GRID + i] = 1;
      var wl = { i: i, j: j, fw: 1, fd: 1, h: 2.6, col: '#0e3a24', wall: true, state: 'intact', collapse: 1, lean: 0, tdx: 0, tdy: 0, lit: -1, touched: false, w: 1, ci: i, cj: j, roof: 0, antenna: false };
      buildings.push(wl); walls.push(wl); continue;
    }
    if (Math.random() < 0.05) continue;
    var fw = 1, fd = 1, rf = Math.random();
    if (rf > 0.80 && fits(i, j, 2, 2)) { fw = 2; fd = 2; }
    else if (rf > 0.64 && fits(i, j, 2, 1)) { fw = 2; fd = 1; }
    else if (rf > 0.48 && fits(i, j, 1, 2)) { fw = 1; fd = 2; }
    for (var a = i; a < i + fw; a++) for (var b = j; b < j + fd; b++) occ[b * GRID + a] = 1;
    var far = isFar(i, j);
    var dc = Math.sqrt((i - cx) * (i - cx) + (j - cy) * (j - cy)) / (GRID * 0.62);
    var tall = far ? (0.1 + Math.random() * 0.45) : Math.max(0, 1 - dc) * (0.55 + Math.random() * 0.7);
    var h = far ? Math.max(1, 1 + Math.round(Math.random() * 2 + (fw * fd > 1 ? 1 : 0))) : Math.max(1, Math.min(1 + Math.round(tall * (4 + tier) + Math.random() * 2 + (fw * fd > 1 ? 1 : 0)), 11 + tier));
    var inCore = !far && Math.round(Math.max(Math.abs(i - cx), Math.abs(j - cy))) < r1;
    var reinforced = !far && tier >= 1 && inCore && Math.random() < (0.55 + tier * 0.06);   // fortified downtown bunkers inside the walls
    var col = far ? FARPAL[(Math.random() * FARPAL.length) | 0] : (reinforced ? '#114e30' : PALETTE[(Math.random() * PALETTE.length) | 0]);
    buildings.push({ i: i, j: j, fw: fw, fd: fd, h: h, col: col, roof: far ? 1 : (Math.random() * 3) | 0, antenna: !far && h >= 6 && Math.random() < 0.6, far: far, tank: far && Math.random() < 0.45,
      reinforced: reinforced, state: 'intact', collapse: 1, lean: 0, tdx: 0, tdy: 0, lit: Math.random(), touched: false, w: fw * fd, ci: i + (fw - 1) / 2, cj: j + (fd - 1) / 2 });
    if (!far) totalW += fw * fd;   // far-shore is a bonus district (CAPS), NOT part of the 90% city wipe; walls also excluded
  }
  // interceptor batteries - the city's active defense; more each tier AND each time you fail to level it (their move)
  var nBat = tier >= 2 ? Math.min(2 + (tier - 2) + Math.floor(failStreak), 8) : 0;
  for (var bt = 0; bt < nBat; bt++) {
    var bang = (bt / nBat) * Math.PI * 2 + 0.4, brr = GRID * (0.34 + (bt % 2) * 0.06);
    var bi = GF.clamp(Math.round(cx + Math.cos(bang) * brr), 0, GRID - 1), bj = GF.clamp(Math.round(cy + Math.sin(bang) * brr), 0, GRID - 1);
    if (occ[bj * GRID + bi] || isWater(bi, bj) || isFar(bi, bj)) continue; occ[bj * GRID + bi] = 1;
    var bat = { i: bi, j: bj, fw: 1, fd: 1, h: 1.9, col: '#15543a', battery: true, state: 'intact', collapse: 1, lean: 0, tdx: 0, tdy: 0, lit: -1, touched: false, w: 1, ci: bi, cj: bj, roof: 0, antenna: false };
    buildings.push(bat); batteries.push(bat);
  }
  // SHIPS on the ocean (coastal zone): destroyable targets that bob, get shoved by the blast, and capsize/sink
  if (waterFrom < GRID) {
    var nShips = Math.min(2 + tier, 9), shipSlots = visibleShipSlots(markBuildingCells());
    for (var sh = 0; sh < nShips && sh < shipSlots.length; sh++) {
      var sl = shipSlots[sh];
      ships.push({ ci: sl.i, cj: sl.j, big: Math.random() < 0.34, bob: Math.random() * 6.28, tilt: 0, ox: 0, oy: 0, vx: 0, vy: 0, sink: 0, state: 'afloat', touched: false });
    }
  }
  buildings.sort(function (a, b) { return (a.i + a.j) - (b.i + b.j); });
  spawnVehicles(tier);
  totalW = totalW || 1; destroyedW = 0; dropEarned = 0; weakpointHits = 0; lastWeakpointHits = 0; weakpointEffectDepth = 0; aim = { ci: cx, cj: cy }; gs = 'AIM';
}

// ── SOUND: moved to audio.js (loaded before this script). Globals available here:
//    beep(kind), nukeSfx(), collapseSfx(big), loadSfx(), startMusic(), _sfxBuf, _collapseClock ──

// ── DROP ONE NUKE ────────────────────────────────────────────────────────────
function drop(sx, sy) {
  if (gs !== 'AIM') return;
  var cell = screenToCell(sx, sy); cell.i = GF.clamp(cell.i, 0, GRID - 1); cell.j = GF.clamp(cell.j, 0, GRID - 1);
  warhead = { ci: cell.i, cj: cell.j, sx: isoX(cell.i, cell.j), sy: isoY(cell.i, cell.j), y: -20 * GF.S, t: 0, phase: 'fall' };
  launchInterceptors(warhead.sx, warhead.sy, cell.i, cell.j);   // the city fires back at your incoming nuke
  gs = 'BLAST'; settleT = 0; lastWeakpointHits = 0; weakpointEffectDepth = 0; beep('drop');
  if (coachStep === 0) { coachStep = 1; saveMeta(); }
  GF.gameStarted();
}
function empActive() { return empLvl > 0 && hasStation; }   // EMP fires once the station's comms-hub systems are present on the map (cumulative or standalone)
function launchInterceptors(gx, gyGround, gci, gcj) {
  if (empActive()) return;   // EMP shorts out every comms hub: nothing launches
  for (var b = 0; b < batteries.length; b++) { var bt = batteries[b]; if (bt.state !== 'intact') continue;
    if (Math.sqrt((bt.ci - gci) * (bt.ci - gci) + (bt.cj - gcj) * (bt.cj - gcj)) <= 2.5) continue;   // point-blank batteries get no shot off
    var bx = isoX(bt.ci + 0.5, bt.cj + 0.5), by = isoY(bt.ci + 0.5, bt.cj + 0.5) - bt.h * BH() * 0.7;
    interceptors.push({ sx0: bx, sy0: by, x: bx, y: by, tx: gx + (Math.random() - 0.5) * 36 * GF.S, ty: gyGround - (120 + Math.random() * 50) * GF.S * fit, t: 0, dur: 0.3 + Math.random() * 0.12, trail: [] });
    GF.juice.particles.burst(bx, by, { count: 5, colors: ['#fff', '#9fe6ff'], speed: 70, gravity: -40, life: 0.35, size: 4 });   // launch flash
  }
  if (interceptors.length) GF.tone(660, 0.06, 'square', 0.06, 1100);   // launch blip
}
var activeNuke = 'std', nukeOwned = { std: true }, nukeAmmo = {};
function nukeDef(id) { for (var i = 0; i < NUKES.length; i++) if (NUKES[i].id === id) return NUKES[i]; return NUKES[0]; }
function nukeUsable(id) { var d = nukeDef(id); return godPower || (d.single ? (nukeAmmo[id] || 0) > 0 : !!nukeOwned[id]); }
function nukeUnlocked(id) { return godPower || nukeUsable(id) || cityTier >= nukeDef(id).tier; }
function nukeCost(id) { var d = nukeDef(id), discount = Math.min(0.35, skinBoost('nuke_cost_disc')); return Math.max(0, Math.round(d.baseCost * (1 + Math.max(0, cityTier - d.tier) * 0.42) * (1 - discount))); }
function nukeList() { var out = []; for (var i = 0; i < NUKES.length; i++) if (nukeUnlocked(NUKES[i].id)) out.push(NUKES[i].id); return out; }
function selectNuke(id) {
  var d = nukeDef(id);
  if (nukeUsable(id)) { activeNuke = d.id; beep('cash'); saveMeta(); return; }
  var cost = nukeCost(d.id);
  if (money >= cost) { money -= cost; if (d.single) nukeAmmo[d.id] = (nukeAmmo[d.id] || 0) + 3; else nukeOwned[d.id] = true; activeNuke = d.id; beep('upgrade'); saveMeta(); GF.saveRun(); }
  else { beep('crumble'); GF.juice.floatText(GF.cx, GF.H * 0.22, 'NEED ' + fmt(cost) + ' ' + T('caps'), { color: PB.red, size: 14 }); }
}
function consumeNuke() { var d = nukeDef(activeNuke); if (!godPower && d.single) { nukeAmmo[activeNuke] = (nukeAmmo[activeNuke] || 0) - 1; if (nukeAmmo[activeNuke] <= 0) activeNuke = 'std'; } }
function grantNuke(id, n) { var d = nukeDef(id); if (d.single) nukeAmmo[d.id] = (nukeAmmo[d.id] || 0) + (n || 1); else nukeOwned[d.id] = true; }
function detonate(ci, cj) {
  var NK = nukeDef(activeNuke);
  var effR = powerCells() * (BAL.YIELD_MIN + Math.random() * (BAL.YIELD_MAX - BAL.YIELD_MIN)) * NK.mult;   // selected warhead scales the blast
  if (tutorialFailStrikeStep()) effR *= tutorialFailYieldScale();   // scripted tutorial misses use a genuinely smaller blast, so the visible damage cannot look like a clear
  var gx = isoX(ci, cj), gy = isoY(ci, cj);
  if (empActive()) {   // EMP pulse: fry every comms hub so it can't intercept; a blue ring + dead-dish sparks (cyan, never orange -> not an explosion)
    for (var eb = 0; eb < batteries.length; eb++) { var ebt = batteries[eb]; if (ebt.state !== 'intact') continue; ebt.fried = 1; var efx = isoX(ebt.ci + 0.5, ebt.cj + 0.5), efy = isoY(ebt.ci + 0.5, ebt.cj + 0.5) - ebt.h * BH(); fxBurst(efx, efy, { count: 9, colors: ['#7fd4ff', '#bfe9ff', '#4aa6e0'], speed: 120, life: 0.5, size: 3 }, 3); }
    waves.push({ ci: ci, cj: cj, r: 0, maxR: powerCells() * 2.2, t: 0, emp: true });
    GF.juice.floatText(gx, gy - 40 * GF.S, 'EMP  SYSTEMS DOWN', { color: '#7fd4ff', size: 16, rise: 58 }); beep('emp');
  }
  // the city's interceptors shrink the blast (batteries not vaporized at point-blank get their shot off -> aim at them to neutralize)
  var nInt = 0; if (!empActive()) for (var bi2 = 0; bi2 < batteries.length; bi2++) { var bt2 = batteries[bi2]; if (bt2.state !== 'intact') continue; if (Math.sqrt((bt2.ci - ci) * (bt2.ci - ci) + (bt2.cj - cj) * (bt2.cj - cj)) > 2.5) nInt++; }
  if (nInt > 0) { var reduce = Math.min(0.42, nInt * 0.07) * Math.max(0.12, 1 - flareLvl * 0.2);   // FLARES decoy the interceptors
    if (reduce > 0.004) { effR *= (1 - reduce); lastIntercept = nInt;
      GF.juice.floatText(gx, gy - 26 * GF.S, (flareLvl > 0 ? 'FLARES  ' : '') + 'INTERCEPTED -' + Math.round(reduce * 100) + '%', { color: '#7fe0ff', size: 15, rise: 52 });
      for (var fi2 = 0; fi2 < nInt; fi2++) fxBurst(gx + (Math.random() - 0.5) * 70 * GF.S, gy - (90 + Math.random() * 90) * GF.S * fit, { count: 7, color: '#ade6ff', speed: 110, life: 0.4 }, 2); } }
  flashWhite = 0.68; GF.juice.shake((14 + powerLvl * 0.7) * (mobileFx() ? 0.62 : 1), 460); nukeSfx(); GF.juice.flash(PB.glow, mobileFx() ? 170 : 260, 0.15);
  for (var dp = 0; dp < planes.length; dp++) if (planes[dp].state === 'fly') { var pn3 = planes[dp]; pn3.state = 'down'; pn3.vy = -40 * GF.S; var pgain = Math.round((35 + cityTier * 18) * payoutBoost('ship_bonus')); dropEarned += pgain; GF.juice.floatText(pn3.x, pn3.y, 'PLANE +' + pgain, { color: PB.hi, size: 13, rise: 44 }); }   // the blast knocks any aircraft out of the sky
  if (orbitalLvl > 0 && hasStation) orbitalStrike(ci, cj, effR);   // ORBITAL STRIKE: a kinetic rod punches straight down the core BEFORE the warhead spreads (cracks the hardened reactor)
  blastAt(ci, cj, effR);
  for (var mv = 0; mv < mirvLvl; mv++) {   // MIRV: extra warheads strike around GZ (smaller, spread - hit walls/spread cities from several points)
    var oa = (mv / Math.max(1, mirvLvl)) * Math.PI * 2 + 0.5, od = (2.6 + mirvLvl * 0.8) * NK.spread;
    blastAt(GF.clamp(Math.round(ci + Math.cos(oa) * od), 0, GRID - 1), GF.clamp(Math.round(cj + Math.sin(oa) * od), 0, GRID - 1), effR * 0.62);
  }
  var supportN = supportImpactCount();
  for (var es = 0; es < supportN; es++) {   // guided/early second-strike assist: visible support impacts, not a fake full-map radius spike
    var st = earlySupportTarget(es, supportN, ci, cj);
    blastAt(st.ci, st.cj, supportImpactRadius(effR));
  }
  if (clusterLvl > 0 && hasAirport) {   // CLUSTER: a spread of small bomblets saturating the wide flat apron (many small craters, not one big one)
    var nb = 3 + clusterLvl * 2, spread = 3.2 + clusterLvl * 1.1;
    for (var cb = 0; cb < nb; cb++) { var ca = (cb / nb) * Math.PI * 2 + cb * 0.7, cd = spread * (0.4 + Math.random() * 0.6);
      blastAt(GF.clamp(Math.round(ci + Math.cos(ca) * cd), 0, GRID - 1), GF.clamp(Math.round(cj + Math.sin(ca) * cd), 0, GRID - 1), effR * 0.46); }   // each bomblet = a small blast
  }
  if (chainLvl > 0 && hasChinatown) chainReaction();   // CHAIN: the tightly-packed shophouses detonate outward neighbour-by-neighbour
  if (glassLvl > 0 && hasMall) glassStorm(ci, cj, effR);   // GLASS STORM: a wide soft shrapnel ring across the flat retail sprawl
  if (seismicLvl > 0 && hasMountain) seismicFault(ci, cj, effR);   // SEISMIC: a fault-line shock ripples out toppling structures in its path
  if (infernoLvl > 0 && hasRefinery) inferno(ci, cj, effR);   // INFERNO: the fuel tanks chain-detonate into a big expanding fireball
  if (toppleLvl > 0 && hasSkyscraper) topple(ci, cj, effR);   // TOPPLE: tall towers domino-collapse onto their neighbours in a direction
  if (meltdownLvl > 0 && hasPowerplant) meltdown(ci, cj, effR);   // MELTDOWN: a radioactive zone that keeps creeping outward after the blast
  if (tidalLvl > 0 && hasPort) tidal(ci, cj, effR);   // TIDAL: a harbour wave surges inland in a widening arc
  if (fireworksLvl > 0 && hasPark) fireworks(ci, cj, effR);   // FIREWORKS: a chain of aerial shells bursts across the park
  // themed ability sound cue (audio.js defines these kinds; tolerant default until then)
  if (empActive()) beep('emp');
  else if (orbitalLvl > 0 && hasStation) beep('orbital');
  else if (clusterLvl > 0 && hasAirport) beep('cluster');
  else if (firestormLvl > 0 && hasGhetto) beep('firestorm');
  else if (chainLvl > 0 && hasChinatown) beep('chain');
  else if (glassLvl > 0 && hasMall) beep('glass');
  else if (seismicLvl > 0 && hasMountain) beep('seismic');
  else if (infernoLvl > 0 && hasRefinery) beep('inferno');
  else if (toppleLvl > 0 && hasSkyscraper) beep('topple');
  else if (meltdownLvl > 0 && hasPowerplant) beep('meltdown');
  else if (tidalLvl > 0 && hasPort) beep('tidal');
  else if (fireworksLvl > 0 && hasPark) beep('fireworks');
}
function glassStorm(ci, cj, effR) {   // shrapnel from the shattering atriums rings outward across the flat retail: a wide soft secondary at a larger radius (low height -> soft, wide)
  var rad = effR * (1.5 + glassLvl * 0.18);
  waves.push({ ci: ci, cj: cj, r: 0, maxR: rad, t: 0, glass: true });   // a cyan shrapnel ring sweeps the lot
  GF.juice.floatText(isoX(ci, cj), isoY(ci, cj) - 36 * GF.S, 'GLASS STORM', { color: THEMES.mall.accent, size: 15, rise: 54 });
  var n = 6 + glassLvl * 2;
  for (var g = 0; g < n; g++) { var ga = (g / n) * Math.PI * 2 + 0.3, gd = rad * (0.7 + Math.random() * 0.3);   // bursts of shrapnel out on the ring
    var sx = isoX(ci + Math.cos(ga) * gd, cj + Math.sin(ga) * gd), sy = isoY(ci + Math.cos(ga) * gd, cj + Math.sin(ga) * gd);
    fxBurst(sx, sy, { count: 7, colors: [THEMES.mall.accent, '#bffaff', '#ffffff'], speed: 150, gravity: 120, life: 0.5, size: 3 }, 2); }
  for (var b = 0; b < buildings.length; b++) { var bd = buildings[b]; if (bd.touched || bd.wall || bd.far) continue;   // the ring topples soft retail out to its edge
    if (Math.sqrt((bd.ci - ci) * (bd.ci - ci) + (bd.cj - cj) * (bd.cj - cj)) <= rad && bd.h <= 2.4 && Math.random() < 0.85) destroyBuilding(bd, ci, cj, true); }
}
function seismicFault(ci, cj, effR) {   // an earthquake along a fault line: a narrow band sweeping across the map, toppling whatever stands in its path (distinct from the radial water SHOCKWAVE)
  var ang = Math.random() * Math.PI, len = (GRID) * (0.6 + seismicLvl * 0.12), dirx = Math.cos(ang), diry = Math.sin(ang);
  faults.push({ ci: ci, cj: cj, ang: ang, len: len, t: 0, w: 1.1 + seismicLvl * 0.18 });   // animated ground crack
  GF.juice.shake(16 + seismicLvl * 3, 700); GF.juice.floatText(isoX(ci, cj), isoY(ci, cj) - 40 * GF.S, 'SEISMIC', { color: '#caa36a', size: 16, rise: 60 });
  var half = (1.1 + seismicLvl * 0.18);
  for (var b = 0; b < buildings.length; b++) { var bd = buildings[b]; if (bd.touched || bd.far) continue;   // distance from the fault LINE (point-to-line), within the band + the fault length
    var rx = bd.ci - ci, ry = bd.cj - cj, along = rx * dirx + ry * diry, perp = Math.abs(rx * -diry + ry * dirx);
    if (Math.abs(along) <= len * 0.5 && perp <= half) { if (Math.random() < 0.9) destroyBuilding(bd, bd.ci, bd.cj, true); }   // toppled by the quake
  }
}
function inferno(ci, cj, effR) {   // the fuel tanks cook off: a few LARGE secondary fireballs at the nearest tanks, each a big expanding blast (distinct from FIRESTORM's slow creep + CHAIN's domino)
  var tanks = []; for (var b = 0; b < buildings.length; b++) { var bd = buildings[b]; if (bd.fueltank && bd.state === 'intact') tanks.push(bd); }
  tanks.sort(function (a, b) { return ((a.ci - ci) * (a.ci - ci) + (a.cj - cj) * (a.cj - cj)) - ((b.ci - ci) * (b.ci - ci) + (b.cj - cj) * (b.cj - cj)); });
  var n = Math.min(tanks.length, 2 + infernoLvl);
  GF.juice.floatText(isoX(ci, cj), isoY(ci, cj) - 38 * GF.S, 'INFERNO', { color: '#ff8a3b', size: 16, rise: 58 });
  for (var k = 0; k < n; k++) { var tank = tanks[k], bigR = effR * (0.9 + infernoLvl * 0.12);   // each tank cooks off as a big secondary fireball; staggered by a t-offset so they ripple, not all at once
    if (fireballs.length < fxCap(22, 8)) fireballs.push({ x: isoX(tank.ci + 0.5, tank.cj + 0.5), y: isoY(tank.ci + 0.5, tank.cj + 0.5), t: -k * 0.12, r: bigR, img: (Math.random() * 4) | 0, seed: cityTier * 311 + k * 97 + tank.ci * 13 + tank.cj * 19, assetFire: (k + cityTier) % 6, assetFlash: k % 2, assetSmoke: (k + tank.ci + tank.cj) % 2, flip: Math.random() < 0.5 ? -1 : 1, rot: 0, sc: 1.2 + Math.random() * 0.4, tint: '#ff8a3b', accent: '#ffd166', smoke: '#33251f', fast: mobileFx() });
    blastAt(tank.ci, tank.cj, bigR); }
}
function topple(ci, cj, effR) {   // TOPPLE: tall towers in range fall AWAY from GZ, crushing the cells in their fall path
  GF.juice.floatText(isoX(ci, cj), isoY(ci, cj) - 40 * GF.S, 'TOPPLE', { color: '#9fe0ff', size: 16, rise: 60 });
  var reach = effR * (1.1 + toppleLvl * 0.18), len = 2 + toppleLvl;
  for (var b = 0; b < buildings.length; b++) { var bd = buildings[b]; if (bd.touched || !(bd.skytower || bd.office || bd.h >= 4)) continue;
    var dx = bd.ci - ci, dy = bd.cj - cj, dist = Math.sqrt(dx * dx + dy * dy); if (dist > reach || dist < 0.3) continue;
    var ux = dx / dist, uy = dy / dist;
    if (Math.random() >= aprob(toppleLvl, 6)) continue;
    if (!bd.touched) destroyBuilding(bd, ci, cj, true);
    for (var s = 1; s <= len; s++) { var fi = Math.round(bd.ci + ux * s), fj = Math.round(bd.cj + uy * s);
      for (var q = 0; q < buildings.length; q++) { var tb = buildings[q]; if (tb.touched || tb.far) continue; if (Math.round(tb.ci) === fi && Math.round(tb.cj) === fj) { destroyBuilding(tb, bd.ci, bd.cj, true); break; } } }
    var ex = isoX(bd.ci + ux * len, bd.cj + uy * len), ey = isoY(bd.ci + ux * len, bd.cj + uy * len);
    fxBurst(ex, ey, { count: 8, colors: ['#9aa', '#bcd', '#889'], speed: 90, gravity: 120, life: 0.5, size: 4 }, 3);
  }
  GF.juice.shake(8 + toppleLvl, 400);
}
function meltdown(ci, cj, effR) {   // MELTDOWN: radioactive hot-zone creeps outward after the blast
  meltZones.push({ ci: ci, cj: cj, r: effR * 0.5, maxR: effR * (1.4 + meltdownLvl * 0.3), t: 0, spread: 0, kp: aprob(meltdownLvl, 6), rolled: {} });
  GF.juice.floatText(isoX(ci, cj), isoY(ci, cj) - 40 * GF.S, 'MELTDOWN', { color: THEMES.powerplant.accent, size: 16, rise: 58 });
}
function tidal(ci, cj, effR) {   // TIDAL: harbour wave surges inland as a wide cosmetic ring plus immediate soft damage
  var rad = effR * (1.6 + tidalLvl * 0.22);
  waves.push({ ci: ci, cj: cj, r: 0, maxR: rad, t: 0, tidal: true });
  GF.juice.floatText(isoX(ci, cj), isoY(ci, cj) - 38 * GF.S, 'TIDAL SURGE', { color: '#5fd8ff', size: 16, rise: 56 });
  for (var b = 0; b < buildings.length; b++) { var bd = buildings[b]; if (bd.touched || bd.far || bd.wall) continue;
    if (Math.sqrt((bd.ci - ci) * (bd.ci - ci) + (bd.cj - cj) * (bd.cj - cj)) <= rad && bd.h <= 3.5 && Math.random() < aprob(tidalLvl, 5)) destroyBuilding(bd, ci, cj, true); }
}
function fireworks(ci, cj, effR) {   // FIREWORKS: aerial shells ripple across the park as small secondary blasts
  var nb = 1 + fireworksLvl * 2, spread = 3.0 + fireworksLvl * 1.0;
  GF.juice.floatText(isoX(ci, cj), isoY(ci, cj) - 38 * GF.S, 'FIREWORKS', { color: THEMES.park.accent, size: 16, rise: 56 });
  for (var k = 0; k < nb; k++) { var ba = (k / nb) * Math.PI * 2 + k * 0.6, bd2 = spread * (0.3 + Math.random() * 0.7);
    var bi = GF.clamp(Math.round(ci + Math.cos(ba) * bd2), 0, GRID - 1), bj = GF.clamp(Math.round(cj + Math.sin(ba) * bd2), 0, GRID - 1);
    var bx = isoX(bi + 0.5, bj + 0.5), by = isoY(bi + 0.5, bj + 0.5);
    fireworkBursts.push({ x: bx, y: by - (60 + Math.random() * 40) * GF.S, t: -k * 0.1, col: ['#ff6ad0', '#8fe0ff', '#d8ff4a', '#ff8a3b'][k % 4] });
    blastAt(bi, bj, effR * 0.42 * am(fireworksLvl, 5)); }
}
function chainReaction() {   // each freshly-destroyed shophouse touches off its immediate neighbours, rippling out over chainLvl rings (staggered for a visible cascade)
  var hops = 1 + chainLvl, reach = 1.5;
  for (var h = 0; h < hops; h++) {
    var seeds = []; for (var b = 0; b < buildings.length; b++) { var bd = buildings[b]; if (bd.state === 'falling' || bd.state === 'rubble') seeds.push(bd); }
    var lit = 0;
    for (var q = 0; q < buildings.length; q++) { var tb = buildings[q]; if (tb.touched || tb.wall || tb.far || tb.state !== 'intact') continue;
      for (var s = 0; s < seeds.length; s++) { if (Math.abs(tb.ci - seeds[s].ci) <= reach && Math.abs(tb.cj - seeds[s].cj) <= reach) {
        destroyBuilding(tb, tb.ci, tb.cj, true); if (lit < fxCap(4, 2)) { fxBurst(isoX(tb.ci + 0.5, tb.cj + 0.5), isoY(tb.ci + 0.5, tb.cj + 0.5), { count: 6, colors: ['#fff', '#ffd166', '#ff8a3b'], speed: 120, life: 0.4 }, 2); lit++; } break; } }
    }
    if (lit === 0) break;   // chain fizzles when nothing new catches
  }
}
function orbitalStrike(ci, cj, effR) {   // a hardened-target kill: a concentrated kinetic column at GZ that flattens reinforced cores in a tight radius
  var gx = isoX(ci, cj), gy = isoY(ci, cj), rad = 1.4 + orbitalLvl * 0.55;
  orbitals.push({ x: gx, y: gy, t: 0, r: rad });   // vertical strike beam visual (cyan-white, falls from the top of the screen)
  GF.juice.shake(10 + orbitalLvl * 2, 360); GF.juice.flash('#bfe9ff', 220, 0.3);
  for (var b = 0; b < buildings.length; b++) { var bd = buildings[b]; if (bd.touched || bd.wall || bd.far) continue;
    if (Math.sqrt((bd.ci - ci) * (bd.ci - ci) + (bd.cj - cj) * (bd.cj - cj)) <= rad) { bd.touched = false; destroyBuilding(bd, ci, cj, true); bd.touched = true; }   // guarantee-kill everything (incl. hardened reactor) in the impact column
  }
  fxBurst(gx, gy, { count: 22, colors: ['#bfe9ff', '#7fd4ff', '#ffffff'], speed: 200, gravity: 80, life: 0.7, size: 5 }, 6);
}
function blastAt(ci, cj, effR) {
  var gx = isoX(ci, cj), gy = isoY(ci, cj);
  var pal = collectiblePalette();
  var prof = explosionProfile(ci, cj, effR, pal);
  lastBlastProfile = blastProfileDebug(prof);
  waves.push({ ci: ci, cj: cj, r: 0, maxR: effR, t: 0, color: prof.heat, glow: pal.blast, rot: prof.ringRot, sx: prof.ringSx, sy: prof.ringSy, seed: prof.seed, lines: prof.frontLines, dustColor: prof.smoke });
  pushImpactPulse(gx, gy, effR, pal, mushrooms.length === 0, prof);
  if (mushrooms.length < fxCap(8, 2)) mushrooms.push({ x: gx, y: gy, t: 0, life: fxCap(2.35, 1.45), scale: (0.66 + powerLvl * 0.04) * nukeDef(activeNuke).mult * (0.85 + Math.random() * 0.45) * prof.plumeSc, tint: prof.heat, accent: pal.accent, secondary: prof.core, impact: pal.impact, prof: prof });   // selected warhead + procedural profile changes cloud size/style
  craters.push({ ci: ci, cj: cj, r: effR, reveal: 0 });
  for (var scn = 0; scn < prof.smokeCols && smoke.length < fxCap(22, 6); scn++) { var sa = Math.random() * Math.PI * 2, sr = effR * TW() * (0.04 + Math.random() * 0.2);
    smoke.push({ x: gx + Math.cos(sa) * sr, y: gy + TH() * 0.2 + Math.sin(sa) * sr * 0.28, t: -scn * 0.06, r: effR * (0.72 + Math.random() * 0.5), life: fxCap(4.8 + Math.random() * 1.8, 2.3 + Math.random()), color: prof.smoke, rise: (18 + Math.random() * 20) * GF.S, dx: (Math.random() - 0.5) * (22 + Math.random() * 34) * GF.S, seed: prof.seed + scn * 211.7 + Math.random() * 1000 }); }
  if (fires.length < fxCap(48, 14)) fires.push({ x: gx, y: gy, t: 0, life: fxLife(4), r: effR * 0.45 });
  fxBurst(gx, gy, { count: 12 + Math.round(prof.dustN * 0.35), colors: [prof.core, pal.accent, prof.heat, pal.primary], speed: 250 + prof.fireSc * 50, gravity: 300, life: 0.42 + prof.fireLife * 0.1, size: 2.2 + prof.fireSc * 0.55 }, 5);   // small sparks/debris, not round smoke clouds
  fxBurst(gx, gy - 8 * GF.S, { count: 8, colors: [pal.secondary, pal.accent], speed: 120, gravity: -28, life: 0.45, size: 2.4 }, 3);             // upward flash sparks
  if (fireballs.length < fxCap(28, 9)) fireballs.push({ x: gx, y: gy, t: 0, r: effR, img: prof.fireImg, seed: prof.seed + 501, assetFire: prof.assetFire, assetFlash: prof.assetFlash, assetSmoke: prof.assetSmoke, flip: Math.random() < 0.5 ? -1 : 1, rot: prof.fireRot, sc: prof.fireSc, tint: prof.heat, accent: pal.accent, smoke: prof.smoke, fast: mobileFx(), life: prof.fireLife });   // main blast: seeded style + flip/scale/lifetime
  for (var sb = 0; sb < prof.secondary && fireballs.length < fxCap(34, 10); sb++) { var ba = prof.twist + sb / Math.max(1, prof.secondary) * Math.PI * 2, bd = effR * (0.2 + Math.random() * 0.35);
    fireballs.push({ x: gx + Math.cos(ba) * bd * TW() * 0.35, y: gy + Math.sin(ba) * bd * TH() * 0.25 - (12 + sb * 4) * GF.S, t: -0.06 * sb, r: effR * (0.28 + Math.random() * 0.22), img: (prof.fireImg + sb + 1) % 4, seed: prof.seed + 701 + sb * 53, assetFire: (prof.assetFire + sb + 1) % 6, assetFlash: (prof.assetFlash + sb) % 2, assetSmoke: (prof.assetSmoke + sb) % 2, flip: sb % 2 ? -1 : 1, rot: ba * 0.35, sc: 0.78 + Math.random() * 0.45, tint: prof.heat, accent: pal.accent, smoke: prof.smoke, fast: mobileFx(), life: prof.fireLife * 0.82 }); }
  var dustN = fxCap(prof.dustN, Math.max(5, Math.round(prof.dustN * 0.5)));
  for (var dd = 0; dd < dustN && dust.length < fxCap(210, 72); dd++) { var da = Math.random() * Math.PI * 2, wob = 0.35 + Math.random() * 1.1; dust.push({ x: gx + Math.cos(da) * 14 * GF.S * wob, y: gy + TH() / 2 + Math.sin(da) * 7 * GF.S * wob, t: 0, r0: (9 + Math.random() * 8) * GF.S, life: fxLife(0.85 + Math.random() * 0.55), color: Math.random() > 0.55 ? '#8c8578' : '#5a5048', dx: (Math.cos(da) * 0.55 + (Math.random() - 0.5) * 0.9) * (18 + Math.random() * 42) * GF.S, rise: (12 + Math.random() * 24) * GF.S }); }   // irregular outward dust ring
  for (var zk = 0; zk < zombies.length; zk++) { var zz = zombies[zk]; if (zz.state !== 'walk') continue;   // any shambler caught in the blast is vaporized for bonus caps
    if (Math.sqrt((zz.ci - ci) * (zz.ci - ci) + (zz.cj - cj) * (zz.cj - cj)) <= effR) { zz.state = 'dead'; zz.fall = 0; var zg = Math.round((zz.big ? 22 : 12) * (1 + cityTier * 0.18) * payoutBoost()); dropEarned += zg;
      GF.juice.floatText(isoX(zz.ci, zz.cj), isoY(zz.ci, zz.cj) - 12 * GF.S, '+' + zg, { color: THEMES.quarantine.accent, size: 12, rise: 40 }); fxBurst(isoX(zz.ci, zz.cj), isoY(zz.ci, zz.cj), { count: 6, colors: [THEMES.quarantine.accent, '#9aff6a', '#6a8a3a'], speed: 90, life: 0.4 }, 2); } }
}
function weakpointSparse(b, mod) { return (((b.i || 0) * 17 + (b.j || 0) * 31 + cityTier * 7) % mod) === 0; }
function weakpointInfo(b) {
  if (!b || b.wall || b.far || b.airport || b.noCount) return null;
  if (b.reactor) return { label: 'CORE BREACH', color: THEMES.station.accent, bonus: 7, blast: 2.8 + orbitalLvl * 0.24 };
  if (b.hub || b.radar || b.battery) return { label: 'AA SYSTEM DOWN', color: '#7fd4ff', bonus: 4.5, aa: true };
  if (b.tower || b.terminal || (b.parked && weakpointSparse(b, 3))) return { label: 'AIRFIELD HIT', color: THEMES.airport.accent, bonus: 4.2, air: true };
  if (b.atrium) return { label: 'GLASS CASCADE', color: THEMES.mall.accent, bonus: 4.5, glass: true };
  if (b.silo || (b.peak && weakpointSparse(b, 4))) return { label: 'SILO BREACH', color: THEMES.mountain.accent, bonus: 5.5, blast: 2.4 + seismicLvl * 0.22 };
  if (b.distill || (b.fueltank && weakpointSparse(b, 4))) return { label: 'FUEL CHAIN', color: THEMES.refinery.accent, bonus: 5.5, blast: 2.6 + infernoLvl * 0.24 };
  if (b.gate || (b.pagoda && weakpointSparse(b, 4))) return { label: 'MARKET CHAIN', color: THEMES.chinatown.accent, bonus: 3.8, chain: true };
  if (b.infected && weakpointSparse(b, 6)) return { label: 'HOT ZONE', color: THEMES.quarantine.accent, bonus: 3.6, blast: 1.8 };
  return null;
}
function weakpointScore(info, b) {
  return (info.label === 'CORE BREACH' ? 100 : info.label === 'FUEL CHAIN' ? 92 : info.label === 'SILO BREACH' ? 86 : info.label === 'AA SYSTEM DOWN' ? 80 : info.label === 'AIRFIELD HIT' ? 74 : info.label === 'GLASS CASCADE' ? 68 : info.label === 'MARKET CHAIN' ? 62 : 54) + (b.h || 0);
}
function weakpointUiBlocked(x, y) {
  var pad = 8 * GF.S, lists = [R.nuke || [], R.info || []];
  function hitRect(r) { return r && x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad; }
  function hitCircle(r) { return r && Math.abs(x - r.x) <= (r.r || 0) * 2 + pad && Math.abs(y - r.y) <= (r.r || 0) * 2 + pad; }
  if (hitRect(R.detonate) || hitRect(R.stats) || hitRect(R.daily) || hitRect(R.missions) || hitRect(R.view) || hitRect(R.mute) || hitRect(R.devbtn)) return true;
  for (var li = 0; li < lists.length; li++) for (var ri = 0; ri < lists[li].length; ri++) if (hitRect(lists[li][ri]) || hitCircle(lists[li][ri])) return true;
  return false;
}
function weakpointTargets(limit) {
  var out = [], max = limit || 999, cand = [], minGap = mobileFx() ? 30 : 24, byLabel = {};
  for (var i = 0; i < buildings.length; i++) { var b = buildings[i], info = weakpointInfo(b); if (!info || b.state !== 'intact' || b.weakTriggered) continue;
    var x = Math.round(isoX(b.ci + 0.5, b.cj + 0.5)), y = Math.round(isoY(b.ci + 0.5, b.cj + 0.5) - b.h * BH() * 0.85);
    if (weakpointUiBlocked(x, y)) continue;
    cand.push({ label: info.label, ci: b.ci, cj: b.cj, x: x, y: y, dist: b.dist || 'down', color: info.color, score: weakpointScore(info, b) }); }
  cand.sort(function (a, b) { return b.score - a.score; });
  for (var c = 0; c < cand.length && out.length < max; c++) {
    var m = cand[c], cap = m.label === 'FUEL CHAIN' ? 4 : (m.label === 'HOT ZONE' ? 2 : 3);
    if ((byLabel[m.label] || 0) >= cap) continue;
    var close = false; for (var oi = 0; oi < out.length; oi++) if (Math.hypot(out[oi].x - m.x, out[oi].y - m.y) < minGap) { close = true; break; }
    if (close) continue;
    byLabel[m.label] = (byLabel[m.label] || 0) + 1; delete m.score; out.push(m);
  }
  if (!out.length && cand.length) { delete cand[0].score; out.push(cand[0]); }
  return out;
}
function countWeakpoints() { return weakpointTargets(999).length; }
function triggerWeakpoint(b, gi, gj) {
  var info = weakpointInfo(b);
  if (!info || b.weakTriggered || weakpointEffectDepth > 0) return;
  if (lastWeakpointHits >= 24) return;
  b.weakTriggered = true; weakpointHits++; lastWeakpointHits++;
  var x = isoX(b.ci + 0.5, b.cj + 0.5), y = isoY(b.ci + 0.5, b.cj + 0.5) - b.h * BH() * 0.65;
  var bonus = Math.round((16 + cityTier * 8 + b.h * 8) * (info.bonus || 3) * 0.22 * payoutBoost());
  dropEarned += bonus;
  if (lastWeakpointHits <= 8) GF.juice.floatText(x, y - 16 * GF.S, (lastWeakpointHits <= 4 ? info.label + ' +' : '+') + fmt(bonus), { color: info.color, size: lastWeakpointHits <= 4 ? 13 : 10, rise: 48 });
  fxBurst(x, y, { count: 12, colors: [info.color, '#ffffff', '#ffd24a'], speed: 135, gravity: 90, life: 0.58, size: 4 }, 4);
  weakpointEffectDepth++;
  try {
    if (info.blast) blastAt(b.ci, b.cj, Math.min(6.2, Math.max(1.6, info.blast)));
    if (info.aa) {
      interceptors = [];
      for (var ab = 0, knocked = 0; ab < batteries.length; ab++) { var bt = batteries[ab]; if (!bt || bt.state !== 'intact') continue;
        if (Math.sqrt((bt.ci - b.ci) * (bt.ci - b.ci) + (bt.cj - b.cj) * (bt.cj - b.cj)) <= 3.7) { bt.fried = 1; if (bt !== b && knocked < 2) { bt.touched = false; destroyBuilding(bt, b.ci, b.cj, true); bt.touched = true; knocked++; } } }
      waves.push({ ci: b.ci, cj: b.cj, r: 0, maxR: 2.2 + empLvl * 0.18, t: 0, emp: true });
    }
    if (info.air) {
      planeT = Math.max(planeT, 8 + clusterLvl);
      for (var ap = 0; ap < planes.length; ap++) if (planes[ap].state === 'fly') { planes[ap].state = 'down'; planes[ap].vy = -36 * GF.S; }
    }
    if (info.glass) glassStorm(b.ci, b.cj, Math.max(1.8, 2.0 + glassLvl * 0.18));
    if (info.chain) chainReaction();
  } finally {
    weakpointEffectDepth--;
  }
}
function hitVehicle(v, gi, gj) {
  if (v.touched || v.state !== 'intact') return;
  v.touched = true; v.state = 'wreck';
  var x = isoX(v.ci, v.cj), y = isoY(v.ci, v.cj) + TH() * 0.18;
  var gain = Math.round((v.type === 'fuel' ? 26 : v.type === 'bus' ? 17 : 11) * (1 + cityTier * 0.18) * payoutBoost());
  dropEarned += gain;
  GF.juice.floatText(x, y - 10 * GF.S, '+' + gain, { color: v.type === 'fuel' ? '#ffb04a' : PB.hi, size: 11, rise: 36 });
  fxBurst(x, y, { count: v.type === 'fuel' ? 10 : 5, colors: v.type === 'fuel' ? ['#fff4c0', '#ff8a3b', '#d74424'] : ['#d8c59a', '#6b6150', '#363026'], speed: v.type === 'fuel' ? 120 : 70, gravity: 180, life: 0.42, size: v.type === 'fuel' ? 4 : 2.5 }, 2);
  if (v.type === 'fuel' && fireballs.length < fxCap(34, 10)) fireballs.push({ x: x, y: y - 8 * GF.S, t: 0, r: 1.1, img: 0, seed: v.seed + 901, assetFire: v.seed % 6, assetFlash: 0, assetSmoke: 0, flip: v.dir || 1, rot: 0, sc: 0.68, tint: '#ff8a3b', accent: '#ffd166', smoke: '#342820', fast: mobileFx(), life: 0.55 });
}
function hitBuilding(b, gi, gj, effR) {
  if (b.touched) return;
  var dist = Math.sqrt((b.ci - gi) * (b.ci - gi) + (b.cj - gj) * (b.cj - gj));
  if (b.wall) { b.touched = true; if (dist < effR * (0.5 + penLvl * 0.035)) destroyBuilding(b, gi, gj, true); return; }   // PENETRATOR cracks walls wider
  b.touched = true;
  var thresh = b.reinforced ? effR * (0.68 + penLvl * 0.025) : effR;          // fortified bunkers; penetrator widens the kill range
  if (dist > thresh) { damageBuilding(b, gi, gj); return; }
  var inner = effR * BAL.FALLOFF_INNER;
  var p = dist <= inner ? 1 : GF.clamp(1 - (dist - inner) / (effR - inner) * 0.85, 0.12, 1);   // ragged falloff = chance to destroy more/less
  if (b.reinforced) { p *= Math.min(1, 0.7 + penLvl * 0.06); b.shielded = 0.3; }   // PENETRATOR overcomes hardening
  if (Math.random() < p) destroyBuilding(b, gi, gj, true);
  else damageBuilding(b, gi, gj);   // survived -> partial damage
}
function shadowedByWall(b, gi, gj, distB) {   // is a standing wall between this building and ground zero?
  var angB = Math.atan2(b.cj - gj, b.ci - gi);
  for (var w = 0; w < walls.length; w++) { var W = walls[w]; if (W.state !== 'intact') continue;
    var dW = Math.sqrt((W.ci - gi) * (W.ci - gi) + (W.cj - gj) * (W.cj - gj)); if (dW >= distB - 0.4) continue;   // wall must be closer to GZ
    var da = Math.abs(angB - Math.atan2(W.cj - gj, W.ci - gi)); if (da > Math.PI) da = 2 * Math.PI - da;
    if (da < 0.28) return true;
  }
  return false;
}
function destroyBuilding(b, gi, gj, full) {
  b.state = 'falling'; b.collapse = 1;
  var bx = isoX(b.ci + 0.5, b.cj + 0.5), by = isoY(b.ci + 0.5, b.cj + 0.5);
  var ang = Math.atan2(by - isoY(gi, gj), bx - isoX(gi, gj)); b.tdx = Math.cos(ang); b.tdy = Math.sin(ang) * 0.5;
  var gain = Math.round(BAL.B_VALUE * b.w * (1 + b.h * 0.28) * (1 + cityTier * 0.4) * (CFG.tuning ? CFG.tuning.payout_mult : 1) * payoutBoost());
  if (b.wall) gain = Math.round(gain * 0.4);
  if (!b.counted) { b.counted = true; dropEarned += gain; if (!b.wall && !b.far && !b.battery && !b.airport && !b.noCount) destroyedW += b.w; }   // count caps + wipe% ONCE per building (overlapping MIRV/CLUSTER/guarantee-kill blasts re-call this); wipe% excludes the types totalW skips (wall/far/battery/tarmac + noCount scenery: parking/fence/wreck/flare-stack/pipeline) so it can never exceed 100%
  triggerWeakpoint(b, gi, gj);
  // fly into chunk-blocks
  var chunkCap = fxCap(BAL.CHUNK_CAP, 135);
  var chunkSoftCap = fxCap(240, 84);
  var nc = chunks.length < chunkSoftCap ? Math.min(mobileFx() ? (b.h > 3 ? 2 : 1) : 3 + b.h, mobileFx() ? 2 : 9 + b.w * 2) : (chunks.length < chunkCap ? 1 : 0);
  for (var k = 0; k < nc; k++) {
    var a = ang + (Math.random() - 0.5) * 1.8, sp = (80 + Math.random() * 190) * GF.S;
    chunks.push({ x: bx + (Math.random() - 0.5) * TW() * b.fw, y: by - Math.random() * b.h * BH(), vx: Math.cos(a) * sp, vy: -(110 + Math.random() * 210) * GF.S, g: (520 + Math.random() * 220) * GF.S, s: (5 + Math.random() * 6) * GF.S, col: b.col, life: 1.1 + Math.random() * 0.8, rot: Math.random() });
  }
  if (Math.random() < (mobileFx() ? 0.22 : 0.5) && dust.length < fxCap(230, 78)) dust.push({ x: bx, y: by - b.h * BH() * 0.3, t: 0, r0: (7 + b.h * 2) * GF.S, life: fxLife(0.85 + Math.random() * 0.4) });   // lighter dust so the toppling shows
  if (Math.random() < (mobileFx() ? 0.12 : 0.35) && fires.length < fxCap(60, 16)) { b.burning = true; fires.push({ x: bx, y: by, t: 0, life: fxLife(3 + Math.random() * 3), r: (10 + b.h * 2) * GF.S }); }
  if (fireballs.length < fxCap(44, 10) && Math.random() < (mobileFx() ? 0.08 : 0.34)) fireballs.push({ x: bx, y: by - b.h * BH() * 0.35, t: -Math.random() * 0.14, r: 0.5 + b.h * 0.12, img: (Math.random() * 4) | 0, seed: cityTier * 419 + b.i * 37 + b.j * 61 + b.h * 17, assetFire: (b.i + b.j + cityTier) % 6, assetFlash: (b.i + b.j) % 2, assetSmoke: (b.i * 3 + b.j) % 2, flip: Math.random() < 0.5 ? -1 : 1, rot: (Math.random() - 0.5) * 1.3, sc: 0.75 + Math.random() * 0.6, tint: '#ff7a35', accent: '#ffd166', smoke: '#342820', fast: mobileFx() });   // secondary blasts cascade out, each a different procedural style
  collapseSfx(b.fw * b.fd > 1);
}
function damageBuilding(b, gi, gj) {
  b.state = 'damaged'; b.h = Math.max(1, Math.round(b.h * (0.35 + Math.random() * 0.35)));
  b.col = darken(b.col, -0.4); b.lit = -1;
  var bx = isoX(b.ci + 0.5, b.cj + 0.5), by = isoY(b.ci + 0.5, b.cj + 0.5);
  dust.push({ x: bx, y: by - b.h * BH() * 0.3, t: 0, r0: (10 + b.h * 3) * GF.S, life: 1.0 });
  for (var k = 0; k < fxCap(2, 1) && chunks.length < fxCap(BAL.CHUNK_CAP, 135); k++) { var a = Math.random() * Math.PI * 2, sp = 70 * GF.S; chunks.push({ x: bx, y: by - b.h * BH() * 0.5, vx: Math.cos(a) * sp, vy: -120 * GF.S, g: 520 * GF.S, s: 4 * GF.S, col: b.col, life: fxLife(1.0), rot: Math.random() }); }
}
function showResult() {
  lastShipsTotal = ships.length; lastShipsSunk = 0; for (var sk = 0; sk < ships.length; sk++) if (ships[sk].state !== 'afloat') lastShipsSunk++;
  lastFarTotal = 0; lastFarRazed = 0; for (var fb = 0; fb < buildings.length; fb++) { var b2 = buildings[fb]; if (!b2.far) continue; lastFarTotal++; if (b2.state !== 'intact') lastFarRazed++; }
  resultPct = destroyedW / totalW; resultWin = resultPct >= wipePct();
  if (tutorialFailStrikeStep()) resultWin = false;   // tutorial first attempts never "win" -> next step gives a useful reward/upgrade
  if (earlySecondStrikeAssist() && resultPct >= wipePct() * 0.9) resultWin = true;   // non-tutorial early retries get a small mercy only when the visible strike got close
  lfFinish(resultWin);
  var farClear = (lastFarTotal > 0 && lastFarRazed >= lastFarTotal) ? Math.round((40 + cityTier * 22) * payoutBoost()) : 0;
  var banked = Math.round(dropEarned * (resultWin ? 1 : 0.5)) + farClear;   // FAILED launches bank HALF the caps so farming partial hits isn't efficient
  lastCritBonus = (cityTier >= 1 && banked > 0 && Math.random() < criticalPayoutChance()) ? Math.max(1, Math.round(banked * criticalPayoutMult())) : 0;
  money += banked + lastCritBonus; totalEarned += banked + lastCritBonus; dropEarned = banked + lastCritBonus;             // dropEarned now = caps actually kept (drives the "Earned +X" line)
  if (lastCritBonus > 0) { beep('cash'); GF.juice.floatText(GF.cx, GF.H * 0.36, T('crit') + ' +' + fmt(lastCritBonus), { color: PB.warn, size: 18, rise: 56 }); }
  if (!starterGiven) { starterGiven = true; money += 30; beep('cash'); }   // first-throw starter bonus -> enough for one upgrade; no post-result float animation
  if (resultWin) { lastPayout = Math.round((45 + cityTier * 55) * (1 + powerLvl * 0.022) * payoutBoost()); money += lastPayout; pendingDbl = true; _pendingAd = (cityTier >= 2); beep('win'); GF.happytime(); failStreak = 0; cityReinforced = false; citiesRazed++; }
  else { lastPayout = 0; pendingDbl = false; failStreak++; cityReinforced = cityTier >= 2; }   // their move: the city deploys another interceptor next attempt
  if (totalEarned > best) best = totalEarned;
  if (tutStep === 0) { tutStep = 1; tutAutoT = 0; failStreak = 0; GF.gameEnded(); saveMeta(); GF.saveRun(); launchAgain(); return; }   // city 1 fail -> Yield upgrade
  if (tutStep === 3) { tutStep = 4; tutDailyPending = true; failStreak = 0; GF.gameEnded(); saveMeta(); GF.saveRun(); launchAgain(); return; }   // city 2 fail -> Daily ration
  if (tutStep === 7) { tutStep = 8; tutorialGiftOpen = true; failStreak = 0; GF.gameEnded(); saveMeta(); GF.saveRun(); launchAgain(); return; }   // city 3 fail -> free gift
  if (tutStep === 10) { tutStep = 11; failStreak = 0; GF.gameEnded(); saveMeta(); GF.saveRun(); launchAgain(); return; }   // city 4 fail -> another real Yield upgrade
  if (resultWin && tutStep === 2) tutStep = 3;                                      // city 1 win -> Next City, then fail once and teach Daily
  if (resultWin && tutStep === 6) tutStep = 7;                                      // city 2 win -> Next City, then fail once and teach Gift
  if (resultWin && tutStep === 9) tutStep = 10;                                     // gift-assisted city 3 win -> one more guided city
  if (resultWin && tutStep === 12) { tutStep = TUT_DONE_STEP; tutDone = true; upgDone = true; tutDailyPending = false; tutorialGiftOpen = false; }   // fourth second-strike city -> full game
  stopPostLevelMotion(); gs = 'RESULT'; GF.gameEnded(); saveMeta(); GF.saveRun();
}
function launchAgain() { newCity(cityTier); lfStart(); }
function nextCity() { if (_pendingAd) { _pendingAd = false; if (!godPower) GF.ads.interstitial(); } failStreak = 0; cityReinforced = false; var prevZone = zoneName; newCity(cityTier + 1); lfStart(); zoom = (zoneName !== prevZone) ? 1.7 : 1.16; maxTier = Math.max(maxTier, cityTier); saveMeta(); GF.saveRun(); }   // big pull-back on a ZONE change, small nudge on a normal tier-up
function upgradePower() { buyAtk('yield'); }

function saveMeta(stampSeen) {
  if (stampSeen !== false) lastSeen = Date.now();
  tutDone = tutStep >= TUT_DONE_STEP;
  saveStore.write({
    money: money,
    totalEarned: totalEarned,
    best: best,
    cityTier: cityTier,
    powerLvl: powerLvl,
    flareLvl: flareLvl,
    penLvl: penLvl,
    mirvLvl: mirvLvl,
    shockLvl: shockLvl,
    luckLvl: luckLvl,
    empLvl: empLvl,
    orbitalLvl: orbitalLvl,
    clusterLvl: clusterLvl,
    firestormLvl: firestormLvl,
    chainLvl: chainLvl,
    glassLvl: glassLvl,
    seismicLvl: seismicLvl,
    infernoLvl: infernoLvl,
    toppleLvl: toppleLvl,
    meltdownLvl: meltdownLvl,
    tidalLvl: tidalLvl,
    fireworksLvl: fireworksLvl,
    eyeLvl: eyeLvl,
    citiesRazed: citiesRazed,
    maxTier: maxTier,
    tutDone: tutDone,
    starterGiven: starterGiven,
    upgDone: upgDone,
    godPower: godPower,
    lastSeen: lastSeen,
    dailyStreak: dailyStreak,
    lastClaimDay: lastClaimDay,
    activeNuke: activeNuke,
    nukeOwned: Object.keys(nukeOwned),
    nukeAmmo: nukeAmmo,
    tutorialV: TUTORIAL_VERSION,
    tutStep: tutStep,
    tutorialDailyClaimed: tutorialDailyClaimed,
    tutorialGiftClaimed: tutorialGiftClaimed,
    ownedSkins: ownedSkins.slice(),
    skinCopies: Object.assign({}, skinCopies),
    equippedSkin: equippedSkin && equippedSkin.id || '',
    skinBoosts: skinBoosts,
    setBoosts: setBoosts,
    lastOfferDay: lastOfferDay,
    gachaStats: gachaStats
  });
}

function loadMeta() {
  var m = saveStore.read();
  if (!m) return;
  try {
    money = m.money || 0;
    totalEarned = m.totalEarned || 0;
    best = m.best || 0;
    cityTier = m.cityTier || 0;
    powerLvl = m.powerLvl || 0;
    flareLvl = m.flareLvl || 0;
    penLvl = m.penLvl || 0;
    mirvLvl = m.mirvLvl || 0;
    shockLvl = m.shockLvl || 0;
    empLvl = m.empLvl || 0;
    orbitalLvl = m.orbitalLvl || 0;
    clusterLvl = m.clusterLvl || 0;
    firestormLvl = m.firestormLvl || 0;
    chainLvl = m.chainLvl || 0;
    glassLvl = m.glassLvl || 0;
    seismicLvl = m.seismicLvl || 0;
    infernoLvl = m.infernoLvl || 0;
    toppleLvl = m.toppleLvl || 0;
    meltdownLvl = m.meltdownLvl || 0;
    tidalLvl = m.tidalLvl || 0;
    fireworksLvl = m.fireworksLvl || 0;
    eyeLvl = m.eyeLvl || 0;
    maxTier = m.maxTier || cityTier || 0;
    luckLvl = m.luckLvl || 0;
    citiesRazed = m.citiesRazed || 0;
    tutDone = !!m.tutDone;
    starterGiven = !!m.starterGiven;
    upgDone = !!m.upgDone;
    godPower = !!m.godPower;
    lastSeen = m.lastSeen || 0;
    dailyStreak = m.dailyStreak || 0;
    lastClaimDay = m.lastClaimDay == null ? -1 : m.lastClaimDay;
    activeNuke = m.activeNuke || 'std';
    nukeOwned = { std: true };
    if (m.nukeOwned && m.nukeOwned.length) {
      for (var i = 0; i < m.nukeOwned.length; i++) nukeOwned[m.nukeOwned[i]] = true;
    }
    nukeAmmo = m.nukeAmmo || {};
    if (!nukeUsable(activeNuke)) activeNuke = 'std';
    ownedSkins = Array.isArray(m.ownedSkins) ? m.ownedSkins.slice() : [];
    skinCopies = m.skinCopies && typeof m.skinCopies === 'object' ? Object.assign({}, m.skinCopies) : {};
    ownedSkins.forEach(function (id) { if (!skinCopies[id]) skinCopies[id] = 1; });
    equippedSkin = m.equippedSkin && typeof m.equippedSkin === 'object'
      ? m.equippedSkin
      : (m.equippedSkin ? { id: m.equippedSkin, name: m.equippedSkin, boost: null } : null);
    skinBoosts = m.skinBoosts && typeof m.skinBoosts === 'object' ? m.skinBoosts : {};
    setBoosts = m.setBoosts && typeof m.setBoosts === 'object' ? m.setBoosts : {};
    lastOfferDay = isFinite(Number(m.lastOfferDay)) ? Number(m.lastOfferDay) : -1;
    gachaStats = m.gachaStats && typeof m.gachaStats === 'object' ? m.gachaStats : {};
    tutorialDailyClaimed = !!m.tutorialDailyClaimed;
    tutorialGiftClaimed = !!m.tutorialGiftClaimed;
    tutStep = migrateTutorialStep(m, {
      currentVersion: TUTORIAL_VERSION,
      doneStep: TUT_DONE_STEP,
      clamp: GF.clamp
    });
    tutDailyPending = tutStep === 4;
    tutorialGiftOpen = tutStep === 8 && !tutorialGiftClaimed;
  } catch (error) {}
}
// ── Reactor (offline caps) + Daily Ration (login streak) ──────────────────────
var REACTOR_CAP_MS = 8 * 3600000;
function reactorRate() { return Math.round((10 + maxTier * 16 + powerLvl * 2) * (1 + skinBoost('offline_mult'))); }   // caps/hour, scales with progress
function dayNum() { var n = new Date(); return Math.floor((n.getTime() - n.getTimezoneOffset() * 60000) / 86400000); }   // local-day index
function dur(ms) { var m = Math.floor(ms / 60000), h = Math.floor(m / 60); m %= 60; return h > 0 ? h + 'h ' + m + 'm' : m + 'm'; }
function nextStreak() { return lastClaimDay === dayNum() - 1 ? dailyStreak + 1 : 1; }   // continue if claimed yesterday, else reset
function dailyReward(s) { return Math.round(maxUpgradeCost() * 1.5 * (0.5 + 0.5 * Math.min(s - 1, 6) / 6) * (1 + skinBoost('daily_mult'))); }   // scales with the priciest upgrade: day 1 ~0.75x rising to day 7 = 1.5x
function tutorialDailyClaimable() { return tutStep === 4 && !tutorialDailyClaimed; }
function dailyClaimable() { return lastClaimDay !== dayNum() || tutorialDailyClaimable(); }
function checkReturn() {   // boot: surface offline reactor caps + a waiting daily ration
  var now = Date.now(), allow = !window._silent && !window.__gfSimMode && !tutorialActive();   // never pop a reward panel mid-tutorial (the gate would swallow its buttons)
  var openedWelcome = false;
  if (allow && lastSeen > 0) { var dt = Math.min(now - lastSeen, REACTOR_CAP_MS); if (dt > 120000) { var caps = Math.floor(dt / 3600000 * reactorRate()); if (caps >= 1) { welcomeCaps = caps; welcomeMs = dt; welcomeOpen = true; openedWelcome = true; } } }
  if (allow && !welcomeOpen && dailyClaimable()) dailyOpen = true;
  lastSeen = now;
  if (!openedWelcome) saveMeta(false);
}
function pushPlatformState() { saveStore.mirrorStored(); }
function collectWelcome(mult) { welcomeBuying = false; var add = welcomeCaps * mult; money += add; totalEarned += add; if (totalEarned > best) best = totalEarned; GF.juice.floatText(GF.cx, GF.H * 0.4, '+' + fmt(add), { color: PB.warn, size: 24, rise: 70 }); beep('cash'); welcomeOpen = false; welcomeCaps = 0; if (dailyClaimable() && (lastClaimDay >= 0 || !tutorialActive())) dailyOpen = true; saveMeta(); GF.saveRun(); pushPlatformState(); }
function claimDaily(mult) { if (!dailyClaimable()) return; var tutorialClaim = tutorialDailyClaimable(), s = nextStreak(); dailyStreak = s; lastClaimDay = dayNum(); tutorialDailyClaimed = tutorialDailyClaimed || tutorialClaim; var add = dailyReward(s) * mult; if (tutorialClaim) add = Math.max(add, Math.max(0, atkCost('mirv') - money) + 18); money += add; totalEarned += add; if (totalEarned > best) best = totalEarned; GF.juice.floatText(GF.cx, GF.H * 0.4, '+' + fmt(add), { color: PB.warn, size: 24, rise: 70 }); beep('cash'); GF.happytime(); if (tutStep === 4) { tutStep = 5; tutDailyPending = false; } saveMeta(); GF.saveRun(); }   // tutorial daily funds the MIRV lesson even if today's normal ration was already used
function resetGame() { money = 0; totalEarned = 0; best = best; cityTier = 0; powerLvl = 0; flareLvl = 0; penLvl = 0; mirvLvl = 0; shockLvl = 0; luckLvl = 0; empLvl = 0; orbitalLvl = 0; clusterLvl = 0; firestormLvl = 0; chainLvl = 0; glassLvl = 0; seismicLvl = 0; infernoLvl = 0; toppleLvl = 0; meltdownLvl = 0; tidalLvl = 0; fireworksLvl = 0; eyeLvl = 0; cityView = false; activeNuke = 'std'; nukeOwned = { std: true }; nukeAmmo = {}; failStreak = 0; cityReinforced = false; if (godPower) applyGodPower(false); newCity(0); lfStart(); saveMeta(); GF.saveRun(); }
function applyGodPower(addBank) {
  godPower = true;
  if (addBank !== false) {
    var bank = 250000 + Math.ceil(maxUpgradeCost() * 10);
    money += bank;
    totalEarned += bank;
    if (totalEarned > best) best = totalEarned;
  }
  powerLvl = Math.max(powerLvl, atkMax('yield'));
  flareLvl = Math.max(flareLvl, atkMax('flares'));
  penLvl = Math.max(penLvl, atkMax('pen'));
  mirvLvl = Math.max(mirvLvl, atkMax('mirv'));
  shockLvl = Math.max(shockLvl, atkMax('shock'));
  luckLvl = Math.max(luckLvl, atkMax('luck'));
  empLvl = Math.max(empLvl, atkMax('emp'));
  orbitalLvl = Math.max(orbitalLvl, atkMax('orbital'));
  clusterLvl = Math.max(clusterLvl, atkMax('cluster'));
  firestormLvl = Math.max(firestormLvl, atkMax('firestorm'));
  chainLvl = Math.max(chainLvl, atkMax('chain'));
  glassLvl = Math.max(glassLvl, atkMax('glass'));
  seismicLvl = Math.max(seismicLvl, atkMax('seismic'));
  infernoLvl = Math.max(infernoLvl, atkMax('inferno'));
  toppleLvl = Math.max(toppleLvl, atkMax('topple'));
  meltdownLvl = Math.max(meltdownLvl, atkMax('meltdown'));
  tidalLvl = Math.max(tidalLvl, atkMax('tidal'));
  fireworksLvl = Math.max(fireworksLvl, atkMax('fireworks'));
  eyeLvl = Math.max(eyeLvl, atkMax('eye'));
  nukeOwned = { std: true, wide: true, tsar: true };
  nukeAmmo.wide = Math.max(nukeAmmo.wide || 0, 999);
  nukeAmmo.tsar = Math.max(nukeAmmo.tsar || 0, 999);
  activeNuke = 'tsar';
  tutDone = true; upgDone = true; tutStep = TUT_DONE_STEP; tutDailyPending = false; tutorialGiftOpen = false;
}
function applySkinState(skin, state) {
  state = state || {};
  ownedSkins = Array.isArray(state.ownedSkins) ? state.ownedSkins.slice() : (skin && skin.id ? [skin.id] : []);
  skinCopies = state.skinCopies && typeof state.skinCopies === 'object' ? Object.assign({}, state.skinCopies) : {};
  ownedSkins.forEach(function (id) { if (!skinCopies[id]) skinCopies[id] = 1; });
  equippedSkin = skin && skin.id ? {
    id: String(skin.id),
    assetId: cleanAssetId(skin.assetId || skin.id),
    name: String(skin.name || skin.id),
    rarity: String(skin.rarity || ''),
    family: String(skin.family || ''),
    silhouette: String(skin.silhouette || ''),
    color: hexColor(skin.color, PB.hi),
    accent: hexColor(skin.accent, PB.warn),
    secondary: hexColor(skin.secondary, '#ffffff'),
    style: String(skin.style || ''),
    visual: skin.visual && typeof skin.visual === 'object' ? {
      body: String(skin.visual.body || skin.silhouette || 'needle'),
      primary: hexColor(skin.visual.primary || skin.color, PB.hi),
      accent: hexColor(skin.visual.accent || skin.accent, PB.warn),
      secondary: hexColor(skin.visual.secondary || skin.secondary, '#ffffff'),
      blast: hexColor(skin.visual.blast || skin.visual.mushroomTint, '#ff8a3b'),
      trail: String(skin.visual.trail || ''),
      impact: String(skin.visual.impact || 'hot_bloom'),
      mushroomTint: hexColor(skin.visual.mushroomTint || skin.visual.blast, '#ff8a3b'),
      cameo: String(skin.visual.cameo || ''),
      style: String(skin.visual.style || skin.style || '')
    } : null,
    boost: skin.boost && typeof skin.boost === 'object' ? {
      kind: String(skin.boost.kind || ''),
      label: String(skin.boost.label || ''),
      value: Number(skin.boost.value || 0)
    } : null
  } : null;
  if (equippedSkin && equippedSkin.assetId) collectibleIcon(equippedSkin.assetId);
  if (equippedSkin && ownedSkins.indexOf(equippedSkin.id) < 0) ownedSkins.push(equippedSkin.id);
  if (equippedSkin && !skinCopies[equippedSkin.id]) skinCopies[equippedSkin.id] = 1;
  skinBoosts = state.skinBoosts && typeof state.skinBoosts === 'object' ? Object.assign({}, state.skinBoosts) : {};
  if (equippedSkin && equippedSkin.boost && equippedSkin.boost.kind && !skinBoosts[equippedSkin.boost.kind]) skinBoosts[equippedSkin.boost.kind] = equippedSkin.boost.value;
  if (state.setBoosts && typeof state.setBoosts === 'object') setBoosts = Object.assign({}, state.setBoosts);
  if (state.capsDealAvailable != null) capsDealAvailable = !!state.capsDealAvailable;
  gachaStats = state.gachaStats && typeof state.gachaStats === 'object' ? Object.assign({}, state.gachaStats) : gachaStats;
}

var TUTORIAL_GIFT_SKIN_ID = 'rare_sky_needle';
function parentCatalogSkin(id) {
  try { var skin = typeof PLATFORM.skinById === 'function' ? PLATFORM.skinById(id) : null; if (skin && skin.id) return skin; } catch (e) {}
  return null;
}
function rehydrateEquippedSkin() {
  if (!equippedSkin || !equippedSkin.id || (equippedSkin.visual && equippedSkin.boost)) return false;
  var skin = parentCatalogSkin(equippedSkin.id);
  if (!skin) return false;
  applySkinState(skin, { ownedSkins: ownedSkins, skinCopies: skinCopies, skinBoosts: skinBoosts, gachaStats: gachaStats });
  return true;
}
function tutorialGiftSkin() {
  return parentCatalogSkin(TUTORIAL_GIFT_SKIN_ID) || {
    id: TUTORIAL_GIFT_SKIN_ID,
    assetId: 'rare_sky_needle',
    name: 'Sky Needle',
    rarity: 'rare',
    family: 'bombshell',
    silhouette: 'needle',
    color: '#5fd8ff',
    accent: '#ff7a4f',
    secondary: '#eef7ff',
    visual: { body: 'needle', primary: '#5fd8ff', accent: '#ff7a4f', secondary: '#eef7ff', blast: '#7fd4ff', trail: 'cyan_sparks', impact: 'cool_ring', mushroomTint: '#7fd4ff', style: 'cool' },
    boost: { kind: 'yield_mult', label: 'Blast yield', value: 0.014 }
  };
}
function claimTutorialGift() {
  if (tutStep !== 8 || tutorialGiftClaimed) return;
  var skin = tutorialGiftSkin(), ids = ownedSkins.slice(), copies = Object.assign({}, skinCopies), boosts = {};
  if (ids.indexOf(skin.id) < 0) ids.push(skin.id);
  copies[skin.id] = Math.max(1, Number(copies[skin.id] || 0));
  if (skin.boost && skin.boost.kind) boosts[skin.boost.kind] = Math.max(Number(boosts[skin.boost.kind] || 0), Number(skin.boost.value || 0));
  applySkinState(skin, { ownedSkins: ids, skinCopies: copies, skinBoosts: boosts, gachaStats: gachaStats });
  if (mirvLvl < 2) mirvLvl = 2;
  tutorialGiftClaimed = true; tutorialGiftOpen = false; tutStep = 9;
  beep('upgrade');
  GF.juice.particles.burst(GF.cx, GF.H * 0.48, { count: 18, colors: ['#ffb02e', '#fff4b8', '#ff8a3b'], speed: 150, life: 0.65, size: 4 });
  var giftPct = Math.round((skin.boost && Number(skin.boost.value || 0) || 0) * 1000) / 10;
  GF.juice.floatText(GF.cx, GF.H * 0.42, '+' + giftPct + '% ' + T('u_yield') + '  ' + T('u_mirv') + ' +1', { color: '#ffd24a', size: 20, rise: 62 });
  saveMeta(); GF.saveRun();
  openShopPanel('collection', true);
}

// ── LAYOUT + INPUT ──────────────────────────────────────────────────────────
var R = {}, _press = null, statsScroll = 0, statsScrollMax = 0, statsDrag = null;   // _press: tap-vs-hold tracking for the aim reticle
function mobileView() { return GF.W <= 520 && GF.H > GF.W * 1.08; }
function mobileUiBoost() { return mobileView() ? 1.14 : 1; }
function clampStatsScroll() { statsScroll = GF.clamp(Number(statsScroll || 0), 0, Math.max(0, Number(statsScrollMax || 0))); return statsScroll; }
function scrollStats(delta) { statsScroll = GF.clamp(Number(statsScroll || 0) + Number(delta || 0), 0, Math.max(0, Number(statsScrollMax || 0))); }
function setCityViewZoom(deltaY) {
  var factor = Math.exp(-Number(deltaY || 0) * 0.0012);
  viewZoom = GF.clamp(viewZoom * factor, 0.72, 2.6);
  zoom = GF.lerp(zoom, viewZoom, 0.45);
}
function layout() {
  var S = GF.S, W = GF.W, H = GF.H, US = S * mobileUiBoost(), hudH = GF.clamp(52 * US, 46, 72);
  if (eyeLvl <= 0) { cityView = false; viewZoom = 1; }
  var fieldTop = hudH, fieldBot = H - GF.clamp(66 * US, 54, 96), availW = W - 10 * S, availH = (fieldBot - fieldTop) - 10 * S;
  var ai = aim && isFinite(aim.ci) ? aim.ci : (GRID - 1) / 2, aj = aim && isFinite(aim.cj) ? aim.cj : (GRID - 1) / 2;
  R.actionCx = W / 2; R.actionCy = fieldTop + (fieldBot - fieldTop) * (mobileView() ? 0.49 : 0.52);
  var rawTW = BAL.TW * S, rawTH = BAL.TH * S, dAim = ai - aj, sAim = ai + aj;
  var xFitL = (R.actionCx - 5 * S) / Math.max(1, (GRID + dAim) * rawTW / 2);
  var xFitR = (W - R.actionCx - 5 * S) / Math.max(1, (GRID - dAim) * rawTW / 2);
  var yFitT = (R.actionCy - fieldTop - 22 * S) / Math.max(1, (sAim + 1) * rawTH / 2);
  var yFitB = (fieldBot - R.actionCy - 5 * S) / Math.max(1, (2 * GRID - sAim - 1) * rawTH / 2);
  // scale the whole iso city so a bigger grid still fits the screen (bigger city = denser, more buildings)
  baseFit = Math.min(availW / (GRID * BAL.TW * S), availH / (GRID * BAL.TH * S), xFitL, xFitR, yFitT, yFitB, mobileView() ? 1.36 : 1.28); if (!(baseFit > 0)) baseFit = 1;
  var targetZoom = cityView ? viewZoom : 1;
  zoom = GF.lerp(zoom, targetZoom, cityView ? 0.16 : 0.05); if (!cityView && Math.abs(zoom - 1) < 0.004) zoom = 1;   // animated camera pull-back after a zone change
  fit = baseFit * zoom;
  ORIGIN.x = R.actionCx - (ai - aj) * (TW() / 2);
  ORIGIN.y = R.actionCy - TH() / 2 - (ai + aj) * (TH() / 2);
  var gridW = GRID * TW(), gridH = GRID * TH(), padX = 5 * S;
  ORIGIN.x = gridW + padX * 2 <= W ? GF.clamp(ORIGIN.x, gridW / 2 + padX, W - gridW / 2 - padX) : W / 2;
  var minY = fieldTop + GF.clamp(42 * S, 34, 64), maxY = fieldBot - gridH - 4 * S;
  ORIGIN.y = maxY >= minY ? GF.clamp(ORIGIN.y, minY, maxY) : fieldTop + (fieldBot - fieldTop - gridH) / 2;
  R.field = { x: 0, y: hudH, w: W, h: fieldBot - hudH };
  var bs = GF.clamp(34 * US, 34, 50), rgap = GF.clamp(8 * US, 7, 12), railY = hudH + 7 * S;
  R.daily = { x: W - bs - 8 * S, y: railY, w: bs, h: bs };
  R.missions = { x: W - bs - 8 * S, y: railY + bs + rgap, w: bs, h: bs };
  R.view = eyeLvl > 0 ? { x: W - bs - 8 * S, y: railY + (bs + rgap) * 2, w: bs, h: bs } : null;
  R.stats = { x: W - bs - 8 * S, y: railY + (bs + rgap) * 3, w: bs, h: bs };
  R.mute = { x: W - bs - 8 * S, y: railY + (bs + rgap) * 4, w: bs, h: bs };
  R.help = R.reset = null;
  R.tune = { x: W / 2 - GF.clamp(140 * S, 100, 180) / 2, y: H - GF.clamp(50 * S, 42, 62) - 8 * S, w: GF.clamp(140 * S, 100, 180), h: GF.clamp(50 * S, 42, 62) };   // AIM: open nuke loadout
  R.devbtn = ALLOW_TEST_HOOKS ? { x: 8 * S, y: H - bs - 8 * S, w: bs, h: bs } : { x: -9999, y: -9999, w: 0, h: 0 };   // localhost-only dev menu
}
function inRect(b, x, y) { return b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h; }
function onNukeChip(x, y) { for (var i = 0; i < (R.nuke || []).length; i++) if (inRect(R.nuke[i], x, y)) return true; return false; }
function toGame(e) { var r = GF.canvas.getBoundingClientRect(); var px = e.clientX != null ? e.clientX : 0, py = e.clientY != null ? e.clientY : 0; return { x: (px - r.left) * (GF.canvas.width / r.width), y: (py - r.top) * (GF.canvas.height / r.height) }; }
function openMissionsPanel() {
  try { if (typeof PLATFORM.openMissions === 'function') PLATFORM.openMissions(); } catch (e) {}
}
function offerChipOn() { return !!(resultWin && tutDone && cityTier >= 1 && capsDealAvailable && lastOfferDay !== dayNum()); }
function openShopPanel(tab, tutorialClose, source) {
  try { if (typeof PLATFORM.openShop === 'function') PLATFORM.openShop(tab || 'boxes', { tutorialClose: !!tutorialClose, source: source || '' }); } catch (e) {}
}
function onPress(x, y) {
  if (settingsOpen) {
    if (inRect(R.settingsSound, x, y)) { GF.toggleMute(); startMusic(); return; }
    if (inRect(R.settingsEn, x, y)) { setLanguage('en', true); return; }
    if (inRect(R.settingsRu, x, y)) { setLanguage('ru', true); return; }
    if (inRect(R.settingsSupport, x, y)) { openSupportFeedback(); return; }
    if (inRect(R.settingsClose, x, y)) { settingsOpen = false; return; }
    settingsOpen = false; return;
  }
  if (tutorialActive() && gs !== 'RESULT' && !window._silent) {   // GUIDED TUTORIAL: only the highlighted control responds; Result buttons still work
    if (tutorialGiftOpen) { if (R.tutGiftClaim && inRect(R.tutGiftClaim, x, y)) claimTutorialGift(); return; }
    if (dailyOpen && tutStep === 4) {
      if (R.dailyDbl && inRect(R.dailyDbl, x, y)) { if (godPower) { claimDaily(2); dailyOpen = false; } else GF.ads.rewarded({ onReward: function () { claimDaily(2); dailyOpen = false; }, onClose: function () { if (dailyClaimable()) claimDaily(1); dailyOpen = false; } }); }
      else if (R.dailyClaim && inRect(R.dailyClaim, x, y)) { claimDaily(1); dailyOpen = false; }
      else if (R.dailyClose && inRect(R.dailyClose, x, y)) dailyOpen = false;
      return;
    }
    var tt = tutTarget();
    if (!tt || !inRect(tt, x, y)) return;
    if (tt.id === 'atom') { dropCenter(); return; }
    if (tt.id === 'yield') { money = Math.max(money, atkCost('yield')); buyAtk('yield'); saveMeta(); return; }
    if (tt.id === 'daily') { dailyOpen = true; return; }
    if (tt.id === 'mirv') { money = Math.max(money, atkCost('mirv')); buyAtk('mirv'); saveMeta(); return; }
    if (tt.id === 'gift') { claimTutorialGift(); return; }
    return;
  }
  if (devOpen && !ALLOW_TEST_HOOKS) { devOpen = false; return; }
  if (devOpen) { if (inRect(R.devClose, x, y)) { devOpen = false; return; } if (inRect(R.cheat, x, y)) { money += 100000; beep('cash'); GF.juice.floatText(GF.cx, GF.cy, '+100k', { color: PB.warn, size: 22 }); saveMeta(); GF.saveRun(); return; }
    for (var d = 0; d < (R.dev || []).length; d++) if (inRect(R.dev[d], x, y)) { var jt = R.dev[d].tier; devOpen = false; failStreak = 0; cityReinforced = false; powerLvl = Math.max(powerLvl, 6 + jt * 3); newCity(jt); saveMeta(); GF.saveRun(); return; } return; }
  if (welcomeOpen) {   // reactor welcome-back (modal): COLLECT or COLLECT x2 via rewarded ad
    if (R.welcomeDbl && inRect(R.welcomeDbl, x, y)) { if (godPower) collectWelcome(2); else GF.ads.rewarded({ onReward: function () { collectWelcome(2); }, onClose: function () { if (welcomeOpen) collectWelcome(1); } }); }
    else if (R.welcomeCollect && inRect(R.welcomeCollect, x, y)) collectWelcome(1);
    return;
  }
  if (dailyOpen) {   // daily ration (modal): CLAIM or CLAIM x2 via rewarded ad
    if (R.dailyDbl && inRect(R.dailyDbl, x, y)) { if (godPower) { claimDaily(2); dailyOpen = false; } else GF.ads.rewarded({ onReward: function () { claimDaily(2); dailyOpen = false; }, onClose: function () { if (dailyClaimable()) claimDaily(1); dailyOpen = false; } }); }
    else if (R.dailyClaim && inRect(R.dailyClaim, x, y)) { claimDaily(1); dailyOpen = false; }
    else dailyOpen = false;
    return;
  }
  if (helpOpen) { helpOpen = false; return; }
  if (statsOpen) { if (inRect(R.statsClose, x, y)) statsOpen = false; return; }
  if (ALLOW_TEST_HOOKS && inRect(R.devbtn, x, y)) { devOpen = true; return; }
  if (inRect(R.stats, x, y)) { statsOpen = true; statsScroll = 0; return; }
  if (inRect(R.daily, x, y)) { dailyOpen = true; return; }
  if (inRect(R.missions, x, y)) { openMissionsPanel(); return; }
  if (inRect(R.view, x, y)) { cityView = !cityView; viewZoom = cityView ? GF.clamp(zoom || 1, 0.72, 2.6) : 1; infoOpen = null; return; }
  if (inRect(R.mute, x, y)) { settingsOpen = true; return; }
  if (gs === 'RESULT') {
    if (resultWin) { if (pendingDbl && inRect(R.dbl, x, y)) { pendingDbl = false; if (godPower) { money += lastPayout; saveMeta(); GF.saveRun(); } else GF.ads.rewarded({ onReward: function () { money += lastPayout; saveMeta(); GF.saveRun(); }, onClose: function () {} }); return; } if (R.offerChip && inRect(R.offerChip, x, y)) { lastOfferDay = dayNum(); saveMeta(); openShopPanel('boxes', false, 'result_offer'); return; } if (inRect(R.next, x, y)) nextCity(); }
    else { if (inRect(R.again, x, y)) launchAgain(); }
    return;
  }
  if (gs === 'AIM') {
    for (var ifb = 0; ifb < (R.info || []).length; ifb++) { var ib = R.info[ifb]; if (Math.abs(x - ib.x) <= ib.r * 1.9 && Math.abs(y - ib.y) <= ib.r * 1.9) { infoOpen = (infoOpen === ib.id) ? null : ib.id; return; } }   // "i" badge toggles the tooltip
    if (infoOpen) { infoOpen = null; return; }   // tap anywhere else dismisses it
    for (var ni = 0; ni < (R.nuke || []).length; ni++) if (inRect(R.nuke[ni], x, y)) { selectNuke(R.nuke[ni].id); restartConfirm = 0; return; }
    for (var i = 0; i < (R.perk || []).length; i++) if (inRect(R.perk[i], x, y)) { buyAtk(R.perk[i].id); restartConfirm = 0; return; }
    if (inRect(R.detonate, x, y)) { dropCenter(); return; }
    if (inRect(R.field, x, y)) { drop(x, y); return; }   // tap the city -> strike THERE (no drag-to-aim)
  }
}
function dropCenter() { drop(isoX(aim.ci, aim.cj), isoY(aim.ci, aim.cj)); }
function collapseMotionActive() {
  if (warhead || interceptors.length || waves.length || fireballs.length || orbitals.length || faults.length || meltZones.length || fireworkBursts.length) return true;
  for (var af = 0; af < buildings.length; af++) if (buildings[af].state === 'falling') return true;
  for (var afs = 0; afs < ships.length; afs++) if (ships[afs].state === 'sinking') return true;
  for (var ap = 0; ap < planes.length; ap++) if (planes[ap].state !== 'fly') return true;
  for (var az = 0; az < zombies.length; az++) if (zombies[az].state !== 'walk') return true;
  return false;
}
function blastMotionActive() {
  if (collapseMotionActive() || chunks.length || dust.length || fires.length || smoke.length || mushrooms.length || impactPulses.length) return true;
  var jc = GF.juice && GF.juice.counts ? GF.juice.counts() : null;
  return !!(jc && (jc.tweens || jc.particles || jc.texts));
}
function blastTailDt(dt) {
  return (gs === 'BLAST' && !collapseMotionActive() && mushrooms.length === 0) ? dt * (mobileFx() ? 4.2 : 3.4) : dt;
}
function stopPostLevelMotion() {
  planes.length = 0; zombies.length = 0; fireSpreadT = 0;
}

// ── UPDATE ──────────────────────────────────────────────────────────────────
function update(dt) {
  var _perfNow = performance.now();   // raw rAF cadence: gf-lib clamps dt, so time it ourselves
  if (_perfLast) perfSample(_perfNow - _perfLast);
  _perfLast = _perfNow;
  bgT += dt; _collapseClock += dt; GF.juice.update(dt); dispMoney = GF.lerp(dispMoney, money, 0.2);
  if (tutAutoT > 0) { tutAutoT -= dt; if (tutAutoT <= 0 && gs === 'RESULT' && tutStep === 1) { tutAutoT = 0; launchAgain(); } }   // tutorial: whisk the player back to AIM so the next tap is the upgrade
  if (restartConfirm > 0) restartConfirm = Math.max(0, restartConfirm - dt);
  if (flashWhite > 0) flashWhite = Math.max(0, flashWhite - dt * 4.5);   // quick decay so the detonation flash is a blip, not a blink
  if (warhead) { warhead.t += dt; var k = Math.min(1, warhead.t / 0.5); warhead.y = GF.lerp(-20 * GF.S, warhead.sy, k * k);
    if (k >= 1) { detonate(warhead.ci, warhead.cj); consumeNuke(); warhead = null; } }
  for (var ic = interceptors.length - 1; ic >= 0; ic--) { var it = interceptors[ic]; it.t += dt; var ik = Math.min(1, it.t / it.dur); it.x = GF.lerp(it.sx0, it.tx, ik); it.y = GF.lerp(it.sy0, it.ty, ik); it.trail.push({ x: it.x, y: it.y }); if (it.trail.length > 6) it.trail.shift(); if (ik >= 1) { GF.juice.particles.burst(it.tx, it.ty, { count: 5, color: '#cdebff', speed: 80, life: 0.3 }); interceptors.splice(ic, 1); } }
  for (var w = waves.length - 1; w >= 0; w--) { var wv = waves[w];
    if (wv.emp) { wv.t += dt; wv.r = wv.maxR * Math.min(1, wv.t / 0.55); if (wv.t > 0.7) waves.splice(w, 1); continue; }   // EMP ring is cosmetic (it only fried the systems at detonation) -> no building/ship damage
    if (wv.glass) { wv.t += dt; wv.r = wv.maxR * Math.min(1, wv.t / 0.6); if (wv.t > 0.8) waves.splice(w, 1); continue; }   // GLASS STORM ring is cosmetic (glassStorm() already toppled the retail) -> no double damage
    if (wv.tidal) { wv.t += dt; wv.r = wv.maxR * Math.min(1, wv.t / 0.9); if (wv.t > 1.1) waves.splice(w, 1); continue; }   // TIDAL surge ring is cosmetic (tidal() already razed the structures) -> no double damage
    wv.t += dt; wv.r = wv.maxR * Math.min(1, 0.35 + wv.t / 0.4);   // INSTANT feedback: the wave covers the inner 35% on frame 1 then sweeps the rest in ~0.25s
    for (var wlp = 0; wlp < walls.length; wlp++) { var wb = walls[wlp]; if (wb.touched) continue; if (Math.sqrt((wb.ci - wv.ci) * (wb.ci - wv.ci) + (wb.cj - wv.cj) * (wb.cj - wv.cj)) <= wv.r) hitBuilding(wb, wv.ci, wv.cj, wv.maxR); }   // walls first
    for (var b = 0; b < buildings.length; b++) { var bd = buildings[b]; if (bd.touched || bd.wall) continue;
      if (Math.sqrt((bd.ci - wv.ci) * (bd.ci - wv.ci) + (bd.cj - wv.cj) * (bd.cj - wv.cj)) <= wv.r) hitBuilding(bd, wv.ci, wv.cj, wv.maxR); }
	    for (var shp = 0; shp < ships.length; shp++) { var sp2 = ships[shp]; if (sp2.touched || sp2.state !== 'afloat') continue;
	      if (Math.sqrt((sp2.ci - wv.ci) * (sp2.ci - wv.ci) + (sp2.cj - wv.cj) * (sp2.cj - wv.cj)) <= wv.r * (1 + shockLvl * 0.5)) hitShip(sp2, wv.ci, wv.cj, wv.maxR); }   // SHOCKWAVE bounces/sinks ships
	    for (var vh = 0; vh < vehicles.length; vh++) { var vv = vehicles[vh]; if (vv.touched || vv.state !== 'intact') continue;
	      if (Math.sqrt((vv.ci - wv.ci) * (vv.ci - wv.ci) + (vv.cj - wv.cj) * (vv.cj - wv.cj)) <= wv.r * 1.04) hitVehicle(vv, wv.ci, wv.cj); }
    // dust kicked up along the expanding shockwave front
    if (wv.t < 0.44 && dust.length < fxCap(260, 82)) { for (var dq = 0; dq < fxCap(6, 3); dq++) { var na = Math.random() * Math.PI * 2, gx0 = isoX(wv.ci, wv.cj), gy0 = isoY(wv.ci, wv.cj) + TH() / 2, rrw = wv.r * (0.82 + Math.random() * 0.26); dust.push({ x: gx0 + Math.cos(na) * rrw * TW() / 2, y: gy0 + Math.sin(na) * rrw * TH() / 2, t: 0, r0: (7 + Math.random() * 8) * GF.S, life: fxLife(0.62 + Math.random() * 0.35), color: Math.random() > 0.45 ? '#8f8675' : (wv.dustColor || '#5a5048'), dx: Math.cos(na) * (12 + Math.random() * 26) * GF.S, rise: (8 + Math.random() * 18) * GF.S }); } }
    if (wv.t > 0.55) waves.splice(w, 1);
  }
  for (var i = 0; i < buildings.length; i++) { var bb = buildings[i]; if (bb.shielded > 0) bb.shielded = Math.max(0, bb.shielded - dt); if (bb.state === 'falling') {
    bb.collapse -= dt * 1.0; var pp = 1 - bb.collapse; bb.lean = pp * pp * 0.55; bb.jit = (Math.random() - 0.5) * 3.5 * GF.S * bb.collapse;   // slower sink + a tremor
    if (Math.random() < dt * fxCap(16, 6) && chunks.length < fxCap(BAL.CHUNK_CAP, 135)) { var tx = isoX(bb.ci + 0.5, bb.cj + 0.5), ty = isoY(bb.ci + 0.5, bb.cj + 0.5) - bb.h * BH() * bb.collapse, aa = Math.random() * Math.PI * 2; chunks.push({ x: tx + (Math.random() - 0.5) * TW(), y: ty, vx: Math.cos(aa) * 55 * GF.S, vy: -55 * GF.S, g: 540 * GF.S, s: (4 + Math.random() * 4) * GF.S, col: bb.col, life: fxLife(0.9), rot: Math.random() }); if (Math.random() < (mobileFx() ? 0.14 : 0.35)) collapseSfx(false); }   // shed debris + crackle from the crumbling top
    if (Math.random() < dt * fxCap(7, 2.5) && dust.length < fxCap(260, 82)) dust.push({ x: isoX(bb.ci + 0.5, bb.cj + 0.5), y: isoY(bb.ci + 0.5, bb.cj + 0.5), t: 0, r0: (6 + bb.h * 1.6) * GF.S, life: fxLife(0.85) });   // dust rolling up as it pancakes
    if (bb.collapse <= 0.06) { bb.collapse = 0.06; bb.state = 'rubble'; }
  } }
  for (var cr = craters.length - 1; cr >= 0; cr--) if (craters[cr].reveal < 1) craters[cr].reveal = Math.min(1, craters[cr].reveal + dt * 3);
  for (var ch = chunks.length - 1; ch >= 0; ch--) { var c = chunks[ch]; c.vy += c.g * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.life -= dt; c.rot += dt * 3; if (c.life <= 0) chunks.splice(ch, 1); }
  for (var fbi = fireballs.length - 1; fbi >= 0; fbi--) { fireballs[fbi].t += dt; if (fireballs[fbi].t > (fireballs[fbi].life || (fireballs[fbi].fast ? 0.78 : 1.15))) fireballs.splice(fbi, 1); }
  for (var ob = orbitals.length - 1; ob >= 0; ob--) { orbitals[ob].t += dt; if (orbitals[ob].t > 0.9) orbitals.splice(ob, 1); }
  for (var ft = faults.length - 1; ft >= 0; ft--) { faults[ft].t += dt; if (faults[ft].t > 1.1) faults.splice(ft, 1); }
  for (var fw = fireworkBursts.length - 1; fw >= 0; fw--) { fireworkBursts[fw].t += dt; if (fireworkBursts[fw].t > 0.9) fireworkBursts.splice(fw, 1); }
  for (var mz = meltZones.length - 1; mz >= 0; mz--) { var Z = meltZones[mz]; Z.t += dt; Z.r = Math.min(Z.maxR, Z.r + dt * 0.9);
    if (Z.t - Z.spread > 0.25) { Z.spread = Z.t; for (var q = 0; q < buildings.length; q++) { var zb = buildings[q]; if (zb.touched || zb.far || zb.wall) continue;
      if (Math.sqrt((zb.ci - Z.ci) * (zb.ci - Z.ci) + (zb.cj - Z.cj) * (zb.cj - Z.cj)) <= Z.r && !Z.rolled[q]) { Z.rolled[q] = true; if (Math.random() < Z.kp) { destroyBuilding(zb, Z.ci, Z.cj, true); if (Math.random() < 0.3) GF.juice.floatText(isoX(zb.ci + 0.5, zb.cj + 0.5), isoY(zb.ci + 0.5, zb.cj + 0.5) - 8 * GF.S, 'IRRADIATED', { color: THEMES.powerplant.accent, size: 10, rise: 32 }); } } } }
    if (Z.t > 4.5) meltZones.splice(mz, 1); }
  var tailDt = blastTailDt(dt);
  for (var ip = impactPulses.length - 1; ip >= 0; ip--) { impactPulses[ip].t += tailDt; if (impactPulses[ip].t > impactPulses[ip].life) impactPulses.splice(ip, 1); }
  for (var mu = mushrooms.length - 1; mu >= 0; mu--) { mushrooms[mu].t += dt; if (mushrooms[mu].t > (mushrooms[mu].life || 4.8)) mushrooms.splice(mu, 1); }
  for (var sm = smoke.length - 1; sm >= 0; sm--) { smoke[sm].t += tailDt; if (smoke[sm].t > (smoke[sm].life || 6)) smoke.splice(sm, 1); }
  for (var du = dust.length - 1; du >= 0; du--) { dust[du].t += tailDt; if (dust[du].t > dust[du].life) dust.splice(du, 1); }
  for (var fi = fires.length - 1; fi >= 0; fi--) { fires[fi].t += tailDt; if (fires[fi].t > fires[fi].life) fires.splice(fi, 1); }
  for (var sx = ships.length - 1; sx >= 0; sx--) { var sp3 = ships[sx]; if (sp3.state === 'gone') continue;
    sp3.ox += sp3.vx * dt; sp3.oy += sp3.vy * dt; sp3.vx *= 0.90; sp3.vy *= 0.90;
    if (sp3.state === 'sinking') { sp3.sink = Math.min(1, sp3.sink + dt * 0.7); sp3.tilt += (sp3.tiltDir || 1) * dt * 1.5; if (sp3.sink >= 1) sp3.state = 'gone'; }
    else sp3.tilt = GF.lerp(sp3.tilt, 0, 0.08); }
  planeT -= dt;
  if (planeT <= 0 && planes.length < 2 && hasAirport && gs === 'AIM') { spawnPlane(); planeT = 5 + Math.random() * 6; }
  for (var pl = planes.length - 1; pl >= 0; pl--) { var pn = planes[pl]; pn.t += dt;
    if (pn.state === 'fly') { pn.x += pn.vx * dt; if (pn.x < -70 * GF.S || pn.x > GF.W + 70 * GF.S) planes.splice(pl, 1); }
    else { pn.vy += 340 * GF.S * dt; pn.x += pn.vx * 0.35 * dt; pn.y += pn.vy * dt; pn.rot += dt * (pn.dir > 0 ? 4 : -4);   // shot down -> tumble + smoke + crash
      if (Math.random() < dt * 26) GF.juice.particles.burst(pn.x, pn.y, { count: 1, colors: ['#888', '#6a6', '#caa'], speed: 18, gravity: -10, life: 0.7, size: 3 });
      if (pn.y > GF.H * 0.5) { GF.juice.particles.burst(pn.x, pn.y, { count: 14, colors: ['#fff', '#ffd9a0', '#ff8a3b'], speed: 140, gravity: 200, life: 0.7, size: 5 }); GF.juice.shake(3, 160); collapseSfx(false); planes.splice(pl, 1); } } }
  // QUARANTINE zombies: a wandering crowd of moving bonus targets (mirrors the plane spawn/knockdown loop, but ground-bound)
  zombieT -= dt;
  if (zombieT <= 0 && hasZombie && zombies.length < 9 && gs === 'AIM') { spawnZombie(); zombieT = 0.8 + Math.random() * 1.4; }
  for (var zi = zombies.length - 1; zi >= 0; zi--) { var zb = zombies[zi]; zb.t += dt;
    if (zb.state === 'walk') { if (Math.random() < dt * 0.7) { zb.hd += (Math.random() - 0.5) * 1.4; }   // occasionally change heading -> a meandering shamble
      zb.ci += Math.cos(zb.hd) * zb.spd * dt; zb.cj += Math.sin(zb.hd) * zb.spd * dt;
      if (zb.ci < 0.4 || zb.ci > GRID - 1.4 || zb.cj < 0.4 || zb.cj > GRID - 1.4 || (DISTMAP && DKEYS[DISTMAP[Math.round(zb.cj) * GRID + Math.round(zb.ci)] || 0] !== 'quarantine')) { zb.hd += Math.PI; zb.ci = GF.clamp(zb.ci, 0.4, GRID - 1.4); zb.cj = GF.clamp(zb.cj, 0.4, GRID - 1.4); }   // turn back at the zone edge so the crowd stays in the quarantine
    } else { zb.fall += dt; if (zb.fall > 0.8) zombies.splice(zi, 1); } }   // vaporized -> brief crumple then gone
  // firestorm: fire creeps from a burning ruin to an adjacent one over time (FIRESTORM perk makes it spread faster, wider, AND consume INTACT blocks too)
  if (gs === 'BLAST' && collapseMotionActive()) {
    fireSpreadT += dt;
    var fsOn = firestormLvl > 0 && hasGhetto, fsRate = fsOn ? 0.22 : 0.4, fsReach = fsOn ? 2.2 + firestormLvl * 0.3 : 2.2, fsTries = fsOn ? fxCap(5, 3) : fxCap(3, 2), fsCap = fsOn ? fxCap(80, 28) : fxCap(40, 18);
    if (fireSpreadT > fsRate && fires.length > 0 && fires.length < fsCap) {
      fireSpreadT = 0;
      for (var sp = 0; sp < fsTries; sp++) { var src = buildings[(Math.random() * buildings.length) | 0]; if (!src || !src.burning) continue;
        for (var q = 0; q < buildings.length; q++) { var tb = buildings[q]; if (tb.burning) continue;
          var spreadable = (tb.state === 'rubble' || tb.state === 'damaged') || (fsOn && tb.state === 'intact' && !tb.wall && !tb.far);   // FIRESTORM also catches standing blocks
          if (!spreadable) continue;
          if (Math.abs(tb.ci - src.ci) <= fsReach && Math.abs(tb.cj - src.cj) <= fsReach) { tb.burning = true; fires.push({ x: isoX(tb.ci + 0.5, tb.cj + 0.5), y: isoY(tb.ci + 0.5, tb.cj + 0.5), t: 0, life: fxLife(3 + Math.random() * 3), r: (10 + tb.h * 2) * GF.S });
            if (fsOn && tb.state === 'intact') { destroyBuilding(tb, tb.ci, tb.cj, true); GF.juice.floatText(isoX(tb.ci + 0.5, tb.cj + 0.5), isoY(tb.ci + 0.5, tb.cj + 0.5) - 8 * GF.S, 'BURNED', { color: '#ff8a3b', size: 11, rise: 36 }); }   // the firestorm razes it
            break; } } }
    }
  } else if (gs !== 'BLAST') {
    fireSpreadT = 0;
  }
  if (gs === 'BLAST') {
    if (blastMotionActive()) settleT = 0;
    else { settleT += dt; if (settleT > 0.18) showResult(); }
  }
}

// Simulation-side helpers stay with update/input state. Rendering receives these
// through explicit dependency injection and never owns the hot-loop state.
function hitShip(sp, gi, gj, effR) {
  if (sp.touched || sp.state !== 'afloat') return;
  var dx = sp.ci - gi, dy = sp.cj - gj, dist = Math.sqrt(dx * dx + dy * dy), pushR = effR * (1 + shockLvl * 0.5);
  if (dist > pushR) return;
  sp.touched = true; var ang = Math.atan2(dy, dx), force = (1 - dist / pushR) * (150 + shockLvl * 75) * GF.S;
  sp.vx += Math.cos(ang) * force; sp.vy += Math.sin(ang) * force * 0.5;
  var sinkChance = dist < effR * 0.7 ? 1 : GF.clamp(0.12 + shockLvl * 0.16, 0, 0.95);
  if (Math.random() < sinkChance) {
    sp.state = 'sinking'; sp.tiltDir = Math.cos(ang) > 0 ? 1 : -1;
    var gx = isoX(sp.ci + 0.5, sp.cj + 0.5), gy = isoY(sp.ci + 0.5, sp.cj + 0.5);
    var gain = Math.round((sp.big ? 18 : 7) * (1 + cityTier * 0.3) * (CFG.tuning ? CFG.tuning.payout_mult : 1) * payoutBoost('ship_bonus'));
    dropEarned += gain;
    GF.juice.floatText(gx, gy - 10 * GF.S, '+' + gain, { color: PB.hi, size: 13, rise: 40 });
    GF.juice.particles.burst(gx, gy, { count: 9, colors: [PB.hi, PB.mid, '#9bffc0'], speed: 130, life: 0.5 });
    if (sp.big) collapseSfx(true);
  }
}

function spawnPlane() {
  var dir = Math.random() < 0.5 ? 1 : -1;
  planes.push({ x: dir > 0 ? -30 * GF.S : GF.W + 30 * GF.S, y: GF.H * (0.15 + Math.random() * 0.16), vx: dir * (46 + Math.random() * 30) * GF.S, vy: 0, dir: dir, state: 'fly', t: 0, rot: 0, blink: Math.random() * 6 });
}

function spawnZombie() {
  if (!DISTMAP) return;
  var tries = 0, ci, cj;
  do {
    ci = 0.5 + Math.random() * (GRID - 1);
    cj = 0.5 + Math.random() * (GRID - 1);
    tries++;
  } while (tries < 20 && DKEYS[DISTMAP[Math.round(cj) * GRID + Math.round(ci)] || 0] !== 'quarantine');
  if (tries >= 20) return;
  zombies.push({ ci: ci, cj: cj, hd: Math.random() * Math.PI * 2, spd: 0.5 + Math.random() * 0.5, t: Math.random() * 6, state: 'walk', fall: 0, big: Math.random() < 0.25 });
}

function tutTarget() {
  if (!tutorialActive()) return null;
  if (tutStep === 4 && dailyOpen) {
    if (R.dailyClaim) return { x: R.dailyClaim.x, y: R.dailyClaim.y, w: R.dailyClaim.w, h: R.dailyClaim.h, id: 'dailyClaim' };
    if (R.dailyClose) return { x: R.dailyClose.x, y: R.dailyClose.y, w: R.dailyClose.w, h: R.dailyClose.h, id: 'dailyClose' };
  }
  if (gs === 'AIM') {
    if ((tutStep === 0 || tutStep === 2 || tutStep === 3 || tutStep === 6 || tutStep === 7 || tutStep === 9 || tutStep === 10 || tutStep === 12) && R.detonate) return { x: R.detonate.x, y: R.detonate.y, w: R.detonate.w, h: R.detonate.h, id: 'atom' };
    if (tutStep === 1 || tutStep === 11) { for (var i = 0; i < (R.perk || []).length; i++) if (R.perk[i].id === 'yield') { var p = R.perk[i]; return { x: p.x, y: p.y, w: p.w, h: p.h, id: 'yield' }; } }
    if (tutStep === 4 && R.daily && !dailyOpen) return { x: R.daily.x, y: R.daily.y, w: R.daily.w, h: R.daily.h, id: 'daily' };
    if (tutStep === 5) { for (var m = 0; m < (R.perk || []).length; m++) if (R.perk[m].id === 'mirv') { var mp = R.perk[m]; return { x: mp.x, y: mp.y, w: mp.w, h: mp.h, id: 'mirv' }; } }
  }
  if (tutStep === 8 && R.tutGiftClaim) return { x: R.tutGiftClaim.x, y: R.tutGiftClaim.y, w: R.tutGiftClaim.w, h: R.tutGiftClaim.h, id: 'gift' };
  return null;
}

var renderer = createRenderer({
  ALLOW_TEST_HOOKS: ALLOW_TEST_HOOKS,
  BH: BH, GF: GF, PB: PB, T: T, TH: TH, THEMES: THEMES, TW: TW,
  atkCost: atkCost, atkList: atkList, atkLvl: atkLvl, atkMax: atkMax,
  clampStatsScroll: clampStatsScroll,
  collectibleFrame: collectibleFrame, collectiblePalette: collectiblePalette,
  dacc: dacc, dailyClaimable: dailyClaimable, dailyReward: dailyReward,
  darken: darken, drawExplosionAsset: drawExplosionAsset,
  drawMushroomSourceLayer: drawMushroomSourceLayer,
  drawMushroomSourcePuffs: drawMushroomSourcePuffs,
  dur: dur, extraIncomeBonus: extraIncomeBonus, fmt: fmt,
  fxChaos: fxChaos, fxRand: fxRand, hexColor: hexColor,
  isWaterCell: isWaterCell, isoX: isoX, isoY: isoY, mixHex: mixHex,
  mobileFx: mobileFx, mobileView: mobileView, mushroomSourceAsset: mushroomSourceAsset,
  nextStreak: nextStreak, nukeCost: nukeCost, nukeDef: nukeDef,
  nukeList: nukeList, nukeUsable: nukeUsable, powerCells: powerCells,
  rgba: rgba, skinBoostLabel: skinBoostLabel,
  strokeBrokenEllipse: strokeBrokenEllipse, tutTarget: tutTarget,
  tutorialActive: tutorialActive, uiFont: uiFont, uiOctPath: uiOctPath,
  uiPanel: uiPanel, weakpointTargets: weakpointTargets, wipePct: wipePct,
  getState: function () {
    return {
      BUILTIN: BUILTIN, DISTMAP: DISTMAP, DKEYS: DKEYS, GRID: GRID, R: R,
      _press: _press, activeNuke: activeNuke, aim: aim, bgT: bgT,
      buildings: buildings, chainLvl: chainLvl, chunks: chunks,
      citiesRazed: citiesRazed, cityReinforced: cityReinforced,
      cityTheme: cityTheme, cityTier: cityTier, cityView: cityView,
      clusterLvl: clusterLvl, craters: craters, dailyOpen: dailyOpen,
      dailyStreak: dailyStreak, destroyedW: destroyedW, devOpen: devOpen,
      dispMoney: dispMoney, dropEarned: dropEarned, dust: dust, empLvl: empLvl,
      eyeLvl: eyeLvl, faults: faults, fireballs: fireballs, fires: fires,
      firestormLvl: firestormLvl, fireworkBursts: fireworkBursts,
      fireworksLvl: fireworksLvl, fit: fit, flareLvl: flareLvl,
      flashWhite: flashWhite, glassLvl: glassLvl, godPower: godPower, gs: gs,
      hasWater: hasWater, helpOpen: helpOpen, impactPulses: impactPulses,
      infernoLvl: infernoLvl, infoOpen: infoOpen, interceptors: interceptors,
      lastCritBonus: lastCritBonus, lastFarRazed: lastFarRazed,
      lastFarTotal: lastFarTotal, lastPayout: lastPayout,
      lastShipsSunk: lastShipsSunk, lastShipsTotal: lastShipsTotal,
      levelName: levelName, luckLvl: luckLvl, meltZones: meltZones,
      meltdownLvl: meltdownLvl, mirvLvl: mirvLvl, money: money,
      mushrooms: mushrooms, nukeAmmo: nukeAmmo, orbitalLvl: orbitalLvl,
      offerChipOn: offerChipOn(),
      orbitals: orbitals, penLvl: penLvl, pendingDbl: pendingDbl, planes: planes,
      powerLvl: powerLvl, resultPct: resultPct, resultWin: resultWin,
      seismicLvl: seismicLvl, settingsOpen: settingsOpen, ships: ships,
      shockLvl: shockLvl, smoke: smoke, statsOpen: statsOpen,
      statsScroll: statsScroll, statsScrollMax: statsScrollMax,
      tidalLvl: tidalLvl, toppleLvl: toppleLvl, totalEarned: totalEarned,
      totalW: totalW, tutStep: tutStep,
      tutorialGiftChestImg: tutorialGiftChestImg,
      tutorialGiftOpen: tutorialGiftOpen, vehicles: vehicles, warhead: warhead,
      waves: waves, welcomeBuying: welcomeBuying, welcomeCaps: welcomeCaps,
      welcomeMs: welcomeMs, welcomeOpen: welcomeOpen, zombies: zombies
    };
  },
  setStatsScrollMax: function (value) { statsScrollMax = value; }
});
var draw = renderer.draw;


// Mutation and screenshot helpers are intentionally localhost-only. Production
// keeps only the narrow wrapper contract and read-only QA state below.
if (ALLOW_TEST_HOOKS) {
HOOKS._jumpLevel = function () { powerLvl = 5; cityTier = 2; newCity(2); detonate((GRID - 1) / 2 - 1, (GRID - 1) / 2); for (var s = 0; s < 48; s++) update(0.05); };
HOOKS._jumpTier = function (t, p) { t = Math.max(0, Math.floor(Number(t) || 0)); cityTier = t; powerLvl = Math.min(atkMax('yield'), Math.max(0, Math.floor(Number(p == null ? 6 + t * 2 : p) || 0))); failStreak = 0; cityReinforced = false; gs = 'AIM'; loadoutOpen = devOpen = false; newCity(t); saveMeta(); };
HOOKS._setMirv = function (n) { mirvLvl = n; };
HOOKS._setShock = function (n) { shockLvl = n; };
HOOKS._kickZoom = function () { zoom = 1.7; };
HOOKS.__ships = function () { return { total: ships.length, afloat: ships.filter(function (s) { return s.state === 'afloat'; }).length, sinking: ships.filter(function (s) { return s.state === 'sinking'; }).length, gone: ships.filter(function (s) { return s.state === 'gone'; }).length }; };
HOOKS.__world = function () { var far = 0, main = 0, occ = markBuildingCells(), vehicleOk = true, shipOk = true; for (var i = 0; i < buildings.length; i++) { var b = buildings[i]; if (b.wall) continue; if (b.far) far++; else main++; } for (var vi = 0; vi < vehicles.length; vi++) if (!vehicleFrontSlot(Math.floor(vehicles[vi].ci), Math.floor(vehicles[vi].cj), occ)) vehicleOk = false; for (var si = 0; si < ships.length; si++) if (!visibleShipSlot(Math.round(ships[si].ci), Math.round(ships[si].cj), occ)) shipOk = false; return { far: far, main: main, vehicles: vehicles.length, vehicleCells: vehicles.map(function (v) { return [Math.round(v.ci * 10) / 10, Math.round(v.cj * 10) / 10]; }), vehiclePlacementOk: vehicleOk, ships: ships.length, shipCells: ships.map(function (s) { return [Math.round(s.ci * 10) / 10, Math.round(s.cj * 10) / 10]; }), shipPlacementOk: shipOk, waterFrom: waterFrom, waterTo: waterTo, GRID: GRID, totalW: totalW, authored: !!(loadAuthoredLevel && loadAuthoredLevel(cityTier)) }; };
HOOKS.__aim = function () { return { ci: aim.ci, cj: aim.cj }; };
HOOKS._spawnPlane = function () { spawnPlane(); };
HOOKS.__planes = function () { return { total: planes.length, flying: planes.filter(function (p) { return p.state === 'fly'; }).length, down: planes.filter(function (p) { return p.state !== 'fly'; }).length, hasAirport: hasAirport }; };
HOOKS.__zombies = function () { return { total: zombies.length, walking: zombies.filter(function (z) { return z.state === 'walk'; }).length, dead: zombies.filter(function (z) { return z.state === 'dead'; }).length, hasZombie: hasZombie }; };
HOOKS.__spawnZombie = function () { spawnZombie(); return zombies.length; };
HOOKS.__zombiePos = function () { return zombies.filter(function (z) { return z.state === 'walk'; }).map(function (z) { return [Math.round(z.ci * 100) / 100, Math.round(z.cj * 100) / 100]; }); };
HOOKS.__detonateAt = function (ci, cj) { aim = { ci: GF.clamp(ci, 0, GRID - 1), cj: GF.clamp(cj, 0, GRID - 1) }; detonate(aim.ci, aim.cj); };   // test hook: blast a specific cell (verifies weapon effects + zombie/plane knockdown)
HOOKS.__gfBlastAtForTest = function (ci, cj) { aim = { ci: GF.clamp(ci, 0, GRID - 1), cj: GF.clamp(cj, 0, GRID - 1) }; settleT = 0; gs = 'BLAST'; detonate(aim.ci, aim.cj); return window.__gfDbg(); };
HOOKS._setupForScreenshot = function () { window._jumpLevel(); };
HOOKS._setLang = function (l) { return setLanguage(l, true); };
HOOKS._getI18N = function () { return STRINGS[GF.lang] || STRINGS.en; };
HOOKS.__gfSettings = function () { return { open: settingsOpen, lang: GF.lang, muted: GF.muted }; };
HOOKS.__gfOpenSettings = function () { settingsOpen = true; return window.__gfSettings(); };
HOOKS.__gfPress = function (x, y) { onPress(x, y); };               // test hooks (safe to ship)
HOOKS.__gfRect = function (k) { return R[k]; };
HOOKS.__gfRectAll = function () { return R; };
HOOKS.__gfTutTarget = function () {
  var t = tutTarget();
  return t ? { x: t.x, y: t.y, w: t.w, h: t.h, id: t.id } : null;
};
HOOKS.__gfGive = function (n) { money += n; saveMeta(); GF.saveRun(); };
}

// Wrapper contract: server-owned rewards, caps spend, and skin visual sync.
// Paid grants arrive through authoritative cloud state, never a browser hook.
HOOKS.__gfAddCaps = function (n) { n = Math.max(0, Math.ceil(Number(n || 0))); money += n; totalEarned += n; best = Math.max(best, totalEarned); dispMoney = money; saveMeta(); GF.saveRun(); return money; };
HOOKS.__gfSpendCaps = function (n) { n = Math.max(0, Math.ceil(Number(n || 0))); if (money < n) return false; money -= n; dispMoney = money; saveMeta(); GF.saveRun(); return true; };
HOOKS.__gfEquipSkin = function (skin, state, opts) { applySkinState(skin, state); if (!opts || !opts.noSave) saveMeta(); return { equippedSkin: equippedSkin && equippedSkin.id || '', ownedSkins: ownedSkins.slice(), skinCopies: Object.assign({}, skinCopies), skinBoosts: Object.assign({}, skinBoosts), boostLabel: skinBoostLabel() }; };
HOOKS.__gfSkinState = function () { return { equippedSkin: equippedSkin, ownedSkins: ownedSkins.slice(), skinCopies: Object.assign({}, skinCopies), skinBoosts: Object.assign({}, skinBoosts), gachaStats: Object.assign({}, gachaStats) }; };

if (ALLOW_TEST_HOOKS) {
HOOKS.__gfNuke = function (id, n) { if (id) { grantNuke(id, n == null ? 3 : n); activeNuke = nukeDef(id).id; saveMeta(); } return { activeNuke: activeNuke, ammo: nukeAmmo, owned: Object.keys(nukeOwned), mult: nukeDef(activeNuke).mult, chips: (R.nuke || []).length }; };
HOOKS.__gfEye = function (open) { eyeLvl = 1; cityView = !!open; if (!cityView) viewZoom = 1; saveMeta(); return { eyeLvl: eyeLvl, cityView: cityView, viewZoom: viewZoom }; };
HOOKS.__gfCam = function (z) { eyeLvl = 1; cityView = true; viewZoom = GF.clamp(z == null ? viewZoom : z, 0.72, 2.6); zoom = viewZoom; saveMeta(); return { eyeLvl: eyeLvl, cityView: cityView, viewZoom: viewZoom, zoom: zoom }; };
HOOKS.__gfWeakpoints = function () { return weakpointTargets(64); };
}

HOOKS.__gfDbg = function () { return { loadoutOpen: loadoutOpen, dev: devOpen, power: powerLvl, powerLvl: powerLvl, yieldCells: Math.round(powerCells() * 100) / 100, flares: flareLvl, pen: penLvl, mirvLvl: mirvLvl, luckLvl: luckLvl, extraIncome: Math.round(extraIncomeBonus() * 100), critPayoutChance: Math.round(criticalPayoutChance() * 100), lastCritBonus: lastCritBonus, lastResultPct: Math.round(resultPct * 100), resultWin: resultWin, money: Math.round(money), tier: cityTier, gs: gs, restartConfirm: restartConfirm, destroyedPct: Math.round(destroyedW / Math.max(1, totalW) * 100), perks: (R.perk || []).length, detonate: !!R.detonate, shock: shockLvl, emp: empLvl, orbital: orbitalLvl, cluster: clusterLvl, firestorm: firestormLvl, chain: chainLvl, glass: glassLvl, seismic: seismicLvl, inferno: infernoLvl, topple: toppleLvl, meltdown: meltdownLvl, tidal: tidalLvl, fireworks: fireworksLvl, eyeLvl: eyeLvl, godPower: godPower, equippedSkin: equippedSkin && equippedSkin.id || '', skinBoosts: Object.assign({}, skinBoosts), setBoosts: Object.assign({}, setBoosts), offerChipOn: offerChipOn(), capsDealAvailable: capsDealAvailable, ownedSkins: ownedSkins.length, boxesOpened: Number(gachaStats.boxesOpened || 0), theme: cityTheme, levelName: levelName || '', weakpoints: countWeakpoints(), weakpointHits: weakpointHits, lastWeakpointHits: lastWeakpointHits, atkMaxYield: atkMax('yield'), hasStation: hasStation, hasAirport: hasAirport, hasGhetto: hasGhetto, hasChinatown: hasChinatown, hasMall: hasMall, hasMountain: hasMountain, hasRefinery: hasRefinery, hasSkyscraper: hasSkyscraper, hasPowerplant: hasPowerplant, hasPort: hasPort, hasPark: hasPark, hasCathedral: hasCathedral, hasZombie: hasZombie, zombies: zombies.length, vehicles: vehicles.length, GRID: GRID, ships: ships.length, zone: zoneName, zoom: Math.round(zoom * 100) / 100, cityView: cityView, viewZoom: Math.round(viewZoom * 100) / 100, infoOpen: infoOpen, infoBadges: (R.info || []).length, starterGiven: starterGiven, upgDone: upgDone, perkIds: atkList().join(','), welcomeOpen: welcomeOpen, welcomeCaps: welcomeCaps, welcomeBuying: welcomeBuying, dailyOpen: dailyOpen, settingsOpen: settingsOpen, lang: GF.lang, muted: GF.muted, dailyClaimable: dailyClaimable(), dailyStreak: dailyStreak, activeNuke: activeNuke, nukeMult: nukeDef(activeNuke).mult, nukeAmmoWide: nukeAmmo.wide || 0, nukeAmmoTsar: nukeAmmo.tsar || 0, nukeChips: (R.nuke || []).length, actionCx: Math.round(R.actionCx || 0), actionCy: Math.round(R.actionCy || 0), aimX: Math.round(isoX(aim.ci, aim.cj)), aimY: Math.round(isoY(aim.ci, aim.cj) + TH() / 2), fxMobile: mobileFx(), perfLowFx: perfLowFx, fx: { waves: waves.length, chunks: chunks.length, dust: dust.length, fires: fires.length, smoke: smoke.length, fireballs: fireballs.length, mushrooms: mushrooms.length, meltZones: meltZones.length, fireworks: fireworkBursts.length, pulses: impactPulses.length, juice: GF.juice.counts() }, mushroomSources: mushroomSourceAssets.filter(function (a) { return a.ready; }).length, lastBlastProfile: lastBlastProfile, tutStep: tutStep, tutorialActive: tutorialActive(), tutorialGiftOpen: tutorialGiftOpen, tutorialGiftClaimed: tutorialGiftClaimed, tutorialDailyClaimed: tutorialDailyClaimed, tutTarget: (tutTarget() || {}).id || null }; };
HOOKS.render_game_to_text = function () { return JSON.stringify(window.__gfDbg()); };
HOOKS.advanceTime = function (ms) { if (window.__gfStep) window.__gfStep(Math.max(1, Math.round((ms || 16) / (1000 / 60))), 1 / 60); return window.render_game_to_text(); };

if (ALLOW_TEST_HOOKS) {
HOOKS.__gfTutReset = function () { tutStep = 0; tutDone = false; upgDone = false; tutAutoT = 0; tutDailyPending = false; tutorialDailyClaimed = false; tutorialGiftOpen = false; tutorialGiftClaimed = false; powerLvl = 0; mirvLvl = 0; money = 0; cityTier = 0; starterGiven = false; lastClaimDay = -1; dailyStreak = 0; ownedSkins = []; skinCopies = {}; equippedSkin = null; skinBoosts = {}; newCity(0); saveMeta(); return tutStep; };   // restart the guided tutorial from scratch
HOOKS.__gfSkipTut = function () { tutStep = TUT_DONE_STEP; tutDone = true; upgDone = true; tutAutoT = 0; tutorialGiftOpen = false; saveMeta(); return tutStep; };   // mark the guided tutorial complete (unlocks the full UI)
HOOKS.__gfTutorialDaily = function () { welcomeOpen = false; helpOpen = false; devOpen = false; statsOpen = false; infoOpen = null; dailyOpen = false; gs = 'AIM'; tutStep = 4; tutDone = false; upgDone = true; tutDailyPending = true; tutorialDailyClaimed = false; lastClaimDay = -1; if (!R.daily) layout(); return window.__gfDbg(); };   // test hook: reproduce the daily-claim tutorial spotlight directly
HOOKS.__gfTutorialGift = function () { welcomeOpen = false; helpOpen = false; devOpen = false; statsOpen = false; infoOpen = null; dailyOpen = false; gs = 'AIM'; tutStep = 8; tutDone = false; tutorialGiftClaimed = false; tutorialGiftOpen = true; if (!R.tutGiftClaim) layout(); return window.__gfDbg(); };
HOOKS.__gfReturnTest = function (msAgo) { welcomeOpen = false; welcomeCaps = 0; dailyOpen = false; lastSeen = Date.now() - msAgo; checkReturn(); return { welcomeOpen: welcomeOpen, welcomeCaps: welcomeCaps, dailyOpen: dailyOpen }; };   // simulate returning after msAgo ms
HOOKS.__gfDailyTest = function (prevDayOffset) { lastClaimDay = (prevDayOffset == null ? -1 : dayNum() - prevDayOffset); dailyOpen = true; return { streak: dailyStreak, next: nextStreak(), reward: dailyReward(nextStreak()) }; };   // open daily; prevDayOffset=1 -> claimed yesterday (streak continues)
HOOKS.__gfOpenStats = function () { statsOpen = true; statsScroll = 0; return window.__gfDbg(); };
}

var installedHooks = installHookSurface({
  target: window,
  hooks: HOOKS,
  allowTestHooks: ALLOW_TEST_HOOKS
});

// ── BOOT ───────────────────────────────────────────────────────────────────
GF.init({
  designW: 390, designH: 780, strings: STRINGS, sprites: SPRITE_NAMES, saveKey: 'megaton',
  onReady: function () {
    initLanguage(); loadMeta(); if (godPower) applyGodPower(false); layout(); checkReturn(); loadExplosionAssets();
    try { document.addEventListener('visibilitychange', function () { if (document.hidden && !welcomeOpen && !welcomeBuying) saveMeta(); }); } catch (e) {}   // stamp activity time unless a return reward is waiting or in checkout
	    fetch('levels.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (j) BUILTIN = j; }).catch(function () {}).then(function () {
	      newCity(cityTier);
	      var _lp = (location.search.match(/[?&]level=(\d+)/) || [])[1]; if (ALLOW_TEST_HOOKS && _lp != null) { tutDone = true; coachStep = 1; window._jumpTier(parseInt(_lp, 10)); }   // localhost editor "Test" deep-link
	      lfStart();
	    });
    if (!tutDone) coachStep = 0; else coachStep = 3;
    dispMoney = money;
    startMusic();
    loadSfx();   // decode the real CC0/CC-BY explosion + building-break samples
    GF.remoteConfig('megaton', CFG, { clamps: { 'tuning.payout_mult': [0.5, 2], 'tuning.cost_mult': [0.5, 2] }, onUpdate: function (cc) { CFG = cc; } }).then(function (cc) { CFG = cc; });
    GF.exposeState(function () { return { gs: gs, score: Math.round(totalEarned), money: Math.round(money), cityTier: cityTier, powerLvl: powerLvl, destroyedPct: Math.round(destroyedW / totalW * 100), sfx: Object.keys(_sfxBuf).length }; });
    GF.exposeBot(function () { if (gs === 'RESULT') return resultWin ? ['next'] : (money >= upCost() ? ['power', 'again'] : ['again']); if (gs === 'AIM') return ['drop']; return []; },
      function (act) { if (act === 'next') nextCity(); else if (act === 'again') launchAgain(); else if (act === 'power') upgradePower(); else if (act === 'drop') drop(ORIGIN.x + (Math.random() - 0.5) * GRID * TW() * 0.3, ORIGIN.y + GRID * TH() * (0.35 + Math.random() * 0.25)); });
    if (window.__gfSimMode || window._silent) window.__gfEcon = {
      genre: 'idle', params: { COST_K: BAL.UP_COST_K },
      initialState: function () { return { money: 0, lvl: 0, tier: 0, mt: 0 }; },
      actions: function (s) { var c = Math.round(BAL.UP_COST_BASE * Math.pow(BAL.UP_COST_K, s.lvl)); return [{ id: 'power', cost: c, ready: s.money >= c }]; },
      step: function (s, a) { if (a.id === 'wait') { var inc = (60 + 60 * s.lvl) * (1 + 0.6 * s.tier); s.money += inc * a.dt; s.mt += inc * a.dt; while (s.mt >= 20000 * (s.tier + 1) * (s.tier + 1)) s.tier++; return s; } s.money -= Math.round(BAL.UP_COST_BASE * Math.pow(BAL.UP_COST_K, s.lvl)); s.lvl++; return s; },
      metrics: function (s) { return { currency: s.money, progress: s.mt }; },
    };
    GF.canvas.addEventListener('pointerdown', function (e) { e.preventDefault(); var p = toGame(e);
      if (statsOpen) { statsDrag = { x: p.x, y: p.y, lastY: p.y, moved: false, close: inRect(R.statsClose, p.x, p.y) }; return; }
      if (tutorialActive() && !window._silent) { onPress(p.x, p.y); return; }   // tutorial: gated taps only, no aim-drag
      if (gs === 'AIM' && !devOpen && !helpOpen && !welcomeOpen && !dailyOpen && !settingsOpen) {
        var onInfo = false; for (var ii = 0; ii < (R.info || []).length; ii++) { var bb = R.info[ii]; if (Math.abs(p.x - bb.x) <= bb.r * 1.9 && Math.abs(p.y - bb.y) <= bb.r * 1.9) onInfo = true; }
        if (onInfo || infoOpen || statsOpen || settingsOpen) { onPress(p.x, p.y); return; }   // info/stats/settings overlays: never start an aim-drag
        var onPerk = false; for (var i = 0; i < (R.perk || []).length; i++) if (inRect(R.perk[i], p.x, p.y)) onPerk = true;
	        var onBtn = inRect(R.mute, p.x, p.y) || inRect(R.devbtn, p.x, p.y) || inRect(R.stats, p.x, p.y) || inRect(R.daily, p.x, p.y) || inRect(R.missions, p.x, p.y) || inRect(R.view, p.x, p.y);
        if (!onPerk && !onBtn && !onNukeChip(p.x, p.y)) { if (inRect(R.detonate, p.x, p.y)) { dropCenter(); return; } if (inRect(R.field, p.x, p.y)) { drop(p.x, p.y); return; } }   // tap the atom -> strike centre; tap the city -> strike THERE. No hold-drag.
      }
      onPress(p.x, p.y);
    }, { passive: false });
    GF.canvas.addEventListener('pointermove', function (e) { if (statsDrag) { e.preventDefault(); var sp = toGame(e); var dy = statsDrag.lastY - sp.y; if (Math.abs(sp.y - statsDrag.y) > 4 * GF.S) statsDrag.moved = true; scrollStats(dy); statsDrag.lastY = sp.y; return; } if (!_press) return; e.preventDefault(); var p = toGame(e);
      if (!_press.drag && Math.abs(p.x - _press.x) + Math.abs(p.y - _press.y) > 7 * GF.S) _press.drag = true;
      if (_press.drag) { var c = screenToCell(p.x, p.y); aim = { ci: GF.clamp(c.i, 0, GRID - 1), cj: GF.clamp(c.j, 0, GRID - 1) }; } }, { passive: false });
    GF.canvas.addEventListener('pointerup', function (e) { if (statsDrag) { e.preventDefault(); var sp = toGame(e); if (!statsDrag.moved && statsDrag.close && inRect(R.statsClose, sp.x, sp.y)) statsOpen = false; statsDrag = null; return; } if (!_press) return; e.preventDefault(); var p = toGame(e);
      if (!_press.drag && _press.atom && (e.timeStamp - _press.t) < 250) { dropCenter(); }   // quick tap on the atom -> FIRE
      else { var c = screenToCell(p.x, p.y); aim = { ci: GF.clamp(c.i, 0, GRID - 1), cj: GF.clamp(c.j, 0, GRID - 1) }; beep('cash'); }   // drag / long-hold / field-tap -> move target, never fire
      _press = null; }, { passive: false });
    GF.canvas.addEventListener('pointercancel', function () { _press = null; statsDrag = null; }, { passive: false });
    GF.canvas.addEventListener('wheel', function (e) {
      if (statsOpen) { e.preventDefault(); scrollStats(e.deltaY); return; }
      if (cityView) { e.preventDefault(); setCityViewZoom(e.deltaY); }
    }, { passive: false });
    if (window.__GF_AUTOSTART && !window._silent) gs = 'AIM';
  },
  onUpdate: function (dt) { layout(); update(dt); },
  onDraw: draw,
});
